#!/usr/bin/env node
/*global console:true */

// CLI module for crawling.
// Not yet built.

var crawlCLI	= getMod("commander"),
	color		= getMod("color"),
	packageInfo	= require("../package.json"),
	Crawler		= require("./index.js"),
	util		= require("util");

// Little utility to handle missing modules more nicely.
function getMod(m) {
	try {
		return require(m);

	} catch (e) {
		console.error(
			"Error: You need to install the module '" + m + "' to use the CLI.");

		process.exit(1);
	}
}

// Kill process with error
function die(message) {
	console.error(message);
	process.exit(1);
}

// Convert natural strings to booleans
function toBool(b) {
	b = b.trim();

	if (b === "1" || b === "yes" || b === "true" || b === "y")
		return true;

	return false;
}

// Sanitise hostname
function toHostname(input) {
	return String(input).trim().replace(/[^a-z0-9\-\.]/ig,"");
}

// Function determine if an option is present
function hasOpt(i) {
	return i !== null && i !== undefined;
}

// Returns the input, or a default.
function thisOrDefault(val,def) {
	return hasOpt(val) && val ? val : def;
}

// Crawler log function
function log() {
	process.stdout.write(
		String(Date()) + " " +
		util.format.apply(util,arguments) +
		"\n"
	);
}

// Crawler error function
function error() {
	process.stderr.write(
		String(Date()).red + " " +
		util.format.apply(util,arguments) +
		"\n"
	);
}

// Arh hahahahaha
// Array for each, but for objects.
Object.prototype.forEach = function(infunc) {
	for (var key in this) {
		if (!this.hasOwnProperty(key)) continue;
		infunc.call(this,key,this[key]);
	}
	return this;
};

crawlCLI
	.version(packageInfo.version)
	.option("--host",			"Hostname for crawl",toHostname)
	.option("--path",			"Path from which to crawl")
	.option("--port",			"Initial port from which to commence crawl",parseFloat)
	.option("--protocol",		"Initial protocol from which to commence crawl")
	.option("-i --interval",	"Crawl runloop interval (defaults to 250msec)", parseFloat)
	.option("-c --concurrency",	"Maximum request concurrency (default 5)", parseFloat)
	.option("-t --timeout",		"Request timeout in milliseconds", parseFloat)
	.option("-u --useragent",	"User agent with which to make requests")
	.option("--filterdomain",	"Limit the crawler to a given domain (defaults true)",toBool)
	.option("--scansubdomains",	"Allow the crawler to crawl subdomains (defaults true)",toBool)
	.option("--ignorewww",		"Consider www.<host> the same as <host> (defaults true)",toBool)
	.option("--stripwww",		"Strips WWW from discovered links (defaults false)",toBool)
	.option("--proxy",			"Specify a proxy hostname to use",toHostname)
	.option("--proxyport",		"Specify a proxy port to use",parseFloat)
	.option("--maxresourcesize","The maximum resource size, in bytes, which will be downloaded. Defaults to 16MB.",parseFloat)
	.option("--user",			"Specify a username for HTTP basic auth")
	.option("--pass",			"Specify a password for HTTP basic auth")
	.option("-c --cookies",		"Should simplecrawler accept cookies? (defaults true)",toBool)
	.option("-v --verbose",		"Verbose mode (outputs all events)")
	.option("-d --detail",		"Shows explicit event detail (even more verbose!)")
	.option("-j --json",		"Outputs crawl data as JSON")
	.parse(process.argv);

// Crate the crawler
var crawler = new Crawler(),
	urls = crawlCLI.args.filter(function(url) {
		return !!String(url).trim().length;
	});

// Check we've got some base to start crawling from
if (!urls.length && !crawlCLI.host)
	die("Nothing to crawl from. Specify a URL(s) or a hostname using --host.");

// Set initial values...
if (!!crawlCLI.host) crawler.host = crawlCLI.host;
if (!!crawlCLI.path) crawler.initialPath = crawlCLI.path;

if (!!crawlCLI.protocol) {
	if (crawlCLI.protocol !== "http" || crawlCLI.protocol !== "https")
		die("Protocol must be one of http or https.");

	crawler.initialProtocol = crawlCLI.protocol;
}

// Queue all the URLs provided as supplementary arguments, if applicable
if (urls.length) urls.forEach(crawler.queueURL.bind(crawler));

// Configuration options!
// property								value						default
crawler.interval		= thisOrDefault(crawlCLI.interval,			250);
crawler.maxConcurrency	= thisOrDefault(crawlCLI.concurrency,		5);
crawler.timeout			= thisOrDefault(crawlCLI.timeout,			10000);
crawler.userAgent		= thisOrDefault(crawlCLI.useragent,			crawler.userAgent);
crawler.filterByDomain	= thisOrDefault(crawlCLI.filterdomain,		true);
crawler.scanSubdomains	= thisOrDefault(crawlCLI.scansubdomains,	false);
crawler.ignoreWWWDomain	= thisOrDefault(crawlCLI.ignorewww,			true);
crawler.stripWWWDomain	= thisOrDefault(crawlCLI.stripwww,			true);
crawler.maxResourceSize	= thisOrDefault(crawlCLI.maxresourcesize,	16*1024*1024); //16MB
crawler.acceptCookies	= thisOrDefault(crawlCLI.cookies,			true);

