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

        // Normalizar las rutas de las imágenes para el índice
        const normalizedFilms = films.map(f => ({
            ...f,
            // Prioridad: coverPath (Nuevo/Estandarizado) > directorImagePath (Fallback para datos iniciales)
            posterUrl: f.coverPath || f.directorImagePath,
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

router.post("/addFilm", (req, res) => {

    // 1. Configuración de Multer para recibir todos los campos de archivo
    const uploadMiddleware = req.app.locals.upload.fields([
        { name: 'cover', maxCount: 1 },         // Portada principal
        { name: 'titlePhoto', maxCount: 1 },    // Foto del título
        { name: 'filmPhoto', maxCount: 1 },     // Foto de la película (escena o banner)
        { name: 'fotoDirector', maxCount: 1 },  // Foto del director
        { name: 'fotoActor1', maxCount: 1 },    // Foto del Actor 1
        { name: 'fotoActor2', maxCount: 1 },    // Foto del Actor 2
        { name: 'fotoActor3', maxCount: 1 },    // Foto del Actor 3
    ]);

    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('❌ ERROR de Subida de Archivos (Multer):', err);
            // 💡 Si el error es Multer, puedes redirigir a un formulario con mensaje de error
            return res.status(500).send(`Error al procesar el archivo: ${err.message}`);
        }

        try {
            if (!req.body) {
                return res.status(400).send('No se recibió cuerpo (req.body) en la solicitud');
            }

            const files = req.files;

            // 🔑 Función auxiliar CRÍTICA: Convierte la ruta absoluta de Multer a una URL pública
            // Maneja subcarpetas quitando el prefijo estático 'Public/'
            const getFilePath = (fieldName) => {
                const file = files && files[fieldName] && files[fieldName][0];
                if (!file) return null;

                // 1. Normaliza separadores de ruta (útil en Windows)
                let publicPath = file.path.replace(/\\/g, '/');

                // 2. Elimina el directorio raíz estático ('Public/')
                // Transforma 'Public/Uploads/subcarpeta/foto.jpg' en '/Uploads/subcarpeta/foto.jpg'
                // Esto es crucial para que el navegador pueda acceder al archivo.
                publicPath = publicPath.replace(/^[./]*Public\//i, '/');

                return publicPath;
            };

            // 3. Extracción de rutas (mapeo CORRECTO de los campos de Multer a las variables estandarizadas)
            const coverPath = getFilePath('cover');
            const titlePhotoPath = getFilePath('titlePhoto');
            const filmPhotoPath = getFilePath('filmPhoto'); // ✅ CORRECCIÓN: Ahora mapea el campo 'filmPhoto'
            const directorImagePath = getFilePath('fotoDirector');
            const actor1ImagePath = getFilePath('fotoActor1');
            const actor2ImagePath = getFilePath('fotoActor2');
            const actor3ImagePath = getFilePath('fotoActor3');

            // 4. Crear el objeto movie con datos del formulario
            const movie = {
                title: req.body.title,
                description: req.body.description,
                releaseYear: req.body.releaseYear ? Number(req.body.releaseYear) : undefined,

                // Asegura que los campos con múltiples selecciones sean arrays
                genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),

                rating: req.body.rating ? Number(req.body.rating) : undefined,
                ageClassification: req.body.ageClassification,
                director: req.body.director,

                // 🔑 Rutas de Imágenes (estandarizadas y mapeadas correctamente)
                coverPath: coverPath,
                titlePhotoPath: titlePhotoPath,
                filmPhotoPath: filmPhotoPath,
                directorImagePath: directorImagePath,
                actor1ImagePath: actor1ImagePath,
                actor2ImagePath: actor2ImagePath,
                actor3ImagePath: actor3ImagePath,

                // Casting
                cast: Array.isArray(req.body.cast) ? req.body.cast : (req.body.cast ? [req.body.cast] : []),

                duration: req.body.duration,
                language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
                comments: []
            };

            const db = req.app.locals.db;
            const collection = db.collection('Softflix');

            const result = await collection.insertOne(movie);

            // Redirección a la página de detalle con el nuevo ID
            res.redirect(`/Ej/${result.insertedId}`);

        } catch (err) {
            // 💡 Manejo de errores: Borrar archivos subidos si falla la inserción en la DB
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

            // Usamos el campo estandarizado
            const uploadedImagePath = film[`actor${i + 1}ImagePath`];

            // Generar ruta de fallback (para datos iniciales de data.json)
            const safeName = name ? name.replace(/\s/g, '_') : 'unknown';
            const defaultImagePath = `/Imagenes/Actors/${safeName}.jpg`;

            if (name) {
                castArray.push({
                    name: name,
                    // Prioridad: Ruta subida > Ruta de fallback
                    imagePath: uploadedImagePath || defaultImagePath
                });
            }
        }

        // 2. Normalización de datos para la plantilla
        const filmNormalized = {
            ...film,

            reviews: Array.isArray(film.reviews)
                ? film.reviews
                : (Array.isArray(film.comments) ? film.comments : (Array.isArray(film.comentary) ? film.comentary : [])),

            // Poster principal: coverPath siempre debe funcionar ahora
            poster: film.coverPath || film.cover || film.mainImagePath || null,

            // Director: directorImagePath siempre debe funcionar ahora
            directorImagePath: film.directorImagePath || film.fotoDirector,

            cast: castArray, // Pasa el array de objetos con la ruta de imagen
            language: Array.isArray(film.language) ? film.language : (film.language || []),
        };

        res.render('Ej', { ...filmNormalized });

    } catch (err) {
        console.error('❌ ERROR al cargar el detalle de la película:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
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
