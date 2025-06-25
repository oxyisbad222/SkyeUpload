document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('admin-content');
    const navLinks = document.querySelectorAll('.sidebar-link');
    const API_URL = 'https://skyeupload.fly.dev/api';
    let statusInterval;

    const renderUpload = () => {
        content.innerHTML = `
            <h2 class="text-3xl font-bold text-white mb-6">Upload Content</h2>
            <div id="upload-container" class="bg-gray-800 p-6 md:p-8 rounded-lg shadow-lg">
                <form id="upload-form" class="space-y-6">
                    <div id="upload-main-fields">
                        <div id="single-upload-fields">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label for="content-title" class="block text-sm font-medium text-gray-300 mb-2">Title</label>
                                    <input type="text" id="content-title" name="title" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., My Home Movie">
                                </div>
                                <div>
                                    <label for="media-type" class="block text-sm font-medium text-gray-300 mb-2">Media Type</label>
                                    <select id="media-type" name="type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500">
                                        <option value="movie">Movie</option>
                                        <option value="tvShow">TV Show</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label for="upload-type" class="block text-sm font-medium text-gray-300 mb-2 mt-6">Source Type</label>
                            <select id="upload-type" name="source_type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="file" selected>Upload File</option>
                                <option value="magnet">Magnet Link</option>
                                <option value="batch-link">Batch Direct Links</option>
                            </select>
                        </div>
                        <div id="upload-input-area" class="pt-4"></div>
                    </div>
                    <div id="torrent-selection-area"></div>
                    <div id="upload-status" class="pt-2"></div>
                    <div id="form-actions" class="flex justify-end pt-4"></div>
                </form>
            </div>
        `;
        updateUploadInput('file');
        lucide.createIcons();
    };

    const updateUploadInput = (type) => {
        const container = document.getElementById('upload-input-area');
        const singleFields = document.getElementById('single-upload-fields');
        const formActions = document.getElementById('form-actions');
        if (!container || !singleFields || !formActions) return;

        let inputHtml = '';
        let actionsHtml = `<button type="submit" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-bold py-3 px-6 rounded-md flex items-center gap-2"><i data-lucide="library"></i>Add to Library</button>`;
        
        singleFields.style.display = 'block';
        document.getElementById('torrent-selection-area').innerHTML = '';

        if (type === 'file') {
            inputHtml = `<label for="file-upload" class="block text-sm font-medium text-gray-300 mb-2">Media File</label><input type="file" id="file-upload" name="mediafile" class="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-gray-600 file:text-white hover:file:bg-gray-500" required>`;
        } else if (type === 'magnet') {
            inputHtml = `<label for="link-upload" class="block text-sm font-medium text-gray-300 mb-2">Magnet Link</label><input type="text" id="link-upload" name="url" class="w-full bg-gray-700 p-3 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="magnet:?xt=urn:btih:..." required>`;
            actionsHtml = `<button type="button" id="fetch-torrent-files" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-md flex items-center gap-2"><i data-lucide="list"></i>Fetch Files</button>`;
        } else if (type === 'batch-link') {
            singleFields.style.display = 'none';
            inputHtml = `<label for="batch-links" class="block text-sm font-medium text-gray-300 mb-2">Direct Download Links (one per line)</label><textarea id="batch-links" name="batch_links" class="w-full bg-gray-700 p-3 h-48 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="https://.../movie1.mp4\nhttps://.../movie2.mp4" required></textarea>`;
        }
        container.innerHTML = inputHtml;
        formActions.innerHTML = actionsHtml;
        lucide.createIcons();
    };
    
    const handleFetchTorrentFiles = async () => {
        const magnetLink = document.getElementById('link-upload').value;
        const statusDiv = document.getElementById('upload-status');
        const button = document.getElementById('fetch-torrent-files');
        if (!magnetLink) {
            statusDiv.innerHTML = `<p class="text-red-400">Please enter a magnet link.</p>`;
            return;
        }

        button.disabled = true;
        button.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Fetching...';
        lucide.createIcons();
        statusDiv.innerHTML = `<p class="text-blue-400">Requesting torrent info from server...</p>`;

        try {
            const response = await fetch(`${API_URL}/admin/torrent-info`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet: magnetLink })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to fetch torrent info.');
            
            renderTorrentFileList(result.files);
            statusDiv.innerHTML = `<p class="text-green-400">Found ${result.files.length} files. Please select which ones to download.</p>`;

        } catch (error) {
            statusDiv.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
            button.disabled = false;
            button.innerHTML = '<i data-lucide="list"></i> Fetch Files';
            lucide.createIcons();
        }
    };

    const renderTorrentFileList = (files) => {
        const selectionArea = document.getElementById('torrent-selection-area');
        const mainFields = document.getElementById('upload-main-fields');
        const formActions = document.getElementById('form-actions');

        const filesHtml = files.map((file, index) => `
            <div class="flex items-center justify-between bg-gray-700 p-3 rounded-md">
                <label for="file-${index}" class="flex-grow text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" id="file-${index}" name="selectedFiles" value="${index}" class="mr-3 h-4 w-4 rounded border-gray-500 bg-gray-600 text-indigo-600 focus:ring-indigo-500">
                    ${file.name}
                </label>
                <span class="text-xs text-gray-400">${(file.length / 1024 / 1024).toFixed(2)} MB</span>
            </div>
        `).join('');

        selectionArea.innerHTML = `
            <h3 class="text-lg font-semibold text-white mb-4">Select Files to Download</h3>
            <div class="space-y-2 max-h-60 overflow-y-auto pr-2">${filesHtml}</div>`;
        
        mainFields.style.display = 'none';
        formActions.innerHTML = `<button type="submit" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-bold py-3 px-6 rounded-md flex items-center gap-2"><i data-lucide="download-cloud"></i>Download Selected</button>`;
        lucide.createIcons();
    };

    const renderManageContent = async () => {
        content.innerHTML = `<h2 class="text-3xl font-bold text-white mb-6">Loading Content...</h2>`;
        try {
            const response = await fetch(`${API_URL}/media`);
            const { movies, tvShows } = await response.json();
            const allContent = [...movies.map(m => ({ ...m, mediaType: 'movies' })), ...tvShows.map(s => ({ ...s, mediaType: 'tvShows' }))];

            const contentHtml = allContent.map(item => `
                <tr class="border-b border-gray-700" data-id="${item.id}" data-type="${item.mediaType}">
                    <td class="p-4 flex items-center gap-4">
                        <img src="${item.poster_path ? 'https://image.tmdb.org/t/p/w92' + item.poster_path : 'https://placehold.co/40x60/1f2937/9ca3af?text=N/A'}" class="w-10 h-15 rounded-md hidden sm:block" alt="poster">
                        <span class="font-medium">${item.title}</span>
                    </td>
                    <td class="p-4 text-gray-400 capitalize hidden md:table-cell">${item.streamType}</td>
                    <td class="p-4 text-right">
                        <button class="delete-media-btn text-red-400 hover:text-red-300"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                    </td>
                </tr>
            `).join('');

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Manage Content</h2>
                <div class="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-700 text-xs uppercase font-semibold">
                            <tr>
                                <th class="p-4">Title</th>
                                <th class="p-4 hidden md:table-cell">Source</th>
                                <th class="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${contentHtml || '<tr><td colspan="3" class="text-center p-8">No content in library.</td></tr>'}</tbody>
                    </table>
                </div>`;
        } catch (error) {
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg">${error.message}</div>`;
        }
        lucide.createIcons();
    };

    const renderRequests = async () => {
        content.innerHTML = `<h2 class="text-3xl font-bold text-white mb-6">Loading Requests...</h2>`;
        try {
            const response = await fetch(`${API_URL}/admin/requests`);
            const requests = await response.json();
            const requestsHtml = requests.map(req => `
                <tr class="border-b border-gray-700" data-request-id="${req.id}">
                    <td class="p-4 font-medium">${req.title}</td>
                    <td class="p-4 text-gray-400 hidden sm:table-cell">${new Date(req.timestamp).toLocaleString()}</td>
                    <td class="p-4"><span class="px-2 py-1 text-xs font-semibold rounded-full ${req.status === 'pending' ? 'bg-yellow-500 text-yellow-900' : 'bg-green-500 text-green-900'}">${req.status}</span></td>
                    <td class="p-4 text-right space-x-2">
                        <button class="fulfill-btn text-indigo-400 hover:text-indigo-300"><i data-lucide="check-circle" class="w-5 h-5"></i></button>
                        <button class="delete-btn text-red-400 hover:text-red-300"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                    </td>
                </tr>`).join('');
            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Manage Requests</h2>
                <div class="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table class="w-full text-left">
                    <thead class="bg-gray-700 text-xs uppercase font-semibold"><tr><th class="p-4">Title</th><th class="p-4 hidden sm:table-cell">Date</th><th class="p-4">Status</th><th class="p-4 text-right">Actions</th></tr></thead>
                    <tbody>${requests.length > 0 ? requestsHtml : '<tr><td colspan="4" class="text-center p-8">No pending requests.</td></tr>'}</tbody>
                </table></div>`;
        } catch (error) { content.innerHTML = `<div class="bg-red-900 p-4 rounded-lg">${error.message}</div>`; }
        lucide.createIcons();
    };

    const renderStatus = async () => {
        try {
            const response = await fetch(`${API_URL}/admin/status`);
            if (!response.ok) throw new Error('Server not responding');
            const status = await response.json();

            if(window.location.hash !== '#status') return;

            const torrentsHtml = status.torrents.map(t => `
                <div class="bg-gray-700 p-4 rounded-md">
                    <p class="font-semibold truncate text-sm">${t.name || t.infoHash}</p>
                    <div class="w-full bg-gray-600 rounded-full h-2.5 mt-2"><div class="bg-indigo-500 h-2.5 rounded-full" style="width: ${t.progress}%"></div></div>
                    <div class="text-xs text-gray-400 mt-1 flex justify-between"><span>${t.progress}%</span><span>${t.downloadSpeed}</span><span>Peers: ${t.peers}</span></div>
                </div>`).join('');

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Server Status</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
                    <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">Status</h3><p class="text-xl font-semibold text-green-400">Online</p></div>
                    <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">Files Hosted</h3><p class="text-xl font-semibold">${status.movies_hosted} M / ${status.shows_hosted} S</p></div>
                    <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">Requests</h3><p class="text-xl font-semibold">${status.requests_pending}</p></div>
                    <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">DL Speed</h3><p class="text-xl font-semibold">${status.total_download_speed}</p></div>
                </div>
                <h3 class="text-2xl font-bold text-white mb-4">Active Torrents (${status.torrents_active})</h3>
                <div class="space-y-4">${torrentsHtml || '<p class="text-gray-400">No active torrents.</p>'}</div>`;
        } catch (error) {
            console.error("Status fetch error:", error);
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg"><p class="font-bold">Server Offline</p><p>Could not connect.</p></div>`;
        }
    };
    
    const router = () => {
        clearInterval(statusInterval);
        const hash = window.location.hash || '#upload';
        const renderFunc = routes[hash] || renderUpload;
        
        content.innerHTML = `<h2 class="text-3xl font-bold text-white mb-6">Loading...</h2>`;
        renderFunc();

        if (hash === '#status') {
            statusInterval = setInterval(renderStatus, 3000);
        }
        updateActiveLink(hash);
    };

    const updateActiveLink = (hash) => {
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === hash);
        });
    };

    const routes = {
        '#upload': renderUpload,
        '#manage': renderManageContent,
        '#requests': renderRequests,
        '#status': renderStatus
    };

    window.addEventListener('hashchange', router);
    
    document.body.addEventListener('change', e => {
        if (e.target.id === 'upload-type') updateUploadInput(e.target.value);
    });

    document.body.addEventListener('click', e => {
        if (e.target.closest('#fetch-torrent-files')) {
            handleFetchTorrentFiles();
        }
    });

    document.body.addEventListener('submit', async e => {
        if (e.target.id === 'upload-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"], button[type="button"]');
            const statusDiv = document.getElementById('upload-status');
            
            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Processing...';
            lucide.createIcons();
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
                
                setTimeout(() => {
                    form.reset();
                    renderUpload();
                }, 2000);

            } catch (error) {
                statusDiv.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
                button.disabled = false;
                button.innerHTML = 'Add to Library';
            }
        }
    });

    content.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const requestRow = button.closest('tr[data-request-id]');
        const mediaRow = button.closest('tr[data-id]');

        if (requestRow) {
            const id = requestRow.dataset.requestId;
            if (button.classList.contains('delete-btn')) {
                if (confirm('Are you sure you want to delete this request?')) {
                    await fetch(`${API_URL}/admin/requests/${id}`, { method: 'DELETE' });
                    requestRow.remove();
                }
            } else if (button.classList.contains('fulfill-btn')) {
                await fetch(`${API_URL}/admin/requests/${id}`, { method: 'PUT' });
                renderRequests();
            }
        } else if (mediaRow) {
            if (button.classList.contains('delete-media-btn')) {
                const id = mediaRow.dataset.id;
                const type = mediaRow.dataset.type;
                if (confirm('Are you sure you want to delete this media? This cannot be undone.')) {
                    await fetch(`${API_URL}/admin/media/${type}/${id}`, { method: 'DELETE' });
                    mediaRow.remove();
                }
            }
        }
    });
    
    router();
});
