// Cookie Jar Functionality
var EventEmitter	= require("events").EventEmitter,
	util			= require("util");

/*
	Public: Constructor for the cookie jar.

	Examples

		var cookieJar = new CookieJar();

	Returns the cookie jar object which has now been constructed.

*/
function CookieJar() {
	var cookies = [];
	this.__defineGetter__("cookies",function() {
		return cookies;
	});

	// Run the EventEmitter constructor
	EventEmitter.call(this);
}

util.inherits(CookieJar,EventEmitter);

/*
	Public: Adds a new cookie to the jar, either by creating a new Cookie() object
	from specific details such as name, value, etc., accepting a string from a
	Set-Cookie header, or by passing in an existing Cookie() object.

	name				-	The name of the cookie to add. Alternately, set-cookie
							header as string, or an existing cookie object.
	value				-	The value of the cookie.
	expiry				-	Expiry timestamp in milliseconds.
	path				-	Limit cookie to path (defaults to "/")
	domain				-	Limit cookie to domain
	httponly			-	Boolean value specifying httponly
	cb					-	Optional callback.

	Emits

		addcookie		-	Emitted with new cookie object as an argument.

	Examples

		cookieJar.add("mycookie","myValue",Date.now(),"/","test.com",false);

	Returns the cookie jar object for chaining.

*/
CookieJar.prototype.add = function(name,value,expiry,path,domain,httponly,cb) {

	var existingIndex = -1, newCookie;

	if (arguments.length > 1) {
		newCookie = new Cookie(name,value,expiry,path,domain,httponly);
	} else if (name instanceof Cookie) {
		newCookie = name;
	} else {
		newCookie = Cookie.fromString(name);
	}

	// Are we updating an existing cookie or adding a new one?
	this.cookies.forEach(function(cookie,index) {
		if (cookie.name === newCookie.name &&
			cookie.matchDomain(newCookie.domain)) {

			existingIndex = index;
		}
	});

	if (existingIndex < 0) {
		this.cookies.push(newCookie);
	} else {
		this.cookies[existingIndex] = newCookie;
	}

	this.emit("addcookie",newCookie);

	if (cb && cb instanceof Function)
		cb(null,newCookie);

	return this;
};

/*
	Public: Removes cookies from the cookie jar. If no domain and name are
	specified, all cookies in the jar are removed.

	name				-	The name of the cookie(s) to remove
	domain				-	The domain from which to remove cookies.
	cb					-	Optional callback.

	Emits

		removecookie	-	Emitted with array of removed cookies.

	Examples

		cookieJar.remove(null,"nytimes.com");

	Returns an array of removed cookies.

*/
CookieJar.prototype.remove = function(name,domain,cb) {
	var cookiesRemoved = [], jar = this;

	this.cookies.forEach(function(cookie,index) {

		// If the names don't match, we're not removing this cookie
		if (!!name && cookie.name !== name)
			return false;

		// If the domains don't match, we're not removing this cookie
		if (!!domain && !cookie.matchDomain(domain))
			return false;

		// Matched. Remove!
		cookiesRemoved.push(jar.cookies.splice(index,1));
	});

	jar.emit("removecookie",cookiesRemoved);

	if (cb && cb instanceof Function)
		cb(null,cookiesRemoved);

	return cookiesRemoved;
};

/*
	Public: Gets an array of cookies based on name and domain.

	name				-	The name of the cookie(s) to retrieve
	domain				-	The domain from which to retrieve cookies.
	cb					-	Optional callback.

	Examples

		cookieJar.get(null,"nytimes.com");

	Returns an array of cookies.

*/
CookieJar.prototype.get = function(name,domain,cb) {

	var cookies =
		this.cookies.filter(function(cookie,index) {

			// If the names don't match, we're not returning this cookie
			if (!!name && cookie.name !== name)
				return false;

			// If the domains don't match, we're not returning this cookie
			if (!!domain && !cookie.matchDomain(domain))
				return false;

			return true;
		});

	if (cb && cb instanceof Function)
		cb(null,cookies);

	return cookies;
};

/*
	Public: Generates an array of headers based on the value of the cookie jar.

	domain				-	The domain from which to generate cookies.
	path				-	Filter headers to cookies applicable to this path.
	cb					-	Optional callback.

	Examples

		cookieJar.getAsHeader("nytimes.com","/myaccount");

	Returns an array of cookie headers.

*/
CookieJar.prototype.getAsHeader = function(domain,path,cb) {

	var headers =
		this.cookies
			.filter(function(cookie) {
				if (cookie.isExpired()) return false;
				if (!domain && !path) return true;
				if (domain) return cookie.matchDomain(domain);
				if (path) return cookie.matchPath(path);
			})
			.map(function(cookie) {
				return cookie.toString();
			});

	if (cb && cb instanceof Function)
		cb(null,headers);

	return headers;
};

