document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // 1. CONFIGURACIÓN GLOBALES
    // =========================================================
    const resultModalEl = document.getElementById('resultModal');
    const resultModal = resultModalEl ? new bootstrap.Modal(resultModalEl) : null;
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnRedirect = document.getElementById('btnRedirect');

    function showModal(title, msg, type) {
        if (!resultModal) return alert(msg);
        modalTitle.textContent = title;
        modalTitle.className = `modal-title text-${type}`;
        modalBody.textContent = msg;
        if (btnRedirect) btnRedirect.style.display = 'none';
        // Limpiar eventos anteriores del botón cerrar
        if (btnCloseModal) btnCloseModal.onclick = null;
        resultModal.show();
    }

    function toggleLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        const spinner = btn.querySelector('.spinner-border'); // Busca por clase
        const text = btn.querySelector('.btn-text'); // Busca por clase
        // O busca por ID si usas los del add.html
        const spinnerId = document.getElementById('btnSpinner');
        const textId = document.getElementById('btnText');
        const loadTextId = document.getElementById('btnLoadingText');

        if (spinnerId) {
            // Lógica para add.html
            spinnerId.style.display = isLoading ? 'inline-block' : 'none';
            textId.style.display = isLoading ? 'none' : 'inline-block';
            loadTextId.style.display = isLoading ? 'inline-block' : 'none';
        } else {
            // Lógica para Ej.html (botones pequeños)
            if (spinner) spinner.classList.toggle('d-none', !isLoading);
        }
    }

    // =========================================================
    // 2. VALIDACIONES AJAX (Usuario, Título, Director, Géneros)
    // =========================================================

    // A) USUARIO (Comentarios)
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
                if (val.length > 0) {
                    try {
                        const res = await fetch(`/availableUsername?username=${encodeURIComponent(val)}`);
                        const data = await res.json();
                        if (!data.available) {
                            userNameInput.classList.add('is-invalid');
                            userNameInput.setCustomValidity("Taken");
                            if (userErrorDiv) userErrorDiv.textContent = data.message;
                        } else {
                            userNameInput.classList.add('is-valid');
                        }
                    } catch (e) { }
                }
            }, 500);
        });
    }

    // B) TÍTULO (Película)
    const titleInput = document.getElementById('title');
    const titleErrorServer = document.getElementById('title-error-server');
    if (titleInput) {
        let titleTimeout;
        titleInput.addEventListener('input', () => {
            clearTimeout(titleTimeout);
            titleInput.classList.remove('is-invalid', 'is-valid');
            if (titleErrorServer) titleErrorServer.style.display = 'none';
            titleInput.setCustomValidity("");
            titleTimeout = setTimeout(async () => {
                const title = titleInput.value.trim();
                // Validar Mayúscula localmente
                if (title.length > 0 && title[0] !== title[0].toUpperCase()) {
                    titleInput.classList.add('is-invalid');
                    titleInput.setCustomValidity("Uppercase required");
                    return;
                }
                // Validar AJAX
                if (title.length > 0) {
                    try {
                        const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
                        const data = await response.json();
                        if (!data.available) {
                            titleInput.classList.add('is-invalid');
                            if (titleErrorServer) titleErrorServer.style.display = 'block';
                            titleInput.setCustomValidity("Exists");
                        } else {
                            titleInput.classList.add('is-valid');
                        }
                    } catch (e) { }
                }
            }, 500);
        });
    }

    // C) DIRECTOR (Autocorrección Mayúsculas)
    const directorInput = document.querySelector('input[name="director"]');
    if (directorInput) {
        directorInput.addEventListener('blur', async () => {
            if (directorInput.value.trim().length > 0) {
                try {
                    const res = await fetch('/textToUppercase', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: directorInput.value })
                    });
                    const data = await res.json();
                    directorInput.value = data.textUppercase;
                } catch (e) { }
            }
        });
    }

    // D) GÉNEROS (Checkbox)
    function validateGenres() {
        if (document.querySelectorAll('input[name="genre"]').length === 0) return true;
        const checked = document.querySelectorAll('input[name="genre"]:checked');
        const errDiv = document.getElementById('genre-error');
        if (checked.length === 0) {
            if (errDiv) errDiv.style.display = 'block';
            return false;
        }
        if (errDiv) errDiv.style.display = 'none';
        return true;
    }
    document.querySelectorAll('input[name="genre"]').forEach(cb => cb.addEventListener('change', validateGenres));


    // =========================================================
    // 3. VISTA PREVIA, BORRADO Y DRAG AND DROP DE IMÁGENES
    // =========================================================

    function setupImageHandler(field, required) {
        const input = document.getElementById(field);
        const newPreview = document.getElementById(`${field}NewPreview`);
        const existingPreview = document.getElementById(`${field}ExistingPreview`);
        const deleteBtn = document.getElementById(`delete${field.charAt(0).toUpperCase() + field.slice(1)}Btn`);
        const deleteInput = document.getElementById(`delete_${field}_input`);

        // --- Lógica de Previsualización (Listener 'change' para input) ---
        if (input) {
            input.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    // Hay un archivo nuevo
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        if (newPreview) {
                            newPreview.src = e.target.result;
                            newPreview.style.display = 'block';
                        }
                        if (existingPreview) {
                            existingPreview.style.display = 'none';
                        }
                        if (deleteBtn) {
                            deleteBtn.style.display = 'block';
                        }
                        if (deleteInput) {
                            deleteInput.value = 'false'; // Anular borrado
                        }
                    };
                    reader.readAsDataURL(this.files[0]);
                    input.setCustomValidity("");
                } else {
                    // Input vacío (e.g., al cancelar selección después de Drag and Drop)
                    // Si el input está vacío y no hay imagen existente, se aplica la validación
                    if (required && (!existingPreview || existingPreview.style.display === 'none')) {
                        input.setCustomValidity("required");
                    }
                }
            });
        }

        // --- Lógica de Borrado (Listener 'click' para botón 'X') ---
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                // 1. Limpiar el input file
                if (input) {
                    input.value = ''; // Limpia el archivo seleccionado
                }

                // 2. Ocultar las vistas previas
                if (newPreview) {
                    newPreview.style.display = 'none';
                    newPreview.src = '#';
                }

                // 3. Manejar la imagen existente (marcar para borrado en el servidor)
                if (existingPreview) {
                    const hasExistingImage = existingPreview.src && existingPreview.src !== window.location.href && existingPreview.style.display !== 'none';
                    if (hasExistingImage) {
                        if (deleteInput) {
                            deleteInput.value = 'true'; // Marcar para borrado
                        }
                        existingPreview.style.display = 'none'; // Ocultar
                    }
                }

                // 4. Ocultar el botón de borrado
                this.style.display = 'none';

                // 5. Forzar la validación si es requerido y ahora está vacío
                if (required) {
                    input.setCustomValidity("required");
                }
            });
        }
    }

    // Inicializar el manejador de imágenes para cada campo
    const fields = [
        { name: 'cover' },
        { name: 'titlePhoto' },
        { name: 'filmPhoto' },
        { name: 'fotoDirector' },
        { name: 'fotoActor1' },
        { name: 'fotoActor2' },
        { name: 'fotoActor3' }
    ];

    fields.forEach(f => {
        // Obtenemos si el campo tiene el atributo 'required' en el HTML
        const isRequiredInHtml = document.getElementById(f.name)?.hasAttribute('required');
        setupImageHandler(f.name, isRequiredInHtml);
    });

    // --- Lógica de Drag and Drop ---
    function setupDragAndDrop(containerId, inputId) {
        const container = document.getElementById(containerId);
        const fileInput = document.getElementById(inputId);

        if (!container || !fileInput) return;

        // 1. Prevenir el comportamiento por defecto
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // 2. Resaltar la zona (opcional)
        container.addEventListener('dragenter', highlight, false);
        container.addEventListener('dragover', highlight, false);
        container.addEventListener('dragleave', unhighlight, false);
        container.addEventListener('drop', unhighlight, false);

        function highlight() {
            container.classList.add('highlight-dropzone'); // Clase que definirás en CSS
        }

        function unhighlight() {
            container.classList.remove('highlight-dropzone');
        }

        // 3. Manejar el 'drop'
        container.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0 && files[0].type.startsWith('image/')) {
                // Asignar el archivo arrastrado al input file
                fileInput.files = files;

                // Disparar el evento 'change' para activar el setupImageHandler
                fileInput.dispatchEvent(new Event('change'));
            }
        }
    }

    // Configurar Drag and Drop para cada contenedor de vista previa
    setupDragAndDrop('coverPreviewContainer', 'cover');
    setupDragAndDrop('titlePhotoPreviewContainer', 'titlePhoto');
    setupDragAndDrop('filmPhotoPreviewContainer', 'filmPhoto');
    setupDragAndDrop('fotoDirectorPreviewContainer', 'fotoDirector');
    setupDragAndDrop('fotoActor1PreviewContainer', 'fotoActor1');
    setupDragAndDrop('fotoActor2PreviewContainer', 'fotoActor2');
    setupDragAndDrop('fotoActor3PreviewContainer', 'fotoActor3');


    // =========================================================
    // 4. ENVÍO DE FORMULARIOS (ADD FILM / ADD COMMENT)
    // =========================================================
    const mainForms = [document.getElementById('filmForm'), document.getElementById('addCommentForm')];

    mainForms.forEach(form => {
        if (!form) return;
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const isHtmlValid = form.checkValidity();
            const isGenreValid = validateGenres();
            if (!isHtmlValid || !isGenreValid) {
                form.classList.add('was-validated');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            toggleLoading(submitBtn, true);

            //The spinner is running 1.5 seconds
            
            const delay = (form.id === 'filmForm' || form.id === 'addCommentForm') ? 1500 : 0;

            setTimeout(async () => {
                try {
                    const formData = new FormData(form);
                    let fetchOptions = { method: 'POST' };

                    // Add Comment usa JSON, Film usa Multipart
                    if (form.id === 'addCommentForm') {
                        const data = Object.fromEntries(formData.entries());
                        fetchOptions.headers = { 'Content-Type': 'application/json' };
                        fetchOptions.body = JSON.stringify(data);
                    } else {
                        fetchOptions.body = formData;
                    }

                    const response = await fetch(form.getAttribute('action'), fetchOptions);
                    const result = await response.json();

                    if (result.success) {
                        if (form.id === 'filmForm') {
                            // Éxito Película: Redirigir
                            window.location.href = result.redirectUrl;
                        } else {
                            // Éxito Comentario: Modal y Recarga
                            showModal('Added!', 'Review added successfully.', 'success');
                            form.reset();
                            form.classList.remove('was-validated');
                            if (btnCloseModal) btnCloseModal.onclick = () => window.location.reload();
                        }
                    } else {
                        showModal('Error', result.message, 'danger');
                    }
                } catch (error) {
                    showModal('Error', "Connection failed", 'danger');
                } finally {
                    toggleLoading(submitBtn, false);
                }
            }, delay);
        });
    });

    


    // =========================================================
    // 5. BOTONES COMENTARIOS (EDICIÓN EN LÍNEA Y BORRADO)
    // =========================================================
    // Usamos delegación en 'reviewsContainer' para que funcione
    const reviewsContainer = document.getElementById('reviewsContainer');

    if (reviewsContainer) {
        reviewsContainer.addEventListener('click', function (e) {

            // --- A) CLICK EN EDITAR (Genera Formulario) ---
            // Buscamos si el clic fue dentro de un botón con clase .btn-edit-inline o .btn-edit-comment
            const editBtn = e.target.closest('.btn-edit-inline') || e.target.closest('.btn-edit-comment');

            if (editBtn) {
                const container = editBtn.closest('.review');
                if (container.classList.contains('editing-mode')) return;

                // Leer datos actuales de los data-attributes
                const currentText = container.dataset.description || editBtn.dataset.text; // Fallback
                const currentRating = container.dataset.rating || editBtn.dataset.rating; // Fallback

                // HTML del formulario en línea
                const formHtml = `  
                    <form class="inline-edit-form p-3 border rounded bg-white shadow-sm" novalidate>
                        <h6 class="mb-3">Editing Review</h6>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Comment:</label>
                            <textarea class="form-control" name="reviewText" rows="3" required>${currentText}</textarea>
                        </div>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Rating (1-5):</label>
                            <input type="number" class="form-control form-control-sm" name="reviewRating" value="${currentRating}" min="1" max="5" required>
                        </div>
                        <div class="d-flex gap-2 justify-content-end">
                            <button type="button" class="btn btn-sm btn-secondary btn-cancel-edit">Cancel</button>
                            <button type="submit" class="btn btn-sm btn-success">Save Changes</button>
                        </div>
                    </form>
                `;

                // Guardar estado original
                
                container.dataset.originalHtml = container.innerHTML;
                container.innerHTML = formHtml;
                container.classList.add('editing-mode');
            }

            // --- B) CLICK EN CANCELAR EDICIÓN ---
            if (e.target.closest('.btn-cancel-edit')) {
                const container = e.target.closest('.review');
                container.innerHTML = container.dataset.originalHtml;
                container.classList.remove('editing-mode');
            }

            // --- C) CLICK EN BORRAR ---
            const deleteBtn = e.target.closest('.btn-delete-comment');
            if (deleteBtn) {
                if (!confirm("Are you sure you want to delete this comment?")) return;

                const cId = deleteBtn.dataset.commentId;
                const mId = deleteBtn.dataset.movieId;

                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                deleteBtn.disabled = true;

                fetch(`/deleteComment/${mId}/${cId}`, { method: 'POST' })
                    .then(r => r.json())
                    .then(data => {
                        setTimeout(() => {
                          if (data.success) {
                          // Borrar del DOM
                          const row = document.getElementById(`review-${cId}`);
                           if (row) row.remove();
                           } else {
                       alert(data.message);
                     deleteBtn.innerHTML = '<i class="bi bi-trash-fill"></i> Delete';
                     deleteBtn.disabled = false;
                     }
                   }, 700); 
                  })
                    .catch(() => {
                        alert("Error deleting");
                        deleteBtn.innerHTML = '<i class="bi bi-trash-fill"></i> Delete';
                        deleteBtn.disabled = false;
                    });
            }
        });

        // --- D) SUBMIT DEL FORMULARIO EN LÍNEA ---
        reviewsContainer.addEventListener('submit', async function (e) {
            if (e.target.classList.contains('inline-edit-form')) {
                e.preventDefault();
                e.stopPropagation();

                const form = e.target;
                const container = form.closest('.review');

                // Validación básica HTML5
                if (!form.checkValidity()) {
                    form.classList.add('was-validated');
                    return;
                }

                // Recoger datos
                const formData = new FormData(form);
                const newText = formData.get('reviewText');
                const newRating = formData.get('reviewRating');
                const cId = container.dataset.commentId;
                const mId = container.dataset.movieId;
                const userName = container.dataset.userName; // Necesario tenerlo en el div padre

                // Bloquear UI
                const inputs = form.querySelectorAll('input, textarea, button');
                inputs.forEach(el => el.disabled = true);

                try {
                    const res = await fetch(`/updateComment/${mId}/${cId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reviewText: newText, reviewRating: newRating })
                    });
                    const result = await res.json();

                    if (result.success) {
                        // ACTUALIZAR HTML DEL COMENTARIO (Sin recargar)
                        container.dataset.description = newText;
                        container.dataset.rating = newRating;

                        // Reconstruir el bloque del comentario
                        // IMPORTANTE: Asegurarse de que las clases de los botones coincidan con los listeners (btn-edit-inline)
                        const newHtml = `
                            <div class="review-content">
                                <div class="user-info d-flex align-items-center mb-1">
                                    <img src="/User/User.png" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
                                    <strong>${userName}</strong>
                                    <span class="badge bg-warning text-dark ms-3">⭐ ${newRating}/5</span>
                                </div>
                                <p class="mb-1">${newText}</p>
                            </div>
                            <div class="review-actions d-flex gap-2">
                                <button class="btn btn-sm btn-outline-primary btn-edit-inline" 
                                        data-text="${newText}" data-rating="${newRating}">
                                    <i class="bi bi-pencil-fill"></i> Edit
                                </button>
                                <button class="btn btn-sm btn-outline-danger btn-delete-comment" 
                                        data-comment-id="${cId}" data-movie-id="${mId}">
                                    <i class="bi bi-trash-fill"></i> Delete
                                </button>
                            </div>
                        `;

                        container.innerHTML = newHtml;
                        container.classList.remove('editing-mode');

                    } else {
                        alert("Error: " + result.message);
                        inputs.forEach(el => el.disabled = false);
                    }
                } catch (err) {
                    alert("Server Error");
                    inputs.forEach(el => el.disabled = false);
                }
            }
        });
    }


    // =========================================================
    // 6. RESTAURACIÓN DEL BUSCADOR (INDICE)
    // =========================================================
    const searchInput = document.querySelector('input[name="search"]');
    const searchBtn = document.querySelector('.btn-search');

    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', function (e) {
            e.preventDefault();
            performSearch();
        });
    }

    function performSearch() {
        const query = searchInput ? searchInput.value.trim() : '';
        const urlParams = new URLSearchParams(window.location.search);
        const currentGenre = urlParams.get('genre') || '';

        let targetUrl = `/indice?search=${encodeURIComponent(query)}`;
        if (currentGenre && currentGenre !== 'All') {
            targetUrl += `&genre=${encodeURIComponent(currentGenre)}`;
        }
        window.location.href = targetUrl;
    }
});