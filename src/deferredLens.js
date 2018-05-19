import createLens from './lensCreator'

export const DEFERRED = '__deferred'

const deferredLens = createLens(DEFERRED, {})
const {createEventHandler} = deferredLens

const omit = (object, key) => {
  const {[key]: deletedKey, ...rest} = object
  return rest
}

export const lens = deferredLens.lens

export const queue = createEventHandler(
  `${DEFERRED}:queue`, 
  (snapshot, payload) => ({
    ...snapshot,
    [payload.id]: {
      ...payload,
      repeated: 0
    }
  })
)

export const repeat = createEventHandler(
  `${DEFERRED}:repeat`,
  (snapshot, {id, deferUntil}) => ({
    ...snapshot,
    [id]: {
      ...snapshot[id],
      deferUntil,
      repeated: snapshot[id].repeated + 1
    }
  })
)

export const complete = createEventHandler(
  `${DEFERRED}:complete`,
  (snapshot, {id}) => omit(snapshot, id)
)
