/**
 * mysql-monitor.js - Ed Shortt
 * 2017
 * Script for logging and reversing changes to a database, based on: https://www.npmjs.com/package/mysql-event
 */
var ZongJi = require('@vlasky/zongji');
var colors = require('colors');

var dsn = {
	host: 'localhost',
	user: 'homestead',
	password: 'secret',
};

var monitor_target = '*';
if (process.argv.length > 2) {
	monitor_target = process.argv[2];
} else {
	console.log('Usage: node mysql_monitor.js <database_name>');
	console.log('');
	console.log('Edit the dsn object in the script file to add database login credentials.');
	process.exit();
}

console.log("Monitoring " + monitor_target + ' for changes.');

const zongji = new ZongJi(dsn);

process.on('SIGINT', function () {
	zongji.stop();
	console.log("");
	process.exit();
});

zongji.on('binlog', function (evt) {
	//var database = evt.tableMap[evt.tableId].parentSchema;
	var table = evt.tableMap[evt.tableId].tableName;
	//var columns = evt.tableMap[evt.tableId].columns;

	switch (evt.getTypeName()) {
		case 'UpdateRows':
			const changed = [];
			evt.rows.forEach((row) => {
				let newRow = {};
				if (row.after['id']) {
					newRow['id'] = row.after['id'];
				}
				for (var k in row.before) {
					if (row.before[k] === row.after[k]) {
						continue;
					}
					newRow[k] = row.after[k];
				}
				changed.push(newRow);
			});

			var str = "UPDATE " + table;
			str = str.bgBlue;
			console.log(str);
			console.log(changed);
			break;
		case 'DeleteRows':
			var str = "DELETE " + table;
			str = str.bgRed;
			console.log(str);
			console.log(evt.rows);
			break;
		case 'WriteRows':
			var str = "INSERT " + table;
			str = str.bgGreen;
			console.log(str);
			console.log(evt.rows);
			break;

	}
});

zongji.start({
	startAtEnd: true,
	includeEvents: ['tablemap', 'writerows', 'updaterows', 'deleterows']
});
