import fast from 'fast.js'

export default (sink, shape, insert, maxLength = 1000, flushInterval = 100) => {
  let flushTimer, queue = new Array(maxLength), cursor = 0, i = -1
  while (++i < maxLength) {
    queue[i] = {...shape}
  }
  Object.seal(queue)

  const flushQueue = () => {
    if (cursor === 0) return Promise.resolve()
    flushTimer = undefined
    let currCursor = cursor
    cursor = 0
    return sink(queue.slice(0, currCursor))
  }

  const push = event => {
    if (cursor === maxLength) flushQueue()
    if (!flushTimer) flushTimer = setTimeout(flushQueue, flushInterval)
    insert(event, queue[cursor++])
  }

  push.flush = flushQueue

  return push
}
