let page = 2; // We start in page 2, because first is loaded with mustache
let loading = false;

const filmContainer = document.getElementById('film-container');
const loader = document.getElementById('loader');

async function loadFilms() {
    if (loading) return;
    loading = true;
    loader.style.display = 'block'; // Show loader

    try {
        const response = await fetch(`/api/films?page=${page}`);
        const data = await response.json();
        const films = data.films;

        if (films.length === 0) {
            window.removeEventListener('scroll', handleScroll);
            loader.style.display = 'none';
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
        setTimeout(() => {
        loader.style.display = 'none'; // None loader after 1000 ms
        loading = false;
        }, 2000);   
    
    } catch (err) {
        console.error('Error loading films:', err);
        loading = false;
        loader.style.display = 'none';
    }
}

function handleScroll() {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 10) {
        loadFilms();
    }
}

window.addEventListener('scroll', handleScroll);