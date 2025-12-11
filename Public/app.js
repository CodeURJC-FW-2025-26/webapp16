document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filmForm');

    // --- ELEMENTOS DEL MODAL (Para errores) ---
    const resultModalElement = document.getElementById('resultModal');
    let resultModal;
    if (resultModalElement) {
        resultModal = new bootstrap.Modal(resultModalElement);
    }
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    // El botón del modal solo lo usaremos para cerrar en caso de error
    const btnRedirect = document.getElementById('btnRedirect'); 

    // --- ELEMENTOS DEL BOTÓN DE ENVÍO Y SPINNER ---
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnLoadingText = document.getElementById('btnLoadingText');

    // --- VALIDACIÓN TÍTULO (MAYÚSCULA Y DISPONIBILIDAD) ---
    const titleInput = document.getElementById('title');
    const titleErrorServer = document.getElementById('title-error-server'); // Div para errores ajax
    // Necesitas un div para el error de mayúscula, o el navegador usará el genérico
    let titleTimeout;

    if (titleInput) {
        titleInput.addEventListener('input', () => {
            const title = titleInput.value.trim();
            
            // Limpiamos estados previos
            clearTimeout(titleTimeout);
            titleInput.classList.remove('is-invalid', 'is-valid');
            titleInput.setCustomValidity(""); 

            // 1. VALIDACIÓN VISUAL INMEDIATA: MAYÚSCULA
            if (title.length > 0 && title[0] !== title[0].toUpperCase()) {
                titleInput.classList.add('is-invalid');
                // Esto fuerza a que salga el tooltip de error del navegador si intentas enviar
                titleInput.setCustomValidity("The title must start with an uppercase letter.");
                return; // No seguimos comprobando AJAX si esto ya está mal
            }

            // 2. VALIDACIÓN AJAX (Si pasa la mayúscula)
            titleTimeout = setTimeout(async () => {
                if (title.length > 0) {
                    try {
                        const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
                        const data = await response.json();

                        if (!data.available) {
                            titleInput.classList.add('is-invalid');
                            if (titleErrorServer) titleErrorServer.style.display = 'block';
                            titleInput.setCustomValidity("Title exists");
                        } else {
                            titleInput.classList.add('is-valid');
                            if (titleErrorServer) titleErrorServer.style.display = 'none';
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
        // Si no hay checkboxes de género en el form, saltamos validación
        if (document.querySelectorAll('input[name="genre"]').length === 0) return true;

        if (checkboxes.length === 0) {
            if (errorDiv) errorDiv.style.display = 'block';
            return false;
        } else {
            if (errorDiv) errorDiv.style.display = 'none';
            return true;
        }
    }

    const allGenres = document.querySelectorAll('input[name="genre"]');
    allGenres.forEach(cb => {
        cb.addEventListener('change', validateGenres);
    });

    // --- ENVÍO DEL FORMULARIO ---
    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            // Validaciones cliente antes de enviar
            const isHtmlValid = form.checkValidity(); // Chequea 'required' y setCustomValidity
            const isGenreValid = validateGenres();

            if (!isHtmlValid || !isGenreValid) {
                form.classList.add('was-validated'); // Bootstrap muestra los estilos de error
                return; // Paramos aquí si hay errores visuales
            }

            // Activamos Spinner
            toggleLoadingState(true);

            // --- AQUÍ ESTÁ EL RETRASO QUE PEDISTE (1.5 segundos) ---
            setTimeout(async () => {
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
                        // Si el servidor devuelve 400/500, lanzamos error para que caiga en el catch
                        throw new Error(result.message || 'Error processing the request');
                    }

                    // === CASO ÉXITO ===
                    if (result.success) {
                        // REDIRECCIÓN AUTOMÁTICA (Lo que pediste ahora)
                        window.location.href = result.redirectUrl; 
                    } else {
                        // Fallo lógico del servidor
                        showModalError('Error', result.message);
                    }

                } catch (error) {
                    console.error(error);
                    // === CASO ERROR ===
                    // Mostramos el mensaje en la misma pantalla (Modal)
                    showModalError('Submission Error', error.message || "An unexpected error occurred.");
                } finally {
                    // Quitamos Spinner (solo visible si hubo error, si hubo éxito ya se habrá redirigido)
                    toggleLoadingState(false);
                }
            }, 1500); // <-- Fin del setTimeout
        });
    }

    // --- FUNCIONES AUXILIARES ---

    function toggleLoadingState(isLoading) {
        if (!submitBtn) return;
        if (isLoading) {
            submitBtn.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (btnSpinner) btnSpinner.style.display = 'inline-block';
            if (btnLoadingText) btnLoadingText.style.display = 'inline-block';
        } else {
            submitBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline-block';
            if (btnSpinner) btnSpinner.style.display = 'none';
            if (btnLoadingText) btnLoadingText.style.display = 'none';
        }
    }

    function showModalError(title, message) {
        if (!resultModal) { alert(title + ": " + message); return; }

        modalTitle.textContent = title;
        modalTitle.className = "modal-title text-danger"; // Rojo para errores
        modalBody.textContent = message;

        // Ocultamos el botón de redirección porque es un error
        if (btnRedirect) btnRedirect.style.display = 'none';

        resultModal.show();
    }
});