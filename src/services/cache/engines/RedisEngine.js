'use strict';

const $$connection = Symbol('connection');
const redis = require('../../../lib/redis');

class RedisEngine {
    static create(options) {
        return new RedisEngine(options);
    }

    constructor() {
        this[$$connection] = redis.client();
    }

    async set(key, value, ttl) {
        return this[$$connection].set(key, JSON.stringify(value), 'EX', ttl);
    }

    async mset(data) {
        const actions = this[$$connection].multi();

        data.forEach(([key, value, ttl]) => {
            actions.set(key, JSON.stringify(value), 'EX', ttl);
        });

        return actions.exec();
    }

    async get(key) {
        const output = await this[$$connection].get(key);

        if (output === undefined || output === null) return undefined;

        return JSON.parse(output);
    }

    async mget(keys) {
        const output = await this[$$connection].mget(keys);

        return output.map(value => value && JSON.parse(value));
    }

    async delete(key) {
        await this[$$connection].del(key);
    }
}

module.exports = RedisEngine;
