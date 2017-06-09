# Andvari

Event sourcing in node from redux-like actions and reducers.

## How to use

Install via `npm i -S andvari` or `yarn add andvari`.

Create the db to get your store and get methods. Example: 

```js
// db.js
import createDB from 'andvari'

const dbOptions = {
  eventStorePath: './data/eventStore', // path to the directory where your events data will be persisted
  projectionsPath: './data/projections', // path to the directory where your projections data will be persisted
  projectors: {
    users: (projection, {type, payload: {id, name, email}}) => type !== 'CREATE_USER' ? projection : ({
      ...projection,
      [id]: {
        name, 
        email
      }
    })
  },
  filters: {
    userCount: {
      projection: 'users',
      filter: (users) => Object.keys(users).length
    }
  }
}

const {storeAndProject, getProjection} = createDB(dbOptions)

const userActions = [
  {type: 'CREATE_USER', payload: {id: 1, name: 'Mary'}},
  {type: 'CREATE_USER', payload: {id: 2, name: 'David'}},
  {type: 'CREATE_USER', payload: {id: 3, name: 'Jane'}},
]

const log = console.log.bind(console)
userActions.forEach(action => storeAndProject(action, 'userCount').then(log))

/* example output ('userCount' projection):
{
  uniqueIds: [1,2,3],
  count: 3
}
*/
```

#### Projectors map
The projectors map uses projection namespaces as keys (the namespaces you want to use to fetch projections), and the reducer as value (the function which processes each event into your projection). Example: 

```js
const projectors = {
  users: (projection, {type, payload: {id, name, email}}) => type !== 'CREATE_USER' ? projection : ({
    ...projection,
    [id]: {
      name, 
      email
    }
  })
}
```

#### Filters map
Filters are new projections made by transforming an existing complete projection. The filters map uses filter projection namespaces as keys (the namespaces you want to use to fetch filtered projections), and the reducer as value (the function which processes each event into your projection). Example: 

```js
const filters = {
  userCount: {
    projection: 'users',
    filter: (users) => Object.keys(users).length
  }
}
```

#### createWorker
Andvari exposes a useful worker abstraction. Workers will respond to a specified event, performing whatever action you want to perform in a separate event/projection loop (soon to be one or more separate threads). The worker handles idempotency to ensure that you will never ever process the same event twice, no matter how often your projections are re-run, or how many times you need to retry failed actions (or how many threads are running). 

Workers are useful for managing side effects and integrations with external services, such as sending emails and processing payments. Just focus on writing business logic and let a worker manage the repetitive implementation details. 

## API
createDB returns the following interface: 

```js
store <NanosecondTimestamp> (<Action: object>)
storeAndProject <Projection> (<Action: object>, <ProjectionNamespace: string>, <Condition: function>)
getProjection <Projection> (<ProjectionNamespace: string>)
getEvents <Event []> (<NanosecondTimestampFrom: string>, <NanosecondTimestampTo: string>)
watch <Projection> (<ProjectionNamespace: string>, <Callback: function>)
createWorker <> (<WorkerConfig>)

<Action>: {
  type: string,
  payload: any
}

<WorkerConfig>: {
  namespace: string,
  event: string,
  condition: function <Bool> (<EventPayload>),
  onSuccess: actionCreatorFunction,
  onError: actionCreatorFunction,
  perform: function <Promise> (<EventPayload>, getProjection),
  retries: number, 
  timeout: milliseconds
}
```

You can use all the redux patterns you may be used to for creating your actions and projection reducers. Actions must conform to the spec above, but reducers can return a projection of any type/shape you require. Your reducers can handle as many/few action types as they need: all events are passed through all provided `projector` reducers. 
