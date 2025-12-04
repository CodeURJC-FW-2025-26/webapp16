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

if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_PATH),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});
const upload = multer({ storage: storage });

const ITEMS_PER_PAGE = 6;

// List of image fields (reused in Add and Edit)
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
// MAIN ROUTES
// ----------------------------------------------------

router.get('/', (req, res) => res.redirect('/indice'));
router.get('/add', (req, res) => res.render('add'));


// ----------------------------------------------------
//  INDEX ROUTE
// ----------------------------------------------------
router.get('/indice', async (req, res) => {
    try {
        const currentPage = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search ? req.query.search.trim() : null;
        const filterGenre = req.query.genre ? req.query.genre.trim() : null;

        const query = {};
        if (searchQuery) query.title = { $regex: new RegExp(searchQuery, 'i') };
        if (filterGenre && filterGenre !== 'All') query.genre = filterGenre;

        const totalItems = await moviesColl.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const films = await moviesColl.find(query)
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // Simplified generation of links and genres
        const baseUrl = `/indice?${searchQuery ? `search=${encodeURIComponent(searchQuery)}&` : ''}${filterGenre ? `genre=${encodeURIComponent(filterGenre)}&` : ''}`;
        const paginationLinks = Array.from({ length: totalPages }, (_, i) => ({
            page: i + 1, url: `${baseUrl}page=${i + 1}`, isCurrent: i + 1 === currentPage
        }));

        const genresCursor = await moviesColl.aggregate([
            { $unwind: "$genre" }, { $group: { _id: "$genre" } }, { $sort: { _id: 1 } }
        ]).toArray();
        const availableGenres = genresCursor.map(g => ({
            name: g._id, isActive: g._id === filterGenre,
            url: `/indice?genre=${encodeURIComponent(g._id)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`
        }));
        res.render("indice", {
            films: films.map(f => ({ ...f, posterUrl: f.coverPath })),
            pagination: paginationLinks,
            hasPagination: totalPages > 1,
            prevUrl: `${baseUrl}page=${Math.max(1, currentPage - 1)}`,
            nextUrl: `${baseUrl}page=${Math.min(totalPages, currentPage + 1)}`,
            isPrevDisabled: currentPage <= 1,
            isNextDisabled: currentPage >= totalPages,
            currentSearch: searchQuery, currentFilter: filterGenre, genres: availableGenres
        });
    } catch (err) {
        console.error('❌ ERROR retrieving index data:', err);
        res.status(500).send('Error loading the main page.');
    }
});
// ----------------------------------------------------
// ➡️ POST /addFilm
// ----------------------------------------------------
router.post("/addFilm", upload.fields(uploadFields), async (req, res) => {
    const files = req.files;
    const body = req.body;
    const title = body.title ? body.title.trim() : '';
    try {
        const { description, releaseYear, director, genre, ageClassification } = body;
        const cast = Array.isArray(body.cast) ? body.cast.filter(c => c && c.trim() !== '') : (body.cast ? [body.cast] : []);
        //  Basic validation
        if (!title || !description || !releaseYear || !director || cast.length === 0 || !genre || !ageClassification) {
            cleanupFiles(files);
            return res.render('error', { mensaje: 'All required fields must be completed.', rutaBoton: '/add', textoBoton: 'Return to the form' });
        }
        if (/^[a-z]/.test(title)) {
            cleanupFiles(files);
            return res.render('error', { mensaje: `The film title "${title}" must start with an uppercase letter.`, rutaBoton: '/add', textoBoton: 'Return to the form' });
        }
        const existingMovie = await moviesColl.findOne({ title: title });
        if (existingMovie) {
            cleanupFiles(files);
            return res.render('error', { mensaje: `There is already a movie with that title "${title}".`, rutaBoton: '/add', textoBoton: ' Return to the form' });
        }
        // Use helper to dynamically generate image paths
        const imagePaths = mapUploadedFilesToDbPaths(files);
        const movie = {
            title, description, releaseYear: Number(releaseYear),
            genre: Array.isArray(genre) ? genre : [genre],
            rating: body.rating ? Number(body.rating) : undefined, ageClassification, director,
            cast, duration: body.duration,
            language: Array.isArray(body.language) ? body.language : (body.language ? [body.language] : []),
            comments: [],
            ...imagePaths // Dynamic inclusion of all image paths
        };
        const result = await moviesColl.insertOne(movie);
        return res.render("confirm", {
            type: 'movie', title: movie.title, entityId: result.insertedId,
            action: 'add', routeDetalle: `/Ej/${result.insertedId}`, actiontype: 'movie'
        });
    } catch (err) {
        cleanupFiles(req.files);
        console.error('❌ ERROR inserting movie into the database:', err);
        res.render('error', { mensaje: `Error saving the film: ${err.message}`, rutaBoton: '/add', textoBoton: 'Return to the form' });
    }
});
// ----------------------------------------------------
//  DETAIL ROUTE (/Ej/:id)
// ----------------------------------------------------
router.get('/Ej/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const movieObjectId = new ObjectId(movieId);
        // Using $lookup to get related comments (More concise)
        const [film] = await moviesColl.aggregate([
            { $match: { _id: movieObjectId } },
            { $lookup: { from: "comentaries", localField: "comments", foreignField: "_id", as: "reviewsData" } }
        ]).toArray();

        if (!film) return res.status(404).send("Film not found");
        const castArray = (Array.isArray(film.cast) ? film.cast : [])
            .map((name, index) => ({
                name: name,
                imagePath: film[`actor${index + 1}ImagePath`]
            }))
            .filter(item => item.name);
        const filmNormalized = {
            ...film, movieId: film._id.toString(),
            reviews: film.reviewsData || [],
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
//  POST /Ej/:id/addReview & Deletion
// ----------------------------------------------------
router.post('/Ej/:id/addReview', async (req, res) => {
    const movieId = req.params.id;
    try {
        const movieObjectId = new ObjectId(movieId);
        const { userName, rating, reviewText } = req.body;
        if (!userName || !rating || !reviewText || !movieId) {
            return res.render('error', { mensaje: 'All required fields must be completed for the review.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to the form' });
        }
        const result = await commentsColl.insertOne({
            User_name: userName, description: reviewText, Rating: parseInt(rating), movieId: movieObjectId, createdAt: new Date()
        });
        await moviesColl.updateOne({ _id: movieObjectId }, { $push: { comments: result.insertedId } });
        return res.render('confirm', { type: 'review', action: 'added', title: `Review by ${userName}`, actiontype: 'review', routeDetalle: `/Ej/${movieId}` });
    } catch (err) {
        console.error('❌ ERROR adding review:', err);
        return res.render('error', { mensaje: `Error adding the review: ${err.message}`, rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to the form' });
    }
});

router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    const { movieId, commentId } = req.params;
    try {
        if (!ObjectId.isValid(commentId) || !ObjectId.isValid(movieId)) {
            return res.render('error', { mensaje: 'Invalid ID.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to film details' });
        }
        const commentObjectId = new ObjectId(commentId);
        const movieObjectId = new ObjectId(movieId);

        await commentsColl.deleteOne({ _id: commentObjectId });
        await moviesColl.updateOne({ _id: movieObjectId }, { $pull: { comments: commentObjectId } });
        return res.render('confirm', { type: 'Successful Deletion', action: 'delete', actiontype: 'Comment', title: '', routeDetalle: `/Ej/${movieId}`, textoBoton: 'Return to film details' });

    } catch (err) {
        console.error('❌ ERROR deleting comment:', err);
        return res.render('error', { mensaje: 'An unexpected error occurred while deleting the comment.', rutaBoton: `/Ej/${movieId}`, textoBoton: 'Return to film details' });
    }
});
// ----------------------------------------------------
// ➡️ GET /edit/:id and POST /editFilm/:id 
// ----------------------------------------------------
router.get('/edit/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const film = await moviesColl.findOne({ _id: new ObjectId(movieId) });

        if (!film) return res.status(404).send("Film not found for edition");

        const genreArray = Array.isArray(film.genre) ? film.genre : (film.genre ? [film.genre] : []);
        const languageArray = Array.isArray(film.language) ? film.language : (film.language ? [film.language] : []);
        const castArray = Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []);
        const filmNormalized = {
            ...film, _id: film._id.toString(),
            actor1: castArray[0] || '', actor2: castArray[1] || '', actor3: castArray[2] || '',
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

router.post('/editFilm/:id', upload.fields(uploadFields), async (req, res) => {
    const files = req.files;
    const { id } = req.params;
    try {
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
        const cast = Array.isArray(req.body.cast) ? req.body.cast.filter(c => c && c.trim() !== '') : [];
        const updateFields = {
            title: title, description: req.body.description, releaseYear: parseInt(req.body.releaseYear),
            rating: req.body.rating ? Number(req.body.rating) : existingFilm.rating,
            ageClassification: req.body.ageClassification, director: req.body.director, duration: req.body.duration,
            genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),
            language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
            cast: cast,
            updatedAt: new Date(),
            // Use helper to dynamically generate image paths, preserving old ones
            ...mapUploadedFilesToDbPaths(files, existingFilm)
        };
        await moviesColl.updateOne({ _id: oid }, { $set: updateFields });
        res.render('confirm', { type: 'Edit Film', action: 'edit', actiontype: 'film', title: updateFields.title, routeDetalle: `/Ej/${id}` });
    } catch (err) {
        cleanupFiles(files);
        console.error("❌ ERROR updating film:", err);
        res.status(500).render('error', { mensaje: `Error updating film: ${err.message}`, rutaBoton: `/Ej/${id}`, textoBoton: 'Return to Film' });
    }
});
// ----------------------------------------------------
// ➡️ Deletion Routes
// ----------------------------------------------------
router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        const movie = await moviesColl.findOne({ _id: new ObjectId(movieId) });
        if (!movie) return res.status(404).send('Movie not found');

        return res.render('confirm', {
            type: 'delete movie', title: movie.title,
            routeDetalle: `/deleteFilm/${movieId}/confirmed`, action: 'delete', actiontype: 'movie'
        });
    } catch (err) {
        console.error('Error preparing delete confirmation:', err);
        return res.status(500).send('Error preparing delete confirmation');
    }
});

router.get('/deleteFilm/:id/confirmed', async (req, res) => {
    try {
        const { id } = req.params;
        const oid = new ObjectId(id);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Movie not found');

        // Delete associated files
        const pathsToDelete = imageFields
            .map(field => movie[field.dbPath])
            .filter(p => p && p.startsWith('/Uploads/'));

        for (const rel of pathsToDelete) {
            const relClean = rel.replace(/^\/Uploads\//, '');
            const fullPath = path.join(UPLOADS_PATH, relClean);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }

        await commentsColl.deleteMany({ movieId: oid });
        await moviesColl.deleteOne({ _id: oid });
        return res.redirect('/indice');
    } catch (err) {
        console.error('Error deleting movie:', err);
        return res.status(500).send('Error deleting the movie');
    }
});
// ----------------------------------------------------
//  Comment Editing Routes
// ----------------------------------------------------
router.get('/editComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
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
        console.error("❌ ERROR updating comment:", err);
        res.status(500).send(`Error updating comment: ${err.message}`);
    }
});

export default router;