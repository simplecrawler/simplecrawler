// Ensures that the crawler object is requireable,
// and doesn't die horribly right off the bat

/* eslint-env mocha */

var chai = require("chai");

chai.should();

describe("Crawler object", function() {

    var Crawler = null;
    beforeEach(function() {
        Crawler = require("../");
    });

    it("should be able to be required", function() {
        Crawler.should.be.a("function");
        Crawler.Crawler.should.be.a("function");
    });

    it("should import the queue", function() {
        Crawler.queue.should.be.a("function");
    });

    it("should import the cache system", function() {
        Crawler.cache.should.be.a("function");
    });

    it("should be able to be initialised", function() {
        var myCrawler = new Crawler("127.0.0.1", "/", 3000);
        myCrawler.should.be.an.instanceof(Crawler);
    });

});
