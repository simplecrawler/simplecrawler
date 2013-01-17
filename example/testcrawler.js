var Crawler = require("../"),
	crawler = new Crawler("127.0.0.1","/",3000);

crawler.on("crawlstart",function() {
	console.log("Crawl starting");
});
	
crawler.on("fetchstart",function(queueItem) {
	console.log("fetchStart",queueItem);
});

crawler.on("fetchcomplete",function(queueItem) {
	console.log("fetchcomplete",queueItem);
});

crawler.on("complete",function() {
	console.log("Finished!");
});

crawler.start();