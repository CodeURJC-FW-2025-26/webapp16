import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId, MongoClient } from 'mongodb';
import multer from 'multer';
import { fileURLToPath } from "url";

const router = express.Router();

// --- CONFIGURACIÓN BASE DE DATOS ---
const uri = 'mongodb://localhost:27017/Softflix';
const client = new MongoClient(uri);
const db = client.db('Softflix');
const moviesColl = db.collection('Softflix');
const commentsColl = db.collection('comentaries');

// --- CONFIGURACIÓN DE RUTAS Y ARCHIVOS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..');
const UPLOADS_PATH = path.join(BASE_PATH, 'Uploads');

// --- HELPER: Limpiar archivos si algo falla (Añadido porque lo usas en el código) ---
const cleanupFiles = (files) => {
    if (!files) return;
    Object.keys(files).forEach(key => {
        files[key].forEach(file => {
            const filePath = path.join(UPLOADS_PATH, file.filename); // Ajusta la ruta según guardes
            fs.unlink(filePath, (err) => {
                if (err) console.error(`Error deleting file ${filePath}:`, err);
            });
        });
    });
};

// --- CONFIGURACIÓN MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});
const upload = multer({ storage: storage });

const ITEMS_PER_PAGE = 6;

// Helper: Adds the access URL prefix
const addUploadPrefix = (filename) => {
    if (!filename) return null;
    return `/Uploads/${filename}`;
};

// Expected image fields for Multer
const imageFields = [
    { fieldName: 'cover', dbPath: 'coverPath' },
    { fieldName: 'titlePhoto', dbPath: 'titlePhotoPath' },
    { fieldName: 'filmPhoto', dbPath: 'filmPhotoPath' },
    { fieldName: 'fotoDirector', dbPath: 'directorImagePath' },
    { fieldName: 'fotoActor1', dbPath: 'actor1ImagePath' },
    { fieldName: 'fotoActor2', dbPath: 'actor2ImagePath' },
    { fieldName: 'fotoActor3', dbPath: 'actor3ImagePath' },
];
const uploadFields = imageFields.map(field => ({ name: field.fieldName, maxCount: 1 }));

// ----------------------------------------------------
//  RUTAS GENERALES
// ----------------------------------------------------
router.get('/', (req, res) => {
    res.redirect('/indice');
});

router.get('/add', (req, res) => {
    res.render('add');
});

// ----------------------------------------------------
//  RUTAS AJAX (VALIDACIONES)
// ----------------------------------------------------
router.get('/checkTitle', async (req, res) => {
    try {
        const title = req.query.title;
        // Buscamos coincidencia exacta ignorando mayúsculas
        const existing = await moviesColl.findOne({ 
            title: { $regex: new RegExp(`^${title}$`, 'i') } 
        });
        res.json({ available: !existing }); 
    } catch (err) {
        res.status(500).json({ available: false });
    }
});

// ----------------------------------------------------
//  MAIN INDEX ROUTE
// ----------------------------------------------------
router.get('/indice', async (req, res) => {
    try {
        const collection = moviesColl;
        const currentPage = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search ? req.query.search.trim() : null;
        const filterGenre = req.query.genre ? req.query.genre.trim() : null;

        const query = {};
        if (searchQuery) query.title = { $regex: new RegExp(searchQuery, 'i') };
        if (filterGenre && filterGenre !== 'All') query.genre = filterGenre;

        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const films = await collection.find(query)
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        const normalizedFilms = films.map(f => ({ ...f, posterUrl: f.coverPath }));

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
        console.error('❌ ERROR retrieving index data:', err);
        res.status(500).send('Error loading the main page.');
    }
});

