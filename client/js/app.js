document.addEventListener('DOMContentLoaded', () => {

    const content = document.getElementById('app-content');
    const navItems = document.querySelectorAll('.nav-item');
    // IMPORTANT: Make sure this URL is correct for your deployment
    const API_URL = 'https://skyeupload.fly.dev/api'; // Example, replace with your actual URL
    let mediaLibraryCache = null;

    // --- RENDER FUNCTIONS ---

    const renderHome = async () => {
        content.innerHTML = `<div class="p-4"><h1 class="text-2xl font-bold">Loading...</h1></div>`;
        try {
            // Use cache if available to avoid refetching on every navigation
            if (!mediaLibraryCache) {
                 const response = await fetch(`${API_URL}/media`);
                 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                 mediaLibraryCache = await response.json();
            }
           
            const moviesHtml = mediaLibraryCache.movies.map(movie => `
                <div class="media-item" data-file-name="${movie.filePath.split('/').pop()}" data-title="${movie.title}">
                    <img src="${movie.thumbnail}" alt="${movie.title}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x600/1a1a1a/ffffff?text=Image+Not+Found';">
                    <h3>${movie.title}</h3>
                </div>`).join('');

            const tvShowsHtml = mediaLibraryCache.tvShows.map(show => `
                <div class="media-item" data-file-name="${show.filePath.split('/').pop()}" data-title="${show.title}">
                    <img src="${show.thumbnail}" alt="${show.title}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x600/2a2a2a/ffffff?text=Image+Not+Found';">
                    <h3>${show.title}</h3>
                </div>`).join('');

            content.innerHTML = `
                <h1 class="text-3xl font-bold mb-6">Home</h1>
                <div class="space-y-8">
                    <div>
                        <h2 class="text-xl font-semibold mb-4">Movies</h2>
                        <div class="media-grid">
                            ${moviesHtml || '<p class="text-gray-400 col-span-full">No movies in the library yet.</p>'}
                        </div>
                    </div>
                    <div>
                        <h2 class="text-xl font-semibold mb-4">TV Shows</h2>
                        <div class="media-grid">
                            ${tvShowsHtml || '<p class="text-gray-400 col-span-full">No TV shows in the library yet.</p>'}
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error("Failed to render home:", error);
            mediaLibraryCache = null; // Clear cache on error
            content.innerHTML = `<div class="p-4 bg-red-900 text-red-200 rounded-lg">Error loading media. Please check if the server is running and the API URL is correct.</div>`;
        }
    };

    const renderSearch = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Search</h1>
            <div class="relative">
                <input type="text" placeholder="Search for movies, shows..." class="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 pl-10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <i data-lucide="search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"></i>
            </div>
            <!-- Search results will be populated here -->
        `;
        lucide.createIcons();
    };
    
    const renderRequests = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Request Content</h1>
            <form id="request-form" class="space-y-4">
                <input id="request-title" type="text" placeholder="Movie or TV Show Title" class="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
                <textarea id="request-details" placeholder="Add any details (e.g., year, specific version)" class="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
                <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500">Submit Request</button>
            </form>
            <div id="request-status" class="mt-6"></div>
        `;
    };
    
    const renderSettings = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Settings</h1>
             <div class="space-y-4">
                <div class="bg-gray-800 p-4 rounded-lg">
                    <label class="flex justify-between items-center cursor-pointer">
                        <span>Sync Watch History</span>
                        <div class="relative">
                            <input type="checkbox" class="sr-only peer" checked>
                            <div class="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>
                </div>
                 <div class="bg-gray-800 p-4 rounded-lg">
                    <p class="text-sm">App Version: 1.0.0</p>
                    <p class="text-xs text-gray-400 mt-1">Developed by Skye</p>
                </div>
            </div>
        `;
    };


    // --- VIDEO PLAYER ---
    const showVideoPlayer = (fileName, title) => {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="close-modal" title="Close player">&times;</div>
                <video controls autoplay controlsList="nodownload">
                    <source src="${API_URL.replace('/api', '')}/uploads/${fileName}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;
        document.body.appendChild(modal);

        // Animate in
        setTimeout(() => modal.classList.add('visible'), 10);

        const closeModal = () => {
            modal.classList.remove('visible');
            modal.addEventListener('transitionend', () => modal.remove());
        };

        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    };
    
    // --- ROUTER & NAVIGATION ---
    const routes = {
        '#home': renderHome,
        '#search': renderSearch,
        '#requests': renderRequests,
        '#settings': renderSettings
    };

    const router = () => {
        const path = window.location.hash || '#home';
        const renderFunction = routes[path] || renderHome; // Default to home
        renderFunction();
        updateActiveNav(path);
    };

    const updateActiveNav = (path) => {
        navItems.forEach(item => {
            if (item.getAttribute('href') === path) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    };

    // --- EVENT LISTENERS ---
    content.addEventListener('click', (e) => {
        const mediaItem = e.target.closest('.media-item');
        if (mediaItem) {
            const { fileName, title } = mediaItem.dataset;
            showVideoPlayer(fileName, title);
        }
    });

    content.addEventListener('submit', async (e) => {
        if (e.target.id === 'request-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            const statusDiv = document.getElementById('request-status');
            
            const title = document.getElementById('request-title').value;
            const details = document.getElementById('request-details').value;
            
            button.disabled = true;
            button.textContent = 'Submitting...';
            statusDiv.innerHTML = '';

            try {
                const response = await fetch(`${API_URL}/requests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, details }),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Failed to submit request');
                }
                
                statusDiv.innerHTML = `<p class="text-green-400">${result.message}</p>`;
                form.reset();

            } catch (error) {
                statusDiv.innerHTML = `<p class="text-red-400">${error.message}</p>`;
            } finally {
                 button.disabled = false;
                 button.textContent = 'Submit Request';
                 setTimeout(() => statusDiv.innerHTML = '', 4000);
            }
        }
    });

    window.addEventListener('hashchange', router);
    
    // Initial load
    router();
    lucide.createIcons();
});
