import createDB, {createLens} from '../src'

import mkdirp from 'mkdirp'
import rimraf from 'rimraf'

['test/data/eventStore', 'test/data/projections'].forEach(dir => {
  rimraf.sync(dir)
  mkdirp.sync(dir)
})

const sum = (a, b) => a + b
const arrPush = (snapshot = [], payload) => {
  snapshot.push(payload)
  return snapshot
}

const testLens = createLens('TEST', [])
const test2Lens = createLens('TEST2', 0)
const speedTestLens = createLens('SPEED_TEST', [])

export const test = testLens.createEventHandler('test_event', arrPush)
export const test2 = test2Lens.createEventHandler('test_event', sum)
export const speedTest = speedTestLens.createEventHandler('speed_test', arrPush)

export const triggersResult = []
const triggerOnUpdate = (prev = [], projection) => {
  projection.forEach(n => !triggersResult.includes(n) && triggersResult.push(n))
}

const dbOptions = {
  eventStorePath: 'test/data/eventStore',
  projectionsPath: 'test/data/projections',
  persistInterval: 10,
  lenses: [
    testLens.lens,
    test2Lens.lens,
    speedTestLens.lens
  ],
  triggers: [
    {projection: 'TEST', onUpdate: triggerOnUpdate}
  ]
}

export default createDB(dbOptions)
