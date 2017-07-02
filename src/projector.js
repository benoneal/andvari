import levelup from 'level'
import now from 'nano-time'

const {keys, values, freeze} = Object

const PREVIOUS = 'PREVIOUS'
const NIGHTLY = 'NIGHTLY'

const msTillMidnight = () => {
  const day = new Date()
  day.setHours(24, 0, 0, 0)
  const nextMd = day.getTime() - Date.now()
  return nextMd > 1000 * 60 ? nextMd : 1000 * 60 * 60 * 24
}

const runNightly = (fn) => {
  setTimeout(fn, msTillMidnight())
}

const SAFE_INT = '000000000000000'
const leftPad = (str = '', pad = SAFE_INT) => (pad + str).substring(str.length)
const since = (timestamp) => {
  if (!timestamp) return
  const left = timestamp.slice(0, -SAFE_INT.length)
  const right = timestamp.slice(-SAFE_INT.length, timestamp.length)
  return left + leftPad(parseInt(right) + 1 + '')
}

const pipeReducer = (acc, fn) => typeof fn === 'function' ? fn(acc) : acc
const pipe = (...fns) => (arg) => fns.reduce(pipeReducer, arg)

export default (path, initialProjectors, getEvents, REVISION = '1') => {
  const projectors = initialProjectors || {}
  const projections = {}
  const snapshots = levelup(path, {valueEncoding: 'json'})

  // Handle sync updates during initialization
  const queue = []
  let initialized = false
  const buffer = (fn) => (...args) => new Promise((resolve) => {
    if (initialized) return resolve(fn(...args))
    queue.push([fn, args, resolve])
  })
  const flushQueue = () => queue.forEach(([fn, args, resolve]) => resolve(fn(...args)))

  // Watchers
  const watchers = {}
  const cleanUpWatcher = (timestamp) => 
    ({keepWatching} = {}) => 
      !keepWatching && delete watchers[timestamp]

  const watchersFor = (projectionNamespace) => 
    ({namespace}) => projectionNamespace === namespace

  const previousProjection = (namespace) => 
    projections[`${namespace}:${PREVIOUS}`] && projections[`${namespace}:${PREVIOUS}`].projection

  const updateWatchers = ({namespace, timestamp, projection}) => {
    values(watchers).filter(watchersFor(namespace))
      .forEach(({fn, watchTimestamp}) => 
        fn(projection, timestamp, previousProjection(namespace)).then(cleanUpWatcher(watchTimestamp)))
  }

  const watch = (namespace, fn) => {
    const watchTimestamp = now()
    watchers[watchTimestamp] = {fn, namespace, watchTimestamp}
  }

  const matchProjection = (timestamp, condition, cb) => (projection, ssTimestamp) =>
    new Promise((resolve) => {
      if (ssTimestamp >= timestamp && condition(projection)) {
        cb(projection)
        resolve()
      }
    })

  const when = (namespace, eTimestamp, condition = () => true) => new Promise((resolve) => {
    watch(namespace, matchProjection(eTimestamp, condition, resolve))
  })

  // Manage Nightly builds
  const getSnapshot = (namespace) => new Promise((resolve) => {
    snapshots.get(`${namespace}:${NIGHTLY}:${REVISION}`, (err, {timestamp, projection} = {}) =>
      resolve({timestamp, projection, namespace}))
  })

  const buildProjectionsFromSnapshots = (snapshots) => snapshots.reduce((acc, snapshot) => ({
    ...acc,
    [snapshot.namespace]: snapshot
  }), {})

  const restoreSnapshots = () => 
    Promise.all(keys(projectors).map(getSnapshot))
      .then(buildProjectionsFromSnapshots)
      .then(applyProjections(false))
      .then(getDaysEvents)
      .then(createProjections)
      .then(applyProjections(false))
      .then(() => {
        initialized = true
        flushQueue()
      })

  const getDaysEvents = () => new Promise((resolve) => { 
    snapshots.get('nightlyTimestamp', (err, timestamp) => {
      getEvents(since(timestamp)).then(resolve)
  })

  const updateLastNightly = (events) => new Promise((resolve) => {
    snapshots.put('nightlyTimestamp', events[events.length - 1].timestamp, () => 
      resolve(events))
  })

  const persistProjections = (newProjections) => 
    snapshots.batch(values(newProjections).map((value) => ({
      type: 'put', 
      key: `${value.namespace}:${NIGHTLY}:${REVISION}`, 
      value
    })))
  })

  // Projections
  const getProjection = (namespace) => Promise.resolve(projections[namespace] && projections[namespace].projection)
  
  const addProjector = (namespace, lens) => projectors[namespace] = lens

  const projectEvents = (events = [], {timestamp, projection, namespace} = {}) => ({
    namespace,
    timestamp: events.length ? events[events.length - 1].timestamp : timestamp,
    projection: events.reduce(projectors[namespace], projection)
  })

  const createProjections = (events) => 
    keys(projectors).reduce((acc, namespace) => ({
      ...acc,
      [namespace]: projectEvents(events, projections[namespace])
    }), {})

  const applyProjections = (shouldUpdateWatchers) => (newProjections = {}) => 
    values(newProjections).forEach(({namespace, timestamp, projection} = {}) => {
      if (!namespace || projections[namespace] && projection === projections[namespace].projection) return
      projections[`${namespace}:${PREVIOUS}`] = projections[namespace]
      projections[namespace] = {namespace, timestamp, projection}
      shouldUpdateWatchers && updateWatchers({namespace, timestamp, projection})
    })

  const projectNightly = () => {
    getDaysEvents().then(updateLastNightly)
      .then(pipe(createProjections, persistProjections))
    runNightly(projectNightly)
  }
  runNightly(projectNightly)

  restoreSnapshots()

  return freeze({
    watch: buffer(watch),
    when: buffer(when),
    project: buffer(pipe(createProjections, applyProjections(true))),
    getProjection: buffer(getProjection),
    addProjector: buffer(addProjector)
  })
}
