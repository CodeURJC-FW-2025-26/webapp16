let page = 2; // Empieza en pagina 2
let loading = false;

const filmContainer = document.getElementById('film-container');
const loader = document.getElementById('loader');

async function loadFilms() {
    if (loading) return;
    loading = true;
    if(loader) loader.style.display = 'block';

    try {
        // LEER FILTROS ACTUALES DE LA URL
        const urlParams = new URLSearchParams(window.location.search);
        const search = urlParams.get('search') || '';
        const genre = urlParams.get('genre') || '';

        // Construir URL API con filtros
        let apiUrl = `/api/films?page=${page}`;
        if(search) apiUrl += `&search=${encodeURIComponent(search)}`;
        if(genre) apiUrl += `&genre=${encodeURIComponent(genre)}`;

        const response = await fetch(apiUrl);
        const data = await response.json();
        const films = data.films;

        if (films.length === 0) {
            window.removeEventListener('scroll', handleScroll);
            if(loader) loader.style.display = 'none';
            return;
        }

        films.forEach(film => {
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 col-lg-4 d-flex justify-content-center';
            col.innerHTML = `
                <a href="/Ej/${film._id}">
                    <img src="${film.coverPath}" alt="${film.title}" class="gallery-img">
                </a>
            `;
            filmContainer.appendChild(col);
        });

        page++;
        
        // Simular retardo de carga (opcional)
        setTimeout(() => {
            if(loader) loader.style.display = 'none';
            loading = false;
        }, 500); 
    
    } catch (err) {
        console.error('Error loading films:', err);
        loading = false;
        if(loader) loader.style.display = 'none';
    }
}

function handleScroll() {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    // Cargar cuando falten 50px para el final
    if (scrollTop + clientHeight >= scrollHeight - 50) {
        loadFilms();
    }
}

// Verificar si estamos en la página indice antes de activar el scroll
if(document.getElementById('film-container')) {
    window.addEventListener('scroll', handleScroll);
}