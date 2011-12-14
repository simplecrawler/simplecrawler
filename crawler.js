// Simple crawler
// Christopher Giffard, 2011

// Queue Dependency
var FetchQueue = require("./queue.js").queue;
var EventEmitter = require('events').EventEmitter;
var http = require("http"),
	https = require("https");

// Crawler Constructor
var Crawler = function(domain,initialPath,interval,processor) {
	// SETTINGS TO STUFF WITH (not here! Do it when you create a `new Crawler()`)
	// Domain to crawl
	this.domain				= domain.replace(/^www\./i,"") || "";
	
	// Gotta start crawling *somewhere*
	this.initialPath		= initialPath || "/";
	this.initialPort		= 80;
	this.initialProtocol	= "http";

	// Internal 'tick' interval for spawning new requests (as long as concurrency is under cap)
	// One request will be spooled per tick, up to the concurrency threshold.
	this.interval			= interval || 250;

	// Maximum request concurrency. Be sensible. Five ties in with node's default maxSockets value.
	this.maxConcurrency		= 5;

	// User specified function for processing returned resource data
	this.processor			= processor && processor instanceof Function ? processor : function() {};

	// User Agent
	this.userAgent			= "Node/SimpleCrawler 0.1 (cgiffard,deewr)";

	// Queue for requests - FetchQueue gives us stats and other sugar (but it's basically just an array)
	this.queue				= new FetchQueue();

	// Do we scan subdomains?
	this.scanSubdomains		= false;

	// Treat WWW subdomain the same as the main domain (and don't count it as a separate subdomain)
	this.ignoreWWWDomain	= true;

	// STATE (AND OTHER) VARIABLES NOT TO STUFF WITH
	this.commenced = false;
	var crawler = this;
	var openRequests = 0;

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
			pathStack = URLContext.path.split("/");

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

		return {
			"protocol": protocol,
			"domain": domain,
			"port": port,
			"path": path
		};
	}

	// Input some text/html and this function will return a bunch of URLs for queueing
	// (if there are actually any in the resource, otherwise it'll return an empty array)
	function discoverResources(resourceData,resourceURL) {
		var resources = [];

		// do stuff
		// general idea at this stage is get all hrefs, srcs

		// Dumping something rough in here
		var roughURLScan = resourceData.match(/href=['"]?([^"'\s>]+)/ig);

		// Clean links
		if (roughURLScan) {
			roughURLScan.forEach(function(item) {
				item = item.replace(/^href=['"]?/i,"");
				
				if (item.match(/^\s*#/)) {
					// Bookmark URL
					return false;
				}
				
				item = item.split("#").shift();

				if (item.replace(/\s+/,"").length && !item.match(/^javascript:/) && !item.match(/^mailto:/) && !item.match(/\.css$/) && !item.match(/\.rtf$/) && !item.match(/\.doc$/) && !item.match(/\.docx$/) && !item.match(/\.pdf$/)) {
					if (!resources.reduce(function(prev,current) {
							return prev || current === item;
						},false)) {
						
						resources.push(item);
					}
				}
			});
		}

		return resources;
	}

	// Input some text/html and this function will delegate resource discovery, check link validity
	// and queue up resources for downloading!
	function queueLinkedItems(resourceData,resourceURL) {
		var urlList = discoverResources(resourceData,resourceURL);

		urlList.forEach(function(url) {
			var URLData = processURL(url,resourceURL);

			// URL Parser decided this URL was junky. Next please!
			if (!URLData) {
				return false;
			}

			// If the domain matches, or is www (configuration allowing), or is a subdomain of the current domain (again, configuration allowing)
			// then add it to the queue
			if ((URLData.domain === crawler.domain) ||
				(crawler.ignoreWWWDomain && "www." + crawler.domain === URLData.domain) ||
				(crawler.scanSubdomains && URLData.domain.indexOf(crawler.domain) === URLData.domain.length - crawler.domain.length)) {
				
				try {
					crawler.queue.add(URLData.protocol,URLData.domain,URLData.port,URLData.path);
					crawler.emit("queueadd");
				} catch(error) {
					crawler.emit("error",error);
				}
			}
		});
	}

	// Fetch a queue item
	function fetchQueueItem(index) {
		openRequests ++;

		// console.log("\tFETCHING %s",crawler.queue[index].url);

		// Variable declarations
		var fetchData = false, requestOptions, clientRequest, timeCommenced, timeHeadersReceived, timeDataReceived, parsedURL;
		var responseData = "", responseLength;

		// Mark as spooled
		crawler.queue[index].status = "spooled";
		client = (crawler.queue[index].protocol === "https" ? https : http);

		// Load in request options
		requestOptions = {
			host: crawler.queue[index].domain,
			port: crawler.queue[index].port,
			path: crawler.queue[index].path
		};

		// Record what time we started this request
		timeCommenced = (new Date().getTime());

		// Get the resource!
		clientRequest = client.get(requestOptions,function(response) {
			// Record what time we first received the header information
			timeHeadersReceived = (new Date().getTime());

			crawler.emit("headersreceived");

			// Save timing and content some header information into queue
			crawler.queue[index].stateData.requestLatency = (timeHeadersReceived - timeCommenced);
			crawler.queue[index].stateData.requestTime = (timeHeadersReceived - timeCommenced);
			crawler.queue[index].stateData.contentLength = responseLength = response.headers["content-length"];
			crawler.queue[index].stateData.code = response.statusCode;

			// Save entire headers, in less scannable way
			crawler.queue[index].stateData.headers = response.headers;

			// Function for dealing with 200 responses
			function processReceivedData() {
				if (!crawler.queue[index].fetched) {
					timeDataReceived = (new Date().getTime());

					crawler.queue[index].fetched = true;
					crawler.queue[index].status = "downloaded";
					crawler.queue[index].stateData.downloadTime = (timeDataReceived - timeHeadersReceived);
					crawler.queue[index].stateData.requestTime = (timeDataReceived - timeCommenced);

					crawler.emit("itemreceived");
					queueLinkedItems(responseData,crawler.queue[index]);

					// Try to run the user's processor. Wrap so we don't explode in the instance of an error
					if (crawler.processor instanceof Function) {
						try {
							crawler.processor(crawler.queue[index].url, index, responseData);
						} catch(error) {
							crawler.emit("error",error);
						}
					}

					openRequests --;
				}
			}

			// If we should just go ahead and get the data
			if (response.statusCode >= 200 && response.statusCode < 300) {
				crawler.queue[index].status = "headers";

				response.on("data",function(chunk) {
					responseData += chunk.toString("utf8");

					if (responseData.length >= responseLength) {
						processReceivedData();
					}
				});

				response.on("end",function(chunk) {
					processReceivedData();
				});

			// If we should queue a redirect
			} else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "redirected";

				// Parse the redirect URL ready for adding to the queue...
				parsedURL = processURL(response.headers.location,crawler.queue[index]);

				crawler.queue.add(parsedURL.protocol,parsedURL.domain,parsedURL.port,parsedURL.path);

				openRequests --;
			// Ignore this request, but record that we had a 404
			} else if (response.statusCode === 404) {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "notfound";
				openRequests --;
			// And oh dear. Handle this one as well. (other 400s, 500s, etc)
			} else {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "failed";
				openRequests --;
			}
		});

		clientRequest.on("error",function(errorData) {
			openRequests --;
			crawler.emit("requesterror",errorData);

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
		
		var incompleteCount =
				crawler.queue
					.reduce(function(prev,current) {
						return current.status !== "queued" && !current.fetched ? ++prev : prev;
					},0);
		
		var itemsComplete = crawler.queue.complete();
		var currentFetchIndex;

		var notfoundCount	= crawler.queue.countWithStatus("notfound");
		var redirectCount	= crawler.queue.countWithStatus("redirected");
		var failedCount		= crawler.queue.countWithStatus("failed");
		var downloadedCount	= crawler.queue.countWithStatus("downloaded");
		var headersCount	= crawler.queue.countWithStatus("headers");

		var queueLength = crawler.queue.length;
		
		console.log("CRAWLING, %d items unspooled, %d items incomplete, %d open requests, %d items complete, %d total. %d% Complete.",
						pendingCount,
						incompleteCount,
						openRequests,
						itemsComplete,
						queueLength,
						Math.round((itemsComplete/queueLength)*1000)/10);
		
		console.log("Downloaded: %d, %d% | Headers: %d, %d% | 404: %d, %d% | Redirect: %d, %d% | Failed: %d, %d%",
						downloadedCount,
						Math.round((downloadedCount/itemsComplete)*1000)/10,
						headersCount,
						Math.round((headersCount/queueLength)*1000)/10,
						notfoundCount,
						Math.round((notfoundCount/itemsComplete)*1000)/10,
						redirectCount,
						Math.round((redirectCount/itemsComplete)*1000)/10,
						failedCount,
						Math.round((failedCount/itemsComplete)*1000)/10);

		if (pendingCount && openRequests < crawler.maxConcurrency) {
			currentFetchIndex = getNextQueueItem();
			console.log("spooling ",currentFetchIndex);
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

// EXPORTS
exports.FetchQueue = FetchQueue;
exports.Crawler = Crawler;