// Simplecrawler - FS cache backend
// Tries to ensure a local 'cache' of a website is as close as possible to a mirror of the website itself.
// The idea is that it is then possible to re-serve the website just using the cache.

var fs = require("fs");
var crypto = require("crypto");

// Factory for FSBackend
var backend = function backend(loadParameter) {
	return new FSBackend(loadParameter);
};

module.exports = backend;

// Constructor for filesystem cache backend
var FSBackend = function FSBackend(loadParameter) {
	this.loaded = false;
	this.index = [];
	this.location = typeof(loadParameter) === "string" && loadParameter.length > 0 ? loadParameter : process.cwd() + "/cache/";
	this.location = this.location.substr(this.location.length-1) === "/" ? this.location : this.location + "/";
};

// Function for sanitising paths
// We try to get the most understandable, file-system friendly paths we can.
// An extension is added if not present or inappropriate - if a better one can be determined.
// Querystrings are hashed to truncate without (hopefully) collision.

function sanitisePath(path,queueObject) {
	// Remove first slash (as we set one later.)
	path = path.replace(/^\//,"");

	var pathStack = [];

	// Trim whitespace. If no path is present - assume index.html.
	var sanitisedPath = path.length ? path.replace(/\s*$/ig,"") : "index.html";
	var headers = queueObject.stateData.headers, sanitisedPathParts;

	if (sanitisedPath.match(/\?/)) {
		sanitisedPathParts = sanitisedPath.split(/\?/g);
		var resource	= sanitisedPathParts.shift();
		var hashedQS	= crypto.createHash("sha1").update(sanitisedPathParts.join("?")).digest("hex");
		sanitisedPath	= resource + "?" + hashedQS;
	}

	pathStack = sanitisedPath.split(/\//g);
	pathStack = pathStack.map(function(pathChunk,count) {
		if (pathChunk.length >= 250) {
			return crypto.createHash("sha1").update(pathChunk).digest("hex");
		}

		return pathChunk;
	});

	sanitisedPath = pathStack.join("/");

	// Try to get a file extension for the file - for ease of identification
	// We run through this if we either:
	//	1) haven't got a file extension at all, or:
	//	2) have an HTML file without an HTML file extension (might be .php, .aspx, .do, or some other server-processed type)

	if (!sanitisedPath.match(/\.[a-z0-9]{1,6}$/i) || (headers["content-type"] && headers["content-type"].match(/text\/html/i) && !sanitisedPath.match(/\.htm[l]?$/i))) {
		var subMimeType = "";
		var mimeParts = [];

		if (headers["content-type"] && headers["content-type"].match(/text\/html/i)) {
			if (sanitisedPath.match(/\/$/)) {
				sanitisedPath += "index.html";
			} else {
				sanitisedPath += ".html";
			}

		} else if (headers["content-type"] && (mimeParts = headers["content-type"].match(/(image|video|audio|application)\/([a-z0-9]+)/i))) {
			subMimeType = mimeParts[2];
			sanitisedPath += "." + subMimeType;
		}
	}

	return sanitisedPath;
}

FSBackend.prototype.fileExists = function(location) {
	try {
		fs.statSync(location);
		return true;
	} catch (er) {
		return false;
	}
};

FSBackend.prototype.isDirectory = function(location) {
	try {
		if (fs.statSync(location).isDirectory()) {
			return true;
		}

		return false;
	} catch (er) {
		return false;
	}
};

FSBackend.prototype.load = function() {
	var backend = this;

	if (!this.fileExists(this.location) && this.isDirectory(this.location)) {
		throw new Error("Unable to verify cache location exists.");
	}

	try {
		var fileData;
		if ((fileData = fs.readFileSync(this.location + "cacheindex.json")) && fileData.length) {
			this.index = JSON.parse(fileData.toString("utf8"));
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
	process.on("exit",function() {
		backend.saveCache.apply(backend);
	});
};

FSBackend.prototype.saveCache = function(callback) {
	fs.writeFile(this.location + "cacheindex.json", JSON.stringify(this.index), callback);
};

FSBackend.prototype.setItem = function(queueObject,data,callback) {
	callback = callback instanceof Function ? callback : function(){};

	var backend = this;
	var pathStack = [queueObject.protocol, queueObject.host, queueObject.port];
	pathStack = pathStack.concat(sanitisePath(queueObject.path,queueObject).split(/\/+/g));

	var cacheItemExists = false;
	var firstInstanceIndex = NaN;
	if (this.index.reduce(function(prev,current,index,array) {
			firstInstanceIndex = !isNaN(firstInstanceIndex) ? firstInstanceIndex : index;
			return prev || current.url === queueObject.url;
		},false)) {
		cacheItemExists = true;
	}

	var writeFileData = function(currentPath,data) {
		fs.writeFile(currentPath,data,function(error) {
			if (error) throw error;
			fs.writeFile(currentPath + ".cacheData.json",JSON.stringify(queueObject),function(error) {
				if (error) throw error;

				var cacheObject = {
					url: queueObject.url,
					etag: queueObject.stateData.headers.etag,
					lastModified: queueObject.stateData.headers['last-modified'],
					dataFile: currentPath,
					metaFile: currentPath + ".cacheData.json"
				};

				if (cacheItemExists) {
					backend.index[firstInstanceIndex] = cacheObject;
				} else {
					backend.index.push(cacheObject);
				}

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
					throw new Error("Cache storage of resource (%s) blocked by file: %s",queueObject.url,currentPath);
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

FSBackend.prototype.getItem = function(queueObject,callback) {
	var cacheItemResult = this.index.filter(function(item) {
			return item.url === queueObject.url;
		});

	if (cacheItemResult.length) {
		var cacheItem = cacheItemResult.shift();

		callback({
			"url": cacheItem.url,
			"etag": cacheItem.etag,
			"lastModified": cacheItem.lastModified,
			"getData": function(callback) {
				fs.readFile(cacheItem.dataFile,function(error,data) {
					if (error) {
						callback(error);
						return false;
					}

					callback(null,data);
				});
			},
			"getMetadata": function(callback) {
				fs.readFile(cacheItem.metaFile,function(error,data) {
					if (error) {
						callback(error);
						return false;
					}

					callback(null,JSON.parse(data.toString("utf8")));
				});
			}
		});

	} else {
		callback(null);
	}

	return false;
};

