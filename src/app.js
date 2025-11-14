import express from "express";
import mustacheExpress from "mustache-express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import router from './router.js';
import initDB from './Database.js';
import * as fs from 'fs';

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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

await initDB(app);

copiarImagenesIniciales(BASE_PATH);

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

function copiarCarpetaDeImagenes(origen, destino) {

    const archivos = fs.readdirSync(origen);
    let archivosCopiados = 0;

    archivos.forEach(archivo => {
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(archivo)) return;

        const rutaOrigen = path.join(origen, archivo);
        const rutaDestino = path.join(destino, archivo);

        if (!fs.existsSync(rutaDestino)) {
            fs.copyFileSync(rutaOrigen, rutaDestino);
            archivosCopiados++;
        }
    });
}

export function copiarImagenesIniciales(basePath) {
    const destinoUploads = path.join(basePath, "Public", "Uploads");
    const destinoData = path.join(basePath, "data"); 

    const origenesParaUploads = [
        path.join(basePath, "data"),
        path.join(basePath, "Public", "Imagenes"),
        path.join(basePath, "Public", "Images_Web")
    ];

    const origenParaData = path.join(basePath, "Public", "Imagenes");
    origenesParaUploads.forEach(carpeta => {
        copiarCarpetaDeImagenes(carpeta, destinoUploads);
    });
    copiarCarpetaDeImagenes(origenParaData, destinoData);
}


const PORT = 3000;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