/*
	Public: Adds cookies to the cookie jar based on an array of 'set-cookie'
	headers provided by a webserver. Duplicate cookies are overwritten.

	headers				-	An array of 'set-cookie' headers
	cb					-	Optional callback.

	Examples

		cookieJar.addFromHeaders(res.headers["set-cookie"]);

	Returns the cookie jar for chaining.

*/
CookieJar.prototype.addFromHeaders = function(headers,cb) {
	var jar = this;

	if (!(headers instanceof Array))
		headers = [headers];

	headers.forEach(function(header) {
		jar.add(header);
	});

	if (cb && cb instanceof Function)
		cb(jar);

	return jar;
};

/*
	Public: Outputs a linefeed-separated list of set-cookie headers representing
	the entire contents of the cookie jar.

	Examples

		cookieJar.toString();

	Returns a list of headers in string form.

*/
CookieJar.prototype.toString = function() {
	return this.getAsHeader().join("\n");
};


/*
	Public: Constructor for the Cookie() object: create a new cookie.

	name				-	The name of the cookie to add.
	value				-	The value of the cookie.
	expires				-	Expiry timestamp in milliseconds.
	path				-	Limit cookie to path (defaults to "/")
	domain				-	Limit cookie to domain
	httponly			-	Boolean value specifying httponly

	Examples

		var myCookie = new Cookie("mycookie","myValue",Date.now(),"/","test.com",false);

	Returns the newly created Cookie object.

*/
function Cookie(name,value,expires,path,domain,httponly) {

	if (!name) throw new Error("A name is required to create a cookie.");

	// Parse date to timestamp - consider it never expiring if timestamp is not
	// passed to the function
	if (expires) {

		if (typeof expires !== "number")
			expires = (new Date(expires)).getTime();

	} else {
		expires = -1;
	}

	this.name		= name;
	this.value		= value || "";
	this.expires	= expires;
	this.path		= path || "/";
	this.domain		= domain || "*";
	this.httponly	= !!httponly;
}

/*
	Public, Static: Returns a new Cookie() object based on a header string.

	string				-	A set-cookie header string

	Examples

		var myCookie = Cookie.fromString(response.headers["set-cookie"][0]);

	Returns the newly created Cookie object.

*/
Cookie.fromString = function(string) {

	if (!string || typeof string !== "string")
		throw new Error("String must be supplied to generate a cookie.");

	function parseKeyVal(input) {
		var key = input.split(/\=/).shift(),
			val	= input.split(/\=/).slice(1).join("=");

		return [key,val];
	}

	string = string.replace(/^\s*set\-cookie\s*\:\s*/i,"");

	var parts		= string.split(/\s*\;\s*/i),
		name		= parseKeyVal(parts.shift()),
		keyValParts	= {};

	keyValParts.name = name[0];
	keyValParts.value = name[1];

	parts
		.filter(function(input) {
			return !!input.replace(/\s+/ig,"").length;
		})
		.map(parseKeyVal)
		.forEach(function(keyval) {
			var key = String(keyval[0]).toLowerCase().replace(/[^a-z0-9]/ig,"");
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

/*
	Public: Outputs the cookie as a string, in the form of a set-cookie header.

	includeHeader		-	Boolean value specifying whether to include the
							'Set-Cookie: ' header name at the beginning of the
							string.

	Examples

		var header = myCookie.toString(true);

	Returns the header string.

*/
Cookie.prototype.toString = function(includeHeader) {
	var string = "";

	if (includeHeader) string = "Set-Cookie: ";

	string += this.name + "=" + this.value + "; ";

	if (this.expires > 0)
		string += "Expires=" + (new Date(this.expires)).toGMTString() + "; ";

	if (!!this.path)
		string += "Path=" + this.path + "; ";

	if (!!this.domain)
		string += "Domain=" + this.domain + "; ";

	if (!!this.httponly)
		string += "Httponly; ";

	return string;
};

/*
	Public: Determines whether a cookie has expired or not.

	Examples

		if (myCookie.isExpired()) { ... }

	Returns a boolean value specifying whether the cookie has expired (true) or
	whether it is still valid (false.)

*/
Cookie.prototype.isExpired = function() {
	if (this.expires < 0) return false;
	return (this.expires < Date.now());
};

/*
	Public: Determines whether a cookie matches a given domain.

	Examples

		if (myCookie.matchDomain("example.com")) { ... }

	Returns a boolean value specifying whether the cookie matches (true) or
	doesn't match (false.)

*/
Cookie.prototype.matchDomain = function(domain) {
	var reverseDomain = this.domain.split("").reverse().join(""),
		reverseDomainComp = domain.split("").reverse().join("");

	return reverseDomain.indexOf(reverseDomainComp) === 0;
};

/*
	Public: Determines whether a cookie matches a given path.

	Examples

		if (myCookie.matchPath("/test/account")) { ... }

	Returns a boolean value specifying whether the cookie matches (true) or
	doesn't match (false.)

*/
Cookie.prototype.matchPath = function(path) {
	if (!this.path) return true;

	return path.indexOf(this.path) === 0;
};

module.exports = CookieJar;
module.exports.Cookie = Cookie;
