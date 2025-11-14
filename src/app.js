import express from "express";
import mustacheExpress from "mustache-express";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import * as fs from 'fs';
import router from './router.js';
import initDB from './Database.js';
// 🛑 ELIMINAMOS: import Movie from './models/Movie.js'; 


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsPath = path.join(__dirname, "..", "views");
const partialsPath = path.join(viewsPath, "partials");
const BASE_PATH = path.join(__dirname, '..');


app.engine('html', mustacheExpress(partialsPath, '.html'));
app.set('view engine', 'html');
app.set('views', viewsPath);

// Configuración de rutas estáticas:
app.use(express.static(path.join(BASE_PATH, "Public")));

// Configuración estática para servir imágenes desde data/Images
app.use('/imagenes', express.static(path.join(BASE_PATH, 'data', 'Images')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 1. Inicializar la base de datos (y establecer la conexión y la carga de datos)
await initDB(app);

// 🛑 ELIMINAMOS: await loadInitialData(); 
// 🛑 ELIMINAMOS: copiarImagenesIniciales(BASE_PATH);


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

// 🛑 ELIMINADAS: Las funciones 'copiarCarpetaDeImagenes' y 'copiarImagenesIniciales' 
// para evitar el error ENOENT y la copia innecesaria.


// --- Función de Carga de Datos Iniciales (Seeding) ---
async function loadInitialData() {
    const dataPath = resolve(process.cwd(), 'data', 'data.json');

    // 1. Verificar si la colección ya tiene datos
    try {
        const count = await Movie.countDocuments();
        if (count > 0) {
            console.log('💡 La base de datos ya contiene películas. Se omite la carga inicial.');
            return;
        }
    } catch (err) {
        console.error('❌ No se pudo verificar la colección de películas:', err.message);
        return;
    }

    // 2. Recoger y parsear JSON
    let movieData = [];
    try {
        const jsonContent = fs.readFileSync(dataPath, 'utf-8');
        movieData = JSON.parse(jsonContent);
    } catch (error) {
        console.error('❌ Error al leer data.json. Asegúrate de que existe y es válido:', error.message);
        return;
    }

    // 3. Insertar datos en la base de datos
    try {
        const insertedMovies = await Movie.insertMany(movieData);
        console.log(`🎬 Datos cargados con éxito: ${insertedMovies.length} películas insertadas al iniciar el servidor.`);
    } catch (error) {
        console.error('❌ ERROR al insertar datos iniciales:', error.message);
    }
}


const PORT = 3000;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);