# Andvari

**Event sourcing in node from redux-like actions and reducers.**

Andvari has a simple goal: 

- Write redux-like actions and reducers: get the data you want in return

It achieves this by applying an opinionated philosophy to the event sourcing pattern:

- Events are sacred and append-only
- Events are completely agnostic to projections
- All events are projected into all projections
- Projections are disposable, can take any shape, and can be added, removed, or changed at any time
- All business logic reads from projections only

As a result, Andvari has some really powerful advantages over other event sourcing implementations: 

- Side effects (email, payment processing, shipping, etc) are a non-issue. Andvari even exposes a convience `createWorker` method to abstract away the repetitive management of these things, allowing you to write business logic with confidence that it will never execute twice and will retry as many times as you need. 
- You can completely restructure your projections based on evolving data access requirements as simply as refactoring your reducer functions. When you update the version supplied to Andvari, your next deploy will reproject the entire history of events with your new projection logic (and you don't lose the old projections either).
- All the hard work is done for you. In building a production app, you merely need to define projection reducers that can process the events you store. Andvari wraps up all the eventual consistency concerns with a convenient promise-based API. `storeAndProject` allows you to store an event then have the promise resolve with the projection you want when it is updated with that event. 

However, it's worth noting that Andvari is not currently suitable if your requirements demand distributed processing / lateral scaling. It is single-process and single source-of-truth, but it's also very fast, and is built on levelDB. 

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
  version: 1.0.0
}

const {storeAndProject, getProjection} = createDB(dbOptions)

const userActions = [
  {type: 'CREATE_USER', payload: {id: 1, name: 'Mary'}},
  {type: 'CREATE_USER', payload: {id: 2, name: 'David'}},
  {type: 'CREATE_USER', payload: {id: 3, name: 'Jane'}},
]

const log = console.log.bind(console)
userActions.forEach(action => storeAndProject('userCount')(action).then(log))

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

#### createWorker
Andvari exposes a useful worker abstraction. Workers will respond to a specified event, performing whatever action you want to perform in a separate event/projection loop (soon to be one or more separate threads). The worker handles idempotency to ensure that you will never ever process the same event twice, no matter how often your projections are re-run, or how many times you need to retry failed actions (or how many threads are running). 

Workers are useful for managing side effects and integrations with external services, such as sending emails and processing payments. Just focus on writing business logic and let a worker manage the repetitive implementation details. 

## Snapshots

Andvari uses two snapshots for all projections: `latest` and `nightly`. It will prefer `latest`, and fall back to `nightly` if latest doesn't exist. `Nightly` will update at midnight server-time every night, building on the previous `nightly` snapshot. Due to the eventually consistent nature of event sourcing, every projection snapshot attempt will fetch and project from all events since it was snapshoted, even though the trigger to do so occurs on every event. 

All projection snapshots are versioned with whatever `version` string you have provided in the dbOptions hash. If the string changes, subsequent projections will re-project the entire history of events. Thus when you update the `version` when you change your business logic, the entire projected state will reflect the whole history. If you don't update the `version`, only future events will have the new data shape in your projections. 

## API
createDB returns the following interface: 

```js
store <NanosecondTimestamp> (<Action []: object>)
storeAndProject <Projection> (<ProjectionNamespace: string>, <Condition: function>)(<Action []: object>)
getProjection <Projection> (<ProjectionNamespace: string>)
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
