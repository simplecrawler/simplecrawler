/* eslint-env mocha */

var chai = require("chai"),
    http = require("http"),
    Crawler = require("../");

var routes = require("./lib/routes.js"),
    Server = require("./lib/testserver.js");

var should = chai.should();

var makeCrawler = function (url) {
    var crawler = new Crawler(url);
    crawler.interval = 5;
    return crawler;
};

describe("Fetch conditions", function() {
    this.slow("150ms");

    before(function (done) {
        this.server = new Server(routes);
        this.server.listen(3000, done);
    });

    after(function (done) {
        this.server.close(done);
    });

    it("should be able to add a fetch condition", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            condition = function() {},
            conditionID = crawler.addFetchCondition(condition);

        crawler._fetchConditions[conditionID].should.equal(condition);
        conditionID.should.be.a("number");
    });

    describe("Removing fetch conditions", function() {

        it("should be able to remove a fetch condition by ID", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addFetchCondition(condition);

            crawler._fetchConditions[conditionID].should.equal(condition);
            crawler.removeFetchCondition(conditionID);
            should.not.equal(crawler._fetchConditions[conditionID], condition);
        });

        it("should be able to remove a fetch condition by reference", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addFetchCondition(condition);

            crawler._fetchConditions[conditionID].should.equal(condition);
            crawler.removeFetchCondition(condition);
            should.not.equal(crawler._fetchConditions[conditionID], condition);
        });

        it("should be able to remove a fetch condition by ID (multiple)", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition1 = function() {},
                condition2 = function() {},
                condition3 = function() {},
                conditionID1 = crawler.addFetchCondition(condition1),
                conditionID2 = crawler.addFetchCondition(condition2),
                conditionID3 = crawler.addFetchCondition(condition3);

            crawler._fetchConditions[conditionID1].should.equal(condition1);
            crawler._fetchConditions[conditionID2].should.equal(condition2);
            crawler._fetchConditions[conditionID3].should.equal(condition3);
            crawler.removeFetchCondition(conditionID2);
            crawler._fetchConditions[conditionID1].should.equal(condition1);
            should.not.equal(crawler._fetchConditions[conditionID2], condition2);
            crawler._fetchConditions[conditionID3].should.equal(condition3);
        });

        it("should be able to remove a fetch condition by reference (multiple)", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition1 = function() {},
                condition2 = function() {},
                condition3 = function() {},
                conditionID1 = crawler.addFetchCondition(condition1),
                conditionID2 = crawler.addFetchCondition(condition2),
                conditionID3 = crawler.addFetchCondition(condition3);

            crawler._fetchConditions[conditionID1].should.equal(condition1);
            crawler._fetchConditions[conditionID2].should.equal(condition2);
            crawler._fetchConditions[conditionID3].should.equal(condition3);
            crawler.removeFetchCondition(condition2);
            crawler._fetchConditions[conditionID1].should.equal(condition1);
            should.not.equal(crawler._fetchConditions[conditionID2], condition2);
            crawler._fetchConditions[conditionID3].should.equal(condition3);
        });

        it("should throw when it can't remove a fetch condition by ID", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addFetchCondition(condition);

            crawler._fetchConditions[conditionID].should.equal(condition);
            (function () {
                crawler.removeFetchCondition(-1);
            }).should.throw();
            (function () {
                crawler.removeFetchCondition(conditionID + 1);
            }).should.throw();
            crawler._fetchConditions[conditionID].should.equal(condition);
        });

        it("should throw when it can't remove a fetch condition by reference", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addFetchCondition(condition);

            crawler._fetchConditions[conditionID].should.equal(condition);
            (function () {
                crawler.removeFetchCondition(function() {});
            }).should.throw();
            crawler._fetchConditions[conditionID].should.equal(condition);
        });

        it("should throw when removing a fetch condition twice by ID", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addFetchCondition(condition);

            crawler._fetchConditions[conditionID].should.equal(condition);
            crawler.removeFetchCondition(conditionID);
            should.not.equal(crawler._fetchConditions[conditionID], condition);
            (function () {
                crawler.removeFetchCondition(conditionID);
            }).should.throw();
        });

        it("should throw when removing a fetch condition twice by reference", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addFetchCondition(condition);

            crawler._fetchConditions[conditionID].should.equal(condition);
            crawler.removeFetchCondition(condition);
            should.not.equal(crawler._fetchConditions[conditionID], condition);
            (function () {
                crawler.removeFetchCondition(condition);
            }).should.throw();
        });

    });

    it("should provide fetch conditions with the right data", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            fetchConditionCallCount = 0;

        crawler.addFetchCondition(function(queueItem, referrerQueueItem) {
            if (fetchConditionCallCount++ > 0) {
                referrerQueueItem.should.be.an("object");
                referrerQueueItem.should.include({
                    url: "http://127.0.0.1:3000/",
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
            }
        });

        crawler.on("fetchconditionerror", function(queueItem, error) {
            done(error);
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
        var fetchPrevented = false;

        crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
            callback(null, false);
        });

        crawler.on("fetchprevented", function(queueItem) {
            queueItem.url.should.contain("http://127.0.0.1:3000/");
            fetchPrevented = true;
        });

        crawler.on("complete", function() {
            fetchPrevented.should.equal(true);
            done();
        });

        crawler.start();
    });

    it("should emit fetchconditionerror events", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");
        var caughtFetchError = false;

        crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
            callback("error");
        });

        crawler.on("fetchconditionerror", function(queueItem, error) {
            queueItem.url.should.contain("http://127.0.0.1:3000/");
            error.should.equal("error");
            caughtFetchError = true;
        });

        crawler.on("complete", function() {
            caughtFetchError.should.equal(true);
            done();
        });

        crawler.start();
    });
});

