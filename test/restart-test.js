import {describe, it, before, after} from 'mocha'
import assert from 'assert'

import db from './db'

const wait = ms => () => new Promise(resolve => setTimeout(resolve, ms))

const {values} = Object

describe('Andvari restarted', () => {
  before(() => db.open())

  it('recovers projections', () => 
    db.showTest().then(test => assert(test.length === 27))
  )

  it('recovers deferred events', () => {
    const deferred = db.show('__deferred')
    const [first, second] = values(deferred)
    assert(first.delay === 1000)
    assert(first.event.payload === 24)
    assert(second.event.type === 'test_event')
    assert(second.event.payload === 25)
  })

  it('processes deferred events', () => 
    wait(1100)()
      .then(db.showTest)
      .then(test => {
        assert(test.includes(24))
        assert(test.includes(25))
      })
  )
})
