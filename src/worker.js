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
        onSuccess({id, ...locked, ...res}, store)
      })
      .catch((error) => {
        delete processing[id]
        store({type: `${namespace}:failure`, payload: {id, error}})
        onError({id, ...locked, error}, store)
      })
  }

  const retryFailed = ({id, attempts, timestamp, ...event}) => {
    if (Date.now() > timestamp + timeout) {
      onError({...event, id, timestamp, error: 'timeout'}, store)
    } else if (attempts <= retries) {
      store({type: `${namespace}:retry`, payload: {id}})
    }
  }

  const filtered = (queue) => values(queue).filter(Boolean)

  const processable = (queue) => 
    filtered(queue).filter(({id, processorId}) => (processId === processorId && !processing[id]))

  watch(namespace, ({
    pending = {},
    locked = {},
    failed = {}
  }) => new Promise((resolve) => {
    processable(locked).forEach(processLocked)
    filtered(failed).forEach(retryFailed)

    const [firstPending] = filtered(pending)
    firstPending && requestLock(firstPending)

    resolve({keepWatching: true})
  }))
}
