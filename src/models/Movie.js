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
    Gender: [{
        type: String
    }],
    Calification: {
        type: String
    },
    Age_classification: {
        type: String
    },
    Director: {
        type: String
    },
    Casting: [{
        type: String
    }],
    Duration: {
        type: String
    },
    image_file: {
        type: String
    },


    cover_image: {
        type: String,
    },

    title_image: {
        type: String,
    },
    film_image: {
        type: String,
    },

    director_image: {  
        type: String,
    },
    actor1_image: {
        type: String,
    },
    actor2_image: {
        type: String,
    },
    actor3_image: {
        type: String,
    },
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comentary'
    }]

   });

const Movie = mongoose.model('Movie', movieSchema, 'Softflix');

export default Movie;