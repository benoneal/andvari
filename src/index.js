import uuid from 'uuid/v4'
import initEventStore from './eventStore'
import initProjections from './projector'
import initWorker from './worker'
import createWorkerLens from './workerLens'

const {keys} = Object
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
  } = initProjections(projectionsPath, getEvents, version)

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

  keys(projectors).forEach(projector => addProjector(projector, projectors[projector]))

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
