// Runs a very simple crawl on an HTTP server

var chai = require("chai");
chai.should();

var testserver = require("./lib/testserver.js");

describe("Test Crawl",function() {
	
	var Crawler	= require("../");
	
	// Create a new crawler to crawl this server
	var localCrawler = new Crawler("127.0.0.1","/",3000);
	
	it("should be able to be started",function(done) {
		
		localCrawler.on("crawlstart",done);
		
		localCrawler.start();
		localCrawler.running.should.be.truthy;
	});
	
	it("should have a queue with at least the initial crawl path",function() {
		
		localCrawler.queue.length.should.be.greaterThan(0);
	});
	
	it("should completely fetch or fail on every resource in the queue",function(done) {
		
		localCrawler.on("complete",function() {
			done();
		});
		
	});
	
	// Todo: test how simple error conditions, content types, and responses
	// are handled.
	
	// Test encodings.
	
	// Test URL detection
	
	// Test handling binary data
	
	// test bad content length

});