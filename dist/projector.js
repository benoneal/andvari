'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.watch = exports.filterProjection = exports.getProjection = exports.project = exports.addProjector = exports.initProjections = undefined;

var _level = require('level');

var _level2 = _interopRequireDefault(_level);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var projector = void 0;

var keys = Object.keys;


var projectors = {};

var initProjections = exports.initProjections = function initProjections(path) {
  projector = (0, _level2.default)(path, { valueEncoding: 'json' });
};

var addProjector = exports.addProjector = function addProjector(namespace, lens) {
  projectors[namespace] = lens;
};

var createSnapshot = function createSnapshot(events, namespace, oldProjection) {
  projector.put(namespace, {
    namespace: namespace,
    timestamp: events[events.length - 1].timestamp,
    projection: events.reduce(projectors[namespace], oldProjection)
  });
};

var project = exports.project = function project(event, getEvents) {
  keys(projectors).forEach(function (namespace) {
    projector.get(namespace, function (err) {
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          timestamp = _ref.timestamp,
          projection = _ref.projection;

      if (err && !err.notFound) {
        throw err;
        return;
      }
      if (err && err.notFound || event.timestamp < timestamp) {
        return getEvents().then(function (events) {
          return createSnapshot(events, namespace);
        });
      }
      createSnapshot([event], namespace, projection);
    });
  });
};

var getProjection = exports.getProjection = function getProjection(namespace) {
  return new Promise(function (resolve, reject) {
    projector.get(namespace, function (err, _ref2) {
      var projection = _ref2.projection;

      if (err) return reject(err);
      resolve(projection);
    });
  });
};

var filterProjection = exports.filterProjection = function filterProjection(projectionNamespace, namespace, filter) {
  projector.on('put', function (snapshotNamespace, _ref3) {
    var timestamp = _ref3.timestamp,
        projection = _ref3.projection;

    if (snapshotNamespace !== projectionNamespace) return;
    projector.get(namespace, function (err) {
      if (err && !err.notFound) {
        throw err;
        return;
      }
      projector.put(namespace, { timestamp: timestamp, namespace: namespace, projection: filter(projection) });
    });
  }).on('error', reject);
};

var watch = exports.watch = function watch(namespace, timestamp) {
  return new Promise(function (resolve, reject) {
    projector.on('put', function (snapshotNamespace, _ref4) {
      var snapshotTimestamp = _ref4.timestamp,
          projection = _ref4.projection;
      return snapshotNamespace === namespace && snapshotTimestamp === timestamp && resolve(projection);
    }).on('error', reject);
  });
};