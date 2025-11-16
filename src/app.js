// app.js

import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
// Asegúrate de que importas initDB, cleanupDB y client para el cierre.
import { initDB, cleanupDB, client } from './Database.js';


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsPath = path.join(__dirname, "..", "views");
const partialsPath = path.join(viewsPath, "partials");
const BASE_PATH = path.join(__dirname, '..');

// ----------------------------------------------------
// 🛠️ CONFIGURACIÓN MULTER (Subida de Archivos)
// ----------------------------------------------------
const UPLOADS_PATH = path.join(BASE_PATH, 'Public', 'Uploads');

// 1. Asegúrate de que la carpeta de subidas exista
if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

// 2. Configura el almacenamiento de Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Guarda los archivos subidos en Public/Uploads
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        // Usa el nombre original del archivo con la fecha para evitar colisiones
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});

// El objeto Multer completo se adjunta a app.locals
app.locals.upload = multer({ storage: storage });


// ----------------------------------------------------
// 🛠️ CONFIGURACIÓN MUSTACHE Y PARSERS
// ----------------------------------------------------
app.engine("html", mustacheExpress(partialsPath));
app.set("view engine", "html");
app.set("views", viewsPath);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ----------------------------------------------------
// 📁 SERVICIO DE ARCHIVOS ESTÁTICOS Y COPIA INICIAL
// ----------------------------------------------------
// Sirve archivos desde la carpeta Public (incluye Public/Uploads)
app.use(express.static(path.join(BASE_PATH, 'Public')));


// ----------------------------------------------------
// 🛠️ FUNCIONES DE COPIA Y LIMPIEZA
// ----------------------------------------------------
const sourceDir = path.join(BASE_PATH, 'data', 'Images');
const destDir = UPLOADS_PATH; // Public/Uploads

function cleanupUploads() {
    console.log('🧹 Limpiando carpeta de subidas...');
    try {
        if (fs.existsSync(UPLOADS_PATH)) {
            // Elimina y recrea la carpeta para asegurar la limpieza total
            fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
            fs.mkdirSync(UPLOADS_PATH, { recursive: true });
        }
    } catch (err) {
        console.error('❌ ERROR al limpiar la carpeta de subidas:', err.message);
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
                console.log(`✅ Copiado: ${file} a ${path.basename(currentDest)}`);
            }
        }
    } catch (err) {
        console.error(`❌ ERROR al procesar ${currentSource}:`, err.message);
    }
}

function copyImagesToUploads() {
    console.log('--- Iniciando subida de imágenes iniciales a Public/Uploads ---');
    try {
        if (!fs.existsSync(sourceDir)) {
            console.warn(`⚠️ Advertencia: Carpeta de origen de imágenes no encontrada: ${sourceDir}`);
            return;
        }
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        copyFilesRecursively(sourceDir, destDir);
        console.log('--- Subida de imágenes completada (incluyendo subcarpetas). ---');
    } catch (err) {
        console.error('❌ ERROR en copyImagesToUploads:', err.message);
    }
}
// ----------------------------------------------------

// ----------------------------------------------------
// 🗺️ ENRUTAMIENTO Y BASE DE DATOS
// ----------------------------------------------------
app.use('/', router);

// 🚨 CRÍTICO: Inicialización y conexión a la base de datos.
// Debe ser envuelto en un try/catch para manejar fallos de conexión a MongoDB.
copyImagesToUploads(); // Copia las imágenes antes de rellenar la DB
try {
    await cleanupDB(); // Limpia la DB
    await initDB(app); // Espera a que la base de datos se rellene y se conecte
} catch (e) {
    console.error("❌ ERROR FATAL: No se pudo inicializar la base de datos. El servidor no iniciará.", e.message);
    // Si la conexión falla, detenemos la aplicación para evitar errores en las rutas.
    process.exit(1);
}


// ----------------------------------------------------
// 🚀 INICIO DEL SERVIDOR
// ----------------------------------------------------
const PORT = 3000;
const server = app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);

// ----------------------------------------------------
// 🗑️ HOOKS DE LIMPIEZA AL CERRAR EL SERVIDOR
// ----------------------------------------------------

// Maneja la detención manual (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('\nServidor detenido. Iniciando limpieza de subidas y base de datos...');
    cleanupUploads();
    // Solo intenta la limpieza de DB si el cliente de MongoDB existe
    if (client) {
        await cleanupDB();
    }
    server.close(() => {
        console.log('Servidor Express cerrado.');
        process.exit(0);
    });
});