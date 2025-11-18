import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';

const router = express.Router();

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

        // 🔑 INDEX CORRECTION: Use ONLY coverPath for the listing poster.
        const normalizedFilms = films.map(f => ({
            ...f,
            // Now coverPath is always correctly populated with the /Uploads/ prefix
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
            console.error('❌ File Upload ERROR (Multer):', err);
            return res.render('error', {
                mensaje: `Error procesing files: ${err.message}`,
                rutaBoton: '/add',
                textoBoton: 'Return to the form'
            });
        }

        try {
            const files = req.files;
            const body = req.body;

            // 1.1 Validation of required fields
            const { title, description, releaseYear, director, cast, genre, ageClassification } = body;
            if (!title || !description || !releaseYear || !director || !cast || !genre || !ageClassification) {
                return res.render('error', {
                    mensaje: 'All required fields must be completed.',
                    rutaBoton: '/add',
                    textoBoton: 'Return to the form'
                });
            }

            // 🔑 DUPLICATE VALIDATION CORRECTION: If the movie exists, render error.
            const existingMovie = await req.app.locals.db.collection('Softflix').findOne({ title: title });

            if (existingMovie) {
                // Delete files if they were uploaded before the check
                if (req.files) {
                    Object.keys(req.files).forEach(key => {
                        req.files[key].forEach(file => {
                            fs.unlinkSync(file.path);
                        });
                    });
                }
                return res.render('error', {
                    mensaje: `There is already a movie with that title "${title}". Please, choose another title for the movie.`,
                    rutaBoton: '/add',
                    textoBoton: ' Return to the form'
                });
            }


            // 2. Auxiliary function to get the path of a specific file
            const getFilePath = (fieldName) => {
                // Generates the path with the /Uploads/ prefix for consistency.
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
                // The paths of the uploaded files (new films) use getFilePath()
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
                comentary: []
            };

            // 4. Insert into the database
            const db = req.app.locals.db;
            const collection = db.collection('Softflix');

            const result = await collection.insertOne(movie);

            // 5. Redirect if everything goes well
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
            if (req.files) {
                Object.keys(req.files).forEach(key => {
                    req.files[key].forEach(file => {
                        fs.unlink(file.path, (unlinkErr) => {
                            if (unlinkErr) console.error(`Error deleting file (${file.filename}):`, unlinkErr);
                        });
                    });
                });
            }

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
                    localField: "comments",   // IDs of the added comments
                    foreignField: "_id",
                    as: "reviewsData"         // Array of new comment objects
                }
            }
        ]).toArray();

        const film = filmPipeline[0];

        if (!film) {
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

        // 🔑 CRITICAL STEP: Separate old comments (objects) from IDs.
        let oldComments = [];
        if (Array.isArray(film.comments)) {
            // An old comment is a complete object (it has the 'User_name' property).
            // A new comment is an ObjectId (it doesn't have 'User_name' as a top-level property).
            oldComments = film.comments.filter(item =>
                typeof item === 'object' && item !== null && item.User_name !== undefined
            );
        }

        // Get the new comments (fetched by $lookup in reviewsData)
        const newComments = Array.isArray(film.reviewsData) ? film.reviewsData : [];

        const filmNormalized = {
            ...film,

            // 🔑 CORRECTION: Concatenate the old and new comments.
            reviews: oldComments.concat(newComments),

            // Main poster
            poster: film.coverPath || film.cover || film.mainImagePath || null,

            cast: castArray,
            language: Array.isArray(film.language) ? film.language : (film.language || []),
        };

        res.render('Ej', { ...filmNormalized });

    } catch (err) {
        console.error('❌ ERROR loading movie detail:', err);
        res.status(500).send(`Error al cargar la página de detalle: ${err.message}`);
    }
});


// ... (rest of router.js routes)

