// Server for testing HTTP crawls!
// Ultra simple - only for running with mocha tests.

// Include HTTP
var http = require("http");

// Create server for crawling
var httpServer = http.createServer();

var testRoutes = require("./routes");

// Listen to events
httpServer.on("request",function(req,res) {
	if (testRoutes[req.url] &&
		testRoutes[req.url] instanceof Function) {

		// Pass in a function that takes a status and some text to write back
		// out to the client
		testRoutes[req.url](function(status,text) {
			res.writeHead(status);
			res.write(text);
			res.end();
		});

	} else {

		// Otherwise, a 404
		res.writeHead(404,"Page Not Found");
		res.write("Page not found.");
		res.end();
	}
});

httpServer.listen(3000);

module.exports = httpServer;
module.exports.routes = testRoutes;