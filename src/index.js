import uuid from 'uuid/v4'
import initEventStore from './eventStore'
import initProjections from './projector'
import initWorker from './worker'
import createWorkerLens from './workerLens'
import deferred, {deferredLens} from './deferred'

const {keys, freeze} = Object
const {isArray} = Array

export default ({eventStorePath, projectionsPath, projectors, version}) => {
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
    addProjector
  } = initProjections(projectionsPath, {...projectors, deferred: deferredLens}, getEvents, version)

  const store = (actions) => {
    actions = isArray(actions) ? actions : [actions]
    return append(actions.map(createEvent))
  }

  const storeAndProject = (projectionNamespace, condition) => (actions) => new Promise((resolve, reject) => {
    actions = isArray(actions) ? actions : [actions]
    const events = actions.map(createEvent)
    when(projectionNamespace, events[events.length - 1].timestamp, condition).then(resolve).catch(reject)
    append(events).catch(reject)
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
    addProjector(namespace, createWorkerLens(namespace))
    initWorker({
      namespace,
      perform,
      onSuccess,
      onError,
      retries,
      timeout,
      store,
      watch,
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

  listen(project)

  return freeze({
    store,
    storeAndProject,
    getProjection,
    onProjectionChange,
    createWorker,
    storeDeferred
  })
}
