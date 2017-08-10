'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.clearDeferred = exports.deferredLens = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _v = require('uuid/v4');

var _v2 = _interopRequireDefault(_v);

var _deferredLens = require('./deferredLens');

var _deferredLens2 = _interopRequireDefault(_deferredLens);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var deferredLens = exports.deferredLens = _deferredLens2.default;

var values = Object.values,
    keys = Object.keys;
var isArray = Array.isArray;


var deferAction = function deferAction(delay, repeat) {
  return function (action) {
    return {
      type: _deferredLens.DEFERRED + ':queue',
      payload: {
        id: (0, _v2.default)(),
        deferUntil: Date.now() + delay,
        delay: delay,
        repeat: repeat,
        action: action
      }
    };
  };
};

var repeatDeferred = function repeatDeferred(id, deferUntil) {
  return {
    type: _deferredLens.DEFERRED + ':repeat',
    payload: { id: id, deferUntil: deferUntil }
  };
};

var deferredDone = function deferredDone(id) {
  return {
    type: _deferredLens.DEFERRED + ':done',
    payload: { id: id }
  };
};

var pending = {};

var processLater = function processLater(handleDeferred) {
  return function (_ref) {
    var id = _ref.id,
        deferUntil = _ref.deferUntil,
        action = _objectWithoutProperties(_ref, ['id', 'deferUntil']);

    if (!id || pending[id]) return;
    pending[id] = setTimeout(function () {
      handleDeferred(_extends({ id: id }, action));
      pending[id] = undefined;
    }, deferUntil - Date.now());
  };
};

var processQueue = function processQueue(handleDeferred) {
  return function () {
    var deferred = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return values(deferred).forEach(processLater(handleDeferred));
  };
};

var unwrap = function unwrap(store) {
  return function (_ref2) {
    var id = _ref2.id,
        delay = _ref2.delay,
        repeat = _ref2.repeat,
        repeats = _ref2.repeats,
        action = _ref2.action;

    store(action);
    var next = repeats < repeat ? repeatDeferred : deferredDone;
    store(next(id, Date.now() + delay));
  };
};

var processNew = function processNew(_ref3, _, store) {
  var prevProjection = _ref3.prevProjection,
      projection = _ref3.projection;

  var diff = values(projection).filter(function (_ref4) {
    var id = _ref4.id,
        repeats = _ref4.repeats;
    return !prevProjection[id] || repeats !== prevProjection[id].repeats;
  }).reduce(function (acc, deferred) {
    return _extends({}, acc, _defineProperty({}, deferred.id, deferred));
  }, {});
  processQueue(unwrap(store))(diff);
};

var clearDeferred = exports.clearDeferred = function clearDeferred() {
  return keys(pending).forEach(function (id) {
    clearTimeout(pending[id]);
    pending[id] = undefined;
  });
};

exports.default = function (_ref5) {
  var store = _ref5.store,
      onProjectionChange = _ref5.onProjectionChange,
      getProjection = _ref5.getProjection;

  getProjection(_deferredLens.DEFERRED).then(processQueue(unwrap(store)));

  onProjectionChange(_deferredLens.DEFERRED, processNew);

  var storeDeferred = function storeDeferred(actions, delay) {
    var repeat = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    if (!delay) throw new Error('Cannot create a deferred event without a delay');
    actions = isArray(actions) ? actions : [actions];
    return store(actions.map(deferAction(delay, repeat)));
  };

  return storeDeferred;
};