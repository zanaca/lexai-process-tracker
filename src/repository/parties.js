const loadClass = require('mongoose-class-wrapper');

const mongooseInstance = require('../mongoose');
const partiesSchema = require('./schemas/parties');
const logger = require('../services/logger');
const alphaId = require('../lib/alphaId');

const COLLECTION = 'parties';

let repository = null;
let useMongoReadPref = false;
const parties = new partiesSchema();

module.exports = (mongoose = null) => {
    if (repository !== null) {
        return repository;
    }

    if (!mongoose) {
        mongoose = mongooseInstance;
    }

    parties.schema(mongoose).pre('save', function save(next) {
        if (!this.id) {
            this.id = alphaId.randomId();
        }

        if (!this.created_at) {
            this.created_at = new Date();
        } else {
            this.updated_at = new Date();
        }

        next();
    });

    class partiesModel {
        static useReadPolicy() {
            useMongoReadPref = true;
            return this;
        }

        
        static _find(query, queryParams = {}) {
            let readStrategy = 'primary';
            if (useMongoReadPref) {
                logger.debug(
                    'Using read policy: ' + process.env.MONGO_READPREF
                );
                readStrategy = process.env.MONGO_READPREF || 'primary'; // if doubt, use primary
            }

            const _deleted = {
                $or: [{ deleted: false }, { deleted: { $exists: false } }],
            };
            let search = query;
            if (query) {
                search = { $and: [query, _deleted] };
            } else {
                search = _deleted;
            }

            const dbQuery = this.find(search);
            if (queryParams.select) {
                dbQuery.select(queryParams.select);
            }

            if (queryParams.collation) {
                dbQuery.collation(queryParams.collation);
            }

            if (queryParams.sort) {
                dbQuery.sort(queryParams.sort);
            }

            if (queryParams.page && queryParams.limit) {
                dbQuery.skip((queryParams.page - 1) * queryParams.limit);
            }

            if (queryParams.limit) {
                dbQuery.limit(queryParams.limit);
            }

            const output = dbQuery.read(readStrategy);
            useMongoReadPref = false;

            return output;
        }

        static byPk(primaryKey) {
            let id = primaryKey;
            const ObjectId = mongoose.Types.ObjectId;
            if (String(id).length !== 24) {
                id = '0'.repeat(24 - String(id).length) + id;
            }

            return this._find({ _id: new ObjectId(id) }).exec();
        }
    }

    parties.schema(mongoose).plugin(loadClass, partiesModel);

    repository = mongoose.model(
        COLLECTION,
        parties.schema(mongoose)
    );
    return repository;
};
