const lenses = {}

export const createAction = (namespace) => (type, handler) => {
  if (!lenses.hasOwnProperty(namespace)) lenses[namespace] = {}
  lenses[namespace][type] = handler
  return (payload) => ({type, payload})
}

export default (namespace) => (projection = {}, {type, payload}) => (
  lenses[namespace].hasOwnProperty(type) ? lenses[namespace][type](projection, payload) : projection
)