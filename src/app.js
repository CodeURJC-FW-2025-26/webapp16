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
// 🛠️ CONFIGURACIÓN MUSTACHE Y PARSERS
// ----------------------------------------------------
app.engine("html", mustacheExpress(partialsPath));
app.set("view engine", "html");
app.set("views", viewsPath);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ----------------------------------------------------
// 🛠️ CONFIGURACIÓN MULTER (Subida de Archivos)
// ----------------------------------------------------
const UPLOADS_PATH = path.join(BASE_PATH, 'Public', 'Uploads');

if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    },
});

const upload = multer({ storage: storage });
app.locals.upload = upload;


// ----------------------------------------------------
// 🗑️ UTILERÍA DE LIMPIEZA DE UPLOADS
// ----------------------------------------------------
const cleanupUploads = () => {
    try {
        if (fs.existsSync(UPLOADS_PATH)) {
            fs.readdirSync(UPLOADS_PATH).forEach(file => {
                const filePath = path.join(UPLOADS_PATH, file);
                fs.unlinkSync(filePath);
            });
            console.log(`\n🗑️ LIMPIEZA UPLOADS: Se eliminaron los archivos temporales.`);
        }
    } catch (error) {
        console.error('❌ ERROR al limpiar la carpeta de uploads:', error.message);
    }
};


// ----------------------------------------------------
// 🌐 ARCHIVOS ESTÁTICOS (¡LA CLAVE PARA LAS IMÁGENES!)
// ----------------------------------------------------

// 1. Sirve archivos desde la carpeta Public (CSS, JS, etc.)
app.use(express.static(path.join(BASE_PATH, 'Public')));

// 2. 🚨 CLAVE: Mapea la URL /data/Images a la carpeta física data/Images.
// Esto permite que la URL guardada en DB (/data/Images/Interstellar/interstellar.jpg) funcione.
app.use('/data/Images', express.static(path.join(BASE_PATH, 'data', 'Images')));


// ----------------------------------------------------
// 🗺️ ENRUTAMIENTO Y BASE DE DATOS
// ----------------------------------------------------
app.use('/', router);
initDB(app);


// ----------------------------------------------------
// 🚀 INICIO DEL SERVIDOR
// ----------------------------------------------------
const PORT = 3000;
const server = app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);

// ----------------------------------------------------
// 🗑️ HOOKS DE LIMPIEZA AL CERRAR EL SERVIDOR (¡LA OTRA CLAVE!)
// ----------------------------------------------------

// Maneja la detención manual (Ctrl+C)
// 🚨 CLAVE: La función debe ser 'async' y usar 'await cleanupDB()'
process.on('SIGINT', async () => {
    console.log('\nServidor detenido. Iniciando limpieza de subidas y base de datos...');
    cleanupUploads();
    await cleanupDB(); // ⬅️ ¡Esto es lo que garantiza que los datos viejos se borren!
    server.close(() => {
        process.exit(0);
    });
});

// Maneja otros cierres del proceso
process.on('exit', cleanupUploads);