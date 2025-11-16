// app.js

import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
// Asegúrate de que importas initDB y cleanupDB
import { initDB, cleanupDB } from './Database.js';


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

app.locals.upload = multer({ storage: storage }); // Exporta multer a la app.


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
// 1. Sirve archivos desde la carpeta Public (CSS, JS, Imágenes, etc.)
// Esto hace que la ruta /Uploads/ sea accesible.
app.use(express.static(path.join(BASE_PATH, 'Public')));

// 2. ❌ ELIMINAMOS ESTA RUTA ESTÁTICA: Ahora todo se sirve desde Public.
// app.use('/data/Images', express.static(path.join(BASE_PATH, 'data', 'Images')));


// ----------------------------------------------------
// 🛠️ FUNCIONES DE COPIA Y LIMPIEZA
// (Mantenemos estas funciones que ya tenías para la copia recursiva y limpieza)
// ----------------------------------------------------
const sourceDir = path.join(BASE_PATH, 'data', 'Images');
const destDir = UPLOADS_PATH; // Public/Uploads

// Función para limpiar archivos subidos (incluye la lógica de borrado del JSON)
function cleanupUploads() {
    console.log('🧹 Limpiando carpeta de subidas...');
    try {
        if (fs.existsSync(UPLOADS_PATH)) {
            // Borra todo el contenido de UPLOADS_PATH
            fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
            // Vuelve a crear la carpeta vacía
            fs.mkdirSync(UPLOADS_PATH, { recursive: true });
        }
    } catch (err) {
        console.error('❌ ERROR al limpiar la carpeta de subidas:', err.message);
    }
}

// Función recursiva para copiar directorios y archivos
function copyFilesRecursively(currentSource, currentDest) {
    // ... (Tu implementación existente de copyFilesRecursively)
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

// Función principal para la copia de imágenes iniciales
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
// 🚨 CLAVE: Llamar a la función de copia ANTES de inicializar la DB
copyImagesToUploads(); // <--- LLAMADA A LA FUNCIÓN DE COPIA
await cleanupDB();
initDB(app);


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
    await cleanupDB();
    server.close(() => {
        console.log('Servidor Express cerrado.');
        process.exit(0);
    });
});