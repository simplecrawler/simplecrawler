// Runs a very simple crawl on an HTTP server
// This is more of an integration test than a unit test.

/* eslint-env mocha */

var chai = require("chai"),
    uri = require("urijs");

var Server = require("./lib/testserver.js"),
    Crawler = require("../");

chai.should();

var makeCrawler = function (host, path, port) {
    var crawler = new Crawler(host, path, port);
    crawler.interval = 5;
    return crawler;
};

describe("Test Crawl", function() {

    it("should be able to be started", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000);

        crawler.on("crawlstart", function() {
            crawler.running.should.equal(true);
            done();
        });

        crawler.start();
    });

    it("should emit an error when it gets a faulty cookie", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000);

        crawler.on("cookieerror", function(queueItem) {
            queueItem.url.should.equal("http://127.0.0.1:3000/stage2");
            done();
        });

        crawler.start();
    });

    it("should parse, store and send cookies properly", function(done) {
        var crawler = makeCrawler("localhost", "/cookie", 3000),
            i = 0;

        crawler.on("fetchstart", function(queueItem, requestOptions) {
            if (i++) {
                requestOptions.headers.cookie.should.be.an("array");
                requestOptions.headers.cookie.should.have.lengthOf(1);
                requestOptions.headers.cookie[0].should.match(/^thing=stuff/);
                done();
            }
        });

        crawler.start();
    });

    it("should have added the initial item to the queue", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000);
        crawler.start();

        crawler.queue.getLength(function(error, length) {
            length.should.be.greaterThan(0);
            done();
        });
    });

    it("should discover all available linked resources", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000),
            linksDiscovered = 0;

        crawler.on("discoverycomplete", function() {
            linksDiscovered++;
        });

        crawler.on("complete", function() {
            linksDiscovered.should.equal(5);
            done();
        });

        crawler.start();
    });

    it("should obey rules in robots.txt", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000);
        crawler.start();

        crawler.on("fetchdisallowed", function(parsedURL) {
            parsedURL.path.should.equal("/forbidden");
            done();
        });
    });

    it("should be able to disregard rules in robots.txt", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000);
        crawler.respectRobotsTxt = false;
        crawler.start();

        crawler.on("fetchcomplete", function(queueItem) {
            if (queueItem.url === "http://127.0.0.1:3000/forbidden") {
                crawler.stop();
                done();
            }
        });
        crawler.on("complete", function() {
            done(new Error("Didn't visit forbidden URL (even though it should have)"));
        });
    });

    it("should obey robots.txt on different hosts", function(done) {
        var server = new Server({
            "/robots.txt": function(write) {
                write(200, "User-agent: *\nDisallow: /disallowed\n");
            },

            "/disallowed": function(write) {
                write(200, "This is forbidden crawler fruit");
            }
        });
        server.listen(3001);

        var crawler = makeCrawler("127.0.0.1", "/to/other/port", 3000);
        crawler.start();

        crawler.on("fetchdisallowed", function(parsedURL) {
            uri({
                protocol: parsedURL.protocol,
                hostname: parsedURL.host,
                port: parsedURL.port,
                path: parsedURL.path
            }).href().should.equal("http://127.0.0.1:3001/disallowed");

            server.close();
            done();
        });
    });

    it("should emit an error when robots.txt redirects to a disallowed domain", function(done) {
        var server = new Server({
            "/robots.txt": function(write, redir) {
                redir("http://example.com/robots.txt");
            }
        });
        server.listen(3002);

        var crawler = makeCrawler("127.0.0.1", "/", 3002);
        crawler.start();

        crawler.on("robotstxterror", function(error) {
            error.message.should.contain("redirected to a disallowed domain");
            server.close();
            done();
        });
    });

    it("should support async event listeners for manual discovery", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/", 3000),
            linksDiscovered = 0;

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
            linksDiscovered.should.equal(3);
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
            crawler.queue.getLength(function (error, length) {
                length.should.equal(2);
                done();
            });
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
        var crawler = makeCrawler("127.0.0.1", "/domain-redirect", 3000);

        crawler.allowInitialDomainChange = true;

        crawler.on("queueadd", function(queueItem) {
            queueItem.host.should.equal("localhost");
            crawler.stop();
            done();
        });

        crawler.start();
    });

    it("should only allow redirect to different domain for initial request", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/to-domain-redirect", 3000),
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
        var crawler = makeCrawler("127.0.0.1", "/domain-redirect", 3000),
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

    it("should not increase depth on multiple redirects on the initial request", function(done) {
        var crawler = makeCrawler("localhost", "/domain-redirect2", 3000),
            depth = 1;

        crawler.on("fetchredirect", function(queueItem) {
            if (queueItem.depth > 1) {
                depth = queueItem.depth;
            }
        });

        crawler.on("complete", function() {
            depth.should.equal(1);
            done();
        });

        crawler.start();
    });

    it("should disallow initial redirect to different domain after a 2xx", function(done) {
        var crawler = makeCrawler("127.0.0.1", "/to-domain-redirect", 3000),
            discoComplete = 0;

        crawler.allowInitialDomainChange = true;

        crawler.on("discoverycomplete", function() {
            discoComplete++;
        });

        crawler.on("complete", function() {
            discoComplete.should.equal(1);
            done();
        });

        crawler.start();
    });

    // TODO

    // Test how simple error conditions are handled

});
