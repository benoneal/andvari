const inProgressOrDone = ({locked, succeeded}, id) => (
  (locked && locked[id]) || (succeeded && succeeded[id])
)

const queue = (projection, {id, ...payload}) => 
  inProgressOrDone(projection, id) ? projection : ({
    ...projection,
    pending: {
      ...projection.pending,
      [id]: {
        id, 
        ...payload,
        attempts: 1
      }
    },
    failed: {
      ...projection.failed,
      [id]: undefined
    }
  })

const lock = (projection, {id, processorId}) => 
  !projection.pending[id] ? projection : ({
    ...projection,
    locked: {
      ...projection.locked,
      [id]: {
        ...projection.pending[id],
        processorId
      }
    },
    pending: {
      ...projection.pending,
      [id]: undefined
    }
  })

const success = (projection, {id}) => 
  !projection.locked[id] ? projection : ({
    ...projection,
    succeeded: {
      ...projection.succeeded,
      [id]: {
        ...projection.locked[id],
        processorId: undefined
      }
    },
    locked: {
      ...projection.locked,
      [id]: undefined
    }
  })

const failure = (projection, {id, error}) => 
  !projection.locked[id] ? projection : ({
    ...projection,
    failed: {
      ...projection.failed,
      [id]: {
        ...projection.locked[id],
        error,
        processorId: undefined
      }
    },
    locked: {
      ...projection.locked,
      [id]: undefined
    }
  })

const retry = (projection, {id, ...payload}) => 
  !projection.failed[id] ? projection : ({
    ...projection,
    pending: {
      ...projection.pending,
      [id]: {
        ...projection.failed[id],
        attempts: projection.failed[id].attempts + 1
      }
    },
    failed: {
      ...projection.failed,
      [id]: undefined
    }
  })

export default (namespace) => {
  const lens = {
    [`${namespace}:queue`]: queue,
    [`${namespace}:lock`]: lock,
    [`${namespace}:success`]: success,
    [`${namespace}:failure`]: failure,
    [`${namespace}:retry`]: retry
  }
  return (projection = {}, {type, payload}) =>
    lens.hasOwnProperty(type) ? lens[type](projection, payload) : projection
}