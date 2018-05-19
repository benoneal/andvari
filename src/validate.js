import lov from 'lov'
import fast from 'fast.js'
import emitter from './emitter'

const eventSchema = {
  type: lov.string().min(1).max(64).trim().required(),
  timestamp: lov.string().min(1).max(64).trim().required(),
  payload: lov.any()
}

export const validateEvent = event => {
  const {error, value} = lov.validate(event, eventSchema)
  if (error) {
    emitter.emit('ERROR', {message: 'Invalid event', error, timestamp: Date.now()})
    throw new Error('Invalid event')
  }
  return value
}

export const validatePayload = (payload, schema, type) => {
  const {error, value} = lov.validate(payload, schema)
  if (error) {
    emitter.emit('ERROR', {message: 'Invalid payload', error, payload, type, timestamp: Date.now()})
    throw new Error('Invalid payload')
  }
  return value
}
