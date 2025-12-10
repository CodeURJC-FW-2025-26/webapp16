document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filmForm');
    
    // --- ELEMENTOS DEL MODAL ---
    const resultModalElement = document.getElementById('resultModal');
    let resultModal;
    if (resultModalElement) {
        resultModal = new bootstrap.Modal(resultModalElement);
    }
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const btnRedirect = document.getElementById('btnRedirect'); // El botón del modal

    // --- ELEMENTOS DEL BOTÓN DE ENVÍO Y SPINNER ---
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnLoadingText = document.getElementById('btnLoadingText');

    // --- VALIDACIÓN TÍTULO AJAX ---
    const titleInput = document.getElementById('title');
    const titleErrorServer = document.getElementById('title-error-server');
    let titleTimeout;

    if(titleInput) {
        titleInput.addEventListener('input', () => {
            clearTimeout(titleTimeout);
            titleInput.classList.remove('is-invalid', 'is-valid');
            if(titleErrorServer) titleErrorServer.style.display = 'none';
            titleInput.setCustomValidity(""); 

            titleTimeout = setTimeout(async () => {
                const title = titleInput.value.trim();
                if (title.length > 0) {
                    try {
                        const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
                        const data = await response.json();
                        
                        if (!data.available) {
                            // Nota: Aquí podrías añadir lógica para ignorar si es el mismo título al editar
                            titleInput.classList.add('is-invalid');
                            if(titleErrorServer) titleErrorServer.style.display = 'block';
                            titleInput.setCustomValidity("Title exists"); 
                        } else {
                            titleInput.classList.add('is-valid');
                            titleInput.setCustomValidity("");
                        }
                    } catch (error) {
                        console.error("Error validando título", error);
                    }
                }
            }, 500);
        });
    }

    // --- VALIDACIÓN GÉNEROS ---
    function validateGenres() {
        const checkboxes = document.querySelectorAll('input[name="genre"]:checked');
        const errorDiv = document.getElementById('genre-error');
        if (document.querySelectorAll('input[name="genre"]').length === 0) return true;

        if (checkboxes.length === 0) {
            if(errorDiv) errorDiv.style.display = 'block';
            return false;
        } else {
            if(errorDiv) errorDiv.style.display = 'none';
            return true;
        }
    }
    
    const allGenres = document.querySelectorAll('input[name="genre"]');
    allGenres.forEach(cb => {
        cb.addEventListener('change', validateGenres);
    });

    // --- ENVÍO DEL FORMULARIO (MODIFICADO PARA TU PETICIÓN) ---
    if(form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault(); 
            event.stopPropagation();

            const isHtmlValid = form.checkValidity();
            const isGenreValid = validateGenres(); 

            if (!isHtmlValid || !isGenreValid) {
                form.classList.add('was-validated'); 
                return; 
            }

            toggleLoadingState(true);

            const formData = new FormData(form);
            const actionUrl = form.getAttribute('action'); 

            try {
                const response = await fetch(actionUrl, {
                    method: 'POST',
                    body: formData
                });
                
                let result;
                try {
                     result = await response.json();
                } catch (e) {
                     throw new Error("Server response was not JSON.");
                }

                if (!response.ok) {
                     throw new Error(result.message || 'Error processing the request');
                }

                // ============================================================
                // AQUÍ ESTÁ EL CAMBIO QUE PEDISTE
                // ============================================================
                if (result.success) {
                    // 1. Configuramos el Modal para ÉXITO
                    modalTitle.textContent = "Success!";
                    modalTitle.className = "modal-title text-success";
                    modalBody.textContent = result.message || "Film saved successfully.";
                    
                    // 2. Configuramos el botón para ir al DETALLE
                    if (btnRedirect) {
                        btnRedirect.style.display = 'inline-block'; // Mostrar botón
                        btnRedirect.textContent = "Go to Movie Details"; // Cambiar texto
                        btnRedirect.href = result.redirectUrl; // Poner el enlace (ej: /Ej/12345)
                        
                        // Opcional: Cambiar clase para que se vea verde/azul
                        btnRedirect.className = "btn btn-success"; 
                    }
                    
                    // 3. Mostramos el modal (SIN REDIRIGIR AUTOMÁTICAMENTE)
                    resultModal.show();
                    
                    // Opcional: Limpiar el formulario si es 'Añadir' para que no dupliquen
                    // if (!actionUrl.includes('editFilm')) { form.reset(); form.classList.remove('was-validated'); }

                } else {
                    // Caso lógico de error (ej: validación backend falló)
                    showModalError('Error', result.message);
                }
                // ============================================================

            } catch (error) {
                console.error(error);
                showModalError('Submission Error', error.message || "An unexpected error occurred.");
            } finally {
                toggleLoadingState(false);
            }
        });
    }

    // --- FUNCIONES AUXILIARES ---

    function toggleLoadingState(isLoading) {
        if(!submitBtn) return;
        if (isLoading) {
            submitBtn.disabled = true;
            if(btnText) btnText.style.display = 'none';
            if(btnSpinner) btnSpinner.style.display = 'inline-block';
            if(btnLoadingText) btnLoadingText.style.display = 'inline-block';
        } else {
            submitBtn.disabled = false;
            if(btnText) btnText.style.display = 'inline-block';
            if(btnSpinner) btnSpinner.style.display = 'none';
            if(btnLoadingText) btnLoadingText.style.display = 'none';
        }
    }

    // Función específica para mostrar errores (Botón redirect oculto)
    function showModalError(title, message) {
        if(!resultModal) { alert(title + ": " + message); return; }
        
        modalTitle.textContent = title;
        modalTitle.className = "modal-title text-danger";
        modalBody.textContent = message;
        
        // En caso de error, ocultamos el botón de ir al detalle
        if(btnRedirect) btnRedirect.style.display = 'none'; 
        
        resultModal.show();
    }
});