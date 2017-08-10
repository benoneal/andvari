'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _v = require('uuid/v4');

var _v2 = _interopRequireDefault(_v);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var keys = Object.keys,
    values = Object.values;
var max = Math.max;

exports.default = function (_ref) {
  var namespace = _ref.namespace,
      perform = _ref.perform,
      onSuccess = _ref.onSuccess,
      onError = _ref.onError,
      _ref$retries = _ref.retries,
      retries = _ref$retries === undefined ? 0 : _ref$retries,
      _ref$timeout = _ref.timeout,
      timeout = _ref$timeout === undefined ? 60000 : _ref$timeout,
      store = _ref.store,
      onProjectionChange = _ref.onProjectionChange,
      getProjection = _ref.getProjection;

  var processId = (0, _v2.default)();

  var createRetry = function createRetry(_ref2) {
    var id = _ref2.id;
    return { type: namespace + ':retry', payload: { id: id } };
  };
  var createSuccess = function createSuccess(_ref3) {
    var id = _ref3.id;
    return { type: namespace + ':success', payload: { id: id } };
  };
  var createError = function createError(_ref4) {
    var id = _ref4.id,
        error = _ref4.error;
    return { type: namespace + ':failure', payload: { id: id, error: error } };
  };
  var createLock = function createLock(_ref5) {
    var id = _ref5.id;
    return { type: namespace + ':lock', payload: { id: id, processorId: processId } };
  };
  var unlockStale = function unlockStale(_ref6) {
    var id = _ref6.id;
    return { type: namespace + ':unlock', payload: { id: id } };
  };

  var performWork = function performWork(_ref7) {
    var id = _ref7.id,
        processorId = _ref7.processorId,
        attempts = _ref7.attempts,
        locked = _objectWithoutProperties(_ref7, ['id', 'processorId', 'attempts']);

    perform(_extends({ id: id }, locked), getProjection).then(function (res) {
      store(createSuccess({ id: id }));
      onSuccess(_extends({ id: id }, locked, res), store);
    }).catch(function (error) {
      store(createError({ id: id, error: error }));
      if (attempts > retries) {
        onError(_extends({ id: id }, locked, { error: error }), store);
      }
    });
  };

  var handleFailed = function handleFailed(failed) {
    return failed.reduce(function (acc, _ref8) {
      var id = _ref8.id,
          attempts = _ref8.attempts,
          timestamp = _ref8.timestamp,
          event = _objectWithoutProperties(_ref8, ['id', 'attempts', 'timestamp']);

      if (Date.now() > timestamp + timeout) {
        onError(_extends({}, event, { id: id, timestamp: timestamp, error: 'timeout' }), store);
        return acc;
      } else if (attempts <= retries) {
        return [].concat(_toConsumableArray(acc), [createRetry({ id: id })]);
      }
    }, []);
  };

  var handleStaleLocks = function handleStaleLocks() {
    var stale = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    return store(stale.map(unlockStale));
  };

  var requestLock = function requestLock(pending) {
    return store(pending.map(createLock));
  };
  var processLocked = function processLocked(locked) {
    return locked.forEach(performWork);
  };
  var retryFailed = function retryFailed(failed) {
    return store(handleFailed(failed));
  };

  var processable = function processable(_ref9) {
    var processorId = _ref9.processorId;
    return !processorId || processorId === processId;
  };

  var changed = function changed() {
    var prev = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var current = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return keys(current).reduce(function (acc, id) {
      return !prev[id] && processable(current[id]) ? [].concat(_toConsumableArray(acc), [current[id]]) : acc;
    }, []);
  };

  var stale = function stale() {
    var prev = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var current = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return keys(current).reduce(function (acc, id) {
      return !!prev[id] && Date.now() > current[id].timestamp + timeout ? [].concat(_toConsumableArray(acc), [current[id]]) : acc;
    }, []);
  };

  var setToWork = function setToWork(handlers) {
    return function (_ref10) {
      var prev = _ref10.prevProjection,
          current = _ref10.projection;

      if (!prev || !current) return;
      keys(handlers).forEach(function (key) {
        return handlers[key](changed(prev[key], current[key]));
      });

      handleStaleLocks(stale(prev.locked, current.locked));
    };
  };

  var handlers = {
    pending: requestLock,
    locked: processLocked,
    failed: retryFailed
  };

  onProjectionChange(namespace, setToWork(handlers));
};