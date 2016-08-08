// Routes for testing server

var fs = require("fs"),
    path = require("path"),
    zlib = require("zlib");

var getFixtureFile = function (filename) {
    return fs.readFileSync(path.join(__dirname, "..", "fixtures", filename));
};

module.exports = {
    "/": function(write) {
        write(200, "Home. <a href='stage2'>stage2</a> <a href='forbidden'>bad robot!</a>");
    },

    "/robots.txt": function(write) {
        write(200, getFixtureFile("robots.txt"));
    },

    // This is only forbidden in robots.txt, not by enforcing server rules
    "/forbidden": function(write) {
        write(200, "You shouldn't be poking around in here");
    },

    "/stage2": function(write) {
        write(200, "Stage2. http://127.0.0.1:3000/stage/3", {
            // Faulty cookie! Should generate a cookieerror event
            "Set-Cookie": "=test; path=/stage2; domain=test.com"
        });
    },

    "/stage/3": function(write) {
        write(200, "Stage3. <a href='//127.0.0.1:3000/stage/4'>stage4</a>");
    },

    "/stage/4": function(write) {
        write(200, "Stage4. <a href='../stage5'>stage5</a>");
    },

    "/stage5": function(write, redir) {
        redir("/stage6");
    },

    "/stage6": function(write) {
        write(200, "<a href='nofollow'>Go to me, but no further!</a>");
    },

    "/stage7": function(write) {
        write(200, "Crawl complete!");
    },

    "/nofollow": function(write) {
        write(200, "<meta name='robots' value='nofollow'><a href='/stage7'>Don't go here!</a>");
    },

    "/cookie": function(write) {
        var expires = new Date();
        expires.setHours(expires.getHours() + 10);
        var cookie = "thing=stuff; expires=" + expires + "; path=/; domain=.localhost";

        write(200, "<a href='/stage7'>Link</a>", { "Set-Cookie": cookie });
    },

    "/async-stage1": function(write) {
        write(200, "http://127.0.0.1:3000/async-stage2");
    },

    "/async-stage2": function(write) {
        write(200, "http://127.0.0.1:3000/async-stage3");
    },

    "/async-stage3": function(write) {
        write(200, "Complete!");
    },

    "/timeout": function() {
        // We want to trigger a timeout. Never respond.
    },

    "/timeout2": function() {
        // We want to trigger a timeout. Never respond.
    },

    "/domain-redirect": function(write, redir) {
        redir("http://localhost:3000/");
    },

    "/domain-redirect2": function(write, redir) {
        redir("http://localhost:3000/domain-redirect");
    },

    "/to-domain-redirect": function(write) {
        write(200, "<a href='/domain-redirect'>redirect</a>");
    },

    // Routes for depth tests
    "/depth/1": function(write) {
        write(200, "<link rel='stylesheet' href='/css'> Home. <a href='/depth/2'>depth2</a>");
    },

    "/depth/2": function(write) {
        write(200, "Depth 2. http://127.0.0.1:3000/depth/3");
    },

    "/depth/3": function(write) {
        write(200, "Depth 3. <link rel='stylesheet' href='/css/2'> <link rel='stylesheet' href='/css/4'>");
    },

    "/css": function(write) {
        write(200, "/* CSS 1 */ @import url('/css/2'); @font-face { url(/font/1) format('woff'); }", { "Content-Type": "text/css" });
    },

    "/css/2": function(write) {
        write(200, "/* CSS 2 */ @import url('/css/3'); .img1 { background-image:url('/img/1'); }", { "Content-Type": "text/css" });
    },

    "/css/3": function(write) {
        write(200, "/* CSS 3 */", { "Content-Type": "text/css" });
    },

    "/css/4": function(write) {
        write(200, "/* CSS 4 */ .img1 { background-image:url('/img/2'); } @font-face { url(/font/2) format('woff'); }", { "Content-Type": "text/css" });
    },

    "/img/1": function(write) {
        write(200, "", { "Content-Type": "image/png" });
    },

    "/img/2": function(write) {
        write(200, "", { "Content-Type": "image/png" });
    },

    "/font/1": function(write) {
        write(200, "", { "Content-Type": "font/woff" });
    },

    "/font/2": function(write) {
        write(200, "", { "Content-Type": "application/font-woff" });
    },

    "/404": function(write) {
        write(404, "page not found");
    },

    "/410": function(write) {
        write(410, "this page no longer exists!");
    },

    "/script": function(write) {
        write(200, "<script src='/not/existent/file.js'></script><script>var foo = 'bar';</script><a href='/stage2'>stage2</a><script>var bar = 'foo';</script>");
    },

    "/to/other/port": function(write) {
        write(200, "<a href='//127.0.0.1:3001/disallowed'>Don't go there!</a>");
    },

    "/encoded/header": function(write) {
        write(200, getFixtureFile("encoded.html"), { "Content-Type": "text/html; charset=ISO-8859-1" });
    },

    "/encoded/inline": function(write) {
        write(200, getFixtureFile("inline-encoding.html"));
    },

    "/encoded/old-inline": function(write) {
        write(200, getFixtureFile("old-inline-encoding.html"));
    },

    "/encoded/empty": function(write) {
        write(200, "");
    },

    "/compressed/link": function(write) {
        zlib.gzip("<a href='/compressed/gzip'>Go to gzip</a>", function(error, result) {
            write(200, result, { "Content-Encoding": "gzip" });
        });
    },

    "/compressed/gzip": function(write) {
        zlib.gzip("Yay, you know how to deal with gzip compression!", function(error, result) {
            write(200, result, { "Content-Encoding": "gzip" });
        });
    },

    "/compressed/deflate": function(write) {
        zlib.deflate("Yay, you know how to deal with deflate compression!", function(error, result) {
            write(200, result, { "Content-Encoding": "deflate" });
        });
    },

    "/big": function(write) {
        write(200, new Buffer(1024 * 1024 * 17));
    }
};
