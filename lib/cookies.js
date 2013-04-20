// Cookie Jar Functionality

function CookieJar() {
	var cookies = [];
	this.__defineGetter__("cookies",function() {
		return cookies;
	});
}

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
	
	if (cb && cb instanceof Function)
		cb(null,newCookie);
	
	return this;
};

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
	
	if (cb && cb instanceof Function)
		cb(null,cookiesRemoved);
	
	return cookiesRemoved;
};

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

CookieJar.prototype.addFromHeaders = function(headers,cb) {
	var jar = this;
	
	if (!(headers instanceof Array))
		headers = [headers];
	
	headers.forEach(function(header) {
		jar.add(header);
	});
};

CookieJar.prototype.toString = function() {
	return this.getAsHeader();
};

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

Cookie.prototype.isExpired = function() {
	if (this.expires < 0) return false;
	return (this.expires < Date.now());
};

Cookie.prototype.matchDomain = function(domain) {
	var reverseDomain = this.domain.split("").reverse().join(""),
		reverseDomainComp = domain.split("").reverse().join("");
	
	return reverseDomain.indexOf(reverseDomainComp) === 0;
};

Cookie.prototype.matchPath = function(path) {
	if (!this.path) return true;
	
	return path.indexOf(this.path) === 0;
};

module.exports = CookieJar;
module.exports.Cookie = Cookie;