router.get('/add', (req, res) => {
    res.render('add');
});
//----------------------------------------
//Router post to addComment
router.post('/addComment', async (req, res) => {
    try {
        const { userName, rating, reviewText, movieId } = req.body;

        if (!userName || !rating || !reviewText || !movieId) {
            return res.status(400).send('Missing required fields');
        }

        const db = req.app.locals.db;
        if (!db) {
            return res.status(500).send('Database not initialized');
        }

        // 1. Insert the comment into the 'comentaries' collection
        const comentaryCollection = db.collection('comentaries');
        const result = await comentaryCollection.insertOne({
            User_name: userName,
            description: reviewText,
            Rating: Number(rating),
            movieId: new ObjectId(movieId),
            createdAt: new Date()
        });

        // 2. Update the movie's 'comments' array (Reference Model)
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: new ObjectId(movieId) },
            { $push: { comments: result.insertedId } }
        );

        console.log(`✅ Comment saved with ID: ${result.insertedId}`);
        res.redirect(`/Ej/${movieId}`);

    } catch (err) {
        console.error('❌ ERROR saving comment:', err);
        res.status(500).send(`Error saving comment: ${err.message}`);
    }
});

// ----------------------------------------------------
// ➖ Route to render delete confirmation page
router.post('/deleteFilm', async (req, res) => {
    try {
        const { movieId } = req.body;
        if (!movieId) return res.status(400).send('movieId is required');

        const db = req.app.locals.db;
        const moviesColl = db.collection('Softflix');

        const oid = new ObjectId(movieId);
        const movie = await moviesColl.findOne({ _id: oid });
        if (!movie) return res.status(404).send('Movie not found');

        // Render the confirmation page
        return res.render('confirm', {
            type: 'delete movie',              // Used in the view to display the message
            title: movie.title,             // Title to display on the page
            routeDetalle: `/deleteFilm/${movieId}/confirmed`, // Route that performs the actual deletion
            action: 'delete',
            actiontype: 'movie'

        });

    } catch (err) {
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
        if (!movie) return res.status(404).send('Movie not found');

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
        console.error('Error deleting movie:', err);
        return res.status(500).send('Error deleting the movie');
    }
});


