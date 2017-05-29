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
  project, 
  addProjector, 
  getProjection,
  filterProjection
} from './projector'

const {keys} = Object

const storeAndProject = (action, projectionNamespace) => new Promise((resolve, reject) => {
  const event = createEvent(action)
  watch(projectionNamespace, event.timestamp).then(resolve).catch(reject)
  append(event).catch(reject)
})

export default ({eventStorePath, projectionsPath, projectors}) => {
  if (!eventStorePath || !projectionsPath || !projectors) {
    throw new Error('Andvari requires eventStorePath, projectionsPath, and projectors map')
    return 
  }

  initEventStore(eventStorePath)
  initProjections(projectionsPath)

  listen(project)

  keys(projectors).forEach(projector => addProjector(projector, projectors[projector]))

  return {
    storeAndProject,
    getProjection,
    filterProjection,
    getEvents
  }
}