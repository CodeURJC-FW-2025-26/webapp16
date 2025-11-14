import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

const uri = 'mongodb://localhost:27017/Softflix';
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
        return initialMovies;

    } catch (error) {
        return [];
    }
}


async function initDB(app) {
    const initialMovies = await loadInitialData();

    if (initialMovies.length === 0) {
        return;
    }

    try {
        await client.connect();
        const db = client.db('Softflix');
        const Softflix = db.collection('Softflix');

        app.locals.db = db;
        const count = await Softflix.countDocuments();

        if (count === 0) {
            await Softflix.insertMany(initialMovies);
        }

    } catch (error) {
        await client.close();
        process.exit(1);
    }
}

export default initDB;
