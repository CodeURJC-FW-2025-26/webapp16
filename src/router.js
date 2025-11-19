import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { fileURLToPath } from "url";

const router = express.Router();

// --- Multer Configuration ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); 
const BASE_PATH = path.join(__dirname, '..'); 
const UPLOADS_PATH = path.join(BASE_PATH, 'Public', 'Uploads'); 

// Helper function: Adds the '/Uploads/' prefix
const addUploadPrefix = (filename) => {
    if (!filename) return null;
    return `/Uploads/${filename}`;
};

// Configure Multer storage
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

// Define the expected image fields 
const imageFields = [
    { fieldName: 'cover', dbPath: 'coverPath' },
    { fieldName: 'titlePhoto', dbPath: 'titlePhotoPath' },
    { fieldName: 'filmPhoto', dbPath: 'filmPhotoPath' },
    { fieldName: 'fotoDirector', dbPath: 'directorImagePath' },
    { fieldName: 'fotoActor1', dbPath: 'actor1ImagePath' },
    { fieldName: 'fotoActor2', dbPath: 'actor2ImagePath' },
    { fieldName: 'fotoActor3', dbPath: 'actor3ImagePath' },
];

// Helper to clean up uploaded files in case of error
const cleanupFiles = (files) => {
    if (files) {
        Object.keys(files).forEach(key => {
            if (Array.isArray(files[key])) {
                files[key].forEach(file => {
                    fs.unlink(file.path, (unlinkErr) => {
                        if (unlinkErr) console.error(`Error deleting file (${file.filename}):`, unlinkErr);
                    });
                });
            }
        });
    }
};

router.get('/', (req, res) => {
    res.redirect('/indice');
});

// ----------------------------------------------------
// ➡️ Main Movies Route (Index)
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
        if (filterGenre && filterGenre !== 'All') query.genre = filterGenre;

        const totalItems = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        const skip = (currentPage - 1) * ITEMS_PER_PAGE;

        const films = await collection.find(query)
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .toArray();

        // Use ONLY coverPath for the listing poster.
        const normalizedFilms = films.map(f => ({
            ...f,
            posterUrl: f.coverPath,
        }));

        // ... (pagination and genres logic)
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
        // End of pagination and genres logic

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
        // 🚨 Console log for database error
        console.error('❌ ERROR retrieving index data:', err);
        res.status(500).send('Error loading the main page.');
    }
});

// ----------------------------------------------------
// ➡️ POST Route for Adding a Movie (with Multer)
// ----------------------------------------------------
router.post("/addFilm", (req, res) => {
    // The Multer object is already in app.locals.upload
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
            // 🚨 Console log for Multer error
            console.error('❌ File Upload ERROR (Multer):', err);
            return res.render('error', {
                mensaje: `Error processing files: ${err.message}`,
                rutaBoton: '/add',
                textoBoton: 'Return to the form'
            });
        }

        try {
            const files = req.files;
            const body = req.body;
            const title = body.title ? body.title.trim() : '';

            // 1.1 Validation of required fields
            const { description, releaseYear, director, cast, genre, ageClassification } = body;
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                cleanupFiles(files); 
                // 🚨 Console log for missing fields error
                console.error('❌ VALIDATION ERROR (ADD FILM): Missing required fields.');
                return res.render('error', {
                    mensaje: 'All required fields must be completed.',
                    rutaBoton: '/add',
                    textoBoton: 'Return to the form'
                });
            }

            // 🔑 1.2. SERVER-SIDE VALIDATION: Title must start with an uppercase letter
            const startsWithLowercase = /^[a-z]/.test(title);

            if (startsWithLowercase) {
                cleanupFiles(files); 
                // 🚨 Console log for title case validation failure
                console.error(`❌ VALIDATION ERROR (ADD FILM): The title "${title}" must start with an uppercase letter.`);
                
                return res.render('error', {
                    mensaje: `The film title "${title}" must start with an uppercase letter.`,
                    rutaBoton: '/add',
                    textoBoton: 'Return to the form'
                });
            }


            // 🔑 DUPLICATE VALIDATION: If the movie exists, render error.
            const existingMovie = await req.app.locals.db.collection('Softflix').findOne({ title: title });

            if (existingMovie) {
                cleanupFiles(files); 
                // 🚨 Console log for duplicate title error
                console.error(`❌ VALIDATION ERROR (ADD FILM): Duplicate title "${title}" rejected.`);
                return res.render('error', {
                    mensaje: `There is already a movie with that title "${title}". Please, choose another title for the movie.`,
                    rutaBoton: '/add',
                    textoBoton: ' Return to the form'
                });
            }


            // 2. Auxiliary function to get the path of a specific file
            const getFilePath = (fieldName) => {
                return files && files[fieldName] && files[fieldName][0]
                    ? `/Uploads/${files[fieldName][0].filename}`
                    : null;
            };

            // 3. Movie Object to Insert
            const movie = {
                title,
                description,
                releaseYear: Number(releaseYear),
                genre: Array.isArray(genre) ? genre : [genre],
                rating: body.rating ? Number(body.rating) : undefined,
                ageClassification,
                director,
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
                comments: []
            };

            // 4. Insert into the database
            const db = req.app.locals.db;
            const collection = db.collection('Softflix');

            const result = await collection.insertOne(movie);

            // 5. Show confirmation page
            return res.render("confirm", {
                type: 'movie',
                title: movie.title,
                entityId: result.insertedId,
                action: 'add',
                routeDetalle: `/Ej/${result.insertedId}`,
                actiontype: 'movie'
            });


        } catch (err) {
            // 6. Delete files if it fails (Rollback)
            cleanupFiles(req.files);

            // 🚨 Console log for database insertion error
            console.error('❌ ERROR inserting movie into the database:', err);
            res.render('error', {
                mensaje: `Error saving the film: ${err.message}`,
                rutaBoton: '/add',
                textoBoton: 'Return to the form'
            });
        }
    });
});

