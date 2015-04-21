# Simple web-crawler for Node.js

[![NPM version](https://img.shields.io/npm/v/simplecrawler.svg)](https://www.npmjs.com/package/simplecrawler)
[![Build Status: master branch](https://img.shields.io/travis/cgiffard/node-simplecrawler/master.svg?label=master%20branch)](https://travis-ci.org/cgiffard/node-simplecrawler)
[![Build Status: development branch](https://img.shields.io/travis/cgiffard/node-simplecrawler/development.svg?label=development%20branch)](https://travis-ci.org/cgiffard/node-simplecrawler)
[![Dependency Status](https://img.shields.io/david/cgiffard/node-simplecrawler.svg)](https://david-dm.org/cgiffard/node-simplecrawler)
[![devDependency Status](https://img.shields.io/david/dev/cgiffard/node-simplecrawler.svg)](https://david-dm.org/cgiffard/node-simplecrawler#info=devDependencies)

Simplecrawler is designed to provide the most basic possible API for crawling
websites, while being as flexible and robust as possible. I wrote simplecrawler
to archive, analyse, and search some very large websites. It has happily chewed
through 50,000 pages and written tens of gigabytes to disk without issue.

#### Example (simple mode)

```js
var Crawler = require("simplecrawler");

Crawler.crawl("http://example.com/")
	.on("fetchcomplete", function(queueItem){
		console.log("Completed fetching resource:", queueItem.url);
	});
```

### What does simplecrawler do?

* Provides a very simple event driven API using `EventEmitter`
* Extremely configurable base for writing your own crawler
* Provides some simple logic for autodetecting linked resources - which you can
replace or augment
* Has a flexible queue system which can be frozen to disk and defrosted
* Provides basic statistics on network performance
* Uses buffers for fetching and managing data, preserving binary data (except
when discovering links)

### Installation

```
npm install simplecrawler
```

### Getting Started

There are two ways of instantiating a new crawler - a simple but less flexible
method inspired by [anemone](http://anemone.rubyforge.org), and the traditional
method which provides a little more room to configure crawl parameters.

Regardless of wether you use the simple or traditional methods of instantiation,
you'll need to require simplecrawler:

```js
var Crawler = require("simplecrawler");
```

#### Simple Mode

Simple mode generates a new crawler for you, preconfigures it based on a URL you
provide, and returns the crawler to you for further configuration and so you can
attach event handlers.

Simply call `Crawler.crawl`, with a URL first parameter, and two optional
functions that will be added as event listeners for `fetchcomplete` and
`fetcherror` respectively.

```js
Crawler.crawl("http://example.com/", function(queueItem){
	console.log("Completed fetching resource:", queueItem.url);
});
```

Alternately, if you decide to omit these functions, you can use the returned
crawler object to add the event listeners yourself, and tweak configuration
options:

```js
var crawler = Crawler.crawl("http://example.com/");

crawler.interval = 500;

crawler.on("fetchcomplete",function(queueItem){
	console.log("Completed fetching resource:", queueItem.url);
});
```

#### Advanced Mode

The alternative method of creating a crawler is to call the `simplecrawler`
constructor yourself, and to initiate the crawl manually.

```js
var myCrawler = new Crawler("www.example.com");
```

Nonstandard port? HTTPS? Want to start archiving a specific path? No problem:

```js
myCrawler.initialPath = "/archive";
myCrawler.initialPort = 8080;
myCrawler.initialProtocol = "https";

// Or:
var myCrawler = new Crawler("www.example.com", "/archive", 8080);

```

And of course, you're probably wanting to ensure you don't take down your web
server. Decrease the concurrency from five simultaneous requests - and increase
the request interval from the default 250ms like this:

```js
myCrawler.interval = 10000; // Ten seconds
myCrawler.maxConcurrency = 1;
```

You can also define a max depth for links to fetch :
```js
myCrawler.maxDepth = 1; // Only first page is fetched (with linked CSS & images)
// Or:
myCrawler.maxDepth = 2; // First page and discovered links from it are fetched
// Or:
myCrawler.maxDepth = 3; // Etc.
```

For brevity, you may also specify the initial path and request interval when
creating the crawler:

```js
var myCrawler = new Crawler("www.example.com", "/", 8080, 300);
```

### Running the crawler

First, you'll need to set up an event listener to get the fetched data:

```js
myCrawler.on("fetchcomplete", function(queueItem, responseBuffer, response) {
	console.log("I just received %s (%d bytes)", queueItem.url, responseBuffer.length);
	console.log("It was a resource of type %s", response.headers['content-type']);

	// Do something with the data in responseBuffer
});
```

Then, when you're satisfied you're ready to go, start the crawler! It'll run
through its queue finding linked resources on the domain to download, until it
can't find any more.

```js
myCrawler.start();
```

Of course, once you've got that down pat, there's a fair bit more you can listen for...

### Events

* `crawlstart`
Fired when the crawl begins or is restarted.
* `queueadd` ( queueItem )
Fired when a new item is automatically added to the queue (not when you manually
queue an item yourself.)
* `queueduplicate` ( URLData )
Fired when an item cannot be added to the queue because it is already present in
the queue. Frequent firing of this event is normal and expected.
* `queueerror` ( errorData , URLData )
Fired when an item cannot be added to the queue due to error.
* `fetchstart` ( queueItem , requestOptions )
Fired when an item is spooled for fetching. If your event handler is synchronous,
you can modify the crawler request options (including headers and request method.)
* `fetchheaders` ( queueItem , responseObject )
Fired when the headers for a resource are received from the server. The node http
response object is returned for your perusal.
* `fetchcomplete` ( queueItem , responseBuffer , response )
Fired when the resource is completely downloaded. The entire file data is provided
as a buffer, as well as the response object.
* `fetchdataerror` ( queueItem, response )
Fired when a resource can't be downloaded, because it exceeds the maximum size
we're prepared to receive (16MB by default.)
* `fetchredirect` ( queueItem, parsedURL, response )
Fired when a redirect header is encountered. The new URL is validated and returned
as a complete canonical link to the new resource.
* `fetch404` ( queueItem, response )
Fired when a 404 or 410 HTTP status code is returned for a request.
* `fetcherror` ( queueItem, response )
Fired when an alternate 400 or 500 series HTTP status code is returned for a
request.
* `gziperror` ( queueItem, error, resourceData )
Fired when a gzipped resource cannot be unzipped.
* `fetchtimeout` ( queueItem, crawlerTimeoutValue )
Fired when a request time exceeds the internal crawler threshold.
* `fetchclienterror` ( queueItem, errorData )
Fired when a request dies locally for some reason. The error data is returned as
the second parameter.
* `discoverycomplete` ( queueItem, resources )
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

If this is annoying, and you'd really like to retain error pages by default, let
me know. I didn't include it because I didn't need it - but if it's important to
people I might put it back in. :)

#### Waiting for Asynchronous Event Listeners

Sometimes, you might want to wait for simplecrawler to wait for you while you
perform sone asynchronous tasks in an event listener, instead of having it
racing off and firing the `complete` event, halting your crawl. For example,
if you're doing your own link discovery using an asynchronous library method.

Simplecrawler provides a `wait` method you can call at any time. It is available
via `this` from inside listeners, and on the crawler object itself. It returns
a callback function.

Once you've called this method, simplecrawler will not fire the `complete` event
until either you execute the callback it returns, or a timeout is reached
(configured in `crawler.listenerTTL`, by default 10000 msec.)

##### Example Asynchronous Event Listener

```js
crawler.on("fetchcomplete", function(queueItem, data, res) {
	var continue = this.wait();
	doSomeDiscovery(data, function(foundURLs){
		foundURLs.forEach(crawler.queueURL.bind(crawler));
		continue();
	});
});
```

### Configuring the crawler

Here's a complete list of what you can stuff with at this stage:

*	`crawler.host` -
	The domain to scan. By default, simplecrawler will restrict all requests to
	this domain.
*	`crawler.initialPath` -
	The initial path with which the crawler will formulate its first request.
	Does not restrict subsequent requests.
*	`crawler.initialPort` -
	The initial port with which the crawler will formulate its first request.
	Does not restrict subsequent requests.
*	`crawler.initialProtocol` -
	The initial protocol with which the crawler will formulate its first request.
	Does not restrict subsequent requests.
*	`crawler.interval` -
	The interval with which the crawler will spool up new requests (one per
	tick.) Defaults to 250ms.
*	`crawler.maxConcurrency` -
	The maximum number of requests the crawler will run simultaneously. Defaults
	to 5 - the default number of http agents node will run.
*	`crawler.timeout` -
	The maximum time in milliseconds the crawler will wait for headers before
	aborting the request.
*	`crawler.listenerTTL` -
	The maximum time in milliseconds the crawler will wait for async listeners.
*	`crawler.userAgent` -
	The user agent the crawler will report. Defaults to
	`Node/SimpleCrawler <version> (http://www.github.com/cgiffard/node-simplecrawler)`.
*	`crawler.queue` -
	The queue in use by the crawler (Must implement the `FetchQueue` interface)
*	`crawler.filterByDomain` -
	Specifies whether the crawler will restrict queued requests to a given
	domain/domains.
*	`crawler.scanSubdomains` -
	Enables scanning subdomains (other than www) as well as the specified domain.
	Defaults to false.
*	`crawler.ignoreWWWDomain` -
	Treats the `www` domain the same as the originally specified domain.
	Defaults to true.
*	`crawler.stripWWWDomain` -
	Or go even further and strip WWW subdomain from requests altogether!
*	`crawler.stripQuerystring` -
	Specify to strip querystring parameters from URLs. Defaults to false.
*	`crawler.discoverResources` -
	Use simplecrawler's internal resource discovery function. You can replace it
	with your own function, which must accept a buffer and a queueItem, and add
	the discovered resources to the crawler queue:

	```js
	crawler.discoverResources = function(buf, queueItem) {
		// scan buffer for URLs, and then:
		...
		crawler.queueURL(aDiscoveredURL, queueItem);
		...
	};
	```

*	`crawler.discoverRegex` -
	Array of regex objects that simplecrawler uses to discover resources.
*	`crawler.cache` -
	Specify a cache architecture to use when crawling. Must implement
	`SimpleCache` interface. You can save the site to disk using the built in file
	system cache like this: `crawler.cache = new Crawler.cache('pathToCacheDirectory');`
*	`crawler.useProxy` -
	The crawler should use an HTTP proxy to make its requests.
*	`crawler.proxyHostname` -
	The hostname of the proxy to use for requests.
*	`crawler.proxyPort` -
	The port of the proxy to use for requests.
*	`crawler.proxyUser` -
	The username for HTTP/Basic proxy authentication (leave unset for unauthenticated proxies.)
*	`crawler.proxyPass` -
	The password for HTTP/Basic proxy authentication (leave unset for unauthenticated proxies.)
*	`crawler.domainWhitelist` -
	An array of domains the crawler is permitted to crawl from. If other settings
	are more permissive, they will override this setting.
*	`crawler.supportedMimeTypes` -
	An array of RegEx objects used to determine supported MIME types (types of
	data simplecrawler will scan for links.) If you're  not using simplecrawler's
	resource discovery function, this won't have any effect.
*	`crawler.allowedProtocols` -
	An array of RegEx objects used to determine whether a URL protocol is supported.
	This is to deal with nonstandard protocol handlers that regular HTTP is
	sometimes given, like `feed:`. It does not provide support for non-http
	protocols (and why would it!?)
*	`crawler.maxResourceSize` -
	The maximum resource size, in bytes, which will be downloaded. Defaults to 16MB.
*	`crawler.downloadUnsupported` -
	Simplecrawler will download files it can't parse. Defaults to true, but if
	you'd rather save the RAM and GC lag, switch it off. When false, it closes
	sockets for unsupported resources.
*	`crawler.needsAuth` -
	Flag to specify if the domain you are hitting requires basic authentication
*	`crawler.authUser` -
	Username provided for needsAuth flag
*	`crawler.authPass` -
	Password provided for needsAuth flag
*	`crawler.customHeaders` -
	An object specifying a number of custom headers simplecrawler will add to
	every request. These override the default headers simplecrawler sets, so
	be careful with them. If you want to tamper with headers on a per-request basis,
	see the `fetchqueue` event.
*	`crawler.acceptCookies` -
	Flag to indicate if the crawler should hold on to cookies
*	`crawler.urlEncoding` -
	Set this to `iso8859` to trigger URIjs' re-encoding of iso8859 URLs to unicode.
	Defaults to `unicode`.
*	`crawler.parseHTMLComments` -
	Whether to scan for URLs inside HTML comments.
	Defaults to `true`.
*	`crawler.parseScriptTags` -
	Whether to scan for URLs inside script tags.
	Defaults to `true`.
*	`crawler.maxDepth` -
	Defines a maximum distance from the original request at which resources will
	be downloaded. Asset files are excluded from this distance condition if
	`crawler.fetchWhitelistedMimeTypesBelowMaxDepth` is `true`. Defaults to `0`
	— no max depth.
*	`crawler.fetchWhitelistedMimeTypesBelowMaxDepth` — Defaults to `false`. If
	`true`, then resources (fonts, images, CSS) will be excluded from `maxDepth`
	checks. (And therefore downloaded regardless of their depth.)
*	`crawler.ignoreInvalidSSL` -
	Treat self-signed SSL certificates as valid. SSL certificates will not be
	validated against known CAs. Only applies to https requests. You may also have
	to set the environment variable NODE_TLS_REJECT_UNAUTHORIZED to '0'.
	For example: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';`
	Defaults to false.

#### Excluding certain resources from downloading

Simplecrawler has a mechanism you can use to prevent certain resources from being
fetched, based on the URL, called *Fetch Conditions**. A fetch condition is just
a function, which, when given a parsed URL object, will return a true or a false
value, indicating whether a given resource should be downloaded.

You may add as many fetch conditions as you like, and remove them at runtime.
Simplecrawler will evaluate every single condition against every queued URL, and
should just one of them return a falsy value (this includes null and undefined,
so remember to always return a value!) then the resource in question will not be
fetched.

##### Adding a fetch condition

This example fetch condition prevents URLs ending in `.pdf` from downloading.
Adding a fetch condition assigns it an ID, which the `addFetchCondition` function
returns. You can use this ID to remove the condition later.

```js
var conditionID = myCrawler.addFetchCondition(function(parsedURL) {
	return !parsedURL.path.match(/\.pdf$/i);
});
```

NOTE: simplecrawler uses slightly different terminology to URIjs. `parsedURL.path`
includes the query string too. If you want the path without the query string,
use `parsedURL.uriPath`.

##### Removing a fetch condition

If you stored the ID of the fetch condition you added earlier, you can remove it
from the crawler:

```js
myCrawler.removeFetchCondition(conditionID);
```

### The Simplecrawler Queue

Simplecrawler has a queue like any other web crawler. It can be directly accessed
at `crawler.queue` (assuming you called your Crawler() object `crawler`.) It
provides array access, so you can get to queue items just with array notation
and an index.

```js
crawler.queue[5];
```

For compatibility with different backing stores, it now provides an alternate
interface which the crawler core makes use of:

```js
crawler.queue.get(5);
```

It's not just an array though.

#### Adding to the queue

The simplest way to add to the queue is to use the crawler's own method,
`crawler.queueURL`. This method takes a complete URL, validates and deconstructs
it, and adds it to the queue.

If you instead want to add a resource by its components, you may call the
`queue.add` method directly:

```js
crawler.queue.add(protocol, hostname, port, path);
```

That's it! It's basically just a URL, but comma separated (that's how you can
remember the order.)

#### Queue items

Because when working with simplecrawler, you'll constantly be handed queue items,
it helps to know what's inside them. These are the properties every queue item
is expected to have:

* `url` - The complete, canonical URL of the resource.
* `protocol` - The protocol of the resource (http, https)
* `host` - The full domain/hostname of the resource
* `port` - The port of the resource
* `path` - The bit of the URL after the domain - includes the querystring.
* `fetched` - Has the request for this item been completed? You can monitor this as requests are processed.
* `status` - The internal status of the item, always a string. This can be one of:
	* `queued` - The resource is in the queue to be fetched, but nothing's happened to it yet.
	* `spooled` - A request has been made to the remote server, but we're still waiting for a response.
	* `headers` - The headers for the resource have been received.
	* `downloaded` - The item has been entirely downloaded.
	* `redirected` - The resource request returned a 300 series response, with a Location header and a new URL.
	* `notfound` - The resource could not be found. (404)
	* `failed` - An error occurred when attempting to fetch the resource.
* `stateData` - An object containing state data and other information about the request:
	* `requestLatency` - The time taken for headers to be received after the request was made.
	* `requestTime` - The total time taken for the request (including download time.)
	* `downloadTime` - The total time taken for the resource to be downloaded.
	* `contentLength` - The length (in bytes) of the returned content. Calculated based on the `content-length` header.
	* `contentType` - The MIME type of the content.
	* `code` - The HTTP status code returned for the request.
	* `headers` - An object containing the header information returned by the server. This is the object node returns as part of the `response` object.
	* `actualDataSize` - The length (in bytes) of the returned content. Calculated based on what is actually received, not the `content-length` header.
	* `sentIncorrectSize` - True if the data length returned by the server did not match what we were told to expect by the `content-length` header.

You can address these properties like you would any other object:

```js
crawler.queue[52].url;
queueItem.stateData.contentLength;
queueItem.status === "queued";
```

As you can see, you can get a lot of meta-information out about each request. The
upside is, the queue actually has some convenient functions for getting simple
aggregate data about the queue...

#### Queue Statistics and Reporting

First of all, the queue can provide some basic statistics about the network
performance of your crawl (so far.) This is done live, so don't check it thirty
times a second. You can test the following properties:

* `requestTime`
* `requestLatency`
* `downloadTime`
* `contentLength`
* `actualDataSize`

And you can get the maximum, minimum, and average values for each with the
`crawler.queue.max`, `crawler.queue.min`, and `crawler.queue.avg` functions
respectively. Like so:

```js
console.log("The maximum request latency was %dms.", crawler.queue.max("requestLatency"));
console.log("The minimum download time was %dms.", crawler.queue.min("downloadTime"));
console.log("The average resource size received is %d bytes.", crawler.queue.avg("actualDataSize"));
```

You'll probably often need to determine how many items in the queue have a given
status at any one time, and/or retreive them. That's easy with
`crawler.queue.countWithStatus` and `crawler.queue.getWithStatus`.

`crawler.queue.countWithStatus` returns the number of queued items with a given
status, while `crawler.queue.getWithStatus` returns an array of the queue items
themselves.

```js
var redirectCount = crawler.queue.countWithStatus("redirected");

crawler.queue.getWithStatus("failed").forEach(function(queueItem) {
	console.log("Whoah, the request for %s failed!", queueItem.url);

	// do something...
});
```

Then there's some even simpler convenience functions:

* `crawler.queue.complete` - returns the number of queue items which have been
completed (marked as fetched)
* `crawler.queue.errors` - returns the number of requests which have failed
(404s and other 400/500 errors, as well as client errors)

#### Saving and reloading the queue (freeze/defrost)

You'll probably want to be able to save your progress and reload it later, if
your application fails or you need to abort the crawl for some reason. (Perhaps
you just want to finish off for the night and pick it up tomorrow!) The
`crawler.queue.freeze` and `crawler.queue.defrost` functions perform this task.

**A word of warning though** - they are not CPU friendly as they rely on
JSON.parse and JSON.stringify. Use them only when you need to save the queue -
don't call them every request or your application's performance will be incredibly
poor - they block like *crazy*. That said, using them when your crawler commences
and stops is perfectly reasonable.

Note that the methods themselves are asynchronous, so if you are going to exit the
process after you do the freezing, make sure you wait for callback - otherwise
you'll get an empty file.

```js
// Freeze queue
crawler.queue.freeze("mysavedqueue.json", function() {
	process.exit();
});

// Defrost queue
crawler.queue.defrost("mysavedqueue.json");
```

## Cookies

Simplecrawler now has an internal cookie jar, which collects and resends cookies
automatically, and by default.

If you want to turn this off, set the `crawler.acceptCookies` option to `false`.

The cookie jar is accessible via `crawler.cookies`, and is an event emitter itself:

### Cookie Events

* `addcookie` ( cookie )
Fired when a new cookie is added to the jar.
* `removecookie` ( cookie array )
Fired when one or more cookies are removed from the jar.

## Contributors

I'd like to extend sincere thanks to:

*	[Nick Crohn](https://github.com/ncrohn) for the HTTP Basic auth support, and
	initial cookie support.
*	[Mike Moulton](https://github.com/mmoulton) for
	[fixing a bug in the URL discovery mechanism]
	(https://github.com/cgiffard/node-simplecrawler/pull/3), as well as
	[adding the `discoverycomplete` event]
	(https://github.com/cgiffard/node-simplecrawler/pull/10),
*	[Mike Iannacone](https://github.com/mikeiannacone) for correcting a keyword
	naming collision with node 0.8's EventEmitter.
*	[Greg Molnar](https://github.com/gregmolnar) for
	[adding a querystring-free path parameter to parsed URL objects.]
	(https://github.com/cgiffard/node-simplecrawler/pull/31)
*	[Breck Yunits](https://github.com/breck7) for contributing a useful code
	sample demonstrating using simplecrawler for caching a website to disk!
*	[Luke Plaster](https://github.com/notatestuser) for enabling protocol-agnostic
	link discovery
*	[Zeus](https://github.com/distracteddev) for fixing a bug where [default port
	info was wrongly specified in requests]
	(https://github.com/cgiffard/node-simplecrawler/pull/40)
	and for fixing the missing request timeout handling!
*	[Graham Hutchinson](https://github.com/ghhutch) for adding
	querystring-stripping option
*	[Jellyfrog](https://github.com/jellyfrog) for assisting in diagnosing some
	nasty EventEmitter issues.
*	[Brian Moeskau](https://github.com/bmoeskau) for helping to fix the confusing
	'async' events API, and providing invaluable feedback.

And everybody else who has helped out in some way! :)

## Licence

Copyright (c) 2013, Christopher Giffard.

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
