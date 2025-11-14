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

app.use('/imagenes', express.static(path.join(BASE_PATH, 'data', 'Images')));

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

const PORT = 3000;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);