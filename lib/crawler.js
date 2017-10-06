/**
 * @file simplecrawler is a straightforward, event driven web crawler
 * @author Christopher Giffard <christopher.giffard@cgiffard.com>
 * @author Fredrik Ekelund <fredrik@fredrik.computer>
 */

var FetchQueue  = require("./queue.js"),
    CookieJar   = require("./cookies.js"),
    packageJson = require("../package.json");

var http            = require("http"),
    https           = require("https"),
    EventEmitter    = require("events").EventEmitter,
    uri             = require("urijs"),
    async           = require("async"),
    zlib            = require("zlib"),
    util            = require("util"),
    iconv           = require("iconv-lite"),
    robotsTxtParser = require("robots-parser");

var QUEUE_ITEM_INITIAL_DEPTH = 1;

/**
 * Creates a new crawler
 * @class
 * @param  {String} initialURL The initial URL to fetch. The hostname that the crawler will confine requests to by default is inferred from this URL.
 * @return {Crawler}           Returns the crawler instance to enable chained API calls
 */
var Crawler = function(initialURL) {
    // Allow the crawler to be initialized without the `new` operator. This is
    // handy for chaining API calls
    if (!(this instanceof Crawler)) {
        return new Crawler(initialURL);
    }

    if (arguments.length > 1) {
        throw new Error("Since 1.0.0, simplecrawler takes a single URL when initialized. Protocol, hostname, port and path are inferred from that argument.");
    }

    if (typeof initialURL !== "string") {
        throw new Error("The crawler needs a URL string to know where to start crawling");
    }

    EventEmitter.call(this);

    var crawler = this,
        parsedURL = uri(initialURL).normalize();

    /**
     * Controls which URL to request first
     * @type {String}
     */
    this.initialURL = initialURL;

    /**
     * Determines what hostname the crawler should limit requests to (so long as
     * {@link Crawler#filterByDomain} is true)
     * @type {String}
     */
    this.host = parsedURL.hostname();

    /**
     * Determines the interval at which new requests are spawned by the crawler,
     * as long as the number of open requests is under the
     * {@link Crawler#maxConcurrency} cap.
     * @type {Number}
     */
    this.interval = 250;

    /**
     * Maximum request concurrency. If necessary, simplecrawler will increase
     * node's http agent maxSockets value to match this setting.
     * @type {Number}
     */
    this.maxConcurrency = 5;

    /**
     * Maximum time we'll wait for headers
     * @type {Number}
     */
    this.timeout = 300000; // 5 minutes

    /**
     * Maximum time we'll wait for async listeners
     * @type {Number}
     */
    this.listenerTTL = 10000; // 10 seconds

    /**
     * Crawler's user agent string
     * @type {String}
     * @default "Node/simplecrawler <version> (https://github.com/cgiffard/node-simplecrawler)"
     */
    this.userAgent =
        "Node/" + packageJson.name + " " + packageJson.version +
        " (" + packageJson.repository.url + ")";

    /**
     * Queue for requests. The crawler can use any implementation so long as it
     * uses the same interface. The default queue is simply backed by an array.
     * @type {FetchQueue}
     */
    this.queue = new FetchQueue();

    /**
     * Controls whether the crawler respects the robots.txt rules of any domain.
     * This is done both with regards to the robots.txt file, and `<meta>` tags
     * that specify a `nofollow` value for robots. The latter only applies if
     * the default {@link Crawler#discoverResources} method is used, though.
     * @type {Boolean}
     */
    this.respectRobotsTxt = true;

    /**
     * Controls whether the crawler is allowed to change the
     * {@link Crawler#host} setting if the first response is a redirect to
     * another domain.
     * @type {Boolean}
     */
    this.allowInitialDomainChange = false;

    /**
     * Controls whether HTTP responses are automatically decompressed based on
     * their Content-Encoding header. If true, it will also assign the
     * appropriate Accept-Encoding header to requests.
     * @type {Boolean}
     */
    this.decompressResponses = true;

    /**
     * Controls whether HTTP responses are automatically character converted to
     * standard JavaScript strings using the {@link https://www.npmjs.com/package/iconv-lite|iconv-lite}
     * module before emitted in the {@link Crawler#event:fetchcomplete} event.
     * The character encoding is interpreted from the Content-Type header
     * firstly, and secondly from any `<meta charset="xxx" />` tags.
     * @type {Boolean}
     */
    this.decodeResponses = false;

    /**
     * Controls whether the crawler fetches only URL's where the hostname
     * matches {@link Crawler#host}. Unless you want to be crawling the entire
     * internet, I would recommend leaving this on!
     * @type {Boolean}
     */
    this.filterByDomain = true;

    /**
     * Controls whether URL's that points to a subdomain of {@link Crawler#host}
     * should also be fetched.
     * @type {Boolean}
     */
    this.scanSubdomains = false;

    /**
     * Controls whether to treat the www subdomain as the same domain as
     * {@link Crawler#host}. So if {@link http://example.com/example} has
     * already been fetched, {@link http://www.example.com/example} won't be
     * fetched also.
     * @type {Boolean}
     */
    this.ignoreWWWDomain = true;

    /**
     * Controls whether to strip the www subdomain entirely from URL's at queue
     * item construction time.
     * @type {Boolean}
     */
    this.stripWWWDomain = false;

    /**
     * Internal cache store. Must implement `SimpleCache` interface. You can
     * save the site to disk using the built in file system cache like this:
     *
     * ```js
     * crawler.cache = new Crawler.cache('pathToCacheDirectory');
     * ```
     * @type {SimpleCache}
     */
    this.cache = null;

    /**
     * Controls whether an HTTP proxy should be used for requests
     * @type {Boolean}
     */
    this.useProxy = false;

    /**
     * If {@link Crawler#useProxy} is true, this setting controls what hostname
     * to use for the proxy
     * @type {String}
     */
    this.proxyHostname = "127.0.0.1";

    /**
     * If {@link Crawler#useProxy} is true, this setting controls what port to
     * use for the proxy
     * @type {Number}
     */
    this.proxyPort = 8123;

    /**
     * If {@link Crawler#useProxy} is true, this setting controls what username
     * to use for the proxy
     * @type {String}
     */
    this.proxyUser = null;

    /**
     * If {@link Crawler#useProxy} is true, this setting controls what password
     * to use for the proxy
     * @type {String}
     */
    this.proxyPass = null;

    /**
     * Controls whether to use HTTP Basic Auth
     * @type {Boolean}
     */
    this.needsAuth = false;

    /**
     * If {@link Crawler#needsAuth} is true, this setting controls what username
     * to send with HTTP Basic Auth
     * @type {String}
     */
    this.authUser = null;

    /**
     * If {@link Crawler#needsAuth} is true, this setting controls what password
     * to send with HTTP Basic Auth
     * @type {String}
     */
    this.authPass = null;

    /**
     * Controls whether to save and send cookies or not
     * @type {Boolean}
     */
    this.acceptCookies = true;

    /**
     * The module used to store cookies
     * @type {CookieJar}
     */
    this.cookies = new CookieJar();

    /**
     * Controls what headers (besides the default ones) to include with every
     * request.
     * @type {Object}
     */
    this.customHeaders = {};

    /**
     * Controls what domains the crawler is allowed to fetch from, regardless of
     * {@link Crawler#host} or {@link Crawler#filterByDomain} settings.
     * @type {Array}
     */
    this.domainWhitelist = [];

    /**
     * Controls what protocols the crawler is allowed to fetch from
     * @type {RegExp[]}
     */
    this.allowedProtocols = [
        /^http(s)?$/i,                  // HTTP & HTTPS
        /^(rss|atom|feed)(\+xml)?$/i    // RSS / XML
    ];

    /**
     * Controls the maximum allowed size in bytes of resources to be fetched
     * @default 16777216
     * @type {Number}
     */
    this.maxResourceSize = 1024 * 1024 * 16; // 16mb

    /**
     * Controls what mimetypes the crawler will scan for new resources. If
     * {@link Crawler#downloadUnsupported} is false, this setting will also
     * restrict what resources are downloaded.
     * @type {Array.<RegExp|string>}
     */
    this.supportedMimeTypes = [
        /^text\//i,
        /^application\/(rss|html|xhtml)?[\+\/\-]?xml/i,
        /^application\/javascript/i,
        /^xml/i
    ];

    /**
     * Controls whether to download resources with unsupported mimetypes (as
     * specified by {@link Crawler#supportedMimeTypes})
     * @type {Boolean}
     */
    this.downloadUnsupported = true;

    /**
     * Controls what URL encoding to use. Can be either "unicode" or "iso8859"
     * @type {String}
     */
    this.urlEncoding = "unicode";

    /**
     * Controls whether to strip query string parameters from URL's at queue
     * item construction time.
     * @type {Boolean}
     */
    this.stripQuerystring = false;

    /**
     * Controls whether to sort query string parameters from URL's at queue
     * item construction time.
     * @type {Boolean}
     */
    this.sortQueryParameters = false;

    /**
     * Collection of regular expressions and functions that are applied in the
     * default {@link Crawler#discoverResources} method.
     * @type {Array.<RegExp|Function>}
     */
    this.discoverRegex = [
        /\s(?:href|src)\s?=\s?(["']).*?\1/ig,
        /\s(?:href|src)\s?=\s?[^"'\s][^\s>]+/ig,
        /\s?url\((["']).*?\1\)/ig,
        /\s?url\([^"'].*?\)/ig,

        // This could easily duplicate matches above, e.g. in the case of
        // href="http://example.com"
        /https?:\/\/[^?\s><'"]+/ig,

        // This might be a bit of a gamble... but get hard-coded
        // strings out of javacript: URLs. They're often popup-image
        // or preview windows, which would otherwise be unavailable to us.
        // Worst case scenario is we make some junky requests.
        /^javascript:\s*[\w$.]+\(['"][^'"\s]+/ig,

        // Find srcset links
        function(string) {
            var result = /\ssrcset\s*=\s*(["'])(.*)\1/.exec(string);
            return Array.isArray(result) ? String(result[2]).split(",").map(function(string) {
                return string.trim().split(/\s+/)[0];
            }) : "";
        },

        // Find resources in <meta> redirects. We need to wrap these RegExp's in
        // functions because we only want to return the first capture group, not
        // the entire match. And we need two RegExp's because the necessary
        // attributes on the <meta> tag can appear in any order
        function(string) {
            var match = string.match(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'] ?[^"'>]*url=([^"'>]*)["']?[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        },
        function(string) {
            var match = string.match(/<meta[^>]*content\s*=\s*["']?[^"'>]*url=([^"'>]*)["']?[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/i);
            return Array.isArray(match) ? [match[1]] : undefined;
        }
    ];

    /**
     * Controls whether the default {@link Crawler#discoverResources} should
     * scan for new resources inside of HTML comments.
     * @type {Boolean}
     */
    this.parseHTMLComments = true;

    /**
     * Controls whether the default {@link Crawler#discoverResources} should
     * scan for new resources inside of `<script>` tags.
     * @type {Boolean}
     */
    this.parseScriptTags = true;

    /**
     * Controls the max depth of resources that the crawler fetches. 0 means
     * that the crawler won't restrict requests based on depth. The initial
     * resource, as well as manually queued resources, are at depth 1. From
     * there, every discovered resource adds 1 to its referrer's depth.
     * @type {Number}
     */
    this.maxDepth = 0;

    /**
     * Controls whether to proceed anyway when the crawler encounters an invalid
     * SSL certificate.
     * @type {Boolean}
     */
    this.ignoreInvalidSSL = false;

    /**
     * Controls what HTTP agent to use. This is useful if you want to configure
     * eg. a SOCKS client.
     * @type {HTTPAgent}
     */
    this.httpAgent = http.globalAgent;

    /**
     * Controls what HTTPS agent to use. This is useful if you want to configure
     * eg. a SOCKS client.
     * @type {HTTPAgent}
     */
    this.httpsAgent = https.globalAgent;

    // STATE (AND OTHER) VARIABLES NOT TO STUFF WITH
    var hiddenProps = {
        _downloadConditions: [],
        _fetchConditions: [],
        _isFirstRequest: true,
        _openListeners: 0,
        _openRequests: [],
        _robotsTxts: [],
        _touchedHosts: []
    };

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

/**
 * Starts or resumes the crawl. It adds a queue item constructed from
 * {@link Crawler#initialURL} to the queue. The crawler waits for
 * process.nextTick to begin, so handlers and other properties can be altered or
 * addressed before the crawl commences.
 * @return {Crawler} Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.start = function() {
    var crawler = this;

    if (crawler.running) {
        return crawler;
    }

    crawler.running = true;

    var queueItem = crawler.processURL(crawler.initialURL);
    queueItem.referrer = undefined;
    queueItem.depth = QUEUE_ITEM_INITIAL_DEPTH;

    crawler.queue.add(queueItem, false, function(error) {
        if (error && error.code !== "DUPLICATE") {
            throw error;
        }

        process.nextTick(function() {
            crawler.crawlIntervalID = setInterval(crawler.crawl.bind(crawler),
                crawler.interval);

            crawler.crawl();
        });

        /**
         * Fired when the crawl starts. This event gives you the opportunity to
         * adjust the crawler's configuration, since the crawl won't actually start
         * until the next processor tick.
         * @event Crawler#fetchstart
         */
        crawler.emit("crawlstart");
    });

    return crawler;
};

/**
 * Determines whether robots.txt rules allows the fetching of a particular URL
 * or not
 * @param  {String} url The full URL of the resource that is to be fetched (or not)
 * @return {Boolean}    Returns true if the URL is allowed to be fetched, otherwise false
 */
Crawler.prototype.urlIsAllowed = function(url) {
    var crawler = this;

    var formattedURL = uri(url).normalize().href(),
        allowed = false;

    // The punycode module sometimes chokes on really weird domain
    // names. Catching those errors to prevent crawler from crashing
    try {
        allowed = crawler._robotsTxts.reduce(function(result, robots) {
            var allowed = robots.isAllowed(formattedURL, crawler.userAgent);
            return result !== undefined ? result : allowed;
        }, undefined);
    } catch (error) {
        // URL will be avoided
    }

    return allowed === undefined ? true : allowed;
};

/**
 * Generates a configuration object for http[s].request
 * @param  {QueueItem} queueItem The queue item for which a request option object should be generated
 * @return {Object}              Returns an object that can be passed directly to http[s].request
 */
Crawler.prototype.getRequestOptions = function(queueItem) {
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
    if (requestPort === 80 || requestPort === 443 || !requestPort) {
        delete requestOptions.port;
    }

    // Add cookie header from cookie jar if we're configured to
    // send/accept cookies
    if (crawler.acceptCookies && crawler.cookies.getAsHeader()) {
        requestOptions.headers.cookie =
            crawler.cookies.getAsHeader(queueItem.host, queueItem.path).join("; ");
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

/**
 * Performs an HTTP request for the robots.txt resource on any domain
 * @param  {String} url                            The full URL to the robots.txt file, eg. "http://example.com/robots.txt"
 * @param  {Crawler~getRobotsTxtCallback} callback The callback called with the server's response, or an error
 * @return {Crawler}                               Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.getRobotsTxt = function(url, callback) {
    var crawler = this,
        errorMsg;

    var robotsTxtUrl = uri(url);
    var client = robotsTxtUrl.protocol() === "https" ? https : http;

    // Apply the ignoreInvalidSSL setting to https connections
    if (client === https && crawler.ignoreInvalidSSL) {
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

            response.on("data", function(chunk) {
                if (responseLengthReceived + chunk.length <= crawler.maxResourceSize) {
                    chunk.copy(responseBuffer, responseLengthReceived, 0, chunk.length);
                    responseLengthReceived += chunk.length;
                } else {
                    response.destroy();
                    callback(new Error("robots.txt exceeded maxResourceSize"));
                }
            });

            var decodeAndReturnResponse = function(error, responseBuffer) {
                if (error) {
                    return callback(new Error("Couldn't unzip robots.txt response body"));
                }

                var contentType = response.headers["content-type"],
                    responseBody = crawler.decodeBuffer(responseBuffer, contentType);

                callback(undefined, robotsTxtUrl.href(), responseBody);
            };

            response.on("end", function() {
                var contentEncoding = response.headers["content-encoding"];

                if (contentEncoding && /(gzip|deflate)/.test(contentEncoding)) {
                    zlib.unzip(responseBuffer, decodeAndReturnResponse);
                } else {
                    decodeAndReturnResponse(undefined, responseBuffer);
                }
            });
        } else if (response.statusCode >= 300 && response.statusCode < 400 &&
            response.headers.location) {

            response.destroy();

            var redirectTarget;

            try {
                redirectTarget = uri(response.headers.location)
                    .absoluteTo(robotsTxtUrl)
                    .normalize();
            } catch (error) {
                var robotsTxtHost = uri(robotsTxtUrl).pathname("").href();
                errorMsg = util.format("Faulty redirect URL when fetching robots.txt for %s", robotsTxtHost);

                return callback(new Error(errorMsg));
            }

            if (crawler.domainValid(redirectTarget.hostname())) {
                crawler.getRobotsTxt(redirectTarget.href(), callback);
            } else {
                errorMsg = util.format("%s redirected to a disallowed domain (%s)", robotsTxtUrl.href(), redirectTarget.hostname());
                callback(new Error(errorMsg));
            }
        } else {
            response.destroy();

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
        if (!clientRequest.aborted) {
            callback(errorData);
        }
    });

    return crawler;
};

/**
 * Determines whether the crawler supports a protocol
 * @param  {String} URL A full URL, eg. "http://example.com"
 * @return {Boolean}    Returns true if the protocol of the URL is supported, false if not
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

/**
 * Determines whether the crawler supports a mimetype
 * @param  {String} mimetype Eg. "text/html" or "application/octet-stream"
 * @return {Boolean}         Returns true if the mimetype is supported, false if not
 */
Crawler.prototype.mimeTypeSupported = function(mimetype) {
    var crawler = this;

    return crawler.supportedMimeTypes.some(function(mimeCheck) {
        if (typeof mimeCheck === "string") {
            return mimeCheck === mimetype;
        }

        return mimeCheck.test(mimetype);
    });
};

/**
 * Constructs a queue item from a URL and a referrer queue item.
 * @param  {String} url           An absolute or relative URL to construct a queue item from
 * @param  {QueueItem} [referrer] The queue item representing the resource where this URL was discovered
 * @return {QueueItem}            Returns a new queue item
 */
Crawler.prototype.processURL = function(url, referrer) {
    var newUrl,
        crawler = this;

    if (typeof referrer !== "object") {
        referrer = {
            url: crawler.initialURL,
            depth: QUEUE_ITEM_INITIAL_DEPTH - 1
        };
    }

    // If the URL didn't contain anything, don't fetch it.
    if (!(url && url.trim().length)) {
        return false;
    }

    // Check if querystring should be ignored
    if (crawler.stripQuerystring) {
        url = uri(url).search("").href();
    }

    // Canonicalize the URL by sorting query parameters.
    if (crawler.sortQueryParameters) {
        url = uri(url).query(function(data) {
            var _data = {};
            Object.keys(data).sort().forEach(function(key) {
                _data[key] = data[key];
            });
            return _data;
        }).href();
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

/**
 * Performs string replace operations on a URL string. Eg. removes HTML
 * attribute fluff around actual URL, replaces leading "//" with absolute
 * protocol etc.
 * @private
 * @param  {String} URL          The URL to be cleaned
 * @param  {QueueItem} queueItem The queue item representing the resource where this URL was discovered
 * @return {String}              Returns the cleaned URL
 */
function cleanURL (URL, queueItem) {
    return URL
        .replace(/^(?:\s*href|\s*src)\s*=+\s*/i, "")
        .replace(/^\s*/, "")
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/^url\((.*)\)/i, "$1")
        .replace(/^javascript:\s*(\w*\(['"](.*)['"]\))*.*/i, "$2")
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

/**
 * Cleans a list of resources, usually provided by
 * {@link Crawler#discoverResources}. Also makes relative URL's absolute to the
 * URL of the queueItem argument.
 * @param  {Array} urlMatch      An array of URL's
 * @param  {QueueItem} queueItem The queue item representing the resource where the URL's were discovered
 * @return {Array}               Returns an array of unique and absolute URL's
 */
Crawler.prototype.cleanExpandResources = function (urlMatch, queueItem) {
    "use strict";
    var crawler = this;

    if (!urlMatch) {
        return [];
    }
    const URLs = new Set();
    let URL;
    for (let i = 0; i < urlMatch.length; i++) {
        URL = urlMatch[i];

        if (!URL) {
            continue;
        }

        URL = cleanURL(URL, queueItem);

        // Ensure URL is whole and complete
        try {
            URL = uri(URL)
                .absoluteTo(queueItem.url || "")
                .normalize()
                .href();
        } catch (e) {
            // But if URI.js couldn't parse it - nobody can!
            continue;
        }

        // If we hit an empty item, don't return it
        if (!URL.length) {
            continue;
        }

        // If we don't support the protocol in question
        if (!crawler.protocolSupported(URL)) {
            continue;
        }

        URLs.add(URL);
    }

    return Array.from(URLs);
};

/**
 * Discovers linked resources in an HTML, XML or text document.
 * @param  {String} resourceText The body of the text document that is to be searched for resources
 * @return {Array}               Returns the array of discovered URL's. It is not the responsibility of this method to clean this array of duplicates etc. That's what {@link Crawler#cleanExpandResources} is for.
 */
Crawler.prototype.discoverResources = function(resourceText) {
    var crawler = this;

    if (!crawler.parseHTMLComments) {
        resourceText = resourceText.replace(/<!--([\s\S]+?)-->/g, "");
    }

    if (!crawler.parseScriptTags) {
        resourceText = resourceText.replace(/<script(.*?)>([\s\S]*?)<\/script>/gi, "");
    }

    if (crawler.respectRobotsTxt && /<meta(?:\s[^>]*)?\sname\s*=\s*["']?robots["']?[^>]*>/i.test(resourceText)) {
        var robotsValue = /<meta(?:\s[^>]*)?\scontent\s*=\s*["']?([\w\s,]+)["']?[^>]*>/i.exec(resourceText.toLowerCase());

        if (Array.isArray(robotsValue) && /nofollow/i.test(robotsValue[1])) {
            return [];
        }
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

/**
 * Determines whether a domain is valid for crawling based on configurable
 * rules.
 * @param  {String} host The domain name that's a candidate for fetching
 * @return {Boolean}     Returns true if the crawler if allowed to fetch resources from the domain, false if not.
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

/**
 * Initiates discovery of linked resources in an HTML or text document, and
 * queues the resources if applicable. Not to be confused with
 * {@link Crawler#discoverResources}, despite that method being the main
 * component of this one, since this method queues the resources in addition to
 * discovering them.
 * @fires  Crawler#discoverycomplete
 * @param  {String|Buffer} resourceData The document body to search for URL's
 * @param  {QueueItem} queueItem        The queue item that represents the fetched document body
 * @return {Crawler}                    Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.queueLinkedItems = function(resourceData, queueItem) {
    var crawler = this;

    var resources = crawler.discoverResources(resourceData.toString(), queueItem);
    resources = crawler.cleanExpandResources(resources, queueItem);

    /**
     * Fired when a request times out
     * @event Crawler#fetchtimeout
     * @param {QueueItem} queueItem The queue item for which the request timed out
     * @param {Number} timeout      The delay in milliseconds after which the request timed out
     */
    crawler.emit("discoverycomplete", queueItem, resources);

    resources.forEach(function(url) {
        if (crawler.maxDepth === 0 || queueItem.depth + 1 <= crawler.maxDepth) {
            crawler.queueURL(url, queueItem);
        }
    });

    return crawler;
};

/**
 * Queues a URL for fetching after cleaning, validating and constructing a queue
 * item from it. If you're queueing a URL manually, use this method rather than
 * {@link Crawler#queue#add}
 * @fires Crawler#invaliddomain
 * @fires Crawler#fetchdisallowed
 * @fires Crawler#fetchconditionerror
 * @fires Crawler#fetchprevented
 * @fires Crawler#queueduplicate
 * @fires Crawler#queueerror
 * @fires Crawler#queueadd
 * @param {String} url            An absolute or relative URL. If relative, {@link Crawler#processURL} will make it absolute to the referrer queue item.
 * @param {QueueItem} [referrer]  The queue item representing the resource where this URL was discovered.
 * @param {Boolean} [force]       If true, the URL will be queued regardless of whether it already exists in the queue or not.
 * @return {Boolean}              The return value used to indicate whether the URL passed all fetch conditions and robots.txt rules. With the advent of async fetch conditions, the return value will no longer take fetch conditions into account.
 */
Crawler.prototype.queueURL = function(url, referrer, force) {
    var crawler = this,
        queueItem = typeof url === "object" ? url : crawler.processURL(url, referrer);

    // URL Parser decided this URL was junky. Next please!
    if (!queueItem) {
        return false;
    }

    // Check that the domain is valid before adding it to the queue
    if (!crawler.domainValid(queueItem.host)) {
        /**
         * Fired when a resource wasn't queued because of an invalid domain name
         * @event Crawler#invaliddomain
         * @param {QueueItem} queueItem The queue item representing the disallowed URL
         */
        crawler.emit("invaliddomain", queueItem);
        return false;
    }

    if (!crawler.urlIsAllowed(queueItem.url)) {
        /**
         * Fired when a resource wasn't queued because it was disallowed by the
         * site's robots.txt rules
         * @event Crawler#fetchdisallowed
         * @param {QueueItem} queueItem The queue item representing the disallowed URL
         */
        crawler.emit("fetchdisallowed", queueItem);
        return false;
    }

    async.every(crawler._fetchConditions, function(fetchCondition, callback) {
        if (fetchCondition === undefined) {
            callback(null, true);
        } else if (fetchCondition.length < 3) {
            try {
                callback(null, fetchCondition(queueItem, referrer));
            } catch (error) {
                callback(error);
            }
        } else {
            fetchCondition(queueItem, referrer, callback);
        }
    }, function(error, result) {
        if (error) {
            /**
             * Fired when a fetch condition returns an error
             * @event Crawler#fetchconditionerror
             * @param {QueueItem} queueItem The queue item that was processed when the error was encountered
             * @param {*}         error
             */
            crawler.emit("fetchconditionerror", queueItem, error);
            return false;
        }

        if (!result) {
            /**
             * Fired when a fetch condition prevented the queueing of a URL
             * @event Crawler#fetchprevented
             * @param {QueueItem} queueItem      The queue item that didn't pass the fetch conditions
             * @param {Function}  fetchCondition The first fetch condition that returned false
             */
            crawler.emit("fetchprevented", queueItem);
            return false;
        }

        crawler.queue.add(queueItem, force, function(error) {
            if (error) {
                if (error.code && error.code === "DUPLICATE") {
                    /**
                     * Fired when a new queue item was rejected because another
                     * queue item with the same URL was already in the queue
                     * @event Crawler#queueduplicate
                     * @param {QueueItem} queueItem The queue item that was rejected
                     */
                    return crawler.emit("queueduplicate", queueItem);
                }

                /**
                 * Fired when an error was encountered while updating a queue item
                 * @event Crawler#queueerror
                 * @param {QueueItem} error     The error that was returned by the queue
                 * @param {QueueItem} queueItem The queue item that the crawler tried to update when it encountered the error
                 */
                return crawler.emit("queueerror", error, queueItem);
            }

            /**
             * Fired when an item was added to the crawler's queue
             * @event Crawler#queueadd
             * @param {QueueItem} queueItem The queue item that was added to the queue
             * @param {QueueItem} referrer  The queue item representing the resource where the new queue item was found
             */
            crawler.emit("queueadd", queueItem, referrer);
        });
    });

    return true;
};

/**
 * Handles the initial fetching of a queue item. Once an initial response has
 * been received, {@link Crawler#handleResponse} will handle the downloading of
 * the resource data
 * @fires  Crawler#fetchstart
 * @fires  Crawler#fetchtimeout
 * @fires  Crawler#fetchclienterror
 * @param  {QueueItem} queueItem The queue item that will be fetched
 * @return {Crawler}             Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.fetchQueueItem = function(queueItem) {
    var crawler = this;

    crawler.queue.update(queueItem.id, {
        status: "spooled"
    }, function(error, queueItem) {
        if (error) {
            return crawler.emit("queueerror", error, queueItem);
        }

        var client = queueItem.protocol === "https" ? https : http,
            agent  = queueItem.protocol === "https" ? crawler.httpsAgent : crawler.httpAgent;

        if (agent.maxSockets < crawler.maxConcurrency) {
            agent.maxSockets = crawler.maxConcurrency;
        }

        if (client === https && crawler.ignoreInvalidSSL) {
            client.rejectUnauthorized = false;
            client.strictSSL = false;
        }

        var requestOptions = crawler.getRequestOptions(queueItem),
            timeCommenced = Date.now();

        var clientRequest = client.request(requestOptions, function(response) {
            crawler.handleResponse(queueItem, response, timeCommenced);
        });

        clientRequest.end();

        // Enable central tracking of this request
        crawler._openRequests.push(clientRequest);

        // Ensure the request is removed from the tracking array if it is
        // forcibly aborted
        clientRequest.on("abort", function() {
            if (crawler._openRequests.indexOf(clientRequest) > -1) {
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(clientRequest), 1);
            }
        });

        clientRequest.setTimeout(crawler.timeout, function() {
            if (queueItem.fetched) {
                return;
            }

            if (crawler.running && !queueItem.fetched) {
                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(clientRequest), 1);
            }

            crawler.queue.update(queueItem.id, {
                fetched: true,
                status: "timeout"
            }, function(error, queueItem) {
                if (error) {
                    return crawler.emit("queueerror", error, queueItem);
                }

                /**
                 * Fired when a request times out
                 * @event Crawler#fetchtimeout
                 * @param {QueueItem} queueItem The queue item for which the request timed out
                 * @param {Number} timeout      The delay in milliseconds after which the request timed out
                 */
                crawler.emit("fetchtimeout", queueItem, crawler.timeout);
                clientRequest.abort();
            });
        });

        clientRequest.on("error", function(errorData) {

            // This event will be thrown if we manually aborted the request,
            // but we don't want to do anything in that case.
            if (clientRequest.aborted) {
                return;
            }

            if (crawler.running && !queueItem.fetched) {
                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(clientRequest), 1);
            }

            crawler.queue.update(queueItem.id, {
                fetched: true,
                status: "failed",
                stateData: {
                    code: 600
                }
            }, function(error, queueItem) {
                if (error) {
                    return crawler.emit("queueerror", error, queueItem);
                }

                /**
                 * Fired when a request encounters an unknown error
                 * @event Crawler#fetchclienterror
                 * @param {QueueItem} queueItem The queue item for which the request has errored
                 * @param {Object} error        The error supplied to the `error` event on the request
                 */
                crawler.emit("fetchclienterror", queueItem, errorData);
            });
        });

        /**
         * Fired just after a request has been initiated
         * @event Crawler#fetchstart
         * @param {QueueItem} queueItem   The queue item for which the request has been initiated
         * @param {Object} requestOptions The options generated for the HTTP request
         */
        crawler.emit("fetchstart", queueItem, requestOptions);
    });

    return crawler;
};

/**
 * Decodes a string buffer based on a complete Content-Type header. Will also
 * look for an embedded <meta> tag with a charset definition, but the
 * Content-Type header is prioritized, see the [MDN documentation]{@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta#attr-charset}
 * for more details.
 * @param  {Buffer} buffer              A response buffer
 * @param  {String} [contentTypeHeader] ContentType header received from HTTP request
 * @return {String}                     The decoded buffer contents
 */
Crawler.prototype.decodeBuffer = function(buffer, contentTypeHeader) {
    contentTypeHeader = contentTypeHeader || "";

    var embeddedEncoding = /<meta[^>]*charset\s*=\s*["']?([\w\-]*)/i.exec(buffer.toString(undefined, 0, 512)) || [],
        encoding = contentTypeHeader.split("charset=")[1] || embeddedEncoding[1] || contentTypeHeader;

    encoding = iconv.encodingExists(encoding) ? encoding : "utf8";

    return iconv.decode(buffer, encoding);
};

/**
 * Handles downloading of a resource after an initial HTTP response has been
 * received.
 * @fires  Crawler#fetchheaders
 * @fires  Crawler#fetchcomplete
 * @fires  Crawler#fetchdataerror
 * @fires  Crawler#notmodified
 * @fires  Crawler#fetchredirect
 * @fires  Crawler#fetch404
 * @fires  Crawler#fetcherror
 * @param  {QueueItem} queueItem             A queue item representing the resource to be fetched
 * @param  {http.IncomingMessage} response   An instace of [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage}
 * @param  {Date} [timeCommenced=Date.now()] Specifies at what time the request was initiated
 * @return {Crawler}                         Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.handleResponse = function(queueItem, response, timeCommenced) {
    var crawler = this,
        dataReceived = false,
        timeHeadersReceived = Date.now(),
        timeDataReceived,
        redirectQueueItem,
        responseBuffer,
        responseLength,
        responseLengthReceived = 0,
        contentType = response.headers["content-type"];

    timeCommenced = timeCommenced || Date.now();
    responseLength = parseInt(response.headers["content-length"], 10);
    responseLength = !isNaN(responseLength) ? responseLength : 0;

    crawler.queue.update(queueItem.id, {
        stateData: {
            requestLatency: timeHeadersReceived - timeCommenced,
            requestTime: timeHeadersReceived - timeCommenced,
            contentLength: responseLength,
            contentType: contentType,
            code: response.statusCode,
            headers: response.headers
        }
    }, function(error, queueItem) {
        if (error) {
            return crawler.emit("queueerror", error, queueItem);
        }

        // Do we need to save cookies? Were we sent any?
        if (crawler.acceptCookies && response.headers.hasOwnProperty("set-cookie")) {
            try {
                crawler.cookies.addFromHeaders(response.headers["set-cookie"]);
            } catch (error) {
                /**
                 * Fired when an error was encountered while trying to add a
                 * cookie to the cookie jar
                 * @event Crawler#cookieerror
                 * @param {QueueItem} queueItem The queue item representing the resource that returned the cookie
                 * @param {Error} error         The error that was encountered
                 * @param {String} cookie       The Set-Cookie header value that was returned from the request
                 */
                crawler.emit("cookieerror", queueItem, error, response.headers["set-cookie"]);
            }
        }

        /**
         * Fired when the headers for a request have been received
         * @event Crawler#fetchheaders
         * @param {QueueItem} queueItem           The queue item for which the headers have been received
         * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
         */
        crawler.emit("fetchheaders", queueItem, response);

        // We already know that the response will be too big
        if (responseLength > crawler.maxResourceSize) {

            crawler.queue.update(queueItem.id, {
                fetched: true
            }, function(error, queueItem) {
                if (error) {
                    return crawler.emit("queueerror", error, queueItem);
                }

                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(response.req), 1);

                response.destroy();
                crawler.emit("fetchdataerror", queueItem, response);
            });

        // We should just go ahead and get the data
        } else if (response.statusCode >= 200 && response.statusCode < 300) {

            async.every(crawler._downloadConditions, function(downloadCondition, callback) {
                if (downloadCondition === undefined) {
                    callback(null, true);
                } else if (downloadCondition.length < 3) {
                    try {
                        callback(null, downloadCondition(queueItem, response));
                    } catch (error) {
                        callback(error);
                    }
                } else {
                    downloadCondition(queueItem, response, callback);
                }
            }, function(error, result) {

                if (error) {
                    /**
                     * Fired when a download condition returns an error
                     * @event Crawler#downloadconditionerror
                     * @param {QueueItem} queueItem The queue item that was processed when the error was encountered
                     * @param {*}         error
                     */
                    crawler.emit("downloadconditionerror", queueItem, error);
                    return false;
                }

                if (!result) {
                    crawler.queue.update(queueItem.id, {
                        fetched: true,
                        status: "downloadprevented"
                    }, function(error, queueItem) {
                        crawler._openRequests.splice(
                            crawler._openRequests.indexOf(response.req), 1);

                        response.destroy();
                        /**
                         * Fired when the downloading of a resource was prevented
                         * by a download condition
                         * @event Crawler#downloadprevented
                         * @param {QueueItem} queueItem           The queue item representing the resource that was halfway fetched
                         * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                         */
                        crawler.emit("downloadprevented", queueItem, response);
                    });

                } else {
                    crawler.queue.update(queueItem.id, {
                        status: "headers"
                    }, function(error, queueItem) {
                        if (error) {
                            return crawler.emit("queueerror", error, queueItem);
                        }

                        // Create a buffer with our response length
                        responseBuffer = new Buffer(responseLength);

                        // Only if we're prepared to download non-text resources...
                        if (crawler.downloadUnsupported || crawler.mimeTypeSupported(contentType)) {
                            response.on("data", receiveData);
                            response.on("end", processReceivedData);
                        } else {
                            crawler.queue.update(queueItem.id, {
                                fetched: true
                            }, function() {
                                // Remove this request from the open request map
                                crawler._openRequests.splice(
                                    crawler._openRequests.indexOf(response.req), 1);

                                response.destroy();
                            });
                        }

                        crawler._isFirstRequest = false;
                    });
                }
            });

        // We've got a not-modified response back
        } else if (response.statusCode === 304) {

            if (crawler.cache !== null && crawler.cache.getCacheData) {
                // We've got access to a cache
                crawler.cache.getCacheData(queueItem, function(cacheObject) {
                    crawler.emit("notmodified", queueItem, response, cacheObject);
                });
            } else {
                /**
                 * Fired when the crawler's cache was enabled and the server responded with a 304 Not Modified status for the request
                 * @event Crawler#notmodified
                 * @param {QueueItem} queueItem           The queue item for which the request returned a 304 status
                 * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                 * @param {CacheObject} cacheObject       The CacheObject returned from the cache backend
                 */
                crawler.emit("notmodified", queueItem, response);
            }

            response.destroy();
            // Remove this request from the open request map
            crawler._openRequests.splice(
                crawler._openRequests.indexOf(response.req), 1);

            crawler._isFirstRequest = false;

        // If we should queue a redirect
        } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {

            crawler.queue.update(queueItem.id, {
                fetched: true,
                status: "redirected"
            }, function(error, queueItem) {

                // Parse the redirect URL ready for adding to the queue...
                redirectQueueItem = crawler.processURL(response.headers.location, queueItem);

                /**
                 * Fired when the server returned a redirect HTTP status for the request
                 * @event Crawler#fetchredirect
                 * @param {QueueItem} queueItem           The queue item for which the request was redirected
                 * @param {QueueItem} redirectQueueItem   The queue item for the redirect target resource
                 * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                 */
                crawler.emit("fetchredirect", queueItem, redirectQueueItem, response);

                if (crawler._isFirstRequest) {
                    redirectQueueItem.depth = 1;
                }

                if (crawler.allowInitialDomainChange && crawler._isFirstRequest) {
                    crawler.host = redirectQueueItem.host;
                }

                crawler.queueURL(redirectQueueItem, queueItem);
                response.destroy();

                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(response.req), 1);
            });

        // Ignore this request, but record that we had a 404
        } else if (response.statusCode === 404 || response.statusCode === 410) {

            crawler.queue.update(queueItem.id, {
                fetched: true,
                status: "notfound"
            }, function(error, queueItem) {
                /**
                 * Fired when the server returned a 404 Not Found status for the request
                 * @event Crawler#fetch404
                 * @param {QueueItem} queueItem           The queue item for which the request returned a 404 status
                 * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                 */
                /**
                 * Fired when the server returned a 410 Gone status for the request
                 * @event Crawler#fetch410
                 * @param {QueueItem} queueItem           The queue item for which the request returned a 410 status
                 * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                 */
                crawler.emit("fetch" + response.statusCode, queueItem, response);
                response.destroy();

                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(response.req), 1);

                crawler._isFirstRequest = false;
            });

        // And oh dear. Handle this one as well. (other 400s, 500s, etc)
        } else {

            crawler.queue.update(queueItem.id, {
                fetched: true,
                status: "failed"
            }, function(error, queueItem) {
                /**
                 * Fired when the server returned a status code above 400 that isn't 404 or 410
                 * @event Crawler#fetcherror
                 * @param {QueueItem} queueItem           The queue item for which the request failed
                 * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                 */
                crawler.emit("fetcherror", queueItem, response);
                response.destroy();

                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(response.req), 1);

                crawler._isFirstRequest = false;
            });

        }


        function emitFetchComplete(responseBody, decompressedBuffer) {
            crawler.queue.update(queueItem.id, {
                fetched: true,
                status: "downloaded"
            }, function(error, queueItem) {
                // Remove this request from the open request map
                crawler._openRequests.splice(
                    crawler._openRequests.indexOf(response.req), 1);

                if (error) {
                    return crawler.emit("queueerror", error, queueItem);
                }

                if (crawler.decodeResponses) {
                    responseBody = crawler.decodeBuffer(responseBody, queueItem.stateData.contentType);
                }

                /**
                 * Fired when the request has completed
                 * @event Crawler#fetchcomplete
                 * @param {QueueItem} queueItem           The queue item for which the request has completed
                 * @param {String|Buffer} responseBody    If Crawler.decodeResponses is true, this will be the decoded HTTP response. Otherwise it will be the raw response buffer.
                 * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                 */
                crawler.emit("fetchcomplete", queueItem, responseBody, response);

                // We only process the item if it's of a valid mimetype
                // and only if the crawler is set to discover its own resources
                if (crawler.mimeTypeSupported(contentType) && crawler.discoverResources) {
                    crawler.queueLinkedItems(decompressedBuffer || responseBody, queueItem);
                }
            });
        }

        // Function for dealing with 200 responses
        function processReceivedData() {
            if (dataReceived || queueItem.fetched) {
                return;
            }

            responseBuffer = responseBuffer.slice(0, responseLengthReceived);
            dataReceived = true;
            timeDataReceived = Date.now();

            crawler.queue.update(queueItem.id, {
                stateData: {
                    downloadTime: timeDataReceived - timeHeadersReceived,
                    requestTime: timeDataReceived - timeCommenced,
                    actualDataSize: responseBuffer.length,
                    sentIncorrectSize: responseBuffer.length !== responseLength
                }
            }, function (error, queueItem) {
                if (error) {
                    // Remove this request from the open request map
                    crawler._openRequests.splice(
                        crawler._openRequests.indexOf(response.req), 1);

                    return crawler.emit("queueerror", error, queueItem);
                }

                // First, save item to cache (if we're using a cache!)
                if (crawler.cache && crawler.cache.setCacheData instanceof Function) {
                    crawler.cache.setCacheData(queueItem, responseBuffer);
                }

                // No matter the value of `crawler.decompressResponses`, we still
                // decompress the response if it's gzipped or deflated. This is
                // because we always provide the discoverResources method with a
                // decompressed buffer
                if (/(gzip|deflate)/.test(queueItem.stateData.headers["content-encoding"])) {
                    zlib.unzip(responseBuffer, function(error, decompressedBuffer) {
                        if (error) {
                            /**
                             * Fired when an error was encountered while unzipping the response data
                             * @event Crawler#gziperror
                             * @param {QueueItem} queueItem           The queue item for which the unzipping failed
                             * @param {String|Buffer} responseBody    If Crawler.decodeResponses is true, this will be the decoded HTTP response. Otherwise it will be the raw response buffer.
                             * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                             */
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
            });
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
                    response.destroy();

                    /**
                     * Fired when a resource couldn't be downloaded because it exceeded the maximum allowed size
                     * @event Crawler#fetchdataerror
                     * @param {QueueItem} queueItem           The queue item for which the request failed
                     * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
                     */
                    crawler.emit("fetchdataerror", queueItem, response);
                }
            } else {
                chunk.copy(responseBuffer, responseLengthReceived, 0, chunk.length);
            }

            responseLengthReceived += chunk.length;
        }
    });


    return crawler;
};

/**
 * The main crawler runloop. Fires at the interval specified in the crawler
 * configuration, when the crawl is running. May be manually fired. This
 * function initiates fetching of a queue item if there are enough workers to do
 * so and there are unfetched items in the queue.
 * @fires Crawler#robotstxterror
 * @fires Crawler#fetchdisallowed
 * @fires Crawler#complete
 * @return {Crawler} Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.crawl = function() {
    var crawler = this;

    if (crawler._openRequests.length >= crawler.maxConcurrency ||
        crawler.fetchingRobotsTxt) {
        return crawler;
    }

    crawler.queue.oldestUnfetchedItem(function(error, queueItem) {
        if (error) {
            // Do nothing
        } else if (queueItem) {

            var url = uri(queueItem.url).normalize();
            var host = uri({
                protocol: url.protocol(),
                hostname: url.hostname(),
                port: url.port()
            }).href();

            if (crawler.respectRobotsTxt && crawler._touchedHosts.indexOf(host) === -1) {
                crawler._touchedHosts.push(host);
                crawler.fetchingRobotsTxt = true;

                var robotsTxtUrl = uri(host).pathname("/robots.txt").href();

                crawler.getRobotsTxt(robotsTxtUrl, function(error, robotsTxtUrl, robotsTxtBody) {
                    if (error) {
                        /**
                         * Fired when an error was encountered while retrieving a robots.txt file
                         * @event Crawler#robotstxterror
                         * @param {Error} error The error returned from {@link Crawler#getRobotsTxt}
                         */
                        crawler.emit("robotstxterror", error);
                    } else {
                        var robotsTxt = robotsTxtParser(robotsTxtUrl, robotsTxtBody);
                        crawler._robotsTxts.push(robotsTxt);

                        var sitemaps = robotsTxt.getSitemaps();
                        var robotsQueueItem = crawler.processURL(robotsTxtUrl, queueItem);

                        sitemaps.forEach(function(sitemap) {
                            crawler.queueURL(sitemap, robotsQueueItem);
                        });
                    }

                    crawler.fetchingRobotsTxt = false;

                    // It could be that the first URL we queued for any particular
                    // host is in fact disallowed, so we double check once we've
                    // fetched the robots.txt
                    if (crawler.urlIsAllowed(queueItem.url)) {
                        crawler.fetchQueueItem(queueItem);
                    } else {
                        crawler.queue.update(queueItem.id, {
                            fetched: true,
                            status: "disallowed"
                        }, function(error, queueItem) {
                            crawler.emit("fetchdisallowed", queueItem);
                        });
                    }
                });
            } else {

                crawler.fetchQueueItem(queueItem);
            }
        } else if (!crawler._openRequests.length && !crawler._openListeners) {

            crawler.queue.countItems({ fetched: true }, function(err, completeCount) {
                if (err) {
                    throw err;
                }

                crawler.queue.getLength(function(err, length) {
                    if (err) {
                        throw err;
                    }

                    if (completeCount === length) {
                        /**
                         * Fired when the crawl has completed - all resources in the queue have been dealt with
                         * @event Crawler#complete
                         */
                        crawler.emit("complete");
                        crawler.stop();
                    }
                });
            });
        }
    });

    return crawler;
};

/**
 * Stops the crawler by terminating the crawl runloop
 * @param  {Boolean} [abortRequestsInFlight=false] If true, will terminate all in-flight requests immediately
 * @return {Crawler}                               Returns the crawler instance to enable chained API calls
 */
Crawler.prototype.stop = function(abortRequestsInFlight) {
    var crawler = this;
    clearInterval(crawler.crawlIntervalID);
    crawler.running = false;

    // If we've been asked to terminate the existing requests, do that now.
    if (abortRequestsInFlight) {
        crawler._openRequests.forEach(function(request) {
            request.abort();
        });
    }

    return crawler;
};

/**
 * Holds the crawler in a 'running' state, preventing the `complete` event from
 * firing until the returned callback has been executed, or a predetermined
 * timeout (as specified by `crawler.listenerTTL`) has elapsed.
 * @return {Function} A callback function that will allow the crawler to continue once called
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

/**
 * Adds a function to an array of functions, where each one is evaluated against
 * every request after the headers of the resource represented by the queue item
 * have been fetched. If any of the functions return false, the resource data
 * will not be downloaded.
 * @param  {Function} callback Function to be called when the headers of the resource represented by the queue item have been downloaded
 * @return {Number}            The index of the download condition in the download conditions array. This can later be used to remove the download condition.
 */
Crawler.prototype.addDownloadCondition = function(callback) {
    if (!(callback instanceof Function)) {
        throw new Error("Download condition must be a function");
    }

    this._downloadConditions.push(callback);
    return this._downloadConditions.length - 1;
};

/**
 * Removes a download condition from the download conditions array.
 * @param  {Number|Function} id The numeric ID of the download condition, or a reference to the download condition itself. The ID was returned from {@link Crawler#addDownloadCondition}
 * @return {Boolean}            If the removal was successful, the method will return true. Otherwise, it will throw an error.
 */
Crawler.prototype.removeDownloadCondition = function(id) {
    var crawler = this;

    if (id instanceof Function) {
        var itemIndex = crawler._downloadConditions.indexOf(id);
        if (itemIndex !== -1) {
            crawler._downloadConditions[itemIndex] = undefined;
            return true;
        }
    } else if (typeof id === "number") {
        if (id >= 0 && id < crawler._downloadConditions.length) {
            if (crawler._downloadConditions[id] !== undefined) {
                crawler._downloadConditions[id] = undefined;
                return true;
            }
        }
    }

    throw new Error("Unable to find indexed download condition");
};

/**
 * Adds a function to an array of functions, where each one is evaluated against
 * every queue item that the crawler attempts to queue. If any of these
 * functions returns false, the queue item will not be queued.
 * @param  {Function} callback Function to be called after resource discovery that's able to prevent queueing of resource
 * @return {Number}            The index of the fetch condition in the fetch conditions array. This can later be used to remove the fetch condition.
 */
Crawler.prototype.addFetchCondition = function(callback) {
    if (!(callback instanceof Function)) {
        throw new Error("Fetch condition must be a function");
    }

    this._fetchConditions.push(callback);
    return this._fetchConditions.length - 1;
};

/**
 * Removes a fetch condition from the fetch conditions array.
 * @param  {Number|Function} id The numeric ID of the fetch condition, or a reference to the fetch condition itself. This was returned from {@link Crawler#addFetchCondition}
 * @return {Boolean}            If the removal was successful, the method will return true. Otherwise, it will throw an error.
 */
Crawler.prototype.removeFetchCondition = function(id) {
    var crawler = this;

    if (id instanceof Function) {
        var itemIndex = crawler._fetchConditions.indexOf(id);
        if (itemIndex !== -1) {
            crawler._fetchConditions[itemIndex] = undefined;
            return true;
        }
    } else if (typeof id === "number") {
        if (id >= 0 && id < crawler._fetchConditions.length) {
            if (crawler._fetchConditions[id] !== undefined) {
                crawler._fetchConditions[id] = undefined;
                return true;
            }
        }
    }

    throw new Error("Unable to find indexed fetch condition");
};

module.exports = Crawler;
