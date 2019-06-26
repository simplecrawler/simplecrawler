# Simple web crawler for node.js

[![NPM version](https://img.shields.io/npm/v/simplecrawler.svg)](https://www.npmjs.com/package/simplecrawler)
[![Linux Build Status](https://img.shields.io/travis/simplecrawler/simplecrawler/master.svg)](https://travis-ci.org/simplecrawler/simplecrawler)
[![Windows Build Status](https://img.shields.io/appveyor/ci/fredrikekelund/simplecrawler.svg?label=Windows%20build)](https://ci.appveyor.com/project/fredrikekelund/simplecrawler/branch/master)
[![Dependency Status](https://img.shields.io/david/simplecrawler/simplecrawler.svg)](https://david-dm.org/simplecrawler/simplecrawler)
[![devDependency Status](https://img.shields.io/david/dev/simplecrawler/simplecrawler.svg)](https://david-dm.org/simplecrawler/simplecrawler?type=dev)
[![Greenkeeper badge](https://badges.greenkeeper.io/simplecrawler/simplecrawler.svg)](https://greenkeeper.io/)

simplecrawler is designed to provide a basic, flexible and robust API for crawling websites. It was written to archive, analyse, and search some very large websites and has happily chewed through hundreds of thousands of pages and written tens of gigabytes to disk without issue.

## What does simplecrawler do?

* Provides a very simple event driven API using `EventEmitter`
* Extremely configurable base for writing your own crawler
* Provides some simple logic for auto-detecting linked resources - which you can replace or augment
* Automatically respects any robots.txt rules
* Has a flexible queue system which can be frozen to disk and defrosted
* Provides basic statistics on network performance
* Uses buffers for fetching and managing data, preserving binary data (except when discovering links)

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

Initializing simplecrawler is a simple process. First, you require the module and instantiate it with a single argument. You then configure the properties you like (eg. the request interval), register a few event listeners, and call the start method. Let's walk through the process!

After requiring the crawler, we create a new instance of it. We supply the constructor with a URL that indicates which domain to crawl and which resource to fetch first.

```js
var Crawler = require("simplecrawler");

var crawler = new Crawler("http://www.example.com/");
```

You can initialize the crawler with or without the `new` operator. Being able to skip it comes in handy when you want to chain API calls.

```js
var crawler = Crawler("http://www.example.com/")
    .on("fetchcomplete", function () {
        console.log("Fetched a resource!")
    });
```

By default, the crawler will only fetch resources on the same domain as that in the URL passed to the constructor. But this can be changed through the <code><a href="#Crawler+domainWhitelist">crawler.domainWhitelist</a></code> property.

Now, let's configure some more things before we start crawling. Of course, you're probably wanting to ensure you don't take down your web server. Decrease the concurrency from five simultaneous requests - and increase the request interval from the default 250 ms like this:

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

For a full list of configurable properties, see the [configuration section](#configuration).

You'll also need to set up event listeners for the [events](#events) you want to listen to. <code>crawler.fetchcomplete</code> and <code>crawler.complete</code> are good places to start.

```js
crawler.on("fetchcomplete", function(queueItem, responseBuffer, response) {
    console.log("I just received %s (%d bytes)", queueItem.url, responseBuffer.length);
    console.log("It was a resource of type %s", response.headers['content-type']);
});
```

Then, when you're satisfied and ready to go, start the crawler! It'll run through its queue finding linked resources on the domain to download, until it can't find any more.

```js
crawler.start();
```

## Events

simplecrawler's API is event driven, and there are plenty of events emitted during the different stages of the crawl.

<a name="Crawler+event_crawlstart"></a>

#### "crawlstart"
Fired when the crawl starts. This event gives you the opportunity to
adjust the crawler's configuration, since the crawl won't actually start
until the next processor tick.

<a name="Crawler+event_discoverycomplete"></a>

#### "discoverycomplete" (queueItem, resources)
Fired when the discovery of linked resources has completed


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that represents the document for the discovered resources |
| resources | <code>Array</code> | An array of discovered and cleaned URL's |

<a name="Crawler+event_invaliddomain"></a>

#### "invaliddomain" (queueItem)
Fired when a resource wasn't queued because of an invalid domain name


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item representing the disallowed URL |

<a name="Crawler+event_fetchdisallowed"></a>

#### "fetchdisallowed" (queueItem)
Fired when a resource wasn't queued because it was disallowed by the
site's robots.txt rules


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item representing the disallowed URL |

<a name="Crawler+event_fetchconditionerror"></a>

#### "fetchconditionerror" (queueItem, error)
Fired when a fetch condition returns an error


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that was processed when the error was encountered |
| error | <code>\*</code> |  |

<a name="Crawler+event_fetchprevented"></a>

#### "fetchprevented" (queueItem, fetchCondition)
Fired when a fetch condition prevented the queueing of a URL


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that didn't pass the fetch conditions |
| fetchCondition | <code>function</code> | The first fetch condition that returned false |

<a name="Crawler+event_queueduplicate"></a>

#### "queueduplicate" (queueItem)
Fired when a new queue item was rejected because another
queue item with the same URL was already in the queue


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that was rejected |

<a name="Crawler+event_queueerror"></a>

#### "queueerror" (error, queueItem)
Fired when an error was encountered while updating a queue item


| Param | Type | Description |
| --- | --- | --- |
| error | [<code>QueueItem</code>](#QueueItem) | The error that was returned by the queue |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that the crawler tried to update when it encountered the error |

<a name="Crawler+event_queueadd"></a>

#### "queueadd" (queueItem, referrer)
Fired when an item was added to the crawler's queue


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that was added to the queue |
| referrer | [<code>QueueItem</code>](#QueueItem) | The queue item representing the resource where the new queue item was found |

<a name="Crawler+event_fetchtimeout"></a>

#### "fetchtimeout" (queueItem, timeout)
Fired when a request times out


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request timed out |
| timeout | <code>Number</code> | The delay in milliseconds after which the request timed out |

<a name="Crawler+event_fetchclienterror"></a>

#### "fetchclienterror" (queueItem, error)
Fired when a request encounters an unknown error


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request has errored |
| error | <code>Object</code> | The error supplied to the `error` event on the request |

<a name="Crawler+event_fetchstart"></a>

#### "fetchstart" (queueItem, requestOptions)
Fired just after a request has been initiated


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request has been initiated |
| requestOptions | <code>Object</code> | The options generated for the HTTP request |

<a name="Crawler+event_cookieerror"></a>

#### "cookieerror" (queueItem, error, cookie)
Fired when an error was encountered while trying to add a
cookie to the cookie jar


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item representing the resource that returned the cookie |
| error | <code>Error</code> | The error that was encountered |
| cookie | <code>String</code> | The Set-Cookie header value that was returned from the request |

<a name="Crawler+event_fetchheaders"></a>

#### "fetchheaders" (queueItem, response)
Fired when the headers for a request have been received


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the headers have been received |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_downloadconditionerror"></a>

#### "downloadconditionerror" (queueItem, error)
Fired when a download condition returns an error


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item that was processed when the error was encountered |
| error | <code>\*</code> |  |

<a name="Crawler+event_downloadprevented"></a>

#### "downloadprevented" (queueItem, response)
Fired when the downloading of a resource was prevented
by a download condition


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item representing the resource that was halfway fetched |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_notmodified"></a>

#### "notmodified" (queueItem, response, cacheObject)
Fired when the crawler's cache was enabled and the server responded with a 304 Not Modified status for the request


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request returned a 304 status |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |
| cacheObject | <code>CacheObject</code> | The CacheObject returned from the cache backend |

<a name="Crawler+event_fetchredirect"></a>

#### "fetchredirect" (queueItem, redirectQueueItem, response)
Fired when the server returned a redirect HTTP status for the request


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request was redirected |
| redirectQueueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for the redirect target resource |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_fetch404"></a>

#### "fetch404" (queueItem, response)
Fired when the server returned a 404 Not Found status for the request


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request returned a 404 status |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_fetch410"></a>

#### "fetch410" (queueItem, response)
Fired when the server returned a 410 Gone status for the request


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request returned a 410 status |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_fetcherror"></a>

#### "fetcherror" (queueItem, response)
Fired when the server returned a status code above 400 that isn't 404 or 410


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request failed |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_fetchcomplete"></a>

#### "fetchcomplete" (queueItem, responseBody, response)
Fired when the request has completed


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request has completed |
| responseBody | <code>String</code> \| <code>Buffer</code> | If [decodeResponses](#Crawler+decodeResponses) is true, this will be the decoded HTTP response. Otherwise it will be the raw response buffer. |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_gziperror"></a>

#### "gziperror" (queueItem, responseBody, response)
Fired when an error was encountered while unzipping the response data


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the unzipping failed |
| responseBody | <code>String</code> \| <code>Buffer</code> | If [decodeResponses](#Crawler+decodeResponses) is true, this will be the decoded HTTP response. Otherwise it will be the raw response buffer. |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_fetchdataerror"></a>

#### "fetchdataerror" (queueItem, response)
Fired when a resource couldn't be downloaded because it exceeded the maximum allowed size


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The queue item for which the request failed |
| response | <code>http.IncomingMessage</code> | The [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) for the request's response |

<a name="Crawler+event_robotstxterror"></a>

#### "robotstxterror" (error)
Fired when an error was encountered while retrieving a robots.txt file


| Param | Type | Description |
| --- | --- | --- |
| error | <code>Error</code> | The error returned from [getRobotsTxt](#Crawler+getRobotsTxt) |

<a name="Crawler+event_complete"></a>

#### "complete"
Fired when the crawl has completed - all resources in the queue have been dealt with


### A note about HTTP error conditions

By default, simplecrawler does not download the response body when it encounters an HTTP error status in the response. If you need this information, you can listen to simplecrawler's error events, and through node's native `data` event (`response.on("data",function(chunk) {...})`) you can save the information yourself.

### Waiting for asynchronous event listeners

Sometimes, you might want to wait for simplecrawler to wait for you while you perform some asynchronous tasks in an event listener, instead of having it racing off and firing the `complete` event, halting your crawl. For example, if you're doing your own link discovery using an asynchronous library method.

simplecrawler provides a `wait` method you can call at any time. It is available via `this` from inside listeners, and on the crawler object itself. It returns a callback function.

Once you've called this method, simplecrawler will not fire the `complete` event until either you execute the callback it returns, or a timeout is reached (configured in `crawler.listenerTTL`, by default 10000 ms.)

#### Example asynchronous event listener

```js
crawler.on("fetchcomplete", function(queueItem, data, res) {
    var continue = this.wait();

    doSomeDiscovery(data, function(foundURLs) {
        foundURLs.forEach(function(url) {
            crawler.queueURL(url, queueItem);
        });

        continue();
    });
});
```

## Configuration

simplecrawler is highly configurable and there's a long list of settings you can change to adapt it to your specific needs.

<a name="Crawler+initialURL"></a>

#### crawler.initialURL : <code>String</code>
Controls which URL to request first

<a name="Crawler+host"></a>

#### crawler.host : <code>String</code>
Determines what hostname the crawler should limit requests to (so long as
[filterByDomain](#Crawler+filterByDomain) is true)

<a name="Crawler+interval"></a>

#### crawler.interval : <code>Number</code>
Determines the interval at which new requests are spawned by the crawler,
as long as the number of open requests is under the
[maxConcurrency](#Crawler+maxConcurrency) cap.

<a name="Crawler+maxConcurrency"></a>

#### crawler.maxConcurrency : <code>Number</code>
Maximum request concurrency. If necessary, simplecrawler will increase
node's http agent maxSockets value to match this setting.

<a name="Crawler+timeout"></a>

#### crawler.timeout : <code>Number</code>
Maximum time we'll wait for headers

<a name="Crawler+listenerTTL"></a>

#### crawler.listenerTTL : <code>Number</code>
Maximum time we'll wait for async listeners

<a name="Crawler+userAgent"></a>

#### crawler.userAgent : <code>String</code>
Crawler's user agent string

**Default**: <code>&quot;Node/simplecrawler &lt;version&gt; (https://github.com/simplecrawler/simplecrawler)&quot;</code>  
<a name="Crawler+queue"></a>

#### crawler.queue : [<code>FetchQueue</code>](#FetchQueue)
Queue for requests. The crawler can use any implementation so long as it
uses the same interface. The default queue is simply backed by an array.

<a name="Crawler+respectRobotsTxt"></a>

#### crawler.respectRobotsTxt : <code>Boolean</code>
Controls whether the crawler respects the robots.txt rules of any domain.
This is done both with regards to the robots.txt file, and `<meta>` tags
that specify a `nofollow` value for robots. The latter only applies if
the default [discoverResources](#Crawler+discoverResources) method is used, though.

<a name="Crawler+allowInitialDomainChange"></a>

#### crawler.allowInitialDomainChange : <code>Boolean</code>
Controls whether the crawler is allowed to change the
[host](#Crawler+host) setting if the first response is a redirect to
another domain.

<a name="Crawler+decompressResponses"></a>

#### crawler.decompressResponses : <code>Boolean</code>
Controls whether HTTP responses are automatically decompressed based on
their Content-Encoding header. If true, it will also assign the
appropriate Accept-Encoding header to requests.

<a name="Crawler+decodeResponses"></a>

#### crawler.decodeResponses : <code>Boolean</code>
Controls whether HTTP responses are automatically character converted to
standard JavaScript strings using the [iconv-lite](https://www.npmjs.com/package/iconv-lite)
module before emitted in the [fetchcomplete](#Crawler+event_fetchcomplete) event.
The character encoding is interpreted from the Content-Type header
firstly, and secondly from any `<meta charset="xxx" />` tags.

<a name="Crawler+filterByDomain"></a>

#### crawler.filterByDomain : <code>Boolean</code>
Controls whether the crawler fetches only URL's where the hostname
matches [host](#Crawler+host). Unless you want to be crawling the entire
internet, I would recommend leaving this on!

<a name="Crawler+scanSubdomains"></a>

#### crawler.scanSubdomains : <code>Boolean</code>
Controls whether URL's that points to a subdomain of [host](#Crawler+host)
should also be fetched.

<a name="Crawler+ignoreWWWDomain"></a>

#### crawler.ignoreWWWDomain : <code>Boolean</code>
Controls whether to treat the www subdomain as the same domain as
[host](#Crawler+host). So if [http://example.com/example](http://example.com/example) has
already been fetched, [http://www.example.com/example](http://www.example.com/example) won't be
fetched also.

<a name="Crawler+stripWWWDomain"></a>

#### crawler.stripWWWDomain : <code>Boolean</code>
Controls whether to strip the www subdomain entirely from URL's at queue
item construction time.

<a name="Crawler+cache"></a>

#### crawler.cache : <code>SimpleCache</code>
Internal cache store. Must implement `SimpleCache` interface. You can
save the site to disk using the built in file system cache like this:

```js
crawler.cache = new Crawler.cache('pathToCacheDirectory');
```

<a name="Crawler+useProxy"></a>

#### crawler.useProxy : <code>Boolean</code>
Controls whether an HTTP proxy should be used for requests

<a name="Crawler+proxyHostname"></a>

#### crawler.proxyHostname : <code>String</code>
If [useProxy](#Crawler+useProxy) is true, this setting controls what hostname
to use for the proxy

<a name="Crawler+proxyPort"></a>

#### crawler.proxyPort : <code>Number</code>
If [useProxy](#Crawler+useProxy) is true, this setting controls what port to
use for the proxy

<a name="Crawler+proxyUser"></a>

#### crawler.proxyUser : <code>String</code>
If [useProxy](#Crawler+useProxy) is true, this setting controls what username
to use for the proxy

<a name="Crawler+proxyPass"></a>

#### crawler.proxyPass : <code>String</code>
If [useProxy](#Crawler+useProxy) is true, this setting controls what password
to use for the proxy

<a name="Crawler+needsAuth"></a>

#### crawler.needsAuth : <code>Boolean</code>
Controls whether to use HTTP Basic Auth

<a name="Crawler+authUser"></a>

#### crawler.authUser : <code>String</code>
If [needsAuth](#Crawler+needsAuth) is true, this setting controls what username
to send with HTTP Basic Auth

<a name="Crawler+authPass"></a>

#### crawler.authPass : <code>String</code>
If [needsAuth](#Crawler+needsAuth) is true, this setting controls what password
to send with HTTP Basic Auth

<a name="Crawler+acceptCookies"></a>

#### crawler.acceptCookies : <code>Boolean</code>
Controls whether to save and send cookies or not

<a name="Crawler+cookies"></a>

#### crawler.cookies : [<code>CookieJar</code>](#CookieJar)
The module used to store cookies

<a name="Crawler+customHeaders"></a>

#### crawler.customHeaders : <code>Object</code>
Controls what headers (besides the default ones) to include with every
request.

<a name="Crawler+domainWhitelist"></a>

#### crawler.domainWhitelist : <code>Array</code>
Controls what domains the crawler is allowed to fetch from, regardless of
[host](#Crawler+host) or [filterByDomain](#Crawler+filterByDomain) settings.

<a name="Crawler+allowedProtocols"></a>

#### crawler.allowedProtocols : <code>Array.&lt;RegExp&gt;</code>
Controls what protocols the crawler is allowed to fetch from

<a name="Crawler+maxResourceSize"></a>

#### crawler.maxResourceSize : <code>Number</code>
Controls the maximum allowed size in bytes of resources to be fetched

**Default**: <code>16777216</code>  
<a name="Crawler+supportedMimeTypes"></a>

#### crawler.supportedMimeTypes : <code>Array.&lt;(RegExp\|string)&gt;</code>
Controls what mimetypes the crawler will scan for new resources. If
[downloadUnsupported](#Crawler+downloadUnsupported) is false, this setting will also
restrict what resources are downloaded.

<a name="Crawler+downloadUnsupported"></a>

#### crawler.downloadUnsupported : <code>Boolean</code>
Controls whether to download resources with unsupported mimetypes (as
specified by [supportedMimeTypes](#Crawler+supportedMimeTypes))

<a name="Crawler+urlEncoding"></a>

#### crawler.urlEncoding : <code>String</code>
Controls what URL encoding to use. Can be either "unicode" or "iso8859"

<a name="Crawler+stripQuerystring"></a>

#### crawler.stripQuerystring : <code>Boolean</code>
Controls whether to strip query string parameters from URL's at queue
item construction time.

<a name="Crawler+sortQueryParameters"></a>

#### crawler.sortQueryParameters : <code>Boolean</code>
Controls whether to sort query string parameters from URL's at queue
item construction time.

<a name="Crawler+discoverRegex"></a>

#### crawler.discoverRegex : <code>Array.&lt;(RegExp\|function())&gt;</code>
Collection of regular expressions and functions that are applied in the
default [discoverResources](#Crawler+discoverResources) method.

<a name="Crawler+parseHTMLComments"></a>

#### crawler.parseHTMLComments : <code>Boolean</code>
Controls whether the default [discoverResources](#Crawler+discoverResources) should
scan for new resources inside of HTML comments.

<a name="Crawler+parseScriptTags"></a>

#### crawler.parseScriptTags : <code>Boolean</code>
Controls whether the default [discoverResources](#Crawler+discoverResources) should
scan for new resources inside of `<script>` tags.

<a name="Crawler+maxDepth"></a>

#### crawler.maxDepth : <code>Number</code>
Controls the max depth of resources that the crawler fetches. 0 means
that the crawler won't restrict requests based on depth. The initial
resource, as well as manually queued resources, are at depth 1. From
there, every discovered resource adds 1 to its referrer's depth.

<a name="Crawler+ignoreInvalidSSL"></a>

#### crawler.ignoreInvalidSSL : <code>Boolean</code>
Controls whether to proceed anyway when the crawler encounters an invalid
SSL certificate.

<a name="Crawler+httpAgent"></a>

#### crawler.httpAgent : <code>HTTPAgent</code>
Controls what HTTP agent to use. This is useful if you want to configure
eg. a SOCKS client.

<a name="Crawler+httpsAgent"></a>

#### crawler.httpsAgent : <code>HTTPAgent</code>
Controls what HTTPS agent to use. This is useful if you want to configure
eg. a SOCKS client.


## Fetch conditions

simplecrawler has an concept called fetch conditions that offers a flexible API for filtering discovered resources before they're put in the queue. A fetch condition is a function that takes a queue item candidate and evaluates (synchronously or asynchronously) whether it should be added to the queue or not. *Please note: with the next major release, all fetch conditions will be asynchronous.*

You may add as many fetch conditions as you like, and remove them at runtime. simplecrawler will evaluate every fetch condition in parallel until one is encountered that returns a falsy value. If that happens, the resource in question will not be fetched.

This API is complemented by [download conditions](#download-conditions) that determine whether a resource's body data should be downloaded.

<a name="Crawler+addFetchCondition"></a>

#### crawler.addFetchCondition(callback) ⇒ <code>Number</code>
Adds a callback to the fetch conditions array. simplecrawler will evaluate
all fetch conditions for every discovered URL, and if any of the fetch
conditions returns a falsy value, the URL won't be queued.

**Returns**: <code>Number</code> - The index of the fetch condition in the fetch conditions array. This can later be used to remove the fetch condition.  

| Param | Type | Description |
| --- | --- | --- |
| callback | [<code>addFetchConditionCallback</code>](#Crawler..addFetchConditionCallback) | Function to be called after resource discovery that's able to prevent queueing of resource |

<a name="Crawler..addFetchConditionCallback"></a>

#### Crawler~addFetchConditionCallback : <code>function</code>
Evaluated for every discovered URL to determine whether to put it in the
queue.


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The resource to be queued (or not) |
| referrerQueueItem | [<code>QueueItem</code>](#QueueItem) | The resource where `queueItem` was discovered |
| callback | <code>function</code> |  |

<a name="Crawler+removeFetchCondition"></a>

#### crawler.removeFetchCondition(id) ⇒ <code>Boolean</code>
Removes a fetch condition from the fetch conditions array.

**Returns**: <code>Boolean</code> - If the removal was successful, the method will return true. Otherwise, it will throw an error.  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Number</code> \| <code>function</code> | The numeric ID of the fetch condition, or a reference to the fetch condition itself. This was returned from [addFetchCondition](#Crawler+addFetchCondition) |


## Download conditions

While fetch conditions let you determine which resources to put in the queue, download conditions offer the same kind of flexible API for determining which resources' data to download. Download conditions support both a synchronous and an asynchronous API, but *with the next major release, all download conditions will be asynchronous.*

Download conditions are evaluated after the headers of a resource have been downloaded, if that resource returned an HTTP status between 200 and 299. This lets you inspect the content-type and content-length headers, along with all other properties on the queue item, before deciding if you want this resource's data or not.

<a name="Crawler+addDownloadCondition"></a>

#### crawler.addDownloadCondition(callback) ⇒ <code>Number</code>
Adds a callback to the download conditions array. simplecrawler will evaluate
all download conditions for every fetched resource after the headers of that
resource have been received. If any of the download conditions returns a
falsy value, the resource data won't be downloaded.

**Returns**: <code>Number</code> - The index of the download condition in the download conditions array. This can later be used to remove the download condition.  

| Param | Type | Description |
| --- | --- | --- |
| callback | [<code>addDownloadConditionCallback</code>](#Crawler..addDownloadConditionCallback) | Function to be called when the headers of the resource represented by the queue item have been downloaded |

<a name="Crawler..addDownloadConditionCallback"></a>

#### Crawler~addDownloadConditionCallback : <code>function</code>
Evaluated for every fetched resource after its header have been received to
determine whether to fetch the resource body.


| Param | Type | Description |
| --- | --- | --- |
| queueItem | [<code>QueueItem</code>](#QueueItem) | The resource to be downloaded (or not) |
| response | <code>http.IncomingMessage</code> | The response object as returned by node's `http` API |
| callback | <code>function</code> |  |

<a name="Crawler+removeDownloadCondition"></a>

#### crawler.removeDownloadCondition(id) ⇒ <code>Boolean</code>
Removes a download condition from the download conditions array.

**Returns**: <code>Boolean</code> - If the removal was successful, the method will return true. Otherwise, it will throw an error.  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>Number</code> \| <code>function</code> | The numeric ID of the download condition, or a reference to the download condition itself. The ID was returned from [addDownloadCondition](#Crawler+addDownloadCondition) |


## The queue

Like any other web crawler, simplecrawler has a queue. It can be directly accessed through <code><a href="#Crawler+queue">crawler.queue</a></code> and implements an asynchronous interface for accessing queue items and statistics. There are several methods for interacting with the queue, the simplest being <code><a href="#FetchQueue+get">crawler.queue.get</a></code>, which lets you get a queue item at a specific index in the queue.

<a name="FetchQueue+get"></a>

#### fetchQueue.get(index, callback)
Get a queue item by index


| Param | Type | Description |
| --- | --- | --- |
| index | <code>Number</code> | The index of the queue item in the queue |
| callback | <code>function</code> | Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`. |


*All queue method are in reality synchronous by default, but simplecrawler is built to be able to use different queues that implement the same interface, and those implementations can be asynchronous - which means they could eg. be backed by a database.*

### Manually adding to the queue

To add items to the queue, use <code><a href="#Crawler+queueURL">crawler.queueURL</a></code>.

<a name="Crawler+queueURL"></a>

#### crawler.queueURL(url, [referrer], [force]) ⇒ <code>Boolean</code>
Queues a URL for fetching after cleaning, validating and constructing a queue
item from it. If you're queueing a URL manually, use this method rather than
[Crawler#queue#add](Crawler#queue#add)

**Returns**: <code>Boolean</code> - The return value used to indicate whether the URL passed all fetch conditions and robots.txt rules. With the advent of async fetch conditions, the return value will no longer take fetch conditions into account.  
**Emits**: [<code>invaliddomain</code>](#Crawler+event_invaliddomain), [<code>fetchdisallowed</code>](#Crawler+event_fetchdisallowed), [<code>fetchconditionerror</code>](#Crawler+event_fetchconditionerror), [<code>fetchprevented</code>](#Crawler+event_fetchprevented), [<code>queueduplicate</code>](#Crawler+event_queueduplicate), [<code>queueerror</code>](#Crawler+event_queueerror), [<code>queueadd</code>](#Crawler+event_queueadd)  

| Param | Type | Description |
| --- | --- | --- |
| url | <code>String</code> | An absolute or relative URL. If relative, [processURL](#Crawler+processURL) will make it absolute to the referrer queue item. |
| [referrer] | [<code>QueueItem</code>](#QueueItem) | The queue item representing the resource where this URL was discovered. |
| [force] | <code>Boolean</code> | If true, the URL will be queued regardless of whether it already exists in the queue or not. |


### Queue items

Because when working with simplecrawler, you'll constantly be handed queue items, it helps to know what's inside them. Here's the formal documentation of the properties that they contain.

<a name="QueueItem"></a>

#### QueueItem : <code>Object</code>
QueueItems represent resources in the queue that have been fetched, or will be eventually.

**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>Number</code> | A unique ID assigned by the queue when the queue item is added |
| url | <code>String</code> | The complete, canonical URL of the resource |
| protocol | <code>String</code> | The protocol of the resource (http, https) |
| host | <code>String</code> | The full domain/hostname of the resource |
| port | <code>Number</code> | The port of the resource |
| path | <code>String</code> | The URL path, including the query string |
| uriPath | <code>String</code> | The URL path, excluding the query string |
| depth | <code>Number</code> | How many steps simplecrawler has taken from the initial page (which is depth 1) to this resource. |
| referrer | <code>String</code> | The URL of the resource where the URL of this queue item was discovered |
| fetched | <code>Boolean</code> | Has the request for this item been completed? You can monitor this as requests are processed. |
| status | <code>&#x27;queued&#x27;</code> \| <code>&#x27;spooled&#x27;</code> \| <code>&#x27;headers&#x27;</code> \| <code>&#x27;downloaded&#x27;</code> \| <code>&#x27;redirected&#x27;</code> \| <code>&#x27;notfound&#x27;</code> \| <code>&#x27;failed&#x27;</code> | The internal status of the item. |
| stateData | <code>Object</code> | An object containing state data and other information about the request. |
| stateData.requestLatency | <code>Number</code> | The time (in ms) taken for headers to be received after the request was made. |
| stateData.requestTime | <code>Number</code> | The total time (in ms) taken for the request (including download time.) |
| stateData.downloadTime | <code>Number</code> | The total time (in ms) taken for the resource to be downloaded. |
| stateData.contentLength | <code>Number</code> | The length (in bytes) of the returned content. Calculated based on the `content-length` header. |
| stateData.contentType | <code>String</code> | The MIME type of the content. |
| stateData.code | <code>Number</code> | The HTTP status code returned for the request. Note that this code is `600` if an error occurred in the client and a fetch operation could not take place successfully. |
| stateData.headers | <code>Object</code> | An object containing the header information returned by the server. This is the object node returns as part of the `response` object. |
| stateData.actualDataSize | <code>Number</code> | The length (in bytes) of the returned content. Calculated based on what is actually received, not the `content-length` header. |
| stateData.sentIncorrectSize | <code>Boolean</code> | True if the data length returned by the server did not match what we were told to expect by the `content-length` header. |


### Queue statistics and reporting

First of all, the queue can provide some basic statistics about the network performance of your crawl so far. This is done live, so don't check it 30 times a second. You can test the following properties:

* `requestTime`
* `requestLatency`
* `downloadTime`
* `contentLength`
* `actualDataSize`

You can get the maximum, minimum, and average values for each with the <code><a href="#FetchQueue+max">crawler.queue.max</a></code>, <code><a href="#FetchQueue+min">crawler.queue.min</a></code>, and <code><a href="#FetchQueue+avg">crawler.queue.avg</a></code> functions respectively.

<a name="FetchQueue+max"></a>

#### fetchQueue.max(statisticName, callback)
Gets the maximum value of a stateData property from all the items in the
queue. This means you can eg. get the maximum request time, download size
etc.


| Param | Type | Description |
| --- | --- | --- |
| statisticName | <code>String</code> | Can be any of the strings in [_allowedStatistics](#FetchQueue._allowedStatistics) |
| callback | <code>function</code> | Gets two parameters, `error` and `max`. If the operation was successful, `error` will be `null`. |

<a name="FetchQueue+min"></a>

#### fetchQueue.min(statisticName, callback)
Gets the minimum value of a stateData property from all the items in the
queue. This means you can eg. get the minimum request time, download size
etc.


| Param | Type | Description |
| --- | --- | --- |
| statisticName | <code>String</code> | Can be any of the strings in [_allowedStatistics](#FetchQueue._allowedStatistics) |
| callback | <code>function</code> | Gets two parameters, `error` and `min`. If the operation was successful, `error` will be `null`. |

<a name="FetchQueue+avg"></a>

#### fetchQueue.avg(statisticName, callback)
Gets the average value of a stateData property from all the items in the
queue. This means you can eg. get the average request time, download size
etc.


| Param | Type | Description |
| --- | --- | --- |
| statisticName | <code>String</code> | Can be any of the strings in [_allowedStatistics](#FetchQueue._allowedStatistics) |
| callback | <code>function</code> | Gets two parameters, `error` and `avg`. If the operation was successful, `error` will be `null`. |


For general filtering or counting of queue items, there are two methods: <code><a href="#FetchQueue+filterItems">crawler.queue.filterItems</a></code> and <code><a href="#FetchQueue+countItems">crawler.queue.countItems</a></code>. Both take an object comparator and a callback.

<a name="FetchQueue+filterItems"></a>

#### fetchQueue.filterItems(comparator, callback)
Filters and returns the items in the queue that match a selector


| Param | Type | Description |
| --- | --- | --- |
| comparator | <code>Object</code> | Comparator object used to filter items. Queue items that are returned need to match all the properties of this object. |
| callback | <code>function</code> | Gets two parameters, `error` and `items`. If the operation was successful, `error` will be `null` and `items` will be an array of QueueItems. |

<a name="FetchQueue+countItems"></a>

#### fetchQueue.countItems(comparator, callback, callback)
Counts the items in the queue that match a selector


| Param | Type | Description |
| --- | --- | --- |
| comparator | <code>Object</code> | Comparator object used to filter items. Queue items that are counted need to match all the properties of this object. |
| callback | <code>FetchQueue~countItemsCallback</code> |  |
| callback | <code>function</code> | Gets two parameters, `error` and `items`. If the operation was successful, `error` will be `null` and `items` will be an array of QueueItems. |


The object comparator can also contain other objects, so you may filter queue items based on properties in their `stateData` object as well.

```js
crawler.queue.filterItems({
    stateData: { code: 301 }
}, function(error, items) {
    console.log("These items returned a 301 HTTP status", items);
});
```

### Saving and reloading the queue (freeze/defrost)

It can be convenient to be able to save the crawl progress and later be able to reload it if your application fails or you need to abort the crawl for some reason. The `crawler.queue.freeze` and `crawler.queue.defrost` methods will let you do this.

**A word of warning** - they are not CPU friendly as they rely on `JSON.parse` and `JSON.stringify`. Use them only when you need to save the queue - don't call them after every request or your application's performance will be incredibly poor - they block like *crazy*. That said, using them when your crawler commences and stops is perfectly reasonable.

Note that the methods themselves are asynchronous, so if you are going to exit the process after you do the freezing, make sure you wait for callback - otherwise you'll get an empty file.

<a name="FetchQueue+freeze"></a>

#### fetchQueue.freeze(filename, callback)
Writes the queue to disk in a JSON file. This file can later be imported
using [defrost](#FetchQueue+defrost)


| Param | Type | Description |
| --- | --- | --- |
| filename | <code>String</code> | Filename passed directly to [fs.writeFile](https://nodejs.org/api/fs.html#fs_fs_writefile_file_data_options_callback) |
| callback | <code>function</code> | Gets a single `error` parameter. If the operation was successful, this parameter will be `null`. |

<a name="FetchQueue+defrost"></a>

#### fetchQueue.defrost(filename, callback)
Import the queue from a frozen JSON file on disk.


| Param | Type | Description |
| --- | --- | --- |
| filename | <code>String</code> | Filename passed directly to [fs.readFile](https://nodejs.org/api/fs.html#fs_fs_readfile_file_options_callback) |
| callback | <code>function</code> | Gets a single `error` parameter. If the operation was successful, this parameter will be `null`. |


## Cookies

simplecrawler has an internal cookie jar, which collects and resends cookies automatically and by default. If you want to turn this off, set the <code><a href="#Crawler+acceptCookies">crawler.acceptCookies</a></code> option to `false`. The cookie jar is accessible via <code><a href="#Crawler+cookies">crawler.cookies</a></code>, and is an event emitter itself.

### Cookie events

<a name="CookieJar+event_addcookie"></a>

#### "addcookie" (cookie)
Fired when a cookie has been added to the jar


| Param | Type | Description |
| --- | --- | --- |
| cookie | [<code>Cookie</code>](#Cookie) | The cookie that has been added |

<a name="CookieJar+event_removecookie"></a>

#### "removecookie" (cookie)
Fired when one or multiple cookie have been removed from the jar


| Param | Type | Description |
| --- | --- | --- |
| cookie | [<code>Array.&lt;Cookie&gt;</code>](#Cookie) | The cookies that have been removed |


## Link Discovery

simplecrawler's discovery function is made to be replaceable — you can easily write your own that discovers only the links you're interested in.

The method must accept a buffer and a [`queueItem`](#queue-items), and return the resources that are to be added to the queue.

It is quite common to pair simplecrawler with a module like [cheerio](https://npmjs.com/package/cheerio) that can correctly parse HTML and provide a DOM like API for querying — or even a whole headless browser, like phantomJS.

The example below demonstrates how one might achieve basic HTML-correct discovery of only link tags using cheerio.

```js
crawler.discoverResources = function(buffer, queueItem) {
    var $ = cheerio.load(buffer.toString("utf8"));

    return $("a[href]").map(function () {
        return $(this).attr("href");
    }).get();
};
```

## FAQ/Troubleshooting

There are a couple of questions that pop up more often than others in the issue tracker. If you're having trouble with simplecrawler, please have a look at the list below before submitting an issue.

- **Q: Why does simplecrawler discover so many invalid URLs?**

    A: simplecrawler's built-in discovery method is purposefully naive - it's a brute force approach intended to find everything: URLs in comments, binary files, scripts, image EXIF data, inside CSS documents, and more — useful for archiving and use cases where it's better to have false positives than fail to discover a resource.

    It's definitely not a solution for every case, though — if you're writing a link checker or validator, you don't want erroneous 404s throwing errors. Therefore, simplecrawler allows you to tune discovery in a few key ways:

    - You can either add to (or remove from) the <code><a href="#Crawler+discoverRegex">crawler.discoverRegex</a></code> array, tweaking the search patterns to meet your requirements; or
    - Swap out the `discoverResources` method. Parsing HTML pages is beyond the scope of simplecrawler, but it is very common to combine simplecrawler with a module like [cheerio](https://npmjs.com/package/cheerio) for more sophisticated resource discovery.

    Further documentation is available in the [link discovery](#link-discovery) section.

- **Q: Why did simplecrawler complete without fetching any resources?**

    A: When this happens, it is usually because the initial request was redirected to a different domain that wasn't in the <code><a href="#Crawler+domainWhitelist">crawler.domainWhitelist</a></code>.

- **Q: How do I crawl a site that requires a login?**

    A: Logging in to a site is usually fairly simple and most login procedures look alike. We've included an example that covers a lot of situations, but sadly, there isn't a one true solution for how to deal with logins, so there's no guarantee that this code works right off the bat.

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

    A: One of the core concepts of node.js is its asynchronous nature. I/O operations (like network requests) take place outside of the main thread (which is where your code is executed). This is what makes node fast, the fact that it can continue executing code while there are multiple HTTP requests in flight, for example. But to be able to get back the result of the HTTP request, we need to register a function that will be called when the result is ready. This is what *asynchronous* means in node - the fact that code can continue executing while I/O operations are in progress - and it's the same concept as with AJAX requests in the browser.

- **Q: Promises are nice, can I use them with simplecrawler?**

    A: No, not really. Promises are meant as a replacement for callbacks, but simplecrawler is event driven, not callback driven. Using callbacks to any greater extent in simplecrawler wouldn't make much sense, since you normally need to react more than once to what happens in simplecrawler.

- **Q: Something's happening and I don't see the output I'm expecting!**

    Before filing an issue, check to see that you're not just missing something by logging *all* crawler events with the code below:

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

    If you don't see what you need after inserting that code block, and you still need help, please attach the output of all the events fired with your email/issue.

## Node Support Policy

Simplecrawler will officially support stable and LTS versions of Node which are currently supported by the Node Foundation.

Currently supported versions:

- 8.x
- 10.x
- 12.x

## Current Maintainers

* [Christopher Giffard](https://github.com/cgiffard)
* [Fredrik Ekelund](https://github.com/fredrikekelund)
* [Konstantin Bläsi](https://github.com/konstantinblaesi)
* [XhmikosR](https://github.com/XhmikosR)

## Contributing

Please see the [contributor guidelines](https://github.com/simplecrawler/simplecrawler/blob/master/CONTRIBUTING.md) before submitting a pull request to ensure that your contribution is able to be accepted quickly and easily!

## Contributors

simplecrawler has benefited from the kind efforts of dozens of contributors, to whom we are incredibly grateful. We originally listed their individual contributions but it became pretty unwieldy - the [full list can be found here.](https://github.com/simplecrawler/simplecrawler/graphs/contributors)

## License

Copyright (c) 2017, Christopher Giffard.

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
