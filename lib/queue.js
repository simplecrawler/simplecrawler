// Simplecrawler - queue module
// Christopher Giffard, 2011
//
// http://www.github.com/cgiffard/node-simplecrawler


var fs = require("fs");

var allowedStatistics = [
	"requestTime",
	"requestLatency",
	"downloadTime",
	"contentLength",
	"actualDataSize"
];

var FetchQueue = function(){
	this.oldestUnfetchedIndex = 0;
	this.completeCache = 0;
	this.scanIndex = {};
};

module.exports = FetchQueue;

FetchQueue.prototype = [];
FetchQueue.prototype.add = function(protocol, domain, port, path, depth, callback) {

	// For legacy reasons
	if (depth instanceof Function) {
		callback = depth;
		depth = 1;
	}
	
	depth = depth || 1;
	callback = callback && callback instanceof Function ? callback : function(){};
	var self = this;

	// Ensure all variables conform to reasonable defaults
	protocol = protocol === "https" ? "https" : "http";

	if (isNaN(port) || !port) {
		return callback(new Error("Port must be numeric!"));
	}

	var url = protocol + "://" + domain + (port !== 80 ? ":" + port : "") + path;

	this.exists(protocol,domain,port,path,
		function(err,exists) {
			if (err) return callback(err);

			if (!exists) {
				var queueItem = {
					"url": url,
					"protocol": protocol,
					"host": domain,
					"port": port,
					"path": path,
					"depth": depth,
					"fetched": false,
					"status": "queued",
					"stateData": {}
				};

				self.push(queueItem);
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
	callback = callback && callback instanceof Function ? callback : function(){};

	port = (port !== 80 ? ":" + port : "");

	var url =
		(protocol + "://" + domain + port + path)
			.toLowerCase();

	if (!!this.scanIndex[url]) {
		callback(null, 1);
		return 1;
	} else {
		this.scanIndex[url] = true;
		callback(null, 0);
		return 0;
	}
};

// Get last item in queue...
FetchQueue.prototype.last = function(callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var item, self = this;
	item = self[self.length-1];
	callback(null, item);
	return item;
};

// Get item from queue
FetchQueue.prototype.get = function(id, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var item, self = this;

	if (!isNaN(id) && self.length > id) {
		item = self[id];
		callback(null, item);
		return item;
	}
};

// Get first unfetched item in the queue (and return its index)
FetchQueue.prototype.oldestUnfetchedItem = function(callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var item, self = this;

	for (var itemIndex = self.oldestUnfetchedIndex; itemIndex < self.length; itemIndex ++) {
		if (self[itemIndex].status === "queued") {
			self.oldestUnfetchedIndex = itemIndex;
			item = self[itemIndex];
			callback(null, item);
			return item;
		}
	}

	callback(new Error("No unfetched items remain."));
};

// Gets the maximum total request time, request latency, or download time
FetchQueue.prototype.max = function(statisticName, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var maxStatisticValue = 0, self = this;

	if (allowedStatistics.join().indexOf(statisticName) === -1) {
		// Not a recognised statistic!
		return callback(new Error("Invalid statistic."));
	}

	self.forEach(function(item) {
		if (item.fetched && item.stateData[statisticName] !== null && item.stateData[statisticName] > maxStatisticValue) {
			maxStatisticValue = item.stateData[statisticName];
		}
	});

	callback(null, maxStatisticValue);
	return maxStatisticValue;
};

// Gets the minimum total request time, request latency, or download time
FetchQueue.prototype.min = function(statisticName, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var minimum, minStatisticValue = Infinity, self = this;

	if (allowedStatistics.join().indexOf(statisticName) === -1) {
		// Not a recognised statistic!
		return callback(new Error("Invalid statistic."));
	}

	self.forEach(function(item) {
		if (item.fetched && item.stateData[statisticName] !== null && item.stateData[statisticName] < minStatisticValue) {
			minStatisticValue = item.stateData[statisticName];
		}
	});
	
	minimum = minStatisticValue === Infinity? 0 : minStatisticValue;
	callback(null, minimum);
	return minimum;
};

// Gets the minimum total request time, request latency, or download time
FetchQueue.prototype.avg = function(statisticName, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var average, NumberSum = 0, NumberCount = 0, self = this;

	if (allowedStatistics.join().indexOf(statisticName) === -1) {
		// Not a recognised statistic!
		return callback(new Error("Invalid statistic."));
	}

	self.forEach(function(item) {
		if (item.fetched && item.stateData[statisticName] !== null && !isNaN(item.stateData[statisticName])) {
			NumberSum += item.stateData[statisticName];
			NumberCount ++;
		}
	});
	average = NumberSum / NumberCount;
	callback(null, average);
	return average;
};

// Gets the number of requests which have been completed.
FetchQueue.prototype.complete = function(callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var NumberComplete = 0, self = this;

	self.forEach(function(item) {
		if (item.fetched) {
			NumberComplete ++;
		}
	});

	callback(null, NumberComplete);
	return NumberComplete;
};

// Gets the number of queue items with the given status
FetchQueue.prototype.countWithStatus = function(status, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var queueItemsMatched = 0, self = this;

	self.forEach(function(item) {
		if (item.status === status) {
			queueItemsMatched ++;
		}
	});

	callback(null,queueItemsMatched);
	return queueItemsMatched;
};

// Gets the number of queue items with the given status
FetchQueue.prototype.getWithStatus = function(status, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var subqueue = [], self = this;

	self.forEach(function(item,index) {
		if (item.status === status) {
			subqueue.push(item);
			subqueue[subqueue.length-1].queueIndex = index;
		}
	});

	callback(null,subqueue);
	return subqueue;
};

// Gets the number of requests which have failed for some reason
FetchQueue.prototype.errors = function(callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var total, failedCount, notFoundCount, self = this;

	failedCount = self.countWithStatus("failed");
	notFoundCount = self.countWithStatus("notfound");
	total = failedCount + notFoundCount;
	callback(null, total);
	return total;
};

// Gets the number of items in the queue
FetchQueue.prototype.getLength = function(callback) {
	return callback(null, this.length);
};

// Writes the queue to disk
FetchQueue.prototype.freeze = function(filename,callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var self = this;

	// Re-queue in-progress items before freezing...
	self.forEach(function(item) {
		if (item.fetched !== true) {
			item.status = "queued";
		}
	});

	fs.writeFile(filename,JSON.stringify(self),function(err) {
		callback(err, self);
	});
};

// Reads the queue from disk
FetchQueue.prototype.defrost = function(filename, callback) {
	callback = callback && callback instanceof Function ? callback : function(){};
	var fileData, self = this, defrostedQueue = [];

	fs.readFile(filename,function(err,fileData) {
		if (err) return callback(err);

		if (!fileData.toString("utf8").length) {
			return callback(new Error("Failed to defrost queue from zero-length JSON."));
		}

		try {
			defrostedQueue = JSON.parse(fileData.toString("utf8"));
		} catch(error) {
			return callback(error);
		}

		self.oldestUnfetchedIndex = Infinity;
		self.scanIndex = {};

		for (var index in defrostedQueue) {
			if (defrostedQueue.hasOwnProperty(index) && !isNaN(index)) {
				var queueItem = defrostedQueue[index];
				self.push(queueItem);

				if (queueItem.status !== "downloaded")
					self.oldestUnfetchedIndex = Math.min(
							self.oldestUnfetchedIndex, index);

				self.scanIndex[queueItem.url] = true;
			}
		}

		if (self.oldestUnfetchedIndex === Infinity)
			self.oldestUnfetchedIndex = 0;

		callback(null,self);
	});
};
