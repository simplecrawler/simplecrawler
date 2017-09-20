/**
 * @file simplecrawler's cookie jar module
 */

var EventEmitter = require("events").EventEmitter,
    util = require("util");

/**
 * Creates a new cookie jar
 * @class
 */
var CookieJar = function() {
    EventEmitter.call(this);

    /**
     * The actual jar that holds the cookies
     * @private
     * @type {Array}
     */
    this.cookies = [];
};

util.inherits(CookieJar, EventEmitter);

/**
 * Called when {@link CookieJar#add} returns a result
 * @callback CookieJar~addCallback
 * @param {Error|null} error   If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Cookie|null} cookie The cookie that was added to the jar
 */

/**
 * Adds a new cookie to the jar, either by creating a new {@link Cookie} object
 * from specific details such as name, value, etc., accepting a string from a
 * Set-Cookie header, or by passing in an existing {@link Cookie} object.
 * @fires CookieJar#addcookie
 * @param {String} name                       Name of the new cookie
 * @param {String} value                      Value of the new cookie
 * @param {String|Number} expiry              Expiry timestamp of the new cookie in milliseconds
 * @param {String} [path="/"]                 Limits cookie to a path
 * @param {String} [domain="*"]               Limits cookie to a domain
 * @param {Boolean} [httponly=false]          Specifies whether to include the HttpOnly flag
 * @param {CookieJar~addCallback} [callback]
 * @return {CookieJar}                        Returns the cookie jar instance to enable chained API calls
 */
CookieJar.prototype.add = function(name, value, expiry, path, domain, httponly, callback) {
    var existingIndex = -1, newCookie;

    if (arguments.length > 1) {
        newCookie = new Cookie(name, value, expiry, path, domain, httponly);
    } else if (name instanceof Cookie) {
        newCookie = name;
    } else {
        newCookie = Cookie.fromString(name);
    }

    // Are we updating an existing cookie or adding a new one?
    this.cookies.forEach(function(cookie, index) {
        if (cookie.name === newCookie.name && cookie.matchDomain(newCookie.domain)) {
            existingIndex = index;
        }
    });

    if (existingIndex === -1) {
        this.cookies.push(newCookie);
    } else {
        this.cookies[existingIndex] = newCookie;
    }

    /**
     * Fired when a cookie has been added to the jar
     * @event CookieJar#addcookie
     * @param {Cookie} cookie The cookie that has been added
     */
    this.emit("addcookie", newCookie);

    if (callback instanceof Function) {
        callback(null, newCookie);
    }

    return this;
};

/**
 * Called when {@link CookieJar#remove} returns a result
 * @callback CookieJar~removeCallback
 * @param {Error|null} error             If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Cookie[]|null} cookiesRemoved An array of the cookies that were removed from the cookie jar
 */

/**
 * Removes cookies from the cookie jar. If no domain and name are specified, all
 * cookies in the jar are removed.
 * @fires CookieJar#removecookie
 * @param {String} [name]                       Name of the cookie to be removed
 * @param {String} [domain]                     The domain that the cookie applies to
 * @param {CookieJar~removeCallback} [callback]
 * @return {Cookie[]}                           Returns an array of the cookies that were removed from the cookie jar
 */
CookieJar.prototype.remove = function(name, domain, callback) {
    var cookiesRemoved = [],
        jar = this;

    jar.cookies.forEach(function(cookie, index) {
        // If the names don't match, we're not removing this cookie
        if (Boolean(name) && cookie.name !== name) {
            return false;
        }

        // If the domains don't match, we're not removing this cookie
        if (Boolean(domain) && !cookie.matchDomain(domain)) {
            return false;
        }

        // Matched. Remove!
        cookiesRemoved.push(jar.cookies.splice(index, 1));
    });

    /**
     * Fired when one or multiple cookie have been removed from the jar
     * @event CookieJar#removecookie
     * @param {Cookie[]} cookie The cookies that have been removed
     */
    jar.emit("removecookie", cookiesRemoved);

    if (callback instanceof Function) {
        callback(null, cookiesRemoved);
    }

    return cookiesRemoved;
};

