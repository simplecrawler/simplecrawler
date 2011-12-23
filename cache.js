// Simplecrawler - cache module
// Christopher Giffard, 2011
//
// http://www.github.com/cgiffard/node-simplecrawler

var fs = require("fs");
var EventEmitter = require('events').EventEmitter;

function Cache(cacheLocation) {
	this.datastore = [];
	
	
};

Cache.prototype = new EventEmitter();

// Set up data import and export functions
Cache.prototype.setCacheData = function(url,data,headers) {
	
};

Cache.prototype.getCacheData = function(url,data,headers) {
	
};


exports.Cache = Cache;