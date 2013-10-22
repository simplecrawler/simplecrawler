// Tests to ensure crawler code is well formed

var chai = require("chai");
	chai.should();

describe("Core code",function() {
	var JSHINT = require("jshint").JSHINT,
		fs = require("fs");

	function readCode(file) {
		file = __dirname + "/../lib/" + file + ".js";
		return fs.readFileSync(file).toString("utf8");
	}

	[	"cache-backend-fs",
		"cache",
		"cli",
		"cookies",
		"crawler",
		"index",
		"queue",
		"quickcrawl"	].forEach(function(item) {

		var code = readCode(item);

		it("module `" + item + "` should pass JSHint with no errors",function() {

			var slowThresholdMilliseconds = 200;
			this.slow(slowThresholdMilliseconds);

			JSHINT(code,{
					"indent": 4,
					"undef": true
				},
				{
					// Don't want no errant logging statements going to production!
					// `console` has been deliberately omitted from this whitelist.

					// All the regular node stuff
					"require": true,
					"module": true,
					"process": true,
					"setInterval": true,
					"clearInterval": true,
					"setTimeout": true,
					"clearTimeout": true,
					"Buffer": true
				});

			if (JSHINT.errors.length) {
				throw new Error(
							"Line " +
							JSHINT.errors[0].line + ": " +
							JSHINT.errors[0].reason);
			}
		});

	});
});