/**
 * Called when {@link CookieJar#get} returns a result
 * @callback CookieJar~getCallback
 * @param {Error} [error]      If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {Cookie[]} [cookies] An array of cookies that matched the name and/or domain.
 */

/**
 * Gets an array of cookies based on name and domain
 * @param  {String} [name]                    Name of the cookie to retrieve
 * @param  {String} [domain]                  Domain to retrieve the cookies from
 * @param  {CookieJar~getCallback} [callback]
 * @return {Cookie[]}                         Returns an array of cookies that matched the name and/or domain
 */
CookieJar.prototype.get = function(name, domain, callback) {
    var cookies = this.cookies.filter(function(cookie) {
        // If the names don't match, we're not returning this cookie
        if (Boolean(name) && cookie.name !== name) {
            return false;
        }

        // If the domains don't match, we're not returning this cookie
        if (Boolean(domain) && !cookie.matchDomain(domain)) {
            return false;
        }

        return true;
    });

    if (callback instanceof Function) {
        callback(null, cookies);
    }

    return cookies;
};

/**
 * Called when {@link CookieJar#getAsHeader} returns a result
 * @callback CookieJar~getAsHeaderCallback
 * @param {Error} [error]      If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 * @param {String[]} [cookies] An array of HTTP header formatted cookies.
 */

/**
 * Generates an array of headers based on the value of the cookie jar
 * @param {String} [domain]                          The domain from which to generate cookies
 * @param {String} [path]                            Filter headers to cookies applicable to this path
 * @param {CookieJar~getAsHeaderCallback} [callback]
 * @return {String[]}                                Returns an array of HTTP header formatted cookies
 */
CookieJar.prototype.getAsHeader = function(domain, path, callback) {
    var headers = this.cookies.filter(function(cookie) {
        if (cookie.isExpired()) {
            return false;
        }
        if (!domain && !path) {
            return true;
        }
        if (domain) {
            return cookie.matchDomain(domain);
        }
        if (path) {
            return cookie.matchPath(path);
        }
    })
    .map(function(cookie) {
        return cookie.toOutboundString();
    });

    if (callback instanceof Function) {
        callback(null, headers);
    }

    return headers;
};

/**
 * Called when {@link CookieJar#addFromHeaders} returns a result
 * @callback CookieJar~addFromHeadersCallback
 * @param {Error} [error] If the operation was successful, this will be `null`. Otherwise it will be the error that was encountered.
 */

/**
 * Adds cookies to the cookie jar based on an array of 'Set-Cookie' headers
 * provided by a web server. Duplicate cookies are overwritten.
 * @fires CookieJar#addcookie
 * @param {String|String[]} headers                     One or multiple Set-Cookie headers to be added to the cookie jar
 * @param {CookieJar~addFromHeadersCallback} [callback]
 * @return {CookieJar}                                  Returns the cookie jar instance to enable chained API calls
 */
CookieJar.prototype.addFromHeaders = function(headers, callback) {
    var jar = this;

    if (!Array.isArray(headers)) {
        headers = [headers];
    }

    headers.forEach(function(header) {
        jar.add(header);
    });

    if (callback instanceof Function) {
        callback(null);
    }

    return jar;
};

/**
 * Generates a newline-separated list of all cookies in the jar
 * @return {String} Returns stringified versions of all cookies in the jar in a newline separated string
 */
CookieJar.prototype.toString = function() {
    return this.getAsHeader().join("\n");
};


/**
 * Creates a new cookies
 * @class
 * @param {String} name                       Name of the new cookie
 * @param {String} value                      Value of the new cookie
 * @param {String|Number} expires             Expiry timestamp of the new cookie in milliseconds
 * @param {String} [path="/"]                 Limits cookie to a path
 * @param {String} [domain="*"]               Limits cookie to a domain
 * @param {Boolean} [httponly=false]          Specifies whether to include the HttpOnly flag
 */
