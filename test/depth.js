/* eslint-env mocha */

"use strict";

const chai = require("chai");
const Crawler = require("../");

const routes = require("./lib/routes.js");
const Server = require("./lib/testserver.js");

var server = new Server(routes);
server.listen(3000);

chai.should();

function depthTest(maxDepth, linksToDiscover) {
  var testName =
    "should discover " +
    linksToDiscover +
    " resources with maxDepth " +
    maxDepth;

  it(testName, function(done) {
    var crawler = new Crawler("http://127.0.0.1:3000/depth/1");
    var linksDiscovered = 0;

    crawler.interval = 5;
    crawler.maxDepth = maxDepth;

    crawler.on("fetchcomplete", function() {
      linksDiscovered++;
    });

    crawler.on("complete", function() {
      linksDiscovered.should.equal(linksToDiscover);
      done();
    });

    crawler.start();
  });
}

describe("Crawler max depth", function() {
  this.slow("300ms");

  var maxDepthToResourceCount = {
    0: 11, // maxDepth=0 (no max depth) should return 11 resources
    1: 1, // maxDepth=1
    2: 3, // maxDepth=2
    3: 6 // maxDepth=3
  };

  for (var maxDepth in maxDepthToResourceCount) {
    if (maxDepthToResourceCount.hasOwnProperty(maxDepth)) {
      // Since `maxDepth` is an object key here, it'll be a string, which
      // is why we want to explicitly cast it to a number
      depthTest(Number(maxDepth), maxDepthToResourceCount[maxDepth]);
    }
  }
});
