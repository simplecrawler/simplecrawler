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

var FetchQueue = function() {
    this.oldestUnfetchedIndex = 0;
    this.completeCache = 0;
    this.scanIndex = {};
};

module.exports = FetchQueue;

FetchQueue.prototype = [];
FetchQueue.prototype.add = function(protocol, domain, port, path, depth, callback) {
    depth = depth || 1;
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    // Ensure all variables conform to reasonable defaults
    protocol = protocol === "https" ? "https" : "http";

    if (isNaN(port) || !port) {
        return callback(new Error("Port must be numeric!"));
    }

    var url = protocol + "://" + domain + (port !== 80 ? ":" + port : "") + path;

    queue.exists(protocol, domain, port, path, function(err, exists) {
        if (err) {
            callback(err);
        } else if (!exists) {
            var queueItem = {
                url: url,
                protocol: protocol,
                host: domain,
                port: port,
                path: path,
                depth: depth,
                fetched: false,
                status: "queued",
                stateData: {}
            };

            queue.push(queueItem);
            callback(null, queueItem);
        } else {
            var error = new Error("Resource already exists in queue!");
            error.code = "DUP";

            callback(error);
        }
    });
};

// Check if an item already exists in the queue...
FetchQueue.prototype.exists = function(protocol, domain, port, path, callback) {
    callback = callback instanceof Function ? callback : noop;
    port = port !== 80 ? ":" + port : "";

    var url = (protocol + "://" + domain + port + path).toLowerCase();

    if (this.scanIndex[url]) {
        callback(null, 1);
    } else {
        this.scanIndex[url] = true;
        callback(null, 0);
    }
};

// Get item from queue
FetchQueue.prototype.get = function(index, callback) {
    callback = callback instanceof Function ? callback : noop;
    callback(null, this[index]);
};

// Get last item in queue...
FetchQueue.prototype.last = function(callback) {
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    queue.getLength(function(error, length) {
        if (error) {
            return callback(error);
        }

        queue.get(length - 1, function(error, item) {
            if (error) {
                callback(error);
            } else {
                callback(null, item);
            }
        });
    });
};

// Get first unfetched item in the queue (and return its index)
FetchQueue.prototype.oldestUnfetchedItem = function(callback) {
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    queue.getLength(function(error, length) {
        function getItem (itemIndex) {
            queue.get(itemIndex, function(error, item) {
                if (error) {
                    callback(error);
                } else if (item.status === "queued") {
                    queue.oldestUnfetchedIndex = itemIndex;
                    callback(null, item);
                } else if (itemIndex + 1 < length) {
                    getItem(itemIndex + 1);
                } else {
                    callback(new Error("No unfetched items remain."));
                }
            });
        }

        getItem(queue.oldestUnfetchedIndex);
    });
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

// Gets the number of requests which have been completed.
FetchQueue.prototype.complete = function(callback) {
    callback = callback instanceof Function ? callback : noop;

    var fetchedItems = this.filter(function(item) {
        return item.fetched;
    });

    callback(null, fetchedItems.length);
};

// Gets the number of queue items with the given status
FetchQueue.prototype.getWithStatus = function(status, callback) {
    callback = callback instanceof Function ? callback : noop;

    var subqueue = this.filter(function(item) {
        return item.status === status;
    });

    callback(null, subqueue);
};

// Gets the number of queue items with the given status
FetchQueue.prototype.countWithStatus = function(status, callback) {
    callback = callback instanceof Function ? callback : noop;

    this.getWithStatus(status, function(error, items) {
        if (error) {
            callback(error);
        } else {
            callback(null, items.length);
        }
    });
};

// Gets the number of requests which have failed for some reason
FetchQueue.prototype.errors = function(callback) {
    callback = callback instanceof Function ? callback : noop;
    var queue = this;

    queue.countWithStatus("failed", function(error, failedCount) {
        if (error) {
            return callback(error);
        }

        queue.countWithStatus("notfound", function(error, notfoundCount) {
            if (error) {
                return callback(error);
            }

            callback(null, failedCount + notfoundCount);
        });
    });
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
