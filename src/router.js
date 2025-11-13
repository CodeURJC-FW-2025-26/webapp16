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


router.post("/addFilm", (req, res) => {
  // Temporary handler for quick testing without DB/multer.
  // It logs the received body and returns a simple confirmation.
  console.log('POST /addFilm body:', req.body);
  res.send('Formulario recibido. Revisa la consola del servidor para ver los datos.');
});



export default router;