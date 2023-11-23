'use strict';

/* eslint no-console: [0, { allow: ["error"] }] */
/* eslint new-cap: [0, { "newIsCap": false }] */

const Graylog2 = require('graylog2');
const debugPkg = require('debug');
const util = require('util');

let debug;
let info;
let notice;
let warning;
let error;
let alert;
let critical;
let emergency;

const logLevel = process.env.LOG_LEVEL || 'WARNING';
const facility = process.env.FACILITY || process.env.npm_package_name;

let hostList = process.env.SERVICE_GRAYLOG2_HOST_LIST
    ? process.env.SERVICE_GRAYLOG2_HOST_LIST.split(',')
    : null;


if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
    debug = debugPkg(`${facility}:debug`);
    info = debugPkg(`${facility}:info`);
    notice = debugPkg(`${facility}:notice`);
    warning = debugPkg(`${facility}:warning`);
    error = debugPkg(`${facility}:error`);
    alert = debugPkg(`${facility}:alert`);
    critical = debugPkg(`${facility}:critical`);
    emergency = debugPkg(`${facility}:emergency`);
}

const Logger = function logger() {
    this.connector = {
        level: {
            DEBUG: 7,
            INFO: 6,
            NOTICE: 5,
            WARNING: 4,
            ERR: 3,
            CRIT: 2,
            ALERT: 1,
            EMERG: 0,
        },
    };
    this.contextVariables = null;

    this.sensibleProperties = [
        'password',
        'passwd',
        'pwd',
        'token',
        'credit_card',
        'credit-card',
        'creditCard',
        'card_number',
        'card-number',
        'cardNumber',
        'cvv',
        'security_code',
        'security-code',
        'SecurityCode',
        'securityCode',
        'cvc',
        'card',
        'number',
    ];

    this.filterContextVariables = ctxVariables => {
        if (!ctxVariables) {
            return null;
        }
        return Object.keys(ctxVariables).reduce((obj, key) => {
            if (typeof key === 'string' && this.sensibleProperties.includes(key.toLowerCase())) {
                obj[key] = 'XXXXXX';
            } else {
                obj[key] = ctxVariables[key];
            }
            if (typeof ctxVariables[key] === 'object') {
                obj[key] = this.filterContextVariables(ctxVariables[key]);
            }

            return obj;
        }, {});
    };

    this.connect = _hostList => {
        if (_hostList) {
            hostList = _hostList;
        }

        if (this.caller !== this.getInstance) {
            throw new Error('This object cannot be instantiated');
        } else if (hostList) {
            for (let pos = 0; pos < hostList.length; pos += 1) {
                const server = hostList[pos].split(':');
                hostList[pos] = {
                    host: server[0],
                    port: parseInt(server[1], 10),
                };
            }

            this.connector = new Graylog2.graylog({
                servers: hostList,
                facility,
            });

            this.connector.on('error', data => {
                console.error('Error sending log to graylog:', {
                    data,
                    contextVariables: this.contextVariables,
                });
            });
        }
    };

    this.setHostList = list => {
        hostList = list;
    };

    // back compatibility
    this.setAditionalFields = varObj => {
        this.contextVariables = varObj;
    };

    this.connect();

    this.emergency = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.EMERG) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                emergency(fullMsg);
            } else {
                this.connector.emergency(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };

    this.alert = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.ALERT) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                alert(fullMsg);
            } else {
                this.connector.alert(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };

    this.critical = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.CRIT) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                critical(fullMsg);
            } else {
                this.connector.critical(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };

    this.error = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            // debug(msg, data);
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.ERR) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                error(fullMsg);
            } else {
                this.connector.error(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };

    this.warning = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.WARNING) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                warning(fullMsg);
            } else {
                this.connector.warning(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };

    this.warn = (msg, data, ctx) => {
        this.warning(msg, data, ctx);
    };

    this.notice = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            // debug(msg, data);
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.NOTICE) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                notice(fullMsg);
            } else {
                this.connector.notice(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };

    this.info = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.INFO) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

 
            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                info(msg);
            } else {
                this.connector.info(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }

        return null;
    };

    this.log = (msg, data, ctx) => {
        this.info(msg, data, ctx);
    };

    this.debug = (msg, data, ctx) => {
        if (this.connector === null || logLevel === 'NULL') {
            return false;
        }
        const contextVariables = this.filterContextVariables(
            ctx && ctx.contextVariables ? ctx.contextVariables : this.contextVariables,
        );

        if (this.connector.level[logLevel] >= this.connector.level.DEBUG) {
            let fullMsg = msg; // Limit of graylog message length
            if (data) {
                fullMsg = `${msg}\n${JSON.stringify(util.inspect(data), null, 2)}`;
            }

            if (['development', 'test'].indexOf(process.env.NODE_ENV) > -1 || !hostList) {
                debug(fullMsg);
            } else {
                this.connector.debug(msg, fullMsg, contextVariables);
            }
            fullMsg = undefined;
        }
        return null;
    };
    return null;
};

Logger.instance = null;

/**
 * Singleton getInstance definition
 * @return singleton class
 */
Logger.getInstance = function getInstance() {
    if (this.instance === null) {
        this.instance = new Logger();
    }
    return this.instance;
};

module.exports = new Logger();
