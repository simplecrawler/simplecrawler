// Simplecrawler - cache module
// Christopher Giffard, 2011
//
// http://www.github.com/cgiffard/node-simplecrawler

var fs = require("fs");
var EventEmitter = require('events').EventEmitter;
var FilesystemBackend = require("./cache-backend-fs.js").backend;
// var RedisBackend = require("cache-backend-redis.js").backend;
// var MongoBackend = require("cache-backend-mongo.js").backend;

// Init cache wrapper for backend...
var Cache = function Cache(cacheLoadParameter,cacheBackend) {
	this.datastore = typeof(cacheBackend) === "object" ?
							new cacheBackend(cacheLoadParameter) :
							new FilesystemBackend(cacheLoadParameter);
	this.datastore.load();
};

Cache.prototype = new EventEmitter();

// Set up data import and export functions
Cache.prototype.setCacheData = function(queueObject,data,callback) {
	this.datastore.setItem(queueObject,data,callback);
	this.emit("setcache",queueObject,data);
};

Cache.prototype.getCacheData = function(queueObject,callback) {
	this.datastore.getItem(queueObject,callback);
};

Cache.prototype.saveCache = function() {
	if (this.datastore instanceof FilesystemBackend) {
		this.datastore.flushToDisk();
	} else {
		this.datastore.saveCache();
	}
};

exports.Cache = Cache;
exports.FilesystemBackend = FilesystemBackend;