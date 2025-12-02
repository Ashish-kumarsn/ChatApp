const mongoose = require('mongoose');

const connectDb = async () => {
    try {
        
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('Error connecting database', error.message);
        process.exit(1);
    }
};

module.exports = connectDb;
