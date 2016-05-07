# Simple web crawler for node.js

[![NPM version](https://img.shields.io/npm/v/simplecrawler.svg)](https://www.npmjs.com/package/simplecrawler)
[![Linux Build Status](https://img.shields.io/travis/cgiffard/node-simplecrawler/master.svg)](https://travis-ci.org/cgiffard/node-simplecrawler)
[![Windows Build Status](https://img.shields.io/appveyor/ci/cgiffard/node-simplecrawler/master.svg?label=Windows%20build)](https://ci.appveyor.com/project/cgiffard/node-simplecrawler/branch/master)
[![Dependency Status](https://img.shields.io/david/cgiffard/node-simplecrawler.svg)](https://david-dm.org/cgiffard/node-simplecrawler)
[![devDependency Status](https://img.shields.io/david/dev/cgiffard/node-simplecrawler.svg)](https://david-dm.org/cgiffard/node-simplecrawler#info=devDependencies)

simplecrawler is designed to provide a basic, flexible and robust API for
crawling websites. I wrote simplecrawler to archive, analyse, and search some
very large websites. It has happily chewed through hundreds of thousands of
pages and written tens of gigabytes to disk without issue.

## What does simplecrawler do?

* Provides a very simple event driven API using `EventEmitter`
* Extremely configurable base for writing your own crawler
* Provides some simple logic for auto-detecting linked resources - which you can
  replace or augment
* Has a flexible queue system which can be frozen to disk and defrosted
* Provides basic statistics on network performance
* Uses buffers for fetching and managing data, preserving binary data (except
  when discovering links)

## Documentation

- [Getting started](#getting-started)
    - [Simplified mode](#simplified-mode)
    - [Regular mode](#regular-mode)
- [Events](#events)
    - [A note about HTTP error conditions](#a-note-about-http-error-conditions)
    - [Waiting for asynchronous event listeners](#waiting-for-asynchronous-event-listeners)
- [Configuration](#configuration)
- [Fetch conditions](#fetch-conditions)
- [The queue](#the-queue)
    - [Manually adding to the queue](#manually-adding-to-the-queue)
    - [Queue items](#queue-items)
    - [Queue statistics and reporting](#queue-statistics-and-reporting)
    - [Saving and reloading the queue (freeze/defrost)](#saving-and-reloading-the-queue-freezedefrost)
- [Cookies](#cookies)
    - [Cookie events](#cookie-events)
- [Link Discovery](#link-discovery)
- [FAQ/Troubleshooting](#faqtroubleshooting)
- [Current Maintainers](#current-maintainers)
- [Contributors](#contributors)
- [License](#license)

## Getting Started

There are two ways of instantiating a new crawler - a simplified but less
flexible method inspired by [anemone](http://anemone.rubyforge.org), and the
traditional method which provides a little more room to configure crawl
parameters.

Regardless of whether you use the simplified or regular method of instantiation,
you'll need to require simplecrawler first:

```js
var Crawler = require("simplecrawler");
```

### Simplified Mode

If all you need is a quick crawl of a small website, the simplified mode of
initiating the crawler provides a slightly quicker way of getting started. It
generates a new crawler for you, preconfigures it based on a URL you provide,
starts the crawl and returns the crawler instance for further configuration and
so that you can attach event handlers.

Simply call `Crawler.crawl` with a URL as the first parameter, and two optional
functions that will be added as event listeners for `fetchcomplete` and
`fetcherror` respectively.

```js
Crawler.crawl("http://example.com/", function(queueItem) {
    console.log("Completed fetching resource:", queueItem.url);
});
```

Alternately, if you decide to omit these functions, you can use the returned
crawler object to add the event listeners yourself, and tweak configuration
options:

```js
var crawler = Crawler.crawl("http://example.com/");

crawler.interval = 500;

crawler.on("fetchcomplete", function(queueItem) {
    console.log("Completed fetching resource:", queueItem.url);
});
```

### Regular Mode

The standard way of creating a crawler is to call the `simplecrawler`
constructor yourself and initiate the crawl manually.

```js
var crawler = new Crawler("www.example.com");
```

Non-standard port? HTTPS? Want to start crawling at a specific path? No problem:

```js
crawler.initialPath = "/archive";
crawler.initialPort = 8080;
crawler.initialProtocol = "https";

// Or:
var crawler = new Crawler("www.example.com", "/archive", 8080);
```

And of course, you're probably wanting to ensure you don't take down your web
server. Decrease the concurrency from five simultaneous requests - and increase
the request interval from the default 250 ms like this:

```js
crawler.interval = 10000; // Ten seconds
crawler.maxConcurrency = 1;
```

You can also define a max depth for links to fetch:

```js
crawler.maxDepth = 1; // Only first page is fetched (with linked CSS & images)
// Or:
crawler.maxDepth = 2; // First page and discovered links from it are fetched
// Or:
crawler.maxDepth = 3; // Etc.
```

For a full list of configurable properties, see the
[configuration section](#configuration).

You'll also need to set up event listeners for the [events](#events) you want to
listen to. `fetchcomplete` and `complete` are a good place to start.

```js
crawler.on("fetchcomplete", function(queueItem, responseBuffer, response) {
    console.log("I just received %s (%d bytes)", queueItem.url, responseBuffer.length);
    console.log("It was a resource of type %s", response.headers['content-type']);
});
```

Then, when you're satisfied and ready to go, start the crawler! It'll run
through its queue finding linked resources on the domain to download, until it
can't find any more.

```js
crawler.start();
```

Of course, once you've got that down pat, there's a fair bit more you can listen for...

### Events

* `crawlstart`
Fired when the crawl begins or is restarted.
* `queueadd` (queueItem)
Fired when a new item is automatically added to the queue (not when you manually
queue an item yourself.)
* `queueduplicate` (URLData)
Fired when an item cannot be added to the queue because it is already present in
the queue. Frequent firing of this event is normal and expected.
* `queueerror` (errorData, URLData)
Fired when an item cannot be added to the queue due to error.
* `fetchstart` (queueItem, requestOptions)
Fired when an item is spooled for fetching. If your event handler is synchronous,
you can modify the crawler request options (including headers and request method.)
* `fetchheaders` (queueItem, responseObject)
Fired when the headers for a resource are received from the server. The node http
response object is returned for your perusal.
* `cookieerror` (queueItem, error, setCookieHeader)
Fired when an error was caught trying to add a cookie to the cookie jar.
* `fetchcomplete` (queueItem, responseBody, responseObject)
Fired when the resource is completely downloaded. The response body is provided as
a Buffer per default, unless `decodeResponses` is truthy, in which case it's a
decoded string representation of the body.
* `fetchdataerror` (queueItem, response)
Fired when a resource can't be downloaded, because it exceeds the maximum size
we're prepared to receive (16MB by default.)
* `fetchredirect` (queueItem, parsedURL, response)
Fired when a redirect header is encountered. The new URL is validated and returned
as a complete canonical link to the new resource.
* `fetch404` (queueItem, response)
Fired when a 404 HTTP status code is returned for a request.
* `fetch410` (queueItem, response)
Fired when a 410 HTTP status code is returned for a request.
* `fetcherror` (queueItem, response)
Fired when an alternate 400 or 500 series HTTP status code is returned for a
request.
* `gziperror` (queueItem, error, resourceData)
Fired when a gzipped resource cannot be unzipped.
* `fetchtimeout` (queueItem, crawlerTimeoutValue)
Fired when a request time exceeds the internal crawler threshold.
* `fetchclienterror` (queueItem, errorData)
Fired when a request dies locally for some reason. The error data is returned as
the second parameter.
* `discoverycomplete` (queueItem, resources)
Fired when linked resources have been discovered. Passes an array of resources
(as URLs) as the second parameter.
* `complete`
Fired when the crawler completes processing all the items in its queue, and does
not find any more to add. This event returns no arguments.

#### A note about HTTP error conditions
By default, simplecrawler does not download the response body when it encounters
an HTTP error status in the response. If you need this information, you can listen
to simplecrawler's error events, and through node's native `data` event
(`response.on("data",function(chunk) {...})`) you can save the information yourself.

### Waiting for asynchronous event listeners

Sometimes, you might want to wait for simplecrawler to wait for you while you
perform some asynchronous tasks in an event listener, instead of having it
racing off and firing the `complete` event, halting your crawl. For example,
if you're doing your own link discovery using an asynchronous library method.

simplecrawler provides a `wait` method you can call at any time. It is available
via `this` from inside listeners, and on the crawler object itself. It returns
a callback function.

Once you've called this method, simplecrawler will not fire the `complete` event
until either you execute the callback it returns, or a timeout is reached
(configured in `crawler.listenerTTL`, by default 10000 ms.)

#### Example asynchronous event listener

```js
crawler.on("fetchcomplete", function(queueItem, data, res) {
    var continue = this.wait();
    doSomeDiscovery(data, function(foundURLs) {
        foundURLs.forEach(crawler.queueURL.bind(crawler));
        continue();
    });
});
```

## Configuration

simplecrawler is highly configurable and there's a long list of settings you can
change to adapt it to your specific needs.

* `crawler.host` -
    The domain to scan. By default, simplecrawler will restrict all requests to
    this domain.
* `crawler.initialPath="/"` -
    The initial path with which the crawler will formulate its first request.
    Does not restrict subsequent requests.
* `crawler.initialPort=80` -
    The initial port with which the crawler will formulate its first request.
    Does not restrict subsequent requests.
* `crawler.initialProtocol="http"` -
    The initial protocol with which the crawler will formulate its first
    request. Does not restrict subsequent requests.
* `crawler.interval=250` -
    The interval with which the crawler will spool up new requests (one per
    tick).
* `crawler.maxConcurrency=5` -
    The maximum number of requests the crawler will run simultaneously. Defaults
    to 5 - the default number of http agents node will run.
* `crawler.timeout=300000` -
    The maximum time in milliseconds the crawler will wait for headers before
    aborting the request.
* `crawler.listenerTTL=10000` -
    The maximum time in milliseconds the crawler will wait for async listeners.
* `crawler.userAgent="Node/simplecrawler <version> (https://github.com/cgiffard/node-simplecrawler)"` -
    The user agent the crawler will report.
* `crawler.decompressResponses=true` -
    Response bodies that are compressed will be automatically decompressed
    before they're emitted in the `fetchcomplete` event. Even if this is falsy,
    compressed responses will be decompressed before they're passed to the
    `discoverResources` method.
* `crawler.decodeResponses=false` -
    Response bodies will be intelligently character converted to standard
    JavaScript strings using the
    [iconv-lite](https://www.npmjs.com/package/iconv-lite) module. The character
    encoding is interpreted from the Content-Type header firstly, and secondly
    from any `<meta charset="xxx" />` tags.
* `crawler.queue` -
    The queue in use by the crawler (Must implement the `FetchQueue` interface)
* `crawler.allowInitialDomainChange=false` -
    If the response for the initial URL is a redirect to another domain (e.g.
    from github.net to github.com), update `crawler.host` to continue the
    crawling on that domain.
* `crawler.filterByDomain=true` -
    Specifies whether the crawler will restrict queued requests to a given
    domain/domains.
* `crawler.scanSubdomains=false` -
    Enables scanning subdomains (other than www) as well as the specified
    domain.
* `crawler.ignoreWWWDomain=true` -
    Treats the `www` domain the same as the originally specified domain.
* `crawler.stripWWWDomain=false` -
    Or go even further and strip WWW subdomain from requests altogether!
* `crawler.stripQuerystring=false` -
    Specify to strip querystring parameters from URL's.
* `crawler.discoverResources` -
    simplecrawler's default resource discovery function -
    which, given a buffer containing a resource, returns an array of URLs.
    For more details about link discovery, see [Link Discovery](#link-discovery)
* `crawler.discoverRegex` -
    Array of regular expressions and functions that simplecrawler uses to
    discover resources. Functions in this array are expected to return an array.
* `crawler.cache` -
    Specify a cache architecture to use when crawling. Must implement
    `SimpleCache` interface. You can save the site to disk using the built in
    file system cache like this:

    ```js
    crawler.cache = new Crawler.cache('pathToCacheDirectory');
    ```

* `crawler.useProxy=false` -
    The crawler should use an HTTP proxy to make its requests.
* `crawler.proxyHostname="127.0.0.1"` -
    The hostname of the proxy to use for requests.
* `crawler.proxyPort=8123` -
    The port of the proxy to use for requests.
* `crawler.proxyUser=null` -
    The username for HTTP/Basic proxy authentication (leave unset for
    unauthenticated proxies.)
* `crawler.proxyPass=null` -
    The password for HTTP/Basic proxy authentication (leave unset for
    unauthenticated proxies.)
* `crawler.domainWhitelist` -
    An array of domains the crawler is permitted to crawl from. If other
    settings are more permissive, they will override this setting.
* `crawler.supportedMimeTypes` -
    An array of RegEx objects used to determine supported MIME types (types of
    data simplecrawler will scan for links.) If you're  not using
    simplecrawler's resource discovery function, this won't have any effect.
* `crawler.allowedProtocols` -
    An array of RegExp objects used to determine whether a URL protocol is
    supported. This is to deal with nonstandard protocol handlers that regular
    HTTP is sometimes given, like `feed:`. It does not provide support for
    non-http protocols (and why would it!?)
* `crawler.maxResourceSize=16777216` -
    The maximum resource size that will be downloaded, in bytes. Defaults to
    16MB.
* `crawler.downloadUnsupported=true` -
    simplecrawler will download files it can't parse. Defaults to true, but if
    you'd rather save the RAM and GC lag, switch it off. When false, it closes
    sockets for unsupported resources.
* `crawler.needsAuth=false` -
    Flag to specify if the domain you are hitting requires basic authentication.
* `crawler.authUser=""` -
    Username provided for `needsAuth` flag.
* `crawler.authPass=""` -
    Password provided for `needsAuth` flag.
* `crawler.customHeaders` -
    An object specifying a number of custom headers simplecrawler will add to
    every request. These override the default headers simplecrawler sets, so be
    careful with them. If you want to tamper with headers on a per-request
    basis, see the `fetchqueue` event.
* `crawler.acceptCookies=true` -
    Flag to indicate if the crawler should hold on to cookies.
* `crawler.urlEncoding="unicode"` -
    Set this to `iso8859` to trigger
    [URI.js](https://medialize.github.io/URI.js/)' re-encoding of iso8859 URL's
    to unicode.
* `crawler.parseHTMLComments=true` -
    Whether to scan for URL's inside HTML comments.
* `crawler.parseScriptTags=true` -
    Whether to scan for URL's inside script tags.
* `crawler.maxDepth=0` -
    Defines a maximum distance from the original request at which resources will
    be downloaded. Asset files are excluded from this distance condition if
    `crawler.fetchWhitelistedMimeTypesBelowMaxDepth` is `true`. Defaults to `0` —
    no max depth.
* `crawler.whitelistedMimeTypes` -
    An array of RegEx objects used to determine whitelisted MIME types (types of
    data simplecrawler will fetch on disregardig the `maxDepth` checks).
    Defaults to common resource types like styles, fonts, scripts and images.
* `crawler.fetchWhitelistedMimeTypesBelowMaxDepth=false` -
    Defines the depth for fetching resources in addition to maxDepth. If `true`,
    then resources (see `whitelistedMimeTypes`) will always be loaded, while
    `false` limits them to the same level. Furthermore a numeric value can be
    specified for a concrete offset (e.g. 1 for the next depth layer).
* `crawler.ignoreInvalidSSL=false` -
    Treat self-signed SSL certificates as valid. SSL certificates will not be
    validated against known CAs. Only applies to https requests. You may also
    have to set the environment variable NODE_TLS_REJECT_UNAUTHORIZED to '0'.
    For example: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';`

## Fetch conditions

simplecrawler has a mechanism you can use to prevent certain resources from
being fetched, based on the URL, called fetch conditions. A fetch condition is a
function that, when given a parsed URL object, returns a value that indicates
whether a given resource should be downloaded.

You may add as many fetch conditions as you like, and remove them at runtime.
simplecrawler will evaluate will evaluate every fetch condition until one is
encountered that returns a falsy value. If that happens,  the resource in
question will not be fetched.

### Adding a fetch condition

This example fetch condition prevents URL's ending in `.pdf` from being
downloaded. Adding a fetch condition assigns it an ID, which the
`addFetchCondition` function returns. You can use this ID to remove the
condition later.

```js
var conditionID = myCrawler.addFetchCondition(function(parsedURL, queueItem) {
    return !parsedURL.path.match(/\.pdf$/i);
});
```

Fetch conditions are called with two arguments: `parsedURL` and `queueItem`.
`parsedURL` represents the resource to be fetched (or not) and has the following
structure:

```js
{
    protocol: "http",
    host: "example.com",
    port: 80,
    path: "/search?q=hello",
    uriPath: "/search",
    depth: 2
}
```

`queueItem` is a representation of the page where this resource was found. See
the [queue item documentation](#queue-items) for details on its structure.

With this information, you can write sophisticated logic for determining which
pages to fetch and which to avoid. For example, you could write a link checker
that checks both internal and external links, yet doesn't continue crawling
other domains by setting `filterByDomain` to false and checking that
`queueItem.host` is the same as `crawler.host`.

### Removing a fetch condition

If you stored the ID of the fetch condition you added earlier, you can remove it
from the crawler:

```js
myCrawler.removeFetchCondition(conditionID);
```

## The queue

Like any other web crawler, simplecrawler has a queue. It can be directly
accessed through `crawler.queue` and is by default only backed by an array,
which means items in the queue can be accessed through array notation. However,
since simplecrawler also supports different backing stores for the queue, the
recommended way of accessing items is through the (pseudo) asynchronous
`crawler.queue.get` method.

```js
crawler.queue.get(5, function (queueItem) {
    // Do something with the queueItem
});
```

Even though this operation is actually synchronous when the default backing
store is used, this method helps maintain compatibility with asynchronous
backing stores that would let you eg. store the queue in a database.

### Manually adding to the queue

The simplest way of manually adding to the queue is to use the crawler's method
`crawler.queueURL`. This method takes a complete URL, validates and deconstructs
it, and adds it to the queue.

```js
var customQueueItem = {
    url: "http://example.com",
    depth: 2
};

crawler.queueURL("/example.html", customQueueItem);
```

If you instead want to add a resource by its components, you may call the
`queue.add` method directly with the signature `protocol`, `hostname`, `port`,
`path`.

### Queue items

Because when working with simplecrawler, you'll constantly be handed queue items,
it helps to know what's inside them. These are the properties every queue item
is expected to have:

* `url` - The complete, canonical URL of the resource
* `protocol` - The protocol of the resource (http, https)
* `host` - The full domain/hostname of the resource
* `port` - The port of the resource
* `path` - The URL path, including the query string
* `uriPath` - The URL path, excluding the query string
* `depth` - How many steps simplecrawler has taken from the initial page (which
is depth 1) to this resource.
* `fetched` - Has the request for this item been completed? You can monitor this
as requests are processed.
* `status` - The internal status of the item, always a string. This can be one
of:
    * `"queued"` - The resource is in the queue to be fetched, but nothing's
    happened to it yet.
    * `"spooled"` - A request has been made to the remote server, but we're
    still waiting for a response.
    * `"headers"` - The headers for the resource have been received.
    * `"downloaded"` - The item has been entirely downloaded.
    * `"redirected"` - The resource request returned a 300 series response, with
    a Location header and a new URL.
    * `"notfound"` - The resource could not be found. (404)
    * `"failed"` - An error occurred when attempting to fetch the resource.
* `stateData` - An object containing state data and other information about the
request:
    * `requestLatency` - The time taken for headers to be received after the
    request was made.
    * `requestTime` - The total time taken for the request (including download
    time.)
    * `downloadTime` - The total time taken for the resource to be downloaded.
    * `contentLength` - The length (in bytes) of the returned content.
    Calculated based on the `content-length` header.
    * `contentType` - The MIME type of the content.
    * `code` - The HTTP status code returned for the request.
    * `headers` - An object containing the header information returned by the
    server. This is the object node returns as part of the `response` object.
    * `actualDataSize` - The length (in bytes) of the returned content.
    Calculated based on what is actually received, not the `content-length`
    header.
    * `sentIncorrectSize` - True if the data length returned by the server did
    not match what we were told to expect by the `content-length` header.

As you can see, you can get a lot of meta-information out about each request.
This has been put to use by providing some convenient methods for getting simple
aggregate data about the queue.

### Queue statistics and reporting

First of all, the queue can provide some basic statistics about the network
performance of your crawl so far. This is done live, so don't check it 30 times
a second. You can test the following properties:

* `requestTime`
* `requestLatency`
* `downloadTime`
* `contentLength`
* `actualDataSize`

You can get the maximum, minimum, and average values for each with the
`crawler.queue.max`, `crawler.queue.min`, and `crawler.queue.avg` functions
respectively. Like the `crawler.queue.get` method, these methods are pseudo
asynchronous to support different backing stores for the queue. That means they
will provide both a return value and a callback.

```js
crawler.queue.max("requestLatency", function (max) {
    console.log("The maximum request latency was %dms.", max);
});
crawler.queue.min("downloadTime", function (min) {
    console.log("The minimum download time was %dms.", min);
});
crawler.queue.avg("actualDataSize", function (avg) {
    console.log("The average resource size received is %d bytes.", avg);
});
```

You'll probably often need to determine how many queue items have a given status
and/or retrieve them. That's easily done with the methods
`crawler.queue.countWithStatus` and `crawler.queue.getWithStatus`.

`crawler.queue.countWithStatus` provides the number of queued items with a given
status, while `crawler.queue.getWithStatus` returns an array of the queue items
themselves. Again, by default, these methods both return and accept callbacks.

```js
crawler.queue.countWithStatus("redirected", function (redirectCount) {
    console.log("The redirect count is %d", redirectCount);
});

crawler.queue.getWithStatus("failed", function (failedItems) {
    failedItems.forEach(function(queueItem) {
        console.log("Whoah, the request for %s failed!", queueItem.url);
    });
});
```

Then there's some even simpler convenience functions:

* `crawler.queue.complete` - provides the number of queue items which have been
  completed (marked as fetched).
* `crawler.queue.errors` - provides the number of requests which have failed
  (404s and other 400/500 errors, as well as client errors).

### Saving and reloading the queue (freeze/defrost)

It can be convenient to be able to save the crawl progress and later be able to
reload it if your application fails or you need to abort the crawl for some
reason. The `crawler.queue.freeze` and `crawler.queue.defrost` methods will let
you do this.

**A word of warning** - they are not CPU friendly as they rely on `JSON.parse`
and `JSON.stringify`. Use them only when you need to save the queue - don't call
them after every request or your application's performance will be incredibly
poor - they block like *crazy*. That said, using them when your crawler
commences and stops is perfectly reasonable.

Note that the methods themselves are asynchronous, so if you are going to exit
the process after you do the freezing, make sure you wait for callback -
otherwise you'll get an empty file.

```js
crawler.queue.freeze("mysavedqueue.json", function () {
    process.exit();
});

crawler.queue.defrost("mysavedqueue.json");
```

## Cookies

simplecrawler has an internal cookie jar, which collects and resends cookies
automatically and by default. If you want to turn this off, set the
`crawler.acceptCookies` option to `false`. The cookie jar is accessible via
`crawler.cookies`, and is an event emitter itself.

### Cookie events

* `addcookie` (cookie) - Fired when a new cookie is added to the jar.
* `removecookie` (cookie array) - Fired when one or more cookies are removed from the jar.

## Link Discovery

simplecrawler's discovery function is made to be replaceable — you can
easily write your own that discovers only the links you're interested in.

The method must accept a buffer and a [`queueItem`](#queue-items), and
return the resources that are to be added to the queue.

It is quite common to pair simplecrawler with a module like
[cheerio](https://npmjs.com/package/cheerio) that can correctly parse
HTML and provide a DOM like API for querying — or even a whole headless
browser, like phantomJS.

The example below demonstrates how one might achieve basic HTML-correct
discovery of only link tags using cheerio.

```js
crawler.discoverResources = function(buffer, queueItem) {
    var $ = cheerio.load(buffer.toString("utf8"));

    return $("a[href]").map(function () {
        return $(this).attr("href");
    }).get();
};
```

## FAQ/Troubleshooting

There are a couple of questions that pop up more often than others in the issue
tracker. If you're having trouble with simplecrawler, please have a look at the
list below before submitting an issue.

- **Q: Why does simplecrawler discover so many invalid URLs?**

    A: simplecrawler's built-in discovery method is purposefully naive - it's a
    brute force approach intended to find everything: URLs in comments, binary files,
    scripts, image EXIF data, inside CSS documents, and more — useful for archiving
    and use cases where it's better to have false positives than fail to discover a
    resource.

    It's definitely not a solution for every case, though — if you're
    writing a link checker or validator, you don't want erroneous 404s
    throwing errors. Therefore, simplecrawler allows you to tune discovery in a few
    key ways:

    - You can either add to (or remove from) the `discoverRegex` array, tweaking
      the search patterns to meet your requirements; or
    - Swap out the `discoverResources` method. Parsing HTML pages is beyond the
      scope of simplecrawler, but it is very common to combine simplecrawler with
      a module like [cheerio](https://npmjs.com/package/cheerio) for more
      sophisticated resource discovery.

    Further documentation is available in the [link discovery](#link-discovery)
    section.

- **Q: Why did simplecrawler complete without fetching any resources?**

    A: When this happens, it is usually because the initial request was redirected
    to a different domain that wasn't in the `domainWhitelist`.

- **Q: How do I crawl a site that requires a login?**

    A: Logging in to a site is usually fairly simple and only requires an
    exhange of credentials over HTTP as well as the storing of a cookie that
    allows the client's session can be maintained between requests to the
    server. Simplecrawler doesn't have a built-in method for this entire
    procedure, but it does have an internal cookie jar that can be used to
    store the cookie that's returned from a manual HTTP request.

    Here's an example of how to perform a manual login HTTP request with the
    [request](https://npmjs.com/package/request) module and then store the
    returned cookie in simplecrawler's cookie jar.

    ```js
    var Crawler = require("simplecrawler"),
        request = require("request");

    var crawler = new Crawler("example.com", "/");
    crawler.initialProtocol = "https";

    request.post("https://example.com/login", {
        form: {
            username: "iamauser",
            password: "supersecurepw"
        }
    }, function (error, response, body) {
        crawler.cookies.addFromHeaders(response.headers["set-cookie"]);
        crawler.start();
    });

    crawler.on("fetchcomplete", function (queueItem, responseBuffer, response) {
        console.log("Fetched", queueItem.url);
    });
    ```

- **Q: What does it mean that events are asynchronous?**

    A: One of the core concepts of node.js is its asynchronous nature. I/O
    operations (like network requests) take place outside of the main thread
    (which is where your code is executed). This is what makes node fast, the
    fact that it can continue executing code while there are multiple HTTP
    requests in flight, for example. But to be able to get back the result of
    the HTTP request, we need to register a function that will be called when
    the result is ready. This is what *asynchronous* means in node - the fact
    that code can continue executing while I/O operations are in progress - and
    it's the same concept as with AJAX requests in the browser.

- **Q: Promises are nice, can I use them with simplecrawler?**

    A: No, not really. Promises are meant as a replacement for callbacks, but
    simplecrawler is event driven, not callback driven. Using callbacks to any
    greater extent in simplecrawler wouldn't make much sense, since you normally
    need to react more than once to what happens in simplecrawler.

- **Q: Something's happening and I don't see the output I'm expecting!**

    Before filing an issue, check to see that you're not just missing something by
    logging *all* crawler events with the code below:

    ```js
    var originalEmit = crawler.emit;
    crawler.emit = function(evtName, queueItem) {
        crawler.queue.complete(function(err, completeCount) {
            if (err) {
                throw err;
            }

            crawler.queue.getLength(function(err, length) {
                if (err) {
                    throw err;
                }

                console.log("fetched %d of %d — %d open requests, %d open listeners",
                    completeCount,
                    length,
                    crawler._openRequests,
                    crawler._openListeners);
            });
        });

        console.log(evtName, queueItem ? queueItem.url ? queueItem.url : queueItem : null);
        originalEmit.apply(crawler, arguments);
    };
    ```

    If you don't see what you need after inserting that code block, and you still need help,
    please attach the output of all the events fired with your email/issue.

## Current Maintainers

* [Christopher Giffard](https://github.com/cgiffard)
* [Fredrik Ekelund](https://github.com/fredrikekelund)
* [XhmikosR](https://github.com/XhmikosR)

## Contributors

simplecrawler has benefited from the kind efforts of dozens of contributors, to
whom we are incredibly grateful. We originally listed their individual
contributions but it became pretty unwieldy - the
[full list can be found here.](https://github.com/cgiffard/node-simplecrawler/graphs/contributors)

## License

Copyright (c) 2016, Christopher Giffard.

All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
