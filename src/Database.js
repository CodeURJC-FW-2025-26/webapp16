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

    let directorImagePath = null;

    if (movie.images && Array.isArray(movie.images) && movie.images.length > 0) {
        // La ruta pública es /data/Images/ + ruta relativa del JSON (ej: Interstellar/interstellar.jpg)
        directorImagePath = `/data/Images/${movie.images[0].name}`;
    }

    // Normalización de campos para que funcionen con tu data.json original o corregido
    const title = movie.Title || movie.title;
    const releaseYear = movie.Realase_year || movie.releaseYear;
    const genre = movie.Gender || movie.genre;
    const rating = movie.Calification || movie.rating;
    const ageClassification = movie.Age_classification || movie.ageClassification;
    const director = movie.Director || movie.director;
    const cast = movie.Casting || movie.cast;
    const duration = movie.Duration || movie.duration;


    // Mapeo final
    const normalizedMovie = {
        title: title,
        description: movie.description,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        // Conversión a array
        genre: typeof genre === 'string' ? [genre.trim()] : (genre || []),
        // Extraer solo el número
        rating: rating ? Number(rating.split('/')[0]) : undefined,
        ageClassification: ageClassification,
        director: director,
        // Conversión a array
        cast: typeof cast === 'string' ? cast.split(',').map(s => s.trim()).filter(Boolean) : (cast || []),
        duration: duration,
        language: movie.language || [],

        // 🔑 CLAVE: Campo de imagen correcto
        directorImagePath: directorImagePath,
    };

    return normalizedMovie;
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

            // 🚨 DIAGNÓSTICO CLAVE: Muestra la ruta de la primera película antes de insertarla.
            console.log(`RUTA DE IMAGEN DE INTERSTELLAR: ${initialMovies[0].directorImagePath}`);

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
        await client.close();
        console.log('🔌 MongoDB Client cerrado.');
    }
}

export { initDB, cleanupDB };