describe("Download conditions", function() {
    before(function (done) {
        this.server = new Server(routes);
        this.server.listen(3000, done);
    });

    after(function (done) {
        this.server.close(done);
    });

    it("should be able to add a download condition", function() {
        var crawler = makeCrawler("http://127.0.0.1:3000"),
            condition = function() {},
            conditionID = crawler.addDownloadCondition(condition);

        crawler._downloadConditions[conditionID].should.equal(condition);
        conditionID.should.be.a("number");
    });

    describe("Removing download conditions", function() {

        it("should be able to remove a download condition by ID", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addDownloadCondition(condition);

            crawler._downloadConditions[conditionID].should.equal(condition);
            crawler.removeDownloadCondition(conditionID);
            should.not.equal(crawler._downloadConditions[conditionID], condition);
        });

        it("should be able to remove a download condition by reference", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addDownloadCondition(condition);

            crawler._downloadConditions[conditionID].should.equal(condition);
            crawler.removeDownloadCondition(condition);
            should.not.equal(crawler._downloadConditions[conditionID], condition);
        });

        it("should be able to remove a download condition by ID (multiple)", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition1 = function() {},
                condition2 = function() {},
                condition3 = function() {},
                conditionID1 = crawler.addDownloadCondition(condition1),
                conditionID2 = crawler.addDownloadCondition(condition2),
                conditionID3 = crawler.addDownloadCondition(condition3);

            crawler._downloadConditions[conditionID1].should.equal(condition1);
            crawler._downloadConditions[conditionID2].should.equal(condition2);
            crawler._downloadConditions[conditionID3].should.equal(condition3);
            crawler.removeDownloadCondition(conditionID2);
            crawler._downloadConditions[conditionID1].should.equal(condition1);
            should.not.equal(crawler._downloadConditions[conditionID2], condition2);
            crawler._downloadConditions[conditionID3].should.equal(condition3);
        });

        it("should be able to remove a download condition by reference (multiple)", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition1 = function() {},
                condition2 = function() {},
                condition3 = function() {},
                conditionID1 = crawler.addDownloadCondition(condition1),
                conditionID2 = crawler.addDownloadCondition(condition2),
                conditionID3 = crawler.addDownloadCondition(condition3);

            crawler._downloadConditions[conditionID1].should.equal(condition1);
            crawler._downloadConditions[conditionID2].should.equal(condition2);
            crawler._downloadConditions[conditionID3].should.equal(condition3);
            crawler.removeDownloadCondition(condition2);
            crawler._downloadConditions[conditionID1].should.equal(condition1);
            should.not.equal(crawler._downloadConditions[conditionID2], condition2);
            crawler._downloadConditions[conditionID3].should.equal(condition3);
        });

        it("should throw when it can't remove a download condition by ID", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addDownloadCondition(condition);

            crawler._downloadConditions[conditionID].should.equal(condition);
            (function () {
                crawler.removeDownloadCondition(-1);
            }).should.throw();
            (function () {
                crawler.removeDownloadCondition(conditionID + 1);
            }).should.throw();
            crawler._downloadConditions[conditionID].should.equal(condition);
        });

        it("should throw when it can't remove a download condition by reference", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addDownloadCondition(condition);

            crawler._downloadConditions[conditionID].should.equal(condition);
            (function () {
                crawler.removeDownloadCondition(function() {});
            }).should.throw();
            crawler._downloadConditions[conditionID].should.equal(condition);
        });

        it("should throw when removing a download condition twice by ID", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addDownloadCondition(condition);

            crawler._downloadConditions[conditionID].should.equal(condition);
            crawler.removeDownloadCondition(conditionID);
            should.not.equal(crawler._downloadConditions[conditionID], condition);
            (function () {
                crawler.removeDownloadCondition(conditionID);
            }).should.throw();
        });

        it("should throw when removing a download condition twice by reference", function() {
            var crawler = makeCrawler("http://127.0.0.1:3000"),
                condition = function() {},
                conditionID = crawler.addDownloadCondition(condition);

            crawler._downloadConditions[conditionID].should.equal(condition);
            crawler.removeDownloadCondition(condition);
            should.not.equal(crawler._downloadConditions[conditionID], condition);
            (function () {
                crawler.removeDownloadCondition(condition);
            }).should.throw();
        });

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

    function downloadConditionCompleteListener(crawler, done) {
        return function() {
            crawler.queue.getLength(function(error, length) {
                length.should.equal(2);

                crawler.queue.get(0, function(error, queueItem) {
                    queueItem.status.should.equal("downloadprevented");
                    done();
                });
            });
        };
    }

    it("should not download a resource when prevented by a synchronous download condition", function(done) {
        this.slow("1s");

        var crawler = makeCrawler("http://127.0.0.1:3000");
        crawler.maxDepth = 1;

        crawler.addDownloadCondition(function() {
            return false;
        });

        crawler.on("complete", downloadConditionCompleteListener(crawler, done));
        crawler.start();
    });

    it("should not download a resource when prevented by an asynchronous download condition", function(done) {
        this.slow("1s");

        var crawler = makeCrawler("http://127.0.0.1:3000");
        crawler.maxDepth = 1;

        crawler.addDownloadCondition(function(queueItem, response, callback) {
            setTimeout(function() {
                callback(null, false);
            }, 10);
        });

        crawler.on("complete", downloadConditionCompleteListener(crawler, done));
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

        crawler.addDownloadCondition(function(queueItem, response, callback) {
            callback(null, false);
        });

        crawler.on("downloadprevented", function(queueItem, response) {
            queueItem.should.be.an("object");
            queueItem.status.should.equal("downloadprevented");

            response.should.be.an("object");
            response.should.be.an.instanceof(http.IncomingMessage);

            crawler.stop(true);
            done();
        });

        crawler.start();
    });

    function downloadConditionErrorListener(crawler, done) {
        return function(queueItem, error) {
            queueItem.should.be.an("object");
            error.should.be.an.instanceof(Error);

            crawler.stop(true);
            done();
        };
    }

    it("should emit a downloadconditionerror event when a download condition throws an error", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addDownloadCondition(function() {
            throw new Error();
        });

        crawler.on("downloadconditionerror", downloadConditionErrorListener(crawler, done));
        crawler.start();
    });

    it("should emit a downloadconditionerror event when a download condition returns an error", function(done) {
        var crawler = makeCrawler("http://127.0.0.1:3000");

        crawler.addDownloadCondition(function(queueItem, response, callback) {
            callback(new Error());
        });

        crawler.on("downloadconditionerror", downloadConditionErrorListener(crawler, done));
        crawler.start();
    });
});
