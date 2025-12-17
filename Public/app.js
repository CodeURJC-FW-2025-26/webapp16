document.addEventListener('DOMContentLoaded', () => {

    // 1. GLOBAL CONFIGURATION
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
        if (btnCloseModal) btnCloseModal.onclick = null;
        resultModal.show();
    }

    function toggleLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        // Generic spinner check
        const spinner = btn.querySelector('.spinner-border');
        const text = btn.querySelector('.btn-text'); 
        
        // Add form specific ID check
        const spinnerId = document.getElementById('btnSpinner');
        const textId = document.getElementById('btnText');
        const loadTextId = document.getElementById('btnLoadingText');

        // Check if we are in Add/Edit Film page (using IDs)
        if (spinnerId && btn.id === 'submitBtn') {
            spinnerId.style.display = isLoading ? 'inline-block' : 'none';
            textId.style.display = isLoading ? 'none' : 'inline-block';
            loadTextId.style.display = isLoading ? 'inline-block' : 'none';
        } else {
            // Logic for comments/delete buttons (using classes)
            if (spinner) spinner.classList.toggle('d-none', !isLoading);
        }
    }

    // 2. AJAX VALIDATIONS (ASYNC/AWAIT)
    
    // User (Comments)
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
                    } catch (e) { console.error(e); }
                }
            }, 500);
        });
    }

    // Title (Movie)
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
                // Uppercase check
                if (title.length > 0 && title[0] !== title[0].toUpperCase()) {
                    titleInput.classList.add('is-invalid');
                    titleInput.setCustomValidity("Uppercase required");
                    return;
                }
                // Ajax check
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
                    } catch (e) { console.error(e); }
                }
            }, 500);
        });
    }

    // Director (Auto Uppercase)
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
                } catch (e) { console.error(e); }
            }
        });
    }

    // Genres (Checkbox)
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


    // 3. IMAGE PREVIEW LOGIC
    function setupImageHandler(field, required) {
        const input = document.getElementById(field);
        const newPreview = document.getElementById(`${field}NewPreview`);
        const existingPreview = document.getElementById(`${field}ExistingPreview`);
        const deleteBtn = document.getElementById(`delete${field.charAt(0).toUpperCase() + field.slice(1)}Btn`);
        const deleteInput = document.getElementById(`delete_${field}_input`);

        // --- Previsualitation logic (Listener 'change' for input) ---
        if (input) {
            input.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    // There is a new file
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
                            deleteInput.value = 'false'; // Undelete
                        }
                    };
                    reader.readAsDataURL(this.files[0]);
                    input.setCustomValidity("");
                } else {
                    // Empty input (e.g., when canceling selection after drag and drop)
                    // If the input is empty and there is no existing image, validation is applied.
                    if (required && (!existingPreview || existingPreview.style.display === 'none')) {
                        input.setCustomValidity("required");
                    }
                }
            });
        }

        //  Deletion Logic (Listener 'click' for button 'X') 
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                // 1. Clear the input file
                if (input) {
                    input.value = ''; // Clean the selected file
                }

                // 2. Hide previews
                if (newPreview) {
                    newPreview.style.display = 'none';
                    newPreview.src = '#';
                }

                // 3. Manage the existing image(mark for deletion on the server)
                if (existingPreview) {
                    const hasExistingImage = existingPreview.src && existingPreview.src !== window.location.href && existingPreview.style.display !== 'none';
                    if (hasExistingImage) {
                        if (deleteInput) {
                            deleteInput.value = 'true'; // Mark for deletion
                        }
                        existingPreview.style.display = 'none'; // Hide
                    }
                }

                // 4. Hide the delete button
                this.style.display = 'none';

                // 5. Force validation if required and is now empty
                if (required) {
                    input.setCustomValidity("required");
                }
            });
        }
    }

    // Initialize the image handler for each field
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
        // We check if the field has the 'required' attribute in the HTML
        const isRequiredInHtml = document.getElementById(f.name)?.hasAttribute('required');
        setupImageHandler(f.name, isRequiredInHtml);
    });

    // --- Drag and Drop logic---
    function setupDragAndDrop(containerId, inputId) {
        const container = document.getElementById(containerId);
        const fileInput = document.getElementById(inputId);

        if (!container || !fileInput) return;

        // 1. Prevent default behavior
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // 2. Highlight the area (optional)
        container.addEventListener('dragenter', highlight, false);
        container.addEventListener('dragover', highlight, false);
        container.addEventListener('dragleave', unhighlight, false);
        container.addEventListener('drop', unhighlight, false);

        function highlight() {
            container.classList.add('highlight-dropzone'); // Class that you will define in CSS
        }

        function unhighlight() {
            container.classList.remove('highlight-dropzone');
        }

        // 3. Managing the 'drop'
        container.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0 && files[0].type.startsWith('image/')) {
                // Assign the dragged file to the input file
                fileInput.files = files;

                // Trigger the 'change' event to activate the setupImageHandler
                fileInput.dispatchEvent(new Event('change'));
            }
        }
    }

    // Configure Drag and Drop for each preview container
    setupDragAndDrop('coverPreviewContainer', 'cover');
    setupDragAndDrop('titlePhotoPreviewContainer', 'titlePhoto');
    setupDragAndDrop('filmPhotoPreviewContainer', 'filmPhoto');
    setupDragAndDrop('fotoDirectorPreviewContainer', 'fotoDirector');
    setupDragAndDrop('fotoActor1PreviewContainer', 'fotoActor1');
    setupDragAndDrop('fotoActor2PreviewContainer', 'fotoActor2');
    setupDragAndDrop('fotoActor3PreviewContainer', 'fotoActor3');


    // 4. MAIN FORMS (ADD FILM / ADD COMMENT) - ASYNC/AWAIT
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

            // NO setTimeout here. The delay is now in the backend.
            try {
                const formData = new FormData(form);
                let fetchOptions = { method: 'POST' };

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
                        window.location.href = result.redirectUrl;
                    } else {  
                        form.reset();
                        form.classList.remove('was-validated');
                        window.location.reload();
                    }
                } else {
                    showModal('Error', result.message, 'danger');
                }
            } catch (error) {
                showModal('Error', "Connection failed", 'danger');
            } finally {
                toggleLoading(submitBtn, false);
            }
        });
    });


    // 5. REVIEWS DELEGATION (EDIT/DELETE) - ASYNC/AWAIT
    const reviewsContainer = document.getElementById('reviewsContainer');

    if (reviewsContainer) {
        reviewsContainer.addEventListener('click', async function (e) {
            
            // --- EDIT CLICK ---
            const editBtn = e.target.closest('.btn-edit-inline') || e.target.closest('.btn-edit-comment');
            if (editBtn) {
                const container = editBtn.closest('.review');
                if (container.classList.contains('editing-mode')) return;

                const currentText = container.dataset.description || editBtn.dataset.text; 
                const currentRating = container.dataset.rating || editBtn.dataset.rating; 

                const formHtml = `  
                    <form class="inline-edit-form p-3 border rounded bg-white shadow-sm" novalidate>
                        <h6 class="mb-3">Editing Review</h6>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Comment:</label>
                            <textarea class="form-control" name="reviewText" rows="3" required>${currentText}</textarea>
                            <div class="invalid-feedback">Review text is required.</div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Rating (1-5):</label>
                            <input type="number" class="form-control form-control-sm" name="reviewRating" value="${currentRating}" min="1" max="5" required>
                            <div class="invalid-feedback">Please enter a rating between 1 and 5.</div>
                        </div>
                        <div class="d-flex gap-2 justify-content-end">
                            <button type="button" class="btn btn-sm btn-secondary btn-cancel-edit">Cancel</button>
                            <button type="submit" class="btn btn-sm btn-success">Save Changes</button>
                        </div>
                    </form>
                `;
                container.dataset.originalHtml = container.innerHTML;
                container.innerHTML = formHtml;
                container.classList.add('editing-mode');
            }

            // --- CANCEL CLICK ---
            if (e.target.closest('.btn-cancel-edit')) {
                const container = e.target.closest('.review');
                container.innerHTML = container.dataset.originalHtml;
                container.classList.remove('editing-mode');
            }

            // --- DELETE COMMENT CLICK (Async/Await) ---
            const deleteBtn = e.target.closest('.btn-delete-comment');
            if (deleteBtn) {
                if (!confirm("Are you sure you want to delete this comment?")) return;

                const cId = deleteBtn.dataset.commentId;
                const mId = deleteBtn.dataset.movieId;

                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                deleteBtn.disabled = true;

                try {
                    const res = await fetch(`/deleteComment/${mId}/${cId}`, { method: 'POST' });
                    const data = await res.json();
                    
                    if (data.success) {
                        const row = document.getElementById(`review-${cId}`);
                        if (row) row.remove();
                    } else {
                        alert(data.message);
                        deleteBtn.innerHTML = '<i class="bi bi-trash-fill"></i> Delete';
                        deleteBtn.disabled = false;
                    }
                } catch (err) {
                    alert("Error deleting");
                    deleteBtn.innerHTML = '<i class="bi bi-trash-fill"></i> Delete';
                    deleteBtn.disabled = false;
                }
            }
        });

        // --- SUBMIT INLINE FORM (Async/Await) ---
        reviewsContainer.addEventListener('submit', async function (e) {
            if (e.target.classList.contains('inline-edit-form')) {
                e.preventDefault();
                e.stopPropagation();

                const form = e.target;
                const container = form.closest('.review');

                if (!form.checkValidity()) {
                    form.classList.add('was-validated');
                    return;
                }

                const formData = new FormData(form);
                const newText = formData.get('reviewText');
                const newRating = formData.get('reviewRating');
                const cId = container.dataset.commentId;
                const mId = container.dataset.movieId;
                const userName = container.dataset.userName;

                const inputs = form.querySelectorAll('input, textarea, button');
                inputs.forEach(el => el.disabled = true);
                
                // Show Spinner on save button
                const saveBtn = form.querySelector('button.btn-success');
                const originalBtnText = saveBtn.innerHTML;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

                try {
                    const res = await fetch(`/updateComment/${mId}/${cId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reviewText: newText, reviewRating: newRating })
                    });
                    const result = await res.json();

                    if (result.success) {
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
                                    <button class="btn btn-sm btn-outline-primary btn-edit-inline" 
                                            data-text="${newText}" data-rating="${newRating}">
                                        <i class="bi bi-pencil-fill"></i> Edit
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger btn-delete-comment" 
                                            data-comment-id="${cId}" data-movie-id="${mId}">
                                        <i class="bi bi-trash-fill"></i> Delete
                                    </button>
                                </div>
                            </div>
                        `;
                        container.innerHTML = newHtml;
                        container.classList.remove('editing-mode');
                    } else {
                        alert("Error: " + result.message);
                        inputs.forEach(el => el.disabled = false);
                        saveBtn.innerHTML = originalBtnText;
                    }
                } catch (err) {
                    alert("Server Error");
                    inputs.forEach(el => el.disabled = false);
                    saveBtn.innerHTML = originalBtnText;
                }
            }
        });
    }

    // 6. DELETE FILM (AJAX with Spinner)
    // We target the delete form in Ej.html (which usually has action /deleteFilm)
    const deleteFilmForm = document.querySelector('form[action="/deleteFilm"]');
    if(deleteFilmForm) {
        deleteFilmForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if(!confirm("Are you sure you want to delete this film?")) return;

            const btn = this.querySelector('button');
            const originalText = btn.innerHTML;
            
            // Show Spinner manually since toggleLoading is for the main form
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';

            try {
                const formData = new FormData(this);
                // Convert FormData to JSON or URLSearchParams for generic body
                const body = new URLSearchParams(formData);

                const response = await fetch(this.getAttribute('action'), {
                    method: 'POST',
                    body: body
                });
                
                // If the router redirects, fetch might follow it automatically or return the redirect URL
                // In your router, you return JSON now: {success: true, redirectUrl: '/indice'}
                const result = await response.json();

                if(result.success) {
                    window.location.href = result.redirectUrl;
                } else {
                    alert("Error deleting film");
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            } catch(e) {
                console.error(e);
                alert("Connection failed");
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // 7. REAL TIME SEARCH (INPUT + DEBOUNCE)
    const searchInput = document.querySelector('input[name="search"]');
    const searchBtn = document.querySelector('.btn-search');
    let searchDebounce;

    if (searchInput) {
        // "As you type" search with debounce
        searchInput.addEventListener('input', function (e) {
            clearTimeout(searchDebounce);
            // Wait 500ms after user stops typing
            searchDebounce = setTimeout(() => {
                performSearch();
            }, 500); 
        });

        // Also keep Enter key
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchDebounce);
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