/* eslint-env phantomjs */

/* globals document: true */

var phantomAPI  = require("phantom"),
    Crawler     = require("simplecrawler"),
    colors      = require("colors/safe"),
    phantomjs   = require("phantomjs");

var crawler = new Crawler("http://www.example.com/"),
    phantomBin = phantomjs.path,
    phantomBannedExtensions = /\.(png|jpg|jpeg|gif|ico|css|js|csv|doc|docx|pdf)$/i,
    phantomQueue = [];

crawler.interval = 0;
phantomAPI.create({ binary: phantomBin }, runCrawler);


// Events which end up being a bit noisy
var boringEvents = [
    "queueduplicate",
    "fetchstart",
    "discoverycomplete"
];

// Replace original emit so we can sample all events easily
// and log them to console
var originalEmit = crawler.emit;

crawler.emit = function(name, queueItem) {
    var url = "";

    if (queueItem) {
        if (typeof queueItem === "string") {
            url = queueItem;
        } else if (queueItem.url) {
            url = queueItem.url;
        }
    }

    function pad(string) {
        while (string.length < 20) {
            string += " ";
        }
        return string;
    }

    if (boringEvents.indexOf(name) === -1) {
        console.log(colors.cyan("%s") + "%s", pad(name), url);
    }

    originalEmit.apply(crawler, arguments);
};

crawler.on("complete", process.exit.bind(process, 0));

function runCrawler(phantom) {
    crawler.start();
    crawler.on("queueadd", function(queueItem) {
        if (!queueItem.url.match(phantomBannedExtensions)) {
            var resume = this.wait();
            phantomQueue.push(queueItem.url);
            processQueue(phantom, resume);
        }
    });
}

function getLinks(phantom, url, callback) {
    console.log(colors.green("Phantom attempting to load ") + colors.cyan("%s"), url);

    makePage(phantom, url, function(page, status) {
        console.log(
            colors.green("Phantom opened URL with %s — ") + colors.cyan("%s"), status, url);

        page.evaluate(findPageLinks, function(result) {
            result.forEach(function(url) {
                crawler.queueURL(url);
            });
            callback();
        });
    });
}

function findPageLinks() {
    var selector = document.querySelectorAll("a, link, img");
    selector = [].slice.call(selector);

    return selector
                .map(function(link) {
                    return link.href || link.onclick || link.href || link.src;
                })
                .filter(function(src) {
                    return Boolean(src);
                });
}

function makePage(phantom, url, callback) {
    phantom.createPage(function(page) {
        page.open(url, function(status) {
            callback(page, status);
        });
    });
}

var queueBeingProcessed = false;
function processQueue(phantom, resume) {
    if (queueBeingProcessed) {
        return;
    }
    queueBeingProcessed = true;

    (function processor(item) {
        if (!item) {
            console.log(colors.green("Phantom reached end of queue! ------------"));
            queueBeingProcessed = false;
            return resume();
        }

        getLinks(phantom, item, function() {
            // Break up stack so we don't blow it
            setTimeout(processor.bind(null, phantomQueue.shift()), 10);
        });

    })(phantomQueue.shift());
}
