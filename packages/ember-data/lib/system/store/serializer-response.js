var forEach = Ember.EnumerableUtils.forEach;
var map = Ember.EnumerableUtils.map;

/**
  This is a helper method that always returns a JSON-API Document.

  If the serializer doesn't have the `normalizeResponse` method `extract` will
  be called and the result gets passed to `normalizeSerializerPayload`.

  @method normalizeResponseHelper
  @param {DS.Serializer} serializer
  @param {DS.Store} store
  @param {subclass of DS.Model} modelClass
  @param {Object} payload
  @param {String|Number} id
  @param {String} requestType
  @return {Object} JSON-API Document
*/
export function normalizeResponseHelper(serializer, store, modelClass, payload, id, requestType) {
  var serializerPayload, normalizedSerializerPayload;

  if (serializer.normalizeResponse) {
    return serializer.normalizeResponse(store, modelClass, payload, id, requestType);
  }

  serializerPayload = serializer.extract(store, modelClass, payload, id, requestType);
  normalizedSerializerPayload = _normalizeSerializerPayload(modelClass, serializerPayload);

  return normalizedSerializerPayload;
}

/**
  Convert the payload from `serializer.extract` to a JSON-API Document.

  @method _normalizeSerializerPayload
  @private
  @param {subclass of DS.Model} modelClass
  @param {Object} payload
  @return {Object} JSON-API Document
*/
export function _normalizeSerializerPayload(modelClass, payload) {
  var normalizedPayload = {};

  normalizedPayload.data = null;
  normalizedPayload.included = [];
  normalizedPayload.meta = {};

  if (payload) {
    if (Ember.isArray(payload)) {
      normalizedPayload.data = map(payload, function(payload) {
        return _normalizeSerializerPayloadItem(modelClass, payload);
      });
    } else {
      normalizedPayload.data = _normalizeSerializerPayloadItem(modelClass, payload);
    }
  }

  return normalizedPayload;
}

/**
  Convert the payload representing a single record from `serializer.extract` to
  a JSON-API Resource Object.

  @method _normalizeSerializerPayloadItem
  @private
  @param {subclass of DS.Model} modelClass
  @param {Object} payload
  @return {Object} JSON-API Resource Object
*/
export function _normalizeSerializerPayloadItem(modelClass, itemPayload) {
  var item = {};

  item.id = '' + itemPayload.id;
  item.type = modelClass.modelName;
  item.attributes = {};
  item.relationships = {};

  modelClass.eachAttribute(function(name) {
    if (itemPayload.hasOwnProperty(name)) {
      item.attributes[name] = itemPayload[name];
    }
  });

  modelClass.eachRelationship(function(key, relationshipMeta) {
    var relationship, value;

    if (itemPayload.hasOwnProperty(key)) {
      relationship = {};
      value = itemPayload[key];

      let normalizeRelationshipData = function(value, relationshipMeta) {
        if (Ember.isNone(value)) {
          return null;
        }
        if (Ember.typeOf(value) === 'object') {
          if (value.id) {
            value.id = `${value.id}`;
          }
          return value;
        }
        return { id: `${value}`, type: relationshipMeta.type.modelName };
      };

      if (relationshipMeta.kind === 'belongsTo') {
        relationship.data = normalizeRelationshipData(value, relationshipMeta);
      } else if (relationshipMeta.kind === 'hasMany') {
        relationship.data = map(Ember.A(value), function(item) {
          return normalizeRelationshipData(item, relationshipMeta);
        });
      }
    }

    if (itemPayload.links && itemPayload.links.hasOwnProperty(key)) {
      relationship = relationship || {};
      value = itemPayload.links[key];

      relationship.links = {
        related: value
      };
    }

    if (relationship) {
      item.relationships[key] = relationship;
    }
  });

  return item;
}

/**
  Push a JSON-API Document to the store.

  This will push both primary data located in `data` and secondary data located
  in `included` (if present).

  @method pushPayload
  @param {DS.Store} store
  @param {Object} payload
  @return {DS.Model|Array} one or multiple records from `data`
*/
export function pushPayload(store, payload) {
  var result = pushPayloadData(store, payload);
  pushPayloadIncluded(store, payload);
  return result;
}

/**
  Push the primary data of a JSON-API Document to the store.

  This method only pushes the primary data located in `data`.

  @method pushPayloadData
  @param {DS.Store} store
  @param {Object} payload
  @return {DS.Model|Array} one or multiple records from `data`
*/
export function pushPayloadData(store, payload) {
  var result;
  if (payload && payload.data) {
    if (Ember.isArray(payload.data)) {
      result = _pushResourceObjects(store, payload.data);
    } else {
      result = _pushResourceObject(store, payload.data);
    }
  }
  return result;
}

/**
  Push the secondary data of a JSON-API Document to the store.

  This method only pushes the secondary data located in `included`.

  @method pushPayloadIncluded
  @param {DS.Store} store
  @param {Object} payload
  @return {Array} an array containing zero or more records from `included`
*/
export function pushPayloadIncluded(store, payload) {
  var result;
  if (payload && payload.included && Ember.isArray(payload.included)) {
    result = _pushResourceObjects(store, payload.included);
  }
  return result;
}

/**
  This method converts a JSON-API Resource Object to a format that DS.Store
  understands.

  TODO: This method works as an interim until DS.Store understands JSON-API.

  @method convertResourceObject
  @param {Object} payload
  @return {Object} an object formatted the way DS.Store understands
*/
export function convertResourceObject(payload) {
  if (!payload) {
    return payload;
  }

  var data = {
    id: payload.id,
    type: payload.type,
    links: {}
  };

  var attributeKeys = Ember.keys(payload.attributes);
  forEach(attributeKeys, function(key) {
    var attribute = payload.attributes[key];
    data[key] = attribute;
  });

  var relationshipKeys = Ember.keys(payload.relationships);
  forEach(relationshipKeys, function(key) {
    var relationship = payload.relationships[key];
    if (relationship.hasOwnProperty('data')) {
      data[key] = relationship.data;
    } else if (relationship.links && relationship.links.related) {
      data.links[key] = relationship.links.related;
    }
  });

  return data;
}

/**
  Push multiple JSON-API Resource Objects to the store.

  @method _pushResourceObjects
  @private
  @param {Array} resourceObjects
  @return {Array} an array containing zero or more records
*/
export function _pushResourceObjects(store, resourceObjects) {
  return map(resourceObjects, function(resourceObject) {
    return _pushResourceObject(store, resourceObject);
  });
}

/**
  Push a single JSON-API Resource Object to the store.

  @method _pushResourceObject
  @private
  @param {Object} resourceObject
  @return {DS.Model} a record
*/
export function _pushResourceObject(store, resourceObject) {
  return store.push(resourceObject.type, convertResourceObject(resourceObject));
}
