'use strict';

const $$storage = Symbol('storage');

class MemoryEngine {
    static create(options) {
        return new MemoryEngine(options);
    }

    constructor() {
        this[$$storage] = {};
    }

    async set(key, value, ttl) {
        this[$$storage][key] = JSON.stringify(value);

        return setTimeout(() => delete this[$$storage][key], ttl * 1000);
    }

    async mset(data) {
        const results = data.map(([key, value, ttl]) => this.set(key, value, ttl));

        return Promise.all(results);
    }

    async get(key) {
        const output = this[$$storage][key];

        if (output === undefined || output === null) return undefined;

        return JSON.parse(output);
    }

    async mget(keys) {
        const values = await Promise.all(keys.map(key => this.get(key)));

        return keys.map((_, index) => values[index]);
    }

    async delete(key) {
        delete this[$$storage][key];
    }
}

module.exports = MemoryEngine;
