import express from 'express';
import * as fs from 'fs';
import { ObjectId } from 'mongodb';

const router = express.Router();

// ----------------------------------------------------
// 🛠️ Middleware para Subida
// ----------------------------------------------------
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
            // Filtra por género (asume que 'genre' es un array en la DB)
            query.genre = filterGenre;
        }

        // 3. Obtener todos los géneros únicos de la base de datos
        const uniqueGenres = await collection.aggregate([
            { $unwind: "$genre" },
            { $group: { _id: "$genre" } },
            { $sort: { _id: 1 } }
        ]).toArray();

        // 4. Preparar la lista de géneros para Mustache (CON isActive y URL)
        const genres = uniqueGenres.map(g => {
            const genreName = g._id;
            let url = `/indice?genre=${encodeURIComponent(genreName)}`;
            if (searchQuery) {
                url += `&search=${encodeURIComponent(searchQuery)}`;
            }
            
            return {
                name: genreName,
                url: url,
                // Lógica para marcar el botón activo
                isActive: genreName === filterGenre
            };
        });
        
        // 5. Obtener datos de la base de datos con paginación
        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        const offset = (currentPage - 1) * ITEMS_PER_PAGE;

        const films = await collection.find(query)
            .skip(offset)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // 6. Configuración de paginación (URLs)
        const generateUrl = (page) => {
            let url = `/indice?page=${page}`;
            if (filterGenre) {
                url += `&genre=${encodeURIComponent(filterGenre)}`;
            }
            if (searchQuery) {
                url += `&search=${encodeURIComponent(searchQuery)}`;
            }
            return url;
        };

        const pagination = [];
        for (let i = 1; i <= totalPages; i++) {
            pagination.push({
                page: i,
                url: generateUrl(i),
                isCurrent: i === currentPage,
            });
        }

        const prevUrl = generateUrl(currentPage - 1);
        const nextUrl = generateUrl(currentPage + 1);


        // 7. Renderizar
        res.render('indice', {
            films,
            genres,
            currentFilter: filterGenre,
            currentSearch: searchQuery || '',
            
            // Variables de Paginación
            hasPagination: totalPages > 1,
            pagination,
            isPrevDisabled: currentPage <= 1,
            isNextDisabled: currentPage >= totalPages,
            prevUrl,
            nextUrl,
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
    const movieId = req.params.movieId;
    if (!movieId || !ObjectId.isValid(movieId)) {
        return res.status(400).send("ID de película no válido.");
    }

    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send(`Película con ID ${movieId} no encontrada.`);
        }

        // 🚨 CORRECCIÓN CLAVE: Asegura que la imagen secundaria usa la ruta /Uploads/
        let secondaryImage = null;
        if (film.directorImagePath) {
            // Ejemplo de film.directorImagePath: /Uploads/Interstellar/INTERESTELLAR.png
            const parts = film.directorImagePath.split('/');
            const folder = parts[parts.length - 2]; 
            // Esto asume que todas las imágenes secundarias están en la subcarpeta del título de la película
            secondaryImage = `/Uploads/${folder}/Interestellartitulo.png`; 
        }

        res.render('Ej', {
            ...film,
            _id: film._id.toString(), // Pasa el ID como string para el formulario de reseña
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

    // La ruta para las subidas nuevas también usa /Uploads/
    const directorImagePath = `/Uploads/${req.file.filename}`;

    const newFilm = {
        title,
        description,
        releaseYear: parseInt(releaseYear),
        // Asegura que 'genre' se guarda como array, incluso si es un solo valor
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


// ----------------------------------------------------
// ➡️ Ruta de Añadir Review
// ----------------------------------------------------
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
        return res.status(400).send(\"ID de película no válido.\");
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
