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


router.post('/addFilm', (req, res) => {
    const { title, description, releaseYear } = req.body;
    console.log('Título:', title);
    console.log('Descripción:', description);
    console.log('Año de lanzamiento:', releaseYear);
    res.send('Film added successfully');
});

export default router;