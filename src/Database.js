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

    const title = movie.Title || movie.title;
    const releaseYear = movie.Realase_year || movie.releaseYear;
    const genre = movie.Gender || movie.genre;
    const rating = movie.Calification || movie.rating;
    const ageClassification = movie.Age_classification || movie.ageClassification;
    const director = movie.Director || movie.director;
    const cast = movie.Casting || movie.cast;
    const duration = movie.Duration || movie.duration;
    const description = movie.description;
    const comments = movie.Comentary || movie.comments;

    let directorImagePath = null;
    if (movie.images && Array.isArray(movie.images)) {
        const coverImage = movie.images.find(img => img.type === 'cover');

        if (coverImage) {
            // ✅ CORRECCIÓN CLAVE: La ruta debe empezar con una barra '/' 
            // para que sea una URL absoluta en el navegador y funcione con Express.
            directorImagePath = `/data/Images/${coverImage.name}`;
        }
    }

    return {
        title,
        description,
        releaseYear,
        genre,
        rating,
        ageClassification,
        director,
        cast,
        duration,
        images: movie.images,
        comments,
        directorImagePath: directorImagePath
    };
};


async function loadInitialData() {
    try {
        const data = fs.readFileSync(JSON_PATH, 'utf-8');
        let initialMovies = JSON.parse(data);

        initialMovies = initialMovies.map(generateImagePaths);
        return initialMovies;

    } catch (error) {
        console.error("❌ Error loading data.json:", error.message);
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
            console.log(`✨ Insertando ${initialMovies.length} películas iniciales en Softflix...`);
            if (initialMovies.length > 0) {
                console.log(`RUTA GUARDADA PARA LA PRIMERA PELÍCULA: ${initialMovies[0].directorImagePath}`);
            }

            await Softflix.insertMany(initialMovies);
        } else {
            console.log(`✅ Softflix ya contiene ${count} películas.`);
        }

    } catch (error) {
        console.error('❌ Error in initDB (Database connection or insertion):', error.message);
    }
}

async function cleanupDB() {
    try {
        await client.connect();
        const db = client.db('Softflix');
        const result = await db.collection('Softflix').deleteMany({});
        console.log(`\n🧹 LIMPIEZA DB: Se eliminaron ${result.deletedCount} documentos de 'Softflix'.`);
    } catch (err) {
        console.error('❌ ERROR al borrar datos de la base de datos:', err.message);
    } finally {
        if (client) {
            await client.close();
            console.log('🔌 MongoDB Client cerrado.');
        }
    }
}

export { initDB, cleanupDB };