// ----------------------------------------------------
//  POST /addFilm (AJAX / JSON Response)
// ----------------------------------------------------
router.post("/addFilm", (req, res) => {
    const uploadMiddleware = upload.fields(uploadFields);

    uploadMiddleware(req, res, async (err) => {
        // ERROR MULTER
        if (err) {
            console.error('❌ File Upload ERROR:', err);
            cleanupFiles(req.files);
            return res.status(400).json({ success: false, message: `Error uploading files: ${err.message}` });
        }

        const files = req.files;
        const body = req.body;
        const title = body.title ? body.title.trim() : '';

        try {
            // Validaciones básicas de servidor
            const { description, releaseYear, director, cast, genre, ageClassification } = body;
            
            // Validación campos requeridos
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                cleanupFiles(files);
                return res.status(400).json({ success: false, message: 'All required fields must be completed.' });
            }
            
            // Validación formato título
            if (/^[a-z]/.test(title)) {
                cleanupFiles(files);
                return res.status(400).json({ success: false, message: `The title "${title}" must start with an uppercase letter.` });
            }

            // Validación duplicados
            const existingMovie = await moviesColl.findOne({ title: title });
            if (existingMovie) {
                cleanupFiles(files);
                return res.status(409).json({ success: false, message: `There is already a movie with that title "${title}".` });
            }

            const getFilePath = (fieldName) => {
                return files && files[fieldName] && files[fieldName][0]
                    ? addUploadPrefix(files[fieldName][0].filename)
                    : null;
            };

            const movie = {
                title,
                description,
                releaseYear: Number(releaseYear),
                genre: Array.isArray(genre) ? genre : [genre],
                rating: body.rating ? Number(body.rating) : undefined,
                ageClassification,
                director,
                // Rutas de imágenes
                coverPath: getFilePath('cover'),
                titlePhotoPath: getFilePath('titlePhoto'),
                filmPhotoPath: getFilePath('filmPhoto'),
                directorImagePath: getFilePath('fotoDirector'),
                actor1ImagePath: getFilePath('fotoActor1'),
                actor2ImagePath: getFilePath('fotoActor2'),
                actor3ImagePath: getFilePath('fotoActor3'),
                cast: Array.isArray(cast) ? cast : [cast],
                duration: body.duration,
                language: Array.isArray(body.language) ? body.language : (body.language ? [body.language] : []),
                comments: []
            };

            const result = await moviesColl.insertOne(movie);
            
            // ÉXITO: Respondemos JSON para que el JS del cliente redirija
            return res.json({ 
                success: true, 
                message: "Film added successfully", 
                redirectUrl: `/Ej/${result.insertedId}` 
            });

        } catch (err) {
            cleanupFiles(req.files);
            console.error('❌ ERROR inserting movie:', err);
            return res.status(500).json({ success: false, message: `Server error: ${err.message}` });
        }
    });
});

// ----------------------------------------------------
//  DETAIL ROUTE (/Ej/:id)
// ----------------------------------------------------
router.get('/Ej/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        if (!ObjectId.isValid(movieId)) return res.status(400).send("Invalid ID");

        const movieObjectId = new ObjectId(movieId);
        const filmPipeline = await moviesColl.aggregate([
            { $match: { _id: movieObjectId } },
            {
                $lookup: {
                    from: "comentaries",
                    localField: "comments",
                    foreignField: "_id",
                    as: "reviewsData"
                }
            }
        ]).toArray();
        const film = filmPipeline[0];
        if (!film) {
            return res.status(404).send("Film not found");
        }
        
        const castArray = (Array.isArray(film.cast) ? film.cast : [])
            .map((name, index) => ({
                name: name,
                imagePath: film[`actor${index + 1}ImagePath`]
            }))
            .filter(item => item.name);
            
        const filmNormalized = {
            ...film,
            movieId: film._id.toString(),
            reviews: Array.isArray(film.reviewsData) ? film.reviewsData : [],
            cast: castArray,
            language: Array.isArray(film.language) ? film.language : (film.language || []),
        };
        res.render('Ej', { ...filmNormalized });
    } catch (err) {
        console.error('❌ ERROR loading movie detail:', err);
        res.status(500).send(`Error loading the detail page: ${err.message}`);
    }
});

