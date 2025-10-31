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

export default router;