import {describe, it, after} from 'mocha'
import assert from 'assert'

import createDB from '../src'
import serialize from '../src/serialize'

const createTestEvent = (value) => ({type: 'test_event', payload: {value}})
const createSpeedEvent = (value) => ({type: 'speed_event', payload: {value}})
const createWorkerEvent = (value) => ({type: 'worker_event', payload: {value}})

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const assertEqualTo = (b) => (a) => assert(equal(a, b))
const unique = (arr) => [...(new Set(arr))]

const testVals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const sum = (a, b) => a + b

let workerSideEffect = 0
const workerIdempotency = []
const testWorker = {
  namespace: 'test_worker',
  event: 'test_event',
  perform: ({value, id}, getProjection) =>
    getProjection('TEST2')
      .then((test2) => { 
        workerSideEffect += (test2 + value)
        workerIdempotency.push(id)
      }),
  onSuccess: ({value}, store) => store(createWorkerEvent(value)),
  onError: (error) => console.log(error)
}

const dbOptions = {
  eventStorePath: 'test/data/eventStore',
  projectionsPath: 'test/data/projections',
  projectors: {
    TEST: (projection = [], {type, payload: {value}}) => 
      type === 'test_event' ? [...projection, value] : projection,
    TEST2: (projection = 0, {type, payload: {value}}) => 
      type === 'test_event' ? projection + value : projection,
    SPEED_TEST: (projection = 0, {type, payload: {value}}) => 
      type === 'speed_event' ? projection + value : projection,
    WORKER: (projection = 0, {type, payload: {value}}) => type === 'worker_event' ? projection + value : projection
  },
  workers: [testWorker]
}

let db = {}

describe('Andvari', () => {
  before(() => db = createDB(dbOptions))

  after(() => db.close())

  it('seeds events and will not reseed them', () => 
    db.seed([1, 2, 3].map(createTestEvent))
      .then(assertEqualTo([1, 2, 3].map(createTestEvent).map(serialize)))
      .then(() => db.seed([2, 3, 4].map(createTestEvent)))
      .then(assertEqualTo([4].map(createTestEvent).map(serialize)))
      .then(() => db.seed([3, 4, 5].map(createTestEvent)))
      .then(assertEqualTo([5].map(createTestEvent).map(serialize)))
  )

  it('stores events and projects them', () =>
    db.storeAndProject('TEST')([6, 7, 8, 9, 10].map(createTestEvent))
      .then(assertEqualTo(testVals))
  )

  it('gets projections by namespace', () =>
    db.getProjection('TEST')
      .then(assertEqualTo(testVals))
  )

  it('projects into all projectors', () => 
    db.getProjection('TEST2')
      .then(assertEqualTo(testVals.reduce(sum, 0)))
  )

  it('handles rapid events correctly', () => 
    Promise.all([
      db.storeAndProject('TEST')([11, 12, 13].map(createTestEvent)),
      db.storeAndProject('TEST2')([14, 15, 16].map(createTestEvent))
    ]).then(([test, test2]) => {
      const expected = testVals.concat([11, 12, 13])
      const expected2 = testVals.concat([11, 12, 13, 14, 15, 16])
      assertEqualTo(expected)(test)
      assertEqualTo(expected2.reduce(sum, 0))(test2)
    })
  )

  it('tracks projection changes', () => {
    const result = []
    const expected = [17, 18, 19, 20]
    const diff = ({prevProjection, projection}) => {
      projection.forEach((n) => 
        !prevProjection.includes(n) && result.push(n))
    }
    db.onProjectionChange('TEST', diff)
    return db.storeAndProject('TEST')(createTestEvent(17))
      .then(() => db.storeAndProject('TEST')(createTestEvent(18)))
      .then(() => db.storeAndProject('TEST')(createTestEvent(19)))
      .then(() => db.storeAndProject('TEST')(createTestEvent(20)))
      .then(() => {
        assertEqualTo(expected)(result)
      })
  })

  it('defers and repeats events', () => {
    db.storeDeferred(createTestEvent(99), 30, 3)
    db.storeDeferred(createTestEvent(21), 30)
    db.storeDeferred(createTestEvent(22), 60)
    db.storeDeferred(createTestEvent(23), 90)
    db.storeDeferred(createTestEvent(24), 1500) // for restart test
    db.storeDeferred(createTestEvent(25), 1500) // for restart test

    return db.getProjection('TEST')
      .then((test) => {
        assert(test.filter(n => n === 99).length === 0)
        assert(!test.includes(21))
        assert(!test.includes(22))
        assert(!test.includes(23))
      })
      .then(wait(35))
      .then(() => db.getProjection('TEST'))
      .then((test) => {
        assert(test.filter(n => n === 99).length === 1)
        assert(test.includes(21))
        assert(!test.includes(22))
        assert(!test.includes(23))
      })
      .then(wait(30))
      .then(() => db.getProjection('TEST'))
      .then((test) => {
        assert(test.filter(n => n === 99).length === 2)
        assert(test.includes(21))
        assert(test.includes(22))
        assert(!test.includes(23))
      })
      .then(wait(30))
      .then(() => db.getProjection('TEST'))
      .then((test) => {
        assert(test.filter(n => n === 99).length === 3)
        assert(test.includes(21))
        assert(test.includes(22))
        assert(test.includes(23))
      })
  })

  it('runs workers in parallel', () => {
    return db.getProjection('WORKER').then((worker) => {
      console.log('worker', worker)
      console.log('workerSideEffect', workerSideEffect)
      assert(worker === 573)
      assert(workerSideEffect === 5196)
    })
  })

  it('only performs work once', () => {
    assertEqualTo(unique(workerIdempotency))(workerIdempotency)
  })

  it('passes a sequential full-cycle speed test', () => {
    let test = true
    wait(1000)().then(() => test = false)

    const runSpeedTest = (iterations) => !test ? iterations : 
      db.storeAndProject('SPEED_TEST')(createSpeedEvent(1))
        .then(runSpeedTest)

    return runSpeedTest().then((iterations) => {
      console.log(iterations)
      assert(iterations > 13000)
    })
  })
})

const wait = (ms) => () => new Promise((resolve) => {
  setTimeout(resolve, ms)
})
