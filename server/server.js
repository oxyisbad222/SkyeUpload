// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---

// Enable Cross-Origin Resource Sharing (CORS)
// This allows the client (which may be served from a different origin during development) 
// to make requests to this server.
app.use(cors());

// Enable parsing of JSON in request bodies
app.use(express.json());

// Serve the static client files (HTML, CSS, JS, icons)
// This tells Express to treat the 'client' directory as the root for static assets.
app.use(express.static(path.join(__dirname, '..', 'client')));


// --- MOCK DATABASE ---
// This data will eventually be moved to a proper database and managed
// by the admin panel.
const mediaLibrary = {
    movies: [
        { id: 1, title: 'Sample Movie 1', genre: 'Sci-Fi', thumbnail: 'https://placehold.co/400x600/1a1a1a/ffffff?text=Movie+1', filePath: '/path/to/movie1.mp4' },
        { id: 2, title: 'Sample Movie 2', genre: 'Action', thumbnail: 'https://placehold.co/400x600/1a1a1a/ffffff?text=Movie+2', filePath: '/path/to/movie2.mp4' },
        { id: 3, title: 'Sample Movie 3', genre: 'Comedy', thumbnail: 'https://placehold.co/400x600/1a1a1a/ffffff?text=Movie+3', filePath: '/path/to/movie3.mp4' },
    ],
    tvShows: [
        { id: 1, title: 'Sample Show 1', genre: 'Drama', thumbnail: 'https://placehold.co/400x600/2a2a2a/ffffff?text=Show+1', filePath: '/path/to/show1.mp4' },
        { id: 2, title: 'Sample Show 2', genre: 'Thriller', thumbnail: 'https://placehold.co/400x600/2a2a2a/ffffff?text=Show+2', filePath: '/path/to/show2.mp4' },
    ]
};

const contentRequests = []; // In-memory array to store requests

// --- API ROUTES ---

// GET /api/media - Get all media content
app.get('/api/media', (req, res) => {
    res.json(mediaLibrary);
});

// POST /api/requests - Submit a new content request
app.post('/api/requests', (req, res) => {
    const { title, details } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Title is required' });
    }

    const newRequest = {
        id: Date.now(), // Use a timestamp for a unique ID
        title,
        details,
        status: 'pending',
        timestamp: new Date().toISOString()
    };
    
    contentRequests.push(newRequest);
    console.log('New content request received:', newRequest);
    
    res.status(201).json({ message: 'Request submitted successfully!', request: newRequest });
});

// GET /api/admin/requests - View all content requests (for admin panel)
app.get('/api/admin/requests', (req, res) => {
    res.json(contentRequests);
});

// GET /api/admin/status - Get server status (for admin panel)
app.get('/api/admin/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: `${Math.floor(process.uptime())} seconds`,
        version: '1.0.0',
        requests_pending: contentRequests.length
    });
});

// Catch-all route to serve the client's index.html for any other request.
// This is important for a Single Page Application (SPA) where routing is handled on the client.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`SkyeUpload server running on http://localhost:${PORT}`);
    console.log('Serving client files from:', path.join(__dirname, '..', 'client'));
});
