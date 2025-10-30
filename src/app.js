import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "..", "Public")));
app.use('/views', express.static(path.join(__dirname, '..', 'views')));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "indice.html"));
});

app.get("/indice", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "indice.html"));
});

app.get("/añadir", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "views", "add.html"));
});

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



