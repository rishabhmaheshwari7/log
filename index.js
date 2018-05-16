"use strict";

var aFrom          = require("es5-ext/array/from")
  , identity       = require("es5-ext/function/identity")
  , noop           = require("es5-ext/function/noop")
  , assign         = require("es5-ext/object/assign")
  , objForEach     = require("es5-ext/object/for-each")
  , objToArray     = require("es5-ext/object/to-array")
  , setPrototypeOf = require("es5-ext/object/set-prototype-of")
  , ensureString   = require("es5-ext/object/validate-stringifiable-value")
  , toShortString  = require("es5-ext/to-short-string-representation")
  , d              = require("d")
  , lazy           = require("d/lazy")
  , emitter        = require("./writer-util/emitter")
  , levelNames     = require("./levels");

var isValidNamespaceToken = RegExp.prototype.test.bind(/^[a-z0-9-]+$/);

// Map of initialized top level loggers
var levelLoggers = Object.create(null);

var createLevelLogger, createNamespaceLogger;

var loggerPrototype = Object.create(
	Function.prototype,
	assign(
		{
			// Public properties & methods

			// Should logger logs be exposed?
			isEnabled: d("ew", true),

			// Initializes and returns namespaced logger
			get: d(function (namespace) {
				namespace = ensureString(namespace);
				var namespaceTokens = namespace.split(":");
				namespaceTokens.forEach(function (namespaceToken) {
					if (!isValidNamespaceToken(namespaceToken)) {
						throw new TypeError(
							toShortString(namespace) +
								" is not a valid ns string " +
								"(only 'a-z0-9-' chars are allowed and ':' as delimiter)"
						);
					}
				});
				return namespaceTokens.reduce(function (currentLogger, token) {
					return createNamespaceLogger(currentLogger, token);
				}, this);
			}),

			// Enables logger and all its namespaced children
			enable: d(function () { return this._setEnabledState(true); }),

			// Disables logger and all its namespaced children
			disable: d(function () { return this._setEnabledState(false); }),

			// Public meta methods (used by log writers)
			isNamespaceInitialized: d("e", function (ns) {
				var namespaceTokens = ensureString(ns).split(":");
				var currentLogger = this;
				return namespaceTokens.every(function (nsToken) {
					return currentLogger = currentLogger._childNamespaceLoggers[nsToken];
				});
			}),
			isLevelInitialized: d("e", function (level) {
				level = ensureString(level);
				if (this.level === level) return true;
				var logger = levelLoggers[level];
				if (!logger) return false;
				if (!this.namespace) return true;
				return logger.isNamespaceInitialized(this.namespace);
			}),
			getAllInitializedLevels: d("e", function () {
				return Object.keys(levelLoggers)
					.filter(function (level) { return this.isLevelInitialized(level); }, this)
					.map(function (level) { return this._getLevelLogger(level); }, this);
			}),
			getAllInitializedNamespaces: d("e", function () {
				return objToArray(this._childNamespaceLoggers, identity);
			}),

			// Internal
			_namespaceToken: d("", null),
			_getLevelLogger: d(function (newLevel) {
				newLevel = ensureString(newLevel);
				if (this.level === newLevel) return this;
				var levelLogger = createLevelLogger(newLevel);
				return this.namespaceTokens.reduce(function (currentLogger, token) {
					return createNamespaceLogger(currentLogger, token);
				}, levelLogger);
			}),
			_setEnabledState: d(function (state) {
				var cache = [];
				this._setEnabledStateRecursively(state, cache);
				var result = {
					restore: function () {
						cache.forEach(function (data) {
							if (data.hasDirectSetting) data.logger.isEnabled = !state;
							else delete data.logger.isEnabled;
						});
						result.restore = noop;
					}
				};
				return result;
			}),
			_setEnabledStateRecursively: d(function (newState, cache) {
				if (this.isEnabled !== newState) {
					cache.push({
						logger: this,
						hasDirectSetting: hasOwnProperty.call(this, "isEnabled")
					});
					this.isEnabled = newState;
				}
				objForEach(this._childNamespaceLoggers, function (namespacedLogger) {
					namespacedLogger._setEnabledStateRecursively(newState, cache);
				});
			})
		},

		// Lazily resolved properties
		lazy(
			assign(
				// Loggers for all levels
				levelNames.reduce(function (descriptors, level) {
					descriptors[level] = d(
						"e",
						function () { return this._getLevelLogger(level); },
						{ cacheName: "_" + level }
					);
					return descriptors;
				}, {}),
				{
					// Warn -> warning alias
					warn: d(function () { return this._getLevelLogger("warning"); }, {
						cacheName: "_warning"
					}),
					// Full namespace string e.g. foo:bar:elo
					namespace: d(
						"e",
						function () { return this.namespaceTokens.join(":") || null; },
						{ cacheName: "_namespace" }
					),
					// All namespace tokens e.g. ["foo", "bar", "elo"]
					namespaceTokens: d(
						"e",
						function () {
							return this._namespaceToken
								? Object.getPrototypeOf(this).namespaceTokens.concat(
										this._namespaceToken
								  )
								: [];
						},
						{ cacheName: "_namespaceTokens" }
					),
					// Map of children namespace loggers
					_childNamespaceLoggers: d("", function () { return Object.create(null); }, {
						cacheName: "__childNamespaceLoggers"
					})
				}
			)
		)
	)
);

var createLogger = function (prototype) {
	// eslint-disable-next-line no-unused-vars
	return setPrototypeOf(function self(msgItem1/*, ...msgItemn*/) {
		emitter.emit("log", { logger: self, messageTokens: aFrom(arguments) });
	}, prototype || loggerPrototype);
};

createLevelLogger = function (levelName) {
	if (levelLoggers[levelName]) return levelLoggers[levelName];
	var logger = Object.defineProperties(createLogger(), {
		level: d("e", levelName),
		levelIndex: d("e", levelNames.indexOf(levelName))
	});
	levelLoggers[levelName] = logger;
	emitter.emit("init", { logger: logger });
	return logger;
};

createNamespaceLogger = function (parent, nsToken) {
	if (parent._childNamespaceLoggers[nsToken]) return parent._childNamespaceLoggers[nsToken];
	var logger = Object.defineProperties(createLogger(parent), { _namespaceToken: d("", nsToken) });
	parent._childNamespaceLoggers[nsToken] = logger;
	emitter.emit("init", { logger: logger });
	return logger;
};

// Exports "debug" level logger as a starting point
module.exports = createLevelLogger("debug");
