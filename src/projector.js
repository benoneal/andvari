import level from 'level-hyper'
import fast from 'fast.js'
import emitter from './emitter'

export const ERROR = 'ERROR'
export const PROJECTION_UPDATED = 'PROJECTION_UPDATED'

const handleErrors = error => 
  emitter.emit(ERROR, {message: 'Error persisting projections', error, timestamp: Date.now()})

export default (path, lenses, triggers = [], persistInterval) => {
  const album = level(path, {valueEncoding: 'json'})
  let initialized = false
  const projectionCache = new Map()
  const getCached = name => projectionCache.get(name)
  const show = name => {
    const cached = getCached(name)
    return cached && cached.snapshot
  }

  const retrieve = key => new Promise((resolve, reject) => {
    album.get(key, (err, value) => 
      (!err || err.notFound) ? resolve(value === null ? undefined : value) : reject(err))
  })
  const insert = projectionOperations => new Promise((resolve, reject) => {
    album.batch(projectionOperations, err => err ? reject(err) : resolve())
  })

  // Seeding
  const getSeeded = () => retrieve('__seeded__').then(seeded => seeded || [])

  const setSeeded = newSeeds =>
    retrieve('__seeded__').then(seeded =>
      insert([{type: 'put', key: '__seeded__', value: fast.concat(seeded, newSeeds)}]).then(_ => newSeeds))

  // Persistence
  const getProjection = name => {
    let cached = getCached(name)
    if (cached) return Promise.resolve(cached)
    return retrieve(name)
      .then(projection => {
        projectionCache.set(name, projection)
        return projection
      })
      .catch(handleErrors)
  }

  // Reactions
  const createReactions = triggers => {
    const handlers = new Map(), reactions = new Map()
    fast.forEach(triggers, ({projection, onUpdate}) => 
      handlers.set(projection, fast.concat(handlers.has(projection) ? handlers.get(projection) : [], [onUpdate])))
    fast.forEach(triggers, ({projection}) => 
      reactions.set(projection, (prev, next) => fast.forEach(handlers.get(projection), fn => fn(prev, next))))
    return reactions
  }

  const reactions = createReactions(triggers)

  // Projectors
  const createProjector = ({name, reducer}) => {
    const safeReduce = (proj, event) => 
      (event.timestamp < (proj ? proj.timestamp : 0)) ? proj : reducer(proj, event)
    return event => {
      const prev = getCached(name)
      const projection = safeReduce(prev, event)
      const updated = projection !== prev
      if (updated && reactions.has(name)) reactions.get(name)(prev && prev.snapshot, projection.snapshot)
      return updated ? projection : undefined
    }
  }

  const projectors = fast.map(lenses, createProjector)
  const persistCache = {}
  fast.forEach(lenses, ({name}) => persistCache[name] = {type: 'put', key: name, value: null})
  let cacheTimer 
  const hasValue = ({value}) => !!value
  const flushCache = () => {
    cacheTimer = undefined
    return insert(fast.filter(Object.values(persistCache), hasValue))
  }
  const project = event => {
    for (const projector of projectors) {
      const projection = projector(event)
      if (!projection || !projection.timestamp) continue
      projectionCache.set(projection.name, projection)
      persistCache[projection.name].value = projection
      emitter.emit(PROJECTION_UPDATED, projection)
    }
    if (!cacheTimer) cacheTimer = setTimeout(flushCache, persistInterval)
    initialized = true
  }

  let preInitEventBuffer = []
  const bufferedProject = event => {
    if (initialized) return project(event)
    preInitEventBuffer.push(event) 
  }

  const init = () =>
    fast.forEach(lenses, ({name}) =>
      getProjection(name).then(_ => project(preInitEventBuffer)))

  init()

  return {
    show,
    project: bufferedProject,
    getSeeded,
    setSeeded,
    projectionCache,
    open: () => album.open(),
    close: () => flushCache().then(_ => album.close()),
    backup: () => new Promise((resolve, reject) => {
      const name = `projections_${new Date().toISOString()}`
      album.db.backup(name, err => err ? reject(err) : resolve(name))
    })
  }
}
