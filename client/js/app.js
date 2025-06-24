document.addEventListener('DOMContentLoaded', () => {

    const content = document.getElementById('app-content');
    const navItems = document.querySelectorAll('.nav-item');
    const API_URL = 'https://skyeupload.fly.dev'; // Base URL of your backend
    let mediaLibraryCache = null;
    let searchDebounceTimer;
    let activePlayer = null;

    // --- Pull To Refresh Logic ---
    const pptr = document.getElementById('pull-to-refresh');
    let touchstartY = 0;
    document.body.addEventListener('touchstart', e => {
        if (window.scrollY === 0) touchstartY = e.touches[0].clientY;
    }, { passive: true });
    document.body.addEventListener('touchmove', e => {
        const touchY = e.touches[0].clientY;
        const touchDiff = touchY - touchstartY;
        if (window.scrollY === 0 && touchDiff > 80) {
            pptr.style.opacity = '1';
        }
    }, { passive: true });
    document.body.addEventListener('touchend', () => {
        if (pptr.style.opacity === '1') {
            pptr.style.opacity = '0';
            refreshMedia();
        }
    });
    
    // --- Refresh Data ---
    async function refreshMedia() {
        console.log("Refreshing media library...");
        mediaLibraryCache = null;
        if (window.location.hash === '' || window.location.hash === '#home') {
            await renderHome();
        }
    }

    // --- Helper to create media item HTML ---
    const createMediaHtml = (item) => `
        <div class="media-item" data-id="${item.id}" data-type="${item.type}">
            <img src="${item.poster_path ? 'https://image.tmdb.org/t/p/w500' + item.poster_path : 'https://placehold.co/500x750/1f2937/9ca3af?text=' + encodeURIComponent(item.title)}" alt="${item.title}" loading="lazy">
        </div>`;

    // --- RENDER FUNCTIONS ---
    const renderHome = async () => {
        content.innerHTML = `<div class="p-4 text-center"><h1 class="text-2xl font-bold">Loading Library...</h1></div>`;
        try {
            if (!mediaLibraryCache) {
                 const response = await fetch(`${API_URL}/api/media`);
                 if (!response.ok) throw new Error(`Server connection failed.`);
                 mediaLibraryCache = await response.json();
            }
           
            content.innerHTML = `
                <h1 class="text-3xl font-bold mb-6">Home</h1>
                <div class="space-y-8">
                    <div>
                        <h2 class="text-xl font-semibold mb-4">Movies</h2>
                        <div class="media-grid">${mediaLibraryCache.movies.length > 0 ? mediaLibraryCache.movies.map(createMediaHtml).join('') : '<p class="text-sm text-gray-400">No movies in the library.</p>'}</div>
                    </div>
                    <div>
                        <h2 class="text-xl font-semibold mb-4">TV Shows</h2>
                        <div class="media-grid">${mediaLibraryCache.tvShows.length > 0 ? mediaLibraryCache.tvShows.map(createMediaHtml).join('') : '<p class="text-sm text-gray-400">No TV shows in the library.</p>'}</div>
                    </div>
                </div>`;
        } catch (error) {
            console.error("Failed to render home:", error);
            mediaLibraryCache = null;
            content.innerHTML = `<div class="p-4 bg-red-900 text-red-200 rounded-lg text-center"><p class="font-bold">Connection Error</p><p class="text-sm">${error.message} Please pull down to refresh.</p></div>`;
        }
    };

    const renderSearch = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Search</h1>
            <div class="relative">
                <input type="search" id="search-input" placeholder="Search your library..." class="w-full">
                <i data-lucide="search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"></i>
            </div>
            <div id="search-results" class="mt-8"></div>
        `;
        lucide.createIcons();

        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                performSearch(searchInput.value);
            }, 300);
        });
    };
    
    const performSearch = async (query) => {
        const resultsContainer = document.getElementById('search-results');
        if (!query || query.trim() === '') {
            resultsContainer.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Search failed');
            const results = await response.json();

            if (results.movies.length === 0 && results.tvShows.length === 0) {
                resultsContainer.innerHTML = '<p class="text-gray-400 text-center">No results found.</p>';
                return;
            }

            resultsContainer.innerHTML = `
                ${results.movies.length > 0 ? `<h2 class="text-xl font-semibold mb-4">Movies</h2><div class="media-grid">${results.movies.map(createMediaHtml).join('')}</div>` : ''}
                ${results.tvShows.length > 0 ? `<h2 class="text-xl font-semibold mt-8 mb-4">TV Shows</h2><div class="media-grid">${results.tvShows.map(createMediaHtml).join('')}</div>` : ''}
            `;
        } catch (error) {
            resultsContainer.innerHTML = '<p class="text-red-400 text-center">Error performing search.</p>';
        }
    };
    
    const renderRequests = () => {
        content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Request Content</h1>
            <form id="request-form" class="space-y-4">
                <input id="request-title" type="text" placeholder="Movie or TV Show Title" required>
                <textarea id="request-details" placeholder="Add any details (e.g., year, specific version)" class="h-24 resize-none"></textarea>
                <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500">Submit Request</button>
            </form>
            <div id="request-status" class="mt-6"></div>`;
    };
    
    const renderSettings = () => {
         content.innerHTML = `
            <h1 class="text-3xl font-bold mb-6">Settings</h1>
             <div class="space-y-4">
                <div class="bg-gray-800 p-4 rounded-lg">
                    <p class="text-sm">App Version: 1.2.0</p>
                    <p class="text-xs text-gray-400 mt-1">Developed by Skye</p>
                </div>
            </div>`;
    };

    // --- MODALS AND PLAYER ---
    function showDetailsView(item) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal-btn">&times;</button>
                <div id="details-view">
                    <div class="details-header" style="background-image: url('https://image.tmdb.org/t/p/w780${item.poster_path}')"></div>
                    <div class="details-body">
                        <h2 class="text-2xl font-bold">${item.title}</h2>
                        <p class="text-sm text-gray-400 mb-4">${item.release_date ? item.release_date.substring(0,4) : ''}</p>
                        <p class="mb-6 text-gray-300">${item.overview || 'No description available.'}</p>
                        <button class="play-button"><i data-lucide="play"></i>Play</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
        setTimeout(() => modal.classList.add('visible'), 10);
        
        const closeModal = () => {
            modal.classList.remove('visible');
            modal.addEventListener('transitionend', () => modal.remove());
        };
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        modal.querySelector('.play-button').addEventListener('click', () => {
            closeModal();
            showVideoPlayer(item);
        });
    }

    function showVideoPlayer(item) {
        if (activePlayer) {
            activePlayer.destroy();
            activePlayer = null;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop video-modal';
        const videoSrc = `${API_URL}${item.filePath}`;

        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal-btn">&times;</button>
                <video id="player" playsinline controls>
                    <source src="${videoSrc}" type="video/mp4">
                </video>
            </div>`;
        document.body.appendChild(modal);

        const player = new Plyr('#player', {});
        activePlayer = player;

        setTimeout(() => {
            modal.classList.add('visible');
            player.play();
        }, 10);

        const closeModal = () => {
            if (activePlayer) {
                activePlayer.destroy();
                activePlayer = null;
            }
            modal.classList.remove('visible');
            modal.addEventListener('transitionend', () => modal.remove());
        };
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    }
    
    // --- EVENT LISTENERS & ROUTER ---
    content.addEventListener('click', (e) => {
        const mediaItemEl = e.target.closest('.media-item');
        if (mediaItemEl) {
            const { id, type } = mediaItemEl.dataset;
            let item;
            if (mediaLibraryCache) {
                 const library = type === 'movie' ? mediaLibraryCache.movies : mediaLibraryCache.tvShows;
                 item = library.find(i => i.id == id);
            }
            if (item) showDetailsView(item);
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
            try {
                const response = await fetch(`${API_URL}/api/requests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, details }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Failed to submit');
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
    const updateActiveNav = (path) => { navItems.forEach(item => { item.classList.toggle('active', item.getAttribute('href') === path); }); };
    
    window.addEventListener('hashchange', router);
    
    router();
});
