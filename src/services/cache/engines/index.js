'use strict';

const MemoryEngine = require('./MemoryEngine');
const MemcachedEngine = require('./MemcachedEngine');
const RedisEngine = require('./RedisEngine');

module.exports = {
    memory: MemoryEngine,
    memcached: MemcachedEngine,
    redis: RedisEngine,
};
