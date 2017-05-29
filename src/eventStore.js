import levelup from 'level'
import now from 'nano-time'

let eventStore

export const initEventStore = (path) => {
  eventStore = levelup(path, {valueEncoding: 'json'})
}

export const listen = (fn) => eventStore.on('put', (_, event) => fn(event, getEvents))

export const createEvent = ({type, payload}) => ({
  type, 
  payload,
  timestamp: now()
})

export const append = ({timestamp, ...event}) => new Promise((resolve, reject) => {
  eventStore.put(timestamp, {timestamp, ...event}, (err) => {
    if (err) reject(err)
    resolve(timestamp)
  })
})

export const getEvents = (start = '\x00', end = '\xff') => new Promise((resolve, reject) => {
  const events = []
  eventStore.createValueStream({start, end})
    .on('data', (event) => events.push(event))
    .on('close', () => resolve(events))
    .on('error', reject)
})
