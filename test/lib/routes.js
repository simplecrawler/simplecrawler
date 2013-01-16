// Routes for testing server


module.exports = {
	"/": function(write) {
		write(200,"Home. <a href='/stage2'>stage2</a>");
	},
	
	"/stage2": function(write) {
		write(200,"Stage2. Wooooo");
	}
};