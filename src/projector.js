import levelup from 'level'
import now from 'nano-time'

const {keys, values} = Object

const LATEST = 'LATEST'
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

export default (path, getEvents) => {
  const watchers = {}
  const projectors = {}
  const projecting = {}
  const projector = levelup(path, {valueEncoding: 'json'})

  projector.on('put', (snapshot, {timestamp, projection}) => 
    projection && values(watchers).forEach(({fn, namespace, watchTimestamp}) => 
      snapshot.split(':')[0] === namespace && fn(projection, timestamp)
        .then(({keepWatching}) => {
          if (keepWatching) return
          delete watchers[watchTimestamp]
        })
    )
  )

  const addProjector = (namespace, lens) => {
    projectors[namespace] = lens
  }

  const runProjection = (version) => ({namespace, timestamp, projection} = {}) => 
    getEvents(since(timestamp))
      .then(createSnapshot(namespace, projection))
      .then(storeSnapshot(version))

  const project = (version) => () => {
    keys(projectors).forEach((namespace) => {
      if (projecting[namespace]) return
      projecting[namespace] = true
      get(namespace, version)
        .then(runProjection(version))
        .then(() => {delete projecting[namespace]})
        .catch((err) => {
          delete projecting[namespace]
          throw err
        })
    })
  }

  const projectNightly = () => {
    project(NIGHTLY)
    runNightly(projectNightly)
  }
  runNightly(projectNightly)

  // Possible future enhancement: 
  // store timestamps and keys of previous projections under NAMESPACE:HISTORY : {timestamp: key}
  // use key to fetch latest.
  // if latest > event, fetch history, find latest timestamp which is < event
  // use that key to fetch projection from which to reproject
  // ^ useful if size of nightly data is huge

  const getProjection = (namespace) => 
    get(namespace).then(({projection} = {}) => projection)

  const get = (namespace, version = LATEST, fallback = NIGHTLY) => new Promise((resolve, reject) => {
    projector.get(`${namespace}:${version}`, (err, data) => {
      if (err && !err.notFound) return reject(err)
      if (err.notFound && (version === fallback)) return resolve({namespace})
      if (err.notFound) return resolve(get(namespace, fallback))
      if (typeof data === 'string') return resolve(get(...data.split(':')))
      if (data.projection) return resolve(data)
      reject(new Error(`Cannot find projection for ${namespace}`))
    })
  })

  const createSnapshot = (namespace, oldProjection) => (events = []) => new Promise((resolve) => {
    const timestamp = events[events.length - 1].timestamp
    const projection = events.reduce(projectors[namespace], oldProjection)
    if (projection === oldProjection) return resolve()
    return resolve({namespace, timestamp, projection})
  })

  const storeSnapshot = (version) => (value) => new Promise((resolve, reject) => {
    if (!value) return resolve()
    const key = `${value.namespace}:${value.timestamp}`
    const data = [{
      type: 'put',
      key: `${value.namespace}:${version}`,
      value: key
    }, {
      type: 'put',
      key,
      value
    }]
    projector.batch(data, (err) => {
      delete projecting[value.namespace]
      if (err) reject(err)
      resolve(key)
    })
  })

  const when = (namespace, eTimestamp, condition = () => true) => 
    new Promise((resolve, reject) => {
      watch(namespace, (projection, ssTimestamp) => new Promise((res) => {
        if (ssTimestamp >= eTimestamp && condition(projection)) {
          resolve(projection)
          res()
        }
      }))
    })

  const watch = (namespace, fn) => {
    const watchTimestamp = now()
    watchers[watchTimestamp] = {fn, namespace, watchTimestamp}
  }

  return {
    watch, 
    when,
    project: project(LATEST), 
    getProjection,
    addProjector
  }
}
