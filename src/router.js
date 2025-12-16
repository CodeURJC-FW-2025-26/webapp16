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

// --- DIRECTORIOS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..');
const UPLOADS_PATH = path.join(BASE_PATH, 'Uploads');

// --- VARIABLES GLOBALES VALIDACIONES ---
const existingUsernames = ['admin', 'root', 'moderator', 'test'];

// --- RUTAS VALIDACIÓN EXTRA ---
router.get('/checkInfo', (req, res) => {
    let info = req.query.info;
    let isValid = info && !info.toLowerCase().includes('banned');
    res.json({ valid: isValid, message: isValid ? 'Info is valid' : `Info '${info}' not valid` });
});

router.post("/textToUppercase", (req, res) => {
    let text = req.body.text || "";
    res.json({ text: text, textUppercase: text.toUpperCase() });
});

router.get("/availableUsername", (req, res) => {
    let username = req.query.username;
    let isAvailable = existingUsernames.indexOf(username) === -1;
    res.json({ available: isAvailable, message: isAvailable ? 'Available' : 'Username is taken' });
});

// --- HELPER MULTER ---
const cleanupFiles = (files) => {
    if (!files) return;
    Object.keys(files).forEach(key => {
        files[key].forEach(file => {
            const filePath = path.join(UPLOADS_PATH, file.filename);
            fs.unlink(filePath, (err) => { if (err) console.error(err); });
        });
    });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, UPLOADS_PATH); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});
const upload = multer({ storage: storage });
const ITEMS_PER_PAGE = 6;

const addUploadPrefix = (filename) => filename ? `/Uploads/${filename}` : null;

const imageFields = [
    { fieldName: 'cover', dbPath: 'coverPath' }, { fieldName: 'titlePhoto', dbPath: 'titlePhotoPath' },
    { fieldName: 'filmPhoto', dbPath: 'filmPhotoPath' }, { fieldName: 'fotoDirector', dbPath: 'directorImagePath' },
    { fieldName: 'fotoActor1', dbPath: 'actor1ImagePath' }, { fieldName: 'fotoActor2', dbPath: 'actor2ImagePath' },
    { fieldName: 'fotoActor3', dbPath: 'actor3ImagePath' },
];
const uploadFields = imageFields.map(field => ({ name: field.fieldName, maxCount: 1 }));

// --- RUTAS BÁSICAS ---
router.get('/', (req, res) => res.redirect('/indice'));
router.get('/add', (req, res) => res.render('add'));

// --- VALIDACIÓN AJAX TÍTULO ---
router.get('/checkTitle', async (req, res) => {
    try {
        const title = req.query.title;
        const existing = await moviesColl.findOne({ title: { $regex: new RegExp(`^${title}$`, 'i') } });
        res.json({ available: !existing });
    } catch (err) { res.status(500).json({ available: false }); }
});

// --- ÍNDICE ---
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

        const films = await moviesColl.find(query).sort({ releaseYear: -1 }).skip(skip).limit(ITEMS_PER_PAGE).toArray();
        const normalizedFilms = films.map(f => ({ ...f, posterUrl: f.coverPath }));

        const paginationLinks = [];
        const baseUrl = `/indice?${searchQuery ? `search=${encodeURIComponent(searchQuery)}&` : ''}${filterGenre ? `genre=${encodeURIComponent(filterGenre)}&` : ''}`;
        for (let i = 1; i <= totalPages; i++) paginationLinks.push({ page: i, url: `${baseUrl}page=${i}`, isCurrent: i === currentPage });

        const genresCursor = await moviesColl.aggregate([{ $unwind: "$genre" }, { $group: { _id: "$genre" } }, { $sort: { _id: 1 } }]).toArray();
        const availableGenres = genresCursor.map(g => ({
            name: g._id, isActive: g._id === filterGenre,
            url: `/indice?genre=${encodeURIComponent(g._id)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`
        }));

        res.render("indice", {
            films: normalizedFilms, pagination: paginationLinks, hasPagination: totalPages > 1,
            prevUrl: `${baseUrl}page=${Math.max(1, currentPage - 1)}`, nextUrl: `${baseUrl}page=${Math.min(totalPages, currentPage + 1)}`,
            isPrevDisabled: currentPage <= 1, isNextDisabled: currentPage >= totalPages,
            currentSearch: searchQuery, currentFilter: filterGenre, genres: availableGenres
        });
    } catch (err) { res.status(500).send('Error loading page.'); }
});

