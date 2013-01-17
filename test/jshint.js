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
		"crawler",
		"index",
		"queue"	].forEach(function(item) {
		
		var code = readCode(item);
		
		it("module `" + item + "` should pass JSHint with no errors",function() {
			
			JSHINT(code);
			
			if (JSHINT.errors.length) {
				console.log(JSHINT.errors[0]);
				throw new Error(
							"Line " +
							JSHINT.errors[0].line + ": " +
							JSHINT.errors[0].reason);
			}
		});
		
	});
});