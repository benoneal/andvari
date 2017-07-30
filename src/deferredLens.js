export const DEFERRED = 'deferred'

const queue = (projection, {id, ...payload}) => ({
  ...projection,
  [id]: {
    id,
    ...payload,
    repeats: 0
  }
})

const done = (projection, {id}) => {
  const {[id]: discard, ...withoutDone} = projection
  return withoutDone
}

const repeat = (projection, {id, deferUntil}) => ({
  ...projection,
  [id]: {
    ...projection[id],
    id,
    deferUntil,
    repeats: projection[id].repeats + 1
  }
})

const lens = {
  [`${DEFERRED}:queue`]: queue,
  [`${DEFERRED}:done`]: done,
  [`${DEFERRED}:repeat`]: repeat
}

export default (projection = {}, {type, payload}) =>
  lens.hasOwnProperty(type) ? lens[type](projection, payload) : projection
