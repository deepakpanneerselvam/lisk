'use strict';

var async = require('async');
var child_process = require('child_process');
var popsicle = require('popsicle');

var config = require('../../config.json');
var database = require('../../helpers/database.js');
var genesisblock = require('../genesisBlock.json');
var ed = require('../../helpers/ed.js');
var z_schema = require('../../helpers/z_schema.js');

/**
 * @param {string} table
 * @param {Logger} logger
 * @param {Object} db
 * @param {Function} cb
 */
function clearDatabaseTable (db, logger, table, cb) {
	db.query('DELETE FROM ' + table).then(function (result) {
		cb(null, result);
	}).catch(function (err) {
		if (logger) {
			logger.err('Failed to clear database table: ' + table);
		} else {
			console.error('Failed to clear database table: ' + table);
		}
		throw err;
	});
}

var testDatabaseNames = [];

function DBSandbox (dbConfig, testDatabaseName) {
	this.dbConfig = dbConfig;
	this.originalDatabaseName = dbConfig.database;
	this.testDatabaseName = testDatabaseName || this.originalDatabaseName;
	testDatabaseNames.push(this.testDatabaseName);

	process.on('exit', function () {
		testDatabaseNames.forEach(function (testDatabaseName) {
			console.log('dropping test db -', testDatabaseName);
			child_process.exec('dropdb ' + testDatabaseName);
		});
	});
}

DBSandbox.prototype.create = function (cb) {
	this.dbConfig.database = this.testDatabaseName;
	child_process.exec('createdb ' + this.dbConfig.database, function () {
		database.connect(this.dbConfig, console, cb);
	}.bind(this));
};

DBSandbox.prototype.destroy = function () {
	database.disconnect();
	console.log('restoring original database -', this.originalDatabaseName);
	this.dbConfig.database = this.originalDatabaseName;
};

/**
 * @param {Function} cb
 * @param {Number} [retries=10] retries
 * @param {Number} [timeout=200] timeout
 * @param {String} [baseUrl='http://localhost:5000'] timeout
 */
function waitUntilBlockchainReady (cb, retries, timeout, baseUrl) {
	if (!retries) {
		retries = 10;
	}
	if (!timeout) {
		timeout = 1000;
	}

	baseUrl = baseUrl || 'http://' + config.address + ':' + config.httpPort;
	(function fetchBlockchainStatus () {
		popsicle.get(baseUrl + '/api/loader/status')
			.then(function (res) {
				retries -= 1;
				res = JSON.parse(res.body);
				if (!res.loaded && retries >= 0) {
					return setTimeout(function () {
						fetchBlockchainStatus();
					}, timeout);
				}
				else if (res.success && res.loaded) {
					return cb();
				}
				return cb('Failed to load blockchain');
			})
			.catch(function (err) {
				retries -= 1;
				if (retries >= 0) {
					return setTimeout(function () {
						fetchBlockchainStatus();
					}, timeout);
				} else {
					return cb('Server is not responding');
				}

			});
	})();
}

module.exports = {
	clearDatabaseTable: clearDatabaseTable,
	DBSandbox: DBSandbox,
	waitUntilBlockchainReady: waitUntilBlockchainReady
};
