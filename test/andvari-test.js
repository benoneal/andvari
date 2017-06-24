import {describe, it} from 'mocha'
import assert from 'assert'

import createDB from '../src'

const dbOptions = {
  eventStorePath: 'test/data/eventStore',
  projectionsPath: 'test/data/projections',
  projectors: {
    TEST: (projection = [], {payload: {value}}) => [...projection, value],
    TEST2: (projection = 0, {payload: {value}}) => projection + value
  }
}

const {
  storeAndProject,
  getProjection
} = createDB(dbOptions)

const storeToTest = storeAndProject('TEST')
const storeToTest2 = storeAndProject('TEST2')
const createTestEvent = (value) => ({type: 'test_event', payload: {value}})

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const assertEqualTo = (b) => (a) => assert(equal(a, b))

const testVals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const sum = (a, b) => a + b

describe('Andvari', () => {
  it('stores events and projects them', () =>
    storeToTest(testVals.map(createTestEvent))
      .then(assertEqualTo(testVals))
  )

  it('gets projections by namespace', () =>
    getProjection('TEST')
      .then(assertEqualTo(testVals))
  )

  it('projects into all projectors', () => 
    getProjection('TEST2')
      .then(assertEqualTo(testVals.reduce(sum, 0)))
  )

  it('handles rapid events correctly', () => 
    Promise.all([
      storeToTest([11, 12, 13].map(createTestEvent)),
      storeToTest2([14, 15, 16].map(createTestEvent))
    ]).then(([test, test2]) => {
      const expected = testVals.concat([11, 12, 13, 14, 15, 16])
      assertEqualTo(expected)(test)
      assertEqualTo(expected.reduce(sum, 0))(test2)
    })
  )
})
