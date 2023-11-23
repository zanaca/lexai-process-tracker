const loadClass = require('mongoose-class-wrapper');

const mongooseInstance = require('../mongoose');
const Timeline = require('./schemas/auctionTimeline');
const logger = require('../services/logger');


const COLLECTION = 'auctionTimeline';


let repository = null;
let useMongoReadPref = false;
const timeline = new Timeline();


module.exports = (mongoose = null) => {
    if (repository !== null) {
        return repository;
    }

    if (!mongoose) {
        mongoose = mongooseInstance;
    }

    timeline.schema(mongoose).pre('save', function save(next) {
        if (!this.createdAt) {
            this.createdAt = new Date();
        } else {
            this.updatedAt = new Date();
        }

        if (!this.deleted) {
            this.deleted = false;
        }

        next();
    });

    class timelineModel {
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

    timeline.schema(mongoose).plugin(loadClass, timelineModel);

    repository = mongoose.model(
        COLLECTION,
        timeline.schema(mongoose)
    );
    return repository;
};
