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

  // Seeds
  const getSeeded = () => new Promise((resolve) => {
    snapshots.get('__seeded__', (err, seeded = []) => resolve(seeded))
  })

  const setSeeded = (newSeeds) => new Promise((resolve) => {
    getSeeded().then((oldSeeds) =>
      snapshots.put('__seeded__', [...oldSeeds, ...newSeeds], () =>  resolve(newSeeds)))
  })

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

  const restoreSnapshots = (projectors, updateWatchers = false) => 
    Promise.all(projectors.map(getSnapshot))
      .then(buildProjectionsFromSnapshots)
      .then(applyProjections(updateWatchers))
      .then(getDaysEvents)
      .then(createProjections)
      .then(applyProjections(updateWatchers))
      .then(() => {
        initialized = true
        flushQueue()
      })

  const getDaysEvents = () => new Promise((resolve) => { 
    snapshots.get('__nightlyTimestamp__', (err, timestamp) => {
      getEvents(since(timestamp)).then(resolve)
    })
  })

  const updateLastNightly = (events) => new Promise((resolve) => {
    snapshots.put('__nightlyTimestamp__', events[events.length - 1].timestamp, () => 
      resolve(events))
  })

  const persistProjections = (newProjections) => 
    snapshots.batch(values(newProjections).map((value) => ({
      type: 'put', 
      key: `${value.namespace}:${NIGHTLY}:${REVISION}`, 
      value
    })))

  // Projections
  const getProjection = (namespace) => Promise.resolve(projections[namespace] && projections[namespace].projection)
 
  const projectEvents = (events = [], lens, {timestamp, projection, namespace} = {}) => ({
    namespace,
    timestamp: events.length ? events[events.length - 1].timestamp : timestamp,
    projection: events.reduce(lens, projection)
  })

  const createProjections = (events) => 
    keys(projectors).reduce((acc, namespace) => ({
      ...acc,
      [namespace]: projectEvents(events, projectors[namespace], projections[namespace])
    }), {})

  const applyProjections = (shouldUpdateWatchers) => (newProjections = {}) => 
    values(newProjections).forEach(({namespace, timestamp, projection} = {}) => {
      if (!namespace || projections[namespace] && projection === projections[namespace].projection) return
      projections[`${namespace}:${PREVIOUS}`] = projections[namespace]
      projections[namespace] = {namespace, timestamp, projection}
      shouldUpdateWatchers && updateWatchers(projections[namespace])
    })

  const project = pipe(createProjections, applyProjections(true))

  const projectNightly = () => {
    getDaysEvents().then(updateLastNightly)
      .then(pipe(createProjections, persistProjections))
    runNightly(projectNightly)
  }
  runNightly(projectNightly)

  restoreSnapshots(keys(projectors))

  return freeze({
    watch: buffer(watch),
    when: buffer(when),
    project: buffer(project),
    getProjection: buffer(getProjection),
    getSeeded: buffer(getSeeded),
    setSeeded: buffer(setSeeded)
  })
}
