"use strict";

var aFrom          = require("es5-ext/array/from")
  , identity       = require("es5-ext/function/identity")
  , assign         = require("es5-ext/object/assign")
  , objMap         = require("es5-ext/object/map")
  , objToArray     = require("es5-ext/object/to-array")
  , setPrototypeOf = require("es5-ext/object/set-prototype-of")
  , ensureString   = require("es5-ext/object/validate-stringifiable-value")
  , toShortString  = require("es5-ext/to-short-string-representation")
  , d              = require("d")
  , lazy           = require("d/lazy")
  , ee             = require("event-emitter");

var emitter = ee(), levelCache = Object.create(null);
var isValidNsToken = RegExp.prototype.test.bind(/^[a-z0-9-]+$/);

var levelNames = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"];

var setEnabledState = function (state) {
	this.isEnabled = state;
	return this;
};

var createLogger, createLevelLogger, createNsLogger;

var getLevel = function (newLevel) {
	newLevel = ensureString(newLevel);
	if (this.level === newLevel) return this;
	var levelLogger = createLevelLogger(newLevel);
	return this.nsTokens.reduce(function (currentLogger, token) {
		return createNsLogger(currentLogger, token);
	}, levelLogger);
};

var getNs = function (ns) {
	ns = ensureString(ns);
	var nsTokens = ns.split(":");
	nsTokens.forEach(function (nsToken) {
		if (!isValidNsToken(nsToken)) {
			throw new TypeError(
				toShortString(ns) +
					" is not a valid ns string " +
					"(only 'a-z0-9-' chars are allowed and ':' as delimiter)"
			);
		}
	});
	return nsTokens.reduce(function (currentLogger, token) {
		return createNsLogger(currentLogger, token);
	}, this);
};

var loggerProto = Object.create(
	Function.prototype,
	assign(
		{
			isEnabled: d("ew", true),
			emitter: d("", emitter),
			predefinedLevels: d("e", levelNames),
			_nsToken: d("", null),
			hasNs: d("e", function (ns) {
				var nsTokens = ensureString(ns).split(":");
				var currentLogger = this;
				return nsTokens.every(function (nsToken) {
					return currentLogger = currentLogger._children[nsToken];
				});
			}),
			hasLevel: d("e", function (level) {
				level = ensureString(level);
				if (this.level === level) return true;
				var logger = levelCache[level];
				if (!logger) return false;
				if (!this.ns) return true;
				return logger.hasNs(this.ns);
			}),
			getAllLevels: d("e", function () {
				return Object.keys(levelCache)
					.filter(function (level) { return this.hasLevel(level); }, this)
					.map(function (level) { return getLevel.call(this, level); }, this);
			}),
			getAllNs: d("e", function () { return objToArray(this._children, identity); })
		},
		lazy(
			Object.assign(
				levelNames.reduce(function (descriptors, level) {
					descriptors[level] = d(
						"e",
						function () { return getLevel.call(this, level); },
						{ cacheName: "_" + level }
					);
					return descriptors;
				}, {}),
				{
					warn: d(function () { return getLevel.call(this, "warning"); }, {
						cacheName: "_warning"
					}),
					ns: d("e", function () { return this.nsTokens.join(":") || null; }, {
						cacheName: "_ns"
					}),
					nsTokens: d(
						"e",
						function () {
							return this._nsToken
								? Object.getPrototypeOf(this).nsTokens.concat(this._nsToken)
								: [];
						},
						{ cacheName: "_nsTokens" }
					),
					enable: d(function () { return setEnabledState.bind(this, true); }, {
						cacheName: "_enable"
					}),
					disable: d(function () { return setEnabledState.bind(this, false); }, {
						cacheName: "_disable"
					}),
					getNs: d(function () { return getNs.bind(this); }, { cacheName: "_getNs" }),
					_children: d("", function () { return Object.create(null); }, {
						cacheName: "__children"
					})
				}
			)
		)
	)
);

createLogger = function () {
	// eslint-disable-next-line no-unused-vars
	return function self(msgItem1/*, ...msgItemn*/) {
		emitter.emit("log", { logger: self, messageTokens: aFrom(arguments) });
	};
};

createLevelLogger = function (levelName) {
	if (levelCache[levelName]) return levelCache[levelName];
	var logger = Object.defineProperties(setPrototypeOf(createLogger(), loggerProto), {
		level: d("e", levelName),
		levelIndex: d("e", levelNames.indexOf(levelName))
	});
	levelCache[levelName] = logger;
	emitter.emit("init", { logger: logger });
	return logger;
};

createNsLogger = function (parent, nsToken) {
	if (parent._children[nsToken]) return parent._children[nsToken];
	var logger = Object.defineProperties(setPrototypeOf(createLogger(), parent), {
		_nsToken: d("", nsToken)
	});
	parent._children[nsToken] = logger;
	emitter.emit("init", { logger: logger });
	return logger;
};

module.exports = createLevelLogger("debug");
