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

// --- VARIABLES GLOBALES PARA VALIDACIONES (RECUPERADO) ---
// Lista simulada de usuarios "cogidos" para la validación availableUsername
const existingUsernames = ['admin', 'root', 'moderator', 'test'];

// --- RUTAS DE VALIDACIÓN EXTRA (RECUPERADAS) ---

router.get('/checkInfo', (req, res) => {
    let info = req.query.info;
    // Lógica de ejemplo: Valido si no incluye la palabra "banned"
    let isValid = info && !info.toLowerCase().includes('banned');
    let response = {
        valid: isValid,
        message: isValid ? 'Info is valid' : `Info '${info}' not valid`
    }
    res.json(response);
});

router.post("/textToUppercase", (req, res) => {
    let textData = req.body;
    let text = textData.text || "";
    let response = {
        text: text,
        textUppercase: text.toUpperCase(),
    };
    res.json(response);
});

router.get("/availableUsername", (req, res) => {
    let username = req.query.username;
    // Comprueba si está en la lista negra/existente
    let isAvailable = existingUsernames.indexOf(username) === -1;
    let response = {
        available: isAvailable,
        message: isAvailable ? 'Available' : 'Username is taken or invalid'
    };
    res.json(response);
});


// --- HELPER MULTER ---
const cleanupFiles = (files) => {
    if (!files) return;
    Object.keys(files).forEach(key => {
        files[key].forEach(file => {
            const filePath = path.join(UPLOADS_PATH, file.filename);
            fs.unlink(filePath, (err) => {
                if (err) console.error(`Error deleting file ${filePath}:`, err);
            });
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

const addUploadPrefix = (filename) => {
    if (!filename) return null;
    return `/Uploads/${filename}`;
};

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

// --- RUTAS BÁSICAS ---
router.get('/', (req, res) => res.redirect('/indice'));
router.get('/add', (req, res) => res.render('add'));

// --- VALIDACIÓN AJAX TÍTULO ---
router.get('/checkTitle', async (req, res) => {
    try {
        const title = req.query.title;
        const existing = await moviesColl.findOne({ title: { $regex: new RegExp(`^${title}$`, 'i') } });
        res.json({ available: !existing });
    } catch (err) {
        res.status(500).json({ available: false });
    }
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

        const films = await moviesColl.find(query)
            .sort({ releaseYear: -1 }).skip(skip).limit(ITEMS_PER_PAGE).toArray();

        const normalizedFilms = films.map(f => ({ ...f, posterUrl: f.coverPath }));

        const paginationLinks = [];
        const baseUrl = `/indice?${searchQuery ? `search=${encodeURIComponent(searchQuery)}&` : ''}${filterGenre ? `genre=${encodeURIComponent(filterGenre)}&` : ''}`;
        for (let i = 1; i <= totalPages; i++) {
            paginationLinks.push({ page: i, url: `${baseUrl}page=${i}`, isCurrent: i === currentPage });
        }
        const prevPage = Math.max(1, currentPage - 1);
        const nextPage = Math.min(totalPages, currentPage + 1);

        const genresCursor = await moviesColl.aggregate([
            { $unwind: "$genre" }, { $group: { _id: "$genre" } }, { $sort: { _id: 1 } }
        ]).toArray();
        const availableGenres = genresCursor.map(g => ({
            name: g._id, isActive: g._id === filterGenre,
            url: `/indice?genre=${encodeURIComponent(g._id)}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`
        }));

        res.render("indice", {
            films: normalizedFilms, pagination: paginationLinks, hasPagination: totalPages > 1,
            prevUrl: `${baseUrl}page=${prevPage}`, nextUrl: `${baseUrl}page=${nextPage}`,
            isPrevDisabled: currentPage <= 1, isNextDisabled: currentPage >= totalPages,
            currentSearch: searchQuery, currentFilter: filterGenre, genres: availableGenres
        });
    } catch (err) {
        res.status(500).send('Error loading page.');
    }
});

// --- ADD FILM ---
router.post("/addFilm", (req, res) => {
    const uploadMiddleware = upload.fields(uploadFields);
    uploadMiddleware(req, res, async (err) => {
        if (err) {
            cleanupFiles(req.files);
            return res.status(400).json({ success: false, message: `Error uploading: ${err.message}` });
        }
        const files = req.files;
        const body = req.body;
        const title = body.title ? body.title.trim() : '';

        try {
            if (!title || !body.description || !body.releaseYear || !body.director || !body.ageClassification) {
                cleanupFiles(files);
                return res.status(400).json({ success: false, message: 'Missing required fields.' });
            }
            if (/^[a-z]/.test(title)) {
                cleanupFiles(files);
                return res.status(400).json({ success: false, message: 'Title must start with Uppercase.' });
            }
            const existingMovie = await moviesColl.findOne({ title: title });
            if (existingMovie) {
                cleanupFiles(files);
                return res.status(409).json({ success: false, message: 'Title already exists.' });
            }

            const getFilePath = (fieldName) => files && files[fieldName] && files[fieldName][0] ? addUploadPrefix(files[fieldName][0].filename) : null;

            const movie = {
                title, description: body.description,
                releaseYear: Number(body.releaseYear),
                genre: Array.isArray(body.genre) ? body.genre : [body.genre],
                rating: body.rating ? Number(body.rating) : undefined,
                ageClassification: body.ageClassification,
                director: body.director,
                coverPath: getFilePath('cover'), titlePhotoPath: getFilePath('titlePhoto'),
                filmPhotoPath: getFilePath('filmPhoto'), directorImagePath: getFilePath('fotoDirector'),
                actor1ImagePath: getFilePath('fotoActor1'), actor2ImagePath: getFilePath('fotoActor2'),
                actor3ImagePath: getFilePath('fotoActor3'),
                cast: Array.isArray(body.cast) ? body.cast : [body.cast],
                duration: body.duration,
                language: Array.isArray(body.language) ? body.language : (body.language ? [body.language] : []),
                comments: []
            };

            const result = await moviesColl.insertOne(movie);
            return res.json({ success: true, message: "Film added successfully", redirectUrl: `/Ej/${result.insertedId}` });

        } catch (err) {
            cleanupFiles(req.files);
            return res.status(500).json({ success: false, message: err.message });
        }
    });
});

// --- EDIT FILM (GET) ---
router.get('/edit/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) return res.redirect('/indice');
        const film = await moviesColl.findOne({ _id: new ObjectId(req.params.id) });
        if (!film) return res.redirect('/indice');

        const genreArray = Array.isArray(film.genre) ? film.genre : [film.genre];
        const languageArray = Array.isArray(film.language) ? film.language : [film.language];
        const castArray = Array.isArray(film.cast) ? film.cast : [film.cast];

        const filmNormalized = {
            ...film, _id: film._id.toString(),
            // 💡 AÑADIDO: Rutas de imagen existentes para previsualización en add.html
            currentCoverPath: film.coverPath || null,
            currentTitlePhotoPath: film.titlePhotoPath || null,
            currentFilmPhotoPath: film.filmPhotoPath || null,
            currentDirectorImagePath: film.directorImagePath || null,
            currentActor1ImagePath: film.actor1ImagePath || null,
            currentActor2ImagePath: film.actor2ImagePath || null,
            currentActor3ImagePath: film.actor3ImagePath || null,

            actor1: castArray[0] || '', actor2: castArray[1] || '', actor3: castArray[2] || '',
            isAction: genreArray.includes('Action'), isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'), isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'), isAdventure: genreArray.includes('Adventure'), isOtherGenre: genreArray.includes('Other'),
            isEnglish: languageArray.includes('English'), isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'), isGerman: languageArray.includes('German'), isOtherLanguage: languageArray.includes('Other'),
        };
        res.render("add", { editing: true, film: filmNormalized });
    } catch (err) {
        res.redirect('/indice');
    }
});

// --- EDIT FILM (POST) ---
router.post('/editFilm/:id', (req, res) => {
    const editUploadMiddleware = upload.fields(uploadFields);
    editUploadMiddleware(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        try {
            const { id } = req.params;
            const title = req.body.title ? req.body.title.trim() : '';
            if (!ObjectId.isValid(id) || /^[a-z]/.test(title)) return res.status(400).json({ success: false, message: 'Invalid ID or Title format.' });

            const oid = new ObjectId(id);
            const existingFilm = await moviesColl.findOne({ _id: oid });
            if (!existingFilm) return res.status(404).json({ success: false, message: 'Movie not found.' });

            if (title !== existingFilm.title) {
                const duplicate = await moviesColl.findOne({ title: title });
                if (duplicate) return res.status(409).json({ success: false, message: 'Title already taken.' });
            }

            const updateFields = {
                title: title, description: req.body.description,
                releaseYear: parseInt(req.body.releaseYear),
                rating: req.body.rating ? Number(req.body.rating) : existingFilm.rating,
                ageClassification: req.body.ageClassification, director: req.body.director,
                duration: req.body.duration, updatedAt: new Date(),
                genre: Array.isArray(req.body.genre) ? req.body.genre : (req.body.genre ? [req.body.genre] : []),
                language: Array.isArray(req.body.language) ? req.body.language : (req.body.language ? [req.body.language] : []),
                cast: Array.isArray(req.body.cast) ? req.body.cast.filter(c => c && c.trim() !== '') : [],
            };

            for (const { fieldName, dbPath } of imageFields) {
                // 🛑 LÓGICA DE PREVISUALIZACIÓN Y ELIMINACIÓN
                const deleteField = req.body[`delete_${fieldName}`];
                const fileUploaded = req.files && req.files[fieldName] && req.files[fieldName].length > 0;

                if (deleteField === 'true') {
                    // 1. Se pidió eliminar la imagen existente

                    // Borrar el archivo físico si existe
                    if (existingFilm[dbPath] && existingFilm[dbPath].startsWith('/Uploads/')) {
                        const relPath = existingFilm[dbPath].replace(/^\/Uploads\//, '');
                        const fullPath = path.join(UPLOADS_PATH, relPath);
                        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                    }

                    if (fileUploaded) {
                        // 2. Si hay un archivo nuevo, guardar la nueva ruta
                        updateFields[dbPath] = addUploadPrefix(req.files[fieldName][0].filename);
                    } else {
                        // 3. Si no hay archivo nuevo, establecer la ruta en null en la DB
                        updateFields[dbPath] = null;
                    }
                } else if (fileUploaded) {
                    // 4. Se subió un archivo nuevo (y no se marcó para eliminar)

                    // (Opcional pero recomendable): Eliminar el archivo antiguo antes de guardar el nuevo
                    if (existingFilm[dbPath] && existingFilm[dbPath].startsWith('/Uploads/')) {
                        const relPath = existingFilm[dbPath].replace(/^\/Uploads\//, '');
                        const fullPath = path.join(UPLOADS_PATH, relPath);
                        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                    }

                    updateFields[dbPath] = addUploadPrefix(req.files[fieldName][0].filename);

                } else {
                    // 5. No se pidió eliminar y no se subió un archivo nuevo (mantener el existente)
                    updateFields[dbPath] = existingFilm[dbPath];
                }
            }
            // FIN DE LA LÓGICA DE PREVISUALIZACIÓN Y ELIMINACIÓN

            await moviesColl.updateOne({ _id: oid }, { $set: updateFields });
            return res.json({ success: true, message: "Film updated successfully", redirectUrl: `/Ej/${id}` });

        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });
});

// --- DETALLE (CORREGIDO PARA EVITAR CUEGUES DE AGGREGATE) ---
router.get('/Ej/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) return res.status(400).send("Invalid ID");
        const movieObjectId = new ObjectId(req.params.id);

        // 1. Obtener la película (findOne es más simple y confiable)
        const film = await moviesColl.findOne({ _id: movieObjectId });
        if (!film) return res.status(404).send("Film not found");

        let reviews = [];
        // 2. Obtener los comentarios asociados si existen (reemplazando $lookup)
        if (film.comments && film.comments.length > 0) {
            // Se utiliza $in para buscar todos los IDs de comentarios en una sola consulta
            reviews = await commentsColl.find({ _id: { $in: film.comments } }).toArray();
        }

        const castArray = (Array.isArray(film.cast) ? film.cast : []).map((name, i) => ({
            name: name, imagePath: film[`actor${i + 1}ImagePath`]
        })).filter(i => i.name);

        res.render('Ej', {
            ...film, movieId: film._id.toString(),
            reviews: reviews, // Ahora usamos 'reviews' en lugar de 'film.reviewsData'
            cast: castArray,
        });
    } catch (err) {
        console.error("Error in /Ej/:id route:", err);
        res.status(500).send(err.message);
    }
});

// --- COMENTARIOS ---
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const { userName, rating, reviewText } = req.body;
        const movieId = req.params.id;
        if (!userName || !rating || !reviewText) return res.status(400).json({ success: false, message: 'Missing fields.' });

        const result = await commentsColl.insertOne({
            User_name: userName, description: reviewText, Rating: parseInt(rating),
            movieId: new ObjectId(movieId), createdAt: new Date()
        });
        await moviesColl.updateOne({ _id: new ObjectId(movieId) }, { $push: { comments: result.insertedId } });
        res.json({ success: true, message: 'Comment added.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        await commentsColl.deleteOne({ _id: new ObjectId(commentId) });
        await moviesColl.updateOne({ _id: new ObjectId(movieId) }, { $pull: { comments: new ObjectId(commentId) } });
        res.json({ success: true, message: 'Comment deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/updateComment/:movieId/:commentId', async (req, res) => {
    try {
        const { reviewText, reviewRating } = req.body;
        const { commentId } = req.params;
        await commentsColl.updateOne(
            { _id: new ObjectId(commentId) },
            { $set: { description: reviewText, Rating: parseInt(reviewRating), updatedAt: new Date() } }
        );
        res.json({ success: true, message: 'Comment updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- BORRAR PELÍCULA ---
router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        const oid = new ObjectId(movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (movie) {
            // Borrar archivos
            const pathsToDelete = [
                movie.coverPath, movie.titlePhotoPath, movie.filmPhotoPath,
                movie.directorImagePath, movie.actor1ImagePath, movie.actor2ImagePath, movie.actor3ImagePath
            ].filter(p => p && p.startsWith('/Uploads/'));
            for (const rel of pathsToDelete) {
                const fullPath = path.join(UPLOADS_PATH, rel.replace(/^\/Uploads\//, ''));
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }
            await commentsColl.deleteMany({ movieId: oid });
            await moviesColl.deleteOne({ _id: oid });
        }
        res.redirect('/indice');
    } catch (err) { res.redirect('/indice'); }
});

// --- SCROLL INFINITO ---
router.get("/api/films", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;
        const films = await moviesColl.find({}).sort({ releaseYear: -1 }).skip(skip).limit(limit).toArray();
        res.json({ films });
    } catch (err) {
        res.status(500).json({ films: [] });
    }
});

export default router;