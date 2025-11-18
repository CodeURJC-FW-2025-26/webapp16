import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

// 💡 EXPORTAR EL CLIENTE: Necesario para el hook de cierre en app.js
const uri = 'mongodb://localhost:27017/Softflix';
const client = new MongoClient(uri);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = path.join(__dirname, '..');
const JSON_PATH = path.join(BASE_PATH, 'data', 'data.json');

// 🔑 FUNCIÓN AUXILIAR: Añade el prefijo '/Uploads' a la ruta.
const addUploadPrefix = (p) => {
    if (!p) return null;
    // Evita duplicar el prefijo si ya existe
    if (p.startsWith('/Uploads/')) return p;
    return `/Uploads${p}`;
};

// 💡 CRÍTICO: Función de transformación que asigna imágenes por tipo explícito
const generateImagePaths = (movie) => {

    // --- 1. Extracción y Normalización de Datos ---
    const title = movie.Title || movie.title;
    const releaseYear = movie.Realase_year || movie.releaseYear;
    const genre = movie.Gender || movie.genre;
    const rating = movie.Calification || movie.rating;
    const ageClassification = movie.Age_classification || movie.ageClassification;
    const director = movie.Director || movie.director;
    const duration = movie.Duration || movie.duration;
    const description = movie.description;
    const comments = movie.Comentary || movie.comments;

    const castString = movie.Casting || movie.cast;
    const castArray = castString
        ? (Array.isArray(castString) ? castString : castString.split(',').map(name => name.trim()))
        : [];

    // --- 2. Inicialización de Variables y Mapeo ---
    let paths = {};
    const allImages = movie.images || [];

    // Mapeo de campos explícitos en el JSON a los campos de salida de la DB
    const fieldMap = {
        'cover': 'coverPath',
        'director': 'directorImagePath',
        'titlePhotoPath': 'titlePhotoPath',
        'filmPhotoPath': 'filmPhotoPath',
        'actor1ImagePath': 'actor1ImagePath',
        'actor2ImagePath': 'actor2ImagePath',
        'actor3ImagePath': 'actor3ImagePath',
    };

    // --- 3. Asignación basada en 'type' del data.json ---
    if (allImages.length > 0) {
        allImages.forEach(img => {
            const targetField = fieldMap[img.type];
            if (targetField) {
                // Aplicamos el prefijo /Uploads/ a todas las rutas que provienen de data.json
                paths[targetField] = addUploadPrefix(img.name);
            }
        });
    }

    // 🔑 Mapeo del director (Generamos una ruta de fallback si no se encontró una específica)
    if (!paths.directorImagePath && director) {
        const safeName = director.replace(/\s/g, '_');
        // Ruta de fallback (incluyendo el prefijo /Uploads/)
        paths.directorImagePath = `/Uploads/Imagenes/Directors/${safeName}.jpg`;
    }

    // --- 4. Devolvemos el objeto final para MongoDB ---
    return {
        title: title,
        description: description,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        genre: genre,
        rating: rating ? Number(rating) : undefined,
        ageClassification: ageClassification,
        director: director,

        // Rutas de imágenes
        coverPath: paths.coverPath || null,
        directorImagePath: paths.directorImagePath || null,

        actor1ImagePath: paths.actor1ImagePath || null,
        actor2ImagePath: paths.actor2ImagePath || null,
        actor3ImagePath: paths.actor3ImagePath || null,

        titlePhotoPath: paths.titlePhotoPath || null,
        filmPhotoPath: paths.filmPhotoPath || null,

        cast: castArray,
        duration: duration,
        language: Array.isArray(movie.Language) ? movie.Language : (movie.Language ? [movie.Language] : []),
        comments: comments || []
    };
};

// -------------------------------------------------------------------------
// 🛠️ Carga Inicial de Películas
// -------------------------------------------------------------------------

// Cargar películas iniciales de forma síncrona
let initialMovies = [];
try {
    const rawData = fs.readFileSync(JSON_PATH);
    const data = JSON.parse(rawData);
    initialMovies = data.map(generateImagePaths);
    console.log(`Cargadas ${initialMovies.length} películas del data.json.`);
} catch (error) {
    console.error("❌ Error al cargar o parsear data.json:", error.message);
}


// -------------------------------------------------------------------------
// 💾 Funciones de Conexión y Limpieza de DB
// -------------------------------------------------------------------------

async function initDB(app) {
    if (initialMovies.length === 0) {
        console.warn("⚠️ data.json no contiene películas. La base de datos se inicializará vacía.");
    }

    try {
        await client.connect();
        const db = client.db('Softflix');
        const Softflix = db.collection('Softflix');

        app.locals.db = db;
        const count = await Softflix.countDocuments();

        // 💡 CRÍTICO: Borramos los datos antiguos e insertamos los nuevos
        // Esto garantiza que los cambios de ruta se apliquen al reiniciar.
        if (count > 0) {
            console.log(`🧹 Limpiando los ${count} documentos existentes para recargar...`);
            await Softflix.deleteMany({});
        }

        if (initialMovies.length > 0) {
            console.log(`✨ Insertando ${initialMovies.length} películas iniciales en Softflix...`);
            await Softflix.insertMany(initialMovies);
            console.log("✅ Inserción inicial completada con éxito.");
        } else {
            console.log("✅ Base de datos lista (vacía).");
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
        console.log(`\n🧹 LIMPIEZA DB: Se eliminaron ${result.deletedCount} documentos de 'Softflix'.`);
    } catch (err) {
        console.error('❌ ERROR al borrar datos de la base de datos:', err.message);
    }
}

export async function closeDB() {
    if (client) {
        try {
            await client.close();
            console.log("Conexión a MongoDB cerrada.");
        } catch (err) {
            console.error('Error cerrando el cliente MongoDB:', err.message);
        }
    }
}

export { initDB, cleanupDB, generateImagePaths, client };