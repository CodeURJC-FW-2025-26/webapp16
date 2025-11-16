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


// 💡 CRÍTICO: Función de transformación con limpieza robusta de rutas.
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
            let relativePath = coverImage.name; // EJ: '/data/Images/Interstellar/INTERESTELLAR.png'

            // PASO 1: Eliminar cualquier barra inicial si existe.
            if (relativePath.startsWith('/')) {
                relativePath = relativePath.substring(1);
            }

            // PASO 2: Eliminar el prefijo 'data/Images/'
            const prefixToRemove = 'data/Images/';

            if (relativePath.startsWith(prefixToRemove)) {
                // Resultado es: 'Interstellar/INTERESTELLAR.png'
                relativePath = relativePath.substring(prefixToRemove.length);
            }

            // PASO 3: Construir la ruta final.
            // RUTA FINAL CORRECTA: /Uploads/Interstellar/INTERESTELLAR.png
            directorImagePath = `Public/Uploads/${relativePath}`;
        }
    }

    return {
        title: title,
        description: description,
        releaseYear: parseInt(releaseYear),
        genre: Array.isArray(genre) ? genre : [genre],
        rating: parseFloat(rating),
        ageClassification: parseInt(ageClassification),
        director: director,
        cast: Array.isArray(cast) ? cast : [cast],
        duration: duration,
        directorImagePath: directorImagePath,
        reviews: comments
    };
};


// Cargar películas iniciales de forma síncrona
let initialMovies = [];
try {
    const rawData = fs.readFileSync(JSON_PATH);
    const data = JSON.parse(rawData);
    initialMovies = data.map(generateImagePaths);
} catch (error) {
    console.error("❌ Error al cargar o parsear data.json:", error.message);
}


async function initDB(app) {
    if (initialMovies.length === 0) {
        console.log("⚠️ Advertencia: No hay datos iniciales en data.json para insertar.");
    }

    try {
        await client.connect();
        const db = client.db('Softflix');
        app.locals.db = db; // Asignamos el objeto DB
        const Softflix = db.collection('Softflix');

        const count = await Softflix.countDocuments();

        if (count === 0) {
            console.log(`✨ Insertando ${initialMovies.length} películas iniciales en Softflix...`);
            if (initialMovies.length > 0) {
                // El log AHORA debe mostrar la ruta limpia: /Uploads/Interstellar/...
                console.log(`RUTA GUARDADA PARA LA PRIMERA PELÍCULA: ${initialMovies[0].directorImagePath}`);
            }

            await Softflix.insertMany(initialMovies);
        } else {
            console.log(`✅ Softflix ya contiene ${count} películas.`);
        }

    } catch (error) {
        console.error('❌ ERROR CRÍTICO en initDB. Asegúrate de que MongoDB está corriendo en localhost:27017.', error.message);
        throw new Error("Fallo la conexión a la base de datos o la inserción inicial.");
    }
}

async function cleanupDB() {
    try {
        await client.connect();
        const db = client.db('Softflix');
        const result = await db.collection('Softflix').deleteMany({});
        console.log(`\n🧹 LIMPIZA DB: Se eliminaron ${result.deletedCount} documentos de 'Softflix'.`);
    } catch (err) {
        console.error('❌ ERROR al borrar datos de la base de datos:', err.message);
    } finally {
        // Aseguramos el cierre de la conexión después de la limpieza
        if (client && client.connected) {
            await client.close();
        }
    }
}

export { initDB, cleanupDB, generateImagePaths, client };
