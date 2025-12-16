document.addEventListener('DOMContentLoaded', () => {

    // 1. Global Configuration
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
        // Clear previous events from the close button
        if (btnCloseModal) btnCloseModal.onclick = null;
        resultModal.show();
    }

    function toggleLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        const spinner = btn.querySelector('.spinner-border'); // Class search
        const text = btn.querySelector('.btn-text'); // Class search
        // Search for ID
        const spinnerId = document.getElementById('btnSpinner');
        const textId = document.getElementById('btnText');
        const loadTextId = document.getElementById('btnLoadingText');

        if (spinnerId) {
            // Logic for add.html
            spinnerId.style.display = isLoading ? 'inline-block' : 'none';
            textId.style.display = isLoading ? 'none' : 'inline-block';
            loadTextId.style.display = isLoading ? 'inline-block' : 'none';
        } else {
            // Logic for Ej.html
            if (spinner) spinner.classList.toggle('d-none', !isLoading);
        }
    }

    
    // 2. Ajax Validations (User, Title, Director, Genres)
    

    // User(Comments)
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

    // Title(Movie)
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
                // Validate Uppercase
                if (title.length > 0 && title[0] !== title[0].toUpperCase()) {
                    titleInput.classList.add('is-invalid');
                    titleInput.setCustomValidity("Uppercase required");
                    return;
                }
                // Validate Ajax
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

    // C) Director(Mayus auto-correct)
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

    // D) Genres (Checkbox)
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


   
    // 3. Preview, Delete, and drag and drop of images
    

    function setupImageHandler(field, required) {
        const input = document.getElementById(field);
        const newPreview = document.getElementById(`${field}NewPreview`);
        const existingPreview = document.getElementById(`${field}ExistingPreview`);
        const deleteBtn = document.getElementById(`delete${field.charAt(0).toUpperCase() + field.slice(1)}Btn`);
        const deleteInput = document.getElementById(`delete_${field}_input`);

        // Preview Logic (Listener change for input)
        if (input) {
            input.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    // New file
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
                            deleteInput.value = 'false'; // cancel delete
                        }
                    };
                    reader.readAsDataURL(this.files[0]);
                    input.setCustomValidity("");
                } else {
                    // Empty input  
                    // IF the input is empty and there is no existant image, apply the validation
                    if (required && (!existingPreview || existingPreview.style.display === 'none')) {
                        input.setCustomValidity("required");
                    }
                }
            });
        }

        // Delete logic (Listener 'click' for button 'X') 
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                // Clean the input file
                if (input) {
                    input.value = ''; // Clean the selected archive
                }

                // None the previews views
                if (newPreview) {
                    newPreview.style.display = 'none';
                    newPreview.src = '#';
                }

                // 3. Manage the existant image
                if (existingPreview) {
                    const hasExistingImage = existingPreview.src && existingPreview.src !== window.location.href && existingPreview.style.display !== 'none';
                    if (hasExistingImage) {
                        if (deleteInput) {
                            deleteInput.value = 'true'; // Mark for delete
                        }
                        existingPreview.style.display = 'none'; // None
                    }
                }

                // None button delete
                this.style.display = 'none';

                //  Validation
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
        //We check if the field has the 'required' attribute in the HTML
        const isRequiredInHtml = document.getElementById(f.name)?.hasAttribute('required');
        setupImageHandler(f.name, isRequiredInHtml);
    });

    // Drag and Drop logic(for images)
    function setupDragAndDrop(containerId, inputId) {
        const container = document.getElementById(containerId);
        const fileInput = document.getElementById(inputId);

        if (!container || !fileInput) return;

        // Prevent default behavior
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        container.addEventListener('dragenter', highlight, false);
        container.addEventListener('dragover', highlight, false);
        container.addEventListener('dragleave', unhighlight, false);
        container.addEventListener('drop', unhighlight, false);

        function highlight() {
            container.classList.add('highlight-dropzone'); 
        }

        function unhighlight() {
            container.classList.remove('highlight-dropzone');
        }

        // Drop manage
        container.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0 && files[0].type.startsWith('image/')) {
                // Assign the dragged file to the file input
                fileInput.files = files;

                // Trigger the 'change' event to activate the setupImageHandler
                fileInput.dispatchEvent(new Event('change'));
            }
        }
    }

    // Set up Drag and Drop for each preview container
    setupDragAndDrop('coverPreviewContainer', 'cover');
    setupDragAndDrop('titlePhotoPreviewContainer', 'titlePhoto');
    setupDragAndDrop('filmPhotoPreviewContainer', 'filmPhoto');
    setupDragAndDrop('fotoDirectorPreviewContainer', 'fotoDirector');
    setupDragAndDrop('fotoActor1PreviewContainer', 'fotoActor1');
    setupDragAndDrop('fotoActor2PreviewContainer', 'fotoActor2');
    setupDragAndDrop('fotoActor3PreviewContainer', 'fotoActor3');


    
    // Add film, add comment
    
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

                    // Add Comment use JSON, Film use Multipart
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
                            //Comment added correctly
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
            }, delay);
        });
    });

    


   // Reviews Buttons (Edit and delete)
