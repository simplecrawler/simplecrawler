var Crawler = require("../");
var socks   = require("socksv5");

var socksAuthNone = socks.auth.None;

var socksSettings = {
    proxyHost: "localhost",
    proxyPort: 9050,
    auths: [ socksAuthNone() ]
};

var crawler = new Crawler("http://icanhazip.com/");

crawler.httpAgent = new socks.HttpAgent(socksSettings);
crawler.httpsAgent = new socks.HttpsAgent(socksSettings);

crawler.on("crawlstart", function() {
    console.log("Crawl starting");
});

crawler.on("fetchstart", function(queueItem) {
    console.log("fetchStart", queueItem);
});

crawler.on("fetchcomplete", function(queueItem) {
    console.log("fetchcomplete", queueItem);
});

crawler.on("complete", function() {
    console.log("Finished!");
});

crawler.start();
