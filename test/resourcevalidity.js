// Tests whether a given resource is considered 'valid' for crawling under
// a number of different conditions.

var chai = require("chai");
	chai.should();

describe("Resource validity checker",function() {

	it("should be able to determine whether a domain is in crawl scope",
		function() {

		var crawler = new (require("../"))("example.com",3000);

		// The domain itself should be allowed.
		crawler.domainValid("example.com").should.equal(true);

		// Whereas other domains should not be allowed.
		crawler.domainValid("somethingelse").should.equal(false);
		crawler.domainValid("microsoft.com").should.equal(false);
		crawler.domainValid("a.really.complex.fqdn.").should.equal(false);

	});

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


	it("should consider WWW domains and non-WWW domains alike by default",
		function() {

		var crawler = new (require("../"))("example.com",3000);

		// Explicitly disallow crawling subdomains, important for this test
		crawler.scanSubdomains = false;

		// The domain itself isn't a subdomain per-se, but should be allowed
		crawler.domainValid("example.com").should.equal(true);

		// Its WWW domain should be allowed by default
		crawler.domainValid("www.example.com").should.equal(true);

	});

	it("should consider WWW domains and non-WWW domains as separate if requested",
		function() {

		var crawler = new (require("../"))("example.com",3000);

		// Explicitly disallow crawling subdomains, important for this test
		crawler.scanSubdomains = false;

		// Explicitly consider www a separate subdomain (ordinarily, true)
		crawler.ignoreWWWDomain = false;

		// The domain itself isn't a subdomain per-se, but should be allowed
		crawler.domainValid("example.com").should.equal(true);

		// Its WWW domain should be allowed by default
		crawler.domainValid("www.example.com").should.equal(false);

	});

	it("should permit a specified set of domains based on the internal whitelist",
		function() {

		var crawler = new (require("../"))("example.com",3000);

		// Add a few specific subdomains
		crawler.domainWhitelist.push("foo.com");
		crawler.domainWhitelist.push("bar.com");
		crawler.domainWhitelist.push("abcdefg.net.nz");

		// The domain itself isn't a subdomain per-se, but should be allowed
		crawler.domainValid("example.com").should.equal(true);

		// The explicitly set domains should be permitted
		crawler.domainValid("foo.com").should.equal(true);
		crawler.domainValid("bar.com").should.equal(true);
		crawler.domainValid("abcdefg.net.nz").should.equal(true);

		// These domains were never whitelisted, and should be denied
		crawler.domainValid("wumpus.com").should.equal(false);
		crawler.domainValid("fish.net").should.equal(false);

	});

	it("should permit fetching of specified protocols based on internal whitelist",
		function() {

		var crawler = new (require("../"))("example.com",3000);

		// Protocols supported by default
		crawler.protocolSupported("http://google.com").should.equal(true);
		crawler.protocolSupported("https://google.com").should.equal(true);
		crawler.protocolSupported("rss://google.com").should.equal(true);
		crawler.protocolSupported("feed://google.com").should.equal(true);
		crawler.protocolSupported("atom://google.com").should.equal(true);

		// Protocols not supported
		crawler.protocolSupported("gopher://google.com").should.equal(false);
		crawler.protocolSupported("ws://google.com").should.equal(false);
		crawler.protocolSupported("wss://google.com").should.equal(false);
	});

	it("should permit parsing of specified resources based on mimetype checks",
		function() {

		this.supportedMimeTypes = [
			/^text\//i,
			/^application\/(rss)?[\+\/\-]?xml/i,
			/^application\/javascript/i,
			/^xml/i
		];

		var crawler = new (require("../"))("example.com",3000);

		// Protocols supported by default
		crawler.mimeTypeSupported("text/plain").should.equal(true);

		// Crawler should be able to process all plain-text formats
		crawler.mimeTypeSupported("text/SomeFormat").should.equal(true);
		crawler.mimeTypeSupported("text/html").should.equal(true);

		// XML based formats
		crawler.mimeTypeSupported("application/rss+xml").should.equal(true);
		crawler.mimeTypeSupported("application/html+xml").should.equal(true);
		crawler.mimeTypeSupported("application/xhtml+xml").should.equal(true);

		// Some weird JS mimetypes
		crawler.mimeTypeSupported("application/javascript").should.equal(true);

		// Anything with XML...
		crawler.mimeTypeSupported("xml/manifest").should.equal(true);

		// And these should fail
		crawler.mimeTypeSupported("application/octet-stream").should.equal(false);
		crawler.mimeTypeSupported("img/png").should.equal(false);
		crawler.mimeTypeSupported("video/webm").should.equal(false);
		crawler.mimeTypeSupported("blah/blah").should.equal(false);

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
});

