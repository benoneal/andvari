'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var inProgressOrDone = function inProgressOrDone(_ref, id) {
  var _ref$locked = _ref.locked,
      locked = _ref$locked === undefined ? {} : _ref$locked,
      _ref$succeeded = _ref.succeeded,
      succeeded = _ref$succeeded === undefined ? {} : _ref$succeeded;
  return Boolean(locked[id] || succeeded[id]);
};

var keys = Object.keys;


var omit = function omit() {
  var obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var key = arguments[1];
  return keys(obj).reduce(function (acc, k) {
    return k === key ? acc : _extends({}, acc, _defineProperty({}, k, obj[k]));
  }, {});
};

var queue = function queue(projection, _ref2) {
  var id = _ref2.id,
      payload = _objectWithoutProperties(_ref2, ['id']);

  return inProgressOrDone(projection, id) ? projection : _extends({}, projection, {
    pending: _extends({}, projection.pending, _defineProperty({}, id, _extends({
      id: id
    }, payload, {
      attempts: 1
    }))),
    failed: omit(projection.failed, id)
  });
};

var lock = function lock(projection, _ref3) {
  var id = _ref3.id,
      processorId = _ref3.processorId;
  return !projection.pending[id] ? projection : _extends({}, projection, {
    locked: _extends({}, projection.locked, _defineProperty({}, id, _extends({}, projection.pending[id], {
      processorId: processorId
    }))),
    pending: omit(projection.pending, id)
  });
};

var success = function success(projection, _ref4) {
  var id = _ref4.id;
  return !projection.locked[id] ? projection : _extends({}, projection, {
    succeeded: _extends({}, projection.succeeded, _defineProperty({}, id, omit(projection.locked[id], 'processorId'))),
    locked: omit(projection.locked, id)
  });
};

var failure = function failure(projection, _ref5) {
  var id = _ref5.id,
      error = _ref5.error;
  return !projection.locked[id] ? projection : _extends({}, projection, {
    failed: _extends({}, projection.failed, _defineProperty({}, id, _extends({}, omit(projection.locked[id], 'processorId'), {
      error: error
    }))),
    locked: omit(projection.locked, id)
  });
};

var retry = function retry(projection, _ref6) {
  var id = _ref6.id,
      payload = _objectWithoutProperties(_ref6, ['id']);

  return !projection.failed[id] ? projection : _extends({}, projection, {
    pending: _extends({}, projection.pending, _defineProperty({}, id, _extends({}, projection.failed[id], {
      attempts: projection.failed[id].attempts + 1
    }))),
    failed: omit(projection.failed, id)
  });
};

var unlock = function unlock(projection, _ref7) {
  var id = _ref7.id,
      payload = _objectWithoutProperties(_ref7, ['id']);

  return !projection.locked[id] ? projection : _extends({}, projection, {
    pending: _extends({}, projection.pending, _defineProperty({}, id, omit(projection.locked[id], 'processorId'))),
    locked: omit(projection.locked, id)
  });
};

var initialProjection = {
  pending: {},
  locked: {},
  failed: {},
  succeeded: {}
};

exports.default = function (namespace) {
  var _lens;

  var lens = (_lens = {}, _defineProperty(_lens, namespace + ':queue', queue), _defineProperty(_lens, namespace + ':lock', lock), _defineProperty(_lens, namespace + ':success', success), _defineProperty(_lens, namespace + ':failure', failure), _defineProperty(_lens, namespace + ':retry', retry), _defineProperty(_lens, namespace + ':unlock', unlock), _lens);
  return function () {
    var projection = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : initialProjection;
    var _ref8 = arguments[1];
    var type = _ref8.type,
        payload = _ref8.payload;
    return lens.hasOwnProperty(type) ? lens[type](projection, payload) : projection;
  };
};