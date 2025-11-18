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

const ITEMS_PER_PAGE = 6;

router.get('/indice', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        const currentPage = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search ? req.query.search.trim() : null;
        const filterGenre = req.query.genre ? req.query.genre.trim() : null;

        const query = {};
        if (searchQuery) query.title = { $regex: new RegExp(searchQuery, 'i') };
        if (filterGenre && filterGenre !== 'Todos') query.genre = filterGenre;

        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const films = await collection.find(query)
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // 🔑 CORRECCIÓN DEL ÍNDICE: Usar SOLAMENTE coverPath para la portada del listado.
        const normalizedFilms = films.map(f => ({
            ...f,
            // Ahora coverPath siempre está correctamente poblado con el prefijo /Uploads/
            posterUrl: f.coverPath,
        }));

        // ... (lógica de paginación y géneros)
        const paginationLinks = [];
        const baseUrl = `/indice?${searchQuery ? `search=${encodeURIComponent(searchQuery)}&` : ''}${filterGenre ? `genre=${encodeURIComponent(filterGenre)}&` : ''}`;
        for (let i = 1; i <= totalPages; i++) {
            paginationLinks.push({ page: i, url: `${baseUrl}page=${i}`, isCurrent: i === currentPage });
        }
        const prevPage = Math.max(1, currentPage - 1);
        const nextPage = Math.min(totalPages, currentPage + 1);

        const genresCursor = await collection.aggregate([
            { $unwind: "$genre" },
            { $group: { _id: "$genre" } },
            { $sort: { _id: 1 } }
        ]).toArray();
        const availableGenres = genresCursor.map(g => ({
            name: g._id,
            isActive: g._id === filterGenre,
            url: `/indice?genre=${encodeURIComponent(g._id)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`
        }));
        // Fin de lógica de paginación y géneros

        res.render("indice", {
            films: normalizedFilms,
            pagination: paginationLinks,
            hasPagination: totalPages > 1,
            prevUrl: `${baseUrl}page=${prevPage}`,
            nextUrl: `${baseUrl}page=${nextPage}`,
            isPrevDisabled: currentPage <= 1,
            isNextDisabled: currentPage >= totalPages,
            currentSearch: searchQuery,
            currentFilter: filterGenre,
            genres: availableGenres
        });

    } catch (err) {
        console.error('❌ ERROR al obtener datos del índice:', err);
        res.status(500).send('Error al cargar la página principal.');
    }
});

