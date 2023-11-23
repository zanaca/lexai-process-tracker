'use strict';

const { promisify } = require('util');
const Memcached = require('memcached');
const logger = require('../../logger');

const $$connection = Symbol('connection');
const CHUNK_SIZE = 1e6 - 1; // 1mega, not 1megabyte;
const DEFAULT_MULTI_BATCH_SIZE = 100;
const DEFAULT_MEMCACHED_CONFIG = {
    poolSize: parseInt(process.env.SERVICE_MEMCACHED_POOL_SIZE || 100, 10),
    retries: 2,
    failures: 1,
    reconnect: 5,
    maxValue: parseInt(process.env.SERVICE_MEMCACHED_MAX_VALUE || 1048576, 10),
};

Memcached.prototype.set = promisify(Memcached.prototype.set);
Memcached.prototype.get = promisify(Memcached.prototype.get);
Memcached.prototype.getMulti = promisify(Memcached.prototype.getMulti);
Memcached.prototype.del = promisify(Memcached.prototype.del);

const isChunked = value => Boolean(value && value.$$cache_chunked && value.$$cache_chunked > 0);

async function getChunked(conn, key, value) {
    logger.debug(`Mounting ${value.$$cache_chunked} chunks for ${key}`);

    const chunkKeys = Array.from({
        length: value.$$cache_chunked,
    }).map((_, chunk) => `${key}::chunk${chunk}`);

    logger.debug(`Fetching data for multiple chunk keys ${chunkKeys}`);

    const chunks = await conn.getMulti(chunkKeys);

    const stringChunked = chunkKeys.map(chunkKey => chunks[chunkKey]).join('');

    try {
        return JSON.parse(stringChunked);
    } catch (error) {
        await conn.del(key);

        return undefined;
    }
}

class MemcachedEngine {
    static create(options) {
        return new MemcachedEngine(options);
    }

    constructor(options) {
        this.options = options;
        this.memcachedHostList = options && options.hostList;

        if (!this.memcachedHostList) {
            this.memcachedHostList = process.env.SERVICE_MEMCACHED_HOST_LIST
                ? process.env.SERVICE_MEMCACHED_HOST_LIST.split(',')
                : null;
        }

        if (!this.memcachedHostList) {
            this.memcachedHostList = process.env.MEMCACHED_HOST_LIST
                ? process.env.MEMCACHED_HOST_LIST.split(',')
                : null; // DEPRECATED
        }

        this.connect();
    }

    connect() {
        try {
            this[$$connection] = new Memcached(this.memcachedHostList, {
                ...DEFAULT_MEMCACHED_CONFIG,
                ...this.options,
            });
        } catch (err) {
            logger.error('Error connecing to memcached', { addresses: this.memcachedHostList });
        }
    }

    setMemcachedHostlist(list) {
        this.memcachedHostList = list;
        this.connect();
    }

    async set(key, value, ttl) {
        const serialized = JSON.stringify(value);

        if (serialized.length > CHUNK_SIZE) {
            const chunks = Math.ceil(serialized.length / CHUNK_SIZE);

            if (chunks > 1) {
                logger.debug(`Splitting ${key} in ${chunks} chunks`);

                try {
                    let chunk = chunks - 1;
                    const promises = [];

                    do {
                        logger.debug(`Writing data for key ${key}::chunk${chunk} with ${ttl} TTL`);

                        const chunkData = serialized.substring(
                            CHUNK_SIZE * chunk,
                            CHUNK_SIZE * (chunk + 1),
                        );

                        if (chunkData !== '') {
                            promises.push(
                                this[$$connection].set(`${key}::chunk${chunk}`, chunkData, ttl),
                            );
                        }

                        chunk -= 1;
                    } while (chunk >= 0);

                    const [result] = await Promise.all([
                        this[$$connection].set(
                            key,
                            JSON.stringify({ $$cache_chunked: chunks }),
                            ttl,
                        ),
                        ...promises,
                    ]);

                    return result;
                } catch (err) {
                    logger.warning('Error trying to write chunked data to cache', err);
                }
            }
        }

        return this[$$connection].set(key, serialized, ttl);
    }

    async mset(data, { batchSize = DEFAULT_MULTI_BATCH_SIZE } = {}) {
        const output = [];

        const write = ([key, value, ttl]) =>
            this.set(key, value, ttl).then(result => output.push(result));

        while (data.length > 0) {
            const batch = data.splice(0, batchSize);

            // eslint-disable-next-line
            await Promise.all(batch.map(write));
        }

        return output;
    }

    async get(key) {
        let output = await this[$$connection].get(key);

        if (output === undefined || output === null) return undefined;

        output = JSON.parse(output);

        if (isChunked(output)) {
            output = await getChunked(this[$$connection], key, output);
        }

        return output;
    }

    async mget(keys) {
        const output = await this[$$connection].getMulti(keys);

        keys.forEach(key => {
            if (!output[key]) return;

            output[key] = JSON.parse(output[key]);
        });

        const read = key =>
            getChunked(this[$$connection], key, output).then(value => {
                output[key] = value;
            });

        const chunkedKeys = keys.filter(key => isChunked(output[key]));

        if (chunkedKeys.length > 0) {
            await Promise.all(chunkedKeys.map(read));
        }

        return keys.map(key => output[key]);
    }

    async delete(key) {
        await this[$$connection].del(key);
    }
}

module.exports = MemcachedEngine;
