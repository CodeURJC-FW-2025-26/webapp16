import { MongoClient } from 'mongodb';
import fs from 'fs';
import path, { resolve } from 'path';
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
    // Si la ruta ya empieza con /Uploads/, no la volvemos a añadir
    if (p.startsWith('/Uploads/')) return p;
    // De lo contrario, añade el prefijo. Asumimos que la ruta de data.json empieza con /
    return `/Uploads${p}`;
};


// 💡 CRÍTICO: Función de transformación con limpieza robusta de rutas.
const generateImagePaths = (movie) => {

    const title = movie.Title || movie.title;
    const releaseYear = movie.Realase_year || movie.releaseYear;
    const genre = movie.Gender || movie.genre;
    const rating = movie.Calification || movie.rating;
    const ageClassification = movie.Age_classification || movie.ageClassification;
    const director = movie.Director || movie.director;
    const duration = movie.Duration || movie.duration;
    const description = movie.description;
    const comments = movie.Comentary || movie.comments;

    // 🔑 Desglosar el campo 'cast' (string) en un array de nombres.
    const castString = movie.Casting || movie.cast;
    const castArray = castString
        ? (Array.isArray(castString) ? castString : castString.split(',').map(name => name.trim()))
        : [];

    let directorImagePath = null;
    let cover = null;

    if (movie.images && Array.isArray(movie.images)) {

        // 🔑 CORRECCIÓN 1: Usar la propiedad .name (donde está la ruta en data.json)
        const coverImage = movie.images.find(img => img.type === 'cover');
        if (coverImage) {
            // ✅ APLICAR CORRECCIÓN: Añadir prefijo /Uploads
            cover = addUploadPrefix(coverImage.name);
        }

        // El director en data.json tiene 'type': 'director', lo buscamos.
        const directorImage = movie.images.find(img => img.type === 'director');
        if (directorImage) {
            // ✅ APLICAR CORRECCIÓN: Añadir prefijo /Uploads
            directorImagePath = addUploadPrefix(directorImage.name);
        }
    }

    // 🔑 Mapeo del director (Generamos una ruta si no se encontró una específica en el array)
    if (!directorImagePath && director) {
        const safeName = director.replace(/\s/g, '_');
        // 💡 Ajuste de ruta de fallback: Usamos /Uploads/Directors/ (más común)
        // Si tu carpeta es realmente /Public/Uploads/Imagenes/Directors, usa la línea comentada
        directorImagePath = `/Uploads/Directors/${safeName}.jpg`;
        // directorImagePath = `/Uploads/Imagenes/Directors/${safeName}.jpg`; // Si esta es tu ruta real
    }


    // Este es el objeto final que se inserta en MongoDB:
    return {
        title: title,
        description: description,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        genre: genre,
        rating: rating ? Number(rating) : undefined,
        ageClassification: ageClassification,
        director: director,

        // 🔑 Rutas de imágenes (estandarizadas y corregidas con /Uploads/)
        directorImagePath: directorImagePath,
        coverPath: cover,

        // Los campos actorXImagePath vienen del data.json original y son null en este punto.
        // Se llenarán al guardar una película manualmente en router.js.
        actor1ImagePath: movie.image_actor1 || null,
        actor2ImagePath: movie.image_actor2 || null,
        actor3ImagePath: movie.image_actor3 || null,

        titlePhotoPath: null, // Se inicializan a null
        filmPhotoPath: null, // Se inicializan a null

        cast: castArray,
        duration: duration,
        language: Array.isArray(movie.Language) ? movie.Language : (movie.Language ? [movie.Language] : []),
        comments: comments || []
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


async function initDB(app) {
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
                console.log(`RUTA GUARDADA PARA LA PRIMERA PELÍCULA (CORREGIDA): ${initialMovies[0].coverPath}`);
            }

            await Softflix.insertMany(initialMovies);
            console.log("✅ Inserción inicial completada con éxito.");
        } else {
            console.log(`✅ Softflix ya contiene ${count} películas. Omite la inserción inicial.`);
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