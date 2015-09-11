// Example of how to add a fetch condition to respect the rules of a robots.txt file

var request = require("request"),
	url = require("url"),
	Crawler = require("../"),
	parseRobots = require("robots-parser");



var crawler =  new Crawler("example.com"),
	robotsUrl = "http://example.com/robots.txt";

request(robotsUrl, function (res, body) {
	var robots = parseRobots(robotsUrl, body);

	crawler.addFetchCondition(function (parsedUrl) {
		var standardUrl = url.format({
			protocol: parsedUrl.protocol,
			host: parsedUrl.host,
			pathname: parsedUrl.path.split("?")[0],
			search: parsedUrl.path.split("?")[1]
		});

		var allowed = false;

		// The punycode module sometimes chokes on really weird domain
		// names. Catching those errors to prevent the crawler from crashing
		try {
			allowed = robots.isAllowed(standardUrl, crawler.userAgent);
		} catch (error) {
			console.error("Caught error from robots.isAllowed method on url %s", standardUrl, error);
		}

		return allowed;
	});

	crawler.start();
});
