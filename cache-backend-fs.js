// Simplecrawler - FS cache backend

var fs = require("fs");

// Constructor for filesystem cache backend
var backend = function backend(loadParameter) {
	this.loaded = false;
	this.index = [];
	this.location = typeof(loadParameter) === "string" && loadParameter.length > 0 ? loadParameter : process.cwd();
	this.location = this.location.match(/\/^/) ? this.location : this.location + "/";
};

backend.prototype.fileExists = function(location) {
	try {
		fs.statSync(location);
		return true;
	} catch (er) {
		return false;
	}
};

backend.prototype.isDirectory = function(location) {
	try {
		if (fs.statSync(location).isDirectory()) {
			return true;
		}

		return false;
	} catch (er) {
		return false;
	}
};

backend.prototype.load = function() {
	if (!this.fileExists(this.location) && this.isDirectory(this.location)) {
		throw new Error("Unable to verify cache location exists.");
	}

	try {
		var fileData;
		if ((fileData = fs.readFileSync(this.location + "cacheindex.json"))) {
			this.loaded = true;
		}
	} catch(error) {
		if (error.code === "ENOENT") {
			// Cache index doesn't exist. Assume this is a new cache.
			// Just leave the memory index empty for now.
			this.loaded = true;
		} else {
			throw error;
		}
	}

	// Flush store to disk when closing.
	process.on("exit",this.flushToDisk);
};

backend.prototype.flushToDisk = function() {
	
};

backend.prototype.setItem = function(queueObject,data,callback) {
	callback = callback instanceof Function ? callback : function(){};

	var backend = this;
	var pathStack = [queueObject.protocol, queueObject.domain, queueObject.port];
	pathStack = pathStack.concat(queueObject.path.split(/\/+/g));
	
	var writeFileData = function(currentPath,data) {
		fs.writeFile(currentPath,data,function(error) {
			if (error) throw error;
			fs.writeFile(currentPath + ".cacheData.json",function(error) {
				if (error) throw error;

				var cacheObject = {
					url: queueObject.url,
					etag: queueObject.headers.etag,
					lastModified: queueObject.headers['last-modified'],
					dataFile: currentPath,
					metaFile: currentPath + ".cacheData.json"
				};
						
				backend.index.push(cacheObject);
				callback(cacheObject);
			});
		});
	};

	pathStack.forEach(function(pathChunk,count) {
		var currentPath = backend.location + pathStack.slice(0,count+1).join("/");
		if (backend.fileExists(backend.location + pathStack.slice(0,count+1).join("/"))) {
			if (!backend.isDirectory(currentPath)) {
				if (count === pathStack.length -1) {
					// Just overwrite the file...
					writeFileData(currentPath,data);
				} else {
					console.log("WHOAH SHIT ALREADY EXIIIIIIISTS");
				}
			}
		} else {
			if (count === pathStack.length -1) {
				// Write the file data in
				writeFileData(currentPath,data);
			} else {
				fs.mkdirSync(currentPath);
			}
		}
	});
};

backend.prototype.getItem = function(queueObject,callback) {
	
};


exports.backend = backend;