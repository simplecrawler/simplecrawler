// Simple crawler
// Christopher Giffard, 2011

// Queue Dependency
var FetchQueue = require("./queue.js").queue;
var EventEmitter = require('events').EventEmitter;
var http = require("http"),
	https = require("https");

// Crawler Constructor
var Crawler = function(domain,initialPath,interval) {
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

	// User Agent
	this.userAgent			= "Node/SimpleCrawler 0.1 (http://www.github.com/cgiffard/node-simplecrawler)";

	// Queue for requests - FetchQueue gives us stats and other sugar (but it's basically just an array)
	this.queue				= new FetchQueue();

	// Do we scan subdomains?
	this.scanSubdomains		= false;

	// Treat WWW subdomain the same as the main domain (and don't count it as a separate subdomain)
	this.ignoreWWWDomain	= true;
	
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

		// Rough scan for URLs
		var roughURLScan = resourceText.match(/(href|src)=['"]?([^"'\s>]+)/ig);

		// Clean links
		if (roughURLScan) {
			roughURLScan.forEach(function(URL) {
				URL = URL.replace(/^(href|src)=['"]?/i,"").replace(/^\s*/,"");
				
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

		return resources;
	}

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

			// If the domain matches, or is www (configuration allowing), or is a subdomain of the current domain (again, configuration allowing)
			// then add it to the queue
			if ((URLData.domain === crawler.domain) ||
				(crawler.ignoreWWWDomain && "www." + crawler.domain === URLData.domain) ||
				(crawler.scanSubdomains && URLData.domain.indexOf(crawler.domain) === URLData.domain.length - crawler.domain.length)) {
				
				try {
					if (crawler.queue.add(URLData.protocol,URLData.domain,URLData.port,URLData.path)) {
						crawler.emit("queueadd",crawler.queue[crawler.queue.length-1]);
					}
				} catch(error) {
					crawler.emit("error",error);
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

		// Load in request options
		requestOptions = {
			host: crawler.queue[index].domain,
			port: crawler.queue[index].port,
			path: crawler.queue[index].path,
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
					
					// We only process the item if it's of a valid mimetype
					if (mimeTypeSupported(contentType)) {
						queueLinkedItems(responseBuffer,crawler.queue[index]);
					} else {
						if (!contentType.match(/^image\//)) {
							console.log("DECIDED %s (%s) didn't have a good mimetype",crawler.queue[index].url,contentType);
						}
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

			// If we should queue a redirect
			} else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				crawler.queue[index].fetched = true;
				crawler.queue[index].status = "redirected";
				
				// Parse the redirect URL ready for adding to the queue...
				parsedURL = processURL(response.headers.location,crawler.queue[index]);
				
				// Emit redirect event
				crawler.emit("fetchredirect",crawler.queue[index],parsedURL,response);
				
				// Queue up new URL
				crawler.queue.add(parsedURL.protocol,parsedURL.domain,parsedURL.port,parsedURL.path);
				
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

// EXPORTS
exports.FetchQueue = FetchQueue;
exports.Crawler = Crawler;




