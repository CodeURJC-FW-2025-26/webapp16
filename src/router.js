import express from 'express';
import { Collection } from 'mongodb';
const router = express.Router();

router.get('/', (req, res) => {
    res.render('indice');
});

router.get('/otra-ruta', (req, res) => {
    res.render('indice', {
        titulo: 'Mi Página',
        mensaje: 'Bienvenido a mi sitio'
    });
});


router.post('/addFilm', async (req, res) => {
    let movies = await Collection.insertOne({ 
        title: req.body.title,
        description: req.body.description,
        releaseYear: req.body.releaseYear,
        genre: req.body.genre,
        rating: req.body.rating,
        ageClassification: req.body.ageClassification,
        director: req.body.director,
        cast: req.body.cast,
        duration: req.body.duration,
        language: req.body.language,

    });
    res.json({ message: 'Film added successfully', movie: movies
    });

});

export default router;