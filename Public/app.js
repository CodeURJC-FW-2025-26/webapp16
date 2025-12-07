document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filmForm');
    
    // Elementos del Modal
    const resultModal = new bootstrap.Modal(document.getElementById('resultModal'));
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const btnRedirect = document.getElementById('btnRedirect');

    // Elementos del Botón y Spinner
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnLoadingText = document.getElementById('btnLoadingText');

    // Elementos para validación de Título
    const titleInput = document.getElementById('title');
    const titleErrorServer = document.getElementById('title-error-server');
    let titleTimeout;

    // --- 1. VALIDACIÓN AJAX: TÍTULO DUPLICADO ---
    if(titleInput) {
        titleInput.addEventListener('input', () => {
            clearTimeout(titleTimeout);
            titleInput.classList.remove('is-invalid', 'is-valid');
            titleErrorServer.style.display = 'none';
            titleInput.setCustomValidity(""); // Resetear validez

            titleTimeout = setTimeout(async () => {
                const title = titleInput.value.trim();
                // Solo validar si hay texto y NO estamos editando el mismo título (lógica simplificada)
                // Para ser precisos en edición, el backend debería recibir el ID actual para ignorarlo.
                if (title.length > 0) {
                    try {
                        const response = await fetch(`/checkTitle?title=${encodeURIComponent(title)}`);
                        const data = await response.json();
                        
                        if (!data.available) {
                            titleInput.classList.add('is-invalid');
                            titleErrorServer.style.display = 'block';
                            titleInput.setCustomValidity("Title exists"); // Invalida el form HTML5
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

    // --- 2. VALIDACIÓN JS CLIENTE: GÉNEROS (Checkboxes) ---
    // HTML5 no valida bien "al menos uno de un grupo", así que lo hacemos con JS.
    function validateGenres() {
        const checkboxes = document.querySelectorAll('input[name="genre"]:checked');
        const errorDiv = document.getElementById('genre-error');
        const genreGroup = document.getElementById('genreGroup');

        if (checkboxes.length === 0) {
            errorDiv.style.display = 'block';
            // Opcional: poner borde rojo al grupo
            // genreGroup.style.border = "1px solid #dc3545"; 
            return false;
        } else {
            errorDiv.style.display = 'none';
            // genreGroup.style.border = "none";
            return true;
        }
    }
    
    // Escuchar cambios en los checkbox para quitar el error en tiempo real
    const allGenres = document.querySelectorAll('input[name="genre"]');
    allGenres.forEach(cb => {
        cb.addEventListener('change', validateGenres);
    });


    // --- 3. ENVÍO DEL FORMULARIO ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // A) Validaciones Sincrónicas (HTML5 + Custom JS)
        const isHtmlValid = form.checkValidity();
        const isGenreValid = validateGenres(); // Nuestra validación JS personalizada

        if (!isHtmlValid || !isGenreValid) {
            form.classList.add('was-validated'); // Bootstrap muestra los errores rojos
            return; // Detenemos si hay errores visuales
        }

        // B) Preparar UI para Carga (Spinner)
        toggleLoadingState(true);

        const formData = new FormData(form);
        const actionUrl = form.getAttribute('action'); // Leemos la URL del action del HTML

        try {
            // C) Petición AJAX
            const response = await fetch(actionUrl, {
                method: 'POST',
                body: formData
            });
            
            // Si el servidor devuelve error HTTP (ej: 500 o 400), lanzamos error
            if (!response.ok) {
                 // Intentamos leer el mensaje JSON si existe
                 const errorData = await response.json().catch(() => ({}));
                 throw new Error(errorData.message || 'Error processing the request');
            }

            const result = await response.json();

            // D) Manejo de Respuesta Exitosa
            if (result.success) {
                // Redirigir a la página de detalle (Requisito cumplido)
                window.location.href = result.redirectUrl; 
            } else {
                // Si el JSON dice success: false (ej: validación lógica backend falló)
                showModal('Error', result.message, 'text-danger');
            }

        } catch (error) {
            // E) Manejo de Errores de Servidor / Red
            console.error(error);
            showModal('Submission Error', error.message || "An unexpected error occurred.", 'text-danger');
        } finally {
            // F) Quitar Spinner independientemente del resultado (si no hubo redirección)
            toggleLoadingState(false);
        }
    });

    // Helper: Mostrar/Ocultar Spinner
    function toggleLoadingState(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            btnText.style.display = 'none';
            btnSpinner.style.display = 'inline-block';
            btnLoadingText.style.display = 'inline-block';
        } else {
            submitBtn.disabled = false;
            btnText.style.display = 'inline-block';
            btnSpinner.style.display = 'none';
            btnLoadingText.style.display = 'none';
        }
    }

    // Helper: Mostrar Modal
    function showModal(title, message, titleClass) {
        modalTitle.textContent = title;
        modalTitle.className = "modal-title " + titleClass;
        modalBody.textContent = message;
        btnRedirect.style.display = 'none'; // En error, ocultamos el botón de ir al índice
        resultModal.show();
    }
});