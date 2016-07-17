// Server for testing HTTP crawls!
// Ultra simple - only for running with mocha tests.

// Include HTTP
var http = require("http");

var Server = function(routes) {
    http.Server.call(this);

    // Listen to events
    this.on("request", function(req, res) {

        function write(status, data, customHeaders) {
            var headers = {
                "Content-Type": "text/html",
                "Content-Length": data instanceof Buffer ? data.length : Buffer.byteLength(data)
            };

            if (typeof customHeaders === "object") {
                for (var header in customHeaders) {
                    if (customHeaders.hasOwnProperty(header)) {
                        headers[header] = customHeaders[header];
                    }
                }
            }

            setTimeout(function() {
                res.writeHead(status, http.STATUS_CODES[status], headers);
                res.write(data);
                res.end();
            }, 20);
        }

        function redir(to) {
            var data = "Redirecting you to " + to;

            res.writeHead(
                301,
                http.STATUS_CODES[301], {
                    "Content-Type": "text/plain",
                    "Content-Length": Buffer.byteLength(data),
                    "Location": to
                });

            res.write(data);
            res.end();
        }

        if (routes[req.url] && typeof routes[req.url] === "function") {

            // Pass in a function that takes a status and some data to write back
            // out to the client
            routes[req.url](write, redir);
        } else {

            // Otherwise, a 404
            res.writeHead(404, "Page Not Found");
            res.write("Page not found.");
            res.end();
        }
    });

    this.on("error", function (error) {
        // If we've already started a server, don't worry that we couldn't
        // start another one.
        // This will happen, for instance, with mocha-watch.

        if (error.code === "EADDRINUSE") {
            return;
        }

        console.log(error);
        process.exit(1);
    });
};

Server.prototype = Object.create(http.Server.prototype);

module.exports = Server;
