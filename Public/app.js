document.addEventListener('DOMContentLoaded', () => {
    // --- MODALES ---
    const resultModalEl = document.getElementById('resultModal');
    const resultModal = resultModalEl ? new bootstrap.Modal(resultModalEl) : null;
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const editModalEl = document.getElementById('editCommentModal');
    const editModal = editModalEl ? new bootstrap.Modal(editModalEl) : null;

    // =========================================================
    // 1. VALIDACIONES ESPECÍFICAS "RECUPERADAS"
    // =========================================================

    // A) VALIDAR USUARIO DISPONIBLE (Formulario Comentarios)
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
                            userNameInput.classList.add('is-invalid'); // Esto activa el mensaje rojo de Bootstrap
                            userNameInput.setCustomValidity("Taken");
                            if(userErrorDiv) userErrorDiv.textContent = data.message;
                        } else {
                            userNameInput.classList.add('is-valid');
                        }
                    } catch(e) { console.error(e); }
                }
            }, 500);
        });
    }

    // B) VALIDAR TÍTULO (Formulario Película)
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
                // Check Mayúscula
                if (title.length > 0 && title[0] !== title[0].toUpperCase()) {
                    titleInput.classList.add('is-invalid');
                    titleInput.setCustomValidity("Uppercase required");
                    return;
                }
                // Check Server Ajax
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
                    } catch (e) { console.error(e); }
                }
            }, 500);
        });
    }

    // C) VALIDAR GÉNEROS (Formulario Película)
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
    // 2. LOGICA FORMULARIO PELÍCULA (Temporizador + Redirect)
    // =========================================================
    const filmForm = document.getElementById('filmForm');
    if (filmForm) {
        // Opcional: Usar textToUppercase para el director al salir del campo
        const directorInput = filmForm.querySelector('input[name="director"]');
        if(directorInput) {
            directorInput.addEventListener('blur', async () => {
                if(directorInput.value) {
                    try {
                        const res = await fetch('/textToUppercase', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({text: directorInput.value})
                        });
                        const data = await res.json();
                        directorInput.value = data.textUppercase; // Autocorrección a mayúsculas
                    } catch(e) {}
                }
            });
        }

        filmForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const isHtmlValid = filmForm.checkValidity();
            const isGenreValid = validateGenres();
            if (!isHtmlValid || !isGenreValid) {
                filmForm.classList.add('was-validated');
                return;
            }

            const submitBtn = document.getElementById('submitBtn');
            toggleLoading(submitBtn, true);

            setTimeout(async () => {
                try {
                    const formData = new FormData(filmForm);
                    const response = await fetch(filmForm.getAttribute('action'), { method: 'POST', body: formData });
                    const result = await response.json();

                    if (result.success) {
                        window.location.href = result.redirectUrl;
                    } else {
                        showModal('Error', result.message, 'danger');
                        toggleLoading(submitBtn, false);
                    }
                } catch (error) {
                    showModal('Error', "Server Error", 'danger');
                    toggleLoading(submitBtn, false);
                }
            }, 1500); 
        });
    }


    // =========================================================
    // 3. LOGICA FORMULARIOS COMENTARIOS (AJAX + MODAL)
    // =========================================================
    const commentForms = [document.getElementById('addCommentForm'), document.getElementById('editCommentForm')];
    
    commentForms.forEach(form => {
        if(!form) return;
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            toggleLoading(submitBtn, true);

            try {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                let url = form.getAttribute('action');

                if (form.id === 'editCommentForm') {
                    const cId = document.getElementById('editCommentId').value;
                    const mId = document.getElementById('editMovieId').value;
                    url = `/updateComment/${mId}/${cId}`;
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();

                if (result.success) {
                    if (editModal) editModal.hide();
                    showModal('Success!', result.message, 'success');
                    if(btnCloseModal) btnCloseModal.onclick = () => window.location.reload();
                } else {
                    showModal('Error', result.message, 'danger');
                }
            } catch (error) {
                showModal('Error', error.message, 'danger');
            } finally {
                toggleLoading(submitBtn, false);
            }
        });
    });


    // =========================================================
    // 4. BORRAR Y EDITAR COMENTARIOS
    // =========================================================
    document.querySelectorAll('.btn-delete-comment').forEach(btn => {
        btn.addEventListener('click', async function() {
            if(!confirm("Delete comment?")) return;
            const cId = this.dataset.commentId;
            const mId = this.dataset.movieId;
            
            const originalHtml = this.innerHTML;
            this.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            this.disabled = true;

            try {
                const res = await fetch(`/deleteComment/${mId}/${cId}`, { method: 'POST' });
                const data = await res.json();
                if(data.success) {
                    document.getElementById(`review-${cId}`).remove();
                } else {
                    alert(data.message);
                    this.innerHTML = originalHtml;
                    this.disabled = false;
                }
            } catch(e) {
                alert("Error deleting");
                this.innerHTML = originalHtml;
                this.disabled = false;
            }
        });
    });

    document.querySelectorAll('.btn-edit-comment').forEach(btn => {
        btn.addEventListener('click', function() {
            if(!editModal) return;
            document.getElementById('editCommentId').value = this.dataset.commentId;
            document.getElementById('editMovieId').value = this.dataset.movieId;
            document.getElementById('editReviewText').value = this.dataset.text;
            document.getElementById('editReviewRating').value = this.dataset.rating;
            editModal.show();
        });
    });

    // =========================================================
    // HELPERS
    // =========================================================
    function toggleLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        const spinner = document.getElementById('btnSpinner') || btn.querySelector('.spinner-border');
        const text = document.getElementById('btnText') || btn.querySelector('.btn-text');
        const loadText = document.getElementById('btnLoadingText');

        if(spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
        if(spinner && spinner.classList.contains('d-none')) spinner.classList.toggle('d-none', !isLoading);
        
        if(text) text.style.display = isLoading ? 'none' : 'inline-block';
        if(loadText) loadText.style.display = isLoading ? 'inline-block' : 'none';
    }

    function showModal(title, msg, type) {
        if(!resultModal) return alert(msg);
        modalTitle.textContent = title;
        modalTitle.className = `modal-title text-${type}`;
        modalBody.textContent = msg;
        resultModal.show();
    }
});