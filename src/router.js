import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId, MongoClient } from 'mongodb';
import multer from 'multer';
import { fileURLToPath } from "url";

const router = express.Router();

const uri = 'mongodb://localhost:27017/Softflix';
const client = new MongoClient(uri);
const db = client.db('Softflix');
const moviesColl = db.collection('Softflix');
const commentsColl = db.collection('comentaries');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..');
const UPLOADS_PATH = path.join(BASE_PATH, 'Uploads');

// Multer storage configuration
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

// Helper: Adds the access URL prefix (assuming Express serves '/Uploads')
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

router.get('/', (req, res) => {
    res.redirect('/indice');
});

router.get('/add', (req, res) => {
    res.render('add');
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

        // Pagination and filter logic
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
//  POST /addFilm (with Multer and Validation)
// ----------------------------------------------------
router.post("/addFilm", (req, res) => {
    // Using Multer as middleware
    const uploadMiddleware = upload.fields(uploadFields);

    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('❌ File Upload ERROR (Multer):', err);
            cleanupFiles(req.files);
            return res.render('error', { mensaje: `Error processing files: ${err.message}`, rutaBoton: '/add', textoBoton: 'Return to the form' });
        }
        const files = req.files;
        const body = req.body;
        const title = body.title ? body.title.trim() : '';
        try {
            // Validations
            const { description, releaseYear, director, cast, genre, ageClassification } = body;
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                cleanupFiles(files);
                return res.render('error', { mensaje: 'All required fields must be completed.', rutaBoton: '/add', textoBoton: 'Return to the form' });
            }
            if (/^[a-z]/.test(title)) {
                cleanupFiles(files);
                return res.render('error', { mensaje: `The film title "${title}" must start with an uppercase letter.`, rutaBoton: '/add', textoBoton: 'Return to the form' });
            }
            const moviesCollection = moviesColl;
            // Check for duplicates
            const existingMovie = await moviesCollection.findOne({ title: title });
            if (existingMovie) {
                cleanupFiles(files);
                return res.render('error', { mensaje: `There is already a movie with that title "${title}".`, rutaBoton: '/add', textoBoton: ' Return to the form' });
            }
            // Prepare image paths
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
                // Generated image paths
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

            // MongoDB Insertion
            const result = await moviesCollection.insertOne(movie);
            return res.render("confirm", {
                type: 'movie',
                title: movie.title,
                entityId: result.insertedId,
                action: 'add',
                routeDetalle: `/Ej/${result.insertedId}`,
                actiontype: 'movie'
            });
        } catch (err) {
            cleanupFiles(req.files);
            console.error('❌ ERROR inserting movie into the database:', err);
            res.render('error', { mensaje: `Error saving the film: ${err.message}`, rutaBoton: '/add', textoBoton: 'Return to the form' });
        }
    });
});

// ----------------------------------------------------
//  DETAIL ROUTE (/Ej/:id)
// ----------------------------------------------------
router.get('/Ej/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
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
        // Cast processing logic
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
//  POST /Ej/:id/addReview
// ----------------------------------------------------
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const movieId = req.params.id;
        const movieObjectId = new ObjectId(movieId);
        const { userName, rating, reviewText } = req.body;
        if (!userName || !rating || !reviewText || !movieId) {
            return res.render('error', { mensaje: 'All required fields must be completed for the review.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to the form' });
        }
        // 1. Insert the comment
        const result = await commentsColl.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: parseInt(rating),
            movieId: movieObjectId,
            createdAt: new Date()
        });
        // 2. Reference the comment in the movie 
        await moviesColl.updateOne(
            { _id: movieObjectId },
            { $push: { comments: result.insertedId } }
        );
        return res.render('confirm', {
            type: 'review',
            action: 'added',
            title: `Review by ${userName}`,
            actiontype: 'review',
            routeDetalle: `/Ej/${movieId}`
        });
    } catch (err) {
        console.error('❌ ERROR adding review:', err);
        return res.render('error', {
            mensaje: `Error adding the review: ${err.message}`,
            rutaBoton: `/Ej/${req.params.id}`,
            textoBoton: 'Return to the form'
        });
    }
});
// ----------------------------------------------------
//  POST /deleteComment/:movieId/:commentId
// ----------------------------------------------------
router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    const { movieId, commentId } = req.params;
    try {
        if (!ObjectId.isValid(commentId) || !ObjectId.isValid(movieId)) {
            return res.render('error', { mensaje: 'Invalid ID.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to film details' });
        }
        const commentObjectId = new ObjectId(commentId);
        const movieObjectId = new ObjectId(movieId);
        // 1. Delete from the comments collection
        await commentsColl.deleteOne({ _id: commentObjectId });
        // 2. Remove the reference from the movie
        await moviesColl.updateOne(
            { _id: movieObjectId },
            { $pull: { comments: commentObjectId } }
        );
        return res.render('confirm', {
            type: 'Successful Deletion',
            action: 'delete',
            actiontype: 'Comment',
            title: '',
            routeDetalle: `/Ej/${movieId}`,
            textoBoton: 'Return to film details'
        });
    } catch (err) {
        console.error('❌ ERROR deleting comment:', err);
        return res.render('error', { mensaje: 'An unexpected error occurred while deleting the comment.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to film details' });
    }
});
// ----------------------------------------------------
//  GET /edit/:id and POST /editFilm/:id 
// ----------------------------------------------------

