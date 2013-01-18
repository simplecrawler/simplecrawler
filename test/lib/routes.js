// Routes for testing server


module.exports = {
	"/": function(write) {
		write(200,"Home. <a href='/stage2'>stage2</a>");
	},
	
	"/stage2": function(write) {
		write(200,"Stage2. http://127.0.0.1:3000/stage/3");
	},
	
	"/stage/3": function(write) {
		write(200,"Stage3. <a href='../stage4'>stage4</a>");
	},
	
	"/stage4": function(write,redir) {
		redir("/stage5");
	},
	
	"/stage5": function(write) {
		write(200,"Crawl complete!");
	}
};