// ----------------------------------------------------
// ➡️ Ruta POST para Añadir Película (con Multer)
// ----------------------------------------------------
router.post("/addFilm", (req, res) => {
    // El objeto Multer ya está en app.locals.upload
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
            
            // 1.1 Validación de campos obligatorios
            const { title, description, releaseYear, director, cast, genre, ageClassification } = body;
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                return res.render('error', {
                    mensaje: 'All required fields must be completed.',
                    rutaBoton: '/add',
                    textoBoton: 'Return to the form'
                });
            }

            // 🔑 CORRECCIÓN VALIDACIÓN DUPLICADOS: Si existe la película, renderea error.
            const existingMovie = await req.app.locals.db.collection('Softflix').findOne({ title: title });
            
            if (existingMovie) {
                // Borrar archivos si se subieron antes de la comprobación
                if (req.files) {
                    Object.keys(req.files).forEach(key => {
                         req.files[key].forEach(file => {
                            fs.unlinkSync(file.path); 
                         });
                    });
                }
                return res.render('error', {
                    mensaje: `There is already a movie with that title "${title}". Please, choose another title for the movie.`,
                    rutaBoton: '/add',
                    textoBoton: ' Return to the form'
                });
            }


            // 2. Función auxiliar para obtener la ruta de un archivo específico
            const getFilePath = (fieldName) => {
                // Genera la ruta con el prefijo /Uploads/ para consistencia.
                return files && files[fieldName] && files[fieldName][0]
                    ? `/Uploads/${files[fieldName][0].filename}`
                    : null;
            };

            // 3. Objeto de la Película a Insertar
            const movie = {
                title,
                description,
                releaseYear: Number(releaseYear),
                genre: Array.isArray(genre) ? genre : [genre],
                rating: body.rating ? Number(body.rating) : undefined,
                ageClassification,
                director,
                // Las rutas de los archivos subidos (new films) usan getFilePath()
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

            const result = await collection.insertOne(movie);

            // 5. Redirigir si todo va bien
            // 5. Mostrar página de confirmación
            return res.render("confirm", {
               movieTitle: movie.title,
               movieId: result.insertedId,
               rutaDetalle: `/Ej/${result.insertedId}`
            });


        } catch (err) {
            // 6. Borrar archivos si falla (Rollback)
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

// ----------------------------------------------------
// ➡️ Ruta de Detalle de Película (/Ej/:id)
// ----------------------------------------------------
router.get('/Ej/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send("Película no encontrada");
        }

        // 1. Lógica para crear el array de casting (objetos con nombre y ruta de imagen)
        const castArray = [];
        const castNames = Array.isArray(film.cast)
            ? film.cast
            : ((film.Actor1 || film.Actor2 || film.Actor3)
                ? [film.Actor1, film.Actor2, film.Actor3].filter(n => n)
                : []);


        for (let i = 0; i < castNames.length; i++) {
            const name = castNames[i];
            
            // La ruta de la DB ya está corregida en Database.js (con /Uploads/)
            const imagePath = film[`actor${i + 1}ImagePath`]; 

            if (name) {
                castArray.push({
                    name: name,
                    imagePath: imagePath
                });
            }
        }

        // 2. Normalización de datos para la plantilla
        const filmNormalized = {
            ...film,

            // Intentamos recuperar reviews o comments, pero esperamos que los nuevos vengan en 'comments'
            reviews: Array.isArray(film.reviews)
                ? film.reviews
                : (Array.isArray(film.comments) ? film.comments : (Array.isArray(film.comentary) ? film.comentary : [])),

            // Poster principal
            poster: film.coverPath || film.cover || film.mainImagePath || null,

            cast: castArray, 
            language: Array.isArray(film.language) ? film.language : (film.language || []),
        };

        res.render('Ej', { ...filmNormalized });

    } catch (err) {
        console.error('❌ ERROR al cargar el detalle de la película:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
});


// ... (rest of router.js routes)

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

        // 2. Actualizar el array 'comments' de la película (Modelo de Referencia)
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { comments: result.insertedId } } 
        );

        console.log(`✅ Comentario guardado con ID: ${result.insertedId}`);
        res.redirect(`/Ej/${movieId}`);

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

        // Eliminar archivos asociados (solo aquellos con el prefijo /Uploads/)
        const pathsToDelete = [
            movie.coverPath, movie.titlePhotoPath, movie.filmPhotoPath, 
            movie.directorImagePath, movie.actor1ImagePath, movie.actor2ImagePath, movie.actor3ImagePath
        ].filter(p => p && p.startsWith('/Uploads/'));

        for (const rel of pathsToDelete) {
            if (!rel) continue;
            // Quitamos el prefijo /Uploads/ y construimos la ruta absoluta en Public/Uploads
            const relClean = rel.replace(/^\/Uploads\//, '');
            const fullPath = path.join(process.cwd(), 'Public', 'Uploads', relClean);

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


// =======================================================
// ➡️ POST /Ej/:id/addReview → Manejar la adición de reseñas (MODELO UNIFICADO)
// =======================================================
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;

        // 1. Validar campos requeridos
        const { userName, rating, reviewText } = req.body;
        if (!userName || !rating || !reviewText || !movieId) {
            return res.status(400).send('Faltan campos requeridos para la reseña.');
        }

        // 2. Insertar el comentario como un documento separado en 'comentaries'
        const comentaryCollection = db.collection('comentaries');
        const result = await comentaryCollection.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: parseInt(rating),
            movieId: new ObjectId(movieId),
            createdAt: new Date()
        });

        // 3. Actualizar la película: Añadir la referencia (ID) al array 'comments' (Modelo Unificado)
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { comments: result.insertedId } } 
        );

        console.log(`✅ Reseña guardada con ID: ${result.insertedId} y referenciada en la película.`);
        
        // Redirigir al usuario de vuelta a la página de detalle
        res.redirect(`/Ej/${movieId}`);

    } catch (err) {
        console.error('❌ ERROR al añadir la reseña (Modelo Unificado):', err);
        res.status(500).send(`Error al añadir la reseña: ${err.message}`);
    }
});


// =======================================================
// ➡️ GET /edit/:id → Cargar la página de edición
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
            releaseYear: film.Realase_year || film.releaseYear, 
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