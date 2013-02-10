// Tests whether a given resource is considered 'valid' for crawling under
// a number of different conditions.

var chai = require("chai");
	chai.should();

describe("Resource validity checker",function() {
	
	
	
	
});

describe("Link parser",function() {
	
	var crawler = new (require("../"))("127.0.0.1",3000);
	
	it("should throw out junky or invalid URLs without dying",function() {
		
		var urlContext = {
			"url": "http://www.example.com"
		};
		
		crawler.processURL("",urlContext).should.equal(false);
		crawler.processURL("\n\n",urlContext).should.equal(false);
		crawler.processURL("ur34nfie4985:s////dsf/",urlContext).should.equal(false);
		
	});
	
});