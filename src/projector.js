import levelup from 'level'

let projector

const {keys} = Object

const projectors = {}

export const initProjections = (path) => {
  projector = levelup(path, {valueEncoding: 'json'})
}

export const addProjector = (namespace, lens) => {
  projectors[namespace] = lens
}

const createSnapshot = (events, namespace, oldProjection) => {
  const projection = events.reduce(projectors[namespace], oldProjection)
  if (projection === oldProjection) return

  projector.put(
    namespace, 
    {
      namespace,
      timestamp: events[events.length - 1].timestamp,
      projection
    }
  )
}

export const project = (event, getEvents) => {
  keys(projectors).forEach((namespace) => {
    projector.get(namespace, (err, {timestamp, projection} = {}) => {
      if (err && !err.notFound) { throw err }
      if (err && err.notFound || event.timestamp < timestamp) {
        return getEvents().then(events => createSnapshot(events, namespace))
      }
      createSnapshot([event], namespace, projection)
    })
  })
}

export const getProjection = (namespace) => new Promise((resolve, reject) => {
  projector.get(namespace, (err, {projection}) => {
    if (err) return reject(err)
    resolve(projection)
  })
})

export const filterProjection = (projectionNamespace, namespace, filter) => {
  watch(projectionNamespace, (projection, timestamp) => {
    projector.get(namespace, (err, {timestamp: filteredTimestamp}) => {
      if (filteredTimestamp === timestamp) return
      if (err && !err.notFound) { throw err }
      projector.put( 
        namespace, 
        {
          namespace, 
          timestamp, 
          projection: filter(projection)
        }
      )
    })
  })
}

const defaultCondition = () => true

export const when = (namespace, eTimestamp, condition = defaultCondition) => 
  new Promise((resolve, reject) => {
    watch(namespace, (projection, ssTimestamp) => 
      (ssTimestamp >= eTimestamp && condition(projection)) && resolve(projection))
  })

export const watch = (namespace, fn) => {
  projector.on('put', (snapshot, {timestamp, projection}) => (snapshot === namespace) && fn(projection, timestamp))
}
