import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

const router = express.Router();

router.get('/', (req, res) => {
    res.redirect('/indice');
});

// ----------------------------------------------------
// ➡️ Ruta Principal de Películas (Indice)
// ----------------------------------------------------

// Lógica de paginación y filtrado (simplificada para el ejemplo)
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
            // Búsqueda insensible a mayúsculas/minúsculas en el campo 'title'
            query.title = { $regex: new RegExp(searchQuery, 'i') };
        }

        if (filterGenre && filterGenre !== 'Todos') {
            // Filtra por género dentro del array 'genre'
            query.genre = filterGenre;
        }

        // 3. Obtener el total de documentos para la paginación
        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        // 4. Calcular el offset
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        // 5. Obtener las películas de la página actual
        const films = await collection.find(query)
            .sort({ releaseYear: -1 }) // Opcional: ordenar por año de estreno
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // 6. Generar enlaces de paginación
        const paginationLinks = [];
        const baseUrl = `/indice?${searchQuery ? `search=${encodeURIComponent(searchQuery)}&` : ''}${filterGenre ? `genre=${encodeURIComponent(filterGenre)}&` : ''}`;

        for (let i = 1; i <= totalPages; i++) {
            paginationLinks.push({
                page: i,
                url: `${baseUrl}page=${i}`,
                isCurrent: i === currentPage
            });
        }

        // 7. Generar URLs para Anterior y Siguiente
        const prevPage = Math.max(1, currentPage - 1);
        const nextPage = Math.min(totalPages, currentPage + 1);

        // 8. Obtener la lista de géneros disponibles para los botones de filtro
        const genresCursor = await collection.aggregate([
            { $unwind: "$genre" },
            { $group: { _id: "$genre" } },
            { $sort: { _id: 1 } }
        ]).toArray();

        const availableGenres = genresCursor.map(g => ({
            name: g._id,
            isActive: g._id === filterGenre,
            // URL que mantiene la búsqueda y aplica el filtro
            url: `/indice?genre=${encodeURIComponent(g._id)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`
        }));

        // 9. Renderizar la vista
        res.render("indice", {
            films: films,
            pagination: paginationLinks,
            hasPagination: totalPages > 1,
            // Navegación Anterior/Siguiente
            prevUrl: `${baseUrl}page=${prevPage}`,
            nextUrl: `${baseUrl}page=${nextPage}`,
            isPrevDisabled: currentPage <= 1,
            isNextDisabled: currentPage >= totalPages,
            // Estado del Buscador/Filtro
            currentSearch: searchQuery,
            currentFilter: filterGenre,
            genres: availableGenres
        });

    } catch (err) {
        console.error('❌ ERROR al obtener datos del índice:', err);
        res.status(500).send('Error al cargar la página principal.');
    }
});

router.post("/addFilm", (req, res) => {

    const uploadMiddleware = req.app.locals.upload.single('foto');

    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('❌ ERROR de Subida de Archivos (Multer):', err);
            return res.status(500).send(`Error al procesar el archivo: ${err.message}`);
        }
        try {
            if (!req.body) {
                return res.status(400).send('No se recibió cuerpo (req.body) en la solicitud');
            }
            console.log('Datos de formulario recibidos:', req.body);
            console.log('Información del archivo:', req.file);

            // CLAVE MODIFICADA: La ruta de la imagen subida debe ser /Uploads/nombreDeArchivo
            const directorImagePath = req.file ? `/Uploads/${req.file.filename}` : null;

            const movie = {
                title: req.body.title,
                description: req.body.description,
                releaseYear: req.body.releaseYear ? Number(req.body.releaseYear) : undefined,
                genre: req.body.genre || [],
                rating: req.body.rating ? Number(req.body.rating) : undefined,
                ageClassification: req.body.ageClassification,
                director: req.body.director,
                cast: req.body.cast,
                duration: req.body.duration,
                directorImagePath: directorImagePath, // <-- RUTA CORREGIDA
                comentary: [] // Asegúrate de inicializar el array de comentarios
            };

            const db = req.app.locals.db;
            const collection = db.collection('Softflix');
            await collection.insertOne(movie);

            res.redirect('/indice');

        } catch (err) {
            // ... (Manejo de errores si falla la base de datos)
            if (req.file) {
                fs.unlink(req.file.path, (unlinkErr) => {
                    if (unlinkErr) console.error('Error al borrar archivo subido:', unlinkErr);
                });
            }
            console.error('❌ ERROR al insertar película en la base de datos:', err);
            res.status(500).send(`Error al guardar la película: ${err.message}`);
        }
    });
});

