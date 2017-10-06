# Simple web crawler for node.js

[![NPM version](https://img.shields.io/npm/v/simplecrawler.svg)](https://www.npmjs.com/package/simplecrawler)
[![Linux Build Status](https://img.shields.io/travis/cgiffard/node-simplecrawler/master.svg)](https://travis-ci.org/cgiffard/node-simplecrawler)
[![Windows Build Status](https://img.shields.io/appveyor/ci/cgiffard/node-simplecrawler/master.svg?label=Windows%20build)](https://ci.appveyor.com/project/cgiffard/node-simplecrawler/branch/master)
[![Dependency Status](https://img.shields.io/david/cgiffard/node-simplecrawler.svg)](https://david-dm.org/cgiffard/node-simplecrawler)
[![devDependency Status](https://img.shields.io/david/dev/cgiffard/node-simplecrawler.svg)](https://david-dm.org/cgiffard/node-simplecrawler#info=devDependencies)

simplecrawler is designed to provide a basic, flexible and robust API for
crawling websites. It was written to archive, analyse, and search some
very large websites and has happily chewed through hundreds of thousands of
pages and written tens of gigabytes to disk without issue.

## What does simplecrawler do?

* Provides a very simple event driven API using `EventEmitter`
* Extremely configurable base for writing your own crawler
* Provides some simple logic for auto-detecting linked resources - which you can
  replace or augment
* Automatically respects any robots.txt rules
* Has a flexible queue system which can be frozen to disk and defrosted
* Provides basic statistics on network performance
* Uses buffers for fetching and managing data, preserving binary data (except
  when discovering links)

## Documentation

- [Installation](#installation)
- [Getting started](#getting-started)
- [Events](#events)
    - [A note about HTTP error conditions](#a-note-about-http-error-conditions)
    - [Waiting for asynchronous event listeners](#waiting-for-asynchronous-event-listeners)
- [Configuration](#configuration)
- [Fetch conditions](#fetch-conditions)
- [Download conditions](#download-conditions)
- [The queue](#the-queue)
    - [Manually adding to the queue](#manually-adding-to-the-queue)
    - [Queue items](#queue-items)
    - [Queue statistics and reporting](#queue-statistics-and-reporting)
    - [Saving and reloading the queue (freeze/defrost)](#saving-and-reloading-the-queue-freezedefrost)
- [Cookies](#cookies)
    - [Cookie events](#cookie-events)
- [Link Discovery](#link-discovery)
- [FAQ/Troubleshooting](#faqtroubleshooting)
- [Node Support Policy](#node-support-policy)
- [Current Maintainers](#current-maintainers)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [License](#license)

## Installation

```sh
npm install --save simplecrawler
```

## Getting Started

Initializing simplecrawler is a simple process. First, you require the module
and instantiate it with a single argument. You then configure the properties you
like (eg. the request interval), register a few event listeners, and call the
start method. Let's walk through the process!

After requiring the crawler, we create a new instance of it. We supply the
constructor with a URL that indicates which domain to crawl and which resource
to fetch first.

```js
var Crawler = require("simplecrawler");

var crawler = new Crawler("http://www.example.com/");
```

You can initialize the crawler with or without the `new` operator. Being able to
skip it comes in handy when you want to chain API calls.

```js
var crawler = Crawler("http://www.example.com/")
    .on("fetchcomplete", function () {
        console.log("Fetched a resource!")
    });
```

By default, the crawler will only fetch resources on the same domain as that in
the URL passed to the constructor. But this can be changed through the
`crawler.domainWhitelist` property.

Now, let's configure some more things before we start crawling. Of course,
you're probably wanting to ensure you don't take down your web server. Decrease
the concurrency from five simultaneous requests - and increase the request
interval from the default 250 ms like this:

```js
crawler.interval = 10000; // Ten seconds
crawler.maxConcurrency = 3;
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

## Events

simplecrawler's API is event driven, and there are plenty of events emitted
during the different stages of the crawl. Arguments passed to events are written
in parentheses.

* `crawlstart` -
    Fired when the crawl begins or is restarted.
* `queueadd` (queueItem, referrerQueueItem) -
    Fired when a new item is added to the queue.
* `queueduplicate` (URLData) -
    Fired when an item cannot be added to the queue because it is already
    present in the queue. Frequent firing of this event is normal and expected.
* `queueerror` (error, URLData) -
    Fired when an item cannot be added to the queue due to an error.
* `robotstxterror` (error) -
    Fired when robots.txt couldn't be fetched.
* `invaliddomain` (queueItem) -
    Fired when a resource wasn't queued because it had an invalid domain. See
    `crawler.filterByDomain`, `crawler.ignoreWWWDomain`,
    `crawler.scanSubdomains` and `crawler.domainWhitelist` for different ways to
    configure which domains are considered valid.
* `fetchdisallowed` (queueItem) -
    Fired when a resource wasn't queued because of robots.txt rules. See
    `respectRobotsTxt` option.
* `fetchprevented` (queueItem) -
    Fired when a resource wasn't queued because of a [fetch
    condition](#fetch-conditions).
* `fetchconditionerror` (queueItem, error) -
    Fired when one of the fetch conditions returns an error. Provides the queue
    item that was processed when the error was encountered as well as the error
    itself.
* `downloadconditionerror` (queueItem, error) -
    Fired when one of the download conditions returns an error. Provides the
    queue item that was processed when the error was encountered as well as the
    error itself.
* `fetchstart` (queueItem, requestOptions) -
    Fired when an item is spooled for fetching. If your event handler is
    synchronous, you can modify the crawler request options (including headers
    and request method.)
* `fetchheaders` (queueItem, responseObject) -
    Fired when the headers for a resource are received from the server. The node
    `http` response object is returned for your perusal.
* `cookieerror` (queueItem, error, setCookieHeader) -
    Fired when an error was caught trying to add a cookie to the cookie jar.
    `setCookieHeader` is the Set-Cookie header that was provided in the HTTP
    response.
* `fetchredirect` (oldQueueItem, redirectQueueItem, responseObject) -
    Fired when a redirect header is encountered. The new URL is processed and
    passed as `redirectQueueItem`.
* `fetch404` (queueItem, responseObject) -
    Fired when a 404 HTTP status code is returned for a request.
* `fetch410` (queueItem, responseObject) -
    Fired when a 410 HTTP status code is returned for a request.
* `fetchdataerror` (queueItem, responseObject) -
    Fired when a resource can't be downloaded, because it exceeds the maximum
    size we're prepared to receive (16MB by default.)
* `fetchtimeout` (queueItem, crawlerTimeoutValue) -
    Fired when a request time exceeds the internal crawler threshold.
* `fetchcomplete` (queueItem, responseBody, responseObject) -
    Fired after a resource has been completely downloaded and the server
    returned an HTTP status code between 200 and 300. The response body is
    provided as a Buffer per default, unless `decodeResponses` is truthy, in
    which case it's a decoded string representation of the body.
* `fetcherror` (queueItem, responseObject) -
    Fired when an alternate 400 or 500 series HTTP status code is returned for a
    request.
* `gziperror` (queueItem, error, responseBuffer) -
    Fired when a gzipped resource cannot be unzipped.
* `fetchclienterror` (queueItem, error) -
    Fired when a request dies locally for some reason. The error data is
    returned as the second parameter.
* `discoverycomplete` (queueItem, resources) -
    Fired when linked resources have been discovered. Passes an array of
    resources (as URL's) as the second parameter.
* `complete` -
    Fired when the crawler completes processing all the items in its queue, and
    does not find any more to add. This event returns no arguments.

### A note about HTTP error conditions

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
* `crawler.respectRobotsTxt=true` -
    Controls whether the crawler should respect rules in robots.txt (if such a
    file is present). The
    [robots-parser](https://www.npmjs.com/package/robots-parser) module is used
    to do the actual parsing. This property will also make the default
    `crawler.discoverResources` method respect
    `<meta name="robots" value="nofollow">` tags - meaning that no resources
    will be extracted from pages that include such a tag.
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
* `crawler.sortQueryParameters=false` -
    Specify to sort the querystring parameters before queueing URL's. This is
    to canonicalize URLs so that foo?a=1&b=2 is considered same as foo?b=2&a=1.
* `crawler.discoverResources` -
    simplecrawler's default resource discovery function -
    which, given a buffer containing a resource, returns an array of URLs.
    For more details about link discovery, see [Link Discovery](#link-discovery)
* `crawler.discoverRegex` -
    Array of regular expressions and functions that simplecrawler uses to
    discover resources. Functions in this array are expected to return an array.
    *Only applicable if the default `discoverResources` function is used.*
* `crawler.parseHTMLComments=true` -
    Whether to scan for URL's inside HTML comments. *Only applicable if the
    default `discoverResources` function is used.*
* `crawler.parseScriptTags=true` -
    Whether to scan for URL's inside script tags. *Only applicable if the
    default `discoverResources` function is used.*
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
* `crawler.allowedProtocols` -
    An array of RegExp objects used to determine whether a URL protocol is
    supported. This is to deal with nonstandard protocol handlers that regular
    HTTP is sometimes given, like `feed:`. It does not provide support for
    non-http protocols (and why would it!?)
* `crawler.maxResourceSize=16777216` -
    The maximum resource size that will be downloaded, in bytes. Defaults to
    16MB.
* `crawler.supportedMimeTypes` -
    An array of RegExp objects and/or strings used to determine what MIME types
    simplecrawler should look for resources in. If `crawler.downloadUnsupported`
    is false, this also restricts what resources are downloaded.
* `crawler.downloadUnsupported=true` -
    simplecrawler will download files it can't parse (determined by
    `crawler.supportedMimeTypes`). Defaults to true, but if you'd rather save
    the RAM and GC lag, switch it off. When false, it closes sockets for
    unsupported resources.
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
* `crawler.maxDepth=0` -
    Defines a maximum distance from the original request at which resources will
    be downloaded.
* `crawler.ignoreInvalidSSL=false` -
    Treat self-signed SSL certificates as valid. SSL certificates will not be
    validated against known CAs. Only applies to https requests. You may also
    have to set the environment variable NODE_TLS_REJECT_UNAUTHORIZED to '0'.
    For example: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';`

## Fetch conditions

simplecrawler has an concept called fetch conditions that offers a flexible API
for filtering discovered resources before they're put in the queue. A fetch
condition is a function that takes a queue item candidate and evaluates
(synchronously or asynchronously) whether it should be added to the queue or
not. *Please note: with the next major release, all fetch conditions will be
asynchronous.*

You may add as many fetch conditions as you like, and remove them at runtime.
simplecrawler will evaluate every fetch condition in parallel until one is
encountered that returns a falsy value. If that happens, the resource in
question will not be fetched.

This API is complemented by [download conditions](#download-conditions) that
determine whether a resource's body data should be downloaded.

### Adding a fetch condition

This example fetch condition prevents URL's ending in `.pdf` from being
downloaded. Adding a fetch condition assigns it an ID, which the
`addFetchCondition` function returns. You can use this ID to remove the
condition later.

```js
var conditionID = myCrawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
    callback(null, !queueItem.path.match(/\.pdf$/i));
});
```

Fetch conditions are called with three arguments: `queueItem`,
`referrerQueueItem` and `callback`. `queueItem` represents the resource to be
fetched (or not), and `referrerQueueItem` represents the resource where the new
`queueItem` was discovered. See the [queue item documentation](#queue-items) for
details on their structure. The `callback` argument is optional, but if your
function takes 3 arguments, simplecrawler will consider it asynchronous and wait
for the `callback` to be called. If your function takes 2 arguments or less,
simplecrawler will consider it synchronous and look at its return value instead.
**Please note** however, that this flexibility in sync and async behavior is due
to change with the next major release when all fetch conditions will need to use
the asynchronous API.

With this information, you can write sophisticated logic for determining which
pages to fetch and which to avoid. For example, you could write a program that
ensures all links on a website - both internal and external - return good HTTP
statuses. Here's an example:

```js
var crawler = new Crawler("http://example.com");
crawler.filterByDomain = false;

crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
    // We only ever want to move one step away from example.com, so if the
    // referrer queue item reports a different domain, don't proceed
    callback(null, referrerQueueItem.host === crawler.host);
});

crawler.start();
```

### Removing a fetch condition

With the ID of the fetch condition you added earlier, or with a reference to the
calback function you registered, you can remove the fetch condition using the
`crawler.removeFetchCondition` method:

```js
function listener(queueItem, stateData) {
    // Do something
}

var conditionID = myCrawler.addFetchCondition(listener);

// By id...
myCrawler.removeFetchCondition(conditionID);
// or by reference
myCrawler.removeFetchCondition(listener);
```

## Download conditions

While fetch conditions let you determine which resources to put in the queue,
download conditions offer the same kind of flexible API for determining which
resources' data to download. Download conditions support both a synchronous and
an asynchronous API, but *with the next major release, all download conditions
will be asynchronous.*

Download conditions are evaluated after the headers of a resource have been
downloaded, if that resource returned an HTTP status between 200 and 299. This
lets you inspect the content-type and content-length headers, along with all
other properties on the queue item, before deciding if you want this resource's
data or not.

### Adding a download condition

Download conditions are added in much the same way as fetch conditions, with the
`crawler.addDownloadCondition` method. This method returns an ID that can be
used to remove the condition later.

```js
var conditionID = myCrawler.addDownloadCondition(function(queueItem, response, callback) {
    callback(null,
        queueItem.stateData.contentType === "image/png" &&
        queueItem.stateData.contentLength < 5 * 1000 * 1000
    );
});
```

Download conditions are called with three arguments: `queueItem`, `response` and
`callback`. `queueItem` represents the resource that's being fetched ([queue
item structure](#queue-items)) and `response` is an instance of
`http.IncomingMessage`. Please see the [node
documentation](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
for that class for more details on what it looks like.

### Removing a download condition

Just like with fetch conditions, download conditions can be removed with the ID
returned from the `addDownloadCondition` method, or with a reference to the same
callback function. `crawler.removeDownloadCondition` is the method you'll use:

```js
function listener(queueItem, response, callback) {
    // Do something
}

var conditionID = myCrawler.addDownloadCondition(listener);

// By id...
myCrawler.removeDownloadCondition(conditionID);
// or by reference
myCrawler.removeDownloadCondition(listener);
```

## The queue

Like any other web crawler, simplecrawler has a queue. It can be directly
accessed through `crawler.queue` and implements an asynchronous interface for
accessing queue items and statistics. There are several methods for interacting
with the queue, the simplest being `crawler.queue.get`, which lets you get a
queue item at a specific index in the queue.

```js
crawler.queue.get(5, function (queueItem) {
    // Do something with the queueItem
});
```

*All queue method are in reality synchronous by default, but simplecrawler is
built to be able to use different queues that implement the same interface, and
those implementations can be asynchronous - which means they could eg. be backed
by a database.*

### Manually adding to the queue

To add items to the queue, use `crawler.queueURL`. This method takes 3
arguments: a URL to queue, a referrer queue item and a boolean that indicates
whether the URL should be queued regardless of whether it already exists in the
queue or not.

```js
crawler.queueURL("/example.html", referrerQueueItem, false);
```

### Queue items

Because when working with simplecrawler, you'll constantly be handed queue items,
it helps to know what's inside them. These are the properties every queue item
is expected to have:

* `id` - A unique ID assigned by the queue when the queue item is added
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
    * `"notfound"` - The resource could not be found, ie. returned a 404 or 410
    HTTP status.
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
    * `code` - The HTTP status code returned for the request. Note that this
      code is `600` if an error occurred in the client and a fetch operation
      could not take place successfully.
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
respectively.

```js
crawler.queue.max("requestLatency", function(error, max) {
    console.log("The maximum request latency was %dms.", max);
});
crawler.queue.min("downloadTime", function(error, min) {
    console.log("The minimum download time was %dms.", min);
});
crawler.queue.avg("actualDataSize", function(error, avg) {
    console.log("The average resource size received is %d bytes.", avg);
});
```

For general filtering or counting of queue items, there are two methods:
`crawler.queue.filterItems` and `crawler.queue.countItems`. Both take an object
comparator and a callback.

```js
crawler.queue.countItems({ fetched: true }, function(error, count) {
    console.log("The number of completed items is %d", count);
});

crawler.queue.filterItems({ status: "notfound" }, function(error, items) {
    console.log("These items returned 404 or 410 HTTP statuses", items);
});
```

The object comparator can also contain other objects, so you may filter queue
items based on properties in their `stateData` object as well.

```js
crawler.queue.filterItems({
    stateData: { code: 301 }
}, function(error, items) {
    console.log("These items returned a 301 HTTP status", items);
});
```

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

    A: Logging in to a site is usually fairly simple and most login procedures
    look alike. We've included an example that covers a lot of situations, but
    sadly, there isn't a one true solution for how to deal with logins, so
    there's no guarantee that this code works right off the bat.

    What we do here is:
    1. fetch the login page,
    2. store the session cookie assigned to us by the server,
    3. extract any CSRF tokens or similar parameters required when logging in,
    4. submit the login credentials.

    ```js
    var Crawler = require("simplecrawler"),
        url = require("url"),
        cheerio = require("cheerio"),
        request = require("request");

    var initialURL = "https://example.com/";

    var crawler = new Crawler(initialURL);

    request("https://example.com/login", {
        // The jar option isn't necessary for simplecrawler integration, but it's
        // the easiest way to have request remember the session cookie between this
        // request and the next
        jar: true
    }, function (error, response, body) {
        // Start by saving the cookies. We'll likely be assigned a session cookie
        // straight off the bat, and then the server will remember the fact that
        // this session is logged in as user "iamauser" after we've successfully
        // logged in
        crawler.cookies.addFromHeaders(response.headers["set-cookie"]);

        // We want to get the names and values of all relevant inputs on the page,
        // so that any CSRF tokens or similar things are included in the POST
        // request
        var $ = cheerio.load(body),
            formDefaults = {},
            // You should adapt these selectors so that they target the
            // appropriate form and inputs
            formAction = $("#login").attr("action"),
            loginInputs = $("input");

        // We loop over the input elements and extract their names and values so
        // that we can include them in the login POST request
        loginInputs.each(function(i, input) {
            var inputName = $(input).attr("name"),
                inputValue = $(input).val();

            formDefaults[inputName] = inputValue;
        });

        // Time for the login request!
        request.post(url.resolve(initialURL, formAction), {
            // We can't be sure that all of the input fields have a correct default
            // value. Maybe the user has to tick a checkbox or something similar in
            // order to log in. This is something you have to find this out manually
            // by logging in to the site in your browser and inspecting in the
            // network panel of your favorite dev tools what parameters are included
            // in the request.
            form: Object.assign(formDefaults, {
                username: "iamauser",
                password: "supersecretpw"
            }),
            // We want to include the saved cookies from the last request in this
            // one as well
            jar: true
        }, function (error, response, body) {
            // That should do it! We're now ready to start the crawler
            crawler.start();
        });
    });

    crawler.on("fetchcomplete", function (queueItem, responseBuffer, response) {
        console.log("Fetched", queueItem.url, responseBuffer.toString());
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
        crawler.queue.countItems({ fetched: true }, function(err, completeCount) {
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
                    crawler._openRequests.length,
                    crawler._openListeners);
            });
        });

        console.log(evtName, queueItem ? queueItem.url ? queueItem.url : queueItem : null);
        originalEmit.apply(crawler, arguments);
    };
    ```

    If you don't see what you need after inserting that code block, and you still need help,
    please attach the output of all the events fired with your email/issue.

## Node Support Policy

Simplecrawler will officially support stable and LTS versions of Node which are
currently supported by the Node Foundation.

Currently supported versions:

- 4.x
- 5.x
- 6.x
- 7.x

## Current Maintainers

* [Christopher Giffard](https://github.com/cgiffard)
* [Fredrik Ekelund](https://github.com/fredrikekelund)
* [XhmikosR](https://github.com/XhmikosR)

## Contributing

Please see the [contributor guidelines](https://github.com/cgiffard/node-simplecrawler/blob/master/CONTRIBUTING.md)
before submitting a pull request to ensure that your contribution is able to be
accepted quickly and easily!

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
