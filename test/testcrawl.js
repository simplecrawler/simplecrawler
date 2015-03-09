// Runs a very simple crawl on an HTTP server
// This is more of an integration test than a unit test.

var chai = require("chai");
    chai.should();

var testserver = require("./lib/testserver.js");

describe("Test Crawl",function() {

	var Crawler	= require("../");

	// Create a new crawler to crawl this server
	var localCrawler = new Crawler("127.0.0.1","/",3000),
		asyncCrawler = new Crawler("127.0.0.1","/",3000);

	// Speed up tests. No point waiting for every request when we're running
	// our own server.
	localCrawler.interval = asyncCrawler.interval = 1;

	var linksDiscovered = 0;

	it("should be able to be started",function(done) {

		localCrawler.on("crawlstart",function() { done() });
		localCrawler.on("discoverycomplete",function() {
			linksDiscovered ++;
		});

		localCrawler.start();
		localCrawler.running.should.be.truthy;
	});

	it("should have a queue with at least the initial crawl path",function() {

		localCrawler.queue.length.should.be.greaterThan(0);
	});

	it("should discover all linked resources in the queue",function(done) {

		localCrawler.on("complete",function() {
			linksDiscovered.should.equal(5);
			done();
		});
	});

	it("should support async event listeners for manual discovery",function(done) {

		this.slow('1s')

		// Use a different crawler this time
		asyncCrawler.discoverResources = false;
		asyncCrawler.queueURL("http://127.0.0.1:3000/async-stage1");
		asyncCrawler.start();

		asyncCrawler.on("fetchcomplete",function(queueItem,data,res) {
			var evtDone = this.wait();

			setTimeout(function(){
				linksDiscovered ++;

				if (String(data).match(/complete/i))
					return evtDone();

				// Taking advantage of the fact that for these, the sum total
				// of the body data is a URL.
				asyncCrawler.queueURL(String(data)).should.be.true;

				evtDone();
			},100);
		});

		asyncCrawler.on("complete",function() {
			linksDiscovered.should.equal(8);
			done();
		});
	});

	it('should not throw an error if header Referer is undefined', function (done) {
		var crawler = new Crawler("127.0.0.1","/depth/1",3000);
		crawler.maxDepth = 1;
		crawler.start();
		crawler.on('complete', function () { done(); });
	});

	// TODO

	// Test how simple error conditions, content types, and responses are handled.

	// Test encodings.

	// Test URL detection

	// Test handling binary data

	// Test bad content length

});
