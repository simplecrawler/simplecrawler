// Runs a very simple crawl on an HTTP server

var chai = require("chai");
	chai.should();

// Require the same server as in our previous tests...
var testserver = require("./lib/testserver.js");

describe("Crawler reliability",function() {

	var Crawler	= require("../");

	// Create a new crawler to crawl this server
	var localCrawler = Crawler.crawl("http://127.0.0.1:3000/timeout");
		localCrawler.timeout = 500;
	
	it("should be able to handle a timeout",function(done) {
		localCrawler.on("fetchtimeout",function(queueItem) {
			queueItem.should.be.an("object");
			queueItem.url.should.equal("http://127.0.0.1:3000/timeout");
			done();
		});
	});
});