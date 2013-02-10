// Tests whether a given resource is considered 'valid' for crawling under
// a number of different conditions.

var chai = require("chai");
	chai.should();

describe("Resource validity checker",function() {
	
	it("should be able to determine whether a domain is a subdomain of another",
		function() {
		
		var crawler = new (require("../"))("example.com",3000);
		
		// Enable scanning subdomains, important for this test
		crawler.scanSubdomains = true;
		
		// The domain itself isn't a subdomain per-se, but should be allowed
		crawler.domainValid("example.com").should.equal(true);
		
		// WWW is a subdomain
		crawler.domainValid("www.example.com").should.equal(true);
		
		// More complex examples
		crawler.domainValid("testing.example.com").should.equal(true);
		
		// Multiple levels
		crawler.domainValid("system.cache.example.com").should.equal(true);
		
		// These aren't valid...
		crawler.domainValid("com.example").should.equal(false);
		crawler.domainValid("example.com.au").should.equal(false);
		crawler.domainValid("example.us").should.equal(false);
		
	});
	
	
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