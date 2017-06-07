import uuid from 'uuid/v4'
import initEventStore from './eventStore'
import initProjections from './projector'
import initWorker from './worker'
import createWorkerLens from './workerLens'

const {keys} = Object

export default ({eventStorePath, projectionsPath, projectors, filters}) => {
  if (!eventStorePath || !projectionsPath || !projectors) {
    throw new Error('Andvari requires eventStorePath, projectionsPath, and projectors map')
    return 
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
    addProjector, 
    filterProjection
  } = initProjections(projectionsPath)

  const store = (action) => append(createEvent(action))

  const storeAndProject = (action, projectionNamespace, condition) => new Promise((resolve, reject) => {
    const event = createEvent(action)
    when(projectionNamespace, event.timestamp, condition).then(resolve).catch(reject)
    append(event).catch(reject)
  })

  keys(projectors).forEach(projector => addProjector(projector, projectors[projector]))

  if (filters) {
    keys(filters).forEach(namespace => {
      const {projection, filter} = filters[namespace]
      filterProjection(projection, namespace, filter)
    })
  }

  const createWorker = ({
    namespace, 
    listenToEvent,
    eventCondition = () => true, 
    perform, 
    onSuccess, 
    onError,
    retries, 
    timeout
  }) => {
    if (!namespace || !listenToEvent || typeof perform !== 'function' || typeof onSuccess !== 'function' || typeof onError !== 'function') {
      throw new Error('createWorker requires namespace, listenToEvent, perform, onSuccess, and onError')
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
      watch
    })
    listen(({type, payload}) => {
      if (type !== onEventType || !eventCondition(payload)) return
      store({type: `${namespace}:queue`, payload: {...payload, id: payload.id || uuid()}})
    })
  }

  listen(project)

  return {
    store,
    storeAndProject,
    getProjection,
    getEvents,
    watch,
    createWorker
  }
}