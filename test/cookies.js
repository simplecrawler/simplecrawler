// Ensures that cookie support is functional and reliable across
// a variety of different cookie formats. The more cookies I can add to this
// cookies array, the better the tests!

var chai = require("chai");
	chai.should();

var cookies = [
	"Set-Cookie: RMID=007f010019155170d6ca005f; Expires=Sat, 19 Apr 2020 05:31:54 GMT; Path=/; Domain=.nytimes.com;",
	"Set-cookie: adxcs=-; path=/; domain=.nytimes.com",
	"Set-Cookie: PREF=ID=8c63f2522e22574d:FF=0:TM=1366349569:LM=1366349569:S=p1Urbmfwfs-R573P; expires=Sun, 19-Apr-2015 05:32:49 GMT; path=/; domain=.google.com",
	"Set-Cookie: NID=67=DhLO04YPAMlhETrTIe2oFPqWZfypQXLZfCIPItOvf70zhtUEMEItYfdVh6aROEzRHqtd9jHT6HJ7Oo93eqP3cjYNp8GgShfa6r0WVbsmQQRUvutbjBOPwzo7ybwYcWdB; expires=Sat, 19-Oct-2015 05:32:49 GMT; path=/; domain=.google.com; HttpOnly",
	"Set-Cookie: fpc=d=Yq1z8hbA9WextmPFlb7suMTfMRgtSc2FyzAB7now1ExfUZ.eW7s4QSwSKlB6ZB0juN8OLZxWf_XXEIcspYaQmVVD0mD0xJ.xpXBCSw5Dl_Ql6n.RLoM.7CnTbNSsiSr2fkNiCN47tRUB4j8iWevNwQdFDn1hB8z8t1xwWt76n.sLIRY9p2_jTBhukfSD4SBpBkJhI1o-&v=2; expires=Sat, 19-Apr-2020 05:48:42 GMT; path=/; domain=www.yahoo.com",
	"Set-Cookie: test=test; path=/test; domain=test.com"
];

