// Simplecrawler
// Christopher Giffard, 2011 - 2013+
//
// http://www.github.com/cgiffard/node-simplecrawler

// Queue Dependency
var FetchQueue		= require("./queue.js"),
	Cache			= require("./cache.js"),
	MetaInfo		= require("../package.json");

var http			= require("http"),
	https			= require("https"),
	EventEmitter	= require('events').EventEmitter,
	URI				= require("URIjs");

/*
	Public: Constructor for the crawler.
	
	host				-	Initial hostname/domain to begin crawling from. By
							default, the crawl will be locked to this hostname.
	initialPath			-	Initial path to begin crawling from.
	initialPort			-	Port to begin crawling from.
	interval			-	Request interval for the crawler. Defaults to 250ms.
	
	Examples

		var crawler = new Crawler("example.com","/",80,500);
		
		var crawler = new Crawler("example.com");

	Returns the crawler object which has now been constructed.

*/
var Crawler = function(host,initialPath,initialPort,interval) {
	// Data integrity checks
	if (initialPort && isNaN(initialPort))
		throw new Error("Port must be a number!");
	
	// SETTINGS TO STUFF WITH
	// (not here! Do it when you create a `new Crawler()`)
	
	// Domain to crawl
	this.host				= host || "";

	// Gotta start crawling *somewhere*
	this.initialPath		= initialPath || "/";
	this.initialPort		= initialPort || 80;
	this.initialProtocol	= "http";

	// Internal 'tick' interval for spawning new requests
	// (as long as concurrency is under cap)
	// One request will be spooled per tick, up to the concurrency threshold.
	this.interval			= interval || 250;
	
	// Maximum request concurrency. Be sensible. Five ties in with node's
	// default maxSockets value.
	this.maxConcurrency		= 5;

	// Maximum time we'll wait for headers
	this.timeout			= 5 * 60 * 1000;

	// User Agent
	this.userAgent =
			"Node/" + MetaInfo.name + " " + MetaInfo.version +
			" (" + MetaInfo.repository.url + ")";

	// Queue for requests - FetchQueue gives us stats and other sugar
	// (but it's basically just an array)
	this.queue				= new FetchQueue();
	
	// Do we filter by domain?
	// Unless you want to be crawling the entire internet, I would
	// recommend leaving this on!
	this.filterByDomain		= true;

	// Do we scan subdomains?
	this.scanSubdomains		= false;

	// Treat WWW subdomain the same as the main domain (and don't count
	// it as a separate subdomain)
	this.ignoreWWWDomain	= true;

	// Or go even further and strip WWW subdomain from domains altogether!
	this.stripWWWDomain		= false;

	// Internal cachestore
	this.cache				= null;

	// Use an HTTP Proxy?
	this.useProxy			= false;
	this.proxyHostname		= "127.0.0.1";
	this.proxyPort			= 8123;
	
	// Support for HTTP basic auth
	this.needsAuth = false;
	this.authUser = "";
	this.authPass = "";

	// Domain Whitelist
	// We allow domains to be whitelisted, so cross-domain requests can be made.
	this.domainWhitelist	= [];

	// Supported Protocols
	this.allowedProtocols = [
		/^http(s)?$/i,					// HTTP & HTTPS
		/^(rss|atom|feed)(\+xml)?$/i	// RSS / XML
	];

	// Max file size to download/store
	this.maxResourceSize	= 1024 * 1024 * 16; // 16mb

	// Supported MIME-types
	// Matching MIME-types will be scanned for links
	this.supportedMimeTypes = [
		/^text\//i,
		/^application\/(rss|html|xhtml)?[\+\/\-]?xml/i,
		/^application\/javascript/i,
		/^xml/i
	];

	// Download linked, but unsupported files (binary - images, documents, etc)
	this.downloadUnsupported = true;

	// STATE (AND OTHER) VARIABLES NOT TO STUFF WITH
	this.openRequests = 0;
	this.fetchConditions = [];
};

Crawler.prototype = new EventEmitter();

