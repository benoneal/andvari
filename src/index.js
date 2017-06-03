import {
  initEventStore, 
  createEvent, 
  listen, 
  append, 
  getEvents
} from './eventStore'
import {
  initProjections, 
  watch, 
  when,
  project, 
  addProjector, 
  getProjection,
  filterProjection
} from './projector'

const {keys} = Object

const store = (action) => append(createEvent(action))

const storeAndProject = (action, projectionNamespace, condition) => new Promise((resolve, reject) => {
  const event = createEvent(action)
  when(projectionNamespace, event.timestamp, condition).then(resolve).catch(reject)
  append(event).catch(reject)
})

export default ({eventStorePath, projectionsPath, projectors, filters}) => {
  if (!eventStorePath || !projectionsPath || !projectors) {
    throw new Error('Andvari requires eventStorePath, projectionsPath, and projectors map')
    return 
  }

  initEventStore(eventStorePath)
  initProjections(projectionsPath)

  listen(project)

  keys(projectors).forEach(projector => addProjector(projector, projectors[projector]))

  if (filters) {
    keys(filters).forEach(namespace => {
      const {projection, filter} = filters[namespace]
      filterProjection(projection, namespace, filter)
    })
  }

  return {
    store,
    storeAndProject,
    getProjection,
    getEvents,
    watch
  }
}