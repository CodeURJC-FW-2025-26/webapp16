import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

const router = express.Router();

// ----------------------------------------------------\
// 🛠️ Middleware para Subida
// ----------------------------------------------------\
// Permite que Multer sea accesible solo para la ruta POST /add
const uploadMiddleware = (req, res, next) => {
    // Accede al objeto 'upload' de Multer desde app.locals
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

// ----------------------------------------------------\
// ➡️ Ruta Principal de Películas (Indice)
// ----------------------------------------------------\

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

        // 3. Paginación
        const totalFilms = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalFilms / ITEMS_PER_PAGE);
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        // 4. Obtener las películas
        const films = await collection.find(query)
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // 5. Preparar datos para Mustache (paginación)
        const pagination = [];
        for (let i = 1; i <= totalPages; i++) {
            let url = `/indice?page=${i}`;
            if (searchQuery) url += `&search=${searchQuery}`;
            if (filterGenre) url += `&genre=${filterGenre}`;

            pagination.push({
                page: i,
                url: url,
                isCurrent: i === currentPage
            });
        }

        const prevUrl = currentPage > 1 ? `/indice?page=${currentPage - 1}${searchQuery ? `&search=${searchQuery}` : ''}${filterGenre ? `&genre=${filterGenre}` : ''}` : '#';
        const nextUrl = currentPage < totalPages ? `/indice?page=${currentPage + 1}${searchQuery ? `&search=${searchQuery}` : ''}${filterGenre ? `&genre=${filterGenre}` : ''}` : '#';

        // 6. Obtener todos los géneros para el filtro
        const allGenres = await collection.distinct('genre');
        const genreOptions = [{ value: 'Todos', selected: !filterGenre || filterGenre === 'Todos' }];
        allGenres.forEach(genre => {
            if (genre && genre.length > 0) {
                genreOptions.push({
                    value: genre,
                    selected: filterGenre === genre
                });
            }
        });


        // 7. Renderizar
        res.render('indice', {
            films: films,
            pagination: pagination,
            hasPagination: totalPages > 1,
            isPrevDisabled: currentPage === 1,
            isNextDisabled: currentPage === totalPages,
            prevUrl: prevUrl,
            nextUrl: nextUrl,
            genreOptions: genreOptions,
            currentSearch: searchQuery || '',
            // Este log puede ayudar a debuggear si las películas se cargan
            logFilm: films.length > 0 ? films[0].title : 'No films loaded'
        });

    } catch (err) {
        console.error('❌ ERROR al cargar índice:', err.message);
        res.status(500).send('Error al cargar la lista de películas.');
    }
});


// ----------------------------------------------------\
// ➡️ Ruta de Detalle de Película (Ej)
// ----------------------------------------------------\
router.get('/Ej/:movieId', async (req, res) => {
    const movieId = req.params.movieId;

    // 1. Validar ID de MongoDB
    if (!movieId || !ObjectId.isValid(movieId)) {
        return res.status(400).send("ID de película no proporcionado en la URL o no es válido.");
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

        // 3. Formato de géneros (necesario si vienen como array para Mustache)
        const formattedFilm = {
            ...film,
            // Convertir 'genre' de array a string para mostrarlo en el mustache (si es necesario)
            // O mantenerlo como array y usar {{#genre}}{{.}}, {{/genre}}
            genreList: film.genre ? film.genre.join(', ') : '',
            // Preparar las reviews para mostrarlas
            hasReviews: film.reviews && film.reviews.length > 0,
            reviews: film.reviews
        };

        // 4. Simular la imagen secundaria (como lo tenías antes, pero dentro de la ruta correcta)
        let secondaryImage = null;
        if (film.directorImagePath) {
            // Asume que si la ruta es /Uploads/Interstellar/INTERESTELLAR.png, 
            // la secundaria es /Uploads/Interstellar/Interestellartitulo.png
            const parts = film.directorImagePath.split('/');
            parts.pop(); // Elimina el nombre del archivo (INTERESTELLAR.png)
            const folderPath = parts.join('/'); // /Uploads/Interstellar
            secondaryImage = `${folderPath}/Interestellartitulo.png`; // Crea la nueva ruta
        }

        // 5. Renderizar la vista 'Ej'
        res.render('Ej', {
            // Pasas el objeto film completo, que incluye el _id para el formulario de review
            film: formattedFilm,
            ...formattedFilm, // Esto "desempaqueta" los campos (title, rating, directorImagePath, etc.)
            secondaryImage: secondaryImage
        });

    } catch (err) {
        // Esto captura errores si el ID no es válido (ej: es muy corto)
        console.error('❌ ERROR al cargar el detalle de la película:', err.message);
        res.status(500).send('Error interno al cargar el detalle de la película.');
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
        console.error('❌ ERROR al insertar nueva película:', err.message);
        res.status(500).send('Error al guardar la película.');
    }
});


// ----------------------------------------------------\
// ➡️ Ruta de Añadir Review
// ----------------------------------------------------\
router.post('/Ej/:movieId/addReview', async (req, res) => {
    const movieId = req.params.movieId;
    // ✅ Importante: los nombres deben coincidir con los del formulario en Ej.html
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
        date: new Date().toLocaleDateString('es-ES') // Formato simple de fecha
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


// ----------------------------------------------------\
// ➡️ Ruta de Borrar Película (DELETE)
// ----------------------------------------------------\

// Usaremos un POST o una simulación de DELETE con un formulario simple
router.post('/delete/:movieId', async (req, res) => {
    const movieId = req.params.movieId;
    if (!movieId || !ObjectId.isValid(movieId)) {
        return res.status(400).send('ID de película no válido.');
    }
    const oid = new ObjectId(movieId);

    try {
        const db = req.app.locals.db;
        const moviesColl = db.collection('Softflix');

        // 1. Buscar la película para obtener la ruta del archivo a eliminar
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Película no encontrada');

        // 2. Eliminar archivos asociados (si existen)
        const possiblePaths = [];
        if (movie.directorImagePath) possiblePaths.push(movie.directorImagePath);

        // Normalizar y eliminar cada archivo si existe
        for (const rel of possiblePaths) {
            if (!rel) continue;
            // Quitamos el '/' inicial y construimos la ruta absoluta dentro de Public/
            const relClean = rel.replace(/^\//, '');
            const fullPath = path.join(process.cwd(), 'Public', relClean);
            try {
                if (fs.existsSync(fullPath)) {
                    // Eliminamos el archivo
                    fs.unlinkSync(fullPath);
                    console.log(`Archivo eliminado: ${fullPath}`);
                }
            } catch (e) {
                console.warn('No se pudo eliminar archivo:', fullPath, e.message);
            }
        }

        // 3. Finalmente, eliminar la película de la colección
        await moviesColl.deleteOne({ _id: oid });

        console.log(`Película ${movieId} eliminada.`);
        // Redirigir al índice después de la eliminación
        return res.redirect('/indice');
    } catch (err) {
        console.error('Error al borrar película:', err);
        return res.status(500).send('Error al borrar la película.');
    }
});


export default router;
