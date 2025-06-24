document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('admin-content');
    const navLinks = document.querySelectorAll('.sidebar-link');
    const API_URL = 'https://skyeupload-server.fly.dev/api';
    let statusInterval;

    // --- RENDER FUNCTIONS ---

    const renderUpload = () => {
        content.innerHTML = `
            <h2 class="text-3xl font-bold text-white mb-6">Upload Content</h2>
            <div class="bg-gray-800 p-8 rounded-lg shadow-lg">
                <form id="upload-form" class="space-y-6">
                    <div id="single-upload-fields">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label for="content-title" class="block text-sm font-medium text-gray-300 mb-2">Title</label>
                                <input type="text" id="content-title" name="title" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3" placeholder="e.g., My Home Movie">
                            </div>
                            <div>
                                <label for="media-type" class="block text-sm font-medium text-gray-300 mb-2">Media Type</label>
                                <select id="media-type" name="type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3">
                                    <option value="movie">Movie</option>
                                    <option value="tvShow">TV Show</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label for="upload-type" class="block text-sm font-medium text-gray-300 mb-2">Source Type</label>
                        <select id="upload-type" name="source_type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3">
                            <option value="file" selected>Upload File</option>
                            <option value="magnet">Magnet Link</option>
                            <option value="batch-link">Batch Direct Links</option>
                        </select>
                    </div>
                    <div id="upload-input-area" class="pt-2"></div>
                    <div id="upload-status" class="pt-2"></div>
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-bold py-3 px-6 rounded-md">Add to Library</button>
                    </div>
                </form>
            </div>
        `;
        updateUploadInput('file');
    };

    const renderRequests = async () => {
        content.innerHTML = `<div class="text-center text-lg">Loading...</div>`;
        try {
            const response = await fetch(`${API_URL}/admin/requests`);
            const requests = await response.json();
            const requestsHtml = requests.map(req => `
                <tr class="border-b border-gray-700" data-request-id="${req.id}">
                    <td class="p-4">${req.title}</td>
                    <td class="p-4 text-gray-400">${new Date(req.timestamp).toLocaleString()}</td>
                    <td class="p-4"><span class="px-2 py-1 text-xs font-semibold rounded-full ${req.status === 'pending' ? 'bg-yellow-500 text-yellow-900' : 'bg-green-500 text-green-900'}">${req.status}</span></td>
                    <td class="p-4 text-right">
                        <button class="fulfill-btn text-indigo-400 hover:text-indigo-300 mr-4">Toggle Status</button>
                        <button class="delete-btn text-red-400 hover:text-red-300">Delete</button>
                    </td>
                </tr>`).join('');
            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Manage Requests</h2>
                <div class="bg-gray-800 rounded-lg shadow-lg overflow-hidden"><table class="w-full text-left">
                    <thead class="bg-gray-700 text-xs uppercase font-semibold"><tr><th>Title</th><th>Date</th><th>Status</th><th></th></tr></thead>
                    <tbody>${requests.length > 0 ? requestsHtml : '<tr><td colspan="4" class="text-center p-8 text-gray-400">No pending requests.</td></tr>'}</tbody>
                </table></div>`;
        } catch (error) { content.innerHTML = `<div class="bg-red-900 p-4 rounded-lg">${error.message}</div>`; }
    };

    const renderStatus = async () => {
        try {
            const response = await fetch(`${API_URL}/admin/status`);
            if (!response.ok) throw new Error('Server not responding');
            const status = await response.json();

            if(window.location.hash !== '#status') return;

            const torrentsHtml = status.torrents.map(t => `
                <div class="bg-gray-700 p-4 rounded-md">
                    <p class="font-semibold truncate">${t.name || t.infoHash}</p>
                    <div class="w-full bg-gray-600 rounded-full h-2.5 mt-2"><div class="bg-indigo-500 h-2.5 rounded-full" style="width: ${t.progress}%"></div></div>
                    <div class="text-xs text-gray-400 mt-1 flex justify-between"><span>${t.progress}%</span><span>${t.downloadSpeed}</span><span>Peers: ${t.peers}</span></div>
                </div>`).join('');

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Server Status</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div class="bg-gray-800 p-6 rounded-lg"><h3 class="text-gray-400">Status</h3><p class="text-2xl font-semibold text-green-400">Online</p></div>
                    <div class="bg-gray-800 p-6 rounded-lg"><h3 class="text-gray-400">Files Hosted</h3><p class="text-2xl font-semibold">${status.movies_hosted} <span class="text-lg">Movies</span></p><p class="text-2xl font-semibold">${status.shows_hosted} <span class="text-lg">Shows</span></p></div>
                    <div class="bg-gray-800 p-6 rounded-lg"><h3 class="text-gray-400">Content Requests</h3><p class="text-2xl font-semibold">${status.requests_pending}</p></div>
                    <div class="bg-gray-800 p-6 rounded-lg"><h3 class="text-gray-400">DL Speed</h3><p class="text-2xl font-semibold">${status.total_download_speed}</p></div>
                </div>
                <h3 class="text-2xl font-bold text-white mb-4">Active Torrents (${status.torrents_active})</h3>
                <div class="space-y-4">${torrentsHtml || '<p class="text-gray-400">No active torrents.</p>'}</div>`;
        } catch (error) {
            console.error("Status fetch error:", error);
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg"><p class="font-bold">Server Offline</p><p>Could not connect to the server.</p></div>`;
        }
    };
    
    const updateUploadInput = (type) => {
        const container = document.getElementById('upload-input-area');
        const singleFields = document.getElementById('single-upload-fields');
        if (!container || !singleFields) return;
        
        let inputHtml = '';
        if (type === 'file') {
            singleFields.style.display = 'block';
            inputHtml = `<label for="file-upload" class="block text-sm font-medium text-gray-300 mb-2">Media File</label><input type="file" id="file-upload" name="mediafile" class="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0" required>`;
        } else if (type === 'magnet') {
            singleFields.style.display = 'block';
            inputHtml = `<label for="link-upload" class="block text-sm font-medium text-gray-300 mb-2">Magnet Link</label><input type="text" id="link-upload" name="url" class="w-full bg-gray-700 p-3" placeholder="magnet:?xt=urn:btih:..." required>`;
        } else if (type === 'batch-link') {
            singleFields.style.display = 'none';
            inputHtml = `<label for="batch-links" class="block text-sm font-medium text-gray-300 mb-2">Direct Download Links (one per line)</label><textarea id="batch-links" name="batch_links" class="w-full bg-gray-700 p-3 h-48" placeholder="https://.../movie1.mp4\nhttps://.../movie2.mp4" required></textarea>`;
        }
        container.innerHTML = inputHtml;
    };

    const router = () => {
        clearInterval(statusInterval);
        const hash = window.location.hash || '#upload';
        const renderFunc = routes[hash] || renderUpload;
        
        content.innerHTML = `<h2 class="text-3xl font-bold text-white mb-6">Loading...</h2>`;
        renderFunc();

        if (hash === '#status') {
            statusInterval = setInterval(renderStatus, 2000);
        }
        updateActiveLink(hash);
    };

    const updateActiveLink = (hash) => {
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === hash);
        });
    };

    const routes = { '#upload': renderUpload, '#requests': renderRequests, '#status': renderStatus };

    // --- EVENT LISTENERS ---
    window.addEventListener('hashchange', router);
    
    document.body.addEventListener('change', e => {
        if (e.target.id === 'upload-type') updateUploadInput(e.target.value);
    });

    document.body.addEventListener('submit', async e => {
        if (e.target.id === 'upload-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            const statusDiv = document.getElementById('upload-status');
            
            button.disabled = true;
            button.textContent = 'Processing...';
            statusDiv.innerHTML = `<p class="text-blue-400">Sending request to server...</p>`;

            const formData = new FormData(form);
            
            try {
                const response = await fetch(`${API_URL}/admin/upload`, {
                    method: 'POST',
                    body: formData,
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Upload failed');
                statusDiv.innerHTML = `<p class="text-green-400">${result.message}</p>`;
                form.reset();
                updateUploadInput('file');
            } catch (error) {
                statusDiv.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
            } finally {
                button.disabled = false;
                button.textContent = 'Add to Library';
            }
        }
    });

    content.addEventListener('click', async (e) => {
        const button = e.target;
        const row = button.closest('tr');
        if (!row) return;
        const id = row.dataset.requestId;

        if (button.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this request?')) {
                await fetch(`${API_URL}/admin/requests/${id}`, { method: 'DELETE' });
                row.remove();
            }
        } else if (button.classList.contains('fulfill-btn')) {
            await fetch(`${API_URL}/admin/requests/${id}`, { method: 'PUT' });
            renderRequests();
        }
    });
    
    router();
});
