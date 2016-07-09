/* eslint-env mocha */
/* eslint new-cap: [0] */

var chai = require("chai");

chai.should();

// Ensures that the crawler object is requireable, and doesn't die horribly
// right off the bat
describe("Crawler object", function() {

    var Crawler = require("../");

    it("should be able to be required", function() {
        Crawler.should.be.a("function");
    });

    it("should import the queue", function() {
        Crawler.queue.should.be.a("function");
    });

    it("should import the cache system", function() {
        Crawler.cache.should.be.a("function");
    });

    it("should be able to be initialised", function() {
        var crawler = new Crawler("http://127.0.0.1:3000/");
        crawler.should.be.an.instanceof(Crawler);
    });

    it("should be able to be initialised without the `new` operator", function() {
        function listener () {}

        var crawler = Crawler("http://127.0.0.1:3000/").on("fetchcomplete", listener),
            listeners = crawler.listeners("fetchcomplete");

        crawler.should.be.an.instanceof(Crawler);
        listeners[0].should.equal(listener);
    });

});
