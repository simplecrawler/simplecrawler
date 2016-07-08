/*
 * Simplecrawler - queue module
 * https://github.com/cgiffard/node-simplecrawler
 *
 * Copyright (c) 2011-2016, Christopher Giffard
 *
 */

var fs = require("fs");

var allowedStatistics = [
    "requestTime",
    "requestLatency",
    "downloadTime",
    "contentLength",
    "actualDataSize"
];

function noop() {}

/**
 * Recursive function that compares immutable properties from the first object
 * to the same properties in the second one and returns true if all of the
 * properties matched. If not, it returns false.
 */
function compare (a, b) {
    var matches;

    for (var key in a) {
        if (a.hasOwnProperty(key)) {
            if (typeof a[key] === "object" && typeof b[key] === "object") {
                matches = compare(a[key], b[key]);
            } else if (matches === false) {
                return false;
            } else {
                matches = a[key] === b[key];
            }
        }
    }

    return matches;
}

var FetchQueue = function() {
    this.oldestUnfetchedIndex = 0;
    this.completeCache = 0;
    this.scanIndex = {};
};

module.exports = FetchQueue;

FetchQueue.prototype = [];
FetchQueue.prototype.add = function(queueItem, force, callback) {
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    function addToQueue() {
        queue.scanIndex[queueItem.url] = true;
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

// Check if an item already exists in the queue...
FetchQueue.prototype.exists = function(url, callback) {
    callback = callback instanceof Function ? callback : noop;

    if (this.scanIndex[url]) {
        callback(null, 1);
    } else {
        callback(null, 0);
    }
};

// Get item from queue
FetchQueue.prototype.get = function(index, callback) {
    callback = callback instanceof Function ? callback : noop;
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

// Get first unfetched item in the queue (and return its index)
FetchQueue.prototype.oldestUnfetchedItem = function(callback) {
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    for (var i = queue.oldestUnfetchedIndex; i < queue.length; i++) {
        if (queue[i].status === "queued") {
            queue.oldestUnfetchedIndex = i;
            callback(null, queue[i]);
            return;
        }
    }

    // When no unfetched queue items remain, we previously called back with an
    // error, but since it's not really an error condition, we opted to just
    // call back with (null, null) instead
    callback(null, null);
};

// Gets the maximum total request time, request latency, or download time
FetchQueue.prototype.max = function(statisticName, callback) {
    callback = callback instanceof Function ? callback : noop;

    var maximum = 0,
        queue = this;

    if (allowedStatistics.indexOf(statisticName) === -1) {
        return callback(new Error("Invalid statistic"));
    }

    queue.forEach(function(item) {
        if (item.fetched && item.stateData[statisticName] > maximum) {
            maximum = item.stateData[statisticName];
        }
    });

    callback(null, maximum);
};

// Gets the minimum total request time, request latency, or download time
FetchQueue.prototype.min = function(statisticName, callback) {
    callback = callback instanceof Function ? callback : noop;

    var minimum = Infinity,
        queue = this;

    if (allowedStatistics.indexOf(statisticName) === -1) {
        return callback(new Error("Invalid statistic"));
    }

    queue.forEach(function(item) {
        if (item.fetched && item.stateData[statisticName] < minimum) {
            minimum = item.stateData[statisticName];
        }
    });

    callback(null, minimum === Infinity ? 0 : minimum);
};

// Gets the minimum total request time, request latency, or download time
FetchQueue.prototype.avg = function(statisticName, callback) {
    callback = callback instanceof Function ? callback : noop;

    var sum = 0,
        count = 0,
        queue = this;

    if (allowedStatistics.indexOf(statisticName) === -1) {
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

FetchQueue.prototype.countItems = function(comparator, callback) {
    callback = callback instanceof Function ? callback : noop;

    this.filterItems(comparator, function(error, items) {
        if (error) {
            callback(error);
        } else {
            callback(null, items.length);
        }
    });
};

FetchQueue.prototype.filterItems = function(comparator, callback) {
    callback = callback instanceof Function ? callback : noop;

    var items = this.filter(function(queueItem) {
        return compare(comparator, queueItem);
    });

    callback(null, items);
};

// Gets the number of items in the queue
FetchQueue.prototype.getLength = function(callback) {
    callback(null, this.length);
};

// Writes the queue to disk
FetchQueue.prototype.freeze = function(filename, callback) {
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    // Re-queue in-progress items before freezing...
    queue.forEach(function(item) {
        if (item.fetched !== true) {
            item.status = "queued";
        }
    });

    fs.writeFile(filename, JSON.stringify(queue, null, 2), function(err) {
        callback(err, queue);
    });
};

// Reads the queue from disk
FetchQueue.prototype.defrost = function(filename, callback) {
    callback = callback instanceof Function ? callback : noop;
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

        queue.oldestUnfetchedIndex = Infinity;
        queue.scanIndex = {};

        for (var index in defrostedQueue) {
            if (defrostedQueue.hasOwnProperty(index) && !isNaN(index)) {
                var queueItem = defrostedQueue[index];
                queue.push(queueItem);

                if (queueItem.status !== "downloaded") {
                    queue.oldestUnfetchedIndex = Math.min(
                            queue.oldestUnfetchedIndex, index);
                }

                queue.scanIndex[queueItem.url] = true;
            }
        }

        if (queue.oldestUnfetchedIndex === Infinity) {
            queue.oldestUnfetchedIndex = 0;
        }

        callback(null, queue);
    });
};
