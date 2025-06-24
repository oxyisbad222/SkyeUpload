document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('admin-content');
    const navLinks = document.querySelectorAll('.sidebar-link');
    
    const API_URL = 'https://skyeupload.fly.dev/';

    // --- RENDER FUNCTIONS ---

    const renderUpload = () => {
        content.innerHTML = `
            <h2 class="text-3xl font-bold text-white mb-6">Upload Content</h2>
            <div class="bg-gray-800 p-8 rounded-lg shadow-lg">
                <form id="upload-form" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                            <label for="content-title" class="block text-sm font-medium text-gray-300 mb-2">Title</label>
                            <input type="text" id="content-title" name="title" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., My Home Movie" required>
                        </div>
                        <div>
                            <label for="media-type" class="block text-sm font-medium text-gray-300 mb-2">Media Type</label>
                            <select id="media-type" name="type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="movie">Movie</option>
                                <option value="tvShow">TV Show</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label for="upload-type" class="block text-sm font-medium text-gray-300 mb-2">Source Type</label>
                        <select id="upload-type" name="source_type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500">
                            <option value="file" selected>Upload File</option>
                            <option value="magnet">Magnet Link</option>
                        </select>
                    </div>

                    <div id="upload-input-area" class="pt-2">
                        <!-- Input will be injected here -->
                    </div>

                    <div id="upload-status" class="pt-2"></div>

                    <div class="flex justify-end pt-4">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-md transition-colors">Add to Library</button>
                    </div>
                </form>
            </div>
        `;
        updateUploadInput('file'); 
    };

    const renderRequests = async () => {
        content.innerHTML = `<div class="text-center text-lg">Loading requests...</div>`;
        try {
            const response = await fetch(`${API_URL}/admin/requests`);
            if (!response.ok) throw new Error('Failed to fetch requests');
            const requests = await response.json();

            let requestsHtml = requests.map(req => `
                <tr class="border-b border-gray-700">
                    <td class="p-4">${req.title}</td>
                    <td class="p-4 text-gray-400">${req.details || 'N/A'}</td>
                    <td class="p-4 text-gray-400">${new Date(req.timestamp).toLocaleString()}</td>
                    <td class="p-4"><span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-yellow-900">${req.status}</span></td>
                    <td class="p-4 text-right"><button class="text-green-400 hover:text-green-300 mr-2">Fulfill</button><button class="text-red-400 hover:text-red-300">Delete</button></td>
                </tr>`).join('');

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Manage Requests</h2>
                <div class="bg-gray-800 rounded-lg shadow-lg overflow-hidden"><table class="w-full text-left">
                    <thead class="bg-gray-700 text-xs uppercase font-semibold"><tr><th class="p-4">Title</th><th class="p-4">Details</th><th class="p-4">Date</th><th class="p-4">Status</th><th class="p-4"></th></tr></thead>
                    <tbody>${requests.length > 0 ? requestsHtml : '<tr><td colspan="5" class="text-center p-8 text-gray-400">No pending requests.</td></tr>'}</tbody>
                </table></div>`;
        } catch (error) {
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg">${error.message}</div>`;
        }
    };

    const renderStatus = async () => {
        content.innerHTML = `<div class="text-center text-lg">Loading server status...</div>`;
        try {
            const response = await fetch(`${API_URL}/admin/status`);
            if (!response.ok) throw new Error('Failed to fetch server status');
            const status = await response.json();

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Manage Requests</h2>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg"><h3 class="text-gray-400 text-sm font-medium">Status</h3><p class="text-2xl font-semibold text-green-400 capitalize">${status.status}</p></div>
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg"><h3 class="text-gray-400 text-sm font-medium">Uptime</h3><p class="text-2xl font-semibold">${status.uptime}</p></div>
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg"><h3 class="text-gray-400 text-sm font-medium">Pending Requests</h3><p class="text-2xl font-semibold">${status.requests_pending}</p></div>
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg"><h3 class="text-gray-400 text-sm font-medium">Active Torrents</h3><p class="text-2xl font-semibold">${status.torrents_active}</p></div>
                </div>`;
        } catch (error) {
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg">${error.message}</div>`;
        }
    };
    
    const updateUploadInput = (type) => {
        const container = document.getElementById('upload-input-area');
        if (!container) return;
        let inputHtml = '';
        if (type === 'file') {
            inputHtml = `<label for="file-upload" class="block text-sm font-medium text-gray-300 mb-2">Media File</label><input type="file" id="file-upload" name="mediafile" class="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 cursor-pointer" required>`;
        } else {
            const placeholder = type === 'magnet' ? 'magnet:?xt=urn:btih:...' : 'https://.../video.mp4';
            inputHtml = `<label for="link-upload" class="block text-sm font-medium text-gray-300 mb-2">Magnet Link</label><input type="text" id="link-upload" name="url" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3" placeholder="${placeholder}" required>`;
        }
        container.innerHTML = inputHtml;
    };
    
    const router = () => {
        const hash = window.location.hash || '#upload';
        const renderFunc = routes[hash] || renderUpload;
        renderFunc();
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
            statusDiv.innerHTML = `<p class="text-blue-400">Processing request...</p>`;

            const formData = new FormData(form);
            // Manually append source_type to ensure it's sent correctly
            formData.set('source_type', document.getElementById('upload-type').value);

            try {
                const response = await fetch(`${API_URL}/admin/upload`, {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Request failed');
                }
                
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
    
    router();
});
