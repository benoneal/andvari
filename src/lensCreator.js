import now from 'nano-time'
import {validatePayload} from './validate'

export default (name, snapshot = {}) => {
  const handlers = new Map()
  const defaultProjection = {name, snapshot, timestamp: 0}
  const reducer = (projection, {type, payload, timestamp}) => {
    const proj = projection || defaultProjection
    return handlers.has(type)
      ? {name, snapshot: handlers.get(type)(proj.snapshot, payload), timestamp}
      : proj
  }
  const eventCreator = type => payload => ({type, payload, timestamp: now()})
  const validatedEventCreator = (type, schema) => payload => {
    payload = validatePayload(payload, schema, type)
    return {type, payload, timestamp: now()}
  }
  return {
    lens: {name, reducer},
    createEventHandler: (type, handler, schema) => {
      handlers.set(type, handler)
      return schema ? validatedEventCreator(type, schema) : eventCreator(type)
    }
  }
}