// ----------------------------------------------------
// ➡️ Movie Detail Route (/Ej/:id)
// ----------------------------------------------------
router.get('/Ej/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 1. Use $lookup on the 'comments' field to get only the new comments (referenced by ID)
        const filmPipeline = await collection.aggregate([
            { $match: { _id: new ObjectId(movieId) } },
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
             // 🚨 Console log for movie not found
            console.error(`❌ ERROR (DETAIL PAGE): Film with ID ${movieId} not found.`);
            return res.status(404).send("Film not found");
        }

        // --- Cast Logic (Maintained) ---
        const castArray = [];
        const castNames = Array.isArray(film.cast)
            ? film.cast
            : ((film.Actor1 || film.Actor2 || film.Actor3)
                ? [film.Actor1, film.Actor2, film.Actor3].filter(n => n)
                : []);


        for (let i = 0; i < castNames.length; i++) {
            const name = castNames[i];
            const imagePath = film[`actor${i + 1}ImagePath`];

            if (name) {
                castArray.push({
                    name: name,
                    imagePath: imagePath
                });
            }
        }
        // -------------------------------------

        // 2. Data normalization for the template

        const validReviews = Array.isArray(film.reviewsData) ? film.reviewsData : [];

        const filmNormalized = {
            ...film,
            movieId: film._id.toString(), 
            reviews: validReviews,
            poster: film.coverPath || film.cover || film.mainImagePath || null,
            cast: castArray,
            language: Array.isArray(film.language) ? film.language : (film.language || []),
        };

        res.render('Ej', { ...filmNormalized });

    } catch (err) {
        // 🚨 Console log for database error
        console.error('❌ ERROR loading movie detail:', err);
        res.status(500).send(`Error loading the detail page: ${err.message}`);
    }
});


// ----------------------------------------------------
//  Movie Edit (GET /edit/:id)
// ----------------------------------------------------
router.get('/edit/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 1. Find the movie by ID
        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            // 🚨 Console log for film not found
            console.error(`❌ ERROR (EDIT GET): Film with ID ${movieId} not found.`);
            return res.status(404).send("Film not found for edition");
        }

        // --- 2. Data normalization for the 'add.html' template ---

        const genreArray = Array.isArray(film.genre) ? film.genre : (film.genre ? [film.genre] : []);
        const languageArray = Array.isArray(film.language) ? film.language : (film.language ? [film.language] : []);
        const castArray = Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []);

        const filmNormalized = {
            _id: film._id.toString(),
            title: film.title,
            description: film.description,
            releaseYear: film.releaseYear,
            rating: film.rating,
            ageClassification: film.ageClassification,
            director: film.director,
            duration: film.duration,
            cast: film.cast, 
            actor1: castArray[0] || '',
            actor2: castArray[1] || '',
            actor3: castArray[2] || '',
            actor1ImagePath: film.actor1ImagePath || '',
            actor2ImagePath: film.actor2ImagePath || '',
            actor3ImagePath: film.actor3ImagePath || '',
            coverPath: film.coverPath || film.cover || film.mainImagePath || '',
            titlePhotoPath: film.titlePhotoPath || '',
            isAction: genreArray.includes('Action'),
            isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'),
            isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'),
            isAdventure: genreArray.includes('Adventure'),
            isOtherGenre: genreArray.includes('Other'),
            isEnglish: languageArray.includes('English'),
            isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'),
            isGerman: languageArray.includes('German'),
            isOtherLanguage: languageArray.includes('Other'),
        };

        // 3. Render the view
        res.render("add", {
            editing: true, 
            film: filmNormalized 
        });

    } catch (err) {
        // 🚨 Console log for database error
        console.error("❌ Error loading movie for editing:", err);
        res.redirect('/error');
    }
});

