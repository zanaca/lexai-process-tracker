const mongoose = require('mongoose');
const merge = require('mongoose-merge-plugin');
const bigDecimal = require('mongoose-big-decimal');
const logger = require('./services').logger;

let instance = null;

if (instance === null) {
    bigDecimal(mongoose);
    mongoose.plugin(merge);
    const options = {
        readPreference: process.env.MONGO_READPREF || 'primary',
    };

    mongoose.connect(process.env.SERVICE_MONGO_URI, options);
    instance = mongoose;

    instance.connection.on('disconnected', function disconnected() {
        instance = null;
        logger.warn('Marcador: Mongo disconnected');
        // throw new Error('mongo disconnected');
    });
}

module.exports = instance;
