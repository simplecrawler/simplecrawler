// Runs a very simple crawl on an HTTP server

/* eslint-env mocha */

var chai = require("chai"),
    Crawler = require("../");

chai.should();

describe("Crawler link discovery", function() {

    var discover,
        crawler;

    beforeEach(function() {
        crawler = new Crawler("http://example.com");

        discover = function (resourceText, queueItem) {
            queueItem = queueItem || {};

            var resources = crawler.discoverResources(resourceText, queueItem);
            return crawler.cleanExpandResources(resources, queueItem);
        };
    });

    it("should discover http/s prefixed URLs in the document", function() {

        var links =
            discover("  blah blah http://google.com/ " +
                     " blah blah https://fish.com/resource blah " +
                     " //example.com");

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("http://google.com/");
        links[1].should.equal("https://fish.com/resource");
    });

    it("should discover URLS in quoted attributes in the document", function() {

        var links =
            discover("  <a href='google.com'> " +
                     " <img src=\"http://example.com/resource with spaces.txt\"> " +
                     " url('thingo.com/test.html')");

        links.should.be.an("array");
        links.length.should.equal(4);
        links[0].should.equal("google.com");
        links[1].should.equal("http://example.com/resource%20with%20spaces.txt");
        links[2].should.equal("thingo.com/test.html");
    });

    it("should discover URLS in unquoted attributes in the document", function() {

        var links =
            discover("  <a href=google.com> " +
                     " <img src=http://example.com/resource with spaces.txt> " +
                     " url(thingo.com/test.html)");

        links.should.be.an("array");
        links.length.should.equal(3);
        links[0].should.equal("google.com");
        links[1].should.equal("http://example.com/resource");
        links[2].should.equal("thingo.com/test.html");
    });

    it("should replace all '&amp;'s with ampersands", function() {

        var links =
            discover("<a href='http://example.com/resource?with&amp;query=params&amp;and=entities'>");

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("http://example.com/resource?with&query=params&and=entities");
        links[1].should.equal("http://example.com/resource");
    });

    it("should replace all '&#38;'s and '&#x00026;'s with ampersands", function() {

        var links =
            discover("<a href='http://example.com/resource?with&#38;query=params&#x00026;and=entities'>");

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("http://example.com/resource?with&query=params&and=entities");
        links[1].should.equal("http://example.com/resource");
    });

    it("should find and follow meta redirects", function() {

        var links =
            discover("<meta http-equiv='refresh' content='0; url=/my/other/page.html'>", {
                url: "http://example.com/"
            });

        links.should.be.an("array");
        links.length.should.equal(1);
        links[0].should.equal("http://example.com/my/other/page.html");
    });

    it("should ignore HTML comments with parseHTMLComments = false", function() {

        crawler.parseHTMLComments = false;

        var links =
            discover("  <!-- http://example.com/oneline_comment --> " +
                     " <a href=google.com> " +
                     " <!-- " +
                     " http://example.com/resource " +
                     " <a href=example.com> " +
                     " -->");

        links.should.be.an("array");
        links.length.should.equal(1);
        links[0].should.equal("google.com");
    });

    it("should ignore script tags with parseScriptTags = false", function() {

        crawler.parseScriptTags = false;

        var links =
            discover("  <script>var a = \"<a href='http://example.com/oneline_script'></a>\";</script> " +
                     " <a href=google.com> " +
                     " <script type='text/javascript'> " +
                     " http://example.com/resource " +
                     " <a href=example.com> " +
                     " </SCRIPT>");

        links.should.be.an("array");
        links.length.should.equal(1);
        links[0].should.equal("google.com");
    });

    it("should discover URLs legitimately ending with a quote or parenthesis", function() {

        var links =
            discover("<a href='example.com/resource?with(parentheses)'>" +
                     " <a href='example.com/resource?with\"double quotes\"'>" +
                     " <a href=\"example.com/resource?with'single quotes'\">");

        links.should.be.an("array");
        links.length.should.equal(3);
        links[0].should.equal("example.com/resource?with%28parentheses%29");
        links[1].should.equal("example.com/resource?with%22double+quotes%22");
        links[2].should.equal("example.com/resource?with%27single+quotes%27");
    });

    it("should discard 'javascript:' links except for any arguments in there passed to functions", function () {

        var links =
            discover("<a href='javascript:;'>" +
                     " <a href='javascript: void(0);'>" +
                     " <a href='javascript: goToURL(\"/page/one\")'>", {
                         url: "http://example.com/"
                     });

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("http://example.com/");
        links[1].should.equal("http://example.com/page/one");
    });

    it("should not pick up 'href' or 'src' inside href attributes as full URL's", function () {

        var links =
            discover("<a href='https://example.com/?src=3'>My web page</a>");

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("https://example.com/?src=3");
        links[1].should.equal("https://example.com/");
    });

    it("should strip fragment identifiers from URL's", function () {

        var links =
            discover("<a href='https://example.com/#section'>My web page</a>" +
                     "<a href='/other/page#blabla'>Link</a>" +
                     "<a href='#section'>Section</a>", {
                         url: "https://example.com/"
                     });

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("https://example.com/");
        links[1].should.equal("https://example.com/other/page");
    });

    it("should find resources in srcset attributes", function() {

        var links =
            discover("<img src='pic-200.png' srcset='pic-200.png 200px, pic-400.png 400w'>", {
                url: "https://example.com/"
            });

        links.should.be.an("array");
        links.length.should.equal(2);
        links[0].should.equal("https://example.com/pic-200.png");
        links[1].should.equal("https://example.com/pic-400.png");
    });

    it("should respect nofollow values in robots meta tags", function() {

        var links = discover("<meta name='robots' value='nofollow'><a href='/stage2'>Don't follow me!</a>");
        links.should.eql([]);
    });
});
