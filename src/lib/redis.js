'use strict';

const redis = require('async-redis');

let client = null;

function init() {
    if (client) {
        return client;
    }

    client = redis.createClient({
        url: process.env.SERVICE_REDIS_CONNECT_URL,
        retry_strategy: options => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
                return new Error('Redis server refused the connection');
            }
            if (options.total_retry_time > parseInt(process.env.SERVICE_REDIS_TIMEOUT || 1e4, 10)) {
                return new Error('Redis connection timeout');
            }
            if (options.attempt > 10) {
                // I quit!
                return undefined;
            }

            return Math.min(options.attempt * 100, 3000);
        },
    });

    return client;
}

module.exports = {
    client: init,
};