// =======================================================
// // ➡️ POST /Ej/:id/addReview → Add a review (UNIFIED MODEL) with confirmation
router.post('/Ej/:id/addReview', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;

        // 1. Validate required fields
        const { userName, rating, reviewText } = req.body;
        if (!userName || !rating || !reviewText || !movieId) {
            return res.render('error', {
                message: 'All required fields must be completed for the review.',
                redirect: `/Ej/${movieId}`,
                buttonText: 'Return to the form'
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
            return res.render('error', {
                message: 'Movie not found for confirmation.',
                redirect: '/indice',
                buttonText: 'Return to Index'
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
        console.error('❌ ERROR adding review (Unified Model):', err);
        return res.render('error', {
            message: `Error adding the review: ${err.message}`,
            redirect: `/Ej/${req.params.id}`,
            buttonText: 'Return to the form'
        });
    }
});


// =======================================================
// ➡️ GET /edit/:id → Load the edit page
// =======================================================
router.get('/edit/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        const db = req.app.locals.db;
        const collection = db.collection('Softflix');

        // 1. Find the movie by ID
        const film = await collection.findOne({ _id: new ObjectId(movieId) });

        if (!film) {
            return res.status(404).send("Film not found for edition");
        }

        // --- 2. Data normalization for the 'add.html' template ---

        // Ensure that genre and language arrays exist for flag logic
        const genreArray = Array.isArray(film.genre) ? film.genre : (film.genre ? [film.genre] : []);
        const languageArray = Array.isArray(film.language) ? film.language : (film.language ? [film.language] : []);

        // Normalize the 3 actor fields and their image paths
        const castArray = Array.isArray(film.cast) ? film.cast : (film.cast ? [film.cast] : []);

        // Create a data structure that the 'add.html' template can easily use
        const filmNormalized = {
            // The ID is critical for the POST edit form. Convert to string.
            _id: film._id.toString(),

            // Main fields (use the normalized fields that should already exist)
            title: film.title,
            description: film.description,
            releaseYear: film.releaseYear,
            rating: film.rating,
            ageClassification: film.ageClassification,
            director: film.director,
            duration: film.duration,

            // Casting: Pass the fields separately to pre-fill the 3 form inputs
            actor1: castArray[0] || '',
            actor2: castArray[1] || '',
            actor3: castArray[2] || '',
            actor1ImagePath: film.actor1ImagePath || '',
            actor2ImagePath: film.actor2ImagePath || '',
            actor3ImagePath: film.actor3ImagePath || '',

            // Existing image paths to show if a new one is not uploaded
            coverPath: film.coverPath || film.cover || film.mainImagePath || '',
            titlePhotoPath: film.titlePhotoPath || '',

            // Flags for Checkboxes (Genre) - Crucial for pre-selection
            isAction: genreArray.includes('Action'),
            isComedy: genreArray.includes('Comedy'),
            isHorror: genreArray.includes('Horror'),
            isScifi: genreArray.includes('Science-Fiction'),
            isFantasy: genreArray.includes('Fantasy'),
            isAdventure: genreArray.includes('Adventure'),
            isOtherGenre: genreArray.includes('Other'),

            // Flags for Checkboxes (Language) - Crucial for pre-selection
            isEnglish: languageArray.includes('English'),
            isSpanish: languageArray.includes('Spanish'),
            isFrench: languageArray.includes('French'),
            isGerman: languageArray.includes('German'),
            isOtherLanguage: languageArray.includes('Other'),
        };

        // 3. Render the view
        res.render("add", {
            editing: true, // Flag to change the form title and POST action
            film: filmNormalized // Object with all pre-loaded data
        });

    } catch (err) {
        console.error("❌ Error loading movie for editing:", err);
        // Redirect to an error page in case of server/DB failure
        res.redirect('/error');
    }
});

// ➡️ GET /editComment/:movieId/:commentId → Cargar el formulario de edición de comentarios
router.get('/editComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const db = req.app.locals.db;
        const comentaryCollection = db.collection('comentaries');

        // 1. Validar y buscar el comentario
        if (!ObjectId.isValid(commentId)) {
            return res.status(400).send('ID de comentario no válido.');
        }

        const comment = await comentaryCollection.findOne({ _id: new ObjectId(commentId) });

        if (!comment) {
            return res.status(404).send("Comentario no encontrado para editar.");
        }

        // 2. Renderizar el formulario 'editComment'
        res.render('editComment', {
            pageTitle: `Editando Comentario para: ${comment.User_name}`,
            // Variables requeridas por el template editComment.html
            filmSlug: movieId, // Usamos movieId para redirigir/cancelar
            commentId: commentId,
            commentText: comment.description,
            commentRating: comment.Rating
        });

    } catch (err) {
        console.error("❌ ERROR cargando comentario para edición:", err);
        res.status(500).send(`Error cargando comentario: ${err.message}`);
    }
});



// ➡️ POST /updateComment/:movieId/:commentId → Actualizar el comentario en la DB
router.post('/updateComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const { reviewText, reviewRating } = req.body;
        const db = req.app.locals.db;
        const comentaryCollection = db.collection('comentaries');

        // 1. Validar
        if (!reviewText || !reviewRating || !ObjectId.isValid(commentId)) {
            return res.status(400).send('Faltan campos requeridos o ID no válido.');
        }

        // 2. Actualizar el documento en 'comentaries'
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
            console.warn(`No se encontró o no se modificó el comentario ${commentId}.`);
        }

        // 3. Redirigir de vuelta a la página de detalle
        // La URL de detalle de la película es /Ej/:id
        res.redirect(`/Ej/${movieId}`);

    } catch (err) {
        console.error("❌ ERROR actualizando comentario:", err);
        res.status(500).send(`Error actualizando comentario: ${err.message}`);
    }
});


