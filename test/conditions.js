/* eslint-env mocha */

var chai = require("chai"),
    http = require("http"),
    Crawler = require("../");

chai.should();

var makeCrawler = function (url) {
    var crawler = new Crawler(url);
    crawler.interval = 5;
    return crawler;
};

describe("Fetch conditions", function() {
    this.slow("150ms");

    it("should be able to add a fetch condition", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            conditionID = crawler.addFetchCondition(function() {});

        crawler._fetchConditions.length.should.equal(1);
        conditionID.should.be.a("number");
    });

    it("should be able to remove a fetch condition by ID", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            conditionID = crawler.addFetchCondition(function() {});

        crawler._fetchConditions.length.should.equal(1);
        crawler.removeFetchCondition(conditionID);
        crawler._fetchConditions.length.should.equal(0);
    });

    it("should be able to remove a fetch condition by reference", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            condition = function() {};

        crawler.addFetchCondition(condition);
        crawler._fetchConditions.length.should.equal(1);
        crawler.removeFetchCondition(condition);
        crawler._fetchConditions.length.should.equal(0);
    });

    it("should provide fetch conditions with the right data", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            fetchConditionCalled = false;

        crawler.addFetchCondition(function(queueItem, referrerQueueItem) {
            if (fetchConditionCalled) {
                return false;
            }

            fetchConditionCalled = true;

            referrerQueueItem.should.be.an("object");
            referrerQueueItem.should.include({
                url: "http://127.0.0.1:3000/",
                status: "downloaded",
                fetched: true,
                depth: 1,
                protocol: "http",
                host: "127.0.0.1",
                port: "3000",
                path: "/"
            });

            referrerQueueItem.stateData.should.be.an("object");
            referrerQueueItem.stateData.should.have.property("requestLatency");
            referrerQueueItem.stateData.should.have.property("requestTime");
            referrerQueueItem.stateData.should.include({
                contentLength: 68,
                contentType: "text/html",
                code: 200
            });
            referrerQueueItem.stateData.should.have.property("headers").that.includes({
                "content-length": "68"
            });

            queueItem.should.be.an("object");
            queueItem.should.include({
                url: "http://127.0.0.1:3000/stage2",
                status: "created",
                fetched: false,
                depth: 2,
                protocol: "http",
                host: "127.0.0.1",
                port: "3000",
                path: "/stage2"
            });

            crawler.stop(true);
            done();
        });

        crawler.start();
    });

    it("should respect synchronous fetch conditions", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addFetchCondition(function() {
            return false;
        });

        crawler.on("complete", function() {
            crawler.queue.getLength(function(error, length) {
                length.should.equal(1);
                done();
            });
        });

        crawler.start();
    });

    it("should respect asynchronous fetch conditions", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
            callback(null, false);
        });

        crawler.on("complete", function() {
            crawler.queue.getLength(function(error, length) {
                length.should.equal(1);
                done();
            });
        });

        crawler.start();
    });

    it("should emit fetchprevented events", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
            callback(null, false);
        });

        crawler.on("fetchprevented", function(queueItem) {
            queueItem.url.should.equal("http://127.0.0.1:3000/stage2");
            crawler.stop(true);
            done();
        });

        crawler.start();
    });

    it("should emit fetchconditionerror events", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
            callback("error");
        });

        crawler.on("fetchconditionerror", function(queueItem, error) {
            queueItem.url.should.equal("http://127.0.0.1:3000/stage2");
            error.should.equal("error");

            crawler.stop(true);
            done();
        });

        crawler.start();
    });
});

describe("Download conditions", function() {
    it("should be able to add a download condition", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            conditionID = crawler.addDownloadCondition(function() {});

        crawler._downloadConditions.length.should.equal(1);
        conditionID.should.be.a("number");
    });

    it("should be able to remove a download condition by ID", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            conditionID = crawler.addDownloadCondition(function() {});

        crawler._downloadConditions.length.should.equal(1);
        crawler.removeDownloadCondition(conditionID);
        crawler._downloadConditions.length.should.equal(0);
    });

    it("should be able to remove a download condition by reference", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            condition = function() {};

        crawler.addDownloadCondition(condition);
        crawler._downloadConditions.length.should.equal(1);
        crawler.removeDownloadCondition(condition);
        crawler._downloadConditions.length.should.equal(0);
    });

    it("should provide download conditions with the right data", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            downloadConditionCalled = false;

        crawler.addDownloadCondition(function(queueItem, response) {
            if (downloadConditionCalled) {
                return false;
            }

            downloadConditionCalled = true;

            queueItem.should.be.an("object");
            queueItem.should.include({
                url: "http://127.0.0.1:3000/",
                status: "spooled",
                fetched: false,
                depth: 1,
                protocol: "http",
                host: "127.0.0.1",
                port: "3000",
                path: "/"
            });

            response.should.be.an("object");
            response.should.be.an.instanceof(http.IncomingMessage);

            crawler.stop(true);
            done();
        });

        crawler.start();
    });

    it("should not download a resource when prevented by a download condition", function(done) {
        this.slow("1s");

        var crawler = makeCrawler("http://127.0.0.1:3000");
        crawler.maxDepth = 1;

        crawler.addDownloadCondition(function() {
            return false;
        });

        crawler.on("complete", function() {
            crawler.queue.getLength(function(error, length) {
                length.should.equal(1);

                crawler.queue.get(0, function(error, queueItem) {
                    queueItem.status.should.equal("downloadprevented");
                    done();
                });
            });
        });

        crawler.start();
    });

    it("should only apply download conditions when it would normally download the resource", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000/404");

        crawler.addDownloadCondition(function() {
            done(new Error("Shouldn't have evaluated the download condition"));
        });

        crawler.on("fetch404", function(queueItem, response) {
            queueItem.should.be.an("object");
            queueItem.status.should.equal("notfound");

            response.should.be.an("object");
            response.should.be.an.instanceof(http.IncomingMessage);

            crawler.stop(true);
            done();
        });

        crawler.start();
    });

    it("should emit a downloadprevented event when a download condition returns false", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addDownloadCondition(function() {
            return false;
        });

        crawler.on("downloadprevented", function(queueItem, response) {
            queueItem.should.be.an("object");
            queueItem.status.should.equal("downloadprevented");

            response.should.be.an("object");
            response.should.be.an.instanceof(http.IncomingMessage);

            crawler.stop();
            done();
        });

        crawler.start();
    });
});