/*
	Public: Starts or resumes the crawl. If the queue is empty, it adds a new
	queue item from which to begin crawling based on the initial configuration
	of the crawler itself. The crawler waits for process.nextTick to begin, so
	handlers and other properties can be altered or addressed before the crawl
	commences.
	
	Examples

		crawler.start();

	Returns the crawler object, to enable chaining.

*/
Crawler.prototype.start = function() {
	var crawler = this;
	
	// only if we haven't already got stuff in our queue...
	if (!this.queue.length) {
		
		// Initialise our queue by pushing the initial request data into it...
		this.queue.add(
			this.initialProtocol,
			this.host,
			this.initialPort,
			this.initialPath,
			function(error) {
				if (error) throw error;
			});
	}
	
	this.crawlIntervalID = setInterval(function() {
		crawler.crawl.call(crawler);
	},this.interval);
	
	this.emit("crawlstart");
	this.running = true;
	
	// Now kick off the initial crawl
	process.nextTick(function() {
		crawler.crawl();
	});
	
	return this;
};

/*
	Public: Determines whether the protocol is supported, given a URL.

	URL	- URL with a protocol, for testing.
	
	Examples

		crawler.protocolSupported("http://google.com/") // true, by default
		crawler.protocolSupported("wss://google.com/") // false, by default

	Returns a boolean, true if the protocol is supported - false if not.

*/
Crawler.prototype.protocolSupported = function(URL) {
	var protocol;
	
	try {
		protocol = URI(URL).protocol();
		
	} catch(e) {
		// If URIjs died, we definitely /do not/ support the protocol.
		return false;
	}
	
	return this.allowedProtocols.reduce(function(prev,protocolCheck) {
		return prev || !!protocolCheck.exec(protocol);
	},false);
};

/*
	Public: Determines whether the mimetype is supported, given a mimetype

	MIMEType	- String containing MIME type to test

	Examples

		crawler.mimeTypeSupported("text/html") // true, by default
		crawler.mimeTypeSupported("application/octet-stream") // false, by default

	Returns a boolean, true if the MIME type is supported - false if not.

*/
Crawler.prototype.mimeTypeSupported = function(MIMEType) {
	
	return (
		this.supportedMimeTypes.reduce(function(prev,mimeCheck) {
			return prev || !!mimeCheck.exec(MIMEType);
		},false)
	);
};

/*
	Public: Extracts protocol, host, port and resource (path) given a URL string.

	URL	- String containing URL to process

	Examples

		var URLInfo = crawler.processURL("http://www.google.com/fish");

	Returns an object containing keys and values for "protocol", "host", "port",
	and "path".

*/
Crawler.prototype.processURL = function(URL,context) {
	var newURL;
	
	// If the URL didn't contain anything, don't fetch it.
	if (!URL.replace(/\s+/ig,"").length) return false;
	
	try {
		newURL = 
			URI(URL)
				.absoluteTo(context.url)
				.normalize();
	} catch(e) {
		// Couldn't process the URL, since URIjs choked on it.
		return false;
	}
	
	// simplecrawler uses slightly different terminology to URIjs. Sorry!
	return {
		"protocol": newURL.protocol() || "http",
		"host":		newURL.hostname(),
		"port":		newURL.port() || 80,
		"path":		newURL.resource()
	};
};

