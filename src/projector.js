import levelup from 'level'
import now from 'nano-time'

const {keys, values, freeze} = Object

const NIGHTLY = 'NIGHTLY'

const exists = (v) => v !== undefined && v !== null 
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

const hasProjectionData = ({value: {projection}}) => Boolean(projection)
const mapProjectionUpdates = (acc, {value: {namespace, timestamp, projection}}) => ({
  ...acc, 
  [namespace]: {timestamp, projection}
})

const updateWatchers = (watchers, updates = {}) => ({fn, namespace, watchTimestamp}) => {
  if (!updates[namespace]) return
  const {projection, timestamp} = updates[namespace]
  fn(projection, timestamp)
    .then(({keepWatching} = {}) => {
      if (!keepWatching) delete watchers[watchTimestamp]
    })
}

export default (path, getEvents, REVISION = '1') => {
  const watchers = {}
  const projectors = {}
  const projector = levelup(path, {valueEncoding: 'json'})

  projector.on('batch', (projections) => {
    const updates = projections.filter(hasProjectionData)
      .reduce(mapProjectionUpdates, {})

     values(watchers).forEach(updateWatchers(watchers, updates))
  })

  const addProjector = (namespace, lens) => {
    projectors[namespace] = lens
  }

  const project = (version) => () =>
    Promise.all(keys(projectors).map((namespace) => {
      get(namespace, version)
        .then(runProjection(version))
    }))

  const projectNightly = () => {
    project(`:${NIGHTLY}`)()
      .then(() => runNightly(projectNightly))
  }
  runNightly(projectNightly)

  const runProjection = (version) => ({namespace, timestamp, projection} = {}) =>
    getEvents(since(timestamp))
      .then(createSnapshot(namespace, projection))
      .then(storeSnapshot(version))

  const getProjection = (namespace) =>
    get(namespace).then(({projection} = {}) => projection)

  const get = (namespace, version = ``, fallback = `:${NIGHTLY}`) => new Promise((resolve, reject) => {
    projector.get(`${namespace}_${REVISION}${version}`, (err, data) => {
      if (err) {
        if (!err.notFound) return reject(err)
        if (version === fallback) return resolve({namespace})
        return resolve(get(namespace, fallback))
      }
      if (exists(data.projection)) return resolve(data)
      reject(new Error(`Cannot find projection for ${namespace}_${REVISION}${version}`))
    })
  })

  const createSnapshot = (namespace, oldProjection) => (events = []) => new Promise((resolve) => {
    const timestamp = events[events.length - 1].timestamp
    const projection = events.reduce(projectors[namespace], oldProjection)
    if (projection === oldProjection) return resolve()
    return resolve({namespace, timestamp, projection})
  })

  const storeSnapshot = (version = '') => (value) => new Promise((resolve, reject) => {
    if (!value) return resolve()
    const key = `${value.namespace}_${REVISION}${version}`
    projector.batch([{
      type: 'put',
      key,
      value
    }], (err) => {
      if (err) reject(err)
      resolve(key)
    })
  })

  const matchProjection = (timestamp, condition, cb) => (projection, ssTimestamp) =>
    new Promise((resolve) => {
      if (ssTimestamp >= timestamp && condition(projection)) {
        cb(projection)
        resolve()
      }
    })

  const when = (namespace, eTimestamp, condition = () => true) =>
    new Promise((resolve) => {
      watch(namespace, matchProjection(eTimestamp, condition, resolve))
    })

  const watch = (namespace, fn) => {
    const watchTimestamp = now()
    watchers[watchTimestamp] = {fn, namespace, watchTimestamp}
  }

  return freeze({
    watch,
    when,
    project: project(),
    getProjection,
    addProjector
  })
}
