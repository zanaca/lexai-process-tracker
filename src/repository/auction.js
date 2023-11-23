const loadClass = require('mongoose-class-wrapper');

const mongooseInstance = require('../mongoose');
const laSchema = require('./schemas/auction');
const logger = require('../services/logger');
const alphaId = require('../lib/alphaId');

const COLLECTION = 'auction';


let repository = null;
let useMongoReadPref = false;
const legalAuction = new laSchema();

module.exports = (mongoose = null) => {
    if (repository !== null) {
        return repository;
    }

    if (!mongoose) {
        mongoose = mongooseInstance;
    }

    legalAuction.schema(mongoose).pre('save', function save(next) {
        if (!this.id) {
            this.id = alphaId.randomId();
        }

        if (!this.source) {
            throw new Error('Source is required');
        }

        if (!this.created_at) {
            this.created_at = new Date();
        } else {
            this.updated_at = new Date();
        }

        next();
    });

    class legalAuctionModel {
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

        static byItinerary(origin, destination, nights) {
            return this._find({ origin, destination, nights }).exec();
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

    legalAuction.schema(mongoose).plugin(loadClass, legalAuctionModel);

    repository = mongoose.model(
        COLLECTION,
        legalAuction.schema(mongoose)
    );
    return repository;
};
