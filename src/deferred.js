import uuid from 'uuid/v4'
import lens, {DEFERRED} from './deferredLens'
export const deferredLens = lens

const {values, keys} = Object
const {isArray} = Array

const deferAction = (delay, repeat) => (action) => ({
  type: `${DEFERRED}:queue`, 
  payload: {
    id: uuid(), 
    deferUntil: Date.now() + delay, 
    delay, 
    repeat, 
    action
  }
})

const repeatDeferred = (id, deferUntil) => ({
  type: `${DEFERRED}:repeat`,
  payload: {id, deferUntil}
})

const deferredDone = (id) => ({
  type: `${DEFERRED}:done`,
  payload: {id}
})

const pending = {}

const processLater = (handleDeferred) => ({id, deferUntil, ...action}) => {
  if (!id || pending[id]) return
  pending[id] = setTimeout(() => {
    handleDeferred({id, ...action})
    pending[id] = undefined
  }, deferUntil - Date.now())
}

const processQueue = (handleDeferred) => (deferred = {}) => 
  values(deferred).forEach(processLater(handleDeferred))

const unwrap = (store) => ({
  id,
  delay,
  repeat,
  repeats,
  action
}) => {
  store(action)
  const next = repeats < repeat ? repeatDeferred : deferredDone
  store(next(id, Date.now() + delay))
}

const processNew = ({prevProjection, projection}, _, store) => {
  const diff = values(projection)
    .filter(({id, repeats}) => 
      !prevProjection[id] || (repeats !== prevProjection[id].repeats))
    .reduce((acc, deferred) => ({...acc, [deferred.id]: deferred}), {})
  processQueue(unwrap(store))(diff)
}

export const clearDeferred = () => keys(pending).forEach((id) => {
  clearTimeout(pending[id])
  pending[id] = undefined
})

export default ({
  store,
  onProjectionChange,
  getProjection
}) => {
  getProjection(DEFERRED).then(processQueue(unwrap(store)))

  onProjectionChange(DEFERRED, processNew)

  const storeDeferred = (actions, delay, repeat = false) => {
    if (!delay) throw new Error('Cannot create a deferred event without a delay')
    actions = isArray(actions) ? actions : [actions]
    return store(actions.map(deferAction(delay, repeat)))
  }

  return storeDeferred
}
