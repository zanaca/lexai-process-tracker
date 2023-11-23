let schema = null;

module.exports = class {
    schema(mongoose) {
        if (schema !== null) {
            return schema;
        }

        schema = new mongoose.Schema(
            {
            bookId: {
                type: String,
                index: true,
            },
            content: String,
            pageNumber: { type: Number, index: true },
            pageQty: Number,
        });

        schema.index(
            {
                pageNumber: 1,
                bookId: 1,
            },
            {
                unique: true,
            }
        );
        return schema;
    }
};
