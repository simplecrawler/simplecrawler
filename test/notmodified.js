/* eslint-env mocha */

var path = require("path"),
    fs = require("fs"),
    chai = require("chai");

var Crawler = require("../");
var Cache = Crawler.cache;

var routes = require("./lib/routes.js"),
    Server = require("./lib/testserver.js");

chai.should();

var makeCrawler = function (url) {
    var crawler = new Crawler(url);
    var cachedir = path.join(__dirname, "cache");
    if (!fs.existsSync(cachedir)) {
        fs.mkdirSync(cachedir);
    }
    crawler.cache = new Cache(cachedir);
    return crawler;
};

function notmodifiedTest(url, done) {
    var crawler1 = makeCrawler(url);
    crawler1.on("complete", function() {
        crawler1.cache.saveCache();

        var crawler2 = makeCrawler(url);
        var notmodified = false;
        crawler2.on("notmodified", function() {
            notmodified = true;
        });
        crawler2.on("complete", function() {
            notmodified.should.equal(true);
            done();
        });
        crawler2.start();
    });
    crawler1.start();
}

describe("Cache and notmodified event", function() {
    before(function (done) {
        this.server = new Server(routes);
        this.server.listen(3000, done);
    });

    after(function (done) {
        this.server.destroy(done);
    });

    it("should emit a notmodified when given a 304 status code by ETag", function(done) {
        notmodifiedTest("http://127.0.0.1:3000/etag", done);
    });

    it("should emit a notmodified when given a 304 status code by Last-Modified", function(done) {
        notmodifiedTest("http://127.0.0.1:3000/last-modified", done);
    });
});