// --------------------------------------------------------------------------------
// ➡️ POST /editFilm/:id → UPDATE FILM 
// --------------------------------------------------------------------------------
router.post('/editFilm/:id', upload.fields(
    imageFields.map(field => ({ name: field.fieldName.replace(/Image$/, ''), maxCount: 1 }))
), async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        const moviesColl = db.collection('Softflix');
        const title = req.body.title ? req.body.title.trim() : '';
        const files = req.files; 
        
        // 1. Validate ID and find the existing movie
        if (!ObjectId.isValid(id)) {
            // 🚨 Console log for invalid ID
            console.error('❌ VALIDATION ERROR (EDIT FILM): Invalid movie ID provided for edition.');
            cleanupFiles(files);
            return res.status(400).render('error', { mensaje: 'Invalid movie ID.', rutaBoton: '/indice', textoBoton: 'Go to Index' });
        }
        const oid = new ObjectId(id);

        // 🔑 2. SERVER-SIDE VALIDATION: Title must start with an uppercase letter
        const startsWithLowercase = /^[a-z]/.test(title);

        if (startsWithLowercase) {
            cleanupFiles(files); 
            // 🚨 Console log for title case validation failure
            console.error(`❌ VALIDATION ERROR (EDIT FILM): The title "${title}" must start with an uppercase letter.`);
            
            return res.render('error', {
                mensaje: `The film title "${title}" must start with an uppercase letter.`,
                rutaBoton: `/edit/${id}`, 
                textoBoton: 'Return to the form'
            });
        }
        
        const existingFilm = await moviesColl.findOne({ _id: oid });

        if (!existingFilm) {
            cleanupFiles(files);
            // 🚨 Console log for movie not found error
            console.error(`❌ ERROR (EDIT POST): Movie with ID ${id} not found for update.`);
            return res.status(404).render('error', { mensaje: 'Movie not found for update.', rutaBoton: '/indice', textoBoton: 'Go to Index' });
        }

        // 3. Prepare the update object ($set) with text fields
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

        // 4. Conditional Logic for Images (PRESERVE OLD PATH)
        const formImageFields = [
            { fieldName: 'cover', dbPath: 'coverPath' },
            { fieldName: 'titlePhoto', dbPath: 'titlePhotoPath' },
            { fieldName: 'filmPhoto', dbPath: 'filmPhotoPath' },
            { fieldName: 'fotoDirector', dbPath: 'directorImagePath' },
            { fieldName: 'fotoActor1', dbPath: 'actor1ImagePath' },
            { fieldName: 'fotoActor2', dbPath: 'actor2ImagePath' },
            { fieldName: 'fotoActor3', dbPath: 'actor3ImagePath' },
        ];

        for (const { fieldName, dbPath } of formImageFields) {
            if (files && files[fieldName] && files[fieldName].length > 0) {
                updateFields[dbPath] = addUploadPrefix(files[fieldName][0].filename);
            } else {
                updateFields[dbPath] = existingFilm[dbPath];
            }
        }

        // 5. Update the film in the DB
        const updateResult = await moviesColl.updateOne(
            { _id: oid },
            { $set: updateFields }
        );

        if (updateResult.matchedCount === 0) {
            console.warn(`Movie ${id} not found or not modified.`);
        }

        // 6. Redirect to the confirmation page
        res.render('confirm', {
            type: 'Edit Film',
            action: 'edit',
            actiontype: 'film',
            title: updateFields.title,
            routeDetalle: `/Ej/${id}`
        });

    } catch (err) {
        // 🚨 Console log for generic update error
        console.error("❌ ERROR updating film:", err);
        res.status(500).render('error', {
            mensaje: `Error updating film: ${err.message}`, 
            rutaBoton: `/Ej/${req.params.id}`,
            textoBoton: 'Return to Film'
        });
    }
});


// ----------------------------------------------------
//  Movie Detail, Comment and Delete routes
// ----------------------------------------------------

