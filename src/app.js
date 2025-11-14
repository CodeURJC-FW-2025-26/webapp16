import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
import initDB from './Database.js';


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsPath = path.join(__dirname, "..", "views");
const partialsPath = path.join(viewsPath, "partials");
const BASE_PATH = path.join(__dirname, '..');


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
        const count = await Movie.countDocuments();
        if (count > 0) {
            return;
        }
    } catch (err) {
        return;
    }
    let movieData = [];
    try {
        const jsonContent = fs.readFileSync(dataPath, 'utf-8');
        movieData = JSON.parse(jsonContent);
    } catch (error) {
        return;
    }
    try {
        const insertedMovies = await Movie.insertMany(movieData);
    } catch (error) {
        console.error('❌ ERROR al insertar datos iniciales:', error.message);
    }
}

function copyImagesToUploads() {
    const sourceDir = path.join(BASE_PATH, 'data', 'Images');
    const destDir = path.join(BASE_PATH, 'Public', 'Uploads');

    // --- 🚨 DIAGNÓSTICO DE RUTAS 🚨 ---
    console.log(`Ruta Origen (data/Images): ${sourceDir}`);
    console.log(`Ruta Destino (Public/Uploads): ${destDir}`);
    // ------------------------------------

    // Crea el directorio de destino si no existe
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Función recursiva para copiar archivos
    function copyFilesRecursively(currentSource, currentDest) {
        try {
            const files = fs.readdirSync(currentSource);

            for (const file of files) {
                const sourceFile = path.join(currentSource, file);
                const destFile = path.join(currentDest, file);
                const stats = fs.statSync(sourceFile);

                if (stats.isDirectory()) {
                    // Si es una carpeta, la creamos en el destino y la recorremos
                    if (!fs.existsSync(destFile)) {
                        fs.mkdirSync(destFile, { recursive: true });
                    }
                    copyFilesRecursively(sourceFile, destFile); // Llamada recursiva
                } else if (stats.isFile()) {
                    // Si es un archivo, lo copiamos
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

copyImagesToUploads();

const PORT = 3000;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);