/**
 * @file simplecrawler's queue implementation. This also serves as a reference
 * for the queue interface, that can be implemented by third parties as well
 */

var fs   = require("fs"),
    util = require("util");

/**
 * Recursive function that compares immutable properties on two objects.
 * @private
 * @param {Object} a Source object that will be compared against
 * @param {Object} b Comparison object. The functions determines if all of this object's properties are the same on the first object.
 * @return {Boolean} Returns true if all of the properties on `b` matched a property on `a`. If not, it returns false.
 */
function compare(a, b) {
    for (var key in a) {
        if (a.hasOwnProperty(key)) {

            if (typeof a[key] !== typeof b[key]) {
                return false;
            }

            if (typeof a[key] === "object") {
                if (!compare(a[key], b[key])) {
                    return false;
                }
            } else if (a[key] !== b[key]) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Recursive function that takes two objects and updates the properties on the
 * first object based on the ones in the second. Basically, it's a recursive
 * version of Object.assign.
 */
function deepAssign(object, source) {
    for (var key in source) {
        if (source.hasOwnProperty(key)) {
            if (typeof object[key] === "object" && typeof source[key] === "object") {
                deepAssign(object[key], source[key]);
            } else {
                object[key] = source[key];
            }
        }
    }

    return object;
}

/**
 * QueueItems represent resources in the queue that have been fetched, or will be eventually.
 * @typedef {Object} QueueItem
 * @property {Number} id A unique ID assigned by the queue when the queue item is added
 * @property {String} url The complete, canonical URL of the resource
 * @property {String} protocol The protocol of the resource (http, https)
 * @property {String} host The full domain/hostname of the resource
 * @property {Number} port The port of the resource
 * @property {String} path The URL path, including the query string
 * @property {String} uriPath The URL path, excluding the query string
 * @property {Number} depth How many steps simplecrawler has taken from the initial page (which is depth 1) to this resource.
 * @property {String} referrer The URL of the resource where the URL of this queue item was discovered
 * @property {Boolean} fetched Has the request for this item been completed? You can monitor this as requests are processed.
 * @property {'queued'|'spooled'|'headers'|'downloaded'|'redirected'|'notfound'|'failed'} status The internal status of the item.
 * @property {Object} stateData An object containing state data and other information about the request.
 * @property {Number} stateData.requestLatency The time (in ms) taken for headers to be received after the request was made.
 * @property {Number} stateData.requestTime The total time (in ms) taken for the request (including download time.)
 * @property {Number} stateData.downloadTime The total time (in ms) taken for the resource to be downloaded.
 * @property {Number} stateData.contentLength The length (in bytes) of the returned content. Calculated based on the `content-length` header.
 * @property {String} stateData.contentType The MIME type of the content.
 * @property {Number} stateData.code The HTTP status code returned for the request. Note that this code is `600` if an error occurred in the client and a fetch operation could not take place successfully.
 * @property {Object} stateData.headers An object containing the header information returned by the server. This is the object node returns as part of the `response` object.
 * @property {Number} stateData.actualDataSize The length (in bytes) of the returned content. Calculated based on what is actually received, not the `content-length` header.
 * @property {Boolean} stateData.sentIncorrectSize True if the data length returned by the server did not match what we were told to expect by the `content-length` header.
 */

/**
 * FetchQueue handles {@link QueueItem}s and provides a few utility methods for querying them
 * @class
 */
var FetchQueue = function() {
    Array.call(this);

    /**
     * Speeds up {@link FetchQueue.oldestUnfetchedItem} by storing the index at
     * which the latest oldest unfetched queue item was found.
     * @name FetchQueue._oldestUnfetchedIndex
     * @private
     * @type {Number}
     */
    Object.defineProperty(this, "_oldestUnfetchedIndex", {
        enumerable: false,
        writable: true,
        value: 0
    });

    /**
     * Serves as a cache for what URL's have been fetched. Keys are URL's,
     * values are booleans.
     * @name FetchQueue._scanIndex
     * @private
     * @type {Object}
     */
    Object.defineProperty(this, "_scanIndex", {
        enumerable: false,
        writable: true,
        value: {}
    });

    /**
     * Controls what properties can be operated on with the
     * {@link FetchQueue#min}, {@link FetchQueue#avg} and {@link FetchQueue#max}
     * methods.
     * @name FetchQueue._allowedStatistics
     * @type {Array}
     */
    Object.defineProperty(this, "_allowedStatistics", {
        enumerable: false,
        writable: true,
        value: [
            "actualDataSize",
            "contentLength",
            "downloadTime",
            "requestLatency",
            "requestTime"
        ]
    });
};

util.inherits(FetchQueue, Array);

/**
 * Adds an item to the queue
 * @param {QueueItem} queueItem Queue item that is to be added to the queue
 * @param {Boolean} [force=false] If true, the queue item will be added regardless of whether it already exists in the queue
 * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null` and `queueItem` will be the item that was added to the queue. It's status property will have changed to `"queued"`.
 */
FetchQueue.prototype.add = function(queueItem, force, callback) {
    var queue = this;

    function addToQueue() {
        queue._scanIndex[queueItem.url] = true;
        queueItem.id = queue.length;
        queueItem.status = "queued";
        queue.push(queueItem);
        callback(null, queueItem);
    }

    queue.exists(queueItem.url, function(err, exists) {
        if (err) {
            callback(err);
        } else if (!exists) {
            addToQueue();
        } else if (force) {
            if (queue.indexOf(queueItem) > -1) {
                callback(new Error("Can't add a queueItem instance twice. You may create a new one from the same URL however."));
            } else {
                addToQueue();
            }
        } else {
            var error = new Error("Resource already exists in queue!");
            error.code = "DUPLICATE";
            callback(error);
        }
    });
};

/**
 * Checks if a URL already exists in the queue. Returns the number of occurences
 * of that URL.
 * @param {String} url URL to check the existence of in the queue
 * @param {Function} callback Gets two parameters, `error` and `count`. If the operation was successful, `error` will be `null`.
 */
FetchQueue.prototype.exists = function(url, callback) {
    if (this._scanIndex[url]) {
        callback(null, 1);
    } else {
        callback(null, 0);
    }
};

/**
 * Get a queue item by index
 * @param {Number} index The index of the queue item in the queue
 * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`.
 */
FetchQueue.prototype.get = function(index, callback) {
    var queue = this;

    queue.getLength(function(error, length) {
        if (error) {
            callback(error);
        } else if (index >= length) {
            callback(new RangeError("Index was greater than the queue's length"));
        } else {
            callback(null, queue[index]);
        }
    });
};

/**
 * Updates a queue item in the queue.
 * @param {Number} id ID of the queue item that is to be updated
 * @param {Object} updates Object that will be deeply assigned (as in `Object.assign`) to the queue item. That means that nested objects will also be resursively assigned.
 * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`.
 */
FetchQueue.prototype.update = function (id, updates, callback) {
    var queue = this,
        queueItem;

    for (var i = 0; i < queue.length; i++) {
        if (queue[i].id === id) {
            queueItem = queue[i];
            break;
        }
    }

    if (!queueItem) {
        callback(new Error("No queueItem found with that URL"));
    } else {
        deepAssign(queueItem, updates);
        callback(null, queueItem);
    }
};

/**
 * Gets the first unfetched item in the queue
 * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`. If there are unfetched queue items left, `queueItem` will be the oldest one found. If not, `queueItem` will be `null`.
 */
FetchQueue.prototype.oldestUnfetchedItem = function(callback) {
    var queue = this;

    for (var i = queue._oldestUnfetchedIndex; i < queue.length; i++) {
        if (queue[i].status === "queued") {
            queue._oldestUnfetchedIndex = i;
            callback(null, queue[i]);
            return;
        }
    }

    // When no unfetched queue items remain, we previously called back with an
    // error, but since it's not really an error condition, we opted to just
    // call back with (null, null) instead
    callback(null, null);
};

/**
 * Gets the maximum value of a stateData property from all the items in the
 * queue. This means you can eg. get the maximum request time, download size
 * etc.
 * @param {String} statisticName Can be any of the strings in {@link FetchQueue._allowedStatistics}
 * @param {Function} callback Gets two parameters, `error` and `max`. If the operation was successful, `error` will be `null`.
 */
FetchQueue.prototype.max = function(statisticName, callback) {
    var maximum = 0,
        queue = this;

    if (queue._allowedStatistics.indexOf(statisticName) === -1) {
        return callback(new Error("Invalid statistic"));
    }

    queue.forEach(function(item) {
        if (item.fetched && item.stateData[statisticName] > maximum) {
            maximum = item.stateData[statisticName];
        }
    });

    callback(null, maximum);
};

/**
 * Gets the minimum value of a stateData property from all the items in the
 * queue. This means you can eg. get the minimum request time, download size
 * etc.
 * @param {String} statisticName Can be any of the strings in {@link FetchQueue._allowedStatistics}
 * @param {Function} callback Gets two parameters, `error` and `min`. If the operation was successful, `error` will be `null`.

 */
FetchQueue.prototype.min = function(statisticName, callback) {
    var minimum = Infinity,
        queue = this;

    if (queue._allowedStatistics.indexOf(statisticName) === -1) {
        return callback(new Error("Invalid statistic"));
    }

    queue.forEach(function(item) {
        if (item.fetched && item.stateData[statisticName] < minimum) {
            minimum = item.stateData[statisticName];
        }
    });

    callback(null, minimum === Infinity ? 0 : minimum);
};

/**
 * Gets the average value of a stateData property from all the items in the
 * queue. This means you can eg. get the average request time, download size
 * etc.
 * @param {String} statisticName Can be any of the strings in {@link FetchQueue._allowedStatistics}
 * @param {Function} callback Gets two parameters, `error` and `avg`. If the operation was successful, `error` will be `null`.
 */
FetchQueue.prototype.avg = function(statisticName, callback) {
    var sum = 0,
        count = 0,
        queue = this;

    if (queue._allowedStatistics.indexOf(statisticName) === -1) {
        return callback(new Error("Invalid statistic"));
    }

    queue.forEach(function(item) {
        if (item.fetched && Number.isFinite(item.stateData[statisticName])) {
            sum += item.stateData[statisticName];
            count++;
        }
    });

    callback(null, sum / count);
};

/**
 * Counts the items in the queue that match a selector
 * @param {Object} comparator                      Comparator object used to filter items. Queue items that are counted need to match all the properties of this object.
 * @param {FetchQueue~countItemsCallback} callback
 * @param {Function} callback Gets two parameters, `error` and `items`. If the operation was successful, `error` will be `null` and `items` will be an array of QueueItems.
 */
FetchQueue.prototype.countItems = function(comparator, callback) {
    this.filterItems(comparator, function(error, items) {
        if (error) {
            callback(error);
        } else {
            callback(null, items.length);
        }
    });
};

/**
 * Filters and returns the items in the queue that match a selector
 * @param {Object} comparator Comparator object used to filter items. Queue items that are returned need to match all the properties of this object.
 * @param {Function} callback Gets two parameters, `error` and `items`. If the operation was successful, `error` will be `null` and `items` will be an array of QueueItems.
 */
FetchQueue.prototype.filterItems = function(comparator, callback) {
    var items = this.filter(function(queueItem) {
        return compare(comparator, queueItem);
    });

    callback(null, items);
};

/**
 * Gets the total number of queue items in the queue
 * @param {FetchQueue~getLengthCallback} callback
 * @param {Function} callback Gets two parameters, `error` and `length`. If the operation was successful, `error` will be `null`.
 */
FetchQueue.prototype.getLength = function(callback) {
    callback(null, this.length);
};

/**
 * Writes the queue to disk in a JSON file. This file can later be imported
 * using {@link FetchQueue#defrost}
 * @param {String} filename Filename passed directly to [fs.writeFile]{@link https://nodejs.org/api/fs.html#fs_fs_writefile_file_data_options_callback}
 * @param {Function} callback Gets a single `error` parameter. If the operation was successful, this parameter will be `null`.
 */
FetchQueue.prototype.freeze = function(filename, callback) {
    var queue = this;

    // Re-queue in-progress items before freezing...
    queue.forEach(function(item) {
        if (item.fetched !== true) {
            item.status = "queued";
        }
    });

    fs.writeFile(filename, JSON.stringify(queue, null, 2), function(err) {
        callback(err);
    });
};

/**
 * Import the queue from a frozen JSON file on disk.
 * @param {String} filename Filename passed directly to [fs.readFile]{@link https://nodejs.org/api/fs.html#fs_fs_readfile_file_options_callback}
 * @param {Function} callback Gets a single `error` parameter. If the operation was successful, this parameter will be `null`.
 */
FetchQueue.prototype.defrost = function(filename, callback) {
    var queue = this,
        defrostedQueue = [];

    fs.readFile(filename, function(err, fileData) {
        if (err) {
            return callback(err);
        }

        if (!fileData.toString("utf8").length) {
            return callback(new Error("Failed to defrost queue from zero-length JSON."));
        }

        try {
            defrostedQueue = JSON.parse(fileData.toString("utf8"));
        } catch (error) {
            return callback(error);
        }

        queue._oldestUnfetchedIndex = defrostedQueue.length - 1;
        queue._scanIndex = {};

        for (var i = 0; i < defrostedQueue.length; i++) {
            var queueItem = defrostedQueue[i];
            queue.push(queueItem);

            if (queueItem.status === "queued") {
                queue._oldestUnfetchedIndex = Math.min(queue._oldestUnfetchedIndex, i);
            }

            queue._scanIndex[queueItem.url] = true;
        }

        callback(null, queue);
    });
};

module.exports = FetchQueue;
