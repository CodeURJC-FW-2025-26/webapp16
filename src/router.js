import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Redirect root to index page
router.get('/', (req, res) => {
    res.redirect('/indice');
});

// ----------------------------------------------------
// ➡️ Main Movie Route (Index)
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
        // Search by Title (case-insensitive regex)
        if (searchQuery) query.title = { $regex: new RegExp(searchQuery, 'i') };
        // Filter by Genre
        if (filterGenre && filterGenre !== 'All') query.genre = filterGenre;

        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const films = await collection.find(query)
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // Use ONLY coverPath for the listing cover.
        const normalizedFilms = films.map(f => ({
            ...f,
            posterUrl: f.coverPath,
        }));

        // --- Pagination Logic ---
        const paginationLinks = [];
        const baseUrl = `/indice?${searchQuery ? `search=${encodeURIComponent(searchQuery)}&` : ''}${filterGenre ? `genre=${encodeURIComponent(filterGenre)}&` : ''}`;
        for (let i = 1; i <= totalPages; i++) {
            paginationLinks.push({ page: i, url: `${baseUrl}page=${i}`, isCurrent: i === currentPage });
        }
        const prevPage = Math.max(1, currentPage - 1);
        const nextPage = Math.min(totalPages, currentPage + 1);

        // --- Genre Filter Logic ---
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
        console.error('❌ ERROR fetching index data:', err);
        res.status(500).send('Error loading main page.');
    }
});

// ----------------------------------------------------
// ➡️ GET Route for Film Details (Ej.html)
// ----------------------------------------------------
router.get('/Ej/:id', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');
        const filmId = req.params.id;

        const film = await collection.findOne({ _id: new ObjectId(filmId) });

        if (!film) {
            // Error handling uses the new English template variables: message, buttonPath, buttonText
            return res.status(404).render('error', {
                message: "Movie not found with the provided ID.",
                buttonPath: '/indice',
                buttonText: 'Go to Index'
            });
        }

        const normalizedComments = (film.comments || []).map(c => ({
            userName: c.User_name || c.userName,
            description: c.description,
            rating: c.Rating || c.rating,
        }));

        const filmData = {
            ...film,
            comments: normalizedComments,
            castString: (film.cast || []).join(', '),
        };

        res.render('Ej', filmData);

    } catch (err) {
        console.error("❌ Error loading film details:", err);
        if (err.message.includes('Argument passed in must be a string of 12 bytes or a string of 24 hex characters')) {
            return res.status(400).render('error', {
                message: "Invalid Movie ID format.",
                buttonPath: '/indice',
                buttonText: 'Go to Index'
            });
        }
        res.status(500).send('Error loading film details.');
    }
});


// ----------------------------------------------------
// ➡️ GET Route for Add Film (add.html)
// ----------------------------------------------------
router.get('/add', (req, res) => {
    res.render('add', { editing: false });
});

// ----------------------------------------------------
// ➡️ GET Route for Edit Film (add.html)
// ----------------------------------------------------
router.get('/editFilm/:id', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');
        const filmId = req.params.id;

        const film = await collection.findOne({ _id: new ObjectId(filmId) });

        if (!film) {
            return res.status(404).render('error', {
                message: "Movie not found for editing.",
                buttonPath: '/indice',
                buttonText: 'Go to Index'
            });
        }

        const genreArray = Array.isArray(film.genre) ? film.genre : [film.genre];
        const languageArray = Array.isArray(film.language) ? film.language : [film.language];

        // 1. Normalize and prepare movie data for the form
        const normalizedFilm = { // Renamed from filmNormalized
            _id: film._id,
            title: film.Title || film.title,
            description: film.description,
            releaseYear: film.releaseYear,
            rating: film.Calification || film.rating,
            ageClassification: film.Age_classification || film.ageClassification,
            director: film.Director || film.director,
            duration: film.Duration || film.duration,

            cast: Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []),

            coverPath: film.coverPath,
            titlePhotoPath: film.titlePhotoPath,
            filmPhotoPath: film.filmPhotoPath,
            directorImagePath: film.directorImagePath,
            actor1ImagePath: film.actor1ImagePath,
            actor2ImagePath: film.actor2ImagePath,
            actor3ImagePath: film.actor3ImagePath,

            // Flags for Checkboxes (Genre)
            isAction: genreArray.includes('Action'),
            isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'),
            isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'),
            isAdventure: genreArray.includes('Adventure'),
            isOtherGenre: genreArray.includes('Other'),

            // Flags for Checkboxes (Language)
            isEnglish: languageArray.includes('English'),
            isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'),
            isGerman: languageArray.includes('German'),
            isOtherLanguage: languageArray.includes('Other'),
        };

        // 2. Render the view
        res.render("add", {
            editing: true,
            film: normalizedFilm // Send the normalized object
        });

    } catch (err) {
        console.error("❌ Error loading movie for editing:", err);
        res.status(500).send("Error loading movie data.");
    }
});


