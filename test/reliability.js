// Runs a very simple crawl on an HTTP server

/* eslint-env mocha */

var path = require("path");
var os = require("os");
var chai = require("chai");

var should = chai.should();

describe("Crawler reliability", function() {

    var Crawler = require("../");

    it("should be able to handle a timeout", function(done) {

        this.slow("1s");

        var localCrawler = Crawler.crawl("http://127.0.0.1:3000/timeout");
        localCrawler.timeout = 200;

        localCrawler.on("fetchtimeout", function(queueItem) {
            queueItem.should.be.an("object");
            queueItem.fetched.should.equal(true);
            queueItem.status.should.equal("timeout");
            queueItem.url.should.equal("http://127.0.0.1:3000/timeout");
            done();
        });
    });

    it("should not decrement _openRequests below zero in the event of a timeout", function(done) {

        this.slow("1s");
        this.timeout("1s");

        var localCrawler = Crawler.crawl("http://127.0.0.1:3000/timeout");
        var timesCalled = 0;
        localCrawler.timeout = 200;

        localCrawler.queueURL("http://127.0.0.1:3000/timeout");
        localCrawler.queueURL("http://127.0.0.1:3000/timeout2");

        localCrawler.on("fetchtimeout", function() {
            timesCalled++;
            localCrawler._openRequests.should.equal(0);

            if (timesCalled === 2) {
                done();
            }
        });
    });

    it("should decrement _openRequests in the event of a non-supported mimetype", function(done) {

        var localCrawler = new Crawler("127.0.0.1", "/", 3000);
        localCrawler.downloadUnsupported = false;

        localCrawler.queueURL("http://127.0.0.1:3000/img/1");
        localCrawler.queueURL("http://127.0.0.1:3000/img/2");

        localCrawler.on("complete", function() {
            localCrawler._openRequests.should.equal(0);
            done();
        });

        localCrawler.start();
    });

    it("should emit a fetch404 when given a 404 status code", function(done) {

        this.slow("1s");
        this.timeout("1s");

        var localCrawler = Crawler.crawl("http://127.0.0.1:3000/404");
        localCrawler.timeout = 200;

        localCrawler.on("fetch404", function() {
            done();
        });
    });


    it("should emit a fetch410 when given a 410 status code", function(done) {

        this.slow("1s");
        this.timeout("1s");

        var localCrawler = Crawler.crawl("http://127.0.0.1:3000/410");
        localCrawler.timeout = 200;

        localCrawler.on("fetch410", function() {
            done();
        });
    });

    it("should be able to freeze and defrost the queue", function(done) {

        var localCrawler = new Crawler("127.0.0.1", "/", 3000),
            newCrawler = new Crawler("127.0.0.1", "/", 3000),
            tmp = os.tmpdir() ? path.join(os.tmpdir(), "queue.json") : path.join(__dirname, "queue.json");

        localCrawler.start();

        var test = function() {
            this.stop();

            // Lets the queue be populated
            process.nextTick(function() {
                localCrawler.queue.length.should.equal(3);
                localCrawler.queue.oldestUnfetchedIndex.should.equal(1);
                localCrawler.queue.scanIndex["http://127.0.0.1:3000/"]
                    .should.equal(true);
                localCrawler.queue.scanIndex["http://127.0.0.1:3000/stage2"]
                    .should.equal(true);
                localCrawler.queue.scanIndex["http://127.0.0.1:3000/stage/3"]
                    .should.equal(true);

                localCrawler.queue[0].status.should.equal("downloaded");
                localCrawler.queue[1].status.should.equal("downloaded");
                localCrawler.queue[2].status.should.equal("queued");

                localCrawler.queue.freeze(tmp, defrost);
            });
        };

        var defrost = function() {
            newCrawler.queue.defrost(tmp, checkDefrost);
        };

        var checkDefrost = function() {
            newCrawler.queue.length.should.equal(3);
            newCrawler.queue.oldestUnfetchedIndex.should.equal(2);
            newCrawler.queue.scanIndex["http://127.0.0.1:3000/"]
                .should.equal(true);
            newCrawler.queue.scanIndex["http://127.0.0.1:3000/stage2"]
                .should.equal(true);
            newCrawler.queue.scanIndex["http://127.0.0.1:3000/stage/3"]
                .should.equal(true);

            newCrawler.queue[0].status.should.equal("downloaded");
            newCrawler.queue[1].status.should.equal("downloaded");
            newCrawler.queue[2].status.should.equal("queued");

            newCrawler.queue.oldestUnfetchedItem(function(err, queueItem) {
                should.equal(err, null);
                queueItem.url.should.equal("http://127.0.0.1:3000/stage/3");
                done();
            });
        };

        localCrawler.once("fetchcomplete",
            localCrawler.once.bind(localCrawler, "fetchcomplete", test));

    });

    it("should only be able to start once per run", function(done) {

        var localCrawler = Crawler.crawl("http://127.0.0.1:3000/");

        setTimeout(function() {
            var crawlIntervalID = localCrawler.crawlIntervalID;
            localCrawler.start();

            setTimeout(function() {
                localCrawler.crawlIntervalID.should.equal(crawlIntervalID);
                localCrawler.stop();
                done();
            }, 10);
        }, 10);
    });
});
