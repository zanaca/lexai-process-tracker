let schema = null;

module.exports = class {
    schema(mongoose) {
        if (schema !== null) {
            return schema;
        }

        schema = new mongoose.Schema({
            id: {
                type: String,
                index: true,
                unique: true,
            },
            document: String,
            documentType: {
                type: String,
                enum: [
                    'CPF',
                    'CNPJ',
                    'RG',
                    'CNH',
                    'PASSPORT',
                    'OAB',
                    'OTHER'
                ],
            },
            name: {
                type: String,
                index: true
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

        schema.index(
            {
                documentType: 1,
                document: 1,
            },
            {
                unique: true,
                index: true,
            }
        );
        return schema;
    }
};