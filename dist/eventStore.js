'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _level = require('level');

var _level2 = _interopRequireDefault(_level);

var _nanoTime = require('nano-time');

var _nanoTime2 = _interopRequireDefault(_nanoTime);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var freeze = Object.freeze;
var isArray = Array.isArray;

exports.default = function (path) {
  var listeners = [];
  var eventStore = (0, _level2.default)(path, { valueEncoding: 'json' });

  var eventData = function eventData(events) {
    return events.map(function (_ref) {
      var value = _ref.value,
          event = _objectWithoutProperties(_ref, ['value']);

      return value ? value : event;
    });
  };

  eventStore.on('batch', function (events) {
    return listeners.forEach(function (listener) {
      return listener(eventData(events), getEvents);
    });
  });

  var createEvent = function createEvent() {
    var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        type = _ref2.type,
        payload = _ref2.payload;

    if (!type || !payload) throw new Error('Invalid Action provided. Must conform to shape: {type, payload}');
    return {
      type: type,
      payload: _extends({}, payload, {
        timestamp: Date.now()
      }),
      timestamp: (0, _nanoTime2.default)()
    };
  };

  var missingTimestamps = function missingTimestamps(events) {
    return events.map(function (_ref3) {
      var timestamp = _ref3.timestamp;
      return Boolean(timestamp);
    }).filter(function (x) {
      return !x;
    }).length > 0;
  };

  var append = function append(events) {
    return new Promise(function (resolve, reject) {
      events = isArray(events) ? events : [events];
      if (missingTimestamps(events)) reject(new Error('Cannot append Event: Missing timestamp'));
      if (!events.length) return resolve();
      eventStore.batch(events.map(function (value) {
        return {
          type: 'put',
          key: value.timestamp,
          value: value
        };
      }), function (err) {
        if (err) return reject(err);
        resolve(events[events.length - 1].timestamp);
      });
    });
  };

  var defaultFilter = function defaultFilter() {
    return true;
  };
  var getEvents = function getEvents() {
    var start = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '\x00';
    var end = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '\xff';
    var filter = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : defaultFilter;
    return new Promise(function (resolve, reject) {
      var events = [];
      eventStore.createValueStream({ start: start, end: end }).on('data', function (event) {
        return filter(event) && events.push(event);
      }).on('close', function () {
        return resolve(events);
      }).on('error', reject);
    });
  };

  var listen = function listen(fn) {
    return listeners.push(fn);
  };

  return freeze({
    createEvent: createEvent,
    append: append,
    getEvents: getEvents,
    listen: listen,
    close: function close() {
      return new Promise(function (resolve) {
        return eventStore.close(resolve);
      });
    }
  });
};