router.get('/edit/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const film = await moviesColl.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send("Film not found for edition");
        }
        // Data normalization for the form (including checkbox flags)
        const genreArray = Array.isArray(film.genre) ? film.genre : (film.genre ? [film.genre] : []);
        const languageArray = Array.isArray(film.language) ? film.language : (film.language ? [film.language] : []);
        const castArray = Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []);
        const filmNormalized = {
            ...film,
            _id: film._id.toString(),
            actor1: castArray[0] || '', actor2: castArray[1] || '', actor3: castArray[2] || '',
            // (Flags for Mustache)
            isAction: genreArray.includes('Action'), isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'), isScifi: genreArray.includes('Science-Fiction'),
            isEnglish: languageArray.includes('English'), isSpanish: languageArray.includes('Spanish'),
        };
        res.render("add", { editing: true, film: filmNormalized });
    } catch (err) {
        console.error("❌ Error loading movie for editing:", err);
        res.redirect('/error');
    }
});

router.post('/editFilm/:id', (req, res) => {
    const editUploadMiddleware = upload.fields(uploadFields);
    editUploadMiddleware(req, res, async (err) => {
        const files = req.files;
        if (err) {
            cleanupFiles(files);
            return res.render('error', { mensaje: `Error processing files during update: ${err.message}`, rutaBoton: `/edit/${req.params.id}`, textoBoton: 'Return to the form' });
        }
        try {
            const { id } = req.params;
            const title = req.body.title ? req.body.title.trim() : '';
            if (!ObjectId.isValid(id) || /^[a-z]/.test(title)) {
                cleanupFiles(files);
                return res.render('error', { mensaje: 'Invalid ID or title must start with uppercase.', rutaBoton: `/edit/${id}`, textoBoton: 'Return to the form' });
            }
            const oid = new ObjectId(id);
            const existingFilm = await moviesColl.findOne({ _id: oid });
            if (!existingFilm) {
                cleanupFiles(files);
                return res.status(404).render('error', { mensaje: 'Movie not found for update.', rutaBoton: '/indice', textoBoton: 'Go to Index' });
            }
            const updateFields = {
                title: title, description: req.body.description, releaseYear: parseInt(req.body.releaseYear),
                rating: req.body.rating ? Number(req.body.rating) : existingFilm.rating,
                ageClassification: req.body.ageClassification, director: req.body.director, duration: req.body.duration,
                genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),
                language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
                cast: Array.isArray(req.body.cast) ? req.body.cast.filter(c => c && c.trim() !== '') : [],
                updatedAt: new Date()
            };
            // Multer logic: update path only if a new file is uploaded
            for (const { fieldName, dbPath } of imageFields) {
                if (files && files[fieldName] && files[fieldName].length > 0) {
                    updateFields[dbPath] = addUploadPrefix(files[fieldName][0].filename);
                } else {
                    // Preserve the existing path if no new file is uploaded
                    updateFields[dbPath] = existingFilm[dbPath];
                }
            }
            // Update the document in MongoDB
            await moviesColl.updateOne({ _id: oid }, { $set: updateFields });
            res.render('confirm', { type: 'Edit Film', action: 'edit', actiontype: 'film', title: updateFields.title, routeDetalle: `/Ej/${id}` });
        } catch (err) {
            cleanupFiles(req.files);
            console.error("❌ ERROR updating film:", err);
            res.status(500).render('error', { mensaje: `Error updating film: ${err.message}`, rutaBoton: `/Ej/${req.params.id}`, textoBoton: 'Return to Film' });
        }
    });
});


// ----------------------------------------------------
//  Deletion Routes
// ----------------------------------------------------

// Step 1: Deletion Confirmation
router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        const oid = new ObjectId(movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Movie not found');

        return res.render('confirm', {
            type: 'delete movie',
            title: movie.title,
            routeDetalle: `/deleteFilm/${movieId}/confirmed`,
            action: 'delete',
            actiontype: 'movie'
        });

    } catch (err) {
        console.error('Error preparing delete confirmation:', err);
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
            // Use the absolute UPLOADS_PATH
            const fullPath = path.join(UPLOADS_PATH, relClean);
            if (fs.existsSync(fullPath)) {
                // fs.unlinkSync is used for synchronous deletion
                fs.unlinkSync(fullPath);
            }
        }
        // Delete associated comments
        await commentsColl.deleteMany({ movieId: oid });
        // Delete the movie itself
        await moviesColl.deleteOne({ _id: oid });
        return res.redirect('/indice');
    } catch (err) {
        console.error('Error deleting movie:', err);
        return res.status(500).send('Error deleting the movie');
    }
});
// Route to display the comment editing form
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
        console.error("❌ ERROR loading comment for editing:", err);
        res.status(500).send(`Error loading comment: ${err.message}`);
    }
});

// Route to update the comment in the DB
router.post('/updateComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const { reviewText, reviewRating } = req.body;
        if (!reviewText || !reviewRating || !ObjectId.isValid(commentId)) {
            return res.status(400).send('Missing required fields or invalid ID.');
        }
        // Update the comment document
        await commentsColl.updateOne(
            { _id: new ObjectId(commentId) },
            { $set: { description: reviewText, Rating: parseInt(reviewRating), updatedAt: new Date() } }
        );
        res.render('confirm', {
            type: 'Edit review', action: 'edit', actiontype: 'review', title: '',
            routeDetalle: `/Ej/${movieId}`
        })
    } catch (err) {
        console.error("❌ ERROR updating comment:", err);
        res.status(500).send(`Error updating comment: ${err.message}`);
    }
});

export default router;