// Ensures that the crawler object is requireable, and doesn't die
// horribly right off the bat

var chai = require("chai");
	chai.should();

describe("Crawler object",function() {

	it("should be able to be required",function() {
		var Crawler = require("../");

		Crawler.should.be.a("function");
		Crawler.Crawler.should.be.a("function");
	});

	it("should import the queue",function() {
		var Crawler = require("../");

		Crawler.queue.should.be.a("function");
	});

	it("should import the cache system",function() {
		var Crawler = require("../");

		Crawler.cache.should.be.a("function");
	});

	it("should be able to be initialised",function() {
		var Crawler = require("../"),
			myCrawler = new Crawler("127.0.0.1","/",3000);

		myCrawler.should.be.an.instanceof(Crawler);
	});

})
