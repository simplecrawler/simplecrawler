// Server for testing HTTP crawls!
// Ultra simple - only for running with mocha tests.

// Include HTTP
var http = require("http");

// Create server for crawling
var httpServer = http.createServer();

var testRoutes = require("./routes");

// Listen to events
httpServer.on("request",function(req,res) {

	function write(status,data,contentType) {
		res.writeHead(
			status,
			http.STATUS_CODES[status],
			{
				"Content-Type":		contentType || "text/html",
				"Content-Length":	Buffer.byteLength(data),
			});

		res.write(data);
		res.end();
	}

	function redir(to) {
		var data = "Redirecting you to " + to;

		res.writeHead(
			301,
			http.STATUS_CODES[301],
			{
				"Content-Type":		"text/plain",
				"Content-Length":	Buffer.byteLength(data),
				"Location":			to
			});

		res.write(data);
		res.end();
	}

	if (testRoutes[req.url] &&
		testRoutes[req.url] instanceof Function) {

		// Pass in a function that takes a status and some data to write back
		// out to the client
		testRoutes[req.url](write,redir);

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
