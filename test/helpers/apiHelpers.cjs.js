'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var isWhat = require('is-what');
var Firebase = _interopDefault(require('firebase/app'));
require('firebase/firestore');

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
  return typeof obj;
} : function (obj) {
  return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
};

/**
 * copyObj helper
 *
 * @author     Adam Dorling
 * @contact    https://codepen.io/naito
 */
function copyObj(obj) {
  var newObj = void 0;
  if ((typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) != 'object') {
    return obj;
  }
  if (!obj) {
    return obj;
  }
  if ('[object Object]' !== Object.prototype.toString.call(obj) || '[object Array]' !== Object.prototype.toString.call(obj)) {
    return JSON.parse(JSON.stringify(obj));
  }
  // Object is an Array
  if ('[object Array]' === Object.prototype.toString.call(obj)) {
    newObj = [];
    for (var i = 0, len = obj.length; i < len; i++) {
      newObj[i] = copyObj(obj[i]);
    }
    return newObj;
  }
  // Object is an Object
  newObj = {};
  for (var _i in obj) {
    if (obj.hasOwnProperty(_i)) {
      newObj[_i] = copyObj(obj[_i]);
    }
  }
  return newObj;
}

function retrievePaths(object, path, result) {
  if (!isWhat.isObject(object) || !Object.keys(object).length) {
    if (!path) return object;
    result[path] = object;
    return result;
  }
  return Object.keys(object).reduce(function (carry, key) {
    var pathUntilNow = path ? path + '.' : '';
    var newPath = pathUntilNow + key;
    var extra = retrievePaths(object[key], newPath, result);
    return Object.assign(carry, extra);
  }, {});
}

function flattenToPaths (object) {
  var result = {};
  return retrievePaths(object, null, result);
}

/**
 * Grab until the api limit (500), put the rest back in the syncStack.
 *
 * @param {string} syncStackProp the prop of _sync.syncStack[syncStackProp]
 * @param {number} count the current count
 * @param {number} maxCount the max count of the batch
 * @param {object} state the store's state, will be edited!
 * @returns {array} the targets for the batch. Add this array length to the count
 */
function grabUntilApiLimit(syncStackProp, count, maxCount, state) {
  var targets = copyObj(state._sync.syncStack[syncStackProp]);
  // Check if there are more than maxCount batch items already
  if (count >= maxCount) {
    // already at maxCount or more, leave items in syncstack, and don't add anything to batch
    targets = [];
  } else {
    // Convert to array if targets is an object (eg. updates)
    var targetIsObject = isWhat.isObject(targets);
    if (targetIsObject) {
      targets = Object.values(targets);
    }
    // Batch supports only until maxCount items
    var grabCount = maxCount - count;
    var targetsOK = targets.slice(0, grabCount);
    var targetsLeft = targets.slice(grabCount);
    // Put back the remaining items over maxCount
    if (targetIsObject) {
      targetsLeft = Object.values(targetsLeft).reduce(function (carry, update) {
        var id = update.id;
        carry[id] = update;
        return carry;
      }, {});
    }
    state._sync.syncStack[syncStackProp] = targetsLeft;
    // Define the items we'll add below
    targets = targetsOK;
  }
  return targets;
}

/**
 * Create a Firebase batch from a syncStack to be passed inside the state param.
 *
 * @export
 * @param {object} state The state which should have this prop: `_sync.syncStack[syncStackProp]`. syncStackProp can be 'updates', 'propDeletions', 'deletions', 'inserts'.
 * @param {object} dbRef The Firestore dbRef of the 'doc' or 'collection'
 * @param {Bool} collectionMode Very important: is the firebase dbRef a 'collection' or 'doc'?
 * @param {string} userId for `created_by`
 * @param {number} batchMaxCount The max count of the batch. Defaults to 500 as per Firestore documentation.
 * @returns {object} A Firebase firestore batch object.
 */
function makeBatchFromSyncstack(state, dbRef, collectionMode, userId) {
  var batchMaxCount = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 500;

  var batch = Firebase.firestore().batch();
  var count = 0;
  // Add 'updates' to batch
  var updates = grabUntilApiLimit('updates', count, batchMaxCount, state);
  count = count + updates.length;
  // Add to batch
  updates.forEach(function (item) {
    var id = item.id;
    var docRef = collectionMode ? dbRef.doc(id) : dbRef;
    var itemToUpdate = flattenToPaths(item);
    itemToUpdate.updated_at = Firebase.firestore.FieldValue.serverTimestamp();
    batch.update(docRef, itemToUpdate);
  });
  // Add 'propDeletions' to batch
  var propDeletions = grabUntilApiLimit('propDeletions', count, batchMaxCount, state);
  count = count + propDeletions.length;
  // Add to batch
  propDeletions.forEach(function (path) {
    var docRef = dbRef;
    if (collectionMode) {
      var id = path.substring(0, path.indexOf('.'));
      path = path.substring(path.indexOf('.') + 1);
      docRef = dbRef.doc(id);
    }
    var updateObj = {};
    updateObj[path] = Firebase.firestore.FieldValue.delete();
    updateObj.updated_at = Firebase.firestore.FieldValue.serverTimestamp();
    batch.update(docRef, updateObj);
  });
  // Add 'deletions' to batch
  var deletions = grabUntilApiLimit('deletions', count, batchMaxCount, state);
  count = count + deletions.length;
  // Add to batch
  deletions.forEach(function (id) {
    var docRef = dbRef.doc(id);
    batch.delete(docRef);
  });
  // Add 'inserts' to batch
  var inserts = grabUntilApiLimit('inserts', count, batchMaxCount, state);
  count = count + inserts.length;
  // Add to batch
  inserts.forEach(function (item) {
    item.created_at = Firebase.firestore.FieldValue.serverTimestamp();
    item.created_by = userId;
    var newRef = dbRef.doc(item.id);
    batch.set(newRef, item);
  });
  return batch;
}

exports.grabUntilApiLimit = grabUntilApiLimit;
exports.makeBatchFromSyncstack = makeBatchFromSyncstack;