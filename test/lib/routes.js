// Routes for testing server


module.exports = {
	"/": function(write) {
		write(200,"Home. <a href='stage2'>stage2</a>");
	},

	"/stage2": function(write) {
		write(200,"Stage2. http://127.0.0.1:3000/stage/3");
	},

	"/stage/3": function(write) {
		write(200,"Stage3. <a href='//127.0.0.1:3000/stage/4'>stage4</a>");
	},

	"/stage/4": function(write) {
		write(200,"Stage4. <a href='../stage5'>stage5</a>");
	},

	"/stage5": function(write,redir) {
		redir("/stage6");
	},

	"/stage6": function(write) {
		write(200,"Crawl complete!");
	},

	"/async-stage1": function(write) {
		write(200,"http://127.0.0.1:3000/async-stage2");
	},

	"/async-stage2": function(write) {
		write(200,"http://127.0.0.1:3000/async-stage3");
	},

	"/async-stage3": function(write) {
		write(200,"Complete!");
	},

	"/timeout": function(write) {
		// We want to trigger a timeout. Never respond.
	}
};
