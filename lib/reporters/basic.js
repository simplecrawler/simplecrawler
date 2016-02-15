var colors = require("colors/safe"),
	util   = require("util");

module.exports = function(crawler, options) {
	// originalEmit = crawler.emit;
	//
	// crawler.emit = function(eventName) {
	// 	console.log(eventName, arguments);
	// 	originalEmit.apply(crawler, arguments);
	// }
	//
	// var boringEvents = [
	//
	// 	];
	//
	// var interestingEvents = [
	//
	// 	];

	// Events which end up being a bit noisy
	var boringEvents = [
		"queueduplicate",
		"fetchstart",
		"discoverycomplete"
	];

	// Replace original emit so we can sample all events easily
	// and log them to console
	var originalEmit = crawler.emit;
	var resourceCount = 0, queueLength = 1;

	function status() {
		process.stdout.write(util.format(
			"working: (%d/%d) %d% complete\n\n\r\033[2A",
			resourceCount,
			queueLength,
			(((resourceCount / queueLength) * 1e5) | 0) / 1e3
		));
	}

	crawler.emit = function(name, queueItem) {
		var url = "",
			statusCode = 999;

		if (name === "fetchcomplete"	||
			name === "fetch404" 		||
			name === "fetchtimeout"		||
			name === "fetcherror"		||
			name === "fetchredirect") {
			resourceCount ++;
		} else if (name === "queueadd") {
			queueLength ++;
		}

		if (queueItem) {
			if (typeof queueItem === "string") {
				url = queueItem;
			} else if (queueItem.url) {
				url = queueItem.url;
				statusCode = queueItem.stateData.code
			}
		}

		function pad(string) {
			while (string.length < 20) {
				string += " ";
			}
			return string;
		}

		if (url.length > process.stdout.columns - 26) {
			url = colors.white(url.substr(0, process.stdout.columns - 30) + "...");
		}

		// if (boringEvents.indexOf(name) === -1) {
			console.log(colors.cyan("%s") + colors.yellow(" [%d] ") + "%s", pad(name), statusCode, url);
			status();
		// }

		originalEmit.apply(crawler, arguments);
	};
};