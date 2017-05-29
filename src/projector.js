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
  projector.put(
    namespace, 
    {
      namespace,
      timestamp: events[events.length - 1].timestamp,
      projection: events.reduce(projectors[namespace], oldProjection)
    }
  )
}

export const project = (event, getEvents) => {
  keys(projectors).forEach((namespace) => {
    projector.get(namespace, (err, {timestamp, projection} = {}) => {
      if (err && !err.notFound) {
        throw err
        return
      }
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
  projector.on('put', (snapshotNamespace, {timestamp, projection}) => {
    if (snapshotNamespace !== projectionNamespace) return
    projector.get(namespace, (err, {timestamp: filteredTimestamp}) => {
      if (filteredTimestamp === timestamp) return
      if (err && !err.notFound) {
        throw err
        return
      }
      projector.put( 
        namespace, 
        {timestamp, namespace, projection: filter(projection)}
      )
    })
  })
  .on('error', reject)
}

export const watch = (namespace, timestamp) => new Promise((resolve, reject) => {
  projector.on('put', (snapshotNamespace, {timestamp: snapshotTimestamp, projection}) => 
    (snapshotNamespace === namespace && snapshotTimestamp === timestamp) && resolve(projection)
  )
  .on('error', reject)
})
