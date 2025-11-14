import express from 'express';
import * as fs from 'fs'; // Necesitas fs para borrar el archivo si falla la DB

const router = express.Router();

// ... (otras rutas get) ...

router.post("/addFilm", (req, res) => { // La ruta principal NO es async

    // 1. Obtiene el middleware de Multer. 'foto' debe coincidir con el name="" del input.
    const uploadMiddleware = req.app.locals.upload.single('foto');

    // 2. Ejecuta Multer. Toda la lógica de la DB va dentro de esta callback.
    uploadMiddleware(req, res, async (err) => { // La callback SÍ es async

        // --- MANEJO DE ERRORES DE MULTER ---
        if (err) {
            console.error('❌ ERROR de Subida de Archivos (Multer):', err);
            // Envía una respuesta al cliente
            return res.status(500).send(`Error al procesar el archivo: ${err.message}`);
        }

        // --- LÓGICA DE LA BASE DE DATOS (Solo se ejecuta si Multer tuvo éxito) ---
        try {
            if (!req.body) {
                return res.status(400).send('No se recibió cuerpo (req.body) en la solicitud');
            }

            // Console.log para depuración.
            console.log('Datos de formulario recibidos:', req.body);
            console.log('Información del archivo:', req.file); // req.file es donde Multer guarda los datos del archivo

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
                language: req.body.language || [],

                // Añade la ruta del archivo subido
                directorImagePath: req.file ? `/Uploads/${req.file.filename}` : null,
            };

            // Conversión de arrays
            if (typeof movie.genre === 'string') movie.genre = movie.genre.split(',').map(s => s.trim()).filter(Boolean);
            if (typeof movie.language === 'string') movie.language = movie.language.split(',').map(s => s.trim()).filter(Boolean);
            if (typeof movie.cast === 'string') movie.cast = movie.cast.split(',').map(s => s.trim()).filter(Boolean);

            console.log('🚀 Insertando película:', movie);

            const db = req.app.locals.db;
            if (!db) {
                console.error('Database not initialized on app.locals.db');
                return res.status(500).send('Database not initialized');
            }

            const result = await db.collection('Softflix').insertOne(movie);

            // Redirecciona al éxito
            res.redirect('/indice');

        } catch (dbErr) {
            console.error('❌ ERROR en la inserción (DB/Lógica):', dbErr);

            // Borra el archivo subido si falla la inserción en la DB
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).send(`Error al guardar la película: ${dbErr.message}`);
        }
    });
});

export default router;
