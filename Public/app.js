document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================================
    // 1. CONFIGURACIÓN MODALES Y ELEMENTOS GLOBALES
    // =========================================================
    const resultModalEl = document.getElementById('resultModal');
    const resultModal = resultModalEl ? new bootstrap.Modal(resultModalEl) : null;
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnRedirect = document.getElementById('btnRedirect');

    // Helper para mostrar modal
    function showModal(title, msg, type) {
        if(!resultModal) return alert(msg);
        modalTitle.textContent = title;
        modalTitle.className = `modal-title text-${type}`;
        modalBody.textContent = msg;
        resultModal.show();
    }

    // =========================================================
    // 2. LÓGICA DE PREVISUALIZACIÓN DE IMÁGENES (CÓDIGO DE TU COMPAÑERO)
    // =========================================================
    const isEditingInput = document.getElementById('isEditing');
    const isEditing = isEditingInput ? isEditingInput.value === 'true' : false;

    function setupFilePreview(fileInputId) {
        const fileInput = document.getElementById(fileInputId);
        const newPreview = document.getElementById(fileInputId + 'NewPreview');
        const existingPreview = document.getElementById(fileInputId + 'ExistingPreview');
        const deleteBtn = document.getElementById('delete' + fileInputId.charAt(0).toUpperCase() + fileInputId.slice(1) + 'Btn');
        const deleteInput = document.getElementById('delete_' + fileInputId + '_input');

        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        if (existingPreview) existingPreview.style.display = 'none';
                        if (newPreview) {
                            newPreview.src = e.target.result;
                            newPreview.style.display = 'block';
                        }
                        if (deleteBtn) deleteBtn.style.display = 'flex';
                        if (isEditing && deleteInput) deleteInput.value = 'false';
                    }
                    reader.readAsDataURL(this.files[0]);
                } else {
                    if(newPreview) {
                        newPreview.src = '#';
                        newPreview.style.display = 'none';
                    }
                    const shouldRestoreExisting = isEditing && existingPreview && (deleteInput.value !== 'true');
                    if (shouldRestoreExisting) {
                        existingPreview.style.display = 'block';
                        if (deleteBtn) deleteBtn.style.display = 'flex';
                    } else if (!existingPreview && deleteBtn) {
                        deleteBtn.style.display = 'none';
                    }
                }
            });
        }
    }

    const imageFields = ['cover', 'titlePhoto', 'filmPhoto', 'fotoDirector', 'fotoActor1', 'fotoActor2', 'fotoActor3'];
    imageFields.forEach(field => setupFilePreview(field));

    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', function () {
            const fieldName = this.getAttribute('data-field');
            const existingPreview = document.getElementById(fieldName + 'ExistingPreview');
            const newPreview = document.getElementById(fieldName + 'NewPreview');
            const fileInput = document.getElementById(fieldName);
            const deleteInput = document.getElementById('delete_' + fieldName + '_input');

            if (existingPreview) existingPreview.style.display = 'none';
            if (newPreview) newPreview.style.display = 'none';
            this.style.display = 'none';
            if (fileInput) fileInput.value = '';
            if (isEditing && existingPreview && deleteInput) deleteInput.value = 'true';
            if (!isEditing && fileInput) fileInput.required = true;
        });
    });


    // =========================================================
    // 3. VALIDACIONES ESPECÍFICAS (Recuperadas)
    // =========================================================

    // A) USUARIO DISPONIBLE (Comentarios)
    const userNameInput = document.getElementById('userName');
    const userErrorDiv = document.getElementById('user-error');
    if (userNameInput) {
        let userTimeout;
        userNameInput.addEventListener('input', () => {
            clearTimeout(userTimeout);
            userNameInput.classList.remove('is-invalid', 'is-valid');
            userNameInput.setCustomValidity("");
            userTimeout = setTimeout(async () => {
                const val = userNameInput.value.trim();
                if(val.length > 0) {
                    try {
                        const res = await fetch(`/availableUsername?username=${encodeURIComponent(val)}`);
                        const data = await res.json();
                        if(!data.available) {
                            userNameInput.classList.add('is-invalid');
                            userNameInput.setCustomValidity("Taken");
                            if(userErrorDiv) userErrorDiv.textContent = data.message;
                        } else {
                            userNameInput.classList.add('is-valid');
                        }
                    } catch(e) {}
                }
            }, 500);
        });
    }

    // B) DIRECTOR A MAYÚSCULAS
    const directorInput = document.querySelector('input[name="director"]');
    if (directorInput) {
        directorInput.addEventListener('blur', async () => {
            if (directorInput.value.trim().length > 0) {
                try {
                    const res = await fetch('/textToUppercase', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ text: directorInput.value })
                    });
                    const data = await res.json();
                    directorInput.value = data.textUppercase;
                } catch(e) {}
            }
        });
    }

    // C) TÍTULO PELÍCULA (Validación)
    const titleInput = document.getElementById('title');
    const titleErrorServer = document.getElementById('title-error-server');
    if (titleInput) {
        let titleTimeout;
        titleInput.addEventListener('input', () => {
            clearTimeout(titleTimeout);
            titleInput.classList.remove('is-invalid', 'is-valid');
            if(titleErrorServer) titleErrorServer.style.display = 'none';
            titleInput.setCustomValidity("");
            titleTimeout = setTimeout(async () => {
                const title = titleInput.value.trim();
                if (title.length > 0 && title[0] !== title[0].toUpperCase()) {
                    titleInput.classList.add('is-invalid');
                    titleInput.setCustomValidity("Uppercase required");
                    return;
                }
                if (title.length > 0) {
                    try {
                        const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
                        if(response.ok) {
                            const data = await response.json();
                            if (!data.available) {
                                titleInput.classList.add('is-invalid');
                                if(titleErrorServer) titleErrorServer.style.display = 'block';
                                titleInput.setCustomValidity("Exists");
                            } else {
                                titleInput.classList.add('is-valid');
                            }
                        }
                    } catch (e) {}
                }
            }, 500);
        });
    }

    // D) GÉNEROS
    function validateGenres() {
        if (document.querySelectorAll('input[name="genre"]').length === 0) return true;
        const checked = document.querySelectorAll('input[name="genre"]:checked');
        const errDiv = document.getElementById('genre-error');
        if (checked.length === 0) {
            if(errDiv) errDiv.style.display = 'block';
            return false;
        }
        if(errDiv) errDiv.style.display = 'none';
        return true;
    }
    document.querySelectorAll('input[name="genre"]').forEach(cb => cb.addEventListener('change', validateGenres));


    // =========================================================
    // 4. ENVÍO DEL FORMULARIO PRINCIPAL (ARREGLADO PARA AJAX)
    // =========================================================
    const filmForm = document.getElementById('filmForm');
    
    if (filmForm) {
        filmForm.addEventListener('submit', async (event) => {
            // DETENER ENVÍO NATIVO
            event.preventDefault();
            event.stopPropagation();

            const isHtmlValid = filmForm.checkValidity();
            const isGenreValid = validateGenres();

            if (!isHtmlValid || !isGenreValid) {
                filmForm.classList.add('was-validated');
                return;
            }

            // Validar Título por AJAX una última vez antes de enviar
            if (titleInput && !isEditing) {
                const titleVal = titleInput.value;
                try {
                    const resCheck = await fetch(`/checkTitle?title=${encodeURIComponent(titleVal)}`);
                    const dataCheck = await resCheck.json();
                    if (!dataCheck.available) {
                        titleInput.classList.add('is-invalid');
                        if(titleErrorServer) titleErrorServer.style.display = 'block';
                        return; // Detenemos si está duplicado
                    }
                } catch(e) { return; }
            }

            // --- INICIO PROCESO ENVÍO ---
            const submitBtn = document.getElementById('submitBtn');
            toggleLoading(submitBtn, true);

            // TEMPORIZADOR 1.5s
            setTimeout(async () => {
                try {
                    const formData = new FormData(filmForm);
                    const response = await fetch(filmForm.getAttribute('action'), {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();

                    if (result.success) {
                        // REDIRECCIÓN MANUAL (Soluciona el Cannot GET)
                        window.location.href = result.redirectUrl;
                    } else {
                        showModal('Error', result.message, 'danger');
                        toggleLoading(submitBtn, false);
                    }
                } catch (error) {
                    showModal('Error', "Server connection failed", 'danger');
                    toggleLoading(submitBtn, false);
                }
            }, 1500);
        });
    }

    // =========================================================
    // 5. RESTAURACIÓN DEL FILTRADO (INDICE)
    // =========================================================
    
    // Búsqueda por texto (Al pulsar Enter)
    const searchInput = document.querySelector('input[name="search"]'); // Asegúrate que tu input en indice.html tenga name="search"
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Evitar submit standard si está en un form
                performSearch();
            }
        });
    }

    // Búsqueda al hacer clic en un botón de búsqueda (si existe)
    const searchBtn = document.querySelector('.btn-search'); // Ponle esta clase a tu botón de la lupa
    if(searchBtn) {
        searchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            performSearch();
        });
    }

    function performSearch() {
        const query = searchInput ? searchInput.value.trim() : '';
        // Obtenemos el género actual de la URL si existe para no perderlo
        const urlParams = new URLSearchParams(window.location.search);
        const currentGenre = urlParams.get('genre') || '';
        
        let targetUrl = `/indice?search=${encodeURIComponent(query)}`;
        if(currentGenre && currentGenre !== 'All') {
            targetUrl += `&genre=${encodeURIComponent(currentGenre)}`;
        }
        window.location.href = targetUrl;
    }

    // Filtrado por género (si usas un <select> o botones que no son <a>)
    // Si tus géneros son enlaces <a href="...">, funcionarán solos. 
    // Si son un <select id="genreFilter">, usa esto:
    const genreFilter = document.getElementById('genreFilter');
    if(genreFilter) {
        genreFilter.addEventListener('change', function() {
            const genre = this.value;
            const urlParams = new URLSearchParams(window.location.search);
            const currentSearch = urlParams.get('search') || '';
            
            let targetUrl = `/indice?genre=${encodeURIComponent(genre)}`;
            if(currentSearch) {
                targetUrl += `&search=${encodeURIComponent(currentSearch)}`;
            }
            window.location.href = targetUrl;
        });
    }


    // =========================================================
    // 6. HELPERS VISUALES
    // =========================================================
    function toggleLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        const spinner = document.getElementById('btnSpinner');
        const text = document.getElementById('btnText');
        const loadingText = document.getElementById('btnLoadingText');
        
        if(spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
        if(text) text.style.display = isLoading ? 'none' : 'inline-block';
        if(loadingText) loadingText.style.display = isLoading ? 'inline-block' : 'none';
    }

});
const searchInput = document.querySelector('input[name="search"]'); 
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                performSearch();
            }
        });
    }

    const searchBtn = document.querySelector('.btn-search'); 
    if(searchBtn) {
        searchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            performSearch();
        });
    }

    function performSearch() {
        const query = searchInput ? searchInput.value.trim() : '';
        const urlParams = new URLSearchParams(window.location.search);
        const currentGenre = urlParams.get('genre') || '';
        
        let targetUrl = `/indice?search=${encodeURIComponent(query)}`;
        if(currentGenre && currentGenre !== 'All') {
            targetUrl += `&genre=${encodeURIComponent(currentGenre)}`;
        }
        window.location.href = targetUrl;
    }