document.addEventListener('DOMContentLoaded', () => {
    // --- MODALES GLOBALES ---
    const resultModalEl = document.getElementById('resultModal');
    const resultModal = resultModalEl ? new bootstrap.Modal(resultModalEl) : null;
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnRedirect = document.getElementById('btnRedirect');

    // =========================================================
    // 1. VALIDACIONES ESPECÍFICAS
    // =========================================================

    // A) USUARIO DISPONIBLE
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

    // C) TÍTULO DUPLICADO
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
    // 2. GESTIÓN FORMULARIOS PRINCIPALES (ADD FILM / ADD COMMENT)
    // =========================================================
    const mainForms = [document.getElementById('filmForm'), document.getElementById('addCommentForm')];
    
    mainForms.forEach(form => {
        if(!form) return;
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const isHtmlValid = form.checkValidity();
            const isGenreValid = validateGenres(); // Solo afecta si hay géneros
            if (!isHtmlValid || !isGenreValid) {
                form.classList.add('was-validated');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            toggleLoading(submitBtn, true);

            // Si es film form, usamos delay de 1.5s
            const delay = (form.id === 'filmForm') ? 1500 : 0;

            setTimeout(async () => {
                try {
                    const formData = new FormData(form);
                    let fetchOptions = { method: 'POST' };
                    
                    // Add Comment usa JSON
                    if (form.id === 'addCommentForm') {
                        const data = Object.fromEntries(formData.entries());
                        fetchOptions.headers = { 'Content-Type': 'application/json' };
                        fetchOptions.body = JSON.stringify(data);
                    } else {
                        // Film form usa Multipart
                        fetchOptions.body = formData;
                    }

                    const response = await fetch(form.getAttribute('action'), fetchOptions);
                    const result = await response.json();

                    if (result.success) {
                        if(form.id === 'filmForm') {
                            window.location.href = result.redirectUrl;
                        } else {
                            showModal('Added!', 'Review added successfully.', 'success');
                            form.reset(); 
                            form.classList.remove('was-validated');
                            if(btnCloseModal) btnCloseModal.onclick = () => window.location.reload();
                        }
                    } else {
                        showModal('Error', result.message, 'danger');
                    }
                } catch (error) {
                    showModal('Error', "Server Error", 'danger');
                } finally {
                    toggleLoading(submitBtn, false);
                }
            }, delay);
        });
    });


    // =========================================================
    // 3. EDICIÓN EN LÍNEA DE COMENTARIOS (¡LO NUEVO!)
    // =========================================================
    
    // Delegación de eventos (usamos el container padre)
    const reviewsContainer = document.getElementById('reviewsContainer');
    if (reviewsContainer) {
        reviewsContainer.addEventListener('click', function(e) {
            
            // --- CLICK EN BOTÓN EDITAR ---
            if (e.target.closest('.btn-edit-inline')) {
                const container = e.target.closest('.review');
                if (container.classList.contains('editing-mode')) return; // Ya se está editando

                // Leer datos actuales
                const currentText = container.dataset.description;
                const currentRating = container.dataset.rating;
                
                // Generar HTML del formulario
                const formHtml = `
                    <form class="inline-edit-form needs-validation p-2 border rounded bg-white" novalidate>
                        <div class="mb-2">
                            <label class="form-label small fw-bold">Update your review:</label>
                            <textarea class="form-control" name="reviewText" rows="3" required>${currentText}</textarea>
                            <div class="invalid-feedback">Text is required.</div>
                        </div>
                        <div class="mb-2">
                            <label class="form-label small fw-bold">Rating:</label>
                            <input type="number" class="form-control form-control-sm" name="reviewRating" value="${currentRating}" min="1" max="5" required>
                            <div class="invalid-feedback">1-5</div>
                        </div>
                        <div class="d-flex gap-2 justify-content-end">
                            <button type="button" class="btn btn-sm btn-secondary btn-cancel-edit">Cancel</button>
                            <button type="submit" class="btn btn-sm btn-success">Save Changes</button>
                        </div>
                    </form>
                `;

                // Guardar HTML original para poder cancelar
                container.dataset.originalHtml = container.innerHTML;
                
                // Inyectar formulario
                container.innerHTML = formHtml;
                container.classList.add('editing-mode');
            }

            // --- CLICK EN BOTÓN CANCELAR ---
            if (e.target.closest('.btn-cancel-edit')) {
                const container = e.target.closest('.review');
                // Restaurar HTML original
                container.innerHTML = container.dataset.originalHtml;
                container.classList.remove('editing-mode');
            }

            // --- CLICK EN BORRAR (Reutilizamos lógica) ---
            if (e.target.closest('.btn-delete-comment')) {
                const btn = e.target.closest('.btn-delete-comment');
                if(!confirm("Delete comment?")) return;
                
                const cId = btn.dataset.commentId;
                const mId = btn.dataset.movieId;
                
                // Spinner pequeño en el botón
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                btn.disabled = true;

                fetch(`/deleteComment/${mId}/${cId}`, { method: 'POST' })
                    .then(r => r.json())
                    .then(data => {
                        if(data.success) document.getElementById(`review-${cId}`).remove();
                        else { alert(data.message); btn.innerHTML = '<i class="bi bi-trash-fill"></i> Delete'; btn.disabled=false; }
                    })
                    .catch(() => alert("Error deleting"));
            }
        });

        // --- SUBMIT DEL FORMULARIO EN LÍNEA (Delegación con 'capture' o check directo) ---
        // Como el form se crea dinámicamente, escuchamos el evento 'submit' en el contenedor
        reviewsContainer.addEventListener('submit', async function(e) {
            if (e.target.classList.contains('inline-edit-form')) {
                e.preventDefault();
                e.stopPropagation();
                
                const form = e.target;
                const container = form.closest('.review');
                
                if (!form.checkValidity()) {
                    form.classList.add('was-validated');
                    return;
                }

                // Datos
                const formData = new FormData(form);
                const newText = formData.get('reviewText');
                const newRating = formData.get('reviewRating');
                const cId = container.dataset.commentId;
                const mId = container.dataset.movieId;
                const userName = container.dataset.userName; // Recuperamos nombre para repintar

                // Bloquear inputs
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
                        // ÉXITO: RECONSTRUIMOS EL HTML DE VISUALIZACIÓN CON DATOS NUEVOS
                        // Actualizamos dataset
                        container.dataset.description = newText;
                        container.dataset.rating = newRating;
                        
                        const newHtml = `
                            <div class="view-mode d-flex justify-content-between align-items-start">
                                <div class="review-content">
                                    <div class="user-info d-flex align-items-center mb-1">
                                        <img src="/User/User.png" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
                                        <strong>${userName}</strong>
                                        <span class="badge bg-warning text-dark ms-3">⭐ ${newRating}/5</span>
                                    </div>
                                    <p class="mb-1 text-content">${newText}</p>
                                </div>
                                <div class="review-actions d-flex gap-2">
                                    <button class="btn btn-sm btn-outline-primary btn-edit-inline"><i class="bi bi-pencil-fill"></i> Edit</button>
                                    <button class="btn btn-sm btn-outline-danger btn-delete-comment" 
                                            data-comment-id="${cId}" data-movie-id="${mId}"><i class="bi bi-trash-fill"></i> Delete</button>
                                </div>
                            </div>
                        `;
                        
                        container.innerHTML = newHtml;
                        container.classList.remove('editing-mode');
                        
                    } else {
                        showModal('Error', result.message, 'danger');
                        inputs.forEach(el => el.disabled = false);
                    }
                } catch(err) {
                    showModal('Error', "Server Error", 'danger');
                    inputs.forEach(el => el.disabled = false);
                }
            }
        });
    }


    // =========================================================
    // HELPERS
    // =========================================================
    function toggleLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        const spinner = document.getElementById('btnSpinner') || btn.querySelector('.spinner-border');
        const text = document.getElementById('btnText') || btn.querySelector('.btn-text');
        
        if(spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
        if(spinner && spinner.classList.contains('d-none')) spinner.classList.toggle('d-none', !isLoading);
        if(text) text.style.display = isLoading ? 'none' : 'inline-block';
    }

    function showModal(title, msg, type) {
        if(!resultModal) return alert(msg);
        modalTitle.textContent = title;
        modalTitle.className = `modal-title text-${type}`;
        modalBody.textContent = msg;
        resultModal.show();
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const isEditingInput = document.getElementById('isEditing');
    const isEditing = isEditingInput ? isEditingInput.value === 'true' : false;
    const form = document.getElementById('filmForm');

    // ----------------------------------------------------
    // 1. LÓGICA DE PREVISUALIZACIÓN DE ARCHIVOS
    // ----------------------------------------------------

    // Función para configurar la previsualización y el botón de borrado
    function setupFilePreview(fileInputId) {
        const fileInput = document.getElementById(fileInputId);
        const newPreview = document.getElementById(fileInputId + 'NewPreview');
        const existingPreview = document.getElementById(fileInputId + 'ExistingPreview');
        const deleteBtn = document.getElementById('delete' + fileInputId.charAt(0).toUpperCase() + fileInputId.slice(1) + 'Btn');
        const deleteInput = document.getElementById('delete_' + fileInputId + '_input'); // Solo existe en modo edición

        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();

                    reader.onload = function (e) {
                        // Oculta la imagen existente (si hay)
                        if (existingPreview) existingPreview.style.display = 'none';

                        // Muestra la nueva previsualización
                        newPreview.src = e.target.result;
                        newPreview.style.display = 'block';

                        // Muestra el botón de eliminar
                        if (deleteBtn) deleteBtn.style.display = 'flex';

                        // Si se sube una nueva foto, reinicia el campo hidden de eliminación (solo en edición)
                        if (isEditing && deleteInput) deleteInput.value = 'false';
                    }
                    reader.readAsDataURL(this.files[0]);
                } else {
                    // Si se cancela la selección (e.g., abre el diálogo y lo cierra sin seleccionar)
                    newPreview.src = '#';
                    newPreview.style.display = 'none';

                    // Si estamos en modo edición y la imagen existente no está marcada para borrarse, la restauramos
                    const shouldRestoreExisting = isEditing && existingPreview && (deleteInput.value !== 'true');

                    if (shouldRestoreExisting) {
                        existingPreview.style.display = 'block';
                        if (deleteBtn) deleteBtn.style.display = 'flex';
                    } else if (!existingPreview) {
                        // En modo 'Agregar' o si la existente fue borrada, ocultamos el botón
                        if (deleteBtn) deleteBtn.style.display = 'none';
                    }
                }
            });
        }
    }

    // Configura todos los campos de imagen
    const imageFields = [
        'cover', 'titlePhoto', 'filmPhoto', 'fotoDirector',
        'fotoActor1', 'fotoActor2', 'fotoActor3'
    ];
    imageFields.forEach(field => {
        setupFilePreview(field);
    });

    // ----------------------------------------------------
    // 2. LÓGICA DEL BOTÓN DE ELIMINAR (ÚNICO PARA TODOS LOS MODOS)
    // ----------------------------------------------------
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', function () {
            const fieldName = this.getAttribute('data-field');
            const inputId = fieldName;

            const existingPreview = document.getElementById(inputId + 'ExistingPreview');
            const newPreview = document.getElementById(inputId + 'NewPreview');
            const fileInput = document.getElementById(inputId);
            const deleteInput = document.getElementById('delete_' + inputId + '_input'); // Solo existe en edición

            // 1. Ocultar todas las previsualizaciones y el botón X
            if (existingPreview) existingPreview.style.display = 'none';
            if (newPreview) newPreview.style.display = 'none';
            this.style.display = 'none';

            // 2. Limpiar el input type=file
            if (fileInput) fileInput.value = '';

            // 3. Marcar el campo hidden (Solo si estamos en Edición y había una imagen existente)
            // Esto le dice al servidor que debe borrar la ruta en la DB.
            if (isEditing && existingPreview) {
                if (deleteInput) deleteInput.value = 'true';
            }

            // 4. Asegurarse de que el campo 'required' se active si estamos en modo 'Agregar'
            if (!isEditing && fileInput) {
                fileInput.required = true;
            }
        });
    });

    // ... RESTO DE TU LÓGICA DE VALIDACIÓN (Debe ir aquí, la estoy omitiendo para brevedad) ...

    // ----------------------------------------------------
    // 3. VALIDACIÓN DE GÉNERO Y ENVÍO DE FORMULARIO
    // ----------------------------------------------------
    form.addEventListener('submit', function (event) {
        // ... (El resto de tu código de validación de género y AJAX) ...
        let genreChecked = false;
        const genreCheckboxes = form.querySelectorAll('input[name="genre"]:checked');
        if (genreCheckboxes.length > 0) {
            genreChecked = true;
        }

        const genreError = document.getElementById('genre-error');
        if (!genreChecked) {
            genreError.style.display = 'block';
            event.preventDefault();
            event.stopPropagation();
        } else {
            genreError.style.display = 'none';
        }

        // Validación de Bootstrap
        if (!form.checkValidity()) {
            event.preventDefault();
            event.stopPropagation();
        } else {
            if (!isEditing) {
                event.preventDefault(); // Detenemos el envío hasta la validación AJAX
                validateTitleAndSubmit();
            }
        }

        // Agrega la clase 'was-validated' de Bootstrap para mostrar feedback
        form.classList.add('was-validated');
    }, false);


    // ... Lógica para AJAX Validation (checkTitleExistence y validateTitleAndSubmit) ...

    const titleInput = document.getElementById('title');
    const titleErrorServer = document.getElementById('title-error-server');

    titleInput.addEventListener('blur', function () {
        if (!isEditing && titleInput.checkValidity()) {
            checkTitleExistence(titleInput.value);
        }
    });

    async function checkTitleExistence(title) {
        try {
            const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
            const data = await response.json();

            if (!data.available) {
                titleInput.setCustomValidity("Title is already taken.");
                titleErrorServer.style.display = 'block';
            } else {
                titleInput.setCustomValidity("");
                titleErrorServer.style.display = 'none';
            }
            titleInput.reportValidity();
        } catch (err) {
            console.error('Error checking title:', err);
        }
    }

    async function validateTitleAndSubmit() {
        const submitBtn = document.getElementById('submitBtn');
        const btnText = document.getElementById('btnText');
        const btnSpinner = document.getElementById('btnSpinner');
        const btnLoadingText = document.getElementById('btnLoadingText');

        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnSpinner.style.display = 'inline-block';
        btnLoadingText.style.display = 'inline-block';

        try {
            const title = titleInput.value;
            const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
            const data = await response.json();

            if (!data.available) {
                titleInput.setCustomValidity("Title is already taken.");
                titleErrorServer.style.display = 'block';
                form.classList.add('was-validated');
            } else {
                titleInput.setCustomValidity("");
                titleErrorServer.style.display = 'none';
                form.submit();
            }
        } catch (err) {
            console.error('Error validating title on submit:', err);
        } finally {
            if (titleInput.checkValidity() && titleErrorServer.style.display === 'none') {
                // If submitted successfully, do nothing here
            } else {
                submitBtn.disabled = false;
                btnText.style.display = 'inline';
                btnSpinner.style.display = 'none';
                btnLoadingText.style.display = 'none';
            }
        }
    }
});