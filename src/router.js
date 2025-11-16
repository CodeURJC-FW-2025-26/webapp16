import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

const router = express.Router();

// ----------------------------------------------------
// 🛠️ Middleware para Subida (Corrige ReferenceError)
// ----------------------------------------------------
const uploadMiddleware = (req, res, next) => {
    const uploadHandler = req.app.locals.upload.single('directorImage');

    uploadHandler(req, res, (err) => {
        if (err) {
            console.error("❌ ERROR de Multer durante la subida:", err);
            return res.status(500).send("Error al subir el archivo.");
        }
        next();
    });
};


router.get('/', (req, res) => {
    res.redirect('/indice');
});

// ----------------------------------------------------
// ➡️ Ruta Principal de Películas (Indice)
// ----------------------------------------------------

const ITEMS_PER_PAGE = 6;

router.get('/indice', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 1. Obtener parámetros de query
        const currentPage = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search ? req.query.search.trim() : null;
        const filterGenre = req.query.genre ? req.query.genre.trim() : null;

        // 2. Construir el objeto de consulta (query)
        const query = {};

        if (searchQuery) {
            query.title = { $regex: new RegExp(searchQuery, 'i') };
        }

        if (filterGenre && filterGenre !== 'Todos') {
            query.genre = filterGenre;
        }

        // 3. Obtener datos de la base de datos
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;
        const films = await collection.find(query)
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        const totalFilms = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalFilms / ITEMS_PER_PAGE);

        // 4. Obtener todos los géneros únicos para los botones de filtro
        // 🚨 CAMBIO CLAVE: Utilizamos $unwind y $group para obtener los géneros únicos.
        const allGenres = await collection.aggregate([
            { $unwind: "$genre" },
            { $group: { _id: "$genre" } },
            { $sort: { _id: 1 } }
        ]).toArray();

        // 5. Preparar la lista de géneros para Mustache
        const genres = allGenres.map(g => {
            const genreName = g._id;
            // Construir la URL manteniendo el término de búsqueda
            let url = `/indice?genre=${encodeURIComponent(genreName)}`;
            if (searchQuery) {
                url += `&search=${encodeURIComponent(searchQuery)}`;
            }

            return {
                name: genreName,
                url: url,
                // CLAVE: Establecer isActive a true si este género coincide con el filtro actual
                isActive: genreName === filterGenre
            };
        });

        // 6. Configuración de paginación (DEBE VENIR DESPUÉS DE OBTENER TODOS LOS DATOS)
        const pagination = [];
        for (let i = 1; i <= totalPages; i++) {
            // Construir la URL de paginación manteniendo filtro y búsqueda
            let pageUrl = `/indice?page=${i}`;
            if (filterGenre) {
                pageUrl += `&genre=${encodeURIComponent(filterGenre)}`;
            }
            if (searchQuery) {
                pageUrl += `&search=${encodeURIComponent(searchQuery)}`;
            }

            pagination.push({
                page: i,
                url: pageUrl,
                isCurrent: i === currentPage
            });
        }

        // 7. Renderizar
        res.render('indice', {
            films,
            genres, // Lista de géneros con isActive y url
            currentSearch: searchQuery,
            currentFilter: filterGenre,

            // Variables de Paginación
            hasPagination: totalPages > 1,
            pagination,
            isPrevDisabled: currentPage === 1,
            prevUrl: `/indice?page=${currentPage - 1}${filterGenre ? `&genre=${filterGenre}` : ''}${searchQuery ? `&search=${searchQuery}` : ''}`,
            isNextDisabled: currentPage === totalPages,
            nextUrl: `/indice?page=${currentPage + 1}${filterGenre ? `&genre=${filterGenre}` : ''}${searchQuery ? `&search=${searchQuery}` : ''}`,
        });

    } catch (err) {
        console.error('❌ ERROR en ruta /indice:', err.message);
        res.status(500).send('Error interno del servidor.');
    }
});