// ----------------------------------------------------
//  EDIT ROUTES (GET / POST JSON)
// ----------------------------------------------------
router.get('/edit/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        if (!ObjectId.isValid(movieId)) return res.status(400).send("Invalid ID");
        
        const film = await moviesColl.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send("Film not found for edition");
        }
        const genreArray = Array.isArray(film.genre) ? film.genre : (film.genre ? [film.genre] : []);
        const languageArray = Array.isArray(film.language) ? film.language : (film.language ? [film.language] : []);
        const castArray = Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []);
        
        const filmNormalized = {
            ...film,
            _id: film._id.toString(),
            actor1: castArray[0] || '', actor2: castArray[1] || '', actor3: castArray[2] || '',
            isAction: genreArray.includes('Action'), isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'), isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'), isAdventure: genreArray.includes('Adventure'), isOtherGenre: genreArray.includes('Other'),
            isEnglish: languageArray.includes('English'), isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'), isGerman: languageArray.includes('German'), isOtherLanguage: languageArray.includes('Other'),
        };
        res.render("add", { editing: true, film: filmNormalized });
    } catch (err) {
        console.error("❌ Error loading movie for editing:", err);
        res.redirect('/indice');
    }
});

// MODIFICADO: Ahora devuelve JSON para el Modal
router.post('/editFilm/:id', (req, res) => {
    const editUploadMiddleware = upload.fields(uploadFields);
    
    editUploadMiddleware(req, res, async (err) => {
        const files = req.files;
        if (err) {
            cleanupFiles(files);
            return res.status(400).json({ success: false, message: `Error uploading files: ${err.message}` });
        }

        try {
            const { id } = req.params;
            const title = req.body.title ? req.body.title.trim() : '';
            
            if (!ObjectId.isValid(id)) {
                cleanupFiles(files);
                return res.status(400).json({ success: false, message: 'Invalid ID' });
            }
            if (/^[a-z]/.test(title)) {
                cleanupFiles(files);
                return res.status(400).json({ success: false, message: 'Title must start with uppercase.' });
            }

            const oid = new ObjectId(id);
            const existingFilm = await moviesColl.findOne({ _id: oid });
            
            if (!existingFilm) {
                cleanupFiles(files);
                return res.status(404).json({ success: false, message: 'Movie not found.' });
            }

            // Comprobar si cambiaron el título a uno que YA existe (distinto del propio)
            if (title !== existingFilm.title) {
                 const duplicate = await moviesColl.findOne({ title: title });
                 if (duplicate) {
                     cleanupFiles(files);
                     return res.status(409).json({ success: false, message: 'Title already taken by another movie.' });
                 }
            }

            const updateFields = {
                title: title, 
                description: req.body.description, 
                releaseYear: parseInt(req.body.releaseYear),
                rating: req.body.rating ? Number(req.body.rating) : existingFilm.rating,
                ageClassification: req.body.ageClassification, 
                director: req.body.director, 
                duration: req.body.duration,
                genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),
                language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
                cast: Array.isArray(req.body.cast) ? req.body.cast.filter(c => c && c.trim() !== '') : [],
                updatedAt: new Date()
            };

            // Multer logic: only update path if new file uploaded
            for (const { fieldName, dbPath } of imageFields) {
                if (files && files[fieldName] && files[fieldName].length > 0) {
                    updateFields[dbPath] = addUploadPrefix(files[fieldName][0].filename);
                } else {
                    updateFields[dbPath] = existingFilm[dbPath];
                }
            }

            await moviesColl.updateOne({ _id: oid }, { $set: updateFields });
            
            // ÉXITO JSON
            return res.json({ 
                success: true, 
                message: "Film updated successfully", 
                redirectUrl: `/Ej/${id}` 
            });

        } catch (err) {
            cleanupFiles(req.files);
            console.error("❌ ERROR updating film:", err);
            return res.status(500).json({ success: false, message: `Error updating film: ${err.message}` });
        }
    });
});

// ----------------------------------------------------
//  COMMENTS & DELETION (LEGACY / STANDARD)
// ----------------------------------------------------

router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const movieId = req.params.id;
        const movieObjectId = new ObjectId(movieId);
        const { userName, rating, reviewText } = req.body;
        
        if (!userName || !rating || !reviewText || !movieId) {
             return res.render('error', { mensaje: 'All fields are required.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return' });
        }

        const result = await commentsColl.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: parseInt(rating),
            movieId: movieObjectId,
            createdAt: new Date()
        });

        await moviesColl.updateOne(
            { _id: movieObjectId },
            { $push: { comments: result.insertedId } }
        );

        return res.render('confirm', {
            type: 'review', action: 'added', title: `Review by ${userName}`,
            actiontype: 'review', routeDetalle: `/Ej/${movieId}`
        });
    } catch (err) {
        console.error('❌ ERROR adding review:', err);
        return res.render('error', { mensaje: `Error: ${err.message}`, rutaBoton: `/Ej/${req.params.id}`, textoBoton: 'Return' });
    }
});

