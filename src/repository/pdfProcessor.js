const loadClass = require('mongoose-class-wrapper');

const mongooseInstance = require('../mongoose');
const PdfProcessor = require('./schemas/pdfProcessor');
const logger = require('../services/logger')

const COLLECTION = 'pdfProcessor';

let repository = null;
let useMongoReadPref = false;
const pdfProcessor = new PdfProcessor();

module.exports = (mongoose = null) => {
    if (repository !== null) {
        return repository;
    }

    if (!mongoose) {
        mongoose = mongooseInstance;
    }

    // pdfProcessor.schema(mongoose).pre('save', function save(next) {
    //     if (!this.id) {
    //         this.id = `${this.origin}_${alphaId.randomId()}`;
    //     }

    //     if (!this.created_at) {
    //         this.created_at = new Date();
    //     } else {
    //         this.updated_at = new Date();
    //     }

    //     next();
    // });

    class pdfProcessorModel {
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

        static addPage({pageNumber, bookId, content, pageQty} = {}) {
            if (!content) {
                throw new Error(`Content is required for page ${pageNumber} of book ${bookId}`);
            }
            const page = new repository();
            page.pageNumber = pageNumber;
            page.pageQty = pageQty;
            page.bookId = bookId;
            page.content = content;

            return page.save();
        }

        static async isBookCompleted({bookId, qty = 1e6} = {}) {
            const count = await this.countDocuments({bookId}).exec();

            return count === qty;
        }

        static async getBook(bookId) {
            const pages = await this._find({bookId}).sort({pageNumber: 1}).exec();
            let output = '';
            for (const page of pages) {
                output += "\n\n" + page.content.trim();
            }

            return output;
        }
        
        static async removeBook(bookId) {
            console.log(bookId)
            return await this.deleteMany({bookId}).exec();
        }

    }

    pdfProcessor.schema(mongoose).plugin(loadClass, pdfProcessorModel);

    repository = mongoose.model(
        COLLECTION,
        pdfProcessor.schema(mongoose)
    );
    return repository;
};
