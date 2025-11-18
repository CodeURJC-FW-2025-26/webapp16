import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
// Ensure you import initDB, cleanupDB, and client for shutdown.
import { initDB, cleanupDB, client, copyImagesToUploads, cleanupUploads } from './Database.js';


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

// 1. Ensure the uploads folder exists
if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

// 2. Configure Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Save uploaded files in Public/Uploads
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        // Use the original file name with the date to avoid collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({ storage: storage });

// ----------------------------------------------------
// ⚙️ EXPRESS MIDDLEWARE CONFIGURATION
// ----------------------------------------------------
app.use(express.static(path.join(BASE_PATH, 'Public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up Mustache engine
app.engine("html", mustacheExpress(partialsPath, ".html"));
app.set("view engine", "html");
app.set("views", viewsPath);

// Expose Multer instance to routes
app.locals.upload = upload;

// ----------------------------------------------------
// ➡️ ROUTER
// ----------------------------------------------------
app.use('/', router);

// 🚨 CRITICAL: Database initialization and connection.
// Must be wrapped in a try/catch to handle MongoDB connection failures.
copyImagesToUploads(); // Copy images before populating the DB
try {
    await cleanupDB(); // Clean the DB
    await initDB(app); // Wait for the database to be populated and connected
} catch (e) {
    console.error("❌ FATAL ERROR: Could not initialize the database. The server will not start.", e.message);
    // If connection fails, stop the application to prevent route errors.
    process.exit(1);
}


// ----------------------------------------------------
// 🚀 SERVER START
// ----------------------------------------------------
const PORT = 3000;
const server = app.listen(PORT, () =>
    console.log(`Server running at http://localhost:${PORT}`)
);

// ----------------------------------------------------
// 🗑️ CLEANUP HOOKS ON SERVER SHUTDOWN
// ----------------------------------------------------

// Handles manual shutdown (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('\nServer stopped. Starting cleanup of uploads and database...');
    cleanupUploads();
    // Only attempt DB cleanup if the MongoDB client exists
    if (client) {
        await cleanupDB();
        await client.close();
    }
    server.close(() => {
        console.log('Application process terminated.');
        process.exit(0);
    });
});