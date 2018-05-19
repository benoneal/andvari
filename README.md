# Andvari

**NB: Readme currently out-of-date with the latest version (4). Will update soon.**

**Event sourcing in node from redux-like actions and reducers.**

Andvari has a simple goal: 

- Write redux-like actions and reducers: get the data you want in return

It achieves this by applying an opinionated philosophy to the event sourcing pattern:

- Events are sacred and append-only
- Events are completely agnostic to projections
- All events are projected into all projections
- Projections are disposable, can take any shape, and can be added, removed, or changed at any time
- All business logic reads from projections only

As a result, Andvari has some really powerful advantages over some other event sourcing implementations: 

- Side effects (email, payment processing, shipping, etc) are a non-issue. Andvari even exposes a convient `worker` API to abstract away the repetitive management of these things, allowing you to write business logic with confidence that it will never execute twice and will retry as many times as you need. 
- You can completely restructure your projections based on evolving data access requirements as simply as refactoring your reducer functions. When you update the version supplied to Andvari, your next deploy will reproject the entire history of events with your new projection logic (and you don't lose the old projections either).
- All the hard work is done for you. In building a production app, you merely need to define projection reducers that can process the events you store. Andvari wraps up all the eventual consistency concerns with a convenient promise-based API. `storeAndProject` allows you to store an event then have the promise resolve with the projection you want when it is updated with that event. 
- Everything is promise-based to take advantage of node's excellent handling of async and I/O
- All projections are held in-memory so read performance is limited only by the host machine specs

However, it's worth noting that Andvari is not currently suitable if your requirements demand distributed processing / lateral scaling. It is strictly single-process and single source-of-truth, as it is built on levelDB. If you need a distributed db, or your use-case demands truly large volumes of data, I *highly recommend* a solution like [Apache Samza](http://samza.apache.org/). 

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
      uniqueIds: uniq([...(projection.uniqueIds || []), id]),
      count: (projection.count || 0) + 1,
      [id]: {
        name, 
        email
      }
    })
  },
  version: '1.0.0'
}

const {storeAndProject, getProjection} = createDB(dbOptions)

const userActions = [
  {type: 'CREATE_USER', payload: {id: 1, name: 'Mary', email: 'mary@sue.com'}},
  {type: 'CREATE_USER', payload: {id: 2, name: 'David', email: 'david@lynch.com'}},
  {type: 'CREATE_USER', payload: {id: 3, name: 'Jane', email: 'jane@doe.com'}},
]

const log = console.log.bind(console)
userActions.forEach(action => storeAndProject('users')(action).then(log))

/* example output ('users' projection):
{
  uniqueIds: [1,2,3],
  count: 3,
  [1]: {
    name: 'Mary',
    email: 'mary@sue.com'
  },
  ...
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

#### Workers
Andvari exposes a useful worker abstraction. Workers will respond to a specified event, performing whatever action you want to perform in a separate event/projection loop (soon to be one or more separate threads). The worker handles idempotency to ensure that you will never ever process the same event twice, no matter how often your projections are re-run, or how many times you need to retry failed actions (or how many threads are running). 

They operate on a simple principle: when a given event type is stored, pass the event to a provided `perform` promise, which will do whatever you make it do. When this succeeds, it will call the provided onSuccess callback, or onError if your promise rejects, it runs out of retries, or takes longer than your supplied timeout. 

Workers are useful for managing side effects and integrations with external services, such as sending emails and processing payments. Just focus on writing business logic and let a worker manage the repetitive implementation details.

Workers are created by providing a `workers` array of `workerConfigs` to `createDB`: 

```js
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

## Snapshots

Andvari snapshots all projections. At midnight server-time every night, current projections are saved as nightly snapshots. On redeploy / reboot, every projection will bootstrap itself from the nightly snapshots, and update with all events since the snapshot. 

All projection snapshots are versioned with whatever `version` string you have provided in the dbOptions hash. If the string changes, subsequent projections will re-project the entire history of events. Thus when you update the `version` when you change your business logic, the entire projected state will reflect the whole history. If you don't update the `version`, only future events will have the new data shape in your projections. Old snapshots are never deleted, but there is currently no API exposed to retrieve them.

## API
createDB returns the following methods: 

```js
seed <HashedActionID> (<Action: []: object>)
store <NanosecondTimestamp> (<Action []: object>)
storeDeferred <NanosecondTimestamp> (<Action []: object>, delay, repeat)
storeAndProject <Projection> (<ProjectionNamespace: string>, <Condition: function>)(<Action []: object>)
getProjection <Projection> (<ProjectionNamespace: string>)
onProjectionChange (<ProjectionNamespace: string>, <Callback: function>)

// Actions provided to Andvari *must* conform to this spec.
<Action>: {
  type: string,
  payload: any
}
```

You can use whatever redux-like patterns you may be used to for creating your actions and projection reducers: they are just data and functions. Actions must conform to the spec above, but reducers can return a projection of any type/shape you require. Your reducers can handle as many/few action types as they need: all events are passed through all provided `projector` reducers. 

#### Seeding data

`seed` actions in your code, and they will only ever be evented once, no matter how many times you deploy with that code in your application. Seeded actions are hashed, so don't change their contents between deploys or a new event will be added. 

#### Deferring events

When you have `workers` processing things such as emails or subscription payments, it can be incredibly useful to have a declarative way to defer actioning these events until some time in the future. `storeDeferred` will wrap your event, preventing it from being picked up by your workers and other projections, and uses an internal projection to unwrap the event, storing the original at the appropriate time in the future. 

This event can also be repeated, though this should be done with full awareness of the implications. A deferred event will unwrap **as initially provided**. This seems obvious, but it means you should not trust/rely on deferred event data for fields that might change before it is unwrapped and/or especially repeated. For example: if you repeat an event that would trigger an email to be sent to account holders, you will need to deal with the fact that the customer may change their email address, or cancel their account, before your repeats have finished. The simplest way to manage this is to maintain a map in your projections of old->new email addresses, and check for account status before actually sending any email.

This is good practice anyway, but it bears emphasis. When deferring events for future processing, especially those with side effects, **plan for all edge cases carefully**. 

##### Future additions

- Configure timing for backups to smaller increments than "nightly"
- Per projector versioning
- Hooks to persist/restore backups to/from external source
- TCP/HTTP client interface for standalone server
- Hook to migrate eventStore through a map (for staging environments to mirror production with sanitized data)
