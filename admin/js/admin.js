document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('admin-content');
    const navLinks = document.querySelectorAll('.sidebar-link');
    
    // The base URL for our server's API
    const API_URL = 'http://localhost:3000/api';

    // --- RENDER FUNCTIONS ---

    // Renders the Upload Content page
    const renderUpload = () => {
        content.innerHTML = `
            <h2 class="text-3xl font-bold text-white mb-6">Upload Content</h2>
            <div class="bg-gray-800 p-8 rounded-lg shadow-lg">
                <form id="upload-form" class="space-y-6">
                    <div>
                        <label for="upload-type" class="block text-sm font-medium text-gray-300 mb-2">Upload Type</label>
                        <select id="upload-type" name="type" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500">
                            <option value="file">MP4 File</option>
                            <option value="link">Direct Link</option>
                            <option value="magnet">Magnet Link</option>
                            <option value="torrent">.torrent File</option>
                        </select>
                    </div>

                    <div>
                        <label for="content-title" class="block text-sm font-medium text-gray-300 mb-2">Title</label>
                        <input type="text" id="content-title" name="title" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., My Home Movie" required>
                    </div>

                    <div id="upload-input-area">
                        <!-- Input for file type will be injected here by JS -->
                    </div>

                    <div class="flex justify-end">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-md transition-colors">Add to Library</button>
                    </div>
                </form>
            </div>
        `;
        // Initial setup for the dynamic input area
        updateUploadInput('file'); 
    };

    // Fetches and Renders the Manage Requests page
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
                    <td class="p-4">
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-yellow-900">${req.status}</span>
                    </td>
                    <td class="p-4 text-right">
                        <button class="text-green-400 hover:text-green-300 mr-2">Fulfill</button>
                        <button class="text-red-400 hover:text-red-300">Delete</button>
                    </td>
                </tr>
            `).join('');

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Manage Requests</h2>
                <div class="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <table class="w-full text-left">
                        <thead class="bg-gray-700 text-xs uppercase font-semibold">
                            <tr>
                                <th class="p-4">Title</th>
                                <th class="p-4">Details</th>
                                <th class="p-4">Date</th>
                                <th class="p-4">Status</th>
                                <th class="p-4"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${requests.length > 0 ? requestsHtml : '<tr><td colspan="5" class="text-center p-8 text-gray-400">No pending requests.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg">${error.message}</div>`;
        }
    };

    // Fetches and Renders the Server Status page
    const renderStatus = async () => {
        content.innerHTML = `<div class="text-center text-lg">Loading server status...</div>`;
        try {
            const response = await fetch(`${API_URL}/admin/status`);
            if (!response.ok) throw new Error('Failed to fetch server status');
            const status = await response.json();

            content.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-6">Server Status</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h3 class="text-gray-400 text-sm font-medium">Status</h3>
                        <p class="text-2xl font-semibold text-green-400 capitalize">${status.status}</p>
                    </div>
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h3 class="text-gray-400 text-sm font-medium">Uptime</h3>
                        <p class="text-2xl font-semibold">${status.uptime}</p>
                    </div>
                    <div class="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h3 class="text-gray-400 text-sm font-medium">Pending Requests</h3>
                        <p class="text-2xl font-semibold">${status.requests_pending}</p>
                    </div>
                </div>
            `;
        } catch (error) {
            content.innerHTML = `<div class="bg-red-900 text-red-200 p-4 rounded-lg">${error.message}</div>`;
        }
    };
    
    // --- DYNAMIC INPUTS for UPLOAD FORM ---
    const updateUploadInput = (type) => {
        const container = document.getElementById('upload-input-area');
        if (!container) return;
        
        let inputHtml = '';
        switch (type) {
            case 'file':
                inputHtml = `
                    <label for="file-upload" class="block text-sm font-medium text-gray-300 mb-2">MP4 or Torrent File</label>
                    <input type="file" id="file-upload" name="mediafile" class="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 cursor-pointer">
                `;
                break;
            case 'link':
            case 'magnet':
                const placeholder = type === 'link' ? 'https://.../video.mp4' : 'magnet:?xt=urn:btih:...';
                inputHtml = `
                    <label for="link-upload" class="block text-sm font-medium text-gray-300 mb-2">URL or Magnet Link</label>
                    <input type="text" id="link-upload" name="url" class="w-full bg-gray-700 border-gray-600 text-white rounded-md p-3" placeholder="${placeholder}">
                `;
                break;
            case 'torrent':
                 inputHtml = `
                    <label for="file-upload" class="block text-sm font-medium text-gray-300 mb-2">.torrent File</label>
                    <input type="file" id="file-upload" name="mediafile" accept=".torrent" class="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 cursor-pointer">
                `;
                break;
        }
        container.innerHTML = inputHtml;
    };
    

    // --- ROUTER ---
    const routes = {
        '#upload': renderUpload,
        '#requests': renderRequests,
        '#status': renderStatus
    };

    const router = () => {
        const hash = window.location.hash || '#upload';
        const renderFunc = routes[hash] || renderUpload;
        renderFunc();
        updateActiveLink(hash);
    };

    const updateActiveLink = (hash) => {
        navLinks.forEach(link => {
            if (link.getAttribute('href') === hash) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    };

    // --- EVENT LISTENERS ---
    window.addEventListener('hashchange', router);
    
    // Delegate event listening for the dynamic upload form
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'upload-type') {
            updateUploadInput(e.target.value);
        }
    });
    
    // Initial call to the router
    router();
});
