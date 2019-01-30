/* eslint-env mocha */

var chai = require("chai"),
    Crawler = require("../"),
    queue = require("./fixtures/queue.json");

var routes = require("./lib/routes.js"),
    Server = require("./lib/testserver.js");

var should = chai.should();

function find(array, callback) {
    for (var i = 0; i < array.length; i++) {
        if (callback(array[i], i, array)) {
            return array[i];
        }
    }
}

function deepAssign(object, source) {
    for (var key in source) {
        if (source.hasOwnProperty(key)) {
            if (typeof object[key] === "object" && typeof source[key] === "object") {
                deepAssign(object[key], source[key]);
            } else {
                object[key] = source[key];
            }
        }
    }

    return object;
}

describe("Queue methods", function() {
    var crawler = new Crawler("http://127.0.0.1:3000/");

    var addToQueue = function(done) {
        Object.keys(queue).forEach(function(key) {
            if (!isNaN(parseInt(key, 10))) {
                crawler.queueURL(queue[key].url);
            }
        });

        crawler.queue.getLength(function(error, length) {
            length.should.equal(4);

            // After queueing the fixed queue items, we want to update them to
            // use all of the data stored in queue.json without relying on the
            // freeze/defrost functionality, so instead we asynchronously
            // mutate each queue item
            function updateItem(index) {
                if (index < length) {
                    crawler.queue.get(index, function(error, item) {
                        for (var key in queue[index]) {
                            if (queue[index].hasOwnProperty(key)) {
                                item[key] = queue[index][key];
                            }
                        }

                        updateItem(index + 1);
                    });
                } else {
                    done();
                }
            }

            updateItem(0);
        });
    };

    before(function (done) {
        this.server = new Server(routes);
        this.server.listen(3000, done);
    });

    after(function (done) {
        this.server.close(done);
    });

    it("should add to the queue", addToQueue);

    it("shouldn't add duplicates to the queue", addToQueue);

    it("should get items from the queue", function(done) {
        crawler.queue.get(2, function(error, item) {
            item.url.should.equal("http://127.0.0.1:3000/stage2");
            done(error);
        });
    });

    it("should error when getting queue items out of range", function(done) {
        crawler.queue.getLength(function(error, length) {
            crawler.queue.get(length * 2, function(error, queueItem) {
                should.not.exist(queueItem);
                error.should.be.an("error");
                done();
            });
        });
    });

    it("should get the oldest unfetched item", function(done) {
        crawler.queue.oldestUnfetchedItem(function(error, item) {
            item.url.should.equal("http://127.0.0.1:3000/stage/3");
            done(error);
        });
    });

    it("should get a max statistic from the queue", function(done) {
        crawler.queue.max("downloadTime", function(error, max) {
            max.should.be.a("number");
            max.should.equal(2);
            done(error);
        });
    });

    it("should get a min statistic from the queue", function(done) {
        crawler.queue.min("requestTime", function(error, min) {
            min.should.be.a("number");
            min.should.equal(2);
            done(error);
        });
    });

    it("should get an average statistic from the queue", function(done) {
        crawler.queue.avg("contentLength", function(error, avg) {
            avg.should.be.a("number");
            avg.should.equal((68 + 14 + 37) / 3);
            done(error);
        });
    });

    it("should get the number of completed queue items", function(done) {
        crawler.queue.countItems({ fetched: true }, function (error, complete) {
            complete.should.be.a("number");
            complete.should.equal(3);
            done(error);
        });
    });

    it("should get queue items with a specific status", function(done) {
        crawler.queue.filterItems({ status: "downloaded" }, function(error, items) {
            items.should.be.an("array");
            items.map(function(item) {
                return item.url;
            }).should.eql(["http://127.0.0.1:3000/", "http://127.0.0.1:3000/stage2"]);
            done(error);
        });
    });

    it("should count items with a specific status", function(done) {
        crawler.queue.countItems({ status: "queued" }, function(error, count) {
            count.should.be.a("number");
            count.should.equal(1);
            done(error);
        });
    });

    it("should count items with a 200 HTTP status", function(done) {
        crawler.queue.countItems({
            stateData: { code: 200 }
        }, function(error, count) {
            count.should.be.a("number");
            count.should.equal(2);
            done(error);
        });
    });

    it("should get items that have failed", function(done) {
        crawler.queue.countItems({ status: "failed" }, function(error, count) {
            count.should.be.a("number");
            count.should.equal(0);

            crawler.queue.countItems({ status: "notfound" }, function(error, count) {
                count.should.be.a("number");
                count.should.equal(1);
                done(error);
            });
        });
    });

    it("should error when passing unknown properties to queue methods", function(done) {
        crawler.queue.max("humdidum", function(error, max) {
            should.not.exist(max);
            error.should.be.an("error");
            done();
        });
    });

    it("should add existing queueItems if forced to", function(done) {
        var queueItems = [],
            finished = 0;

        for (var i = 0; i < 3; i++) {
            queueItems.push(crawler.processURL("http://127.0.0.1/example"));
        }

        function checkDone() {
            if (++finished === queueItems.length + 1) {
                done();
            }
        }

        crawler.queue.add(queueItems[0], false, function (error, newQueueItem) {
            newQueueItem.should.equal(queueItems[0]);
            checkDone();
        });
        crawler.queue.add(queueItems[1], false, function (error, newQueueItem) {
            error.should.be.an("error");
            should.not.exist(newQueueItem);
            checkDone();
        });
        crawler.queue.add(queueItems[2], true, function (error, newQueueItem) {
            should.not.exist(error);
            newQueueItem.should.equal(queueItems[2]);
            checkDone();
        });
        crawler.queue.add(queueItems[2], true, function (error, newQueueItem) {
            error.should.be.an("error");
            error.message.should.match(/twice/i);
            should.not.exist(newQueueItem);
            checkDone();
        });
    });

    it("should update items in the queue", function(done) {
        crawler.queue.update(2, {
            status: "queued",
            fetched: false
        }, function(error, queueItem) {
            queueItem.should.include({
                url: "http://127.0.0.1:3000/stage2",
                status: "queued",
                fetched: false
            });

            done(error);
        });
    });

    /**
     * This test works by monkey patching the queue `add` and `update` methods
     * and keeping a local copy of the queue, which contains cloned queueItems.
     * Each time the `update` method is called, we deeply compare the copy in
     * the queue with our local one. Same thing when the crawler completes.
     */
    it("should only update queue items asynchronously", function(done) {
        var crawler = new Crawler("http://127.0.0.1:3000"),
            originalQueueAdd = crawler.queue.add,
            originalQueueUpdate = crawler.queue.update;

        var queueItems = [];

        crawler.interval = 5;
        crawler.maxDepth = 2;

        function findById(array, id) {
            return find(array, function(queueItem) {
                return queueItem.id === id;
            });
        }

        crawler.queue.add = function (queueItem) {
            var args = arguments;

            process.nextTick(function() {
                var storedQueueItem = deepAssign({}, queueItem);
                storedQueueItem.id = crawler.queue.length;
                storedQueueItem.status = "queued";
                queueItems.push(storedQueueItem);

                originalQueueAdd.apply(crawler.queue, args);
            });
        };

        crawler.queue.update = function(id, updates) {
            var args = arguments;

            process.nextTick(function() {
                var storedQueueItem = findById(queueItems, id),
                    queueQueueItem = findById(crawler.queue, id);

                queueQueueItem.should.eql(storedQueueItem);
                deepAssign(storedQueueItem, updates);

                originalQueueUpdate.apply(crawler.queue, args);
            });
        };

        crawler.on("complete", function() {
            crawler.queue.getLength(function(error, length) {
                // Recursively step through items in the real queue and compare
                // them to our local clones
                function getItem(index) {
                    crawler.queue.get(index, function(error, queueQueueItem) {
                        var storedQueueItem = findById(queueItems, queueQueueItem.id),
                            nextIndex = index + 1;

                        queueQueueItem.should.eql(storedQueueItem);

                        if (nextIndex < length) {
                            getItem(nextIndex);
                        } else {
                            done();
                        }
                    });
                }

                getItem(0);
            });
        });

        crawler.start();
    });

    it("emits a queueerror event when update method errors", function(done) {
        var crawler = new Crawler("http://127.0.0.1:3000"),
            originalQueueUpdate = crawler.queue.update;

        crawler.interval = 5;

        crawler.queue.update = function(url, updates, callback) {
            originalQueueUpdate.call(crawler.queue, url, updates, function(error, queueItem) {
                if (!error) {
                    error = new Error("Not updating this queueItem");
                }

                callback(error, queueItem);
            });
        };

        crawler.on("queueerror", function(error, queueItem) {
            error.should.be.an.instanceof(Error);
            error.message.should.equal("Not updating this queueItem");
            queueItem.should.be.an("object");
            queueItem.should.have.a.property("url");
            queueItem.should.have.a.property("fetched");
            queueItem.should.have.a.property("status");
            crawler.stop(true);
            done();
        });

        crawler.start();
    });

    it("Doesn't queue URL with reordered query parameters", function(done) {
        var crawler = new Crawler("http://127.0.0.1:3000");
        crawler.sortQueryParameters = true;
        crawler.queueURL("http://127.0.0.1:3000/sample.jsp?a=1&b=2");
        crawler.queueURL("http://127.0.0.1:3000/sample.jsp?b=2&a=1");
        crawler.queue.getLength(function(error, length) {
            length.should.equal(1);
            done();
        });
    });
});
