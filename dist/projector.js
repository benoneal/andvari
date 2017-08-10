'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _level = require('level');

var _level2 = _interopRequireDefault(_level);

var _nanoTime = require('nano-time');

var _nanoTime2 = _interopRequireDefault(_nanoTime);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var keys = Object.keys,
    values = Object.values,
    freeze = Object.freeze;


var PREVIOUS = 'PREVIOUS';
var NIGHTLY = 'NIGHTLY';

var msTillMidnight = function msTillMidnight() {
  var day = new Date();
  day.setHours(24, 0, 0, 0);
  var nextMd = day.getTime() - Date.now();
  return nextMd > 1000 * 60 ? nextMd : 1000 * 60 * 60 * 24;
};

var runNightly = function runNightly(fn) {
  setTimeout(fn, msTillMidnight());
};

var SAFE_INT = '000000000000000';
var leftPad = function leftPad() {
  var str = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
  var pad = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : SAFE_INT;
  return (pad + str).substring(str.length);
};
var since = function since(timestamp) {
  if (!timestamp) return;
  var left = timestamp.slice(0, -SAFE_INT.length);
  var right = timestamp.slice(-SAFE_INT.length, timestamp.length);
  return left + leftPad(parseInt(right) + 1 + '');
};

var pipeReducer = function pipeReducer(acc, fn) {
  return typeof fn === 'function' ? fn(acc) : acc;
};
var pipe = function pipe() {
  for (var _len = arguments.length, fns = Array(_len), _key = 0; _key < _len; _key++) {
    fns[_key] = arguments[_key];
  }

  return function (arg) {
    return fns.reduce(pipeReducer, arg);
  };
};

