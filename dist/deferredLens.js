'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lens;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var DEFERRED = exports.DEFERRED = 'deferred';

var queue = function queue(projection, _ref) {
  var id = _ref.id,
      payload = _objectWithoutProperties(_ref, ['id']);

  return _extends({}, projection, _defineProperty({}, id, _extends({
    id: id
  }, payload, {
    repeats: 0
  })));
};

var done = function done(projection, _ref2) {
  var id = _ref2.id;

  var discard = projection[id],
      withoutDone = _objectWithoutProperties(projection, [id]);

  return withoutDone;
};

var repeat = function repeat(projection, _ref3) {
  var id = _ref3.id,
      deferUntil = _ref3.deferUntil;
  return _extends({}, projection, _defineProperty({}, id, _extends({}, projection[id], {
    id: id,
    deferUntil: deferUntil,
    repeats: projection[id].repeats + 1
  })));
};

var lens = (_lens = {}, _defineProperty(_lens, DEFERRED + ':queue', queue), _defineProperty(_lens, DEFERRED + ':done', done), _defineProperty(_lens, DEFERRED + ':repeat', repeat), _lens);

exports.default = function () {
  var projection = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var _ref4 = arguments[1];
  var type = _ref4.type,
      payload = _ref4.payload;
  return lens.hasOwnProperty(type) ? lens[type](projection, payload) : projection;
};