router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    const { movieId, commentId } = req.params;
    try {
        if (!ObjectId.isValid(commentId) || !ObjectId.isValid(movieId)) {
            return res.render('error', { mensaje: 'Invalid ID.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return' });
        }
        const commentObjectId = new ObjectId(commentId);
        const movieObjectId = new ObjectId(movieId);

        await commentsColl.deleteOne({ _id: commentObjectId });
        await moviesColl.updateOne(
            { _id: movieObjectId },
            { $pull: { comments: commentObjectId } }
        );
        return res.render('confirm', {
            type: 'Successful Deletion', action: 'delete', actiontype: 'Comment', title: '',
            routeDetalle: `/Ej/${movieId}`, textoBoton: 'Return'
        });
    } catch (err) {
        console.error('❌ ERROR deleting comment:', err);
        return res.render('error', { mensaje: 'Error deleting comment.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return' });
    }
});

// Step 1: Deletion Confirmation
router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        const oid = new ObjectId(movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Movie not found');

        return res.render('confirm', {
            type: 'delete movie', title: movie.title,
            routeDetalle: `/deleteFilm/${movieId}/confirmed`,
            action: 'delete', actiontype: 'movie'
        });
    } catch (err) {
        return res.status(500).send('Error preparing delete confirmation');
    }
});

// Step 2: Execute Deletion
router.get('/deleteFilm/:id/confirmed', async (req, res) => {
    try {
        const { id } = req.params;
        const oid = new ObjectId(id);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Movie not found');

        const pathsToDelete = [
            movie.coverPath, movie.titlePhotoPath, movie.filmPhotoPath,
            movie.directorImagePath, movie.actor1ImagePath, movie.actor2ImagePath, movie.actor3ImagePath
        ].filter(p => p && p.startsWith('/Uploads/'));

        for (const rel of pathsToDelete) {
            const relClean = rel.replace(/^\/Uploads\//, '');
            const fullPath = path.join(UPLOADS_PATH, relClean);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }
        await commentsColl.deleteMany({ movieId: oid });
        await moviesColl.deleteOne({ _id: oid });
        return res.redirect('/indice');
    } catch (err) {
        return res.status(500).send('Error deleting the movie');
    }
});

router.get('/editComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        if (!ObjectId.isValid(commentId)) return res.status(400).send('Invalid comment ID.');

        const comment = await commentsColl.findOne({ _id: new ObjectId(commentId) });
        if (!comment) return res.status(404).send("Comment not found for editing.");

        res.render('edit-comment', {
            pageTitle: `Editing Comment for: ${comment.User_name}`,
            filmSlug: movieId, commentId: commentId,
            commentText: comment.description, commentRating: comment.Rating
        });
    } catch (err) {
        res.status(500).send(`Error loading comment: ${err.message}`);
    }
});

router.post('/updateComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const { reviewText, reviewRating } = req.body;
        if (!reviewText || !reviewRating || !ObjectId.isValid(commentId)) {
            return res.status(400).send('Missing required fields or invalid ID.');
        }
        await commentsColl.updateOne(
            { _id: new ObjectId(commentId) },
            { $set: { description: reviewText, Rating: parseInt(reviewRating), updatedAt: new Date() } }
        );
        res.render('confirm', {
            type: 'Edit review', action: 'edit', actiontype: 'review', title: '',
            routeDetalle: `/Ej/${movieId}`
        })
    } catch (err) {
        res.status(500).send(`Error updating comment: ${err.message}`);
    }
});

router.get("/api/films", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6; 
        const skip = (page - 1) * limit;

        const films = await moviesColl.find({})
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        res.json({ films });
    } catch (err) {
        console.error("Error loading films for infinite scroll:", err);
        res.status(500).json({ films: [] });
    }
});

export default router;