// ➡️ POST /deleteComment/:movieId/:commentId → Eliminar un comentario específico
router.post('/deleteComment/:movieId/:commentId', async (req, res) => {
    try {
        const { movieId, commentId } = req.params;
        const db = req.app.locals.db;

        // 1. Validar IDs
        if (!ObjectId.isValid(movieId) || !ObjectId.isValid(commentId)) {
            return res.status(400).send('ID de película o comentario no válido.');
        }

        const oidComment = new ObjectId(commentId);
        const oidMovie = new ObjectId(movieId);

        // 2. Eliminar el documento de comentario (colección 'comentaries')
        const comentaryCollection = db.collection('comentaries');
        const deleteResult = await comentaryCollection.deleteOne({ _id: oidComment });

        // 3. Eliminar la referencia (ObjectId) del comentario en el array 'comments' de la película ($pull)
        const moviesCollection = db.collection('Softflix');
        await moviesCollection.updateOne(
            { _id: oidMovie },
            { $pull: { comments: oidComment } } 
        );

        console.log(`✅ Comentario ${commentId} eliminado y referencia removida de la Película ${movieId}.`);

        // 4. Redirigir de vuelta a la página de detalle
        res.redirect(`/Ej/${movieId}`);

    } catch (err) {
        console.error("❌ ERROR eliminando comentario:", err);
        res.status(500).send(`Error eliminando el comentario: ${err.message}`);
    }
});

// ======================================================= 
// ➡️ POST /editFilm → Save the edition of a movie 
// =======================================================

router.post("/editFilm/:id", (req, res) => {
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
            console.error("❌ Multer error:", err);
            return res.render("error", {
                mensaje: `Error processing files: ${err.message}`,
                rutaBoton: "/indice",
                textoBoton: "Return"
            });
        }

        try {
            const db = req.app.locals.db;
            const collection = db.collection("Softflix");
            const files = req.files;
            const body = req.body;

            const movieId = req.params.id;
            if (!movieId) {
                return res.render("error", {
                    mensaje: "Movie ID not received.",
                    rutaBoton: "/indice",
                    textoBoton: "Return"
                });
            }

            // Helper → Keep old image if no new one uploaded
            const getUpdatedPath = (fieldName, oldValue) => {
                return files && files[fieldName] && files[fieldName][0]
                    ? `/Uploads/${files[fieldName][0].filename}`
                    : oldValue || null;
            };

            // Create fields to update
            const updatedMovie = {
                title: body.title,
                description: body.description,
                releaseYear: Number(body.releaseYear),
                director: body.director,
                ageClassification: body.ageClassification,
                duration: body.duration,
                rating: body.rating ? Number(body.rating) : undefined,
                genre: Array.isArray(body.genre) ? body.genre : [body.genre],
                language: Array.isArray(body.language) ? body.language : [body.language],

                cast: [
                    body.actor1 || "",
                    body.actor2 || "",
                    body.actor3 || ""
                ],

                coverPath: getUpdatedPath("cover", body.oldCoverPath),
                titlePhotoPath: getUpdatedPath("titlePhoto", body.oldTitlePhotoPath),
                filmPhotoPath: getUpdatedPath("filmPhoto", body.oldFilmPhotoPath),
                directorImagePath: getUpdatedPath("fotoDirector", body.oldDirectorImagePath),
                actor1ImagePath: getUpdatedPath("fotoActor1", body.oldActor1ImagePath),
                actor2ImagePath: getUpdatedPath("fotoActor2", body.oldActor2ImagePath),
                actor3ImagePath: getUpdatedPath("fotoActor3", body.oldActor3ImagePath)
            };

            // Clean empty strings in cast
            updatedMovie.cast = updatedMovie.cast.filter(x => x.trim() !== "");

            // Update in DB
            await collection.updateOne(
                { _id: new ObjectId(movieId) },
                { $set: updatedMovie }
            );

            console.log("✅ Movie updated:", movieId);

            // Redirect to detail page
            res.redirect(`/Ej/${movieId}`);

        } catch (err) {
            console.error("❌ Error saving movie edition:", err);
            res.render("error", {
                mensaje: `Error saving changes: ${err.message}`,
                rutaBoton: "/indice",
                textoBoton: "Return"
            });
        }
    });
});

export default router;