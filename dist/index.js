'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _v = require('uuid/v4');

var _v2 = _interopRequireDefault(_v);

var _eventStore = require('./eventStore');

var _eventStore2 = _interopRequireDefault(_eventStore);

var _projector = require('./projector');

var _projector2 = _interopRequireDefault(_projector);

var _worker = require('./worker');

var _worker2 = _interopRequireDefault(_worker);

var _workerLens = require('./workerLens');

var _workerLens2 = _interopRequireDefault(_workerLens);

var _deferred = require('./deferred');

var _deferred2 = _interopRequireDefault(_deferred);

var _serialize = require('./serialize');

var _serialize2 = _interopRequireDefault(_serialize);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var keys = Object.keys,
    freeze = Object.freeze;
var isArray = Array.isArray;


var arrayOfActions = function arrayOfActions(actions) {
  actions = isArray(actions) ? actions : [actions];
  return actions.filter(function () {
    var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        type = _ref.type,
        payload = _ref.payload;

    return Boolean(type && payload);
  });
};

var workerProjections = function workerProjections() {
  var workers = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  return workers.reduce(function (acc, _ref2) {
    var namespace = _ref2.namespace;
    return _extends({}, acc, _defineProperty({}, namespace, (0, _workerLens2.default)(namespace)));
  }, {});
};

exports.default = function (_ref3) {
  var eventStorePath = _ref3.eventStorePath,
      projectionsPath = _ref3.projectionsPath,
      projectors = _ref3.projectors,
      workers = _ref3.workers,
      version = _ref3.version;

  if (!eventStorePath || !projectionsPath || !projectors) {
    throw new Error('Andvari requires eventStorePath, projectionsPath, and projectors map');
  }

  var _initEventStore = (0, _eventStore2.default)(eventStorePath),
      createEvent = _initEventStore.createEvent,
      listen = _initEventStore.listen,
      append = _initEventStore.append,
      getEvents = _initEventStore.getEvents,
      closeEventStore = _initEventStore.close;

  var _initProjections = (0, _projector2.default)(projectionsPath, _extends({}, projectors, { deferred: _deferred.deferredLens }, workerProjections(workers)), getEvents, version),
      watch = _initProjections.watch,
      when = _initProjections.when,
      project = _initProjections.project,
      getProjection = _initProjections.getProjection,
      getSeeded = _initProjections.getSeeded,
      setSeeded = _initProjections.setSeeded,
      closeProjections = _initProjections.close;

  var store = function store(actions) {
    return append(arrayOfActions(actions).map(createEvent));
  };

  var seed = function seed(actions) {
    return getSeeded().then(function (seeded) {
      return arrayOfActions(actions).filter(function (action) {
        return !seeded.includes((0, _serialize2.default)(action));
      });
    }).then(function (actions) {
      append(actions.map(createEvent));
      return setSeeded(actions.map(_serialize2.default));
    });
  };

  var storeAndProject = function storeAndProject(projectionNamespace, condition) {
    return function (actions) {
      return new Promise(function (resolve, reject) {
        var events = arrayOfActions(actions).map(createEvent);
        when(projectionNamespace, events[events.length - 1].timestamp, condition).then(resolve).catch(reject);
        append(events).catch(reject);
      });
    };
  };

  var onProjectionChange = function onProjectionChange(namespace, handleChange) {
    watch(namespace, function (projection, _, prevProjection) {
      return new Promise(function (resolve) {
        handleChange({ prevProjection: prevProjection, projection: projection }, getProjection, store);
        resolve({ keepWatching: true });
      });
    });
  };

  var storeDeferred = (0, _deferred2.default)({
    store: store,
    onProjectionChange: onProjectionChange,
    getProjection: getProjection
  });

  var createWorker = function createWorker(_ref4) {
    var namespace = _ref4.namespace,
        event = _ref4.event,
        _ref4$condition = _ref4.condition,
        condition = _ref4$condition === undefined ? function () {
      return true;
    } : _ref4$condition,
        perform = _ref4.perform,
        onSuccess = _ref4.onSuccess,
        onError = _ref4.onError,
        retries = _ref4.retries,
        timeout = _ref4.timeout;

    if (!namespace || !event || typeof perform !== 'function' || typeof onSuccess !== 'function' || typeof onError !== 'function') {
      throw new Error('createWorker requires namespace, event, perform, onSuccess, and onError');
    }

    (0, _worker2.default)({
      namespace: namespace,
      perform: perform,
      onSuccess: onSuccess,
      onError: onError,
      retries: retries,
      timeout: timeout,
      store: store,
      onProjectionChange: onProjectionChange,
      getProjection: getProjection
    });

    listen(function (events) {
      var queue = events.reduce(function (acc, _ref5) {
        var type = _ref5.type,
            payload = _ref5.payload;
        return type === event && condition(payload) ? [].concat(_toConsumableArray(acc), [{
          type: namespace + ':queue',
          payload: _extends({}, payload, { id: payload.id || (0, _v2.default)() })
        }]) : acc;
      }, []);

      queue.length && store(queue);
    });
  };

  if (isArray(workers)) workers.forEach(createWorker);

  listen(project);

  var close = function close() {
    (0, _deferred.clearDeferred)();
    closeEventStore();
    closeProjections();
  };

  return freeze({
    seed: seed,
    store: store,
    storeAndProject: storeAndProject,
    getProjection: getProjection,
    onProjectionChange: onProjectionChange,
    storeDeferred: storeDeferred,
    close: close,
    __getEventsOfTypes: function __getEventsOfTypes(types) {
      return getEvents('\x00', '\xff', function (_ref6) {
        var type = _ref6.type;
        return types.includes(type);
      });
    }
  });
};