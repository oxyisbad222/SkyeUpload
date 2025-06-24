// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    const content = document.getElementById('app-content');
    const navItems = document.querySelectorAll('.nav-item');
    const API_URL = 'https://skyeupload.fly.dev/';

    // --- RENDER FUNCTIONS ---

    // Fetches media and Renders the Home page
    const renderHome = async () => {
        content.innerHTML = `<div class="p-4"><h1 class="text-2xl font-bold">Loading...</h1></div>`;
        try {
            const response = await fetch(`${API_URL}/media`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const mediaLibrary = await response.json();

            const moviesHtml = mediaLibrary.movies.map(movie => `
                <div class="cursor-pointer group" data-media-id="${movie.id}" data-media-type="movie">
                    <img src="${movie.thumbnail}" alt="${movie.title}" onerror="this.onerror=null;this.src='https://placehold.co/400x600/1a1a1a/ffffff?text=Image+Not+Found';" class="rounded-lg w-full h-auto object-cover aspect-[2/3] transition-transform duration-300 group-hover:scale-105">
                    <h3 class="text-sm font-medium mt-2 truncate">${movie.title}</h3>
                    <p class="text-xs text-gray-400">${movie.genre}</p>
                </div>
            `).join('');

            const tvShowsHtml = mediaLibrary.tvShows.map(show => `
                <div class="cursor-pointer group" data-media-id="${show.id}" data-media-type="tv">
                    <img src="${show.thumbnail}" alt="${show.title}" onerror="this.onerror=null;this.src='https://placehold.co/400x600/2a2a2a/ffffff?text=Image+Not+Found';" class="rounded-lg w-full h-auto object-cover aspect-[2/3] transition-transform duration-300 group-hover:scale-105">
                    <h3 class="text-sm font-medium mt-2 truncate">${show.title}</h3>
                    <p class="text-xs text-gray-400">${show.genre}</p>
                </div>
            `).join('');

            content.innerHTML = `
                <h1 class="text-3xl font-bold mb-6">Home</h1>
                <div class="space-y-8">
                    <div>
                        <h2 class="text-xl font-semibold mb-4">Movies</h2>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            ${moviesHtml || '<p class="text-gray-400 col-span-full">No movies in the library yet.</p>'}
                        </div>
                    </div>
                    <div>
                        <h2 class="text-xl font-semibold mb-4">TV Shows</h2>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            ${tvShowsHtml || '<p class="text-gray-400 col-span-full">No TV shows in the library yet.</p>'}
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error("Failed to render home:", error);
            content.innerHTML = `<div class="p-4 bg-red-900 text-red-200 rounded-lg">Error loading media. Please check if the server is running.</div>`;
        }
    };

    // Renders the Search page
    const renderSearch = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Search</h1>
            <div class="relative">
                <input type="text" placeholder="Search for movies, shows..." class="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 pl-10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <i data-lucide="search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"></i>
            </div>
            <!-- Search results will be populated here -->
        `;
        lucide.createIcons();
    };

    // Renders the Requests page
    const renderRequests = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Request Content</h1>
            <form id="request-form" class="space-y-4">
                <input id="request-title" type="text" placeholder="Movie or TV Show Title" class="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                <textarea id="request-details" placeholder="Add any details (e.g., year, specific version)" class="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-400 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500">Submit Request</button>
            </form>
            <div id="request-status" class="mt-6"></div>
        `;
    };

    // Renders the Settings page
    const renderSettings = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Settings</h1>
             <div class="space-y-4">
                <div class="bg-gray-800 p-4 rounded-lg">
                    <label class="flex justify-between items-center cursor-pointer">
                        <span>Sync Watch History</span>
                        <div class="relative">
                            <input type="checkbox" class="sr-only peer" checked>
                            <div class="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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

    // --- ROUTER ---
    const routes = {
        '#home': renderHome,
        '#search': renderSearch,
        '#requests': renderRequests,
        '#settings': renderSettings
    };

    const router = () => {
        const path = window.location.hash || '#home';
        const renderFunction = routes[path] || renderHome;
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
    
    // Handle form submission for requests
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

    // Listen for hash changes (e.g., back/forward buttons)
    window.addEventListener('hashchange', router);

    // Initial load
    router(); 

    // Initialize Lucide icons
    lucide.createIcons();
});
