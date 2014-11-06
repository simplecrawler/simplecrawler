// Simplecrawler
// Christopher Giffard, 2011 - 2013+
//
// http://www.github.com/cgiffard/node-simplecrawler

// Queue Dependency
var FetchQueue		= require("./queue.js"),
	Cache			= require("./cache.js"),
	CookieJar		= require("./cookies.js"),
	MetaInfo		= require("../package.json");

var http			= require("http"),
	https			= require("https"),
	EventEmitter	= require('events').EventEmitter,
	URI				= require("URIjs"),
	zlib			= require("zlib"),
	util			= require("util");

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
	var crawler = this;

	// Data integrity checks
	if (initialPort && isNaN(initialPort))
		throw new Error("Port must be a number!");

	// SETTINGS TO STUFF WITH
	// (not here! Do it when you create a `new Crawler()`)

	// Domain to crawl
	crawler.host			= host || "";

	// Gotta start crawling *somewhere*
	crawler.initialPath		= initialPath || "/";
	crawler.initialPort		= initialPort || 80;
	crawler.initialProtocol	= "http";

	// Internal 'tick' interval for spawning new requests
	// (as long as concurrency is under cap)
	// One request will be spooled per tick, up to the concurrency threshold.
	crawler.interval		= interval || 250;

	// Maximum request concurrency. Be sensible. Five ties in with node's
	// default maxSockets value.
	crawler.maxConcurrency	= 5;

	// Maximum time we'll wait for headers
	crawler.timeout			= 5 * 60 * 1000;

	// Maximum time we'll wait for async listeners.
	crawler.listenerTTL		= 10 * 1000;

	// User Agent
	crawler.userAgent =
			"Node/" + MetaInfo.name + " " + MetaInfo.version +
			" (" + MetaInfo.repository.url + ")";

	// Queue for requests - FetchQueue gives us stats and other sugar
	// (but it's basically just an array)
	crawler.queue			= new FetchQueue();

	// Do we filter by domain?
	// Unless you want to be crawling the entire internet, I would
	// recommend leaving this on!
	crawler.filterByDomain	= true;

	// Do we scan subdomains?
	crawler.scanSubdomains	= false;

	// Treat WWW subdomain the same as the main domain (and don't count
	// it as a separate subdomain)
	crawler.ignoreWWWDomain	= true;

	// Or go even further and strip WWW subdomain from domains altogether!
	crawler.stripWWWDomain	= false;

	// Internal cachestore
	crawler.cache			= null;

	// Use an HTTP Proxy?
	crawler.useProxy		= false;
	crawler.proxyHostname	= "127.0.0.1";
	crawler.proxyPort		= 8123;
	crawler.proxyUser		= null;
	crawler.proxyPass		= null;

	// Support for HTTP basic auth
	crawler.needsAuth		= false;
	crawler.authUser		= "";
	crawler.authPass		= "";

	// Support for retaining cookies for parse duration
	crawler.acceptCookies	= true;
	crawler.cookies			= new CookieJar();

	// Support for custom headers...
	crawler.customHeaders	= {};

	// Domain Whitelist
	// We allow domains to be whitelisted, so cross-domain requests can be made.
	crawler.domainWhitelist	= [];

	// Supported Protocols
	crawler.allowedProtocols = [
		/^http(s)?$/i,					// HTTP & HTTPS
		/^(rss|atom|feed)(\+xml)?$/i	// RSS / XML
	];

	// Max file size to download/store
	crawler.maxResourceSize	= 1024 * 1024 * 16; // 16mb

	// Supported MIME-types
	// Matching MIME-types will be scanned for links
	crawler.supportedMimeTypes = [
		/^text\//i,
		/^application\/(rss|html|xhtml)?[\+\/\-]?xml/i,
		/^application\/javascript/i,
		/^xml/i
	];

	// Download linked, but unsupported files (binary - images, documents, etc)
	crawler.downloadUnsupported = true;

	// URL Encoding setting...
	crawler.urlEncoding = "unicode";

	// Strip Querystring Parameters from URL
	crawler.stripQuerystring = false;

	// Regular expressions for finding URL items in HTML and text
	crawler.discoverRegex = [
		/(\shref\s?=\s?|\ssrc\s?=\s?|url\()([^\"\'\s>\)]+)/ig,
		/(\shref\s?=\s?|\ssrc\s?=\s?|url\()['"]([^"']+)/ig,
		/http(s)?\:\/\/[^?\s><\'\"]+/ig,
		/url\([^\)]+/ig,

		// This might be a bit of a gamble... but get hard-coded
		// strings out of javacript: URLs. They're often popup-image
		// or preview windows, which would otherwise be unavailable to us.
		// Worst case scenario is we make some junky requests.
		/^javascript\:[a-z0-9\$\_\.]+\(['"][^'"\s]+/ig
	];

	// STATE (AND OTHER) VARIABLES NOT TO STUFF WITH
	var hiddenProps = {
		"_openRequests":	0,
		"_fetchConditions":	[],
		"_openListeners":	0
	};

	// Run the EventEmitter constructor
	EventEmitter.call(crawler);

	// Apply all the hidden props
	Object.keys(hiddenProps).forEach(function(key) {
		Object.defineProperty(crawler, key, {
			"writable": true,
			"enumerable": false,
			"value": hiddenProps[key]
		});
	});
};

util.inherits(Crawler,EventEmitter);

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
	crawler.queue.getLength(function(err, length) {
		if (err) throw err;

		if (!length) {

			// Initialise our queue by pushing the initial request data into it...
			crawler.queue.add(
				crawler.initialProtocol,
				crawler.host,
				crawler.initialPort,
				crawler.initialPath,
				function(error) {
					if (error) throw error;
				});
		}

		crawler.crawlIntervalID =
			setInterval(
				function() {
					crawler.crawl.call(crawler);
				},
				crawler.interval);

		crawler.emit("crawlstart");
		crawler.running = true;

		// Now kick off the initial crawl
		process.nextTick(function() {
			crawler.crawl();
		});
	});

	return crawler;
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
	var protocol, crawler = this;

	try {
		protocol = URI(URL).protocol();

		// Unspecified protocol. Assume http
		if (!protocol)
			protocol = "http";

	} catch(e) {
		// If URIjs died, we definitely /do not/ support the protocol.
		return false;
	}

	return crawler.allowedProtocols.reduce(function(prev,protocolCheck) {
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
	var crawler = this;

	return (
		crawler.supportedMimeTypes.reduce(function(prev,mimeCheck) {
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
	var newURL, crawler = this;

	if (!context || typeof(context) !== "object")
		context = {
			url: (
				crawler.initialProtocol + "://" +
				crawler.host + ":" +
				crawler.initialPort + "/"
			)
		};

	// If the URL didn't contain anything, don't fetch it.
	if (!URL.replace(/\s+/ig,"").length) return false;

	// Check if querystring should be ignored
	if (crawler.stripQuerystring === true)
		URL = crawler.removeQuerystring(URL);

	try {
		newURL =
			URI(URL)
				.absoluteTo(context.url)
				.normalize();

		if (crawler.urlEncoding === "iso8859") {
			newURL = newURL.iso8859();
		}

	} catch(e) {
		// Couldn't process the URL, since URIjs choked on it.
		return false;
	}

	// simplecrawler uses slightly different terminology to URIjs. Sorry!
	return {
		"protocol": newURL.protocol() || "http",
		"host":	newURL.hostname(),
		"port":	newURL.port() || 80,
		"path":	newURL.resource(),
		"uriPath": newURL.path()
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
	// Convert to UTF-8
	// TODO: account for text-encoding.
	var resources = [],
		resourceText = resourceData.toString("utf8"),
		crawler = this;

	if (!queueItem)
		queueItem = {};

	if (!queueItem.protocol)
		queueItem.protocol = "http";

	function cleanURL(URL) {
		return URL
				.replace(/^(\s?href|\s?src)=['"]?/i,"")
				.replace(/^\s*/,"")
				.replace(/^url\(['"]*/i,"")
				.replace(/^javascript\:[a-z0-9]+\(['"]/i,"")
				.replace(/["'\)]$/i,"")
				.replace(/^\/\//, queueItem.protocol + "://")
				.replace(/\&amp;/gi,"&")
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
	return crawler.discoverRegex
		.reduce(function(list,regex) {
			return list.concat(
				cleanAndQueue(
					resourceText.match(regex)));
		},[])
		.reduce(function(list,check) {
			if (list.indexOf(check) < 0)
				return list.concat([check]);

			return list;
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
	decompressed	- Content is already decompressed (default: false)

	Examples

		crawler.queueLinkedItems("<a href='...'>test</a>",queueItem);

	Returns the crawler object for chaining.

*/
Crawler.prototype.queueLinkedItems = function(resourceData,queueItem,decompressed) {
	var crawler = this,
		resources = [];

	if (!decompressed &&
		queueItem.stateData &&
		queueItem.stateData.headers['content-encoding'] && (
		queueItem.stateData.headers['content-encoding'].match(/gzip/) ||
		queueItem.stateData.headers['content-encoding'].match(/deflate/))) {

		return zlib.unzip(resourceData,function(err,newData) {
			if (err) {
				return crawler.emit("fetcherror",queueItem);
			}

			crawler.queueLinkedItems(newData,queueItem,true);
		});
	}

	resources = crawler.discoverResources(resourceData,queueItem);

	// Emit discovered resources. ie: might be useful in building a graph of
	// page relationships.
	crawler.emit("discoverycomplete",queueItem,resources);

	resources.forEach(function(url){ crawler.queueURL(url,queueItem); });

	return crawler;
};

/*
	Public: Given a single URL, this function cleans, validates, parses it and
	adds it to the queue. This is the best and simplest way to add an item to
	the queue.

	url			- URL to be queued.
	queueItem	- Queue item from which the resource was linked.

	Emits

		queueduplicate
		queueerror
		queueadd

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
	fetchDenied = crawler._fetchConditions.reduce(function(prev,callback) {
		return prev || !callback(parsedURL);
	},false);

	if (fetchDenied) {
		// Fetch Conditions conspired to block URL
		return false;
	}

	// Check the domain is valid before adding it to the queue
	if (crawler.domainValid(parsedURL.host)) {
		crawler.queue.add(
			parsedURL.protocol,
			parsedURL.host,
			parsedURL.port,
			parsedURL.path,
			function queueAddCallback(error,newQueueItem) {
				if (error) {
					// We received an error condition when adding the callback
					if (error.code && error.code === "DUP")
						return crawler.emit("queueduplicate",parsedURL);

					return crawler.emit("queueerror",error,parsedURL);
				}

				crawler.emit("queueadd",newQueueItem,parsedURL);
				newQueueItem.referrer = queueItem ? queueItem.url : null;
			}
		);
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
	crawler._openRequests ++;

	// Variable declarations
	var fetchData = false,
		requestOptions,
		clientRequest,
		timeCommenced;

	// Mark as spooled
	queueItem.status = "spooled";
	var client = (queueItem.protocol === "https" ? https : http);

	// Up the socket limit if required.
	if (client.globalAgent.maxSockets < crawler.maxConcurrency) {
		client.globalAgent.maxSockets = crawler.maxConcurrency;
	}

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
		method:	"GET",
		host:	requestHost,
		port:	requestPort,
		path:	requestPath,
		headers: {
			"User-Agent":	crawler.userAgent,
			"Host":			queueItem.host + (
							queueItem.port !== 80 ?
								":" + queueItem.port :
								""
							),
			"Referer":		queueItem.referrer
		}
	};

	// If port is one of the HTTP/HTTPS defaults, delete the option to avoid conflicts
	if (requestOptions.port === 80 || requestOptions.port === 443) {
		delete requestOptions.port;
	}

	// Add cookie header from cookie jar if we're configured to
	// send/accept cookies
	if (crawler.acceptCookies && crawler.cookies.getAsHeader()) {
		requestOptions.headers.cookie =
			crawler.cookies.getAsHeader(queueItem.host,queueItem.path);
	}

	// Add auth headers if we need them
	if (crawler.needsAuth) {
		var auth = crawler.authUser + ":" + crawler.authPass;

		// Generate auth header
		auth = 'Basic ' + (new Buffer(auth).toString('base64'));
		requestOptions.headers.Authorization = auth;
	}

	// Add proxy auth if we need it
	if (crawler.proxyUser !== null && crawler.proxyPass !== null) {
		var proxyAuth = crawler.proxyUser + ":" + crawler.proxyPass;

		// Generate auth header
		proxyAuth = 'Basic ' + (new Buffer(proxyAuth).toString('base64'));
		requestOptions.headers["Proxy-Authorization"] = proxyAuth;
	}

	// And if we've got any custom headers available
	if (crawler.customHeaders) {
		for (var header in crawler.customHeaders) {
			if (!crawler.customHeaders.hasOwnProperty(header)) continue;

			requestOptions.headers[header] = crawler.customHeaders[header];
		}
	}

	// Emit fetchstart event - gives the user time to mangle the request options
	// if required.
	crawler.emit("fetchstart", queueItem, requestOptions);

	process.nextTick(function() {
		// Record what time we started this request
		timeCommenced = Date.now();

		// Get the resource!
		clientRequest =
			client.request(requestOptions,function(response) {
				crawler.handleResponse(queueItem,response,timeCommenced);
			});

		clientRequest.end();

		clientRequest.setTimeout(crawler.timeout, function() {
			clientRequest.abort();
			crawler.emit("fetchtimeout",queueItem,crawler.timeout);
		});

		clientRequest.on("error",function(errorData) {
			crawler._openRequests --;

			// Emit 5xx / 4xx event
			crawler.emit("fetchclienterror",queueItem,errorData);
			queueItem.fetched = true;
			queueItem.stateData.code = 599;
			queueItem.status = "failed";
		});

		return crawler;
	});
};


/*
	Public: Given a queueItem and a matching response object, the crawler will
	handle downloading the resource, queueing of linked items, etc.

	Examples

		// Passing in a response from `request`
		request(queueItem.url,function(err,res,body) {
			crawler.handleResponse(queueItem,res);
		});

	Returns the crawler object for chaining.

*/
Crawler.prototype.handleResponse = function(queueItem,response,timeCommenced) {
	var crawler = this,
		dataReceived = false,
		timeHeadersReceived,
		timeDataReceived,
		parsedURL,
		responseBuffer,
		responseLength,
		responseLengthReceived = 0,
		contentType,
		stateData = queueItem.stateData;

	// Record what time we first received the header information
	timeHeadersReceived = Date.now();

	// If we weren't passed a time of commencement, assume Now()
	timeCommenced = timeCommenced || Date.now();

	responseLength = parseInt(response.headers["content-length"],10);
	responseLength = !isNaN(responseLength) ? responseLength : 0;

	// Save timing and content some header information into queue
	stateData.requestLatency	= (timeHeadersReceived - timeCommenced);
	stateData.requestTime		= (timeHeadersReceived - timeCommenced);
	stateData.contentLength		= responseLength;
	stateData.contentType		= contentType = response.headers["content-type"];
	stateData.code				= response.statusCode;
	stateData.headers			= response.headers;

	// Do we need to save cookies? Were we sent any?
	if (crawler.acceptCookies &&
		response.headers.hasOwnProperty('set-cookie'))
			crawler.cookies.addFromHeaders(response.headers["set-cookie"]);

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

		crawler._openRequests --;
	}

	function receiveData(chunk) {
		if (chunk && chunk.length && !dataReceived) {
			if (responseLengthReceived + chunk.length > responseBuffer.length) {
				// Oh dear. We've been sent more data than we were initially told.
				// This could be a mis-calculation, or a streaming resource.
				// Let's increase the size of our buffer to match, as long as it isn't
				// larger than our maximum resource size.

				if (responseLengthReceived + chunk.length <= crawler.maxResourceSize) {

					// Start by creating a new buffer, which will be our main
					// buffer from now on...

					var tmpNewBuffer = new Buffer(responseLengthReceived + chunk.length);

					// Copy all our old data into it...
					responseBuffer.copy(tmpNewBuffer,0,0,responseBuffer.length);

					// And now the new chunk
					chunk.copy(tmpNewBuffer,responseBuffer.length,0,chunk.length);

					// And now make the response buffer our new buffer,
					// leaving the original for GC
					responseBuffer = tmpNewBuffer;

				} else {
					// Oh dear oh dear! The response is not only more data
					// than we were initially told, but it also exceeds the
					// maximum amount of data we're prepared to download per
					// resource.
					//
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


		if ((responseLengthReceived >= responseLength || response.complete) &&
			!dataReceived) {

			// Slice the buffer to chop off any unused space
			responseBuffer = responseBuffer.slice(0,responseLengthReceived);

			dataReceived = true;
			processReceivedData();
		}
	}

	// If we should just go ahead and get the data
	if (response.statusCode >= 200 && response.statusCode < 300 &&
		responseLength <= crawler.maxResourceSize) {

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
			// Emit notmodified event. We don't have a cache available, so
			// we don't send any data.
			crawler.emit("notmodified",queueItem,response);
		}

	// If we should queue a redirect
	} else if (response.statusCode >= 300 && response.statusCode < 400 &&
					response.headers.location) {

		queueItem.fetched = true;
		queueItem.status = "redirected";

		// Parse the redirect URL ready for adding to the queue...
		parsedURL = crawler.processURL(response.headers.location,queueItem);

		// Emit redirect event
		crawler.emit("fetchredirect",queueItem,parsedURL,response);

		// Clean URL, add to queue...
		crawler.queueURL(parsedURL,queueItem);

		crawler._openRequests --;

	// Ignore this request, but record that we had a 404
	} else if (response.statusCode === 404) {
		queueItem.fetched = true;
		queueItem.status = "notfound";

		// Emit 404 event
		crawler.emit("fetch404",queueItem,response);

		crawler._openRequests --;

	// And oh dear. Handle this one as well. (other 400s, 500s, etc)
	} else {
		queueItem.fetched = true;
		queueItem.status = "failed";

		// Emit 5xx / 4xx event
		crawler.emit("fetcherror",queueItem,response);

		crawler._openRequests --;
	}

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

	if (crawler._openRequests > crawler.maxConcurrency) return;

	crawler.queue.oldestUnfetchedItem(function(err, queueItem) {

		if (queueItem) {
			crawler.fetchQueueItem(queueItem);

		} else if (	!crawler._openRequests &&
					!crawler._openListeners) {

			crawler.queue.complete(function(err, completeCount) {
				if (err) throw err;

				crawler.queue.getLength(function(err, length) {
					if (err) throw err;

					if (completeCount === length) {
						crawler.emit("complete");
						crawler.stop();
					}
				});
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
	var crawler = this;
	clearInterval(crawler.crawlIntervalID);
	crawler.running = false;
	return crawler;
};

/*
	Public: Holds the crawler in a 'running' state, preventing the `complete`
	event from firing until the callback this function returns has been executed,
	or a predetermined timeout (as specified by `crawler.listenerTTL`) has
	elapsed.

	Examples

		crawler.on("fetchcomplete",function(queueItem,data) {
			continue = this.wait();
			doSomethingThatTakesAlongTime(function callback() {
				continue();
			});
		});

	Returns callback which will allow the crawler to continue.

*/
Crawler.prototype.wait = function() {
	var crawler = this,
		cleared = false,
		timeout =
			setTimeout(function() {
				if (cleared) return;
				cleared = true;
				crawler._openListeners --;
			}, crawler.listenerTTL);

	crawler._openListeners ++;

	return function() {
		if (cleared) return;
		cleared = true;
		crawler._openListeners --;
		clearTimeout(timeout);
	};
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
	var crawler = this;
	if (callback instanceof Function) {
		crawler._fetchConditions.push(callback);
		return crawler._fetchConditions.length - 1;
	} else {
		throw new Error("Fetch Condition must be a function.");
	}
};

/*
	Public: Given the ID of an existing fetch condition, this function removes
	it from the crawler's internal list of conditions.

	index - ID of fetch condition to be removed.

	Examples

		crawler.removeFetchCondition(3);

	Returns true if the fetch condition was removed, and throws an error if it
	could not be found.

*/
Crawler.prototype.removeFetchCondition = function(index) {
	var crawler = this;
	if (crawler._fetchConditions[index] &&
		crawler._fetchConditions[index] instanceof Function) {

		return !!crawler._fetchConditions.splice(index,1);
	} else {
		throw new Error("Unable to find indexed Fetch Condition.");
	}
};

/*
	Public: Given a URL it will remove the querstring if it exists.

	url - URL from which to remove the querystring

	Examples

		crawler.removeQuerystring(url);

	Returns URL without querystring if it exists

*/
Crawler.prototype.removeQuerystring = function(url) {
	if (url.indexOf("?") > -1) {
		return url.substr(0,url.indexOf("?"));
	} else {
		return url;
	}
};

module.exports = Crawler;