var Cookie = function(name, value, expires, path, domain, httponly) {
    if (!name) {
        throw new Error("A name is required to create a cookie.");
    }

    // Parse date to timestamp - consider it never expiring if timestamp is not
    // passed to the function
    if (expires) {

        if (typeof expires !== "number") {
            expires = (new Date(expires)).getTime();
        }

    } else {
        expires = -1;
    }

    this.name = name;
    this.value = value || "";
    this.expires = expires;
    this.path = path || "/";
    this.domain = domain || "*";
    this.httponly = Boolean(httponly);
};

/**
 * Creates a new {@link Cookie} based on a header string
 * @param  {String} string A Set-Cookie header string
 * @return {Cookie}        Returns a newly created Cookie object
 */
Cookie.fromString = function(string) {

    if (!string || typeof string !== "string") {
        throw new Error("String must be supplied to generate a cookie.");
    }

    function parseKeyVal(input) {
        var key = input.split(/=/).shift(),
            val = input.split(/=/).slice(1).join("=");

        return [key, val];
    }

    string = string.replace(/^\s*set\-cookie\s*:\s*/i, "");

    var parts = string.split(/\s*;\s*/i),
        name = parseKeyVal(parts.shift()),
        keyValParts = {};

    keyValParts.name = name[0];
    keyValParts.value = name[1];

    parts
        .filter(function(input) {
            return Boolean(input.replace(/\s+/ig, "").length);
        })
        .map(parseKeyVal)
        .forEach(function(keyval) {
            var key = String(keyval[0]).toLowerCase().replace(/[^a-z0-9]/ig, "");
            keyValParts[key] = keyval[1];
        });

    return new Cookie(
        keyValParts.name,
        keyValParts.value,
        keyValParts.expires || keyValParts.expiry,
        keyValParts.path,
        keyValParts.domain,
        keyValParts.hasOwnProperty("httponly")
    );
};

/**
 * Outputs the cookie as a string, in the form of an outbound Cookie header
 * @return {String}                  Stringified version of the cookie
 */
Cookie.prototype.toOutboundString = function() {
    return this.name + "=" + this.value;
};

/**
 * Outputs the cookie as a string, in the form of a Set-Cookie header
 * @param  {Boolean} [includeHeader] Controls whether to include the 'Set-Cookie: ' header name at the beginning of the string.
 * @return {String}                  Stringified version of the cookie
 */
Cookie.prototype.toString = function(includeHeader) {
    var string = "";

    if (includeHeader) {
        string = "Set-Cookie: ";
    }

    string += this.name + "=" + this.value + "; ";

    if (this.expires > 0) {
        string += "Expires=" + (new Date(this.expires)).toGMTString() + "; ";
    }

    if (this.path) {
        string += "Path=" + this.path + "; ";
    }

    if (this.domain) {
        string += "Domain=" + this.domain + "; ";
    }

    if (this.httponly) {
        string += "Httponly; ";
    }

    return string;
};

/**
 * Determines whether a cookie has expired or not
 * @return {Boolean} Returns true if the cookie has expired. Otherwise, it returns false.
 */
Cookie.prototype.isExpired = function() {
    if (this.expires < 0) {
        return false;
    }
    return this.expires < Date.now();
};

/**
 * Determines whether a cookie matches a given domain
 * @param  {String} domain The domain to match against
 * @return {Boolean}       Returns true if the provided domain matches the cookie's domain. Otherwise, it returns false.
 */
Cookie.prototype.matchDomain = function(domain) {
    if (this.domain === "*") {
        return true;
    }

    var reverseDomain = this.domain.split("").reverse().join(""),
        reverseDomainComp = domain.split("").reverse().join("");

    return reverseDomain.indexOf(reverseDomainComp) === 0;
};

/**
 * Determines whether a cookie matches a given path
 * @param  {String} path The path to match against
 * @return {Boolean}     Returns true if the provided path matches the cookie's path. Otherwise, it returns false.
 */
Cookie.prototype.matchPath = function(path) {
    if (!this.path) {
        return true;
    }

    return path.indexOf(this.path) === 0;
};

module.exports = CookieJar;
module.exports.Cookie = Cookie;
