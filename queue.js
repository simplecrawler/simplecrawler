// Simple queue for crawler
// Christopher Giffard 2011

var fs = require("fs");

var allowedStatistics = [
	"requestTime",
	"requestLatency",
	"downloadTime"
];

var FetchQueue = function(){};
FetchQueue.prototype = [];
FetchQueue.prototype.add = function(protocol,domain,port,path) {
	// Ensure all variables conform to reasonable defaults
	protocol = protocol === "https" ? "https" : "http";

	if (isNaN(port)) {
		throw Error("Port must be numeric!");
	}

	var url = protocol + "://" + domain + (port !== 80 ? ":" + port : "") + path;

	if (!this.reduce(function(prev, current, index, array) {
			return prev || String(current.url).toLowerCase() === String(url).toLowerCase();
		},false)) {

		this.push({
			"url": url,
			"protocol": protocol,
			"domain": domain,
			"port": port,
			"path": path,
			"fetched": false,
			"status": "queued",
			"stateData": {}
		});

		return true;
	} else {
		return false;
	}
};

// Gets the maximum total request time, request latency, or download time
FetchQueue.prototype.max = function(statisticName) {
	var maxStatisticValue = 0;

	if (allowedStatistics.join().indexOf(statisticName) === -1) {
		// Not a recognised statistic!
		return false;
	}
	
	this.forEach(function(item) {
		if (item.fetched && item.stateData[statisticName] !== null && item.stateData[statisticName] > maxStatisticValue) {
			maxStatisticValue = item.stateData[statisticName];
		}
	});

	return maxStatisticValue;
};

// Gets the minimum total request time, request latency, or download time
FetchQueue.prototype.min = function(statisticName) {
	var minStatisticValue = Infinity;

	if (allowedStatistics.join().indexOf(statisticName) === -1) {
		// Not a recognised statistic!
		return false;
	}
	
	this.forEach(function(item) {
		if (item.fetched && item.stateData[statisticName] !== null && item.stateData[statisticName] < minStatisticValue) {
			minStatisticValue = item.stateData[statisticName];
		}
	});

	return minStatisticValue === Infinity? 0 : minStatisticValue;
};

// Gets the minimum total request time, request latency, or download time
FetchQueue.prototype.avg = function(statisticName) {
	var NumberSum = 0, NumberCount = 0;

	if (allowedStatistics.join().indexOf(statisticName) === -1) {
		// Not a recognised statistic!
		return false;
	}
	
	this.forEach(function(item) {
		if (item.fetched && item.stateData[statisticName] !== null && !isNaN(item.stateData[statisticName])) {
			NumberSum += item.stateData[statisticName];
			NumberCount ++;
		}
	});

	return NumberSum / NumberCount;
};

// Gets the number of requests which have been completed.
FetchQueue.prototype.complete = function() {
	var NumberComplete = 0;

	this.forEach(function(item) {
		if (item.fetched) {
			NumberComplete ++;
		}
	});

	return NumberComplete;
};

// Gets the number of queue items with the given status
FetchQueue.prototype.countWithStatus = function(status) {
	var queueItemsMatched = 0;

	this.forEach(function(item) {
		if (item.status === status) {
			queueItemsMatched ++;
		}
	});

	return queueItemsMatched;
};

// Gets the number of queue items with the given status
FetchQueue.prototype.getWithStatus = function(status) {
	var subqueue = [];

	this.forEach(function(item,index) {
		if (item.status === status) {
			subqueue.push(item);
			subqueue[subqueue.length-1].queueIndex = index;
		}
	});

	return subqueue;
};

// Gets the number of requests which have failed for some reason
FetchQueue.prototype.errors = function() {
	return this.countWithStatus("failed") + this.countWithStatus("notfound");
};

// Writes the queue to disk
FetchQueue.prototype.freeze = function(filename) {
	// Re-queue items before freezing...
	this.forEach(function(item) {
		if (item.fetched !== true) {
			item.status = "queued";
		}
	});

	fs.writeFileSync(filename,JSON.stringify(this));
};

// Reads the queue from disk
FetchQueue.prototype.defrost = function(filename) {
	var fileData;
	try {
		if ((fileData = fs.readFileSync(filename))) {
			var defrostedQueue = JSON.parse(fileData.toString("utf8"));
			
			for (var index in defrostedQueue) {
				if (defrostedQueue.hasOwnProperty(index) && !isNaN(index)) {
					var queueItem = defrostedQueue[index];
					this.push(queueItem);
				}
			}
		}

		return true;
	} catch(error) {
		return false;
	}
};

exports.queue = FetchQueue;