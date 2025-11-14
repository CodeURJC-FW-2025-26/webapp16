import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
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
        // Usa el nombre original del archivo
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// 3. Pasa la instancia de Multer a app.locals para que router.js la use
app.locals.upload = upload;
// ----------------------------------------------------


app.engine('html', mustacheExpress(partialsPath, '.html'));
app.set('view engine', 'html');
app.set('views', viewsPath);
app.use(express.static(path.join(BASE_PATH, "Public")));

app.use('/data/Images', express.static(path.join(BASE_PATH, 'data', 'Images')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

await initDB(app);

app.use('/', router);

app.get("/indice", (req, res) => {
    res.render("indice");
});

app.get("/add", (req, res) => {
    res.render("add");
});

app.get("/ej", (req, res) => {
    res.render("Ej");
});

app.get("/", (req, res) => {
    res.render("indice");
});

async function loadInitialData() {
    const dataPath = resolve(process.cwd(), 'data', 'data.json');
    try {
        // ... Lógica de carga de datos iniciales ...
    } catch (err) {
        return;
    }
    // ... (El cuerpo de loadInitialData que tenías aquí)
}


/**
 * Borra todos los archivos dentro de Public/Uploads.
 * Usado para la limpieza al cerrar el servidor.
 */
function cleanupUploads() {
    const uploadDir = path.join(BASE_PATH, 'Public', 'Uploads');

    try {
        if (fs.existsSync(uploadDir)) {
            const files = fs.readdirSync(uploadDir);

            for (const file of files) {
                const filePath = path.join(uploadDir, file);
                fs.unlinkSync(filePath); // Borra el archivo
                console.log(`🗑️ Borrado: ${file}`);
            }
            console.log('--- Limpieza de Public/Uploads completada. ---');
        }
    } catch (err) {
        console.error('❌ Error al limpiar la carpeta Uploads:', err.message);
    }
}

// ----------------------------------------------------
// Lógica para copiar imágenes de data/Images a Public/Uploads
// (Mantenida solo por si la necesitas para datos iniciales)
// ----------------------------------------------------
function copyImagesToUploads() {
    // ... (El cuerpo de copyImagesToUploads que ya tenías)
    const sourceDir = path.join(BASE_PATH, 'data', 'Images');
    const destDir = path.join(BASE_PATH, 'Public', 'Uploads');

    console.log(`Ruta Origen (data/Images): ${sourceDir}`);
    console.log(`Ruta Destino (Public/Uploads): ${destDir}`);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
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

    copyFilesRecursively(sourceDir, destDir);
    console.log('--- Subida de imágenes completada (incluyendo subcarpetas). ---');
}
// ----------------------------------------------------


// ¡IMPORTANTE! Eliminamos la llamada a copyImagesToUploads() del final
// y añadimos el hook de limpieza.
const PORT = 3000;
const server = app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);

// ----------------------------------------------------
// 🗑️ HOOKS DE LIMPIEZA AL CERRAR EL SERVIDOR
// ----------------------------------------------------

// Maneja la detención manual (Ctrl+C)
process.on('SIGINT', () => {
    console.log('\nServidor detenido. Iniciando limpieza de subidas...');
    cleanupUploads();
    process.exit();
});

// Maneja otros cierres del proceso
process.on('exit', cleanupUploads);