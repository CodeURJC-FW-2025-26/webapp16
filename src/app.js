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
const viewsPath = path.join(__dirname, "..", "views");
const partialsPath = path.join(viewsPath, "partials");





app.engine('html', mustacheExpress(partialsPath, '.html'));
app.set('view engine', 'html');
app.set('views', viewsPath);


app.use(express.static(path.join(__dirname, "..", "Public")));
app.use('/views', express.static(path.join(__dirname, '..', 'views')));
// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
// parse application/json
app.use(express.json());
app.get("/", (req, res) => {
    res.render("indice"); // renderiza views/indice.html vía Mustache
});
app.get("/indice", (req, res) => {
    res.render("indice");
});

// Mount main router (contains POST /addFilm)
// Initialize DB before mounting router
await initDB(app);
app.use('/', router);

app.get("/ej", (req, res) => {
    res.render("Ej");
});

app.get("/formulario", (req, res) => {
    res.render("Formulario");
});
const PORT = 3000;
app.listen(PORT, () =>
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
);



//hola