// --- ADD FILM ---
router.post("/addFilm", (req, res) => {
    const uploadMiddleware = upload.fields(uploadFields);
    uploadMiddleware(req, res, async (err) => {
        if (err) { cleanupFiles(req.files); return res.status(400).json({ success: false, message: err.message }); }
        const files = req.files;
        const body = req.body;
        const title = body.title ? body.title.trim() : '';

        try {
            if (!title || !body.description || !body.releaseYear || !body.director || !body.ageClassification) {
                cleanupFiles(files); return res.status(400).json({ success: false, message: 'Missing fields.' });
            }
            if (/^[a-z]/.test(title)) {
                cleanupFiles(files); return res.status(400).json({ success: false, message: 'Title must start with Uppercase.' });
            }
            const existing = await moviesColl.findOne({ title: title });
            if (existing) { cleanupFiles(files); return res.status(409).json({ success: false, message: 'Title already exists.' }); }

            const getFilePath = (fieldName) => files && files[fieldName] && files[fieldName][0] ? addUploadPrefix(files[fieldName][0].filename) : null;
            
            const movie = {
                title, description: body.description, releaseYear: Number(body.releaseYear),
                genre: Array.isArray(body.genre) ? body.genre : [body.genre],
                rating: body.rating ? Number(body.rating) : undefined, ageClassification: body.ageClassification,
                director: body.director,
                coverPath: getFilePath('cover'), titlePhotoPath: getFilePath('titlePhoto'),
                filmPhotoPath: getFilePath('filmPhoto'), directorImagePath: getFilePath('fotoDirector'),
                actor1ImagePath: getFilePath('fotoActor1'), actor2ImagePath: getFilePath('fotoActor2'), actor3ImagePath: getFilePath('fotoActor3'),
                cast: Array.isArray(body.cast) ? body.cast : [body.cast],
                duration: body.duration, language: Array.isArray(body.language) ? body.language : [body.language],
                comments: []
            };
            const result = await moviesColl.insertOne(movie);
            return res.json({ success: true, message: "Film added.", redirectUrl: `/Ej/${result.insertedId}` });
        } catch (err) { cleanupFiles(req.files); return res.status(500).json({ success: false, message: err.message }); }
    });
});

// --- EDIT FILM ---
router.get('/edit/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) return res.redirect('/indice');
        const film = await moviesColl.findOne({ _id: new ObjectId(req.params.id) });
        if (!film) return res.redirect('/indice');
        // Normalización básica
        const castArray = Array.isArray(film.cast) ? film.cast : [film.cast];
        const genreArray = Array.isArray(film.genre) ? film.genre : [film.genre];
        const languageArray = Array.isArray(film.language) ? film.language : [film.language];

        const filmNormalized = {
            ...film, _id: film._id.toString(),
            actor1: castArray[0] || '', actor2: castArray[1] || '', actor3: castArray[2] || '',
            // Flags para checkboxes
            isAction: genreArray.includes('Action'), isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'), isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'), isAdventure: genreArray.includes('Adventure'), isOtherGenre: genreArray.includes('Other'),
            isEnglish: languageArray.includes('English'), isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'), isGerman: languageArray.includes('German'), isOtherLanguage: languageArray.includes('Other'),
            // Paths actuales para preview
            currentCoverPath: film.coverPath, currentTitlePhotoPath: film.titlePhotoPath, currentFilmPhotoPath: film.filmPhotoPath,
            currentDirectorImagePath: film.directorImagePath, currentActor1ImagePath: film.actor1ImagePath,
            currentActor2ImagePath: film.actor2ImagePath, currentActor3ImagePath: film.actor3ImagePath
        };
        res.render("add", { editing: true, film: filmNormalized });
    } catch (err) { res.redirect('/indice'); }
});

