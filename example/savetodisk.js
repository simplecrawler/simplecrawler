// Example use of simplecrawler, courtesy of @breck7! Thanks mate. :)

/**
 * @param  {String}   initialURL Domain to download
 * @param  {Function} callback
 */
var downloadSite = function(initialURL, callback) {
  var fs = require("node-fs");
  var url = require("url");
  var path = require("path");
  var Crawler = require("simplecrawler").Crawler;

  var myCrawler = new Crawler(initialURL);
  var domain = url.parse(initialURL).hostname;

  myCrawler.interval = 250;
  myCrawler.maxConcurrency = 5;

  myCrawler.on("fetchcomplete", function(queueItem, responseBuffer, response) {
    // Parse url
    var parsed = url.parse(queueItem.url);

    // Rename / to index.html
    if (parsed.pathname === "/") {
      parsed.pathname = "/index.html";
    }

    // Where to save downloaded data
    var outputDirectory = path.join(__dirname, domain);

    // Get directory name in order to create any nested dirs
    var dirname = outputDirectory + parsed.pathname.replace(/\/[^/]+$/, "");

    // Path to save file
    var filepath = outputDirectory + parsed.pathname;

    // Check if DIR exists
    fs.exists(dirname, function(exists) {
      // If DIR exists, write file
      if (exists) {
        fs.writeFile(filepath, responseBuffer, function() {});
      } else {
        // Else, recursively create dir using node-fs, then write file
        fs.mkdir(dirname, 0755, true, function() {
          fs.writeFile(filepath, responseBuffer, function() {});
        });
      }
    });

    console.log(
      "I just received %s (%d bytes)",
      queueItem.url,
      responseBuffer.length
    );
    console.log(
      "It was a resource of type %s",
      response.headers["content-type"]
    );
  });

  // Fire callback
  myCrawler.on("complete", function() {
    callback();
  });

  // Start Crawl
  myCrawler.start();
};

if (process.argv.length < 3) {
  console.log("Usage: node savetodisk.js mysite.com");
  process.exit(1);
}

downloadSite(process.argv[2], function() {
  console.log("Done!");
});
