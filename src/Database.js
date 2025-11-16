import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

// 💡 EXPORTAR EL CLIENTE: Necesario para el hook de cierre en app.js
const uri = 'mongodb://localhost:27017/Softflix';
export const client = new MongoClient(uri);

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
            // 🚨 CORRECCIÓN CLAVE: La ruta debe ser /Uploads/filename para ser consistente 
            // con donde las copias app.js y donde Multer las guarda.
            // La ruta original es: Interstellar/INTERESTELLAR.png
            // La ruta final debe ser: /Uploads/Interstellar/INTERESTELLAR.png
            const imageName = coverImage.name.replace(/^(\/|\\)/, ''); // Quita el '/' o '\' inicial si existe

            // Creamos una ruta que apunta a la carpeta de subidas
            directorImagePath = `/Uploads/${imageName}`;
        }
    }

    // Normalizar los géneros
    let normalizedGenre = genre;
    if (typeof genre === 'string') {
        // Asumimos que los géneros están separados por coma si es un string
        normalizedGenre = genre.split(',').map(g => g.trim()).filter(g => g.length > 0);
    } else if (!Array.isArray(genre)) {
        normalizedGenre = [];
    }

    // Devolvemos el objeto completo con la ruta normalizada y el array de géneros
    return {
        title,
        description,
        releaseYear: parseInt(releaseYear),
        genre: normalizedGenre,
        rating: parseFloat(rating),
        ageClassification,
        director,
        cast,
        duration,
        directorImagePath,
        reviews: [] // Inicializar el array de reseñas
    };
};

// Cargar películas iniciales de forma síncrona
let initialMovies = [];
try {
    const rawData = fs.readFileSync(JSON_PATH);
    const data = JSON.parse(rawData);
    // Aplicar la transformación de rutas antes de guardar
    initialMovies = data.map(generateImagePaths);
    console.log(`Cargadas ${initialMovies.length} películas del data.json.`);
} catch (error) {
    console.error("❌ Error al cargar o parsear data.json. Asegúrate de que el archivo existe y es JSON válido:", error.message);
}


export async function initDB(app) {
    // Si no hay películas, no inicializar
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
                // Este log ahora debería mostrar: /Uploads/Interstellar/...
                console.log(`RUTA GUARDADA PARA LA PRIMERA PELÍCULA: ${initialMovies[0].directorImagePath}`);
            }

            await Softflix.insertMany(initialMovies);
            console.log("✅ Inserción inicial completada con éxito.");
        } else {
            console.log(`✅ Softflix ya contiene ${count} películas. Omite la inserción inicial.`);
        }

    } catch (error) {
        console.error('❌ ERROR CRÍTICO en initDB. Asegúrate de que MongoDB está corriendo en localhost:27017.', error.message);
        // 💡 CRÍTICO: Relanzar el error para que app.js lo capture y detenga el servidor
        throw new Error("Fallo la conexión a la base de datos o la inserción inicial.");
    }
}

export async function cleanupDB() {
    try {
        await client.connect();
        const db = client.db('Softflix');
        const result = await db.collection('Softflix').deleteMany({});
        console.log(`\n🧹 LIMPIEZA DB: Se eliminaron ${result.deletedCount} documentos de 'Softflix'.`);
    } catch (err) {
        console.error('❌ ERROR al borrar datos de la base de datos:', err.message);
    }
    // No cerramos el cliente aquí si se va a re-utilizar inmediatamente en initDB
}

export async function closeDB() {
    if (client && client.connected) {
        await client.close();
        console.log("Conexión a MongoDB cerrada.");
    }
}
export { initDB, cleanupDB, generateImagePaths, client };