describe("Cookies",function() {

	var CookieJar	= require("../lib/cookies.js"),
		Cookie		= CookieJar.Cookie;

	it("should be able parse from string properly",function() {

		Cookie.should.be.a("function");
		Cookie.fromString.should.be.a("function");
		Cookie.fromString(cookies[0]).should.be.an("object");
		Cookie.fromString(cookies[0]).should.be.an.instanceof(Cookie);

		var tmpCookie = Cookie.fromString(cookies[0]);

		tmpCookie.name.should.equal("RMID");
		tmpCookie.value.should.equal("007f010019155170d6ca005f");
		tmpCookie.expires.should.equal(1587274314000);
		tmpCookie.path.should.equal("/");
		tmpCookie.domain.should.equal(".nytimes.com");

		// Test the next cookie...
		tmpCookie = Cookie.fromString(cookies[1]);

		tmpCookie.name.should.equal("adxcs");
		tmpCookie.value.should.equal("-");
		tmpCookie.expires.should.equal(-1);
		tmpCookie.path.should.equal("/");
		tmpCookie.domain.should.equal(".nytimes.com");

	});

	it("should be able to test for expiry",function() {

		// Create a new cookie that should already have expired...
		var tmpCookie = new Cookie("test","test",Date.now()-1000);

		tmpCookie.isExpired().should.equal(true);

		// Create a new cookie with an expiry 20 seconds in the future
		tmpCookie = new Cookie("test","test",Date.now()+20000);

		tmpCookie.isExpired().should.equal(false);
	});

	it("should be able to output the cookie object as a string",function() {

		cookies.forEach(function(cookie) {
			var tmpCookie		= Cookie.fromString(cookie),
				outputString	= tmpCookie.toString(true),
				reParsedCookie	= Cookie.fromString(outputString);

			tmpCookie.name.should.equal(reParsedCookie.name);
			tmpCookie.value.should.equal(reParsedCookie.value);
			tmpCookie.expires.should.equal(reParsedCookie.expires);
			tmpCookie.path.should.equal(reParsedCookie.path);
			tmpCookie.domain.should.equal(reParsedCookie.domain);
			tmpCookie.httponly.should.equal(reParsedCookie.httponly);
		})
	});

	describe("Cookie Jar",function() {

		it("should be able to be instantiated",function() {
			var cookieJar = new CookieJar();
		});

		it("should be able to add cookies",function() {
			var cookieJar = new CookieJar();

			cookies.forEach(function(cookie) {
				var parsedCookie = Cookie.fromString(cookie);

				cookieJar.add(
						parsedCookie.name,
						parsedCookie.value,
						parsedCookie.expires,
						parsedCookie.path,
						parsedCookie.domain,
						parsedCookie.httponly);

				var cookiesAdded = cookieJar.get(parsedCookie.name),
					parsedCookie2 = cookiesAdded.pop();

				parsedCookie2.name.should.equal(parsedCookie.name);
				parsedCookie2.value.should.equal(parsedCookie.value);
				parsedCookie2.expires.should.equal(parsedCookie.expires);
				parsedCookie2.path.should.equal(parsedCookie.path);
				parsedCookie2.domain.should.equal(parsedCookie.domain);
				parsedCookie2.httponly.should.equal(parsedCookie.httponly);
			});

			cookieJar.cookies.length.should.equal(cookies.length);
		});

		it("should be able to remove cookies by name",function() {
			var cookieJar = new CookieJar();

			cookies.forEach(function(cookie) {
				var parsedCookie = Cookie.fromString(cookie);

				cookieJar.add(
						parsedCookie.name,
						parsedCookie.value,
						parsedCookie.expires,
						parsedCookie.path,
						parsedCookie.domain,
						parsedCookie.httponly);
			});

			cookieJar.cookies.length.should.equal(cookies.length);

			cookies.forEach(function(cookie,index) {
				var parsedCookie = Cookie.fromString(cookie);

				cookieJar.remove(parsedCookie.name);

				cookieJar.cookies.length.should.equal(
										cookies.length - (index+1));
			});
		});

		it("should be able to retrieve cookies by name",function() {
			var cookieJar = new CookieJar();

			cookies.forEach(function(cookie) {
				var parsedCookie = Cookie.fromString(cookie);

				cookieJar.add(
						parsedCookie.name,
						parsedCookie.value,
						parsedCookie.expires,
						parsedCookie.path,
						parsedCookie.domain,
						parsedCookie.httponly);

				var returnedCookies = cookieJar.get(parsedCookie.name),
					parsedCookie2 = returnedCookies.pop();

				parsedCookie2.name.should.equal(parsedCookie.name);
				parsedCookie2.value.should.equal(parsedCookie.value);
				parsedCookie2.expires.should.equal(parsedCookie.expires);
				parsedCookie2.path.should.equal(parsedCookie.path);
				parsedCookie2.domain.should.equal(parsedCookie.domain);
				parsedCookie2.httponly.should.equal(parsedCookie.httponly);
			});
		});

		it("should be able to accept cookies from a header/s",function() {
			var cookieJar = new CookieJar();
			cookieJar.addFromHeaders(cookies);

			cookies.forEach(function(cookie) {
				var parsedCookie = Cookie.fromString(cookie);
				var returnedCookies = cookieJar.get(parsedCookie.name),
					parsedCookie2 = returnedCookies.slice(0,1).pop();

				returnedCookies.length.should.equal(1);
				parsedCookie2.name.should.equal(parsedCookie.name);
				parsedCookie2.value.should.equal(parsedCookie.value);
				parsedCookie2.expires.should.equal(parsedCookie.expires);
				parsedCookie2.path.should.equal(parsedCookie.path);
				parsedCookie2.domain.should.equal(parsedCookie.domain);
				parsedCookie2.httponly.should.equal(parsedCookie.httponly);
			});
		});

		it("should be able to generate a header from internal storage",function() {
			var cookieJar = new CookieJar();
			cookieJar.addFromHeaders(cookies);
			var comparisonHeaderList = cookieJar.getAsHeader();

			comparisonHeaderList.should.be.an("array");
			comparisonHeaderList.length.should.equal(cookies.length);

			comparisonHeaderList.forEach(function(header,index) {
				var parsedCookie = Cookie.fromString(cookies[index]);
				var parsedCookie2 = Cookie.fromString(header);

				parsedCookie2.name.should.equal(parsedCookie.name);
				parsedCookie2.value.should.equal(parsedCookie.value);
				parsedCookie2.expires.should.equal(parsedCookie.expires);
				parsedCookie2.path.should.equal(parsedCookie.path);
				parsedCookie2.domain.should.equal(parsedCookie.domain);
				parsedCookie2.httponly.should.equal(parsedCookie.httponly);
			});
		});

		it("should be able to filter generated headers by domain and path",function() {
			var cookieJar = new CookieJar();
			cookieJar.addFromHeaders(cookies);
			var comparisonHeaderList = cookieJar.getAsHeader("nytimes.com");

			comparisonHeaderList.length.should.equal(2);

			comparisonHeaderList = cookieJar.getAsHeader(null,"/");

			// Even though there's 6 cookies.
			comparisonHeaderList.length.should.equal(5);
		});

		it("should be able to filter generated headers by expiry",function() {
			var cookieJar = new CookieJar();
			cookieJar.addFromHeaders(cookies);

			// set the expiry on one of the headers to some point far in the past
			cookieJar.cookies[0].expires /= 2;

			// Get the headers...
			var comparisonHeaderList = cookieJar.getAsHeader();

			comparisonHeaderList.length.should.equal(cookies.length-1);
		});
	});
});
