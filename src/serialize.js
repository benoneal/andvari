import crypto from 'crypto'

export default (action) =>
  crypto.createHash('sha256')
    .update(JSON.stringify(action))
    .digest('hex')
    