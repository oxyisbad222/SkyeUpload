document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('admin-content');
    const navLinks = document.querySelectorAll('.sidebar-link');
    // REMOVED: API URL is no longer needed as all calls are relative.
    let statusInterval;

    const renderUpload = () => {
        content.innerHTML = `
            <h2 class="text-3xl font-bold text-white mb-6">Upload Content</h2>
            <div class="bg-gray-800 p-6 md:p-8 rounded-lg shadow-lg">
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
                        <label for="file-upload" class="block text-sm font-medium text-gray-300 mb-2">Media File</label>
                        <input type="file" id="file-upload" name="mediafile" class="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-gray-600 file:text-white hover:file:bg-gray-500" required>
                    </div>
                    <div id="upload-status" class="pt-2"></div>
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-bold py-3 px-6 rounded-md flex items-center gap-2"><i data-lucide="upload-cloud"></i>Upload to Cloud</button>
                    </div>
                </form>
            </div>
        `;
        lucide.createIcons();
    };
    
    const renderManageContent = async () => {
        content.innerHTML = `<h2 class="text-3xl font-bold text-white mb-6">Loading Content...</h2>`;
        try {
            // Use a relative path for the API call
            const response = await fetch(`/api/media`);
            const { movies, tvShows } = await response.json();
            const allContent = [...movies.map(m => ({ ...m, mediaType: 'movies' })), ...tvShows.map(s => ({ ...s, mediaType: 'tvShows' }))];

            const contentHtml = allContent.map(item => `
                <tr class="border-b border-gray-700" data-id="${item.id}" data-type="${item.mediaType}">
                    <td class="p-4 flex items-center gap-4">
                        <img src="${item.poster_path ? 'https://image.tmdb.org/t/p/w92' + item.poster_path : 'https://placehold.co/40x60/1f2937/9ca3af?text=N/A'}" class="w-10 h-15 rounded-md hidden sm:block" alt="poster">
                        <span class="font-medium">${item.title}</span>
                    </td>
                    <td class="p-4 text-gray-400 capitalize hidden md:table-cell">${item.streamType === 's3' ? item.storageDetails.storageType : item.streamType}</td>
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
                                <th class="p-4 hidden md:table-cell">Storage</th>
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
            // Use a relative path for the API call
            const response = await fetch(`/api/admin/requests`);
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
    
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const renderStatus = async () => {
        try {
            if (window.location.hash !== '#status') return;
            // Use a relative path for the API call
            const response = await fetch(`/api/admin/status`);
            if (!response.ok) throw new Error('Server not responding');
            const status = await response.json();

            const storjUsage = status.storageUsage?.storj || 0;
            const b2Usage = status.storageUsage?.b2 || 0;
            const storjCapacity = 25 * 1024 * 1024 * 1024;
            const b2Capacity = 10 * 1024 * 1024 * 1024;

            const storjPercent = Math.min((storjUsage / storjCapacity) * 100, 100).toFixed(2);
            const b2Percent = Math.min((b2Usage / b2Capacity) * 100, 100).toFixed(2);

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Server Status</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-gray-800 p-6 rounded-lg">
                        <h3 class="font-semibold text-lg mb-2">Primary Storage (Storj)</h3>
                        <p class="text-sm text-gray-400">${formatBytes(storjUsage)} / ${formatBytes(storjCapacity)}</p>
                        <div class="w-full bg-gray-700 rounded-full h-4 mt-2">
                            <div class="bg-blue-600 h-4 rounded-full" style="width: ${storjPercent}%"></div>
                        </div>
                        <p class="text-right text-sm mt-1">${storjPercent}% Full</p>
                    </div>
                    <div class="bg-gray-800 p-6 rounded-lg">
                        <h3 class="font-semibold text-lg mb-2">Overflow Storage (Backblaze B2)</h3>
                        <p class="text-sm text-gray-400">${formatBytes(b2Usage)} / ${formatBytes(b2Capacity)}</p>
                        <div class="w-full bg-gray-700 rounded-full h-4 mt-2">
                             <div class="bg-orange-500 h-4 rounded-full" style="width: ${b2Percent}%"></div>
                        </div>
                        <p class="text-right text-sm mt-1">${b2Percent}% Full</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                     <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">Server Status</h3><p class="text-xl font-semibold text-green-400">Online</p></div>
                     <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">Movies Hosted</h3><p class="text-xl font-semibold">${status.movies_hosted}</p></div>
                     <div class="bg-gray-800 p-4 rounded-lg"><h3 class="text-gray-400 text-sm font-medium">Shows Hosted</h3><p class="text-xl font-semibold">${status.shows_hosted}</p></div>
                </div>`;
        } catch (error) {
            console.error("Status fetch error:", error);
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg"><p class="font-bold">Server Offline</p><p>Could not connect.</p></div>`;
        }
    };
    
    // --- Router Logic ---
    const router = () => {
        clearInterval(statusInterval);
        const hash = window.location.hash || '#upload';
        const renderFunc = routes[hash] || renderUpload;
        
        content.innerHTML = `<h2 class="text-3xl font-bold text-white mb-6">Loading...</h2>`;
        renderFunc();

        if (hash === '#status') {
            renderStatus();
            statusInterval = setInterval(renderStatus, 10000);
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
    
    // --- Event Listeners ---
    document.body.addEventListener('submit', async e => {
        if (e.target.id === 'upload-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            const statusDiv = document.getElementById('upload-status');
            
            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Uploading...';
            lucide.createIcons();
            statusDiv.innerHTML = `<p class="text-blue-400">Sending file to cloud storage. This may take a moment...</p>`;

            const formData = new FormData(form);
            
            try {
                // Use a relative path for the API call
                const response = await fetch(`/api/admin/upload`, {
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
                button.innerHTML = '<i data-lucide="upload-cloud"></i> Upload to Cloud';
                lucide.createIcons();
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
                    await fetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
                    requestRow.remove();
                }
            } else if (button.classList.contains('fulfill-btn')) {
                await fetch(`/api/admin/requests/${id}`, { method: 'PUT' });
                renderRequests();
            }
        } else if (mediaRow) {
            if (button.classList.contains('delete-media-btn')) {
                const id = mediaRow.dataset.id;
                const type = mediaRow.dataset.type; // 'movies' or 'tvShows'
                if (confirm('Are you sure you want to delete this media? This cannot be undone.')) {
                    await fetch(`/api/admin/media/${type}/${id}`, { method: 'DELETE' });
                    mediaRow.remove();
                }
            }
        }
    });
    
    // Initial load
    router();
});
