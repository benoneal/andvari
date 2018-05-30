import redis from 'promise-redis'
import fast from 'fast.js'
import emitter from './emitter'

export const ERROR = 'ERROR'
export const PROJECTION_UPDATED = 'PROJECTION_UPDATED'

const handleRetrieveError = error => 
  emitter.emit(ERROR, {message: 'Error retrieving projection', error, timestamp: Date.now()})

export default (lenses, triggers = [], persistInterval) => {
  const album = redis().createClient()
  let initialized = false
  const projectionCache = new Map()
  const getCached = name => projectionCache.get(name)
  const show = name => {
    const cached = getCached(name)
    return cached && cached.snapshot
  }

  const retrieve = key => album.get(key).then(str => JSON.parse(str))
  const insert = projectionOperations => album.batch(projectionOperations).exec()

  // Seeding
  const getSeeded = () => album.smembers('__seeded__')
  const setSeeded = seeds => album.sadd('__seeded__', seeds).then(_ => seeds)

  // Persistence
  const getProjection = name => {
    let cached = getCached(name)
    if (cached) return Promise.resolve(cached)
    return retrieve(name)
      .then(projection => {
        const proj = projection || undefined
        proj && projectionCache.set(name, proj)
        return proj
      })
      .catch(handleRetrieveError)
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
  fast.forEach(lenses, ({name}) => persistCache[name] = {key: name, value: null})
  let cacheTimer 
  const persistOperation = (acc, {key, value}) => {
    if (value === null || value === undefined) return acc
    const v = JSON.stringify(value)
    console.log(key, v.length / 1000000)
    acc.push(['set', key, v])
    persistCache[key].value = null
    return acc
  }
  const flushCache = () => {
    cacheTimer = undefined
    return insert(fast.reduce(Object.values(persistCache), persistOperation, []))
  }
  const project = event => {
    let hasUpdates = false
    for (const projector of projectors) {
      const projection = projector(event)
      if (!projection || !projection.timestamp) continue
      hasUpdates = true
      projectionCache.set(projection.name, projection)
      persistCache[projection.name].value = projection
      emitter.emit(PROJECTION_UPDATED, projection)
    }
    if (!cacheTimer && hasUpdates) cacheTimer = setTimeout(flushCache, 1500)
  }

  let preInitEventBuffer = []
  const bufferedProject = event => {
    if (initialized) return project(event)
    preInitEventBuffer.push(event) 
  }

  const init = () =>
    Promise.all(fast.map(lenses, ({name}) => getProjection(name)))
      .then(_ => {
        fast.forEach(preInitEventBuffer, project)
        initialized = true
      })

  init()

  return {
    show,
    project: bufferedProject,
    getSeeded,
    setSeeded,
    projectionCache,
    open: () => {},
    close: () => flushCache().then(_ => album.quit()),
    backup: () => Promise.resolve()
  }
}
