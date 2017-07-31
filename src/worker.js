import uuid from 'uuid/v4'

const {keys, values} = Object
const {max} = Math

export default ({
  namespace,
  perform,

  onSuccess,
  onError,
  retries = 0,
  timeout = 60000,

  store,
  onProjectionChange,
  getProjection
}) => {
  const processId = uuid()

  const createRetry = ({id}) => ({type: `${namespace}:retry`, payload: {id}})
  const createSuccess = ({id}) => ({type: `${namespace}:success`, payload: {id}})
  const createError = ({id, error}) => ({type: `${namespace}:failure`, payload: {id, error}})
  const createLock = ({id}) => ({type: `${namespace}:lock`, payload: {id, processorId: processId}})
  const unlockStale = ({id}) => ({type: `${namespace}:unlock`, payload: {id}})

  const performWork = ({id, processorId, attempts, ...locked}) => {
    perform({id, ...locked}, getProjection)
      .then((res) => {
        store(createSuccess({id}))
        onSuccess({id, ...locked, ...res}, store)
      })
      .catch((error) => {
        store(createError({id, error}))
        if (attempts > retries){
          onError({id, ...locked, error}, store)
        }
      })
  }

  const handleFailed = (failed) => 
    failed.reduce((acc, {id, attempts, timestamp, ...event}) => {
      if (Date.now() > timestamp + timeout) {
        onError({...event, id, timestamp, error: 'timeout'}, store)
        return acc
      } else if (attempts <= retries) {
        return [...acc, createRetry({id})]
      }
    }, [])

  const handleStaleLocks = (stale = []) => 
    store(stale.map(unlockStale))

  const requestLock = (pending) => store(pending.map(createLock))
  const processLocked = (locked) => locked.forEach(performWork)
  const retryFailed = (failed) => store(handleFailed(failed))

  const processable = ({processorId}) => !processorId || processorId === processId

  const changed = (prev = {}, current = {}) => 
    keys(current).reduce((acc, id) => 
      !prev[id] && processable(current[id]) 
        ? [...acc, current[id]] 
        : acc
    , [])

  const stale = (prev = {}, current = {}) => 
    keys(current).reduce((acc, id) =>
      !!prev[id] && Date.now() > (current[id].timestamp + timeout)
        ? [...acc, current[id]]
        : acc
    , [])

  const setToWork = (handlers) => ({prevProjection: prev, projection: current}) => {
    if (!prev || !current) return 
    keys(handlers).forEach((key) => handlers[key](changed(prev[key], current[key])))

    handleStaleLocks(stale(prev.locked, current.locked))
  }

  const handlers = {
    pending: requestLock,
    locked: processLocked,
    failed: retryFailed
  }

  onProjectionChange(namespace, setToWork(handlers))
}