// ... (rest of router.js, including /indice route)

// Ruta de detalle de película
router.get("/ej", async (req, res) => {
    const movieId = req.query.id; // Asume que ahora usas una query string, no un parámetro de URL

    if (!movieId) {
        // Redirige al primer registro si no se proporciona ID
        // Esto es útil si solo quieres ver la página de ejemplo, pero puede ser mejor
        // redirigir a /indice o a una página de error en una app real.
        try {
            const db = req.app.locals.db;
            const collection = db.collection('Softflix');
            const firstFilm = await collection.findOne({});
            if (firstFilm) {
                // Usa el ID del primer registro para continuar
                return res.redirect(`/ej?id=${firstFilm._id}`);
            }
            return res.status(400).send("ID de película no proporcionado y no hay películas cargadas en la DB.");
        } catch (err) {
            return res.status(500).send(`Error al buscar la película de ejemplo: ${err.message}`);
        }
    }

    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 2. Buscar la película por su ID
        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send(`Película con ID ${movieId} no encontrada.`);
        }

        // 3. Simular la imagen secundaria (ajustada para el nuevo esquema /Uploads/)
        let secondaryImage = null;
        if (film.directorImagePath) {
            // Ejemplo: /Uploads/Interstellar/interstellar.jpg -> obtenemos 'Interstellar'
            const parts = film.directorImagePath.split('/');
            const folder = parts[parts.length - 2];

            // CLAVE MODIFICADA: Usamos el nuevo prefijo /Uploads/
            secondaryImage = `/Uploads/${folder}/Interestellartitulo.png`;
        }

        // 4. Renderizar la vista 'Ej'
        res.render('Ej', {
            film: film,
            ...film,
            secondaryImage: secondaryImage
        });

    } catch (err) {
        // Esto captura errores si el ID no es válido
        console.error('❌ ERROR al cargar el detalle de la película:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
});

router.post('/addComment', async (req, res) => {
    try {
        const { userName, rating, reviewText, movieId } = req.body;

        if (!userName || !rating || !reviewText || !movieId) {
            return res.status(400).send('Faltan campos requeridos.');
        }

        const db = req.app.locals.db;
        if (!db) {
            return res.status(500).send('Database not initialized');
        }

        // 1. Insertar el comentario en la colección 'comentaries'
        const comentaryCollection = db.collection('comentaries');
        const result = await comentaryCollection.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: Number(rating),
            movieId: new ObjectId(movieId),
            createdAt: new Date()
        });

        // 2. Actualizar el array 'comments' de la película (Asegúrate que el campo es 'comments' y no 'comentary')
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { comments: result.insertedId } } // Usamos 'comments' para ser coherente con el modelo JSON
        );

        console.log(`✅ Comentario guardado con ID: ${result.insertedId}`);
        // Redirigir de vuelta a la página de la película de ejemplo
        res.redirect(`/ej`);

    } catch (err) {
        console.error('❌ ERROR al guardar comentario:', err);
        res.status(500).send(`Error al guardar comentario: ${err.message}`);
    }
});

    // ----------------------------------------------------
    // ➖ Ruta para borrar una película (y sus comentarios/archivos)
    // ----------------------------------------------------
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

router.get('/Ej/:id', async (req, res) => {
    // 1. Capturar el ID de la URL
    const movieId = req.params.id;

    if (!movieId) {
        return res.status(400).send("ID de película no proporcionado en la URL.");
    }

    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 2. Buscar la película por su ID
        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        // Si no se encuentra la película
        if (!film) {
            return res.status(404).send(`Película con ID ${movieId} no encontrada.`);
        }

        // 3. Simular la imagen secundaria (como lo tenías antes, pero dentro de la ruta correcta)
        let secondaryImage = null;
        if (film.directorImagePath) {
            const parts = film.directorImagePath.split('/');
            const folder = parts[parts.length - 2];
            secondaryImage = `/data/Images/${folder}/Interestellartitulo.png`;
        }

        // 4. Renderizar la vista 'Ej'
        res.render('Ej', {
            // Pasas el objeto film completo, que incluye el _id para el formulario de review
            film: film,
            ...film, // Esto "desempaqueta" los campos (title, rating, directorImagePath, etc.)
            secondaryImage: secondaryImage
        });

    } catch (err) {
        // Esto captura errores si el ID no es válido (ej: es muy corto)
        console.error('❌ ERROR al cargar el detalle de la película:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
});

export default router;
