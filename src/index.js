import uuid from 'uuid/v4'
import initEventStore from './eventStore'
import initProjections from './projector'
import initWorker from './worker'
import createWorkerLens from './workerLens'
import deferred, {deferredLens} from './deferred'
import serialize from './serialize'

const {keys, freeze} = Object
const {isArray} = Array

const workerProjections = (workers = {}) => workers.reduce((acc, {namespace}) => ({
  ...acc,
  [namespace]: createWorkerLens(namespace)
}), {})

export default ({eventStorePath, projectionsPath, projectors, workers, version}) => {
  if (!eventStorePath || !projectionsPath || !projectors) {
    throw new Error('Andvari requires eventStorePath, projectionsPath, and projectors map')
  }

  const {
    createEvent,
    listen,
    append,
    getEvents
  } = initEventStore(eventStorePath)
  const {
    watch,
    when,
    project,
    getProjection,
    getSeeded,
    setSeeded
  } = initProjections(projectionsPath, {...projectors, deferred: deferredLens, ...workerProjections(workers)}, getEvents, version)

  const store = (actions) => {
    actions = isArray(actions) ? actions : [actions]
    return append(actions.map(createEvent))
  }

  const seed = (actions) =>
    getSeeded()
      .then((seeded) => actions.filter((action) => !seeded.includes(serialize(action))))
      .then((actions) => {
        append(actions.map(createEvent))
        return setSeeded(actions.map(serialize))
      })

  const storeAndProject = (projectionNamespace, condition) => (actions) => new Promise((resolve, reject) => {
    actions = isArray(actions) ? actions : [actions]
    const events = actions.map(createEvent)
    when(projectionNamespace, events[events.length - 1].timestamp, condition).then(resolve).catch(reject)
    append(events).catch(reject)
  })

  const onProjectionChange = (namespace, handleChange) => {
    watch(namespace, (projection, _, prevProjection) => new Promise((resolve) => {
      handleChange({prevProjection, projection}, getProjection, store)
      resolve({keepWatching: true})
    }))
  }

  const storeDeferred = deferred({
    store,
    onProjectionChange,
    getProjection
  })

  const createWorker = ({
    namespace,
    event,
    condition = () => true,
    perform,
    onSuccess,
    onError,
    retries,
    timeout
  }) => {
    if (!namespace || !event || typeof perform !== 'function' || typeof onSuccess !== 'function' || typeof onError !== 'function') {
      throw new Error('createWorker requires namespace, event, perform, onSuccess, and onError')
    }

    initWorker({
      namespace,
      perform,
      onSuccess,
      onError,
      retries,
      timeout,
      store,
      onProjectionChange,
      getProjection
    })
    
    listen((events) => {
      const queue = events.reduce((acc, {type, payload}) => (
        type === event && condition(payload) ? [...acc, {
          type: `${namespace}:queue`, 
          payload: {...payload, id: payload.id || uuid()}
        }] : acc
      ), [])

      queue.length && store(queue)
    })
  }

  if (isArray(workers)) workers.forEach(createWorker)

  listen(project)

  return freeze({
    seed,
    store,
    storeAndProject,
    getProjection,
    onProjectionChange,
    storeDeferred
  })
}