// ----------------------------------------------------
// ➡️ POST Route for Adding Film (with Multer)
// ----------------------------------------------------
router.post("/addFilm", (req, res) => {
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
            console.error('❌ File Upload Error (Multer):', err);
            return res.status(400).render('error', {
                message: `Error processing files: ${err.message}`,
                buttonPath: '/add',
                buttonText: 'Back to Form'
            });
        }

        try {
            const db = req.app.locals.db;
            const collection = db.collection('Softflix');
            const files = req.files;
            const body = req.body;

            // 1.1 Server-side Validation
            const { title, description, releaseYear, director, cast, genre, ageClassification } = body;

            // Check required fields 
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                return res.status(400).render('error', {
                    message: "Validation Error: Missing required fields.",
                    buttonPath: '/add',
                    buttonText: 'Back to Form'
                });
            }

            // Check unique title 
            const existingFilm = await collection.findOne({ title: { $regex: new RegExp(`^${title}$`, 'i') } });
            if (existingFilm) {
                return res.status(400).render('error', {
                    message: "Validation Error: A film with this title already exists.",
                    buttonPath: '/add',
                    buttonText: 'Back to Form'
                });
            }

            // 1.2 Prepare New Film Data
            const newFilm = {
                title: body.title,
                description: body.description,
                releaseYear: parseInt(body.releaseYear),
                genre: Array.isArray(body.genre) ? body.genre : [body.genre],
                rating: parseInt(body.rating),
                ageClassification: body.ageClassification,
                director: body.director,
                duration: body.duration,
                language: Array.isArray(body.language) ? body.language : [body.language],
                cast: Array.isArray(body.cast) ? body.cast : [body.cast],
                comments: [],

                // Set image paths
                coverPath: files['cover'] ? `/Uploads/${files['cover'][0].filename}` : null,
                titlePhotoPath: files['titlePhoto'] ? `/Uploads/${files['titlePhoto'][0].filename}` : null,
                filmPhotoPath: files['filmPhoto'] ? `/Uploads/${files['filmPhoto'][0].filename}` : null,
                directorImagePath: files['fotoDirector'] ? `/Uploads/${files['fotoDirector'][0].filename}` : null,
                actor1ImagePath: files['fotoActor1'] ? `/Uploads/${files['fotoActor1'][0].filename}` : null,
                actor2ImagePath: files['fotoActor2'] ? `/Uploads/${files['fotoActor2'][0].filename}` : null,
                actor3ImagePath: files['fotoActor3'] ? `/Uploads/${files['fotoActor3'][0].filename}` : null,
            };

            // 2. Insert into DB 
            const result = await collection.insertOne(newFilm);
            const newFilmId = result.insertedId;

            // 3. Redirect to Confirmation Page (using detailPath)
            res.render('confirm', {
                movieTitle: newFilm.title,
                detailPath: `/Ej/${newFilmId}`
            });

        } catch (dbErr) {
            console.error('❌ ERROR saving film to database:', dbErr);
            res.status(500).render('error', {
                message: "A server error occurred while trying to save the film.",
                buttonPath: '/add',
                buttonText: 'Back to Form'
            });
        }
    });
});

// ----------------------------------------------------
// ➡️ POST Route for Editing Film (Placeholder)
// ----------------------------------------------------
router.post('/editFilm/:id', (req, res) => {
    const uploadMiddleware = req.app.locals.upload.fields([ /* ... file fields ... */]);
    uploadMiddleware(req, res, async (err) => {
        if (err) {
            return res.status(400).render('error', {
                message: `Error processing files during update: ${err.message}`,
                buttonPath: `/editFilm/${req.params.id}`,
                buttonText: 'Back to Edit'
            });
        }

        try {
            const db = req.app.locals.db;
            const collection = db.collection('Softflix');
            const filmId = req.params.id;
            const body = req.body;

            // Placeholder for actual update logic
            const updateResult = await collection.updateOne(
                { _id: new ObjectId(filmId) },
                { $set: { title: body.title, description: body.description } }
            );

            // Redirect to Confirmation
            res.render('confirm', {
                movieTitle: body.title,
                detailPath: `/Ej/${filmId}`
            });

        } catch (dbErr) {
            res.status(500).render('error', {
                message: "A server error occurred while trying to update the film.",
                buttonPath: `/editFilm/${req.params.id}`,
                buttonText: 'Back to Edit'
            });
        }
    });
});


// ----------------------------------------------------
// ➡️ POST Route for Deleting Film (Placeholder)
// ----------------------------------------------------
router.post('/deleteFilm/:id', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');
        const filmId = req.params.id;

        const result = await collection.deleteOne({ _id: new ObjectId(filmId) });

        if (result.deletedCount === 0) {
            return res.status(404).render('error', {
                message: "The movie could not be found for deletion.",
                buttonPath: '/indice',
                buttonText: 'Go to Index'
            });
        }

        res.render('confirm', {
            movieTitle: "Film Successfully Deleted",
            detailPath: `/indice`
        });

    } catch (err) {
        console.error('❌ ERROR deleting film:', err);
        res.status(500).render('error', {
            message: "A server error occurred during film deletion.",
            buttonPath: '/indice',
            buttonText: 'Go to Index'
        });
    }
});


// ----------------------------------------------------
// ➡️ POST Route for Adding Secondary Entity (Review) (Placeholder)
// ----------------------------------------------------
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');
        const filmId = req.params.id;
        const { userName, rating, reviewText } = req.body;

        // 1. Validation for Review
        if (!userName || !rating || !reviewText) {
            return res.status(400).render('error', {
                message: "Review validation error: Missing name, rating, or text.",
                buttonPath: `/Ej/${filmId}`,
                buttonText: 'Back to Detail Page'
            });
        }

        const newComment = {
            userName: userName,
            description: reviewText,
            rating: parseInt(rating),
        };

        // 2. DB Update
        const result = await collection.updateOne(
            { _id: new ObjectId(filmId) },
            { $push: { comments: newComment } }
        );

        // 3. Redirect to Confirmation/Detail
        res.render('confirm', {
            movieTitle: `Review Added`,
            detailPath: `/Ej/${filmId}`
        });

    } catch (err) {
        console.error('❌ ERROR adding review:', err);
        res.status(500).render('error', {
            message: "A server error occurred while adding the review.",
            buttonPath: `/Ej/${req.params.id}`,
            buttonText: 'Back to Detail Page'
        });
    }
});

export default router;