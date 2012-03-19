// Simplecrawler
// Christopher Giffard, 2011
//
// http://www.github.com/cgiffard/node-simplecrawler

// Queue Dependency
var FetchQueue = require("./queue.js").queue;
var Cache = require("./cache.js").Cache;
var EventEmitter = require('events').EventEmitter;
var http = require("http"),
	https = require("https");

// Crawler Constructor
var Crawler = function(domain,initialPath,interval) {
	// SETTINGS TO STUFF WITH (not here! Do it when you create a `new Crawler()`)
	// Domain to crawl
	this.domain				= domain || "";
	
	// Gotta start crawling *somewhere*
	this.initialPath		= initialPath || "/";
	this.initialPort		= 80;
	this.initialProtocol	= "http";

	// Internal 'tick' interval for spawning new requests (as long as concurrency is under cap)
	// One request will be spooled per tick, up to the concurrency threshold.
	this.interval			= interval || 250;

	// Maximum request concurrency. Be sensible. Five ties in with node's default maxSockets value.
	this.maxConcurrency		= 5;
	
	// Maximum time we'll wait for headers
	this.timeout			= 5 * 60 * 1000;

	// User Agent
	this.userAgent			= "Node/SimpleCrawler 0.1 (http://www.github.com/cgiffard/node-simplecrawler)";

	// Queue for requests - FetchQueue gives us stats and other sugar (but it's basically just an array)
	this.queue				= new FetchQueue();

	// Do we filter by domain?
	// Unless you want to be crawling the entire internet, I would recommend leaving this on!
	this.filterByDomain		= true;

	// Do we scan subdomains?
	this.scanSubdomains		= false;

	// Treat WWW subdomain the same as the main domain (and don't count it as a separate subdomain)
	this.ignoreWWWDomain	= true;
	
	// Or go even further and strip WWW subdomain from domains altogether!
	this.stripWWWDomain		= false;
	
	// Use simplecrawler's internal resource discovery function (switch it off if you'd prefer to discover and queue resources yourself!)
	this.discoverResources	= true;
	
	// Internal cachestore
	this.cache				= null;
	
	// Use an HTTP Proxy?
	this.useProxy			= false;
	this.proxyHostname		= "127.0.0.1";
	this.proxyPort			= 8123;
	
	// Supported Protocols
	this.allowedProtocols = [
		/^http(s)?\:/ig,					// HTTP & HTTPS
		/^(rss|atom|feed)(\+xml)?\:/ig		// RSS / XML
	];

	// Max file size to download/store
	this.maxResourceSize	= 1024 * 1024 * 16; // 16mb
	
	// Supported MIME-types
	// Matching MIME-types will be scanned for links
	this.supportedMimeTypes = [
		/^text\//i,
		/^application\/(rss)?[\+\/\-]?xml/i,
		/^application\/javascript/i,
		/^xml/i
	];
	
	// Download linked, but unsupported files (binary - images, documents, etc)
	this.downloadUnsupported = true;

	// STATE (AND OTHER) VARIABLES NOT TO STUFF WITH
	this.commenced = false;
	var crawler = this;
	var openRequests = 0;
	this.fetchConditions = [];

	// Initialise our queue by pushing the initial request data into it...
	this.queue.add(this.initialProtocol,this.domain,this.initialPort,this.initialPath);

	// Takes a URL, and extracts the protocol, domain, port, and resource
	function processURL(URL,URLContext) {
		var split, protocol = "http", domain = crawler.domain, port = 80, path = "/";
		var hostData = "", pathStack, relativePathStack, invalidPath = false;

		if (URLContext) {
			port = URLContext.port;
			domain = URLContext.domain;
			protocol = URLContext.protocol;
			path = URLContext.path;
		}

		// Trim URL
		URL = URL.replace(/^\s+/,"").replace(/\s+$/,"");

		// Check whether we're global, domain-absolute or relative
		if (URL.match(/^http(s)?:\/\//i)) {
			// We're global. Try and extract domain and port
			split = URL.replace(/^http(s)?:\/\//i,"").split(/\//g);
			hostData = split[0] && split[0].length ? split[0] : domain;

			if (hostData.split(":").length > 0) {
				hostData = hostData.split(":");
				domain = hostData[0];
				port = hostData.pop();
				port = isNaN(port) ? 80 : port;
			}

			if (URL.match(/^https:\/\//i)) {
				protocol = "https";
			}

			path = "/" + split.slice(1).join("/");
		

		} else if (URL.match(/^\//)) {
			// Absolute URL. Easy to handle!
			path = URL;

		} else {
			// Relative URL
			// Split into a stack and walk it up and down to calculate the absolute path
			
			var processedPathContext = URLContext.path;
			
			processedPathContext = processedPathContext.split(/\?/).shift();
			processedPathContext = processedPathContext.split(/\#/).shift();
			
			pathStack = processedPathContext.split("/");

			if (!URLContext.path.match(/\/\s*$/)) {
				pathStack = pathStack.slice(0,pathStack.length-1);
			}

			relativePathStack = URL.split(/\//g);

			invalidPath = false;
			relativePathStack.forEach(function(pathChunk) {
				if (!invalidPath) {
					if (pathChunk.match(/^\.\./)) {
						if (pathStack.length) {
							pathStack = pathStack.slice(0,pathStack.length-1);
						} else {
							// URL tries to go too deep. Ignore it - it's invalid.
							invalidPath = true;
						}
					} else if (pathChunk.match(/^\./)) {
						// Ignore this chunk - it just points to the same directory...
					} else {
						pathStack.push(pathChunk);
					}
				}
			});

			// This relative URL is junky. Kill it
			if (invalidPath) {
				return false;
			}
			
			// Filter blank path chunks
			pathStack = pathStack.filter(function(item) {
				return !!item.length;
			});

			path = "/" + pathStack.join("/");
		}
		
		// Strip the www subdomain out if required
		if (crawler.stripWWWDomain) {
			domain = domain.replace(/^www\./ig,"");
		}
		
		// Replace problem entities...
		path = path.replace(/&amp;/ig,"&");
		
		return {
			"protocol": protocol,
			"domain": domain,
			"port": port,
			"path": path
		};
	}
	
	// Make this function available externally
	crawler.processURL = processURL;
	
	// Determines whether the protocol is supported, given a URL
	function protocolSupported(URL) {
		var supported = false;
		
		if (URL.match(/^[a-z0-9]+\:/i)) {
			crawler.allowedProtocols.forEach(function(protocolCheck) {
				if (!!protocolCheck.exec(URL)) {
					supported = true;
				}
			});
			
			return supported;
		} else {
			return true;
		}
	}
	
	// Determines whether the mimetype is supported, given a... mimetype
	function mimeTypeSupported(MIMEType) {
		var supported = false;
		
		crawler.supportedMimeTypes.forEach(function(mimeCheck) {
			if (!!mimeCheck.exec(MIMEType)) {
				supported = true;
			}
		});
		
		return supported;
	
	}
	
	// Input some text/html and this function will return a bunch of URLs for queueing
	// (if there are actually any in the resource, otherwise it'll return an empty array)
	function discoverResources(resourceData,queueItem) {
		var resources = [], resourceText = resourceData.toString("utf8");
		
		// Clean links
		function cleanAndQueue(urlMatch) {
			if (urlMatch) {
				urlMatch.forEach(function(URL) {
					URL = URL.replace(/^(href|src)=['"]?/i,"").replace(/^\s*/,"");
					URL = URL.replace(/^url\(['"]*/i,"");
					URL = URL.replace(/^javascript\:[a-z0-9]+\(['"]/i,"");
					URL = URL.replace(/["'\)]$/i,"");
					URL = URL.split(/\s+/g).shift();
				
					if (URL.match(/^\s*#/)) {
						// Bookmark URL
						return false;
					}
				
					URL = URL.split("#").shift();

					if (URL.replace(/\s+/,"").length && protocolSupported(URL)) {
						if (!resources.reduce(function(prev,current) {
								return prev || current === URL;
							},false)) {
						
							resources.push(URL);
						}
					}
				});
			}
		}
		
		// Rough scan for URLs
		cleanAndQueue(resourceText.match(/(href\s?=\s?|src\s?=\s?|url\()['"]?([^"'\s>\)]+)/ig));
		cleanAndQueue(resourceText.match(/http(s)?\:\/\/[^?\s><\'\"]+/ig));
		cleanAndQueue(resourceText.match(/url\([^)]+/ig));
		
		// This might be a bit of a gamble... but get hard-coded strings out of javacript: URLs
		// They're often popup-image or preview windows, which would otherwise be unavailable to us
		cleanAndQueue(resourceText.match(/^javascript\:[a-z0-9]+\(['"][^'"\s]+/ig));
		
		return resources;
	}
	
	// Checks to see whether domain is valid for crawling.
	function domainValid(domain) {
				// If we're not filtering by domain, just return true.
		return	(!crawler.filterByDomain	||
				// Or if the domain is just the right one, return true
				(domain === crawler.domain)	||
				// Or if we're ignoring WWW subdomains, and both domains, less www. are the same, return true
				(crawler.ignoreWWWDomain && crawler.domain.replace(/^www\./i,"") === domain.replace(/^www\./i,"")) ||
				// Or if we're scanning subdomains, and this domain is a subdomain of the crawler's set domain, return true.
				(crawler.scanSubdomains && domain.indexOf(crawler.domain) === domain.length - crawler.domain.length));
	}
	
	// Make available externally to this scope
	crawler.isDomainValid = domainValid;

	// Input some text/html and this function will delegate resource discovery, check link validity
	// and queue up resources for downloading!
	function queueLinkedItems(resourceData,queueItem) {
		var urlList = discoverResources(resourceData,queueItem);

		urlList.forEach(function(url) {
			var URLData = processURL(url,queueItem);

			// URL Parser decided this URL was junky. Next please!
			if (!URLData) {
				return false;
			}
			
			// Pass this URL past fetch conditions to ensure the user thinks it's valid
			var fetchDenied = false;
			fetchDenied = crawler.fetchConditions.reduce(function(prev,callback) {
				return fetchDenied || !callback(URLData);
			},false);
					
			if (fetchDenied) {
				// Fetch Conditions conspired to block URL
				return false;
			}

			// Check the domain is valid before adding it to the queue
			if (domainValid(URLData.domain)) {
				try {
					if (crawler.queue.add(URLData.protocol,URLData.domain,URLData.port,URLData.path)) {
						crawler.emit("queueadd",crawler.queue[crawler.queue.length-1]);
					}
				} catch(error) {
					crawler.emit("queueerror",error,URLData);
				}
			}
		});
	}

	// Fetch a queue item
	function fetchQueueItem(index) {
		openRequests ++;
		
		// Emit fetchstart event
		crawler.emit("fetchstart",crawler.queue[index]);

		// Variable declarations
		var fetchData = false, requestOptions, clientRequest, timeCommenced, timeHeadersReceived, timeDataReceived, parsedURL;
		var responseBuffer, responseLength, responseLengthReceived, contentType;

		// Mark as spooled
		crawler.queue[index].status = "spooled";
		client = (crawler.queue[index].protocol === "https" ? https : http);

		// Extract request options from queue;
		var requestHost = crawler.queue[index].domain,
			requestPort = crawler.queue[index].port,
			requestPath = crawler.queue[index].path;
		
		// Are we passing through an HTTP proxy?
		if (crawler.useProxy) {
			requestHost = crawler.proxyHostname;
			requestPort = crawler.proxyPort;
			requestPath = crawler.queue[index].url;
		}
		
		// Load in request options
		requestOptions = {
			host: requestHost,
			port: requestPort,
			path: requestPath,
			headers: {
				"User-Agent": crawler.userAgent
			}
		};

		// Record what time we started this request
		timeCommenced = (new Date().getTime());

		// Get the resource!
		clientRequest = client.get(requestOptions,function(response) {
			var dataReceived = false;
			responseLengthReceived = 0;
			
			// Record what time we first received the header information
			timeHeadersReceived = (new Date().getTime());

			// Save timing and content some header information into queue
			crawler.queue[index].stateData.requestLatency = (timeHeadersReceived - timeCommenced);
			crawler.queue[index].stateData.requestTime = (timeHeadersReceived - timeCommenced);
			crawler.queue[index].stateData.contentLength = responseLength = parseInt(response.headers["content-length"],10);
			crawler.queue[index].stateData.contentType = contentType = response.headers["content-type"];
			crawler.queue[index].stateData.code = response.statusCode;

			// Save entire headers, in less scannable way
			crawler.queue[index].stateData.headers = response.headers;
			
			// Emit header receive event
			crawler.emit("fetchheaders",crawler.queue[index],response);
			
			// Ensure response length is reasonable...
			responseLength = responseLength > 0 ? responseLength : crawler.maxResourceSize;
			crawler.queue[index].stateData.contentLength = responseLength;
			
			// Function for dealing with 200 responses
			function processReceivedData() {
				if (!crawler.queue[index].fetched) {
					timeDataReceived = (new Date().getTime());

					crawler.queue[index].fetched = true;
					crawler.queue[index].status = "downloaded";
					crawler.queue[index].stateData.downloadTime = (timeDataReceived - timeHeadersReceived);
					crawler.queue[index].stateData.requestTime = (timeDataReceived - timeCommenced);
					crawler.queue[index].stateData.actualDataSize = responseBuffer.length;
					crawler.queue[index].stateData.sentIncorrectSize = responseBuffer.length !== responseLength;
					
					crawler.emit("fetchcomplete",crawler.queue[index],responseBuffer,response);
					
					// First, save item to cache (if we're using a cache!)
					if (crawler.cache !== null && crawler.cache.setCacheData instanceof Function) {
						crawler.cache.setCacheData(crawler.queue[index],responseBuffer);
					}
					
					// We only process the item if it's of a valid mimetype
					// and only if the crawler is set to discover its own resources
					if (mimeTypeSupported(contentType) && crawler.discoverResources) {
						queueLinkedItems(responseBuffer,crawler.queue[index]);
					}
					
					openRequests --;
				}
			}
			
			function receiveData(chunk) {
				if (chunk && chunk.length && !dataReceived) {
					if (responseLengthReceived + chunk.length > responseBuffer.length) {
						// Oh dear. We've been sent more data than we were initially told.
						// This could be a mis-calculation, or a streaming resource.
						// Let's increase the size of our buffer to match, as long as it isn't
						// larger than our maximum resource size.
						
						if (responseLengthReceived + chunk.length <= crawler.maxResourceSize) {
							// Start by creating a new buffer, which will be our main buffer going forward...
							var tmpNewBuffer = new Buffer(responseLengthReceived + chunk.length);
						
							// Copy all our old data into it...
							responseBuffer.copy(tmpNewBuffer,0,0,responseBuffer.length);
						
							// And now the new chunk
							chunk.copy(tmpNewBuffer,responseBuffer.length,0,chunk.length);
						
							// And now make the response buffer our new buffer, leaving the original for GC
							responseBuffer = tmpNewBuffer;
							
						} else {
							// Oh dear oh dear! The response is not only more data than we were initially told,
							// but it also exceeds the maximum amount of data we're prepared to download per resource.
							// Throw error event and ignore.
							//
							// We'll then deal with the data that we have.
							
							crawler.emit("fetchdataerror",crawler.queue[index],response);
						}
					} else {
						// Copy the chunk data into our main buffer
						chunk.copy(responseBuffer,responseLengthReceived,0,chunk.length);
					}
					
					// Increment our data received counter
					responseLengthReceived += chunk.length;
				}
				

				if ((responseLengthReceived >= responseLength || response.complete) && !dataReceived) {
					// Slice the buffer to chop off any unused space
					responseBuffer = responseBuffer.slice(0,responseLengthReceived);
					
					dataReceived = true;
					processReceivedData();
				}
			}

			// If we should just go ahead and get the data
			if (response.statusCode >= 200 && response.statusCode < 300 && responseLength <= crawler.maxResourceSize) {
				crawler.queue[index].status = "headers";
				
				// Create a buffer with our response length
				responseBuffer = new Buffer(responseLength);
				
				response.on("data",receiveData);
				response.on("end",receiveData);
			
			// We've got a not-modified response back
			} else if (response.statusCode === 304) {
				
				if (crawler.cache !== null && crawler.cache.getCacheData) {
					// We've got access to a cache
					crawler.cache.getCacheData(crawler.queue[index],function(cacheObject) {
						crawler.emit("notmodified",crawler.queue[index],response,cacheObject);
					});
				} else {
					// Emit notmodified event. We don't have a cache available, so we don't send any data.
					crawler.emit("notmodified",crawler.queue[index],response);
				}
				
			// If we should queue a redirect
			} else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "redirected";
				
				// Parse the redirect URL ready for adding to the queue...
				parsedURL = processURL(response.headers.location,crawler.queue[index]);
				
				// Emit redirect event
				crawler.emit("fetchredirect",crawler.queue[index],parsedURL,response);
				
				// If we're permitted to talk to the domain...
				if (domainValid(parsedURL.domain)) {
					// ...then queue up the new URL!
					try {
						if (crawler.queue.add(parsedURL.protocol,parsedURL.domain,parsedURL.port,parsedURL.path)) {
							crawler.emit("queueadd",crawler.queue[crawler.queue.length-1]);
						}
					} catch(error) {
						crawler.emit("queueerror",error,parsedURL);
					}
				}
				
				openRequests --;
			// Ignore this request, but record that we had a 404
			} else if (response.statusCode === 404) {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "notfound";
				
				// Emit 404 event
				crawler.emit("fetch404",crawler.queue[index],response);
				
				openRequests --;
			// And oh dear. Handle this one as well. (other 400s, 500s, etc)
			} else {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "failed";
				
				// Emit 5xx / 4xx event
				crawler.emit("fetcherror",crawler.queue[index],response);
				
				openRequests --;
			}
		});

		clientRequest.on("error",function(errorData) {
			openRequests --;
			
			// Emit 5xx / 4xx event
			crawler.emit("fetchclienterror",crawler.queue[index],errorData);

			crawler.queue[index].fetched = true;
			crawler.queue[index].stateData.code = 599;
			crawler.queue[index].status = "failed";
		});
	}

	// Get first unfetched item in the queue (and return its index)
	function getNextQueueItem() {
		return crawler.queue.reduce(function(prev,current,index) {
			return (!isNaN(prev) ? prev : null) || (current.status === "queued" ? index : null);
		},null);
	}

	// Crawl init
	this.crawl = function() {
		var pendingCount = crawler.queue.countWithStatus("queued");
		var currentFetchIndex;

		if (pendingCount && openRequests < crawler.maxConcurrency) {
			currentFetchIndex = getNextQueueItem();
			
			if (currentFetchIndex !== null) {
				fetchQueueItem(currentFetchIndex);
			}
		} else if (openRequests === 0) {
			crawler.emit("complete");
			crawler.stop();
		}
	};
};

Crawler.prototype = new EventEmitter();

Crawler.prototype.start = function() {
	this.crawlIntervalID = setInterval(this.crawl,this.interval);
	this.crawl();
	this.running = true;
};

Crawler.prototype.stop = function() {
	clearInterval(this.crawlIntervalID);
	this.running = false;
};

Crawler.prototype.addFetchCondition = function(callback) {
	if (callback instanceof Function) {
		this.fetchConditions.push(callback);
		return this.fetchConditions.length - 1;
	} else {
		throw new Error("Fetch Condition must be a function.");
	}
}

Crawler.prototype.removeFetchCondition = function(index) {
	if (this.fetchConditions[index] && this.fetchConditions[index] instanceof Function) {
		var tmpArray = this.fetchConditions.slice(0,index);
			tmpArray = this.fetchConditions.length-1 > index ? tmpArray.concat(this.fetchConditions.slice(0,index+1)) : tmpArray;
		
		this.fetchConditions = tmpArray;
		
		return true;
	} else {
		throw new Error("Unable to find indexed Fetch Condition.");
	}
}

// EXPORTS
exports.FetchQueue = FetchQueue;
exports.Cache = Cache;
exports.Crawler = Crawler;