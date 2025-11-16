import express from 'express';
import * as fs from 'fs'; // Necesitas fs para borrar el archivo si falla la DB

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
                cast: req.body.cast || [],
                duration: req.body.duration ? Number(req.body.duration) : undefined,
                language: req.body.language || [],

                directorImagePath: req.file ? `/Uploads/${req.file.filename}` : null,
            };

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
            res.redirect('/indice');

        } catch (dbErr) {
            console.error('❌ ERROR en la inserción (DB/Lógica):', dbErr);

            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).send(`Error al guardar la película: ${dbErr.message}`);
        }
    });
});

router.get("/indice", async (req, res) => {
    const ITEMS_PER_PAGE = 6;
    const currentPage = parseInt(req.query.page) || 1;

    const searchQuery = req.query.search || ''; // Buscador por Título
    const filterGenre = req.query.genre || '';  // Filtro por Género

    const skip = (currentPage - 1) * ITEMS_PER_PAGE;

    // 2. Conexión a DB
    const db = req.app.locals.db;
    if (!db) {
        return res.status(500).send('Database not initialized');
    }
    const collection = db.collection('Softflix'); // Usamos el nombre de tu colección

    // 3. Construcción del Objeto de Consulta (Query Object)
    const query = {};

    if (searchQuery) {
        // Búsqueda por el campo 'title' (insensible a mayúsculas/minúsculas)
        query.title = { $regex: searchQuery, $options: 'i' };
    }

    if (filterGenre && filterGenre !== 'Todos') {
        // Filtro por el campo 'genre'. Asumimos que 'genre' es un campo de array en tu DB.
        query.genre = filterGenre;
    }

    try {
        // 4. Consulta 1: Obtener el total de elementos (APLICANDO FILTROS/BÚSQUEDA)
        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        // 5. Consulta 2: Obtener las películas de la página actual
        const films = await collection.find(query)
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // 6. Preparar URL base para mantener el estado del buscador y filtro
        let baseUrl = '/indice?';
        if (searchQuery) {
            baseUrl += `search=${encodeURIComponent(searchQuery)}&`;
        }
        if (filterGenre) {
            baseUrl += `genre=${encodeURIComponent(filterGenre)}&`;
        }

        // 7. Generar Enlaces de Paginación Numérica
        const paginationLinks = [];
        for (let i = 1; i <= totalPages; i++) {
            paginationLinks.push({
                page: i,
                isCurrent: i === currentPage,
                url: `${baseUrl}page=${i}`
            });
        }

        // 8. Preparar Botones de Anterior y Siguiente
        const prevPage = currentPage > 1 ? currentPage - 1 : 1;
        const nextPage = currentPage < totalPages ? currentPage + 1 : totalPages;

        // 9. Obtener la lista de géneros disponibles para los botones de filtro
        // Esto asume que el campo 'genre' en tu DB es un array de strings.
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

        // 10. Renderizar la vista
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

// 🎬 RUTA POST PARA AGREGAR COMENTARIOS
router.post("/addComment", async (req, res) => {
    try {
        const { userName, rating, reviewText, movieId } = req.body;

        if (!userName || !rating || !reviewText || !movieId) {
            return res.status(400).send('Faltan campos requeridos (userName, rating, reviewText, movieId)');
        }

        const db = req.app.locals.db;
        if (!db) {
            console.error('Database not initialized');
            return res.status(500).send('Database not initialized');
        }

        // 1. Insertar el comentario en la colección 'comentaries'
        const comentaryCollection = db.collection('comentaries');
        const result = await comentaryCollection.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: Number(rating),
            movieId: new (require('mongodb')).ObjectId(movieId),
            createdAt: new Date()
        });

        // 2. Actualizar el array 'comentary' de la película
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: new (require('mongodb')).ObjectId(movieId) },
            { $push: { comentary: result.insertedId } }
        );

        console.log(`✅ Comentario guardado con ID: ${result.insertedId}`);
        // Redirigir de vuelta a la página de la película
        res.redirect(`/ej?id=${movieId}`);

    } catch (err) {
        console.error('❌ ERROR al guardar comentario:', err);
        res.status(500).send(`Error al guardar el comentario: ${err.message}`);
    }
});

export default router;
