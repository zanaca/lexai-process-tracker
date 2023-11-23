let schema = null;

module.exports = class {
    schema(mongoose) {
        if (schema !== null) {
            return schema;
        }

        schema = new mongoose.Schema(
            {
            proc: {
                type: String,
                index: true,
                nullable: false,
            },
            timeline: {
                type: Date,
                index: true,
                nullable: false,
            },
            page: {
                type: Number,
                index: true,
                nullable: false,
            },
            text: String,
            book: {
                type: String,
                index: true,
            },
            origin: String,
            url: String,
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
                proc: 1,
                page: 1,
                timeline: 1,
            },
            {
                unique: true,
            }
        );

        return schema;
    }
};
