import {describe, it, before, after} from 'mocha'
import assert from 'assert'
import fs from 'fs'
import path from 'path'

import createDB from '../src'

const {values} = Object

const dbOptions = {
  eventStorePath: 'test/data/eventStore',
  projectionsPath: 'test/data/projections',
  projectors: {
    TEST: (projection = [], {type, payload: {value}}) => 
      type === 'test_event' ? [...projection, value] : projection
  }
}

let db = {}

describe('Andvari restarted', () => {
  before(() => db = createDB(dbOptions))

  after(() => db.close())

  it('recovers projections', () => 
    db.getProjection('TEST').then((test) => {
      assert(test.length === 27)
    })
  )

  it('recovers deferred events', () => 
    db.getProjection('deferred').then((deferred) => {
      const [first, second] = values(deferred)
      assert(first.delay === 1500)
      assert(first.action.payload.value === 24)
      assert(second.action.type === 'test_event')
      assert(second.action.payload.value === 25)
    })
  )

  it('processes deferred events', () => 
    wait(1600)()
      .then(() => db.getProjection('TEST'))
      .then(test => {
        assert(test.includes(24))
        assert(test.includes(25))
      })
  )
})

const wait = (ms) => () => new Promise((resolve) => {
  setTimeout(resolve, ms)
})