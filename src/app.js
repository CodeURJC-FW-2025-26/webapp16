import express from "express";
import mustacheExpress from "mustache-express"; 
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import router from './router.js';
import initDB from './Database.js';

const   app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.engine('html', mustacheExpress());
app.set('view engine', 'html');
app.set('views', path.join(__dirname, "..", "views"));

app.use(express.static(path.join(__dirname, "..", "Public")));
app.use('/views', express.static(path.join(__dirname, '..', 'views')));
// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
// parse application/json
app.use(express.json());
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "indice.html"));
});

app.get("/indice", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "indice.html"));
});

// Mount main router (contains POST /addFilm)
// Initialize DB before mounting router
await initDB(app);
app.use('/', router);

app.get("/ej", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "Ej.html"));
});

app.get("/formulario", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "Formulario.html"));
});

const PORT = 3000;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);