if (hasOpt(crawlCLI.proxy) && hasOpt(crawlCLI.proxyport)) {
	crawler.useProxy = true;
	crawler.proxyHostname = crawlCLI.proxy;
	crawler.proxyPort = crawlCLI.proxyport;
}

if (hasOpt(crawlCLI.user) && hasOpt(crawlCLI.pass)) {
	crawler.needsAuth = true;
	crawler.authUser = crawlCLI.user;
	crawler.authPass = crawlCLI.pass;
}

// Attach listeners for *all* the events.
({
	// Event name		is an error?		verbosity?		has queueItem available
	"crawlstart":		{"error": false,	"verbose": 0,	"queueContext": false	},
	"queueadd":			{"error": false,	"verbose": 1,	"queueContext": true	},
	"queueduplicate":	{"error": false,	"verbose": 2,	"queueContext": false	},
	"queueerror":		{"error": true,		"verbose": 0,	"queueContext": false	},
	"fetchstart":		{"error": false,	"verbose": 1,	"queueContext": true	},
	"fetchheaders":		{"error": false,	"verbose": 1,	"queueContext": true	},
	"fetchcomplete":	{"error": false,	"verbose": 0,	"queueContext": true	},
	"fetchdataerror":	{"error": true,		"verbose": 0,	"queueContext": true	},
	"fetchredirect":	{"error": false,	"verbose": 1,	"queueContext": true	},
	"fetch404":			{"error": true,		"verbose": 0,	"queueContext": true	},
	"fetcherror":		{"error": true,		"verbose": 0,	"queueContext": true	},
	"fetchtimeout":		{"error": true,		"verbose": 0,	"queueContext": true	},
	"fetchclienterror":	{"error": true,		"verbose": 0,	"queueContext": true	},
	"discoverycomplete":{"error": false,	"verbose": 2,	"queueContext": true	},
	"complete":			{"error": false,	"verbose": 0,	"queueContext": false	}
})
	.forEach(function(eventName,data) {
		crawler.on(eventName,function(queueItem) {

			// Ignore highly verbose events unless we've got a flag to tell us to pay
			// attention to them
			if (data.verbose === 2 && !crawlCLI.detail) return;
			if (data.verbose === 1 && !crawlCLI.detail && !crawlCLI.verbose) return;

			var resourceName = data.queueContext ? queueItem.url : "";

			if (data.error) {
				error("%s\t %s",eventName,resourceName);
			} else {
				log("%s\t %s",eventName,resourceName);
			}
		});
	});

crawler.start();

/*
crawlstart Fired when the crawl begins or is restarted.
queueadd ( queueItem ) Fired when a new item is automatically added to the queue (not when you manually queue an item yourself.)
queueduplicate ( URLData ) Fired when an item cannot be added to the queue because it is already present in the queue. Frequent firing of this event is normal and expected.
queueerror ( errorData , URLData ) Fired when an item cannot be added to the queue due to error.
fetchstart ( queueItem , requestOptions ) Fired when an item is spooled for fetching. If your event handler is synchronous, you can modify the crawler request options (including headers)
fetchheaders ( queueItem , responseObject ) Fired when the headers for a resource are received from the server. The node http response object is returned for your perusal.
fetchcomplete ( queueItem , responseBuffer , response ) Fired when the resource is completely downloaded. The entire file data is provided as a buffer, as well as the response object.
fetchdataerror ( queueItem, response ) Fired when a resource can't be downloaded, because it exceeds the maximum size we're prepared to receive (16MB by default.)
fetchredirect ( queueItem, parsedURL, response ) Fired when a redirect header is encountered. The new URL is validated and returned as a complete canonical link to the new resource.
fetch404 ( queueItem, response ) Fired when a 404 HTTP status code is returned for a request.
fetcherror ( queueItem, response ) Fired when an alternate 400 or 500 series HTTP status code is returned for a request.
fetchtimeout ( queueItem, crawlerTimeoutValue ) Fired when a request time exceeds the internal crawler threshold.
fetchclienterror ( queueItem, errorData ) Fired when a request dies locally for some reason. The error data is returned as the second parameter.
discoverycomplete ( queueItem, resources ) Fired when linked resources have been discovered. Passes an array of resources (as URLs) as the second parameter.
complete Fired when the crawler completes processing all the items in its queue, and does not find any more to add. This event returns no arguments.
*/