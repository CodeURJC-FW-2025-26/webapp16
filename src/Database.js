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


// 🔑 FUNCIÓN AUXILIAR: Añade el prefijo '/Uploads' a la ruta y la rastrea.
const addUploadPrefix = (p) => {
    if (!p) return null;
    if (p.startsWith('/Uploads/')) return p;
    return `/Uploads${p}`;
};

// Función auxiliar para registrar rutas usadas
const addAndTrack = (p, tracker) => {
    const fullPath = addUploadPrefix(p);
    if (fullPath) tracker.add(fullPath); // Ahora SÍ usamos el Set para rastrear
    return fullPath;
};


// 💡 CRÍTICO: Función de transformación que asigna imágenes por tipo explícito + Fallback
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

    // --- 2. Inicialización de Variables de Rutas y Rastreador ---
    let directorImagePath = null;
    let coverPath = null;
    let titlePhotoPath = null;
    let filmPhotoPath = null;
    let actor1ImagePath = null;
    let actor2ImagePath = null;
    let actor3ImagePath = null;

    const allImages = movie.images || [];
    const usedPaths = new Set(); // Rastrea qué rutas ya fueron asignadas

    // 🔑 Mapeo de campos explícitos en el JSON a las variables de salida de la DB
    const fieldMap = {
        'cover': 'coverPath',
        'director': 'directorImagePath',
        'titlePhotoPath': 'titlePhotoPath',
        'filmPhotoPath': 'filmPhotoPath',
        'actor1ImagePath': 'actor1ImagePath',
        'actor2ImagePath': 'actor2ImagePath',
        'actor3ImagePath': 'actor3ImagePath',
    };

    // --- 3. Asignación directa basada en 'type' (Prioridad Alta) ---
    for (const img of allImages) {
        const targetField = fieldMap[img.type];
        if (targetField) {
            const path = addAndTrack(img.name, usedPaths);

            // Asignamos el valor a la variable local correcta
            if (targetField === 'coverPath') coverPath = path;
            else if (targetField === 'directorImagePath') directorImagePath = path;
            else if (targetField === 'titlePhotoPath') titlePhotoPath = path;
            else if (targetField === 'filmPhotoPath') filmPhotoPath = path;
            else if (targetField === 'actor1ImagePath') actor1ImagePath = path;
            else if (targetField === 'actor2ImagePath') actor2ImagePath = path;
            else if (targetField === 'actor3ImagePath') actor3ImagePath = path;
        }
    }

    // --- 4. Fallback: Asignar la Foto Principal (filmPhotoPath) si está nula ---
    // Si la foto principal no se asignó explícitamente, buscamos la primera imagen que no se haya usado.
    if (!filmPhotoPath) {
        const firstUnassignedImage = allImages.find(img => {
            const path = addUploadPrefix(img.name);
            return path && !usedPaths.has(path); // Encuentra la primera ruta que no está en el Set
        });

        if (firstUnassignedImage) {
            filmPhotoPath = addUploadPrefix(firstUnassignedImage.name);
            usedPaths.add(filmPhotoPath); // Marcamos esta como usada
        }
    }


    // --- 5. Devolvemos el objeto final para MongoDB ---
    return {
        title: title,
        url_slug: title.toLowerCase().replace(/\s+/g, '-'),
        description: description,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        genre: genre,
        rating: rating ? Number(rating) : undefined,
        ageClassification: ageClassification,
        director: director,

        // Rutas de imágenes (Asignación estable)
        directorImagePath: directorImagePath || null,
        coverPath: coverPath || null,

        actor1ImagePath: actor1ImagePath || null,
        actor2ImagePath: actor2ImagePath || null,
        actor3ImagePath: actor3ImagePath || null,

        titlePhotoPath: titlePhotoPath || null,
        filmPhotoPath: filmPhotoPath || null, // Garantizamos que tenga un valor, incluso si es null

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
        if (count > 0 || initialMovies.length > 0) {
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