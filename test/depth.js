// Runs a very simple crawl on an HTTP server with different depth

var chai = require("chai"),
    Crawler = require("../");

require("./lib/testserver.js");

chai.should();

// Test the number of links discovered for the given "depth" and compare it to "linksToDiscover"
var depthTest = function(depth, linksToDiscover, behaviour) {

    depth = parseInt(depth, 10); // Force depth to be a number
    var crawler,
        linksDiscovered;

    describe("depth " + depth, function() {
        before(function() {
            // Create a new crawler to crawl our local test server
            crawler = new Crawler("127.0.0.1", "/depth/1", 3000);

            // Speed up tests. No point waiting for every request
            // when we're running our own server.
            crawler.interval = 1;
            crawler.fetchWhitelistedMimeTypesBelowMaxDepth = !!behaviour;

            // Define max depth for this crawl
            crawler.maxDepth = depth;
            crawler.maxDepth = depth;

            linksDiscovered = 0;

            crawler.on("fetchcomplete", function() {
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

        it("should discover " + linksToDiscover + " linked resources", function(done) {
            crawler.on("complete", function() {
                linksDiscovered.should.equal(linksToDiscover);
                done();
            });
        });
    });
};

describe("Crawler max depth with resource override (old default behaviour)", function() {

    // depth: linksToDiscover
    var linksToDiscover = {
        0: 11, // links for depth 0
        1: 6,  // links for depth 1
        2: 7,  // links for depth 2
        3: 11  // links for depth 3
    };

    for (var depth in linksToDiscover) {
        if (linksToDiscover.hasOwnProperty(depth)) {
            depthTest(depth, linksToDiscover[depth], true);
        }
    }

});

describe("Crawler max depth without fetching resources (new default behaviour)", function() {
    // depth: linksToDiscover
    var linksToDiscover = {
        0: 11, // links for depth 0
        1: 1,  // links for depth 1
        2: 3,  // links for depth 2
        3: 6   // links for depth 3
    };

    for (var depth in linksToDiscover) {
        if (linksToDiscover.hasOwnProperty(depth)) {
            depthTest(depth, linksToDiscover[depth], false);
        }
    }
});
