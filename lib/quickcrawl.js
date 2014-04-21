var Crawler	= require("./crawler.js"),
	URI		= require("URIjs");


/*
	Public: Convenience function for really quick, simple crawls. It generates
	a new crawler, parses the URL provided, and sets up the new crawler with
	the host and path information extracted from the URL. It returns the crawler
	object, so you can set up event handlers, and waits until `process.nextTick`
	before kicking off the crawl.

	url					-	URL to begin crawl from.
	successCallback		-	Optional function called once an item is completely
							downloaded. Functionally identical to a fetchcomplete
							event listener.
	failCallback		-	Optional function to be called if an item fails to
							download. Functionally identical to a fetcherror
							event listener.

	Examples

		Crawler.crawl(
			"http://example.com:3000/start",
			function(queueItem,data) {
				console.log("I got a new item!");
			}
		);

		Crawler
			.crawl("http://www.example.com/")
			.on("fetchstart",function(queueItem) {
				console.log("Beginning fetch for",queueItem.url);
			});

	Returns the crawler object which has now been constructed.

*/
module.exports = function crawl(url,successCallback,failCallback) {

	// Parse the URL first
	url = URI(url);

	// If either the protocol, path, or hostname are unset, we can't really
	// do much. Die with error.
	if (!url.protocol())
		throw new Error("Can't crawl with unspecified protocol.");

	if (!url.hostname())
		throw new Error("Can't crawl with unspecified hostname.");

	if (!url.path())
		throw new Error("Can't crawl with unspecified path.");

	var tmpCrawler =
			new Crawler(
				url.hostname(),
				url.path(),
				url.port() || 80);

	// Attach callbacks if they were provided
	if (successCallback)	tmpCrawler.on("fetchcomplete",successCallback);
	if (failCallback)		tmpCrawler.on("fetcherror",failCallback);

	// Start the crawler on the next runloop
	// This enables initial configuration options and event handlers to take
	// effect before the first resource is queued.
	process.nextTick(function() {
		tmpCrawler.start();
	});

	// Return crawler
	return tmpCrawler;
};