router.post('/editFilm/:id', (req, res) => {
    const uploadMiddleware = upload.fields(uploadFields);
    uploadMiddleware(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        try {
            const { id } = req.params;
            const title = req.body.title ? req.body.title.trim() : '';
            if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
            
            const existingFilm = await moviesColl.findOne({ _id: new ObjectId(id) });
            if (!existingFilm) return res.status(404).json({ success: false, message: 'Not found.' });
            
            if (title !== existingFilm.title) {
                const dup = await moviesColl.findOne({ title: title });
                if (dup) return res.status(409).json({ success: false, message: 'Title taken.' });
            }

            const updateFields = {
                title, description: req.body.description, releaseYear: parseInt(req.body.releaseYear),
                rating: req.body.rating ? Number(req.body.rating) : existingFilm.rating,
                ageClassification: req.body.ageClassification, director: req.body.director,
                duration: req.body.duration, updatedAt: new Date(),
                genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),
                language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
                cast: Array.isArray(req.body.cast) ? req.body.cast.filter(c => c && c.trim() !== '') : [],
            };

            for (const { fieldName, dbPath } of imageFields) {
                const deleteField = req.body[`delete_${fieldName}`];
                const fileUploaded = req.files && req.files[fieldName] && req.files[fieldName].length > 0;

                if (deleteField === 'true') { // Borrar existente
                    if (existingFilm[dbPath] && existingFilm[dbPath].startsWith('/Uploads/')) {
                        const p = path.join(UPLOADS_PATH, existingFilm[dbPath].replace(/^\/Uploads\//, ''));
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    }
                    updateFields[dbPath] = fileUploaded ? addUploadPrefix(req.files[fieldName][0].filename) : null;
                } else if (fileUploaded) { // Reemplazar
                    if (existingFilm[dbPath] && existingFilm[dbPath].startsWith('/Uploads/')) {
                        const p = path.join(UPLOADS_PATH, existingFilm[dbPath].replace(/^\/Uploads\//, ''));
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    }
                    updateFields[dbPath] = addUploadPrefix(req.files[fieldName][0].filename);
                } else { // Mantener
                    updateFields[dbPath] = existingFilm[dbPath];
                }
            }
            await moviesColl.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
            return res.json({ success: true, message: "Updated.", redirectUrl: `/Ej/${id}` });
        } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
    });
});

// --- Detail Page ---
router.get('/Ej/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) return res.status(400).send("Invalid ID");
        const movieObjectId = new ObjectId(req.params.id);
        const film = await moviesColl.findOne({ _id: movieObjectId });
        if (!film) return res.status(404).send("Film not found");

        let reviews = [];
        if (film.comments && film.comments.length > 0) {
            reviews = await commentsColl.find({ _id: { $in: film.comments } }).toArray();
        }

        const castArray = (Array.isArray(film.cast) ? film.cast : []).map((name, i) => ({
            name: name, imagePath: film[`actor${i + 1}ImagePath`]
        })).filter(i => i.name);

        res.render('Ej', {
            ...film, movieId: film._id.toString(),
            reviews: reviews, cast: castArray,
        });
    } catch (err) { res.status(500).send(err.message); }
});

// --- REVIEWS ---
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const { userName, rating, reviewText } = req.body;
        if (!userName || !rating || !reviewText) return res.status(400).json({ success: false, message: 'Missing fields.' });
        if (existingUsernames.includes(userName)) return res.status(409).json({ success: false, message: 'Username taken (Backend).' });

        const result = await commentsColl.insertOne({
            User_name: userName, description: reviewText, Rating: parseInt(rating),
            movieId: new ObjectId(req.params.id), createdAt: new Date()
        });
        await moviesColl.updateOne({ _id: new ObjectId(req.params.id) }, { $push: { comments: result.insertedId } });
        res.json({ success: true, message: 'Comment added.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    try {
        const commentId = new ObjectId(req.params.commentId);
        const movieId = new ObjectId(req.params.movieId);

        // Try to delete comment
        const result = await commentsColl.deleteOne({ _id: commentId });

        // If deleteOne = 0 we throw an error
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'The current comment can not be deleted because does not exist'
            });
        }
        await moviesColl.updateOne(
            { _id: movieId },
            { $pull: { comments: commentId } }
        );
        res.json({ success: true, message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});



router.post('/updateComment/:movieId/:commentId', async (req, res) => {
    try {
        const { reviewText, reviewRating } = req.body;
        const commentId = new ObjectId(req.params.commentId);

        const result = await commentsColl.updateOne(
            { _id: commentId },
            {
                $set: {
                    description: reviewText,
                    Rating: parseInt(reviewRating)
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'The comment can not be edited because it does not exist'
            });
        }
        res.json({ success: true, message: 'Updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// --- Delete movie ---
router.post('/deleteFilm', async (req, res) => {
    try {
        const oid = new ObjectId(req.body.movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (movie) {
            const paths = [movie.coverPath, movie.titlePhotoPath, movie.filmPhotoPath, movie.directorImagePath].filter(p => p && p.startsWith('/Uploads/'));
            paths.forEach(p => {
                const f = path.join(UPLOADS_PATH, p.replace(/^\/Uploads\//, ''));
                if (fs.existsSync(f)) fs.unlinkSync(f);
            });
            await commentsColl.deleteMany({ movieId: oid });
            await moviesColl.deleteOne({ _id: oid });
        }
        res.redirect('/indice');
    } catch(err) { res.redirect('/indice'); }
});

// --- SCROLL INFINITO (API) ---
router.get("/api/films", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search ? req.query.search.trim() : null;
        const filterGenre = req.query.genre ? req.query.genre.trim() : null;
        const limit = 6;
        const skip = (page - 1) * limit;

        const query = {};
        if (searchQuery) query.title = { $regex: new RegExp(searchQuery, 'i') };
        if (filterGenre && filterGenre !== 'All') query.genre = filterGenre;

        const films = await moviesColl.find(query).sort({ releaseYear: -1 }).skip(skip).limit(limit).toArray();
        res.json({ films });
    } catch (err) { res.status(500).json({ films: [] }); }
});

export default router;