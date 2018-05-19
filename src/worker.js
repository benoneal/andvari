// import now from 'nano-time'
// import fast from 'fast.js'
// import createLens from './lensCreator'

// const noop = () => {}
// const {max} = Math

// const values = data => {
//   const results = []
//   for (const id in data) {
//     if (!Object.prototype.hasOwnProperty.call(data, id) || !data[id]) continue
//     results.push(data[id])
//   }
//   return results
// }

// const stringAddition = (a, b, acc = '', carry = 0) => {
//   if (!(a.length || b.length || carry)) return acc.replace(/^0+/, '')
//   carry = carry + (~~a.pop() + ~~b.pop())
//   acc = carry % 10 + acc
//   carry = carry > 9
//   return stringAddition(a, b, acc, carry)
// }

// const add = (a, b) => {
//   a += ''
//   b += ''
//   if (!a || !b) return a || b
//   if (a === '0' && b === '0') return '0'
//   return stringAddition(a.split(''), b.split(''))
// }

// const processable = processId => processId === process.pid

// const initialWorkerProjection = () => ({
//   pending: {},
//   locked: {},
//   failed: {},
//   succeeded: {}
// })

// export default ({
//   name,
//   watchEvent,
//   condition = () => true,
//   work,
//   onSuccess,
//   onError = noop,
//   retries = 0,
//   retryDelay = 1000,
//   timeout = 60000,
// }) => {
//   let _store, _show
//   if (!name || !watchEvent || !work || !onSuccess) throw new Error('Workers require a name, watchEvent, and work and onSuccess methods')

//   const {createEventHandler, lens} = createLens(name, initialWorkerProjection())

//   const queue = createEventHandler(`${name}:queue`, queueHandler)
//   const lock = createEventHandler(`${name}:lock`, lockHandler)
//   const succeeded = createEventHandler(`${name}:succeeded`, succeededHandler)
//   const failed = createEventHandler(`${name}:failed`, failedHandler)
//   const retry = createEventHandler(`${name}:retry`, retryHandler)
//   const unlock = createEventHandler(`${name}:unlock`, unlockHandler)

//   const doWork = event => {
//     const {id, processId, attempts, payload} = event
//     if (!processable(processId)) return
//     if (now() > add(id, (timeout / max(retries, 1)) + '000000')) return _store(unlock({id}))
//     work({payload, id}, _show)
//       .then(result => {
//         _store(succeeded({id}))
//         onSuccess({payload, result}, _store)
//       })
//       .catch(error => {
//         _store(failed({id, error}))
//         if (attempts >= retries) onError({payload, error}, _store)
//       })
//   }

//   const handleFailed = ({id, attempts, payload}) => {
//     if (now() > add(id, timeout + '000000')) {
//       onError({...payload, error: 'timeout'}, _store)
//     } else if (attempts < retries) {
//       _store(retry({id}))
//     } 
//   }

//   const requestLock = pending =>
//     fast.forEach(pending, ({id}) => _store(lock({id, processId: process.pid})))

//   const processLocked = (locked, store, show) =>
//     fast.forEach(locked, event => doWork(event, store, show))

//   const retryFailed = (failed, store) => 
//     fast.forEach(failed, event => handleFailed(event, store))

//   const init = (store, show) => {
//     _store = store
//     _show = show
//   }

//   const onUpdate = (_, snapshot) => {
//     if (!_store || !snapshot) return
//     requestLock(fast.filter(values(snapshot.pending), Boolean))
//     processLocked(fast.filter(values(snapshot.locked), Boolean))
//     retryFailed(fast.filter(values(snapshot.failed), Boolean))
//   }

//   const handler = store => ({payload, timestamp}) => 
//     condition(payload) && store(queue({id: timestamp, payload}))

//   return {
//     init,
//     lens,
//     register: {type: watchEvent, handler},
//     trigger: {projection: name, onUpdate}
//   }
// }

// const inProgressOrDone = ({locked, succeeded}, id) => 
//   Boolean(locked[id] || succeeded[id])

// const omit = (object, key) => {
//   const {[key]: deletedKey, ...rest} = object
//   return rest
// }

// const queueHandler = (snapshot, payload) => {
//   const {id} = payload
//   if (inProgressOrDone(snapshot, id)) return snapshot
//   snapshot.pending[id] = payload
//   snapshot.pending[id].attempts = 0
//   snapshot.pending[id].modified = now()
//   snapshot.failed = omit(snapshot.failed, id)
//   return snapshot
// } 

// const lockHandler = (snapshot, {id, processId}) => {
//   if (!snapshot.pending[id]) return snapshot
//   snapshot.locked[id] = snapshot.pending[id]
//   snapshot.locked[id].processId = processId
//   snapshot.locked[id].modified = now()
//   snapshot.locked[id].attempts++
//   snapshot.pending = omit(snapshot.pending, id)
//   return snapshot
// }

// const succeededHandler = (snapshot, {id}) => {
//   if (!snapshot.locked[id]) return snapshot
//   snapshot.succeeded[id] = snapshot.locked[id]
//   snapshot.succeeded[id].modified = now()
//   snapshot.succeeded[id].processId = undefined
//   snapshot.locked = omit(snapshot.locked, id)
//   return snapshot
// }

// const failedHandler = (snapshot, {id, error}) => {
//   if (!snapshot.locked[id]) return snapshot
//   snapshot.failed[id] = snapshot.locked[id]
//   snapshot.failed[id].modified = now()
//   snapshot.failed[id].error = error
//   snapshot.failed[id].processId = undefined
//   snapshot.locked = omit(snapshot.locked, id)
//   return snapshot
// }

// const retryHandler = (snapshot, {id}) => {
//   if (!snapshot.failed[id]) return snapshot
//   snapshot.pending[id] = snapshot.failed[id]
//   snapshot.pending[id].modified = now()
//   snapshot.pending[id].error = undefined
//   snapshot.failed = omit(snapshot.failed, id)
//   return snapshot
// }

// const unlockHandler = (snapshot, {id}) => {
//   if (!snapshot.locked[id]) return snapshot
//   snapshot.pending[id] = snapshot.locked[id]
//   snapshot.pending[id].modified = now()
//   snapshot.pending[id].processId = undefined
//   snapshot.locked = omit(snapshot.locked, id)
//   return snapshot
// }
