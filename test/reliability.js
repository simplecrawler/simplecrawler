/* eslint-env mocha */

var path = require("path"),
    os = require("os"),
    chai = require("chai");

var Crawler = require("../");

var routes = require("./lib/routes.js"),
    Server = require("./lib/testserver.js");

var should = chai.should();

var makeCrawler = function (url) {
    var crawler = new Crawler(url);
    crawler.interval = 5;
    return crawler;
};

// Runs a very simple crawl on an HTTP server
describe("Crawler reliability", function() {
    this.slow("600ms");

    before(function (done) {
        this.server = new Server(routes);
        this.server.listen(3000, done);
    });

    after(function (done) {
        this.server.destroy(done);
    });

    it("should be able to be started, then stopped, then started again", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000/"),
            startCount = 0;

        crawler.on("crawlstart", function() {
            if (++startCount === 2) {
                done();
            } else {
                crawler.stop();
                crawler.start();
            }
        });

        crawler.start();
    });

    it("should be able to handle a timeout", function(done) {
        var localCrawler = new Crawler("http://127.0.0.1:3000/timeout");
        localCrawler.timeout = 200;

        localCrawler.on("fetchtimeout", function(queueItem) {
            queueItem.should.be.an("object");
            queueItem.should.include({
                url: "http://127.0.0.1:3000/timeout",
                fetched: true,
                status: "timeout"
            });

            done();
        });

        localCrawler.start();
    });

    it("should not decrement _openRequests below zero in the event of a timeout", function(done) {
        var localCrawler = new Crawler("http://127.0.0.1:3000/timeout");
        localCrawler.timeout = 200;
        localCrawler.maxConcurrency = 1;

        localCrawler.queueURL("http://127.0.0.1:3000/timeout2");

        localCrawler.on("fetchtimeout", function() {
            localCrawler._openRequests.should.have.lengthOf(0);
        });

        localCrawler.on("complete", function() {
            done();
        });

        localCrawler.start();
    });

    it("should decrement _openRequests in the event of a non-supported mimetype", function(done) {
        var localCrawler = makeCrawler("http://127.0.0.1:3000/");
        localCrawler.downloadUnsupported = false;
        localCrawler.maxConcurrency = 1;
        localCrawler.discoverResources = false;

        localCrawler.queueURL("http://127.0.0.1:3000/img/1");
        localCrawler.queueURL("http://127.0.0.1:3000/img/2");

        localCrawler.on("complete", function() {
            localCrawler._openRequests.should.have.lengthOf(0);
            done();
        });

        localCrawler.start();
    });

    it("should add multiple items with the same URL to the queue if forced to", function(done) {
        var localCrawler = makeCrawler("http://127.0.0.1:3000/"),
            addCount = 0;

        localCrawler.on("queueadd", function() {
            addCount++;

            if (addCount >= 2) {
                localCrawler.queue.getLength(function(error, length) {
                    length.should.equal(2);
                    done(error);
                });
            }
        });

        localCrawler.queueURL("http://127.0.0.1:3000/stage2");
        // First, try to add the same URL without a force argument...
        localCrawler.queueURL("http://127.0.0.1:3000/stage2");
        // Then try to add it with a force argument
        localCrawler.queueURL("http://127.0.0.1:3000/stage2", undefined, true);
    });

    it("should emit a fetch404 when given a 404 status code", function(done) {
        var localCrawler = makeCrawler("http://127.0.0.1:3000/404");

        localCrawler.on("fetch404", function() {
            localCrawler.stop(true);
            done();
        });

        localCrawler.start();
    });


    it("should emit a fetch410 when given a 410 status code", function(done) {
        var localCrawler = makeCrawler("http://127.0.0.1:3000/410");

        localCrawler.on("fetch410", function() {
            done();
        });

        localCrawler.start();
    });

    it("should be able to freeze and defrost the queue", function(done) {
        var localCrawler = makeCrawler("http://127.0.0.1:3000/"),
            newCrawler = makeCrawler("http://127.0.0.1:3000/"),
            tmp = os.tmpdir() ? path.join(os.tmpdir(), "queue.json") : path.join(__dirname, "queue.json");

        localCrawler.start();

        // The oldestUnfetchedIndex argument may seem puzzling, but the reason
        // that it differs between localCrawler and newCrawler is that when we
        // freeze the queue, localCrawler hasn't had time to ask for a new
        // unfetched queue item, and it's only when those are asked for that the
        // queue._oldestUnfetchedIndex property is updated. When we defrost the
        // queue however, the property will be set correctly and "catch up"
        function testQueue(crawler, oldestUnfetchedIndex) {
            crawler.queue.length.should.equal(5);
            crawler.queue._oldestUnfetchedIndex.should.equal(oldestUnfetchedIndex);

            crawler.queue._scanIndex.should.have.all.keys(
                "http://127.0.0.1:3000/",
                "http://127.0.0.1:3000/sitemap.xml",
                "http://127.0.0.1:3000/stage2",
                "http://127.0.0.1:3000/stage/3",
                "http://127.0.0.1:3000/stage/4"
            );

            crawler.queue.filterItems(function() {
                return true;
            }, function(error, items) {
                if (error) {
                    return done(error);
                }

                items.map(function(item) {
                    return item.status;
                }).should.eql([
                    "downloaded",
                    "notfound",
                    "downloaded",
                    "queued",
                    "queued"
                ]);
            });
        }

        function testFreezeDefrost() {
            testQueue(localCrawler, 2);

            localCrawler.queue.freeze(tmp, function() {
                newCrawler.queue.defrost(tmp, function() {
                    testQueue(newCrawler, 3);

                    newCrawler.queue.oldestUnfetchedItem(function(err, queueItem) {
                        should.equal(err, null);
                        queueItem.url.should.equal("http://127.0.0.1:3000/stage/4");
                        done();
                    });
                });
            });
        }

        var i = 0;

        localCrawler.on("fetchcomplete", function() {
            if (i++ === 1) {
                this.stop();
                // Queue an additional URL so that we can test the
                // queue._oldestUnfetchedItem reviving properly
                localCrawler.queueURL("http://127.0.0.1:3000/stage/4");

                // Lets the queue be populated
                process.nextTick(testFreezeDefrost);
            }
        });

        localCrawler.start();
    });

    it("should only be able to start once per run", function(done) {
        var localCrawler = makeCrawler("http://127.0.0.1:3000/");

        setTimeout(function() {
            var crawlIntervalID = localCrawler.crawlIntervalID;
            localCrawler.start();

            setTimeout(function() {
                localCrawler.crawlIntervalID.should.equal(crawlIntervalID);
                localCrawler.stop();
                done();
            }, 10);
        }, 10);

        localCrawler.start();
    });

    describe("when stopping the crawler", function() {

        it("should not terminate open connections unless asked", function(done) {
            var localCrawler = makeCrawler("http://127.0.0.1:3000/");
            var fetchStartCallCount = 0;

            // Speed things up
            localCrawler.interval = 0;

            // Adding routes which will time out, so we don't ever end up
            // completing the crawl before we can instrument the requests
            localCrawler.queueURL("/timeout");
            localCrawler.queueURL("/timeout2");

            localCrawler.on("fetchstart", function() {

                // If we haven't been called previously
                if (!fetchStartCallCount) {
                    return fetchStartCallCount++;
                }

                localCrawler._openRequests.forEach(function(req) {
                    req.abort = function() {
                        throw new Error("Should not abort requests!");
                    };
                });

                localCrawler.stop();
                done();
            });

            localCrawler.start();
        });

        it("should terminate open connections when requested", function(done) {
            var localCrawler = makeCrawler("http://127.0.0.1:3000/");
            var fetchStartCallCount = 0,
                abortCallCount = 0;

            // Speed things up
            localCrawler.interval = 0;

            // Adding routes which will time out, so we don't ever end up
            // completing the crawl before we can instrument the requests
            localCrawler.queueURL("/timeout");
            localCrawler.queueURL("/timeout2");

            localCrawler.on("fetchstart", function() {

                // If we haven't been called previously
                if (!fetchStartCallCount) {
                    return fetchStartCallCount++;
                }

                localCrawler._openRequests.length.should.equal(2,
                    "The number of open requests should equal 2");

                localCrawler._openRequests.forEach(function(req) {
                    req.abort = function() {
                        abortCallCount++;
                    };
                });

                localCrawler.stop(true);
                abortCallCount.should.equal(2,
                    "The number of calls to req.abort() should equal 2");
                done();
            });

            localCrawler.start();
        });
    });
});
