import now from 'nano-time'
import fast from 'fast.js'
import emitter from './emitter'
import {queue, repeat, complete, DEFERRED} from './deferredLens'
export {lens as deferredLens} from './deferredLens'

export default () => {
  let _store, _show

  const defer = (event, delay, repeatCount = 0) => {
    if (!_store || !_show) throw new Error('Deferred not initialized')
    if (!delay) throw new Error('Cannot defer an event without a delay')
    _store(queue({event, delay, repeatCount, id: now(), deferUntil: Date.now() + delay}))
  }

  const timers = new Map()
  const setTimer = (id, delay) => timers.set(id, setTimeout(() => process(id), delay))
  const process = id => {
    timers.delete(id)
    const deferred = _show(DEFERRED)
    if (!deferred[id]) return
    const timeNow = Date.now()
    const {deferUntil, delay, repeatCount, repeated, event} = deferred[id]
    if (deferUntil > timeNow) return setTimer(id, deferUntil - timeNow)
    _store({...event, timestamp: now()})
    if (repeated < repeatCount) {
      _store(repeat({id, deferUntil: deferUntil + delay}))
    } else {
      _store(complete({id}))
    }
  }

  const handleDeferred = (prev, deferred) => {
    if (!_store || !_show) throw new Error('Deferred not initialized')
    if (!deferred) return
    const timeNow = Date.now()
    for (const id in deferred) {
      if (timers.has(id) || (prev && prev[id]) === deferred[id]) continue
      setTimer(id, deferred[id].deferUntil - timeNow)
    }
  }

  const cancel = id => _store(complete({id}))
  const trigger = {projection: DEFERRED, onUpdate: handleDeferred}
  const init = (store, show) => {
    _store = store
    _show = show
  }

  return {defer, cancel, trigger, init}
}
