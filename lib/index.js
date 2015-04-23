/*
 * Simplecrawler - Export interfaces
 * https://github.com/cgiffard/node-simplecrawler
 *
 * Copyright (c) 2011-2015, Christopher Giffard
 *
 */

module.exports = require("./crawler.js");

// Aliasing for compatibility with legacy code
module.exports.Crawler = module.exports;

module.exports.queue = require("./queue.js");
module.exports.cache = require("./cache.js");

// Convenience function for small, fast crawls
module.exports.crawl = require("./quickcrawl.js");
