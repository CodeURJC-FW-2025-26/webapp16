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

    let movie = {
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
    };

  await req.app.locals.db.collection("films").insertOne(movie);
  res.render("Formulario", { mensaje: "Película agregada correctamente" });

  }); 



export default router;