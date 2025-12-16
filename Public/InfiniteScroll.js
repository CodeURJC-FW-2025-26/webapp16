let page = 2; // Start in second page
let loading = false;

const filmContainer = document.getElementById('film-container');
const loader = document.getElementById('loader');

async function loadFilms() {
    if (loading) return;
    loading = true;
    if(loader) loader.style.display = 'block';

    try {
        // Read filters of the URL
        const urlParams = new URLSearchParams(window.location.search);
        const search = urlParams.get('search') || '';
        const genre = urlParams.get('genre') || '';

        // We do and create the appi
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
        
        // Set time to the spinner, 500ms
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
    // Load when scrollHeight is 50 
    if (scrollTop + clientHeight >= scrollHeight - 50) {
        loadFilms();
    }
}

// Verify if we are in the index page
if(document.getElementById('film-container')) {
    window.addEventListener('scroll', handleScroll);
}