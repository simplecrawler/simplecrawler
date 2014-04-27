// Runs a very simple crawl on an HTTP server with different depth

var chai = require("chai");
    chai.should();

var testserver = require("./lib/testserver.js");

var Crawler	= require("../");

// Test the number of links discovered for the given "depth" and compare it to "linksToDiscover"
var depthTest = function(depth, linksToDiscover) {
	depth = parseInt(depth); // Force depth to be a number

	var crawler;
	var linksDiscovered;

	describe("depth "+ depth, function() {
		before(function() {
			// Create a new crawler to crawl our local test server
			crawler = new Crawler("127.0.0.1","/depth/1",3000);

			// Speed up tests. No point waiting for every request when we're running
			// our own server.
			crawler.interval = 1;

			// Define max depth for this crawl
			crawler.maxDepth = depth;

			linksDiscovered = 0;

			crawler.on("fetchcomplete",function(queueItem) {
				linksDiscovered++;
			});

			crawler.start();
		});

		after(function() {
			// Clean listeners and crawler
			crawler.removeAllListeners("discoverycomplete");
			crawler.removeAllListeners("complete");
			crawler = null;
		});

		it("should discover "+ linksToDiscover +" linked resources",function(done) {
			crawler.on("complete",function() {
				linksDiscovered.should.equal(linksToDiscover);
				done();
			});
		});
	});
};

describe("Crawler max depth",function() {

	// depth: linksToDiscover
	var linksToDiscover = {
		0: 11, // links for depth 0
		1: 6,  // links for depth 1
		2: 7,  // links for depth 2
		3: 11  // links for depth 3
	};

	for(var depth in linksToDiscover) {
		depthTest(depth, linksToDiscover[depth]);
	}

});