router.get('/add', (req, res) => {
    res.render('add');
});

// GET /editComment/:movieId/:commentId → Load the comment editing form
router.get('/editComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const db = req.app.locals.db;
        const comentaryCollection = db.collection('comentaries');

        // 1. Validate and search for the comment
        if (!ObjectId.isValid(commentId)) {
            // 🚨 Console log for invalid comment ID
            console.error(`❌ VALIDATION ERROR (EDIT COMMENT GET): Invalid comment ID: ${commentId}`);
            return res.status(400).send('Invalid comment ID.'); 
        }

        const comment = await comentaryCollection.findOne({ _id: new ObjectId(commentId) });

        if (!comment) {
            // 🚨 Console log for comment not found
            console.error(`❌ ERROR (EDIT COMMENT GET): Comment with ID ${commentId} not found.`);
            return res.status(404).send("Comment not found for editing."); 
        }

        // 2. Render the 'edit-comment' form
        res.render('edit-comment', {
            pageTitle: `Editing Comment for: ${comment.User_name}`,
            filmSlug: movieId, 
            commentId: commentId,
            commentText: comment.description,
            commentRating: comment.Rating
        });

    } catch (err) {
        // 🚨 Console log for generic error
        console.error("❌ ERROR loading comment for editing:", err);
        res.status(500).send(`Error loading comment: ${err.message}`); 
    }
});

//  POST /updateComment/:movieId/:commentId → Update the comment in the DB
router.post('/updateComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const { reviewText, reviewRating } = req.body;
        const db = req.app.locals.db;
        const comentaryCollection = db.collection('comentaries');

        // 1. Validate
        if (!reviewText || !reviewRating || !ObjectId.isValid(commentId)) {
            // 🚨 Console log for missing fields/invalid ID
            console.error(`❌ VALIDATION ERROR (UPDATE COMMENT): Missing fields or invalid ID: ${commentId}`);
            return res.status(400).send('Missing required fields or invalid ID.'); 
        }

        // 2. Update the document in 'comentaries'
        const updateResult = await comentaryCollection.updateOne(
            { _id: new ObjectId(commentId) },
            {
                $set: {
                    description: reviewText,
                    Rating: parseInt(reviewRating),
                    updatedAt: new Date()
                }
            }
        );

        if (updateResult.modifiedCount === 0 && updateResult.matchedCount === 0) {
            console.warn(`Comment ${commentId} not found or not modified.`);
        }

        // 3. Redirect back to the detail page
        res.render('confirm', {
            type: 'Edit review',
            action: 'edit',
            actiontype: 'review',
            title: '',
            routeDetalle: `/Ej/${movieId}`
        })

    } catch (err) {
        // 🚨 Console log for generic update error
        console.error("❌ ERROR updating comment:", err); 
        res.status(500).send(`Error updating comment: ${err.message}`); 
    }
});


//  POST /deleteComment/:movieId/:commentId → Delete a specific comment
router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;

        const db = req.app.locals.db;

        // 1. Validate IDs
        if (!ObjectId.isValid(movieId) || !ObjectId.isValid(commentId)) {
            // 🚨 Console log for invalid IDs
            console.error(`❌ VALIDATION ERROR (DELETE COMMENT): Invalid Movie ID: ${movieId} or Comment ID: ${commentId}`);
            return res.status(400).send('Invalid movie or comment ID.'); 
        }

        const oidComment = new ObjectId(commentId);
        const oidMovie = new ObjectId(movieId);

        // 2. Delete the comment document (in 'comentaries' collection)
        const comentaryCollection = db.collection('comentaries');
        const commentData = await comentaryCollection.findOne({_id: oidComment});
        await comentaryCollection.deleteOne({ _id: oidComment });

        // 3. Remove the comment reference (ObjectId) from the movie's 'comments' array ($pull)
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: oidMovie },
            { $pull: { comments: oidComment } }
        );

        console.log(`✅ Commentary ${commentId} deleted and reference removed from film ${movieId}.`); 

        // 4.Confirm page 
        res.render('confirm', {
            type: 'Delete review',
            action: 'delete',
            actiontype: 'review',
            title: commentData.User_name,
            routeDetalle: `/Ej/${movieId}`
        })

    } catch (err) {
        // 🚨 Console log for generic delete error
        console.error("❌ ERROR deleting commentary:", err); 
        res.status(500).send(`Error deleting the commentary ${err.message}`); 
    }
});


