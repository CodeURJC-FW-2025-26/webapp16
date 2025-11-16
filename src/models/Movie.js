import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema({
    Title: {
        type: String,
        required: true,
        unique: true 
    },
    description: {
        type: String,
        required: true
    },
    Realase_year: {
        type: String,
        required: true
    },
    Gender: {
        type: String
    },
    Calification: {
        type: String
    },
    Age_classification: {
        type: String
    },
    Director: {
        type: String
    },
    Casting: {
        type: String
    },
    Duration: {
        type: String
    },
    image_file: {
        type: String
    },
    comentary: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comentary'
    }]

   });

const Movie = mongoose.model('Movie', movieSchema, 'Softflix');

export default Movie;