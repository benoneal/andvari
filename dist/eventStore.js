'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getEvents = exports.append = exports.createEvent = exports.listen = exports.initEventStore = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _level = require('level');

var _level2 = _interopRequireDefault(_level);

var _nanoTime = require('nano-time');

var _nanoTime2 = _interopRequireDefault(_nanoTime);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var eventStore = void 0;

var initEventStore = exports.initEventStore = function initEventStore(path) {
  eventStore = (0, _level2.default)(path, { valueEncoding: 'json' });
};

var listen = exports.listen = function listen(fn) {
  return eventStore.on('put', function (_, event) {
    return fn(event, getEvents);
  });
};

var createEvent = exports.createEvent = function createEvent(_ref) {
  var type = _ref.type,
      payload = _ref.payload;
  return {
    type: type,
    payload: payload,
    timestamp: (0, _nanoTime2.default)()
  };
};

var append = function append(_ref2) {
  var timestamp = _ref2.timestamp,
      event = _objectWithoutProperties(_ref2, ['timestamp']);

  return new Promise(function (resolve, reject) {
    eventStore.put(timestamp, _extends({ timestamp: timestamp }, event), function (err) {
      if (err) reject(err);
      resolve(timestamp);
    });
  });
};

exports.append = append;
var getEvents = exports.getEvents = function getEvents() {
  var start = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '\x00';
  var end = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '\xff';
  return new Promise(function (resolve, reject) {
    var events = [];
    eventStore.createValueStream({ start: start, end: end }).on('data', function (event) {
      return events.push(event);
    }).on('close', function () {
      return resolve(events);
    }).on('error', reject);
  });
};