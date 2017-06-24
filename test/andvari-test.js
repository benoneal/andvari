import {describe, it} from 'mocha'
import assert from 'assert'

import createDB from '../src'

const dbOptions = {
  eventStorePath: 'test/data/eventStore',
  projectionsPath: 'test/data/projections',
  projectors: {
    TEST: (projection = [], {payload: {value}}) => [...projection, value]
  }
}

const {
  storeAndProject,
  getProjection
} = createDB(dbOptions)

const storeToTest = storeAndProject('TEST')
const createTestEvent = (value) => ({type: 'test_event', payload: {value}})

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const assertEqualTo = (b) => (a) => assert(equal(a, b))

const testVals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

describe('Andvari', () => {
  it('stores events and projects them', () =>
    storeToTest(testVals.map(createTestEvent))
      .then(assertEqualTo(testVals))
  )

  it('gets projections by namespace', () =>
    getProjection('TEST')
      .then(assertEqualTo(testVals))
  )
})
