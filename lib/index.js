/*
 * Simplecrawler - Export interfaces
 * https://github.com/cgiffard/node-simplecrawler
 *
 * Copyright (c) 2011-2015, Christopher Giffard
 *
 */

module.exports = require("./crawler.js");

module.exports.queue = require("./queue.js");
module.exports.cache = require("./cache.js");

module.exports.crawl = function () {
    throw new Error(
        "Crawler.crawl is deprecated as of version 1.0.0! " +
        "You can now pass a single URL directly to the constructor. " +
        "See the documentation for more details!"
    );
};
