// Example demonstrating the simple (but less flexible) way of initiating
// a crawler.

var Crawler = require("../lib");

Crawler.crawl("http://deewr.gov.au/")
	.on("fetchstart",function(queueItem){
		console.log("Starting request for:",queueItem.url);
	})
	.on("fetchcomplete",function(queueItem){
		console.log("Completed fetching resource:",queueItem.url);
	});
