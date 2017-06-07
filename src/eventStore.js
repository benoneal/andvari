import levelup from 'level'
import now from 'nano-time'

export default (path) => {
  const eventStore = levelup(path, {valueEncoding: 'json'})

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

  const append = ({timestamp, ...event}) => new Promise((resolve, reject) => {
    if (!timestamp) reject(new Error('Cannot append Event: Missing timestamp'))
    eventStore.put(timestamp, {timestamp, ...event}, (err) => {
      if (err) reject(err)
      resolve(timestamp)
    })
  })

  const getEvents = (start = '\x00', end = '\xff') => new Promise((resolve, reject) => {
    const events = []
    eventStore.createValueStream({start, end})
      .on('data', (event) => events.push(event))
      .on('close', () => resolve(events))
      .on('error', reject)
  })

  const listen = (fn) => eventStore.on('put', (_, event) => fn(event, getEvents))

  return {
    createEvent,
    append,
    getEvents,
    listen
  }
}
