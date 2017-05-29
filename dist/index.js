'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _eventStore = require('./eventStore');

var _projector = require('./projector');

var keys = Object.keys;


var storeAndProject = function storeAndProject(action, projectionNamespace) {
  return new Promise(function (resolve, reject) {
    var event = (0, _eventStore.createEvent)(action);
    (0, _projector.watch)(projectionNamespace, event.timestamp).then(resolve).catch(reject);
    (0, _eventStore.append)(event).catch(reject);
  });
};

exports.default = function (_ref) {
  var eventStorePath = _ref.eventStorePath,
      projectionsPath = _ref.projectionsPath,
      projectors = _ref.projectors;

  if (!eventStorePath || !projectionsPath || !projectors) {
    throw new Error('Andvari requires eventStorePath, projectionsPath, and projectors map');
    return;
  }

  (0, _eventStore.initEventStore)(eventStorePath);
  (0, _projector.initProjections)(projectionsPath);

  (0, _eventStore.listen)(_projector.project);

  keys(projectors).forEach(function (projector) {
    return (0, _projector.addProjector)(projector, projectors[projector]);
  });

  return {
    storeAndProject: storeAndProject,
    getProjection: _projector.getProjection,
    getEvents: _eventStore.getEvents
  };
};