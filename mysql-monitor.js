/**
 * mysql-monitor.js - Ed Shortt
 * 2017
 * Script for logging and reversing changes to a database, based on: https://www.npmjs.com/package/mysql-event
 */

var util = require('util');
var colors = require('colors');
var prettyjson = require('prettyjson');
var MySQLEvents = require('mysql-events');
var mysql = require('mysql');
var fs = require('fs');
var keypress = require('keypress');
var dsn = {
	host: 'localhost',
	user: 'zongji',
	password: 'n00dles',
};

var monitor_target = '*';
if (process.argv.length > 2) {
	if (process.argv[2] == '-r' || process.argv[2] == '-R') {

		var args = [];
		for (var i = 3; i < process.argv.length; i++) {
			args.push(process.argv[i]);
		}

		var multiple = (process.argv[2] === '-R') ? true : false;
		reverse_sql(false, args, multiple);
		return;
	} else {
		monitor_target = process.argv[2];
	}
} else {
	console.log('Usage: node mysql_monitor.js [OPTION] DB_STRING');
	console.log('DB_STRING is a dot seperated value: database.table.column.value');
	console.log('Only the database part is required.');
	console.log('');
	console.log('Edit the dsn object in the script file to add database login credentials.');
	console.log('');
	console.log('Options:');
	console.log('+r uid = Reverse specific SQL changed identified by uid. Multiple uids can be specifed, space seperated.');
	console.log('+R uid = Reverse all SQL changes starting from the specified uid');
	console.log('');
	console.log('Interactive keys:');
	console.log('space = Initiate a new tag');
	console.log('r     = reverse sql changes to the last tag');
	console.log('x     = clear the console');
	return;
}

console.log("Monitoring " + monitor_target + ' for changes.');

var last_tag = 0;
make_new_tag();

// listen for the "keypress" event 
keypress(process.stdin);
process.stdin.on('keypress', function (ch, key) {

	if (key && key.name == 'r') {
		var tag = last_tag;
		make_new_tag();
		reverse_sql(tag);
	}
	if (key && key.name == 'space') {
		make_new_tag();
	}
	if (key && key.name == 'x') {
		console.log('\033[2J');
		console.log("Monitoring " + monitor_target + ' for changes.');
		console.log('');
	}
	if (key && key.ctrl && key.name == 'c') {
		process.abort();
	}
});

process.stdin.setRawMode(true);
process.stdin.resume();

var mysqlEventWatcher = MySQLEvents(dsn);
var watcher = mysqlEventWatcher.add(
	monitor_target,
	function (oldRow, newRow, event) {

		//row inserted 
		if (oldRow === null) {
			//insert code goes here 
			log_op("INSERT", newRow);
		}
		//row deleted 
		if (newRow === null) {
			//delete code goes here
			log_op("DELETE", oldRow);
		}

		//row updated 
		if (oldRow !== null && newRow !== null) {
			//update code goes heir
			log_op("UPDATE", newRow, oldRow);
		}

		//detailed event information 
		//console.log(event) 
	}
);

