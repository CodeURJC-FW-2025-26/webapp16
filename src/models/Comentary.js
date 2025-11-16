import mongoose from 'mongoose';

const comentarySchema = new mongoose.Schema({
    User_name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    Rating: {
        type: Number,
        min: 1,
        max: 10
    },
    movieId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Movie',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Comentary = mongoose.model('Comentary', comentarySchema, 'comentaries');

export default Comentary;