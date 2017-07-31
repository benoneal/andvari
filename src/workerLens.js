const inProgressOrDone = ({locked = {}, succeeded = {}}, id) => 
  Boolean(locked[id] || succeeded[id])

const {keys} = Object

const omit = (obj = {}, key) => keys(obj).reduce((acc, k) => (
  (k === key) ? acc : {...acc, [k]: obj[k]}
), {})

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
    failed: omit(projection.failed, id)
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
    pending: omit(projection.pending, id)
  })

const success = (projection, {id}) =>
  !projection.locked[id] ? projection : ({
    ...projection,
    succeeded: {
      ...projection.succeeded,
      [id]: omit(projection.locked[id], 'processorId')
    },
    locked: omit(projection.locked, id)
  })

const failure = (projection, {id, error}) =>
  !projection.locked[id] ? projection : ({
    ...projection,
    failed: {
      ...projection.failed,
      [id]: {
        ...omit(projection.locked[id], 'processorId'),
        error
      }
    },
    locked: omit(projection.locked, id)
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
    failed: omit(projection.failed, id)
  })

const unlock = (projection, {id, ...payload}) =>
  !projection.locked[id] ? projection : ({
    ...projection,
    pending: {
      ...projection.pending,
      [id]: omit(projection.locked[id], 'processorId')
    },
    locked: omit(projection.locked, id)
  })

const initialProjection = {
  pending: {},
  locked: {},
  failed: {},
  succeeded: {}
}

export default (namespace) => {
  const lens = {
    [`${namespace}:queue`]: queue,
    [`${namespace}:lock`]: lock,
    [`${namespace}:success`]: success,
    [`${namespace}:failure`]: failure,
    [`${namespace}:retry`]: retry,
    [`${namespace}:unlock`]: unlock
  }
  return (projection = initialProjection, {type, payload}) =>
    lens.hasOwnProperty(type) ? lens[type](projection, payload) : projection
}
