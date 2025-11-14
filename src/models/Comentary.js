import mongoose from 'mongoose';

const comentarySchema = new mongoose.Schema({
    User_name: {
        type: String,
        require: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    Rating: {
        type: String
    },
})