/*
	Public: Discovers linked resources in an HTML, XML or text document.

	resourceData	- String containing document with linked resources.
	queueItem		- Queue item corresponding to document being searched.

	Examples

		crawler.discoverResources("http://www.google.com")
		crawler.discoverResources("<a href='...'>test</a>")

	Returns an array of the (string) resource URLs found in the document. If none
	were found, the array will be empty.

*/
Crawler.prototype.discoverResources = function(resourceData,queueItem) {
	var resources = [],
		resourceText = resourceData.toString("utf8"),
		crawler = this;
	
	// Regular expressions for finding URL items in HTML and text
	var discoverRegex = [
		/(\shref\s?=\s?|\ssrc\s?=\s?|url\()['"]?([^"'\s>\)]+)/ig,
		/http(s)?\:\/\/[^?\s><\'\"]+/ig,
		/url\([^)]+/ig,
		
		// This might be a bit of a gamble... but get hard-coded
		// strings out of javacript: URLs. They're often popup-image
		// or preview windows, which would otherwise be unavailable to us.
		// Worst case scenario is we make some junky requests.
		/^javascript\:[a-z0-9]+\(['"][^'"\s]+/ig
	];
	
	function cleanURL(URL) {
		return URL
				.replace(/^(\s?href|\s?src)=['"]?/i,"")
				.replace(/^\s*/,"")
				.replace(/^url\(['"]*/i,"")
				.replace(/^javascript\:[a-z0-9]+\(['"]/i,"")
				.replace(/["'\)]$/i,"")
				.split(/\s+/g)
				.shift()
				.split("#")
				.shift();
	}
	
	// Clean links
	function cleanAndQueue(urlMatch) {
		if (!urlMatch) return [];
		
		return urlMatch
			.map(cleanURL)
			.reduce(function(list,URL) {
				
				// Ensure URL is whole and complete
				try {
					URL = URI(URL)
							.absoluteTo(queueItem.url)
							.normalize()
							.toString();
				} catch(e) {
					// But if URI.js couldn't parse it - nobody can!
					return list;
				}
				
				// If we hit an empty item, don't add return it
				if (!URL.length) return list;
				
				// If we don't support the protocol in question
				if (!crawler.protocolSupported(URL)) return list;
				
				// Does the item already exist in the list?
				if (resources.reduce(function(prev,current) {
						return prev || current === URL;
					},false))
						return list;

				return list.concat(URL);
			},[]);
	}
	
	// Rough scan for URLs
	return discoverRegex
		.reduce(function(list,regex) {
			return list.concat(
				cleanAndQueue(
					resourceText.match(regex)));
		},[]);
};

/*
	Public: Determines based on crawler state whether a domain is valid for
	crawling.

	host - String containing the hostname of the resource to be fetched.

	Examples

		crawler.domainValid("127.0.0.1");
		crawler.domainValid("google.com");
		crawler.domainValid("test.example.com");

	Returns an true if the domain is valid for crawling, false if not.

*/
Crawler.prototype.domainValid = function(host) {
	var crawler = this,
		crawlerHost = crawler.host;
	
	// If we're ignoring the WWW domain, remove the WWW for comparisons...
	if (crawler.ignoreWWWDomain)
		host = host.replace(/^www\./i,"");
	
	function domainInWhitelist(host) {
		
		// If there's no whitelist, or the whitelist is of zero length,
		// just return false.
		if (!crawler.domainWhitelist ||
			!crawler.domainWhitelist.length) return false;
		
		// Otherwise, scan through it.
		return !!crawler.domainWhitelist.reduce(function(prev,cur,index,array) {
			
			// If we already located the relevant domain in the whitelist...
			if (prev) return prev;
			
			// If the domain is just equal, return true.
			if (host === cur) return true;
			
			// If we're ignoring WWW subdomains, and both domains,
			// less www. are the same, return true.
			if (crawler.ignoreWWWDomain && host === cur.replace(/^www\./i,""))
				return true;
			
			// Otherwise, sorry. No dice.
			return false;
		},false);
	}

	// Checks if the first domain is a subdomain of the second
	function isSubdomainOf(subdomain,host) {
		
		// Comparisons must be case-insensitive
		subdomain	= subdomain.toLowerCase();
		host		= host.toLowerCase();
		
		// If we're ignoring www, remove it from both
		// (if www is the first domain component...)
		if (crawler.ignoreWWWDomain) {
			subdomain.replace(/^www./ig,"");
			host.replace(/^www./ig,"");
		}
		
		// They should be the same flipped around!
		return (
			subdomain.split("").reverse().join("").substr(0,host.length) ===
				host.split("").reverse().join(""));
	}

			// If we're not filtering by domain, just return true.
	return	(!crawler.filterByDomain	||
			// Or if the domain is just the right one, return true.
			(host === crawler.host)	||
			// Or if we're ignoring WWW subdomains, and both domains,
			// less www. are the same, return true.
			(
				crawler.ignoreWWWDomain &&
				crawler.host.replace(/^www\./i,"") ===
					host.replace(/^www\./i,"")
			) ||
			// Or if the domain in question exists in the domain whitelist,
			// return true.
			domainInWhitelist(host) ||
			// Or if we're scanning subdomains, and this domain is a subdomain
			// of the crawler's set domain, return true.
			(crawler.scanSubdomains && isSubdomainOf(host,crawler.host)));
};

/*
	Public: Given a text or HTML document, initiates discovery of linked
	resources in the text, and queues the resources if applicable. Emits
	"discoverycomplete". Not to be confused with `crawler.discoverResources`,
	despite the `discoverResources` function being the main component of this
	one, since this function queues the resources in addition to
	discovering them.

	resourceData	- Text document containing linked resource URLs.
	queueItem		- Queue item from which the resource document was derived.

	Examples

		crawler.queueLinkedItems("<a href='...'>test</a>",queueItem);

	Returns the crawler object for chaining.

*/
Crawler.prototype.queueLinkedItems = function(resourceData,queueItem) {
	var resources = this.discoverResources(resourceData,queueItem),
		crawler = this;

	// Emit discovered resources. ie: might be useful in building a graph of
	// page relationships.
	this.emit("discoverycomplete",queueItem,resources);

	resources.forEach(function(url){ crawler.queueURL(url,queueItem); });
	
	return this;
};

/*
	Public: Given a single URL, this function cleans, validates, parses it and
	adds it to the queue. This is the best and simplest way to add an item to
	the queue.

	url			- URL to be queued.
	queueItem	- Queue item from which the resource was linked.

	Examples

		crawler.queueURL("http://www.google.com/",queueItem);

	Returns a boolean value indicating whether the URL was successfully queued
	or not.

*/
Crawler.prototype.queueURL = function(url,queueItem) {
	var crawler = this;
	var parsedURL =
		typeof(url) === "object" ? url : crawler.processURL(url,queueItem);
	
	// URL Parser decided this URL was junky. Next please!
	if (!parsedURL) {
		return false;
	}

	// Pass this URL past fetch conditions to ensure the user thinks it's valid
	var fetchDenied = false;
	fetchDenied = crawler.fetchConditions.reduce(function(prev,callback) {
		return fetchDenied || !callback(parsedURL);
	},false);

	if (fetchDenied) {
		// Fetch Conditions conspired to block URL
		return false;
	}
	
	// Check the domain is valid before adding it to the queue
	if (crawler.domainValid(parsedURL.host)) {
		try {
			crawler.queue.add(
				parsedURL.protocol,
				parsedURL.host,
				parsedURL.port,
				parsedURL.path,
				function queueAddCallback(error,newQueueItem) {
					if (error) {
						// We received an error condition when adding the callback
						crawler.emit("queueerror",error,parsedURL);
					} else {
						crawler.emit("queueadd",newQueueItem,parsedURL);
						newQueueItem.referrer = queueItem.url;
					}
				}
			);
		} catch(error) {
			// If we caught an error, emit queueerror
			crawler.emit("queueerror",error,parsedURL);
			return false;
		}
	}
	
	return true;
};

/*
	Public: The guts of the crawler: takes a queue item and spools a request for
	it, downloads, caches, and fires events based on the result of the request.
	It kicks off resource discovery and queues any new resources found.
	
	queueItem	- Queue item to be fetched.
	
	Emits
		fetchstart
		fetchheaders
		fetchcomplete
		fetchdataerror
		notmodified
		fetchredirect
		fetch404
		fetcherror
		fetchclienterror

	Examples

		crawler.fetchQueueItem(queueItem);

	Returns the crawler object for chaining.

*/
Crawler.prototype.fetchQueueItem = function(queueItem) {
	var crawler = this;
	crawler.openRequests ++;

	// Emit fetchstart event
	crawler.emit("fetchstart",queueItem);

	// Variable declarations
	var fetchData = false,
		requestOptions,
		clientRequest,
		timeCommenced,
		timeHeadersReceived,
		timeDataReceived,
		parsedURL,
		responseBuffer,
		responseLength,
		responseLengthReceived,
		contentType;

	// Mark as spooled
	queueItem.status = "spooled";
	var client = (queueItem.protocol === "https" ? https : http);

	// Extract request options from queue;
	var requestHost = queueItem.host,
		requestPort = queueItem.port,
		requestPath = queueItem.path;

	// Are we passing through an HTTP proxy?
	if (crawler.useProxy) {
		requestHost = crawler.proxyHostname;
		requestPort = crawler.proxyPort;
		requestPath = queueItem.url;
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
	
	if(crawler.needsAuth) {
		var auth = crawler.authUser + ":" + crawler.authPass;
		
		// Generate auth header
		auth = 'Basic ' + (new Buffer(auth).toString('base64'));
		requestOptions.headers.Authorization = auth;
	}
	
	// Record what time we started this request
	timeCommenced = (new Date().getTime());

	// Get the resource!
	clientRequest = client.get(requestOptions,function(response) {
		var dataReceived = false,
			stateData = queueItem.stateData;
		
		responseLengthReceived = 0;

		// Record what time we first received the header information
		timeHeadersReceived = (new Date().getTime());

		responseLength = parseInt(response.headers["content-length"],10);
		responseLength = !isNaN(responseLength) ? responseLength : 0;

		// Save timing and content some header information into queue
		stateData.requestLatency	= (timeHeadersReceived - timeCommenced);
		stateData.requestTime		= (timeHeadersReceived - timeCommenced);
		stateData.contentLength		= responseLength;
		stateData.contentType		= contentType = response.headers["content-type"];
		stateData.code				= response.statusCode;

		// Save entire headers, in less scannable way
		stateData.headers			= response.headers;

		// Emit header receive event
		crawler.emit("fetchheaders",queueItem,response);

		// Ensure response length is reasonable...
		responseLength =
			responseLength > 0 ? responseLength : crawler.maxResourceSize;
		
		queueItem.stateData.contentLength = responseLength;

		// Function for dealing with 200 responses
		function processReceivedData() {
			if (queueItem.fetched) return;
			
			timeDataReceived = (new Date().getTime());

			queueItem.fetched = true;
			queueItem.status = "downloaded";
			
			// Save state information
			stateData.downloadTime		= (timeDataReceived - timeHeadersReceived);
			stateData.requestTime		= (timeDataReceived - timeCommenced);
			stateData.actualDataSize	= responseBuffer.length;
			stateData.sentIncorrectSize = responseBuffer.length !== responseLength;

			crawler.emit("fetchcomplete",queueItem,responseBuffer,response);

			// First, save item to cache (if we're using a cache!)
			if (crawler.cache !== null &&
				crawler.cache.setCacheData instanceof Function) {
				
				crawler.cache.setCacheData(queueItem,responseBuffer);
			}

			// We only process the item if it's of a valid mimetype
			// and only if the crawler is set to discover its own resources
			if (crawler.mimeTypeSupported(contentType) && crawler.discoverResources) {
				crawler.queueLinkedItems(responseBuffer,queueItem);
			}
			
			crawler.openRequests --;
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

						crawler.emit("fetchdataerror",queueItem,response);
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
			queueItem.status = "headers";
			
			// Create a buffer with our response length
			responseBuffer = new Buffer(responseLength);

			response.on("data",receiveData);
			response.on("end",receiveData);

		// We've got a not-modified response back
		} else if (response.statusCode === 304) {

			if (crawler.cache !== null && crawler.cache.getCacheData) {
				// We've got access to a cache
				crawler.cache.getCacheData(queueItem,function(cacheObject) {
					crawler.emit("notmodified",queueItem,response,cacheObject);
				});
			} else {
				// Emit notmodified event. We don't have a cache available, so we don't send any data.
				crawler.emit("notmodified",queueItem,response);
			}

		// If we should queue a redirect
		} else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
			queueItem.fetched = true;
			queueItem.status = "redirected";
			
			// Parse the redirect URL ready for adding to the queue...
			parsedURL = crawler.processURL(response.headers.location,queueItem);

			// Emit redirect event
			crawler.emit("fetchredirect",queueItem,parsedURL,response);

			// Clean URL, add to queue...
			crawler.queueURL(parsedURL,queueItem);

			crawler.openRequests --;

		// Ignore this request, but record that we had a 404
		} else if (response.statusCode === 404) {
			queueItem.fetched = true;
			queueItem.status = "notfound";

			// Emit 404 event
			crawler.emit("fetch404",queueItem,response);

			crawler.openRequests --;

		// And oh dear. Handle this one as well. (other 400s, 500s, etc)
		} else {
			queueItem.fetched = true;
			queueItem.status = "failed";

			// Emit 5xx / 4xx event
			crawler.emit("fetcherror",queueItem,response);

			crawler.openRequests --;
		}
	});

	clientRequest.on("error",function(errorData) {
		crawler.openRequests --;

		// Emit 5xx / 4xx event
		crawler.emit("fetchclienterror",queueItem,errorData);
		queueItem.fetched = true;
		queueItem.stateData.code = 599;
		queueItem.status = "failed";
	});
	
	return crawler;
};

/*
	Public: The main crawler runloop. Fires at the interval specified in the
	crawler configuration, when the crawl is running. May be manually fired.
	This function initiates fetching of a queue item if there are enough workers
	to do so and there are unfetched items in the queue.
	
	Examples

		crawler.crawl();

	Returns the crawler object for chaining.

*/
Crawler.prototype.crawl = function() {
	var crawler = this;
	
	if (crawler.openRequests > crawler.maxConcurrency) return;
	
	crawler.queue.oldestUnfetchedItem(function(err,queueItem) {
		if (queueItem) {
			crawler.fetchQueueItem(queueItem);
		} else if (crawler.openRequests === 0) {
			crawler.queue.complete(function(err,completeCount) {
				if (completeCount === crawler.queue.length) {
					crawler.emit("complete");
					crawler.stop();
				}
			});
		}
	});
	
	return crawler;
};

/*
	Public: Stops the crawler, terminating the crawl runloop.

	Examples

		crawler.stop();

	Returns the crawler object for chaining.

*/
Crawler.prototype.stop = function() {
	clearInterval(this.crawlIntervalID);
	this.running = false;
	return this;
};

/*
	Public: Given a function, this method adds it to an internal list maintained
	by the crawler to be executed against each URL to determine whether it should
	be fetched or not.

	callback -	Function to be called when evaluating a URL. This function is
				passed an object containing the protocol, hostname, port, and path
				of a resource to be fetched. It can determine whether it should
				be requested or not by returning a boolean - false for no, true
				for yes.

	Examples

		crawler.addFetchCondition(function(parsedURL) {
			return (parsedURL.host !== "evildomain.com");
		});

	Returns the ID of the fetch condition - used for removing it from the crawler
	later.

*/
Crawler.prototype.addFetchCondition = function(callback) {
	if (callback instanceof Function) {
		this.fetchConditions.push(callback);
		return this.fetchConditions.length - 1;
	} else {
		throw new Error("Fetch Condition must be a function.");
	}
};

/*
	Public: Given the ID of an existing fetch condition, this function removes
	it from the crawler's internal list of conditions.

	url - ID of fetch condition to be removed.

	Examples

		crawler.removeFetchCondition(3);

	Returns true if the fetch condition was removed, and throws an error if it 
	could not be found.

*/
Crawler.prototype.removeFetchCondition = function(index) {
	if (this.fetchConditions[index] &&
		this.fetchConditions[index] instanceof Function) {
		
		return !!this.fetchConditions.splice(index,1);
	} else {
		throw new Error("Unable to find indexed Fetch Condition.");
	}
};

module.exports = Crawler;