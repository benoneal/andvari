import {describe, it, after} from 'mocha'
import assert from 'assert'
import db, {
  test,
  test2,
  speedTest,
  triggersResult,
} from './db'
import serialize from '../src/serialize'

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const assertEqualTo = b => a => {
  if (!equal(a, b)) {
    console.log(`saw: ${a}`)
    console.log(`expected: ${b}`)
  }
  return assert(equal(a, b))
}
const unique = arr => Array.from(new Set(arr))
const wait = ms => () => new Promise(resolve => setTimeout(resolve, ms))

const testVals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const sum = (a, b) => a + b

describe('Andvari', () => {
  before(() => db.open())
  after(() => db.close())

  it('seeds events and will not reseed them', () => 
    db.seed([1, 2, 3].map(test))
      .then(assertEqualTo([1, 2, 3].map(test).map(serialize)))
      .then(() => db.seed([2, 3, 4].map(test)))
      .then(assertEqualTo([4].map(test).map(serialize)))
      .then(() => db.seed([3, 4, 5].map(test)))
      .then(assertEqualTo([5].map(test).map(serialize)))
  )

  it('stores events and projects them', () => {
    [6, 7, 8, 9].map(n => db.store(test(n)))
    return db.storeTest(test(10)).then(assertEqualTo(testVals))
  })

  it('gets projections with helper methods', () =>
    db.showTest().then(assertEqualTo(testVals))
  )

  it('projects into all projectors', () => 
    db.showTest2().then(assertEqualTo(testVals.reduce(sum, 0)))
  )

  it('projects events synchronously', () => {
    db.store(test(11))
    db.store(test(12))
    db.store(test(13))
    db.store(test(14))
    db.store(test(15))
    db.store(test(16))
    const expected = testVals.concat([11, 12, 13, 14, 15, 16])
    const expected2 = testVals.concat([11, 12, 13, 14, 15, 16])
    const test1 = db.show('TEST')
    const test2 = db.show('TEST2')
    assertEqualTo(expected)(test1)
    assertEqualTo(expected2.reduce(sum, 0))(test2)
  })

  it('tracks projection changes through triggers', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    return db.storeTest(test(17))
      .then(() => db.storeTest(test(18)))
      .then(() => db.storeTest(test(19)))
      .then(() => db.storeTest(test(20)))
      .then(() => assertEqualTo(expected)(triggersResult))
  })

  it('passes a speed test', () => {
    const start = Date.now()

    const recurse = () => db.storeSpeedTest(speedTest(1))
      .then(data => (Date.now() - start < 1000) ? recurse() : data)

    return recurse().then(data => {
      const perSecond = data.length / ((Date.now() - start) / 1000)
      console.log(`${Math.floor(perSecond)} events stored per second`)
      assert(perSecond > 70000)
    })
  })

  it('passes an alternate speed test', () => {
    const start = Date.now()
    let count = 70000

    const recurse = () => db.storeSpeedTest(speedTest(1))
      .then(data => count-- ? recurse() : data)

    return recurse().then(data => {
      const time = Date.now() - start
      console.log(`70,000 events stored in ${time}ms, ${data.length} events total`)
      assert(time < 1000)
    })
  })

  it('defers and repeats events', () => {
    db.defer(test(99), 10, 3)
    db.defer(test(21), 10)
    db.defer(test(22), 20)
    db.defer(test(23), 30)
    db.defer(test(24), 1000) // for restart test
    db.defer(test(25), 1000) // for restart test

    return db.showTest()
      .then(test => {
        assert(!test.includes(99))
        assert(!test.includes(21))
        assert(!test.includes(22))
        assert(!test.includes(23))
      })
      .then(wait(12))
      .then(db.showTest)
      .then(test => {
        assert(test.includes(99))
        assert(test.includes(21))
        assert(!test.includes(22))
        assert(!test.includes(23))
      })
      .then(wait(10))
      .then(db.showTest)
      .then(test => {
        assert(test.filter(n => n === 99).length === 2)
        assert(test.includes(21))
        assert(test.includes(22))
        assert(!test.includes(23))
      })
      .then(wait(10))
      .then(db.showTest)
      .then(test => {
        assert(test.filter(n => n === 99).length === 3)
        assert(test.includes(21))
        assert(test.includes(22))
        assert(test.includes(23))
      })
  })
})