const reviewsContainer = document.getElementById('reviewsContainer');

if (reviewsContainer) {
    reviewsContainer.addEventListener('click', function (e) {

        // If click in edit, the form is generated
        // We check if the click was inside a button with the class .btn-edit-inline or .btn-edit-comment
        const editBtn = e.target.closest('.btn-edit-inline') || e.target.closest('.btn-edit-comment');

        if (editBtn) {
            const container = editBtn.closest('.review');
            if (container.classList.contains('editing-mode')) return;

            // Read data data-attributes
            const currentText = container.dataset.description || editBtn.dataset.text; // Fallback
            const currentRating = container.dataset.rating || editBtn.dataset.rating; // Fallback

            // Online Html form
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

            // Save origin state
            container.dataset.originalHtml = container.innerHTML;
            container.innerHTML = formHtml;
            container.classList.add('editing-mode');
        }

        // Click on cancel edit
        if (e.target.closest('.btn-cancel-edit')) {
            const container = e.target.closest('.review');
            container.innerHTML = container.dataset.originalHtml;
            container.classList.remove('editing-mode');
        }

        // Click on save changes (submit the form)
        if (e.target.closest('.inline-edit-form') && e.target.closest('.btn-success')) {
            e.preventDefault();  // Prevent the default form submission

            const form = e.target.closest('form');
            const container = form.closest('.review');

            // Get the form data
            const reviewText = form.querySelector('textarea[name="reviewText"]').value;
            const reviewRating = form.querySelector('input[name="reviewRating"]').value;

            // Show spinner on the "Save Changes" button
            const saveBtn = form.querySelector('button[type="submit"]');
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            saveBtn.disabled = true;

            // Simulate saving process
            setTimeout(() => {
                // Normally here you'd send the data to the server
                // Replace this with your actual saving logic, e.g., a fetch or Ajax request

                // Assuming the save was successful, we update the review
                container.innerHTML = container.dataset.originalHtml;
                container.classList.remove('editing-mode');

                // Replace spinner with the button text again
                saveBtn.innerHTML = 'Save Changes';
                saveBtn.disabled = false;
            }, 1500); // Simulate delay (adjust as needed)
        }

        // Click on delete
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
                            // Delete DOM
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





        // Submit online form
        reviewsContainer.addEventListener('submit', async function (e) {
            if (e.target.classList.contains('inline-edit-form')) {
                e.preventDefault();
                e.stopPropagation();

                const form = e.target;
                const container = form.closest('.review');

                // Basic validation
                if (!form.checkValidity()) {
                    form.classList.add('was-validated');
                    return;
                }

                // Get data
                const formData = new FormData(form);
                const newText = formData.get('reviewText');
                const newRating = formData.get('reviewRating');
                const cId = container.dataset.commentId;
                const mId = container.dataset.movieId;
                const userName = container.dataset.userName; 

                // Block UI
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
                        // Update comment without recharge
                        container.dataset.description = newText;
                        container.dataset.rating = newRating;

                        // Rebuilt comment block
                        
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


    
    //  Restore search engine
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