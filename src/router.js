import express from 'express';
import * as fs from 'fs';
import { ObjectId } from 'mongodb';

const router = express.Router();

router.get('/', (req, res) => {
    res.redirect('/indice');
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
                language: req.body.language || [],

                // CLAVE: La ruta para archivos subidos a Public/Uploads
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
            res.status(500).send(`Error interno del servidor: ${dbErr.message}`);
        }
    });
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

// ------------------------------------------------------------------
// 🗺️ RUTA DE DETALLE (Ejemplo)
// Carga la primera película y la muestra en la vista 'Ej.html'
// ------------------------------------------------------------------
router.get('/ej', async (req, res) => {
    try {
        const db = req.app.locals.db;
        // ... (manejo de errores de DB)

        const collection = db.collection('Softflix');
        const film = await collection.findOne({});

        if (!film) {
            return res.status(404).send("No hay películas cargadas en la base de datos.");
        }

        // 🛑 CORRECCIÓN CLAVE: Obtener el ID y convertirlo a string
        const movieIdString = film._id.toString();

        // Simula la imagen secundaria para el título 
        let secondaryImage = null;
        // ... (lógica de secondaryImage)

        // Renderiza la vista 'Ej.html'
        res.render('Ej', {
            film: film,
            // 🛑 NUEVO CAMPO: Pasa el ID como un string válido de MongoDB
            movieId: movieIdString,
            directorImagePath: film.directorImagePath,
            secondaryImage: secondaryImage
        });

    } catch (err) {
        // ... (manejo de errores)
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

export default router;
