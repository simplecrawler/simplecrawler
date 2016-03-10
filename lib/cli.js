var Crawler     = require("./crawler"),
    Cache       = require("./cache"),
    cli         = require("commander"),
    manifest    = require("../package.json"),
    colors      = require("colors/safe"),
    repl        = require("repl");

console.error(colors.cyan("\n  Simplecrawler " + manifest.version));
console.error(colors.red("  Experimental CLI runner"));

cli
    .version(manifest.version)

    // CLI settings
    .option("--repl",
            "Drop into a REPL once the crawler is established")
    .option("--reporter <filename>",
            "Use a custom reporter (JS file) for displaying crawl results")
    .option("--output <location>",
            "Output crawl results to disk, in this location")
    .option("--verbose",
            "Report verbosely (if the chosen reporter respects this flag.)")

    // General crawler settings
    .option("--host <string>",
            "Host/domain to crawl")
    .option("--initialPath <string>",
            "Path from which to start crawling")
    .option("--initialPort <number>",
            "Port of the initial crawl resource")
    .option("--initialProtocol <string>",
            "Protocol of the initial crawl resource")
    .option("--interval <number>",
            "Frequency of the crawler runloop")
    .option("--maxConcurrency <number>",
            "Frequency of the crawler runloop")
    .option("--timeout <number>",
            "Maximum time we'll wait for headers")
    .option("--userAgent <string>",
            "Crawler User Agent header")
    .option("--decodeResponses <boolean>",
            "Convert non-unicode responses to UTF-8, where possible")

    // Crawl restriction
    .option("--filterByDomain <boolean>",
            "Limit crawl to initially specified host name " +
            "(warning — crawl will be unbounded if this is disabled.)")
    .option("--scanSubdomains <boolean>",
            "Also crawl subdomains of initially specified hostname")
    .option("--ignoreWWWDomain <boolean>",
            "Treat WWW subdomain the same as the main domain (and don't " +
            "count it as a separate subdomain) — defaults to true")

    // Proxy initialisation
    .option("--useProxy <boolean>",
            "Use an HTTP Proxy for the crawl")
    .option("--proxyHostname <string>",
            "Hostname or IP address of the HTTP proxy to use for crawl")
    .option("--proxyPort <string>",
            "Port of the HTTP proxy to use for crawl")
    .option("--proxyUser <string>",
            "Basic auth username for the HTTP proxy to use for crawl " +
            "(If unspecified, auth will not be supplied.)")
    .option("--proxyPass <string>",
            "Basic auth password for the HTTP proxy to use for crawl " +
            "(If unspecified, auth will not be supplied.)")
    .option("--proxyPass <string>",
            "Basic auth password for the HTTP proxy to use for crawl " +
            "(If unspecified, auth will not be supplied.)")

    // Basic Auth (for crawl destination)
    .option("--needsAuth <boolean>",
            "Basic auth flag for crawl (this is applied to the destination " +
            "server, not any intermediary proxy.)")
    .option("--authUser <string>",
            "Username for HTTP basic auth")
    .option("--authPass <string>",
            "Password for HTTP basic auth")

    // Crawl behaviour
    .option("--acceptCookies <boolean>",
            "If true, the crawler will accept and send cookie headers.")
    .option("--downloadUnsupported <boolean>",
            "Download files simplecrawler can't parse for URL discovery")
    .option("--urlEncoding <string>",
            "Set the default encoding for buffers (unicode)")
    .option("--stripQuerystring <boolean>",
            "Strip the querystring from discovered URLs before downloading")
    .option("--parseHTMLComments <boolean>",
            "Discover URLs inside HTML comments")
    .option("--parseScriptTags <boolean>",
            "Discover URLs inside script tags")
    .option("--maxDepth <number>",
            "Distance from initial resource to crawl")
    .option("--fetchWhitelistedMimeTypesBelowMaxDepth <boolean>",
            "Allow 'resources' (JS/CSS, etc) greater than the max depth to " +
            "be downloaded")
    .option("--ignoreInvalidSSL <boolean>",
            "Ignore self-signed and invalid SSL certificates")
    .parse(process.argv);

if (!cli.host && !cli.args.length) {
    console.error(colors.red(
            "You must specify a location to crawl (either a URL " +
            "argument, or a hostname with --host)"));
    process.exit(1);
}

(function context() {

    var crawler = new Crawler();

    var crawlerPublicProps =
            Object.keys(crawler).filter(function(prop) {
                return (
                    prop[0] !== "_" &&
                    prop    !== "domain" &&
                    typeof crawler[prop] !== "object"
                );
            }),

        crawlerModifiedProps =
            crawlerPublicProps.filter(function(prop) {
                return prop in cli;
            });

    // Apply properties to crawler
    crawlerModifiedProps.forEach(function(prop) {
        if (typeof crawler[prop] === "number") {
            crawler[prop] = +cli[prop];
        }

        if (typeof crawler[prop] === "string") {
            crawler[prop] = String(cli[prop]);
        }

        if (typeof crawler[prop] === "boolean") {
            crawler[prop] =
                cli[prop] === "false" ? false :
                cli[prop] === "true"  ? true :
                !!cli[prop];
        }
    });


    var maxPropNameLength =
            crawlerPublicProps.slice(0).sort(function(a, b) {
                return b.length - a.length;
            })[0].length;

    function pad(prop) {
        while (prop.length < maxPropNameLength) {
            prop += " ";
        }

        return prop;
    }

    console.error(colors.dim("\n  Crawling with the following settings:\n"));

    crawlerPublicProps.forEach(function(prop) {
        console.error(
            crawlerModifiedProps.indexOf(prop) > -1 ?
                    colors.yellow("  %s - %s") : colors.dim("  %s - %s"),
            pad(prop),
            crawler[prop]);
    });

    console.error("\n");

    try {
        var reporter = require(cli.reporter || "./reporters/basic");

        reporter(crawler);
    } catch (e) {
        console.error(colors.red(
            "Reporter could not be loaded: " + e.message));

        process.exit(1);
    }

    if (cli.output) {
        console.error(colors.yellow("Outputting crawl data to %s"), cli.output);
        crawler.cache = new Cache(cli.output);
    }

    if (!cli.repl) {
        var start = Date.now();
        crawler.start();
        crawler.on("complete", function() {
            console.error(
                colors.green("Crawl finished successfuly in %d seconds.\n"),
                (Date.now() - start) / 1000);
        });

    } else {

        repl.start();

    }

})();