function log_op(operation, newRow, oldRow) {
	if (newRow.table == 'login_details') {
		return;
	}

	var database = newRow.database;
	var table = newRow.table;

	oldRow = oldRow || false;

	if (newRow['affectedColumns']) {
		delete newRow.affectedColumns;
	}
	if (newRow.fields['id']) {
		newRow['id'] = "" + newRow.fields['id'];
	}
	var newFields = newRow.fields;
	if (oldRow) {
		var oldFields = oldRow.fields;
	}
	delete newRow.fields;
	delete newRow.table;
	delete newRow.database;

	if (operation != 'DELETE' && operation != 'INSERT') {
		for (var i in newFields) {
			if (newRow.changedColumns.indexOf(i) < 0) {
				delete newFields[i];
				if (oldRow) {
					delete oldFields[i];
				}
			}
		}
	}

	if (operation == 'DELETE') {
		newRow['deletedFields'] = newFields;
	} else {
		newRow['newFields'] = newFields;
	}

	if (oldRow) {
		newRow['oldFields'] = oldFields;
	}

	if (newRow.changedColumns.length < 1) {
		delete newRow.changedColumns;
	}

	var ftime = new Date() + "";
	var time = ftime.split(' ')[4];
	var uid = last_tag + '_' + Date.now() + Math.floor((Math.random() * 9999) + 1);

	var outOb = {
		time: ftime,
		uid: "" + uid
	};
	for (var i in newRow) {
		outOb[i] = newRow[i];
	}
	var str = operation + ': ' + database + '.' + table;

	var blob = '';
	if (operation == 'UPDATE') { str = str.bgBlue; blob = blob.bgBlue; }
	if (operation == 'DELETE') { str = str.bgRed; blob = blob.bgRed; }
	if (operation == 'INSERT') { str = str.bgGreen; blob = blob.bgGreen; }
	str = blob + time.bold + ' ' + str + '                  ';
	console.log(str);
	console.log(prettyjson.render(outOb, { noColor: true }));
	console.log('');

	//write to file
	var filename = './mysql-monitor.json';
	var fileOb = {
		operation: operation,
		database: database,
		table: table
	};
	fileOb = Object.assign(fileOb, outOb);


	var lines = 0;
	if (fs.existsSync(filename)) {
		lines = fs.readFileSync(filename).toString().split("\n").length;
		if (lines > 1000) {
			//prevent file getting too large
			fs.writeFileSync(filename, "");
		}
	}

	fileOb[util.inspect.custom] = function () {
		console.log(this);
	};

	fs.appendFileSync(filename, JSON.stringify(fileOb) + ",\n");
}


function reverse_sql(tag, ids, multiple) {
	tag = tag || false;

	var filename = './mysql-monitor.json';
	var json = fs.readFileSync(filename).toString();
	json = json.replace(/,\s*$/, "");
	json = JSON.parse('[' + json + ']');

	var start = false;
	for (var i = 0; i < json.length; i++) {
		var ob = json[i];

		var id_found = false;
		if (tag) {
			if (ob.uid.split('_')[0] != tag) {
				continue;
			}
		} else {
			if (ids.indexOf(ob.uid) < 0) {
				if (!start || !multiple) {
					continue;
				}
			} else {
				if (start === false) {
					start = true;
				}
			}
		}



		if (ob.operation == 'DELETE') {
			reverse_sql_delete(ob);
		}
		if (ob.operation == 'INSERT') {
			reverse_sql_insert(ob);
		}
		if (ob.operation == 'UPDATE') {
			reverse_sql_update(ob);
		}
	}
}

function reverse_sql_update(ob) {
	console.log("Reversing SQL Update: " + ob.uid);

	var sql = 'UPDATE ' + ob.table;
	var values = [];

	for (var i in ob.oldFields) {
		var v = ob.oldFields[i];
		if (v == null) {
			v = '';
		}
		values.push(i + '=' + '"' + v + '"');
	}

	sql += ' SET ' + values.join(',') + ' WHERE id=' + ob.id + ' LIMIT 1';
	db_query(ob.database, sql);
}

function reverse_sql_insert(ob) {
	console.log("Reversing SQL Insert: " + ob.uid);
	var sql = 'DELETE FROM ' + ob.table + ' WHERE id=' + ob.id + ' LIMIT 1;';
	db_query(ob.database, sql);
}

function reverse_sql_delete(ob) {
	console.log("Reversing SQL Delete: " + ob.uid);

	var sql = 'INSERT INTO ' + ob.table;
	var keys = [];
	var values = [];

	delete ob.deletedFields['id'];
	for (var i in ob.deletedFields) {
		var v = ob.deletedFields[i];
		if (v == null) {
			continue;
		}
		keys.push(i);
		values.push("'" + v + "'");
	}

	sql += '(' + keys.join(',') + ') VALUES(' + values + ')';

	db_query(ob.database, sql);
}

function make_new_tag() {
	last_tag = Math.floor((Math.random() * 9999) + 1);
	var ftime = new Date() + "";
	var time = ftime.split(' ')[4];
	console.log('');
	console.log(time + " ########################################################################################");
}

function db_query(database, query) {
	var con = mysql.createConnection({
		host: dsn.host,
		user: dsn.user,
		password: dsn.password,
		database: database
	});

	con.query(query);
	con.end();
}
