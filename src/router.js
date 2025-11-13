// ...existing code...
import express from 'express';

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
        if (!req.body) {
            return res.status(400).send('No se recibió cuerpo (req.body) en la solicitud');
        }

        const movie = {
            title: req.body.title,
            description: req.body.description,
            releaseYear: req.body.releaseYear ? Number(req.body.releaseYear) : undefined,
            genre: req.body.genre || [],
            rating: req.body.rating ? Number(req.body.rating) : undefined,
            ageClassification: req.body.ageClassification,
            director: req.body.director,
            cast: req.body.cast || [],
            duration: req.body.duration ? Number(req.body.duration) : undefined,
            language: req.body.language || []
        };

        if (typeof movie.genre === 'string') movie.genre = movie.genre.split(',').map(s => s.trim()).filter(Boolean);
        if (typeof movie.language === 'string') movie.language = movie.language.split(',').map(s => s.trim()).filter(Boolean);
        if (typeof movie.cast === 'string') movie.cast = movie.cast.split(',').map(s => s.trim()).filter(Boolean);

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
// ...existing code...
