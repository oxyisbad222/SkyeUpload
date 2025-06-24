// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const WebTorrent = require('webtorrent');

// Initialize the Express app and WebTorrent client
const app = express();
const client = new WebTorrent();
const PORT = process.env.PORT || 3000;

// --- Persistent Storage Setup for Fly.io ---
// Fly.io mounts volumes at '/data'. We'll use this path for persistent storage.
// This environment variable is a placeholder and not set by Fly.io, the default to '/data' is what matters.
const dataDir = process.env.FLYSK_DATA_DIR || '/data';
const dbPath = path.join(dataDir, 'database.json');
const uploadDir = path.join(dataDir, 'uploads');

console.log(`Using data directory: ${dataDir}`);


// --- Database Functions ---
const readDb = () => {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath);
            return JSON.parse(data);
        }
        // If DB doesn't exist, create it with a default structure
        const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] };
        // Ensure the data directory exists before writing the initial DB
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2));
        return defaultDb;
    } catch (error) {
        console.error("Error reading database:", error);
        return { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] };
    }
};

const writeDb = (data) => {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing to database:", error);
    }
};

// Load initial data from DB
let { mediaLibrary, contentRequests } = readDb();

// --- Ensure Uploads Directory Exists ---
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Serve static files from client, admin, and uploads directories
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/uploads', express.static(uploadDir));


// --- Helper Functions ---
const addMediaToLibrary = (title, type, genre, filename) => {
    const newMedia = {
        id: Date.now(),
        title,
        genre: genre || "Uncategorized",
        thumbnail: 'https://placehold.co/400x600/3a3a3a/ffffff?text=' + encodeURIComponent(title),
        filePath: `/uploads/${filename}`
    };

    if (type === 'movie' && mediaLibrary.movies) {
        mediaLibrary.movies.push(newMedia);
    } else if (type === 'tvShow' && mediaLibrary.tvShows) {
        mediaLibrary.tvShows.push(newMedia);
    } else {
        throw new Error('Invalid media type specified.');
    }
    
    writeDb({ mediaLibrary, contentRequests }); // Persist changes to the database file
    console.log('New media added and DB updated:', newMedia);
    return newMedia;
};

// --- API ROUTES ---

// Main endpoint for adding new content via file upload or magnet link
app.post('/api/admin/upload', upload.single('mediafile'), (req, res) => {
    const { title, type, genre, url, source_type } = req.body;

    if (!title || !type) {
        return res.status(400).json({ message: 'Title and media type are required.' });
    }

    if (source_type === 'file' && req.file) {
        try {
            const newMedia = addMediaToLibrary(title, type, genre, req.file.filename);
            return res.status(201).json({ message: 'File uploaded successfully!', media: newMedia });
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    } else if (source_type === 'magnet' && url) {
        console.log(`[WebTorrent] Received magnet link for: ${title}`);
        client.add(url, { path: uploadDir }, (torrent) => {
            console.log(`[WebTorrent] Started download for: ${torrent.name}`);
            const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv')) || torrent.files.reduce((a, b) => a.length > b.length ? a : b);
            console.log(`[WebTorrent] Main file identified: ${file.name}`);
            torrent.on('done', () => {
                console.log(`[WebTorrent] Download finished for ${file.name}.`);
                try {
                    addMediaToLibrary(title, type, genre, file.name);
                } catch (error) {
                    console.error(`[WebTorrent] Error adding to library: ${error.message}`);
                }
            });
            torrent.on('error', (err) => console.error(`[WebTorrent] Error:`, err));
        });
        return res.status(202).json({ message: `Download started for "${title}". It will be added to the library on completion.` });
    } else {
        return res.status(400).json({ message: 'Invalid request. Please provide a file or a magnet link.' });
    }
});

// Endpoint to get the entire media library
app.get('/api/media', (req, res) => {
    res.json(mediaLibrary);
});

// Endpoint for clients to submit content requests
app.post('/api/requests', (req, res) => {
    const { title, details } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const newRequest = { id: Date.now(), title, details, status: 'pending', timestamp: new Date().toISOString() };
    contentRequests.push(newRequest);
    writeDb({ mediaLibrary, contentRequests }); // Persist changes
    console.log('New content request received and DB updated:', newRequest);
    res.status(201).json({ message: 'Request submitted successfully!', request: newRequest });
});

// Endpoint for the admin panel to view content requests
app.get('/api/admin/requests', (req, res) => {
    res.json(contentRequests);
});

// Endpoint for the admin panel to check server status
app.get('/api/admin/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: `${Math.floor(process.uptime())} seconds`,
        version: '1.0.0',
        requests_pending: contentRequests.length,
        torrents_active: client.torrents.length,
        download_speed: (client.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s'
    });
});

// Catch-all route to serve the client's index.html for any other request
app.get(/^\/(?!admin).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// --- Start Server & Graceful Shutdown ---
const server = app.listen(PORT, () => {
    console.log(`SkyeUpload server running on http://localhost:${PORT}`);
    console.log(`Admin panel available at http://localhost:${PORT}/admin`);
    console.log(`Database is being stored in: ${dbPath}`);
});

process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    server.close(() => {
        client.destroy(() => {
            console.log('WebTorrent client destroyed. Server shut down.');
            process.exit(0);
        });
    });
});
