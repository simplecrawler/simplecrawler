// Runs a very simple crawl on an HTTP server
// This is more of an integration test than a unit test.

/* eslint-env mocha */

var chai = require("chai"),
    Crawler = require("../");

chai.should();

var makeCrawler = function (host, path, port) {
    var crawler = new Crawler(host, path, port);
    crawler.interval = 1;
    return crawler;
};

describe("Test Crawl", function() {

    // Create a new crawler to crawl this server
    var localCrawler = makeCrawler("127.0.0.1", "/", 3000),
        linksDiscovered = 0;

    it("should be able to be started", function(done) {

        localCrawler.on("crawlstart", function() {
            done();
        });
        localCrawler.on("discoverycomplete", function() {
            linksDiscovered++;
        });

        localCrawler.start();
        localCrawler.running.should.equal(true);
    });

    it("should emit an error when it gets a faulty cookie", function(done) {

        localCrawler.on("cookieerror", function(queueItem) {
            queueItem.url.should.equal("http://127.0.0.1:3000/stage2");
            done();
        });
    });

    it("should have a queue with at least the initial crawl path", function() {

        localCrawler.queue.length.should.be.greaterThan(0);
    });

    it("should discover all linked resources in the queue", function(done) {

        localCrawler.on("complete", function() {
            linksDiscovered.should.equal(5);
            done();
        });
    });

    it("should support async event listeners for manual discovery", function(done) {

        var crawler = makeCrawler("127.0.0.1", "/", 3000);

        // Use a different crawler this time
        crawler.discoverResources = false;
        crawler.queueURL("http://127.0.0.1:3000/async-stage1");
        crawler.start();

        crawler.on("fetchcomplete", function(queueItem, data) {
            var evtDone = this.wait();

            setTimeout(function() {
                linksDiscovered++;

                if (String(data).match(/complete/i)) {
                    return evtDone();
                }

                // Taking advantage of the fact that for these,
                // the sum total of the body data is a URL.
                crawler.queueURL(String(data)).should.equal(true);

                evtDone();
            }, 10);
        });

        crawler.on("complete", function() {
            linksDiscovered.should.equal(8);
            done();
        });
    });

    it("should not throw an error if header Referer is undefined", function(done) {

        var crawler = makeCrawler("127.0.0.1", "/depth/1", 3000);
        crawler.maxDepth = 1;

        crawler.start();

        crawler.on("complete", function() {
            done();
        });
    });

    it("it should remove script tags if parseScriptTags is disabled", function(done) {

        var crawler = makeCrawler("127.0.0.1", "/script", 3000);
        crawler.maxDepth = 1;
        crawler.parseScriptTags = false;

        crawler.start();

        crawler.on("complete", function() {
            crawler.queue.length.should.equal(2);
            done();
        });
    });

    it("it should emit an error when resource is too big", function(done) {

        var crawler = makeCrawler("127.0.0.1", "/big", 3000);
        var visitedUrl = false;

        crawler.start();

        crawler.on("fetchdataerror", function(queueItem) {
            visitedUrl = visitedUrl || queueItem.url === "http://127.0.0.1:3000/big";
        });

        crawler.on("complete", function() {
            done();
        });
    });

    it("should allow initial redirect to different domain if configured", function(done) {
        var crawler = makeCrawler("0.0.0.0", "/domain-redirect", 3000);

        crawler.allowInitialDomainChange = true;

        crawler.on("queueadd", function(queueItem) {
            queueItem.host.should.equal("127.0.0.1");
            crawler.stop();
            done();
        });

        crawler.start();
    });

    it("should only allow redirect to different domain for initial request", function(done) {
        var crawler = makeCrawler("0.0.0.0", "/to-domain-redirect", 3000),
            linksDiscovered = 0;

        crawler.on("discoverycomplete", function() {
            linksDiscovered++;
        });

        crawler.on("complete", function() {
            linksDiscovered.should.equal(1);
            done();
        });

        crawler.start();
    });

    it("should disallow initial redirect to different domain by default", function(done) {
        var crawler = makeCrawler("0.0.0.0", "/domain-redirect", 3000),
            linksDiscovered = 0;

        crawler.on("discoverycomplete", function() {
            linksDiscovered++;
        });

        crawler.on("complete", function() {
            linksDiscovered.should.equal(0);
            done();
        });

        crawler.start();
    });

    // TODO

    // Test how simple error conditions are handled

});
