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
    // Middleware para subir los archivos
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
            return res.render('error', {
                mensaje: `Error al procesar los archivos: ${err.message}`,
                rutaBoton: '/add',
                textoBoton: 'Volver al formulario'
            });
        }

        try {
            const files = req.files;
            const body = req.body;

            // 1. Validación de campos obligatorios
            const { title, description, releaseYear, director, cast, genre, ageClassification } = body;
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                return res.render('error', {
                    mensaje: 'Todos los campos obligatorios deben ser completados.',
                    rutaBoton: '/add',
                    textoBoton: 'Volver al formulario'
                });
            }

            // 2. Función auxiliar para obtener la ruta de un archivo específico
            const getFilePath = (fieldName) => {
                return files && files[fieldName] && files[fieldName][0]
                    ? `/Uploads/${files[fieldName][0].filename}`
                    : null;
            };

            // 3. Rutas de las imágenes
            const movie = {
                title,
                description,
                releaseYear: Number(releaseYear),
                genre: Array.isArray(genre) ? genre : [genre],
                rating: body.rating ? Number(body.rating) : undefined,
                ageClassification,
                director,
                coverPath: getFilePath('cover'),
                titlePhotoPath: getFilePath('titlePhoto'),
                filmPhotoPath: getFilePath('filmPhoto'),
                cast: Array.isArray(cast) ? cast : [cast],
                directorImagePath: getFilePath('fotoDirector'),
                actor1ImagePath: getFilePath('fotoActor1'),
                actor2ImagePath: getFilePath('fotoActor2'),
                actor3ImagePath: getFilePath('fotoActor3'),
                duration: body.duration,
                language: Array.isArray(body.language) ? body.language : (body.language ? [body.language] : []),
                comentary: []
            };

            // 4. Insertar en la base de datos
            const db = req.app.locals.db;
            const collection = db.collection('Softflix');
            await collection.insertOne(movie);

            // 5. Redirigir si todo va bien
            res.redirect('/indice');

        } catch (err) {
            // 6. Borrar archivos si falla
            if (req.files) {
                Object.keys(req.files).forEach(key => {
                    req.files[key].forEach(file => {
                        fs.unlink(file.path, (unlinkErr) => {
                            if (unlinkErr) console.error(`Error al borrar archivo (${file.filename}):`, unlinkErr);
                        });
                    });
                });
            }

            console.error('❌ ERROR al insertar película en la base de datos:', err);
            res.render('error', {
                mensaje: `Error al guardar la película: ${err.message}`,
                rutaBoton: '/add',
                textoBoton: 'Volver al formulario'
            });
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

        // 1. Lógica para crear el array de casting 
        const castArray = [];
        for (let i = 1; i <= 3; i++) {
            const name = film[`Actor${i}`];
            const imagePath = film[`image_actor${i}`];
            if (name) {
                // Aquí usamos el objeto si tu HTML lo espera, o solo el nombre si usa {{#cast}}{{.}}{{/cast}}
                // Para simplificar, asumiremos que tu HTML funciona con strings de nombres.
                castArray.push(name);
            }
        }

        // 2. Normalización de datos para la plantilla
        const filmNormalized = {
            ...film,

            title: film.Title || film.title,
            rating: film.Calification || film.rating,
            ageClassification: film.Age_classification || film.ageClassification,
            duration: film.Duration || film.duration,
            releaseYear: film.Realase_year || film.releaseYear,
            director: film.Director || film.director,

            // Asignamos el nombre 'reviews' buscando en todas las posibles claves
            reviews: Array.isArray(film.reviews)
                ? film.reviews
                : (Array.isArray(film.comments)
                    ? film.comments
                    : (Array.isArray(film.comentary) ? film.comentary : [])),

            poster: film.cover || film.bannerImage || film.image_file || film.coverPath || film.mainImagePath || null,
            cast: Array.isArray(film.cast) ? film.cast : castArray,
            language: Array.isArray(film.language) ? film.language : (film.language || []),
            directorImagePath: film.directorImagePath || film.fotoDirector
        };

        res.render('Ej', { ...filmNormalized });

    } catch (err) {
        console.error('❌ ERROR al cargar el detalle de la película:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
});

// =======================================================
// ➡️ POST /Ej/:id/addReview  → Manejar la adición de reseñas
// =======================================================
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // Los nombres de campo (userName, rating, reviewText) coinciden con el formulario corregido de Ej.html
        const newReview = {
            userName: req.body.userName,
            rating: parseInt(req.body.rating),
            text: req.body.reviewText, // Asegúrate de que el name en el HTML es 'reviewText'
            date: new Date()
        };

        // Añadir la nueva reseña al array 'reviews' en MongoDB
        // Usamos 'reviews' como nombre de campo estándar en la DB para las nuevas inserciones.
        await collection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { reviews: newReview } }
        );

        // Redirigir al usuario de vuelta a la página de detalle
        res.redirect(`/Ej/${movieId}`);

    } catch (err) {
        console.error('❌ ERROR al añadir la reseña:', err);
        res.status(500).send(`Error al añadir la reseña: ${err.message}`);
    }
});


// =======================================================
// ➡️ POST /editFilm/:id → Manejar la edición y subida de archivos
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

        // 1. Normalizar y preparar los datos para la plantilla 'add.html'
        const genreArray = Array.isArray(film.genre) ? film.genre : (film.genre ? [film.genre] : []);
        const languageArray = Array.isArray(film.language) ? film.language : (film.language ? [film.language] : []);

        const filmNormalized = {
            // Campos base (títulos y descripción)
            _id: film._id,
            title: film.Title || film.title,
            description: film.Description || film.description,

            // Campos con nombres potenciales inconsistentes en la DB (Normalización)
            releaseYear: film.Realase_year || film.releaseYear, // 'Realase_year' parece un error tipográfico
            rating: film.Calification || film.rating,
            ageClassification: film.Age_classification || film.ageClassification,
            director: film.Director || film.director,
            duration: film.Duration || film.duration,

            // Casting (Aseguramos que sea un array para precargar los tres campos)
            cast: Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []),

            // Flags para Checkboxes (Género)
            isAction: genreArray.includes('Action'),
            isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'),
            isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'),
            isAdventure: genreArray.includes('Adventure'),
            isOtherGenre: genreArray.includes('Other'),

            // Flags para Checkboxes (Idioma)
            isEnglish: languageArray.includes('English'),
            isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'),
            isGerman: languageArray.includes('German'),
            isOtherLanguage: languageArray.includes('Other'),
        };

        // 2. Renderizar la vista
        res.render("add", {
            editing: true,
            film: filmNormalized // Enviamos el objeto normalizado
        });

    } catch (err) {
        console.error("❌ Error al cargar película para editar:", err);
        res.status(500).send("Error al cargar datos de la película.");
    }
});




export default router;