// =======================================================
//  POST /Ej/:id/addReview → Add a review (UNIFIED MODEL) with confirmation
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;

        // 1. Validate required fields
        const { userName, rating, reviewText } = req.body;
        if (!userName || !rating || !reviewText || !movieId) {
            // 🚨 Console log for missing review fields
            console.error(`❌ VALIDATION ERROR (ADD REVIEW): Missing fields for movie ID ${movieId}.`);
            return res.render('error', {
                mensaje: 'All required fields must be completed for the review.',
                rutaBoton: `/Ej/${movieId}`,
                textoBoton: 'Return to the form'
            });
        }

        // 2. Insert the review into 'comentaries'
        const comentaryCollection = db.collection('comentaries');
        const result = await comentaryCollection.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: parseInt(rating),
            movieId: new ObjectId(movieId),
            createdAt: new Date()
        });

        // 3. Update the movie document: add review ID to 'comments' array
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { comments: result.insertedId } }
        );

        console.log(`✅ Review saved with ID: ${result.insertedId} and linked to movie.`);

        // 4. Render the confirmation page instead of redirect
        const movie = await moviesCollection.findOne({ _id: new ObjectId(movieId) });
        if (!movie) {
            // 🚨 Console log for movie not found (shouldn't happen if movie exists)
            console.error(`❌ ERROR (ADD REVIEW): Movie ID ${movieId} not found after review insertion.`);
            return res.render('error', {
                mensaje: 'Movie not found for confirmation.',
                rutaBoton: '/indice',
                textoBoton: 'Return to Index'
            });
        }

        return res.render('confirm', {
            type: 'review',
            action: 'added',
            title: `Review by ${userName}`,
            actiontype: 'review',
            routeDetalle: `/Ej/${movieId}`
        });

    } catch (err) {
        // 🚨 Console log for generic error
        console.error('❌ ERROR adding review (Unified Model):', err);
        return res.render('error', {
            mensaje: `Error adding the review: ${err.message}`,
            rutaBoton: `/Ej/${req.params.id}`,
            textoBoton: 'Return to the form'
        });
    }
});


// ----------------------------------------------------
//  Route to render delete confirmation page
router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        if (!movieId) {
            // 🚨 Console log for missing ID
            console.error('❌ VALIDATION ERROR (DELETE CONFIRM): Missing movieId in request body.');
            return res.status(400).send('movieId is required');
        }

        const db = req.app.locals.db;
        const moviesColl = db.collection('Softflix');

        const oid = new ObjectId(movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) {
            // 🚨 Console log for movie not found
            console.error(`❌ ERROR (DELETE CONFIRM): Movie with ID ${movieId} not found.`);
            return res.status(404).send('Movie not found');
        }

        // Render the confirmation page
        return res.render('confirm', {
            type: 'delete movie',       
            title: movie.title,         
            routeDetalle: `/deleteFilm/${movieId}/confirmed`, 
            action: 'delete',
            actiontype: 'movie'

        });

    } catch (err) {
        // 🚨 Console log for generic error
        console.error('Error preparing delete confirmation:', err);
        return res.status(500).send('Error preparing delete confirmation');
    }
});

// ➖ Route that executes the actual deletion when Confirm is clicked
router.get('/deleteFilm/:id/confirmed', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;
        const moviesColl = db.collection('Softflix');
        const commentsColl = db.collection('comentaries');

        const oid = new ObjectId(id);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) {
             // 🚨 Console log for movie not found
            console.error(`❌ ERROR (DELETE EXECUTION): Movie with ID ${id} not found for deletion.`);
            return res.status(404).send('Movie not found');
        }

        // Delete associated files
        const pathsToDelete = [
            movie.coverPath, movie.titlePhotoPath, movie.filmPhotoPath,
            movie.directorImagePath, movie.actor1ImagePath, movie.actor2ImagePath, movie.actor3ImagePath
        ].filter(p => p && p.startsWith('/Uploads/'));

        for (const rel of pathsToDelete) {
            const relClean = rel.replace(/^\/Uploads\//, '');
            const fullPath = path.join(process.cwd(), 'Public', 'Uploads', relClean);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }

        // Delete associated reviews
        await commentsColl.deleteMany({ movieId: oid });

        // Delete the movie itself
        await moviesColl.deleteOne({ _id: oid });

        console.log(`Movie ${id} and its reviews deleted.`);
        return res.redirect('/indice');

    } catch (err) {
        // 🚨 Console log for generic error
        console.error('Error deleting movie:', err);
        return res.status(500).send('Error deleting the movie');
    }
});

export default router;