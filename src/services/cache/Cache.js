'use strict';

const { inspect } = require('util');
const loggerService = require('../logger');
const npmPackage = require('../../../package.json');
const engines = require('./engines');

const TYPE_MEMCACHE = 'memcached';
const TYPE_MEMORY = 'memory';
const TYPE_REDIS = 'redis';

const DEFAULT_TTL = parseInt(process.env.SERVICE_CACHE_DEFAULT_TTL, 10) || 180; // 3min
const CACHE_IMPLEMENTATION_VERSION = 2;
const DEFAULT_KEY_PREFIX = `HUMicroservices::v${
    npmPackage.version.split('.')[0]
}.${CACHE_IMPLEMENTATION_VERSION}`;

let typeDefault = TYPE_MEMCACHE;

switch (process.env.SERVICE_CACHE_ENGINE) {
    case 'MEMORY':
        typeDefault = TYPE_MEMORY;
        break;

    case 'REDIS':
        typeDefault = TYPE_REDIS;
        break;

    case 'MEMCACHED':
    default:
        typeDefault = TYPE_MEMCACHE;
        break;
}

const makeKey = (prefix, key) => `${prefix}::${key}`;

const normalizeMSetEntry = (prefix, defaultTTL) => entry => {
    if (!Array.isArray(entry)) {
        const { key, value, ttl = defaultTTL } = entry;

        return [makeKey(prefix, key), value, ttl];
    }

    const [key, value, ttl = defaultTTL] = entry;

    return [makeKey(prefix, key), value, ttl];
};

class Cache {
    static memory() {
        return TYPE_MEMORY;
    }

    static memcache() {
        return TYPE_MEMCACHE;
    }

    static redis() {
        return TYPE_REDIS;
    }

    constructor(type, options) {
        this.options = options;
        this.logger =
            options && options.ctx && options.ctx.logger ? options.ctx.logger : loggerService;
        this.keyPrefix = options && options.keyPrefix ? options.keyPrefix : DEFAULT_KEY_PREFIX;
        this.defaultTTL = options && options.defaultTTL ? options.defaultTTL : DEFAULT_TTL;
        this.disabled = false;

        this.connect(type, options && options[type || typeDefault]);
    }

    connect(type = typeDefault, engineOptions) {
        if (type === this.type) return;

        this.type = type;

        const Engine = engines[this.type];

        if (!Engine || typeof Engine.create !== 'function') {
            throw new Error(`Cache engine '${this.type}' is not supported`);
        }

        this.engine = Engine.create(engineOptions);
    }

    setMemcachedHostlist(list) {
        this.connect(TYPE_MEMCACHE);

        this.engine.setMemcachedHostlist(list);
    }

    disableCache() {
        this.disabled = true;
    }

    enableCache() {
        this.disabled = false;
    }

    async set(_key, value, _ttl = this.defaultTTL) {
        const { logger } = this;

        if (this.disabled) {
            logger.debug('Caching system was disabled in runtime');
            return false;
        }

        if (value === undefined) {
            logger.debug('Trying to cache undefined value');
            return false;
        }

        let ttl = _ttl;

        if (ttl < 0) {
            const msg = 'TTL must be greater than zero';

            logger.warn(msg);

            throw new Error(msg);
        }

        // Changing ttl in +/- 3s so the server will not be hammered
        if (ttl > 3) {
            ttl += Math.floor(Math.random() * 6) - 2;
        }

        const key = makeKey(this.keyPrefix, _key);

        logger.debug(`Writing data for key ${key} with ${ttl} TTL`);

        try {
            return await this.engine.set(key, value, ttl);
        } catch (err) {
            logger.warn('Error writing to cache', {
                err: inspect(err),
                key,
                value,
            });

            return false;
        }
    }

    async mset(_data) {
        const { logger } = this;

        if (!Array.isArray(_data)) {
            throw new Error('An array of entries must be provided');
        }

        if (this.disabled) {
            logger.debug('Caching system was disabled in runtime');
            return false;
        }

        const data = _data.map(normalizeMSetEntry(this.keyPrefix, this.defaultTTL));

        logger.debug(
            `Writing multiple values for keys/TTL ${data.map(([key, , ttl]) => `${key}/${ttl}`)}`,
        );

        try {
            return await this.engine.mset(data);
        } catch (err) {
            logger.warn('Error writing multiple values to cache', {
                err: inspect(err),
                data,
            });

            return false;
        }
    }

    async get(_key) {
        const { logger } = this;

        if (this.disabled) {
            logger.debug('Caching system was disabled in runtime');
            return false;
        }

        const key = makeKey(this.keyPrefix, _key);

        let output;

        try {
            logger.debug(`Fetching data for key ${key}`);

            output = await this.engine.get(key);
        } catch (err) {
            logger.warning(`Error fetching key ${key}`, err);
        }

        logger.notice(output ? 'Cache hit' : 'Cache miss', { key });

        return output;
    }

    async mget(keys) {
        const { logger } = this;

        if (!Array.isArray(keys)) {
            throw new Error('An array of keys must be provided');
        }

        if (this.disabled) {
            logger.debug('Caching system was disabled in runtime');
            return false;
        }

        const fullKeys = keys.map(key => makeKey(this.keyPrefix, key));

        try {
            logger.debug(`Fetching data for multiple keys ${fullKeys}`);

            return await this.engine.mget(fullKeys);
        } catch (err) {
            logger.warning(`Error fetching multiple keys ${fullKeys}`, err);

            return false;
        }
    }

    async delete(_key) {
        const { logger } = this;

        if (this.disabled) {
            logger.debug('Caching system was disabled in runtime');
            return false;
        }

        const key = makeKey(this.keyPrefix, _key);

        logger.debug(`Deleting data for key ${key}`);

        try {
            await this.engine.delete(key);
        } catch (err) {
            logger.warning(`Error while deleting data for key ${key}`, err);
        }

        return undefined;
    }
}

module.exports = Cache;
