import levelup from 'level'
import now from 'nano-time'

const {freeze} = Object
const {isArray} = Array

export default (path) => {
  const listeners = []
  const eventStore = levelup(path, {valueEncoding: 'json'})

  const eventData = (events) => events.map(({value, ...event}) => value ? value : event)

  eventStore.on('batch', (events) =>
    listeners.forEach((listener) =>
      listener(eventData(events), getEvents)
    )
  )

  const createEvent = ({type, payload}) => {
    if (!type || !payload) throw new Error('Invalid Action provided. Must conform to shape: {type, payload}')
    return {
      type,
      payload: {
        ...payload,
        timestamp: Date.now()
      },
      timestamp: now()
    }
  }

  const missingTimestamps = (events) =>
    events.map(({timestamp}) => Boolean(timestamp)).filter(x => !x).length > 0

  const append = (events) => new Promise((resolve, reject) => {
    events = isArray(events) ? events : [events]
    if (missingTimestamps(events)) reject(new Error('Cannot append Event: Missing timestamp'))
    if (!events.length) return resolve()
    eventStore.batch(events.map((value) => ({
      type: 'put',
      key: value.timestamp,
      value
    })), (err) => {
      if (err) return reject(err)
      resolve(events[events.length - 1].timestamp)
    })
  })

  const getEvents = (start = '\x00', end = '\xff') => new Promise((resolve, reject) => {
    const events = []
    eventStore.createValueStream({start, end})
      .on('data', (event) => events.push(event))
      .on('close', () => resolve(events))
      .on('error', reject)
  })

  const listen = (fn) => listeners.push(fn)

  return freeze({
    createEvent,
    append,
    getEvents,
    listen,
    close: () => new Promise((resolve) => eventStore.close(resolve))
  })
}
