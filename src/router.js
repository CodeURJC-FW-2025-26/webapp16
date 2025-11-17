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

    // 1. Definir el middleware con upload.fields() para esperar los 7 campos de archivo
    const uploadMiddleware = req.app.locals.upload.fields([
        { name: 'cover', maxCount: 1 },
        { name: 'titlePhoto', maxCount: 1 },
        { name: 'filmPhoto', maxCount: 1 },
        { name: 'fotoDirector', maxCount: 1 },
        { name: 'fotoActor1', maxCount: 1 },
        { name: 'fotoActor2', maxCount: 1 },
        { name: 'fotoActor3', maxCount: 1 },
    ]);

    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('❌ ERROR de Subida de Archivos (Multer):', err);
            return res.status(500).send(`Error al procesar el archivo: ${err.message}`);
        }

        try {
            if (!req.body) {
                return res.status(400).send('No se recibió cuerpo (req.body) en la solicitud');
            }

            const files = req.files;

            // 2. Función auxiliar para obtener la ruta de un archivo específico
            const getFilePath = (fieldName) => {
                return files && files[fieldName] && files[fieldName][0]
                    ? `/Uploads/${files[fieldName][0].filename}`
                    : null;
            };

            // 3. Extraer todas las rutas de las imágenes subidas
            const coverPath = getFilePath('cover');
            const titlePhotoPath = getFilePath('titlePhoto');
            const filmPhotoPath = getFilePath('filmPhoto');
            const directorImagePath = getFilePath('fotoDirector');
            const actor1ImagePath = getFilePath('fotoActor1');
            const actor2ImagePath = getFilePath('fotoActor2');
            const actor3ImagePath = getFilePath('fotoActor3');

            // 4. Crear el objeto movie - LÓGICA DE ARRAY CORREGIDA
            const movie = {
                title: req.body.title,
                description: req.body.description,
                releaseYear: req.body.releaseYear ? Number(req.body.releaseYear) : undefined,

                // CRÍTICO: Asegura que siempre sea un array, incluso si se selecciona un solo elemento
                genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),

                rating: req.body.rating ? Number(req.body.rating) : undefined,
                ageClassification: req.body.ageClassification,
                director: req.body.director,

                // Imágenes de la película
                coverPath: coverPath,
                titlePhotoPath: titlePhotoPath,
                filmPhotoPath: filmPhotoPath,

                // Información de casting
                // CRÍTICO: Asegura que 'cast' siempre sea un array
                cast: Array.isArray(req.body.cast) ? req.body.cast : (req.body.cast ? [req.body.cast] : []),

                directorImagePath: directorImagePath,
                actor1ImagePath: actor1ImagePath,
                actor2ImagePath: actor2ImagePath,
                actor3ImagePath: actor3ImagePath,

                duration: req.body.duration,
                // CRÍTICO: Asegura que 'language' siempre sea un array
                language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),

                comentary: []
            };

            const db = req.app.locals.db;
            const collection = db.collection('Softflix');
            await collection.insertOne(movie);

            res.redirect('/indice');

        } catch (err) {
            // 5. Borrar archivos si falla la inserción en la base de datos
            const files = req.files;
            if (files) {
                Object.keys(files).forEach(key => {
                    files[key].forEach(file => {
                        fs.unlink(file.path, (unlinkErr) => {
                            if (unlinkErr) console.error(`Error al borrar archivo subido (${file.filename}):`, unlinkErr);
                        });
                    });
                });
            }
            console.error('❌ ERROR al insertar película en la base de datos:', err);
            res.status(500).send(`Error al guardar la película: ${err.message}`);
        }
    });
});

// ... (rest of router.js, including /indice route)

router.get('/add', (req, res) => {
    res.render('add');
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
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send("Película no encontrada");
        }

        // 1. Lógica para crear el array de casting (Array de Objetos)
        const castArray = [];
        // Itera sobre los campos Actor1, Actor2, Actor3 que se guardaron en Database.js
        for (let i = 1; i <= 3; i++) {
            const actorNameKey = `Actor${i}`;
            const actorImageKey = `image_actor${i}`;

            const name = film[actorNameKey];
            const imagePath = film[actorImageKey];

            if (name) {
                // Se genera un objeto { name: 'Nombre', imagePath: 'ruta' }
                castArray.push({
                    name: name,
                    // Ruta de la imagen, o una ruta por defecto si el campo está vacío
                    imagePath: imagePath || '/path/to/default/actor.jpg'
                });
            }
        }

        // 2. Normalización de datos para la plantilla
        const filmNormalized = {
            ...film,
            // (Tu normalización existente para otros campos)
            title: film.Title || film.title,
            rating: film.Calification || film.rating,
            ageClassification: film.Age_classification || film.ageClassification,
            duration: film.Duration || film.duration,
            releaseYear: film.Realase_year || film.releaseYear,
            director: film.Director || film.director,
            poster: film.cover || film.bannerImage || film.image_file || film.coverPath || film.mainImagePath || null,
            reviews: film.comments || film.reviews || film.comentary || [],

            // 🔑 CRÍTICO: Asignar el array de objetos 'cast'
            cast: castArray,

            // CRÍTICO: Asegurar que 'language' existe (array de strings)
            language: Array.isArray(film.language) ? film.language : (film.language || []),

            directorImagePath: film.directorImagePath || film.fotoDirector
        };

        // Renderizar la vista
        res.render('Ej', {
            ...filmNormalized,
        });

    } catch (err) {
        console.error('❌ ERROR al cargar el detalle de la película:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
});


// =======================================================
// ➡️ GET /edit/:id  → Cargar datos de la película para editar
// =======================================================
router.get('/edit/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send("Película no encontrada");
        }

        // Renderiza el mismo formulario "add", pero con datos cargados
        res.render("add", {
            editing: true,
            film
        });

    } catch (err) {
        console.error("❌ Error al cargar película para editar:", err);
        res.status(500).send("Error al cargar datos de la película.");
    }
});




export default router;
