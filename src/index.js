import uuid from 'uuid/v4'
import initEventStore from './eventStore'
import initProjections from './projector'
import initWorker from './worker'
import createWorkerLens from './workerLens'

const {keys} = Object
const {isArray} = Array

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

  const store = (actions) => {
    actions = isArray(actions) ? actions : [actions]
    return Promise.all(actions.map(createEvent).map(append))
  }

  const storeAndProject = (projectionNamespace, condition) => (actions) => new Promise((resolve, reject) => {
    actions = isArray(actions) ? actions : [actions]
    const events = actions.map(createEvent)
    when(projectionNamespace, events[events.length - 1].timestamp, condition).then(resolve).catch(reject)
    Promise.all(events.map(append)).catch(reject)
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
    listen(({type, payload}) => {
      if (type !== event || !condition(payload)) return
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