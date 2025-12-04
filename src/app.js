import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
// Make sure you import initDB, cleanupDB and client for closing.
import { initDB, cleanupDB, client } from './Database.js';


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsPath = path.join(__dirname, "..", "views");
const partialsPath = path.join(viewsPath, "partials");
const BASE_PATH = path.join(__dirname, '..');

// ----------------------------------------------------
// 🛠️ MULTER CONFIGURATION (File Upload)
// ----------------------------------------------------
const UPLOADS_PATH = path.join(BASE_PATH, 'Uploads');

// 2. Configure Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Save uploaded files to the 'Uploads' folder (outside Public)
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        // Use the original filename with the date to prevent collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});
app.locals.upload = multer({ storage: storage });


// ----------------------------------------------------
//  MUSTACHE AND PARSERS CONFIGURATION
// ----------------------------------------------------
app.engine("html", mustacheExpress(partialsPath, ".html"));
app.set("view engine", "html");
app.set("views", viewsPath);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(BASE_PATH, 'Public')));


// ----------------------------------------------------
//  COPY AND CLEANUP FUNCTIONS
// ----------------------------------------------------
const sourceDir = path.join(BASE_PATH, 'data', 'Images');
const destDir = UPLOADS_PATH; // Base path Uploads folder

function cleanupUploads() {
    console.log('🔥 Deleting uploads folder on server exit...');
    try {
        if (fs.existsSync(UPLOADS_PATH)) {
            // Delete the folder and its contents
            fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
            console.log(' Uploads folder deleted successfully.');
        } else {
            console.log('Uploads folder not found, no deletion necessary.');
        }
    } catch (err) {
        console.error(' ERROR deleting uploads folder:', err.message);
    }
}

function copyFilesRecursively(currentSource, currentDest) {
    try {
        const files = fs.readdirSync(currentSource);

        for (const file of files) {
            const sourceFile = path.join(currentSource, file);
            const destFile = path.join(currentDest, file);
            const stats = fs.statSync(sourceFile);

            if (stats.isDirectory()) {
                if (!fs.existsSync(destFile)) {
                    fs.mkdirSync(destFile, { recursive: true });
                }
                copyFilesRecursively(sourceFile, destFile);
            } else if (stats.isFile()) {
                fs.copyFileSync(sourceFile, destFile);
                console.log(`✅ Copied: ${file} to ${path.basename(currentDest)}`);
            }
        }
    } catch (err) {
        console.error(`❌ ERROR processing ${currentSource}:`, err.message);
    }
}

function copyImagesToUploads() {
    console.log('--- Starting initial image upload to Uploads folder ---');
    try {
        if (!fs.existsSync(sourceDir)) {
            console.warn(`⚠️ Warning: Image source folder not found: ${sourceDir}`);
            return;
        }
        // Create destination folder if it doesn't exist (CRITICAL for server start)
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        copyFilesRecursively(sourceDir, destDir);
        console.log('--- Image upload completed (including subfolders). ---');
    } catch (err) {
        console.error('❌ ERROR in copyImagesToUploads:', err.message);
    }
}

// ----------------------------------------------------
//  ROUTING AND DATABASE
// ----------------------------------------------------
app.use('/', router);
app.use('/Uploads', express.static(UPLOADS_PATH));
// Must be wrapped in a try/catch to handle MongoDB connection failures.
copyImagesToUploads(); // Copy images and create folder before filling the DB
try {
    await cleanupDB(); // Clean up the DB
    await initDB(app); // Wait for the database to be filled and connected
} catch (e) {
    console.error("FATAL ERROR: Could not initialize the database. The server will not start.", e.message);
    // If the connection fails, stop the application to prevent errors in the routes.
    process.exit(1);
}


// ----------------------------------------------------
//  SERVER START
// ----------------------------------------------------
const PORT = 3000;
const server = app.listen(PORT, () =>
    console.log(`Server running at http://localhost:${PORT}`)
);

// ----------------------------------------------------
//  CLEANUP HOOKS WHEN CLOSING THE SERVER
// ----------------------------------------------------

// Handles manual stopping (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('\nServer stopped. Starting cleanup of uploads and database...');
    // Cleanup function is essential to delete the folder on exit
    cleanupUploads();
    // Only attempt DB cleanup if the MongoDB client exists
    if (client) {
        await cleanupDB();
    }
    server.close(() => {
        console.log('Express server closed.');
        process.exit(0);
    });
});