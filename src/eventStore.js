import level from 'level-hyper'
import now from 'nano-time'
import fast from 'fast.js'
import emitter from './emitter'
import {validateEvent} from './validate'
import createQueue from './queue'

export const ERROR = 'ERROR'
export const EVENT_STORED = 'EVENT_STORED'
export const EVENT_HISTORY = 'EVENT_HISTORY'
export const EVENT_HISTORY_COMPLETE = 'EVENT_HISTORY_COMPLETE'

const {isArray} = Array

export default (path, persistInterval) => {
  const archive = level(path, {valueEncoding: 'json'})

  const append = eventOperations => new Promise((resolve, reject) => {
    archive.batch(eventOperations, error => {
      if (error) {
        emitter.emit(ERROR, {message: 'Error persisting events', error, timestamp: Date.now()})
        return reject(error)
      }
      resolve()
    })
  })

  const mapOperation = (event, operation) => {
    operation.key = now()
    operation.value = event
  }

  const queue = createQueue(
    append, 
    {type: 'put', key: null, value: null},
    mapOperation,
    1000,
    persistInterval
  )

  const store = event => {
    const _event = validateEvent(event)
    emitter.emit(EVENT_STORED, _event)
    queue(_event)
  }

  const replayHistory = (options = {gt: '\x00', lt: '\xff'}) =>
    archive.createValueStream(options)
      .on('data', event => emitter.emit(EVENT_HISTORY, event))
      .on('close', _ => emitter.emit(EVENT_HISTORY_COMPLETE, options))
      .on('error', error = emitter.emit(ERROR, {message: 'Error replaying event history', error, timestamp: Date.now()}))

  return {
    store,
    replayHistory,
    open: () => archive.open(),
    close: () => queue.flush().then(() => archive.close()),
    backup: () => new Promise((resolve, reject) => {
      const name = `eventStore_${new Date().toISOString()}`
      archive.db.backup(name, err => err ? reject(err) : resolve(name))
    })
  }
}