// ----------------------------------------------------
// ➡️ Ruta de Detalle (Ej)
// ----------------------------------------------------
router.get('/Ej/:movieId', async (req, res) => {
    // 1. Obtener ID y validar
    const movieId = req.params.movieId;
    if (!movieId || !ObjectId.isValid(movieId)) {
        return res.status(400).send("ID de película no válido.");
    }

    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 2. Buscar la película por su ID
        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send(`Película con ID ${movieId} no encontrada.`);
        }

        // 3. Simular la imagen secundaria (ruta corregida)
        let secondaryImage = null;
        if (film.directorImagePath) {
            // Ruta de ejemplo: /Uploads/Interstellar/INTERESTELLAR.png
            const parts = film.directorImagePath.split('/');
            const folder = parts[parts.length - 2];
            // 🚨 CORRECCIÓN CLAVE: Usamos la ruta /Uploads/ para todas las imágenes estáticas.
            secondaryImage = `/Uploads/${folder}/Interestellartitulo.png`;
        }

        // 4. Renderizar la vista 'Ej'
        res.render('Ej', {
            film: film,
            ...film,
            secondaryImage: secondaryImage
        });

    } catch (err) {
        console.error('❌ ERROR al cargar el detalle de la película:', err.message);
        res.status(500).send('Error interno del servidor.');
    }
});


// ----------------------------------------------------
// ➡️ Ruta de Añadir Película (Add)
// ----------------------------------------------------
router.get('/add', (req, res) => {
    res.render('add', {});
});


router.post('/add', uploadMiddleware, async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No se ha subido ningún archivo.');
    }

    const { title, description, releaseYear, genre, rating, ageClassification, director, cast, duration } = req.body;

    const directorImagePath = `/Uploads/${req.file.filename}`;

    const newFilm = {
        title,
        description,
        releaseYear: parseInt(releaseYear),
        genre: Array.isArray(genre) ? genre : [genre],
        rating: parseFloat(rating),
        ageClassification: parseInt(ageClassification),
        director,
        cast: Array.isArray(cast) ? cast : [cast],
        duration,
        directorImagePath,
        reviews: []
    };

    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');
        await collection.insertOne(newFilm);
        res.redirect('/indice');
    } catch (err) {
        console.error('❌ ERROR al guardar comentario:', err);
        res.status(500).send(`Error al guardar comentario: ${err.message}`);
    }
});


// ----------------------------------------------------
// ➡️ Ruta de Añadir Review
// ----------------------------------------------------
router.post('/Ej/:movieId/addReview', async (req, res) => {
    const movieId = req.params.movieId;
    const { userName, rating, reviewText } = req.body;

    // Validar ID
    if (!movieId || !ObjectId.isValid(movieId)) {
        return res.status(400).send("ID de película no válido.");
    }

    // Crear el objeto de la nueva reseña
    const newReview = {
        userName,
        rating: parseFloat(rating),
        text: reviewText,
        date: new Date()
    };

    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // Agregar la reseña al array 'reviews'
        await collection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { reviews: newReview } }
        );

        // Redirigir de vuelta a la página de detalles
        res.redirect(`/Ej/${movieId}`);
    } catch (err) {
        console.error('❌ ERROR al añadir reseña:', err.message);
        res.status(500).send('Error al guardar la reseña.');
    }
});


router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        if (!movieId) return res.status(400).send('movieId es requerido');

        const db = req.app.locals.db;
        if (!db) return res.status(500).send('Database not initialized');

        const moviesColl = db.collection('Softflix');
        const commentsColl = db.collection('comentaries');

        const oid = new ObjectId(movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Película no encontrada');

        // Eliminar archivos asociados (si existen)
        // Asume rutas tipo '/Uploads/filename' o '/Uploads/folder/filename'
        const possiblePaths = [];
        if (movie.directorImagePath) possiblePaths.push(movie.directorImagePath);
        if (movie.image_file) possiblePaths.push(movie.image_file);
        // Normalizar y eliminar cada archivo si existe
        for (const rel of possiblePaths) {
            if (!rel) continue;
            const relClean = rel.replace(/^\//, '');
            const fullPath = path.join(process.cwd(), 'Public', relClean);
            try {
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log(`Archivo eliminado: ${fullPath}`);
                }
            } catch (e) {
                console.warn('No se pudo eliminar archivo:', fullPath, e.message);
            }
        }

        // Eliminar comentarios asociados
        await commentsColl.deleteMany({ movieId: oid });

        // Finalmente, eliminar la película
        await moviesColl.deleteOne({ _id: oid });

        console.log(`Película ${movieId} y sus comentarios eliminados.`);
        return res.redirect('/indice');
    } catch (err) {
        console.error('Error al borrar película:', err);
        return res.status(500).send('Error al borrar la película');
    }
});

export default router;
