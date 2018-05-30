import now from 'nano-time'
import camelCase from 'lodash/camelCase'
import fast from 'fast.js'
import cleanup from 'node-cleanup'
import initEventStore, {ERROR, EVENT_STORED} from './eventStore'
import initProjections, {PROJECTION_UPDATED} from './projector'
import deferred, {deferredLens} from './deferred'
import serialize from './serialize'
import emitter from './emitter'

export {default as is} from 'lov'
export {default as createLens} from './lensCreator'
export {EVENT_HISTORY, EVENT_HISTORY_COMPLETE} from './eventStore'

const {isArray} = Array
const toArray = events => isArray(events) ? events : [events]
const rand = (n = 1, offset = 0) => Math.floor(Math.random() * n) + offset

export default ({
  eventStorePath,
  persistInterval = rand(50, 75),
  lenses = [],
  triggers = [],
}) => {
  if (!eventStorePath || !lenses.length) {
    throw new Error('Andvari requires eventStorePath and lenses map')
  }

  const listeners = new Map()

  const {
    defer,
    cancel,
    trigger: deferredTrigger, 
    init: initDeferred
  } = deferred()

  const {
    store,
    replayHistory,
    open: openEventStore,
    close: closeEventStore,
    backup: backupEventStore
  } = initEventStore(eventStorePath, persistInterval)

  const {
    show,
    project,
    getSeeded,
    setSeeded,
    open: openProjections,
    close: closeProjections,
    backup: backupProjections
  } = initProjections(
    [...lenses, deferredLens],
    [...triggers, deferredTrigger],
    persistInterval
  )

  initDeferred(store, show)

  const open = () => {
    openEventStore()
    openProjections()
  }
  const close = () => Promise.all([
    closeEventStore(),
    closeProjections()
  ])
  const backup = () => Promise.all([
    backupEventStore(),
    backupProjections()
  ])

  const seed = async toSeed => {
    const events = toArray(toSeed)
    if (events.length === 0) return
    const seeded = await getSeeded()
    let i = -1, serialized = []
    while (++i < events.length) {
      const hashed = serialize(events[i])
      if (fast.indexOf(seeded, hashed) !== -1) continue
      serialized.push(hashed)
      store(events[i])
    }
    return serialized.length ? setSeeded(serialized) : Promise.resolve()
  }

  const when = (name, timestamp, resolve) => {
    listeners.set(timestamp, projection => {
      if (projection.name !== name) return
      if (projection.timestamp < timestamp) return
      resolve(projection.snapshot)
      listeners.delete(timestamp)
    })
  }

  const helpers = fast.reduce(lenses, (acc, {name}) => ({
    ...acc,
    [camelCase(`store_${name}`)]: event => new Promise(resolve => {
      const timestamp = event.timestamp
      when(name, timestamp || now(), resolve)
      store(event)
    }),
    [camelCase(`show_${name}`)]: () => Promise.resolve(show(name))
  }), {})

  emitter.on(EVENT_STORED, project)
  emitter.on(PROJECTION_UPDATED, projection => {
    for (const listener of listeners.keys()) {
      listeners.has(listener) && listeners.get(listener)(projection)
    }
  })

  const listen = type => fn => {
    emitter.on(type, fn)
    return () => emitter.off(type, fn)
  }

  cleanup((exitCode, signal) => {
    if (signal) {
      close().then(_ => process.kill(process.pid, signal))
      cleanup.uninstall()
      return false
    }
  })

  return {
    seed,
    store,
    show,
    defer,
    cancel,
    ...helpers,
    open,
    close,
    backup,
    replayHistory,
    onError: listen(ERROR),
    onEvent: listen(EVENT_STORED),
    onProjection: listen(PROJECTION_UPDATED),
  }
}
