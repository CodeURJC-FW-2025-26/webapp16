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


router.post("/addFilm", async (req, res) => {
    try {
        // build movie object from form fields
        const movie = {
            title: req.body.title,
            description: req.body.description,
            releaseYear: req.body.releaseYear,
            genre: req.body.genre || [],
            rating: req.body.rating,
            ageClassification: req.body.ageClassification,
            director: req.body.director,
            cast: req.body.cast,
            duration: req.body.duration,
            language: req.body.language || []
        };

        // ensure genres/language are arrays when multiple values are sent
        if (typeof movie.genre === 'string') movie.genre = [movie.genre];
        if (typeof movie.language === 'string') movie.language = [movie.language];

        console.log('Inserting movie:', movie);
        const db = req.app.locals.db;
        if (!db) {
            console.error('Database not initialized on app.locals.db');
            return res.status(500).send('Database not initialized');
        }

        const result = await db.collection('films').insertOne(movie);
        console.log('Insert result:', result.insertedId);
        res.send(`Pelicula guardada con id ${result.insertedId}`);
    } catch (err) {
        console.error('Error in /addFilm:', err);
        res.status(500).send('Error al guardar la película');
    }
});



export default router;