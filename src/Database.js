import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..'); 
const JSON_PATH = path.join(BASE_PATH, 'data', 'data.json');

const generateImagePaths = (movie) => {
    const folderName = movie.Title.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9- ]/g, '')
        .replace(/ /g, '');

    if (movie.images && Array.isArray(movie.images)) {
        movie.images = movie.images.map(image => ({
            path: `${folderName}/${image.name}`,
            type: image.type
        }));
    }
    return movie;
};

async function loadInitialData() {
    try {
        const data = fs.readFileSync(JSON_PATH, 'utf-8');
        let initialMovies = JSON.parse(data);

        initialMovies = initialMovies.map(generateImagePaths);

        console.log(`✅ ${initialMovies.length} películas cargadas y procesadas desde data.json.`);
        return initialMovies;

    } catch (error) {
        console.error(`❌ Error al leer o parsear data.json en ${JSON_PATH}:`, error.message);
        return [];
    }
}


async function initDB(app) {
    const initialMovies = await loadInitialData();

    if (initialMovies.length === 0) {
        console.warn('⚠️ La base de datos no se inicializó porque no se cargaron datos válidos.');
        return;
    }

    try {
        await client.connect();
        const db = client.db('Softflix');
        const Softflix = db.collection('Softflix');

        app.locals.db = db;
        console.log('✅ Conexión a MongoDB establecida en la base de datos Softflix.');
        const count = await Softflix.countDocuments();

        if (count === 0) {
            await Softflix.insertMany(initialMovies);
            console.log(`🎬 Datos cargados con éxito: ${initialMovies.length} películas insertadas en la colección Softflix.`);
        } else {
            console.log(`💡 La colección Softflix ya contiene ${count} películas. Se omite la carga inicial.`);
        }

    } catch (error) {
        console.error('❌ Error fatal al conectar y/o inicializar la base de datos:', error);
        await client.close();
        process.exit(1);
    }
}

export default initDB;
