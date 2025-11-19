import { MongoClient, ObjectId } from 'mongodb'; // Importar ObjectId
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

// 💡 EXPORT THE CLIENT: Needed for the closing hook in app.js
const uri = 'mongodb://localhost:27017/Softflix';
const client = new MongoClient(uri);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..');
const JSON_PATH = path.join(BASE_PATH, 'data', 'data.json');

// 🔑 HELPER FUNCTION: Adds the '/Uploads' prefix to the path.
const addUploadPrefix = (p) => {
    if (!p) return null;
    // Prevents duplicating the prefix if it already exists
    if (p.startsWith('/Uploads/')) return p;
    return `/Uploads${p}`;
};

// 💡 CRITICAL: Transformation function that assigns images by explicit type
const generateImagePaths = (movie) => {

    // --- 1. Data Extraction and Normalization ---
    const title = movie.Title || movie.title;
    const releaseYear = movie.Realase_year || movie.releaseYear;
    const genre = movie.Gender || movie.genre;
    const rating = movie.Calification || movie.rating;
    const ageClassification = movie.Age_classification || movie.ageClassification;
    const director = movie.Director || movie.director;
    const duration = movie.Duration || movie.duration;
    const description = movie.description;
    const comments = movie.Comentary || movie.comments;
    const language = movie.Language || movie.language;

    const castString = movie.Casting || movie.cast;
    const castArray = castString
        ? (Array.isArray(castString) ? castString : castString.split(',').map(name => name.trim()))
        : [];
    // --- 2. Variable Initialization and Mapping ---
    let paths = {};
    const allImages = movie.images || [];

    // Mapping of explicit fields in the JSON to the output fields in the DB
    const fieldMap = {
        'cover': 'coverPath',
        'director': 'directorImagePath',
        'titlePhotoPath': 'titlePhotoPath',
        'filmPhotoPath': 'filmPhotoPath',
        'actor1ImagePath': 'actor1ImagePath',
        'actor2ImagePath': 'actor2ImagePath',
        'actor3ImagePath': 'actor3ImagePath',
    };

    // --- 3. Assignment based on 'type' from data.json ---
    if (allImages.length > 0) {
        allImages.forEach(img => {
            const targetField = fieldMap[img.type];
            if (targetField) {
                // We apply the /Uploads/ prefix to all paths coming from data.json
                paths[targetField] = addUploadPrefix(img.name);
            }
        });
    }

    // 🔑 Director Mapping (We generate a fallback path if a specific one wasn't found)
    if (!paths.directorImagePath && director) {
        const safeName = director.replace(/\s/g, '_');
        // Fallback path (including the /Uploads/ prefix)
        paths.directorImagePath = `/Uploads/Imagenes/Directors/${safeName}.jpg`;
    }

    // --- 4. Return the final object for MongoDB ---
    return {
        title: title,
        description: description,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        genre: genre,
        rating: rating ? Number(rating) : undefined,
        ageClassification: ageClassification,
        director: director,

        // Image paths
        coverPath: paths.coverPath || null,
        directorImagePath: paths.directorImagePath || null,

        actor1ImagePath: paths.actor1ImagePath || null,
        actor2ImagePath: paths.actor2ImagePath || null,
        actor3ImagePath: paths.actor3ImagePath || null,

        titlePhotoPath: paths.titlePhotoPath || null,
        filmPhotoPath: paths.filmPhotoPath || null,

        cast: castArray,
        duration: duration,
        language: Array.isArray(language) ? language : (language ? [language] : []),
        comments: comments || []
    };
};

// -------------------------------------------------------------------------
// 🛠️ Initial Movie Load
// -------------------------------------------------------------------------

// Load initial movies synchronously
let initialMovies = [];
try {
    const rawData = fs.readFileSync(JSON_PATH);
    const data = JSON.parse(rawData);
    initialMovies = data.map(generateImagePaths);
    console.log(`Loaded ${initialMovies.length} movies from data.json.`);
} catch (error) {
    console.error("❌ Error loading or parsing data.json:", error.message);
}


// -------------------------------------------------------------------------
// 💾 DB Connection and Cleanup Functions (CORREGIDAS)
// -------------------------------------------------------------------------

async function cleanupDB() {
    try {
        await client.connect();
        const db = client.db('Softflix');
        await db.collection('Softflix').deleteMany({});
        await db.collection('comentaries').deleteMany({});
        console.log(`\n🧹 DB CLEANUP: Collections 'Softflix' and 'comentaries' cleaned.`);
    } catch (err) {
        console.error('❌ ERROR cleaning up database:', err.message);
    }
}

async function initDB(app) {
    if (initialMovies.length === 0) {
        console.warn("⚠️ data.json contains no movies. Database will be initialized empty.");
    }

    try {
        await client.connect();
        const db = client.db('Softflix');
        app.locals.db = db;

        const SoftflixColl = db.collection('Softflix');
        const ComentariesColl = db.collection('comentaries');

        if (initialMovies.length > 0) {
            console.log(`✨ Starting initial load of ${initialMovies.length} movies...`);
            
            const moviesToInsert = [];

            for (const movie of initialMovies) {
                // We extracted the embedded comments to insert them separately
                const initialComments = movie.comments || [];
                const commentIds = [];


                // 2. Insert comments and obtain IDs
                if (initialComments.length > 0) {
                    // Ensure that the ratings are numbers before inserting them
                    const commentsWithNumbers = initialComments.map(c => ({
                        ...c,
                        // We assign a new ObjectId if it doesn't exist (although MongoDB does it)
                        _id: new ObjectId(),
                        Rating: parseInt(c.Rating) || 0, 
                        createdAt: new Date()
                    }));
                    
                    const result = await ComentariesColl.insertMany(commentsWithNumbers);
                    // Guardar los ObjectIds de los comentarios recién creados
                    commentIds.push(...Object.values(result.insertedIds)); 
                }


                // 3. Prepare the film for insertion, replacing the comments with references
                const movieData = { 
                    ...movie, 
                    // Replace the array of objects with the array of ObjectIds
                    comments: commentIds 
                };
                
                delete movieData._id; 
                moviesToInsert.push(movieData);
            }
            

            // 4. Insert the films with the commentary references
            await SoftflixColl.insertMany(moviesToInsert);
            console.log("✅ Initial insertion completed successfully with comment references.");
        } else {
            console.log("✅ Database ready (empty).");
        }

    } catch (error) {
        console.error('❌ CRITICAL ERROR in initDB. Make sure MongoDB is running on localhost:27017.', error.message);
        throw new Error();
    }
}

export async function closeDB() {
    if (client) {
        try {
            await client.close();
            console.log("MongoDB connection closed.");
        } catch (err) {
            console.error('Error closing MongoDB client:', err.message);
        }
    }
}

export { initDB, cleanupDB, generateImagePaths, client };