import crypto from 'crypto'

export default ({timestamp, ...event}) =>
  crypto.createHash('sha256')
    .update(JSON.stringify((event)))
    .digest('hex')
