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
 * Creates a new queue
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
 * Called when {@link FetchQueue#add} returns a result
 * @callback FetchQueue~addCallback
 * @param {Error} [error]         If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {QueueItem} [queueItem] The queue item that was added to the queue. It's status property will have changed to `"queued"`.
 */

/**
 * Adds an item to the queue
 * @param {QueueItem} queueItem             Queue item that is to be added to the queue
 * @param {Boolean} [force=false]           If true, the queue item will be added regardless of whether it already exists in the queue
 * @param {FetchQueue~addCallback} callback
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
 * Called when {@link FetchQueue#exists} returns a result
 * @callback FetchQueue~existsCallback
 * @param {Error} [error]  If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Number} [count] The number of occurences in the queue of the provided URL.
 */

/**
 * Checks if a URL already exists in the queue. Returns the number of occurences
 * of that URL.
 * @param {String} url                         URL to check the existence of in the queue
 * @param {FetchQueue~existsCallback} callback
 */
FetchQueue.prototype.exists = function(url, callback) {
    if (this._scanIndex[url]) {
        callback(null, 1);
    } else {
        callback(null, 0);
    }
};

/**
 * Called when {@link FetchQueue#get} returns a result
 * @callback FetchQueue~getCallback
 * @param {Error} [error]         If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {QueueItem} [queueItem] The queue item found at that index in the queue.
 */

/**
 * Get a queue item by index
 * @param {Number} index                    The index of the queue item in the queue
 * @param {FetchQueue~getCallback} callback
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
 * Called when {@link FetchQueue#update} returns a result
 * @callback FetchQueue~updateCallback
 * @param {Error} [error]         If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {QueueItem} [queueItem] The updated queue item
 */

/**
 * Updates a queue item in the queue.
 * @param {Number} id                          ID of the queue item that is to be updated
 * @param {Object} updates                     Object that will be deeply assigned (as in `Object.assign`) to the queue item. That means that nested objects will also be resursively assigned.
 * @param {FetchQueue~updateCallback} callback
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
 * Called when {@link FetchQueue#oldestUnfetchedItem} returns a result
 * @callback FetchQueue~oldestUnfetchedItemCallback
 * @param {Error} [error]         If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {QueueItem} [queueItem] If there are unfetched queue items left, this will be the oldest one found. If not, this will be `null`.
 */

/**
 * Gets the first unfetched item in the queue
 * @param {FetchQueue~oldestUnfetchedItemCallback} callback
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
 * Called when {@link FetchQueue#max} returns a result
 * @callback FetchQueue~maxCallback
 * @param {Error} [error] If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Number} [max]  The maximum value of the property that was initially provided
 */

/**
 * Gets the maximum value of a stateData property from all the items in the
 * queue. This means you can eg. get the maximum request time, download size
 * etc.
 * @param {String} statisticName            Can be any of the strings in {@link FetchQueue._allowedStatistics}
 * @param {FetchQueue~maxCallback} callback
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
 * Called when {@link FetchQueue#min} returns a result
 * @callback FetchQueue~minCallback
 * @param {Error} [error] If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Number} [min]  The minimum value of the property that was initially provided
 */

/**
 * Gets the minimum value of a stateData property from all the items in the
 * queue. This means you can eg. get the minimum request time, download size
 * etc.
 * @param {String} statisticName            Can be any of the strings in {@link FetchQueue._allowedStatistics}
 * @param {FetchQueue~minCallback} callback
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
 * Called when {@link FetchQueue#avg} returns a result
 * @callback FetchQueue~avgCallback
 * @param {Error} [error] If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Number} [avg]  The average value of the property that was initially provided
 */

/**
 * Gets the average value of a stateData property from all the items in the
 * queue. This means you can eg. get the average request time, download size
 * etc.
 * @param {String} statisticName            Can be any of the strings in {@link FetchQueue._allowedStatistics}
 * @param {FetchQueue~avgCallback} callback
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
 * Called when {@link FetchQueue#countItems} returns a result
 * @callback FetchQueue~countItemsCallback
 * @param {Error} [error]  If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Number} [count] The number of items that matched the provided selector
 */

/**
 * Counts the items in the queue that match a selector
 * @param {Object} comparator                      Comparator object used to filter items. Queue items that are counted need to match all the properties of this object.
 * @param {FetchQueue~countItemsCallback} callback
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
 * Called when {@link FetchQueue#filterItems} returns a result
 * @callback FetchQueue~filterItemsCallback
 * @param {Error} [error]       If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {QueueItem[]} [items] The items that matched the provided selector
 */

/**
 * Filters and returns the items in the queue that match a selector
 * @param {Object} comparator                       Comparator object used to filter items. Queue items that are returned need to match all the properties of this object.
 * @param {FetchQueue~filterItemsCallback} callback
 */
FetchQueue.prototype.filterItems = function(comparator, callback) {
    var items = this.filter(function(queueItem) {
        return compare(comparator, queueItem);
    });

    callback(null, items);
};

/**
 * Called when {@link FetchQueue#getLength} returns a result
 * @callback FetchQueue~getLengthCallback
 * @param {Error} [error]  If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Number} [items] The total number of items in the queue
 */

/**
 * Gets the total number of queue items in the queue
 * @param {FetchQueue~getLengthCallback} callback
 */
FetchQueue.prototype.getLength = function(callback) {
    callback(null, this.length);
};

/**
 * Called when {@link FetchQueue#freeze} returns a result
 * @callback FetchQueue~freezeCallback
 * @param {Error} [error] If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 */

/**
 * Writes the queue to disk in a JSON file. This file can later be imported
 * using {@link FetchQueue#defrost}
 * @param {String} filename                    Filename passed directly to [fs.writeFile]{@link https://nodejs.org/api/fs.html#fs_fs_writefile_file_data_options_callback}
 * @param {FetchQueue~freezeCallback} callback
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
 * Called when {@link FetchQueue#defrost} returns a result
 * @callback FetchQueue~defrostCallback
 * @param {Error} [error] If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 */

/**
 * Import the queue from a frozen JSON file on disk.
 * @param {String} filename                     Filename passed directly to [fs.readFile]{@link https://nodejs.org/api/fs.html#fs_fs_readfile_file_options_callback}
 * @param {FetchQueue~defrostCallback} callback
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
