/*
 * Simplecrawler
 * https://github.com/cgiffard/node-simplecrawler
 *
 * Copyright (c) 2011-2015, Christopher Giffard
 *
 */

// Queue Dependency
var FetchQueue      = require("./queue.js"),
    CookieJar       = require("./cookies.js"),
    MetaInfo        = require("../package.json");

var http            = require("http"),
    https           = require("https"),
    EventEmitter    = require("events").EventEmitter,
    uri             = require("urijs"),
    zlib            = require("zlib"),
    util            = require("util"),
    iconv           = require("iconv-lite"),
    robotsTxtParser = require("robots-parser");

var QUEUE_ITEM_INITIAL_DEPTH = 1;

/*
    Public: Constructor for the crawler.

    host                -   Initial hostname/domain to begin crawling from. By
                            default, the crawl will be locked to this hostname.
    initialPath         -   Initial path to begin crawling from.
    initialPort         -   Port to begin crawling from.
    interval            -   Request interval for the crawler. Defaults to 250ms.

    Examples

        var crawler = new Crawler("example.com","/",80,500);

        var crawler = new Crawler("example.com");

    Returns the crawler object which has now been constructed.

*/
var Crawler = function(host, initialPath, initialPort, interval) {
    var crawler = this;

    // Data integrity checks
    if (initialPort && isNaN(initialPort)) {
        throw new Error("Port must be a number!");
    }

    // SETTINGS TO STUFF WITH
    // (not here! Do it when you create a `new Crawler()`)

    // Domain to crawl
    crawler.host            = host || "";

    // Gotta start crawling *somewhere*
    crawler.initialPath     = initialPath || "/";
    crawler.initialPort     = initialPort || 80;
    crawler.initialProtocol = "http";

    // Internal 'tick' interval for spawning new requests
    // (as long as concurrency is under cap)
    // One request will be spooled per tick, up to the concurrency threshold.
    crawler.interval        = interval || 250;

    // Maximum request concurrency. Be sensible. Five ties in with node's
    // default maxSockets value.
    crawler.maxConcurrency  = 5;

    // Maximum time we'll wait for headers
    crawler.timeout         = 5 * 60 * 1000;

    // Maximum time we'll wait for async listeners.
    crawler.listenerTTL     = 10 * 1000;

    // User Agent
    crawler.userAgent =
            "Node/" + MetaInfo.name + " " + MetaInfo.version +
            " (" + MetaInfo.repository.url + ")";

    // Queue for requests - FetchQueue gives us stats and other sugar
    // (but it's basically just an array)
    crawler.queue           = new FetchQueue();

    // Do we exclude certain URL's based on rules found in robots.txt?
    crawler.respectRobotsTxt = true;

    // Should we update crawler.host if the first response is a redirect to another domain.
    crawler.allowInitialDomainChange = false;

    // Set Accept-Encoding header and automatically decompress HTTP responses
    // based on Content-Encoding header
    crawler.decompressResponses = true;

    // Decode HTTP responses based on their Content-Type header or any
    // inline charset definition
    crawler.decodeResponses = false;

    // Do we filter by domain?
    // Unless you want to be crawling the entire internet, I would
    // recommend leaving this on!
    crawler.filterByDomain  = true;

    // Do we scan subdomains?
    crawler.scanSubdomains  = false;

    // Treat WWW subdomain the same as the main domain (and don't count
    // it as a separate subdomain)
    crawler.ignoreWWWDomain = true;

    // Or go even further and strip WWW subdomain from domains altogether!
    crawler.stripWWWDomain  = false;

    // Internal cachestore
    crawler.cache           = null;

    // Use an HTTP Proxy?
    crawler.useProxy        = false;
    crawler.proxyHostname   = "127.0.0.1";
    crawler.proxyPort       = 8123;
    crawler.proxyUser       = null;
    crawler.proxyPass       = null;

    // Support for HTTP basic auth
    crawler.needsAuth       = false;
    crawler.authUser        = "";
    crawler.authPass        = "";

    // Support for retaining cookies for parse duration
    crawler.acceptCookies   = true;
    crawler.cookies         = new CookieJar();

    // Support for custom headers...
    crawler.customHeaders   = {};

    // Domain Whitelist
    // We allow domains to be whitelisted, so cross-domain requests can be made.
    crawler.domainWhitelist = [];

    // Keep track of what hosts (hostname and port - if port is non-standard)
    // we've fetched from
    crawler.touchedHosts = [];

    // Supported Protocols
    crawler.allowedProtocols = [
        /^http(s)?$/i,                  // HTTP & HTTPS
        /^(rss|atom|feed)(\+xml)?$/i    // RSS / XML
    ];

    // Max file size to download/store
    crawler.maxResourceSize = 1024 * 1024 * 16; // 16mb

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
        /\s(?:href|src)\s?=\s?(["']).*?\1/ig,
        /\s(?:href|src)\s?=\s?[^"'\s][^\s>]+/ig,
        /\s?url\((["']).*?\1\)/ig,
        /\s?url\([^"'].*?\)/ig,

        // This could easily duplicate matches above, e.g. in the case of
        // href="http://example.com"
        /http(s)?:\/\/[^?\s><'"]+/ig,

        // This might be a bit of a gamble... but get hard-coded
        // strings out of javacript: URLs. They're often popup-image
        // or preview windows, which would otherwise be unavailable to us.
        // Worst case scenario is we make some junky requests.
        /^javascript:[a-z0-9\$_\.]+\(['"][^'"\s]+/ig,

        // Find srcset links
        function (string) {
            var result = /\ssrcset\s*=\s*(["'])(.*)\1/.exec(string);
            return Array.isArray(result) ? String(result[2]).split(",").map(function (string) {
                return string.replace(/\s?\w*$/, "").trim();
            }) : "";
        },

        // Find resources in <meta> redirects. We need to wrap these RegExp's in
        // functions because we only want to return the first capture group, not
        // the entire match. And we need two RegExp's because the necessary
        // attributes on the <meta> tag can appear in any order
        function(string) {
            var match = string.match(/<\s*meta[^>]*http-equiv=["']{0,1}refresh["']{0,1}[^>]*content=["']{0,1}[^"'>]*url=([^"'>]*)["']{0,1}[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        },
        function(string) {
            var match = string.match(/<\s*meta[^>]*content=["']{0,1}[^"'>]*url=([^"'>]*)["']{0,1}[^>]*http-equiv=["']{0,1}refresh["']{0,1}[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        }
    ];

    // Whether to parse inside HTML comments
    crawler.parseHTMLComments = true;

    // Whether to parse inside script tags
    crawler.parseScriptTags = true;

    // Max depth parameter
    crawler.maxDepth = 0;

    // Matching MIME-types will be allowed to fetch further than max depth
    crawler.whitelistedMimeTypes = [
        /^text\/(css|javascript|ecmascript)/i,
        /^application\/javascript/i,
        /^application\/x-font/i,
        /^application\/font/i,
        /^image\//i,
        /^font\//i
    ];

    // Whether to allow 'resources' greater than the max depth to be downloaded
    crawler.fetchWhitelistedMimeTypesBelowMaxDepth = false;

    // Ignore invalid SSL certificates
    crawler.ignoreInvalidSSL = false;

    // The HTTP / HTTPS agent used to crawl
    crawler.httpAgent       = http.globalAgent;
    crawler.httpsAgent      = https.globalAgent;

    // STATE (AND OTHER) VARIABLES NOT TO STUFF WITH
    var hiddenProps = {
        _robotsTxts: [],
        _isFirstRequest:	true,
        _openRequests: 0,
        _fetchConditions: [],
        _openListeners: 0
    };

    // Run the EventEmitter constructor
    EventEmitter.call(crawler);

    // Apply all the hidden props
    Object.keys(hiddenProps).forEach(function(key) {
        Object.defineProperty(crawler, key, {
            writable: true,
            enumerable: false,
            value: hiddenProps[key]
        });
    });
};

util.inherits(Crawler, EventEmitter);

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

    if (crawler.running) {
        return crawler;
    }

    // only if we haven't already got stuff in our queue...
    crawler.queue.getLength(function(err, length) {
        if (err) {
            throw err;
        }

        if (!length) {
            var initialUrl = uri({
                protocol: crawler.initialProtocol,
                hostname: crawler.host,
                port: crawler.initialPort,
                path: crawler.initialPath
            }).href();

            var queueItem = crawler.processURL(initialUrl);
            queueItem.referrer = undefined;
            queueItem.depth = QUEUE_ITEM_INITIAL_DEPTH;

            crawler.queue.add(queueItem, false, function(error) {
                if (error) {
                    throw error;
                }
            });
        }

        process.nextTick(function() {
            crawler.crawlIntervalID = setInterval(function() {
                crawler.crawl(crawler);
            }, crawler.interval);

            // Now kick off the initial crawl
            crawler.crawl();
        });

        crawler.running = true;
        crawler.emit("crawlstart");
    });


    return crawler;
};

/*
    Public: Fetch condition that looks at robots.txt rules. Method is replaced
    once the content of robots.txt has been loaded.

    queueItem - A queueItem or a URL string

    Returns a boolean
 */
Crawler.prototype.urlIsAllowed = function (queueItem) {
    var crawler = this;

    if (typeof queueItem === "object") {
        queueItem = {
            protocol: queueItem.protocol,
            hostname: queueItem.host,
            port: queueItem.port.toString(),
            path: queueItem.uriPath,
            query: queueItem.path.split("?")[1]
        };
    }

    var formattedURL = uri(queueItem).normalize().href(),
        allowed = false;

    // The punycode module sometimes chokes on really weird domain
    // names. Catching those errors to prevent crawler from crashing
    try {
        allowed = crawler._robotsTxts.reduce(function (result, robots) {
            var allowed = robots.isAllowed(formattedURL, crawler.userAgent);
            return result !== undefined ? result : allowed;
        }, undefined);
    } catch (error) {
        // URL will be avoided
    }

    return allowed === undefined ? true : allowed;
};

/*
    Public: Generates a configuration object for http[s].request.

    queueItem - Queue item representing resource to be fetched

    Returns an object that can be passed directly to http[s].request.

*/
Crawler.prototype.getRequestOptions = function (queueItem) {
    var crawler = this;

    var agent = queueItem.protocol === "https" ? crawler.httpsAgent : crawler.httpAgent;

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

    var isStandardHTTPPort = queueItem.protocol === "http" && queueItem.port !== 80,
        isStandardHTTPSPort = queueItem.protocol === "https" && queueItem.port !== 443,
        isStandardPort = isStandardHTTPPort || isStandardHTTPSPort;

    // Load in request options
    var requestOptions = {
        method: "GET",
        host: requestHost,
        port: requestPort,
        path: requestPath,
        agent: agent,
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": crawler.userAgent,
            "Host": queueItem.host + (queueItem.port && isStandardPort ? ":" + queueItem.port : "")
        }
    };

    if (crawler.decompressResponses) {
        requestOptions.headers["Accept-Encoding"] = "gzip, deflate";
    }

    if (queueItem.referrer) {
        requestOptions.headers.Referer = queueItem.referrer;
    }

    // If port is one of the HTTP/HTTPS defaults, delete the option to avoid conflicts
    if (requestPort === 80 || requestPort === 443) {
        delete requestOptions.port;
    }

    // Add cookie header from cookie jar if we're configured to
    // send/accept cookies
    if (crawler.acceptCookies && crawler.cookies.getAsHeader()) {
        requestOptions.headers.cookie =
            crawler.cookies.getAsHeader(queueItem.host, queueItem.path);
    }

    // Add auth headers if we need them
    if (crawler.needsAuth) {
        var auth = crawler.authUser + ":" + crawler.authPass;

        // Generate auth header
        auth = "Basic " + new Buffer(auth).toString("base64");
        requestOptions.headers.Authorization = auth;
    }

    // Add proxy auth if we need it
    if (crawler.proxyUser !== null && crawler.proxyPass !== null) {
        var proxyAuth = crawler.proxyUser + ":" + crawler.proxyPass;

        // Generate auth header
        proxyAuth = "Basic " + new Buffer(proxyAuth).toString("base64");
        requestOptions.headers["Proxy-Authorization"] = proxyAuth;
    }

    // And if we've got any custom headers available
    if (crawler.customHeaders) {
        for (var header in crawler.customHeaders) {
            if (crawler.customHeaders.hasOwnProperty(header)) {
                requestOptions.headers[header] = crawler.customHeaders[header];
            }
        }
    }

    return requestOptions;
};

/*
    Public: Initiates a request for the robots.txt resource on crawler's target
    domain.

    url - Fully qualified URL string to the robots.txt file
    callback - Callback with signature: error, robotsTxtUrl, responseBuffer. All arguments are strings.

    Returns the crawler object, to enable chaining.

*/
Crawler.prototype.getRobotsTxt = function (url, callback) {
    var crawler = this,
        errorMsg;

    var robotsTxtUrl = uri(url);
    var client = robotsTxtUrl.protocol() === "https" ? https : http;

    // Apply the ignoreInvalidSSL setting to https connections
    if (client === https && crawler.ignoreInvalidSSL === true) {
        client.rejectUnauthorized = false;
        client.strictSSL = false;
    }

    var requestOptions = crawler.getRequestOptions(crawler.processURL(robotsTxtUrl.href()));

    // Get the resource!
    var clientRequest = client.request(requestOptions, function(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
            var responseLength =
                    parseInt(response.headers["content-length"], 10) ||
                    crawler.maxResourceSize,
                responseBuffer = new Buffer(responseLength),
                responseLengthReceived = 0;

            response.on("data", function (chunk) {
                if (responseLengthReceived + chunk.length <= crawler.maxResourceSize) {
                    chunk.copy(responseBuffer, responseLengthReceived, 0, chunk.length);
                    responseLengthReceived += chunk.length;
                } else {
                    response.socket.destroy();
                    callback(new Error("robots.txt exceeded maxResourceSize"));
                }
            });

            var decodeAndReturnResponse = function (error, responseBuffer) {
                if (error) {
                    return callback(new Error("Couldn't unzip robots.txt response body"));
                }

                var contentType = response.headers["content-type"],
                    responseBody = crawler.decodeBuffer(responseBuffer, contentType);

                callback(undefined, robotsTxtUrl.href(), responseBody);
            };

            response.on("end", function () {
                var contentEncoding = response.headers["content-encoding"];

                if (contentEncoding && /(gzip|deflate)/.test(contentEncoding)) {
                    zlib.unzip(responseBuffer, decodeAndReturnResponse);
                } else {
                    decodeAndReturnResponse(undefined, responseBuffer);
                }
            });
        } else if (response.statusCode >= 300 && response.statusCode < 400 &&
            response.headers.location) {

            response.socket.destroy();

            var redirectTarget = uri(response.headers.location)
                .absoluteTo(robotsTxtUrl)
                .normalize();

            if (crawler.domainValid(redirectTarget.hostname())) {
                crawler.getRobotsTxt(redirectTarget.href(), callback);
            } else {
                errorMsg = util.format("%s redirected to a disallowed domain (%s)", robotsTxtUrl.href(), redirectTarget.hostname());
                callback(new Error(errorMsg));
            }
        } else {
            response.socket.destroy();

            errorMsg = util.format("Server responded with status %d when fetching robots.txt", response.statusCode);
            callback(new Error(errorMsg));
        }
    });

    clientRequest.end();

    clientRequest.setTimeout(crawler.timeout, function() {
        clientRequest.abort();
        callback(new Error("robots.txt request timed out"));
    });

    clientRequest.on("error", function(errorData) {
        callback(errorData);
    });

    return crawler;
};

/*
    Public: Determines whether the protocol is supported, given a URL.

    URL - URL with a protocol, for testing.

    Examples

        crawler.protocolSupported("http://google.com/") // true, by default
        crawler.protocolSupported("wss://google.com/")  // false, by default

    Returns a boolean, true if the protocol is supported - false if not.

*/
Crawler.prototype.protocolSupported = function(URL) {
    var protocol,
        crawler = this;

    try {
        protocol = uri(URL).protocol();

        // Unspecified protocol. Assume http
        if (!protocol) {
            protocol = "http";
        }

    } catch (e) {
        // If URIjs died, we definitely /do not/ support the protocol.
        return false;
    }

    return crawler.allowedProtocols.some(function(protocolCheck) {
        return protocolCheck.test(protocol);
    });
};

/*
    Public: Determines whether the mimetype is supported, given a mimetype

    MIMEType    - String containing MIME type to test

    Examples

        crawler.mimeTypeSupported("text/html") // true, by default
        crawler.mimeTypeSupported("application/octet-stream") // false, by default

    Returns a boolean, true if the MIME type is supported — false if not.

*/
Crawler.prototype.mimeTypeSupported = function(MIMEType) {
    var crawler = this;

    return crawler.supportedMimeTypes.some(function(mimeCheck) {
        return mimeCheck.test(MIMEType);
    });
};

/*
    Public: Determines whether the queueItem can be fetched from its depth

    In fact, the queueItem needs to be fetched before calling this (because we
    need its MIME type). This will just determine if we need to send an event
    for this item & if we need to fetch linked resources.

        queueItem   - Queue item object to check

    Returns a boolean, true if the queue item can be fetched - false if not.

*/
Crawler.prototype.depthAllowed = function(queueItem) {
    var crawler = this;

    var belowMaxDepth = crawler.fetchWhitelistedMimeTypesBelowMaxDepth;

    if (typeof belowMaxDepth === "boolean") {
        belowMaxDepth = belowMaxDepth === false ? 0 : Infinity;
    }

    var whitelistedDepth = queueItem.depth - belowMaxDepth;

    return crawler.maxDepth === 0 ||
           queueItem.depth <= crawler.maxDepth ||
                whitelistedDepth <= crawler.maxDepth &&
                crawler.whitelistedMimeTypes.some(function(mimeCheck) {
                    return mimeCheck.test(queueItem.stateData.contentType);
                });
};

/*
    Public: Constructs a queueItem from a URL and a referrer queueItem

    URL      - String containing URL to process
    referrer - queueItem object representing the resource where the URL was discovered

    Examples

        var URLInfo = crawler.processURL("http://www.google.com/fish");

    Returns a queueItem

*/
Crawler.prototype.processURL = function(url, referrer) {
    var newUrl,
        crawler = this;

    if (typeof referrer !== "object") {
        var initialUrl = uri({
            protocol: crawler.initialProtocol,
            hostname: crawler.host,
            port: crawler.initialPort,
            path: crawler.initialPath
        }).href();

        referrer = {
            url: initialUrl,
            depth: QUEUE_ITEM_INITIAL_DEPTH
        };
    }

    // If the URL didn't contain anything, don't fetch it.
    if (!(url && url.trim().length)) {
        return false;
    }

    // Check if querystring should be ignored
    if (crawler.stripQuerystring === true) {
        url = uri(url).removeSearch().href();
    }

    if (crawler.stripWWWDomain && url.match(/https?:\/\/(www\.).*/i)) {
        url = url.replace("www.", "");
    }

    try {
        newUrl = uri(url).absoluteTo(referrer.url).normalize();

        if (crawler.urlEncoding === "iso8859") {
            newUrl = newUrl.iso8859();
        }
    } catch (e) {
        // Couldn't process the URL, since URIjs choked on it.
        return false;
    }

    // simplecrawler uses slightly different terminology to URIjs. Sorry!
    return {
        host:      newUrl.hostname(),
        path:      newUrl.resource(),
        port:      newUrl.port(),
        protocol:  newUrl.protocol() || "http",
        uriPath:   newUrl.path(),
        url:       newUrl.href(),
        depth:     referrer.depth + 1,
        referrer:  referrer.url,
        fetched:   false,
        status:    "created",
        stateData: {}
    };
};

/*
    Private: Perform string replace operations on a URL string. Eg. removes
    HTML attribute fluff around actual URL, replaces leading "//" with
    absolute protocol etc.

    queueItem - Queue item corresponding to where the resource was found
    URL       - String to be cleaned up

    Examples

        cleanURL({protocol: "http"}, "url('//example.com/about') ")

    Returns a string.
 */
function cleanURL (queueItem, URL) {
    return URL
        .replace(/^(?:\s*href|\s*src)\s*=+\s*/i, "")
        .replace(/^\s*/, "")
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/^url\((.*)\)/i, "$1")
        .replace(/^javascript:\s*([a-z0-9]*\(["'](.*)["']\))*.*/i, "$2")
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/^\((.*)\)$/, "$1")
        .replace(/^\/\//, queueItem.protocol + "://")
        .replace(/&amp;/gi, "&")
        .replace(/&#38;/gi, "&")
        .replace(/&#x00026;/gi, "&")
        .split("#")
        .shift()
        .trim();
}

/*
    Public: Clean up a list of resources (normally provided by discoverResources).
    Also expands URL's that are relative to the current page.

    urlMatch  - Array of string resources
    queueItem - Queue item corresponding to where the resources were retrieved from

    Examples

        crawler.cleanExpandResources(["http://www.google.com", "/about", "mailto: example@example.com"])

    Returns an array of URL strings.
*/
Crawler.prototype.cleanExpandResources = function (urlMatch, queueItem) {
    var crawler = this;

    if (!urlMatch) {
        return [];
    }

    return urlMatch
        .filter(Boolean)
        .map(cleanURL.bind(this, queueItem))
        .reduce(function(list, URL) {

            // Ensure URL is whole and complete
            try {
                URL = uri(URL)
                    .absoluteTo(queueItem.url || "")
                    .normalize()
                    .href();
            } catch (e) {
                // But if URI.js couldn't parse it - nobody can!
                return list;
            }

            // If we hit an empty item, don't return it
            if (!URL.length) {
                return list;
            }

            // If we don't support the protocol in question
            if (!crawler.protocolSupported(URL)) {
                return list;
            }

            // Does the item already exist in the list?
            var exists = list.some(function(entry) {
                return entry === URL;
            });

            if (exists) {
                return list;
            }

            return list.concat(URL);
        }, []);
};

/*
    Public: Discovers linked resources in an HTML, XML or text document.

    resourceData    - String containing document with linked resources.
    queueItem       - Queue item corresponding to document being searched.

    Examples

        crawler.discoverResources("http://www.google.com")
        crawler.discoverResources("<a href='...'>test</a>")

    Returns an array of the (string) resource URLs found in the document. If none
    were found, the array will be empty.

*/
Crawler.prototype.discoverResources = function(resourceText, queueItem) {
    var crawler = this;

    if (!queueItem) {
        queueItem = {};
    }

    if (!crawler.parseHTMLComments) {
        resourceText = resourceText.replace(/<!--([\s\S]+?)-->/g, "");
    }

    if (!crawler.parseScriptTags) {
        resourceText = resourceText.replace(/<script(.*?)>([\s\S]*?)<\/script>/gi, "");
    }

    // Rough scan for URLs
    return crawler.discoverRegex.reduce(function(list, extracter) {
        var resources;

        if (extracter instanceof Function) {
            resources = extracter(resourceText);
        } else {
            resources = resourceText.match(extracter);
        }

        return resources ? list.concat(resources) : list;
    }, []);
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
    var crawler = this;

    // If we're ignoring the WWW domain, remove the WWW for comparisons...
    if (crawler.ignoreWWWDomain) {
        host = host.replace(/^www\./i, "");
    }

    function domainInWhitelist(host) {

        // If there's no whitelist, or the whitelist is of zero length,
        // just return false.
        if (!crawler.domainWhitelist || !crawler.domainWhitelist.length) {
            return false;
        }

        // Otherwise, scan through it.
        return crawler.domainWhitelist.some(function(entry) {
            // If the domain is just equal, return true.
            if (host === entry) {
                return true;
            }
            // If we're ignoring WWW subdomains, and both domains,
            // less www. are the same, return true.
            if (crawler.ignoreWWWDomain && host === entry.replace(/^www\./i, "")) {
                return true;
            }
            return false;
        });
    }

    // Checks if the first domain is a subdomain of the second
    function isSubdomainOf(subdomain, host) {

        // Comparisons must be case-insensitive
        subdomain   = subdomain.toLowerCase();
        host        = host.toLowerCase();

        // If we're ignoring www, remove it from both
        // (if www is the first domain component...)
        if (crawler.ignoreWWWDomain) {
            subdomain = subdomain.replace(/^www./ig, "");
            host = host.replace(/^www./ig, "");
        }

        // They should be the same flipped around!
        return subdomain.split("").reverse().join("").substr(0, host.length) ===
                host.split("").reverse().join("");
    }

           // If we're not filtering by domain, just return true.
    return !crawler.filterByDomain ||
           // Or if the domain is just the right one, return true.
           host === crawler.host ||
           // Or if we're ignoring WWW subdomains, and both domains,
           // less www. are the same, return true.
           crawler.ignoreWWWDomain &&
               crawler.host.replace(/^www\./i, "") ===
                   host.replace(/^www\./i, "") ||
           // Or if the domain in question exists in the domain whitelist,
           // return true.
           domainInWhitelist(host) ||
           // Or if we're scanning subdomains, and this domain is a subdomain
           // of the crawler's set domain, return true.
           crawler.scanSubdomains && isSubdomainOf(host, crawler.host);
};

/*
    Public: Given a text or HTML document, initiates discovery of linked
    resources in the text, and queues the resources if applicable. Emits
    "discoverycomplete". Not to be confused with `crawler.discoverResources`,
    despite the `discoverResources` function being the main component of this
    one, since this function queues the resources in addition to
    discovering them.

    resourceData - Text document containing linked resource URLs.
    queueItem    - Queue item from which the resource document was derived.

    Emits

        discoverycomplete

    Examples

        crawler.queueLinkedItems("<a href='...'>test</a>",queueItem);

    Returns the crawler object for chaining.

*/
Crawler.prototype.queueLinkedItems = function(resourceData, queueItem) {
    var crawler = this;

    var resources = crawler.discoverResources(resourceData.toString(), queueItem);
    resources = crawler.cleanExpandResources(resources, queueItem);

    // Emit discovered resources. ie: might be useful in building a graph of
    // page relationships.
    crawler.emit("discoverycomplete", queueItem, resources);

    resources.forEach(function(url) {
        crawler.queueURL(url, queueItem);
    });

    return crawler;
};

/*
    Public: Given a single URL, this function cleans, validates, parses it and
    adds it to the queue. This is the best and simplest way to add an item to
    the queue.

    url         - URL to be queued.
    referrer    - Queue item from which the resource was linked.

    Emits

        queueduplicate
        queueerror
        queueadd

    Examples

        crawler.queueURL("http://www.google.com/",queueItem);

    Returns a boolean value indicating whether the URL was successfully queued
    or not.

*/
Crawler.prototype.queueURL = function(url, referrer) {
    var crawler = this,
        queueItem = typeof url === "object" ? url : crawler.processURL(url, referrer);

    // URL Parser decided this URL was junky. Next please!
    if (!queueItem) {
        return false;
    }

    // Pass this URL past fetch conditions to ensure the user thinks it's valid
    var fetchDenied = crawler._fetchConditions.some(function(callback) {
        return !callback(queueItem, referrer);
    });

    if (fetchDenied) {
        // Fetch conditions conspired to block URL
        return false;
    }

    if (!crawler.urlIsAllowed(queueItem.url)) {
        // robots.txt dictates we shouldn't fetch URL
        crawler.emit("fetchdisallowed", queueItem);
        return false;
    }

    // Check the domain is valid before adding it to the queue
    if (crawler.domainValid(queueItem.host)) {
        crawler.queue.add(queueItem, false, function (error) {
            if (error) {
                // We received an error condition when adding the callback
                if (error.code && error.code === "DUPLICATE") {
                    return crawler.emit("queueduplicate", queueItem);
                }

                return crawler.emit("queueerror", error, queueItem);
            }

            crawler.emit("queueadd", queueItem, referrer);
        });
    }

    return true;
};

/*
    Public: The guts of the crawler: takes a queue item and spools a request for
    it, downloads, caches, and fires events based on the result of the request.
    It kicks off resource discovery and queues any new resources found.

    queueItem   - Queue item to be fetched.

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
    crawler._openRequests++;

    // Variable declarations
    var clientRequest,
        timeCommenced;

    // Mark as spooled
    queueItem.status = "spooled";
    var client = queueItem.protocol === "https" ? https : http;
    var agent  = queueItem.protocol === "https" ? crawler.httpsAgent : crawler.httpAgent;

    // Up the socket limit if required.
    if (agent.maxSockets < crawler.maxConcurrency) {
        agent.maxSockets = crawler.maxConcurrency;
    }

    // Apply the ignoreInvalidSSL setting to https connections
    if (client === https && crawler.ignoreInvalidSSL === true) {
        client.rejectUnauthorized = false;
        client.strictSSL = false;
    }

    var requestOptions = crawler.getRequestOptions(queueItem);

    // Emit fetchstart event - gives the user time to mangle the request options
    // if required.
    crawler.emit("fetchstart", queueItem, requestOptions);

    // Record what time we started this request
    timeCommenced = Date.now();

    // Get the resource!
    clientRequest =
        client.request(requestOptions, function(response) {
            crawler.handleResponse(queueItem, response, timeCommenced);
        });

    clientRequest.end();

    clientRequest.setTimeout(crawler.timeout, function() {
        if (queueItem.fetched) {
            return;
        }

        if (crawler.running && !queueItem.fetched) {
            crawler._openRequests--;
        }

        queueItem.fetched = true;
        queueItem.status = "timeout";
        crawler.emit("fetchtimeout", queueItem, crawler.timeout);
        clientRequest._crawlerHandled = true;
        clientRequest.abort();
    });

    clientRequest.on("error", function(errorData) {

        // This event will be thrown if we manually aborted the request,
        // but we don't want to do anything in that case.
        if (clientRequest._crawlerHandled) {
            return;
        }

        if (crawler.running && !queueItem.fetched) {
            crawler._openRequests--;
        }

        // Emit 5xx / 4xx event
        queueItem.fetched = true;
        queueItem.stateData.code = 600;
        queueItem.status = "failed";
        crawler.emit("fetchclienterror", queueItem, errorData);
    });

    return crawler;
};


/*
    Decode string buffer based on a complete Content-Type header. Will also look
    for an embedded <meta> tag with a charset definition, but the Content-Type
    header is prioritized, see:
    https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta#attr-charset

    Examples

        crawler.decodeBuffer(responseBuffer, "text/html; charset=tis-620");

    Returns the decoded buffer.

*/
Crawler.prototype.decodeBuffer = function (buffer, contentTypeHeader) {
    contentTypeHeader = contentTypeHeader || "";

    var embeddedEncoding = /<meta.*charset=["']{0,1}([^"'>]*)["']{0,1}\s*\/{0,1}>/i.exec(buffer.toString(undefined, 0, 512)) || [],
        encoding = contentTypeHeader.split("charset=")[1] || embeddedEncoding[1] || contentTypeHeader;

    encoding = iconv.encodingExists(encoding) ? encoding : "utf-8";

    return iconv.decode(buffer, encoding);
};


/*
    Public: Given a queueItem and a matching response object, the crawler will
    handle downloading the resource, queueing of linked items, etc.

    Examples

        // Passing in a response from `request`
        request(queueItem.url, function(err, res, body) {
            crawler.handleResponse(queueItem, res);
        });

    Returns the crawler object for chaining.

*/
Crawler.prototype.handleResponse = function(queueItem, response, timeCommenced) {
    var crawler = this,
        dataReceived = false,
        timeHeadersReceived,
        timeDataReceived,
        referrerQueueItem,
        responseBuffer,
        responseLength,
        responseLengthReceived = 0,
        contentType,
        stateData = queueItem.stateData;

    // Record what time we first received the header information
    timeHeadersReceived = Date.now();

    // If we weren't passed a time of commencement, assume Now()
    timeCommenced = timeCommenced || Date.now();

    responseLength = parseInt(response.headers["content-length"], 10);
    responseLength = !isNaN(responseLength) ? responseLength : 0;

    // Save timing and content some header information into queue
    stateData.requestLatency = timeHeadersReceived - timeCommenced;
    stateData.requestTime    = timeHeadersReceived - timeCommenced;
    stateData.contentLength  = responseLength;
    stateData.contentType    = contentType = response.headers["content-type"];
    stateData.code           = response.statusCode;
    stateData.headers        = response.headers;

    // Do we need to save cookies? Were we sent any?
    if (crawler.acceptCookies && response.headers.hasOwnProperty("set-cookie")) {
        try {
            crawler.cookies.addFromHeaders(response.headers["set-cookie"]);
        } catch (error) {
            crawler.emit("cookieerror", queueItem, error, response.headers["set-cookie"]);
        }
    }

    // Emit header receive event
    crawler.emit("fetchheaders", queueItem, response);

    // Ensure response length is reasonable...
    responseLength = responseLength > 0 ? responseLength : crawler.maxResourceSize;
    queueItem.stateData.contentLength = responseLength;

    function emitFetchComplete(responseBody, decompressedBuffer) {
        responseBody = crawler.decodeResponses ? crawler.decodeBuffer(responseBody, stateData.contentType) : responseBody;
        crawler.emit("fetchcomplete", queueItem, responseBody, response);

        // We only process the item if it's of a valid mimetype
        // and only if the crawler is set to discover its own resources
        if (crawler.mimeTypeSupported(contentType) && crawler.discoverResources) {
            crawler.queueLinkedItems(decompressedBuffer || responseBody, queueItem);
        }
    }

    // Function for dealing with 200 responses
    function processReceivedData() {
        if (dataReceived || queueItem.fetched) {
            return;
        }

        responseBuffer = responseBuffer.slice(0, responseLengthReceived);
        dataReceived = true;

        timeDataReceived = new Date().getTime();

        queueItem.fetched = true;
        queueItem.status = "downloaded";

        // Save state information
        stateData.downloadTime      = timeDataReceived - timeHeadersReceived;
        stateData.requestTime       = timeDataReceived - timeCommenced;
        stateData.actualDataSize    = responseBuffer.length;
        stateData.sentIncorrectSize = responseBuffer.length !== responseLength;

        // First, save item to cache (if we're using a cache!)
        if (crawler.cache !== null && crawler.cache.setCacheData instanceof Function) {
            crawler.cache.setCacheData(queueItem, responseBuffer);
        }

        if (crawler.depthAllowed(queueItem)) {
            // No matter the value of `crawler.decompressResponses`, we still
            // decompress the response if it's gzipped or deflated. This is
            // because we always provide the discoverResources method with a
            // decompressed buffer
            if (/(gzip|deflate)/.test(stateData.headers["content-encoding"])) {
                zlib.unzip(responseBuffer, function(error, decompressedBuffer) {
                    if (error) {
                        crawler.emit("gziperror", queueItem, error, responseBuffer);
                        emitFetchComplete(responseBuffer);
                    } else {
                        var responseBody = crawler.decompressResponses ? decompressedBuffer : responseBuffer;
                        emitFetchComplete(responseBody, decompressedBuffer);
                    }
                });
            } else {
                emitFetchComplete(responseBuffer);
            }
        }

        crawler._openRequests--;
    }

    function receiveData(chunk) {
        if (!chunk.length || dataReceived) {
            return;
        }

        if (responseLengthReceived + chunk.length > responseBuffer.length) {
            // Oh dear. We've been sent more data than we were initially told.
            // This could be a mis-calculation, or a streaming resource.
            // Let's increase the size of our buffer to match, as long as it isn't
            // larger than our maximum resource size.

            if (responseLengthReceived + chunk.length <= crawler.maxResourceSize) {

                // Create a temporary buffer with the new response length, copy
                // the old data into it and replace the old buffer with it
                var tmpNewBuffer = new Buffer(responseLengthReceived + chunk.length);
                responseBuffer.copy(tmpNewBuffer, 0, 0, responseBuffer.length);
                chunk.copy(tmpNewBuffer, responseBuffer.length, 0, chunk.length);
                responseBuffer = tmpNewBuffer;
            } else {

                // The response size exceeds maxResourceSize. Throw event and
                // ignore. We'll then deal with the data that we have.
                response.socket.destroy();
                crawler.emit("fetchdataerror", queueItem, response);
            }
        } else {
            chunk.copy(responseBuffer, responseLengthReceived, 0, chunk.length);
        }

        responseLengthReceived += chunk.length;
    }

    // We already know that the response will be too big
    if (responseLength > crawler.maxResourceSize) {
        queueItem.fetched = true;
        crawler._openRequests--;

        response.socket.destroy();
        crawler.emit("fetchdataerror", queueItem, response);

    // We should just go ahead and get the data
    } else if (response.statusCode >= 200 && response.statusCode < 300) {

        queueItem.status = "headers";

        // Create a buffer with our response length
        responseBuffer = new Buffer(responseLength);

        // Only if we're prepared to download non-text resources...
        if (crawler.downloadUnsupported ||
            crawler.mimeTypeSupported(contentType)) {

            response.on("data", receiveData);
            response.on("end", processReceivedData);
        } else {
            queueItem.fetched = true;
            crawler._openRequests--;

            response.socket.destroy();
        }

        crawler._isFirstRequest = false;

    // We've got a not-modified response back
    } else if (response.statusCode === 304) {

        if (crawler.cache !== null && crawler.cache.getCacheData) {
            // We've got access to a cache
            crawler.cache.getCacheData(queueItem, function(cacheObject) {
                crawler.emit("notmodified", queueItem, response, cacheObject);
            });
        } else {
            // Emit notmodified event. We don't have a cache available, so
            // we don't send any data.
            crawler.emit("notmodified", queueItem, response);
        }

        crawler._isFirstRequest = false;

    // If we should queue a redirect
    } else if (response.statusCode >= 300 && response.statusCode < 400 &&
                    response.headers.location) {

        queueItem.fetched = true;
        queueItem.status = "redirected";

        // Parse the redirect URL ready for adding to the queue...
        referrerQueueItem = crawler.processURL(response.headers.location, queueItem);

        // Emit redirect event
        crawler.emit("fetchredirect", queueItem, referrerQueueItem, response);

        if (crawler._isFirstRequest) {
            referrerQueueItem.depth = 1;
        }

        if (crawler.allowInitialDomainChange && crawler._isFirstRequest) {
            crawler.host = referrerQueueItem.host;
        }

        // Clean URL, add to queue...
        crawler.queueURL(referrerQueueItem, queueItem);
        response.socket.destroy();

        crawler._openRequests--;

    // Ignore this request, but record that we had a 404
    } else if (response.statusCode === 404 || response.statusCode === 410) {
        queueItem.fetched = true;
        queueItem.status = "notfound";

        // Emit 404 event
        crawler.emit("fetch" + response.statusCode, queueItem, response);
        response.socket.destroy();

        crawler._openRequests--;

        crawler._isFirstRequest = false;

    // And oh dear. Handle this one as well. (other 400s, 500s, etc)
    } else {
        queueItem.fetched = true;
        queueItem.status = "failed";

        // Emit 5xx / 4xx event
        crawler.emit("fetcherror", queueItem, response);
        response.socket.destroy();

        crawler._openRequests--;

        crawler._isFirstRequest = false;
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

    if (crawler._openRequests > crawler.maxConcurrency ||
        crawler.fetchingRobotsTxt) {
        return [];
    }

    crawler.queue.oldestUnfetchedItem(function (error, queueItem) {
        if (error) {
            // Do nothing
        } else if (queueItem) {

            var url = uri(queueItem.url).normalize();
            var host = uri({
                protocol: url.protocol(),
                hostname: url.hostname(),
                port: url.port()
            }).href();

            if (crawler.respectRobotsTxt && crawler.touchedHosts.indexOf(host) === -1) {
                crawler.touchedHosts.push(host);
                crawler.fetchingRobotsTxt = true;

                var robotsTxtUrl = uri(host).pathname("/robots.txt").href();

                crawler.getRobotsTxt(robotsTxtUrl, function (error, robotsTxtUrl, robotsTxtBody) {
                    if (error) {
                        crawler.emit("robotstxterror", error);
                    } else {
                        crawler._robotsTxts.push(robotsTxtParser(robotsTxtUrl, robotsTxtBody));
                    }

                    crawler.fetchingRobotsTxt = false;

                    // It could be that the first URL we queued for any particular
                    // host is in fact disallowed, so we double check once we've
                    // fetched the robots.txt
                    if (crawler.urlIsAllowed(queueItem.url)) {
                        crawler.fetchQueueItem(queueItem);
                    } else {
                        queueItem.fetched = true;
                        queueItem.status = "disallowed";
                        crawler.emit("fetchdisallowed", queueItem);
                    }
                });
            } else {

                crawler.fetchQueueItem(queueItem);
            }
        } else if (!crawler._openRequests && !crawler._openListeners) {

            crawler.queue.countItems({ fetched: true }, function (err, completeCount) {
                if (err) {
                    throw err;
                }

                crawler.queue.getLength(function(err, length) {
                    if (err) {
                        throw err;
                    }

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
                if (cleared) {
                    return;
                }
                cleared = true;
                crawler._openListeners--;
            }, crawler.listenerTTL);

    crawler._openListeners++;

    return function() {
        if (cleared) {
            return;
        }
        cleared = true;
        crawler._openListeners--;
        clearTimeout(timeout);
    };
};

/*
    Public: Given a function, this method adds it to an internal list maintained
    by the crawler to be executed against each URL to determine whether it should
    be fetched or not.

    callback -  Function to be called when evaluating a URL. This function is
                passed an object containing the protocol, hostname, port, and path
                of a resource to be fetched. It can determine whether it should
                be requested or not by returning a boolean - false for no, true
                for yes.

    Examples

        crawler.addFetchCondition(function(queueItem) {
            return (queueItem.host !== "evildomain.com");
        });

    Returns the ID of the fetch condition - used for removing it from the crawler
    later.

*/
Crawler.prototype.addFetchCondition = function(callback) {
    var crawler = this;
    if (callback instanceof Function) {
        crawler._fetchConditions.push(callback);
        return crawler._fetchConditions.length - 1;
    }
    throw new Error("Fetch Condition must be a function.");
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

        return Boolean(crawler._fetchConditions.splice(index, 1));
    }
    throw new Error("Unable to find indexed Fetch Condition.");
};

module.exports = Crawler;