exports.default = function (path, initialProjectors, getEvents) {
  var REVISION = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '1';

  var projectors = initialProjectors || {};
  var projections = {};
  var snapshots = (0, _level2.default)(path, { valueEncoding: 'json' });

  // Handle sync updates during initialization
  var queue = [];
  var initialized = false;
  var buffer = function buffer(fn) {
    return function () {
      for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }

      return new Promise(function (resolve) {
        if (initialized) return resolve(fn.apply(undefined, args));
        queue.push([fn, args, resolve]);
      });
    };
  };
  var flushQueue = function flushQueue() {
    return queue.forEach(function (_ref) {
      var _ref2 = _slicedToArray(_ref, 3),
          fn = _ref2[0],
          args = _ref2[1],
          resolve = _ref2[2];

      return resolve(fn.apply(undefined, _toConsumableArray(args)));
    });
  };

  // Seeds
  var getSeeded = function getSeeded() {
    return new Promise(function (resolve) {
      snapshots.get('__seeded__', function (err) {
        var seeded = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
        return resolve(seeded);
      });
    });
  };

  var setSeeded = function setSeeded(newSeeds) {
    return new Promise(function (resolve) {
      getSeeded().then(function (oldSeeds) {
        return snapshots.put('__seeded__', [].concat(_toConsumableArray(oldSeeds), _toConsumableArray(newSeeds)), function () {
          return resolve(newSeeds);
        });
      });
    });
  };

  // Watchers
  var watchers = {};
  var cleanUpWatcher = function cleanUpWatcher(timestamp) {
    return function () {
      var _ref3 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          keepWatching = _ref3.keepWatching;

      return !keepWatching && delete watchers[timestamp];
    };
  };

  var watchersFor = function watchersFor(projectionNamespace) {
    return function (_ref4) {
      var namespace = _ref4.namespace;
      return projectionNamespace === namespace;
    };
  };

  var previousProjection = function previousProjection(namespace) {
    return projections[namespace + ':' + PREVIOUS] && projections[namespace + ':' + PREVIOUS].projection;
  };

  var updateWatchers = function updateWatchers(_ref5) {
    var namespace = _ref5.namespace,
        timestamp = _ref5.timestamp,
        projection = _ref5.projection;

    values(watchers).filter(watchersFor(namespace)).forEach(function (_ref6) {
      var fn = _ref6.fn,
          watchTimestamp = _ref6.watchTimestamp;
      return fn(projection, timestamp, previousProjection(namespace)).then(cleanUpWatcher(watchTimestamp));
    });
  };

  var watch = function watch(namespace, fn) {
    var watchTimestamp = (0, _nanoTime2.default)();
    watchers[watchTimestamp] = { fn: fn, namespace: namespace, watchTimestamp: watchTimestamp };
  };

  var matchProjection = function matchProjection(timestamp, condition, cb) {
    return function (projection, ssTimestamp) {
      return new Promise(function (resolve) {
        if (ssTimestamp >= timestamp && condition(projection)) {
          cb(projection);
          resolve();
        }
      });
    };
  };

  var when = function when(namespace, eTimestamp) {
    var condition = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : function () {
      return true;
    };
    return new Promise(function (resolve) {
      watch(namespace, matchProjection(eTimestamp, condition, resolve));
    });
  };

  // Manage Nightly builds
  var getSnapshot = function getSnapshot(namespace) {
    return new Promise(function (resolve) {
      snapshots.get(namespace + ':' + NIGHTLY + ':' + REVISION, function (err) {
        var _ref7 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            timestamp = _ref7.timestamp,
            projection = _ref7.projection;

        return resolve({ timestamp: timestamp, projection: projection, namespace: namespace });
      });
    });
  };

  var buildProjectionsFromSnapshots = function buildProjectionsFromSnapshots(snapshots) {
    return snapshots.reduce(function (acc, snapshot) {
      return _extends({}, acc, _defineProperty({}, snapshot.namespace, snapshot));
    }, {});
  };

  var restoreSnapshots = function restoreSnapshots(projectors) {
    var updateWatchers = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    return Promise.all(projectors.map(getSnapshot)).then(buildProjectionsFromSnapshots).then(applyProjections(updateWatchers)).then(getDaysEvents).then(createProjections).then(applyProjections(updateWatchers)).then(function () {
      initialized = true;
      flushQueue();
    });
  };

  var getDaysEvents = function getDaysEvents() {
    return new Promise(function (resolve) {
      snapshots.get('__nightlyTimestamp__:' + REVISION, function (err, timestamp) {
        getEvents(since(timestamp)).then(resolve);
      });
    });
  };

  var updateLastNightly = function updateLastNightly(events) {
    return new Promise(function (resolve) {
      snapshots.put('__nightlyTimestamp__:' + REVISION, events[events.length - 1].timestamp, function () {
        return resolve(events);
      });
    });
  };

  var persistProjections = function persistProjections(newProjections) {
    return snapshots.batch(values(newProjections).map(function (value) {
      return {
        type: 'put',
        key: value.namespace + ':' + NIGHTLY + ':' + REVISION,
        value: value
      };
    }));
  };

  // Projections
  var getProjection = function getProjection(namespace) {
    return Promise.resolve(projections[namespace] && projections[namespace].projection);
  };

  var projectEvents = function projectEvents() {
    var events = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    var lens = arguments[1];

    var _ref8 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
        timestamp = _ref8.timestamp,
        projection = _ref8.projection,
        namespace = _ref8.namespace;

    return {
      namespace: namespace,
      timestamp: events.length ? events[events.length - 1].timestamp : timestamp,
      projection: events.reduce(lens, projection)
    };
  };

  var createProjections = function createProjections(events) {
    return keys(projectors).reduce(function (acc, namespace) {
      return _extends({}, acc, _defineProperty({}, namespace, projectEvents(events, projectors[namespace], projections[namespace])));
    }, {});
  };

  var applyProjections = function applyProjections(shouldUpdateWatchers) {
    return function () {
      var newProjections = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      return values(newProjections).forEach(function () {
        var _ref9 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
            namespace = _ref9.namespace,
            timestamp = _ref9.timestamp,
            projection = _ref9.projection;

        if (!namespace || projections[namespace] && projection === projections[namespace].projection) return;
        projections[namespace + ':' + PREVIOUS] = projections[namespace];
        projections[namespace] = { namespace: namespace, timestamp: timestamp, projection: projection };
        shouldUpdateWatchers && updateWatchers(projections[namespace]);
      });
    };
  };

  var project = pipe(createProjections, applyProjections(true));

  var projectNightly = function projectNightly() {
    getDaysEvents().then(updateLastNightly).then(pipe(createProjections, persistProjections));
    runNightly(projectNightly);
  };
  runNightly(projectNightly);

  restoreSnapshots(keys(projectors));

  return freeze({
    watch: buffer(watch),
    when: buffer(when),
    project: buffer(project),
    getProjection: buffer(getProjection),
    getSeeded: buffer(getSeeded),
    setSeeded: buffer(setSeeded),
    close: function close() {
      return new Promise(function (resolve) {
        return snapshots.close(resolve);
      });
    }
  });
};