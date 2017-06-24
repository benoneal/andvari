import uuid from 'uuid/v4'

const {values} = Object

export default ({
  namespace,
  perform,
  onSuccess,
  onError,
  retries = 0,
  timeout = 60000,
  store,
  watch,
  getProjection
}) => {
  const processing = {}
  const processId = uuid()

  const requestLock = ({id}) => store({type: `${namespace}:lock`, payload: {id, processorId: processId}})

  const processLocked = ({id, processorId, attempts, ...locked}) => {
    processing[id] = true
    perform({id, ...locked}, getProjection)
      .then((res) => {
        delete processing[id]
        store({type: `${namespace}:success`, payload: {id}})
        store(onSuccess({id, ...locked, ...res}))
      })
      .catch((error) => {
        delete processing[id]
        store({type: `${namespace}:failure`, payload: {id, error}})
        store(onError({id, ...locked, error}))
      })
  }

  const retryFailed = ({id, attempts, timestamp, ...event}) => {
    if (Date.now() > timestamp + timeout) {
      store(onError({...event, id, timestamp, error: 'timeout'}))
    } else if (attempts <= retries) {
      store({type: `${namespace}:retry`, payload: {id}})
    }
  }

  watch(namespace, ({
    pending = {},
    locked = {},
    failed = {}
  }) => new Promise((resolve) => {
    const firstPending = values(pending).filter(Boolean)[0]
    firstPending && requestLock(firstPending)

    values(locked)
      .filter(Boolean)
      .filter(({id, processorId}) => (processId === processorId && !processing[id]))
      .forEach(processLocked)

    values(failed)
      .filter(Boolean)
      .forEach(retryFailed)

    resolve({keepWatching: true})
  }))
}
