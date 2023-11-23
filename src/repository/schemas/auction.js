let schema = null;
const partiesSchema = require('./parties');

// const INSTANCE_1 = '1a';
// const INSTANCE_2 = '2a';
// const INSTANCE_3 = '3a';

// const INSTANCES_LIST = [INSTANCE_1, INSTANCE_2, INSTANCE_3];

module.exports = class {

    instances() {
        return INSTANCES_LIST;
    }

    schema(mongoose) {
        if (schema !== null) {
            return schema;
        }

        mongoose.model('Parties', new partiesSchema());

        schema = new mongoose.Schema({
            id: {
                type: String,
                index: true,
            },
            source: {
                type: String,
                index: true,
            },
            proc: {
                type: String,
                index: true,
                unique: true,                
            },
            title: String,
            amount: Number,
            subjects: [String],
            defendant: [{ //réu
                type: mongoose.Schema.Types.ObjectId,
                ref: "Parties",
                index: true,
            }],
            plaintiff: [{ // autor
                type: String,
                index: true,
            }],
            date: Date,
            court: {
                type: String,
                index: true,
            },
            instance: {
                type: String,
                index: true,
                // enum: instances,
                // default: instances[0],
            },

            deleted: {
                type: Boolean,
                index: true,
            },
            createdAt: {
                type: Date,
                index: true,
            },
            updatedAt: {
                type: Date,
                index: true,
            }
        });

        return schema;
    }
};