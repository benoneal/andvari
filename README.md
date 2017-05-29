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
    userCount: (projection, {type, payload}) => type !== 'CREATE_USER' ? projection : ({
      ...projection,
      uniqueIds: uniq([...projection.uniqueIds, payload.id])
      count: uniq([...projection.uniqueIds, payload.id]).length
    })
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
The projectors map uses projection namespaces as keys (the namespaces you want to use to fetch projections), and the reducer as value (the function which processes each event into your projection). 

## API
```js
storeAndProject <Projection> (<Action: object>, <ProjectionNamespace: string>)
getProjection <Projection> (<ProjectionNamespace: string>)
getEvents <Event []> (<NanosecondTimestampFrom: string>, <NanosecondTimestampTo: string>)
filterProjection <Projection> (<ProjectorNamespaceToFilter: string>, <FilteredProjectionNamespace: string>, <Filter: function <Projection> (<Projection: any>)>)
// filterProjection watches a projection, and passes all changes through your filter function, saving them as a filteredProjection with your provided namespace. Read with getProjection(FilteredProjectionNamespace).

<Action>: {
  type: String,
  payload: any
}
```

You can use all the redux patterns you may be used to for creating your actions and projection reducers. Actions must conform to the spec above, but reducers can return a projection of any type/shape you require. Your reducers can handle as many/few action types as they need: all events are passed through all provided `projector` reducers. 
