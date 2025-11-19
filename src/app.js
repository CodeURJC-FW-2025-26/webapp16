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
const UPLOADS_PATH = path.join(BASE_PATH, 'Public', 'Uploads');

// 1. Make sure the uploads folder exists
if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

// 2. Configure Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Save uploaded files to Public/Uploads
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        // Use the original filename with the date to prevent collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});

// The complete Multer object is attached to app.locals
app.locals.upload = multer({ storage: storage });


// ----------------------------------------------------
// 🛠️ MUSTACHE AND PARSERS CONFIGURATION
// ----------------------------------------------------
app.engine("html", mustacheExpress(partialsPath, ".html"));
app.set("view engine", "html");
app.set("views", viewsPath);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ----------------------------------------------------
//  STATIC FILE SERVICE AND INITIAL COPY
// ----------------------------------------------------
// Serve files from the Public folder (includes Public/Uploads)
app.use(express.static(path.join(BASE_PATH, 'Public')));


// ----------------------------------------------------
//  COPY AND CLEANUP FUNCTIONS
// ----------------------------------------------------
const sourceDir = path.join(BASE_PATH, 'data', 'Images');
const destDir = UPLOADS_PATH; // Public/Uploads

function cleanupUploads() {
    console.log('🧹 Cleaning up uploads folder...');
    try {
        if (fs.existsSync(UPLOADS_PATH)) {
            // Delete and recreate the folder to ensure total cleanup
            fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
            fs.mkdirSync(UPLOADS_PATH, { recursive: true });
        }
    } catch (err) {
        console.error('❌ ERROR cleaning up uploads folder:', err.message);
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
    console.log('--- Starting initial image upload to Public/Uploads ---');
    try {
        if (!fs.existsSync(sourceDir)) {
            console.warn(`⚠️ Warning: Image source folder not found: ${sourceDir}`);
            return;
        }
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

// ----------------------------------------------------
//  ROUTING AND DATABASE
// ----------------------------------------------------
app.use('/', router);

// Must be wrapped in a try/catch to handle MongoDB connection failures.
copyImagesToUploads(); // Copy images before filling the DB
try {
    await cleanupDB(); // Clean up the DB
    await initDB(app); // Wait for the database to be filled and connected
} catch (e) {
    console.error("❌ FATAL ERROR: Could not initialize the database. The server will not start.", e.message);
    // If the connection fails, stop the application to prevent errors in the routes.
    process.exit(1);
}


// ----------------------------------------------------
//  SERVER START
// ----------------------------------------------------
const PORT = 3000;
const server = app.listen(PORT, () =>
    console.log(`Server running at http://localhost:${PORT}`)
);

// ----------------------------------------------------
//  CLEANUP HOOKS WHEN CLOSING THE SERVER
// ----------------------------------------------------

// Handles manual stopping (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('\nServer stopped. Starting cleanup of uploads and database...');
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