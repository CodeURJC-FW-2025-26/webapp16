import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

// 💡 EXPORT CLIENT: Required for the shutdown hook in app.js
const uri = 'mongodb://localhost:27017/Softflix';
export const client = new MongoClient(uri);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..');
const JSON_PATH = path.join(BASE_PATH, 'data', 'data.json');
const UPLOADS_PATH = path.join(BASE_PATH, 'Public', 'Uploads');
const DATA_IMAGES_PATH = path.join(BASE_PATH, 'data', 'images');

// 🔑 HELPER FUNCTION: Adds the '/Uploads' prefix to the path.
const addUploadPrefix = (p) => {
    if (!p) return null;
    // Avoid duplicating the prefix if it already exists
    if (p.startsWith('/Uploads/')) return p;
    return `/Uploads${p}`;
};

// 💡 CRITICAL: Transformation function that explicitly assigns image paths by type
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
    const castString = movie.Casting || movie.cast;
    const castArray = castString ? (Array.isArray(castString) ? castString : castString.split(',').map(s => s.trim())) : [];
    const language = movie.Language || movie.language;

    // --- 2. Image Path Generation ---
    const imageMap = (movie.images || []).reduce((acc, img) => {
        acc[img.type] = addUploadPrefix(img.name);
        return acc;
    }, {});

    // --- 3. Final Normalized Movie Object ---
    return {
        // MongoDB ID will be generated upon insertion
        title,
        description,
        releaseYear: parseInt(releaseYear),
        genre: Array.isArray(genre) ? genre : [genre], // Ensure genre is an array
        rating: parseInt(rating),
        ageClassification,
        director,
        duration,
        language: Array.isArray(language) ? language : [language], // Ensure language is an array
        cast: castArray,
        comments: comments || [],

        // Image paths for Mustache
        coverPath: imageMap.cover || null,
        titlePhotoPath: imageMap.titlePhotoPath || null,
        filmPhotoPath: imageMap.filmPhotoPath || null,
        directorImagePath: imageMap.director || null,
        actor1ImagePath: imageMap.actor1ImagePath || null,
        actor2ImagePath: imageMap.actor2ImagePath || null,
        actor3ImagePath: imageMap.actor3ImagePath || null,
    };
};

// ----------------------------------------------------
// 🔄 IMAGE MANAGEMENT FUNCTIONS
// ----------------------------------------------------

// Copies initial images from /data/images to /Public/Uploads
export function copyImagesToUploads() {
    if (!fs.existsSync(DATA_IMAGES_PATH)) {
        console.warn("⚠️ Warning: Source directory for images (/data/images) does not exist. Skipping image copy.");
        return;
    }

    console.log("📂 Copying initial images to Public/Uploads...");
    try {
        // Recursive copy from /data/images to /Public/Uploads
        fs.cpSync(DATA_IMAGES_PATH, UPLOADS_PATH, { recursive: true, force: true });
        console.log("✅ Image copy completed.");
    } catch (e) {
        console.error("❌ ERROR during image copy:", e.message);
    }
}

// Cleans the /Public/Uploads folder (excluding any placeholder files if necessary)
export function cleanupUploads() {
    try {
        if (fs.existsSync(UPLOADS_PATH)) {
            console.log("🧹 Cleaning up Public/Uploads folder...");
            fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
            fs.mkdirSync(UPLOADS_PATH, { recursive: true }); // Recreate the folder
            console.log("✅ Uploads cleanup completed.");
        }
    } catch (e) {
        console.error("❌ ERROR during uploads cleanup:", e.message);
    }
}


// ----------------------------------------------------
// 💾 DATABASE MANAGEMENT FUNCTIONS
// ----------------------------------------------------

export async function initDB(app) {
    try {
        // 1. Connection
        await client.connect();
        console.log("✅ Connected to MongoDB.");

        const db = client.db('Softflix');
        app.locals.db = db; // Expose DB to Express context
        const Softflix = db.collection('Softflix');

        // 2. Check if there is initial data in the DB
        const count = await Softflix.countDocuments();
        let initialMovies = [];

        // 3. Load the initial data JSON
        if (fs.existsSync(JSON_PATH)) {
            const rawData = fs.readFileSync(JSON_PATH);
            const data = JSON.parse(rawData);

            // 4. Map and transform data
            initialMovies = data.map(generateImagePaths);
        }

        // 5. Insert data if necessary
        if (count > 0) {
            console.log(`🧹 Cleaning up existing ${count} documents to reload...`);
            await Softflix.deleteMany({});
        }

        if (initialMovies.length > 0) {
            console.log(`✨ Inserting ${initialMovies.length} initial movies into Softflix...`);
            await Softflix.insertMany(initialMovies);
            console.log("✅ Initial insertion completed successfully.");
        } else {
            console.log("✅ Database ready (empty).");
        }

    } catch (error) {
        console.error('❌ CRITICAL ERROR in initDB. Ensure MongoDB is running on localhost:27017.', error.message);
        throw new Error("Database connection or initial insertion failed.");
    }
}

export async function cleanupDB() {
    try {
        await client.connect();
        const db = client.db('Softflix');
        const result = await db.collection('Softflix').deleteMany({});
        console.log(`\n🧹 DB CLEANUP: Deleted ${result.deletedCount} documents from 'Softflix'.`);
    } catch (err) {
        console.error('❌ ERROR deleting data from the database:', err.message);
    }
}

export async function closeDB() {
    if (client) {
        try {
            await client.close();
            console.log("MongoDB connection closed.");
        } catch (err) {
            console.error('❌ ERROR closing MongoDB connection:', err.message);
        }
    }
}