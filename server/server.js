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

// --- Persistent Storage Setup ---
// Use an environment variable for the data directory, defaulting to the current directory
const dataDir = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const dbPath = path.join(dataDir, 'database.json');
const uploadDir = path.join(dataDir, 'uploads');

console.log(`Using data directory: ${dataDir}`);


const readDb = () => {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath);
            return JSON.parse(data);
        }
        // If DB doesn't exist, create it with a default structure
        const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] };
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

// Serve static files
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
    
    writeDb({ mediaLibrary, contentRequests }); // Persist changes
    console.log('New media added and DB updated:', newMedia);
    return newMedia;
};

// --- API ROUTES ---

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

app.get('/api/media', (req, res) => {
    res.json(mediaLibrary);
});

app.post('/api/requests', (req, res) => {
    const { title, details } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const newRequest = { id: Date.now(), title, details, status: 'pending', timestamp: new Date().toISOString() };
    contentRequests.push(newRequest);
    writeDb({ mediaLibrary, contentRequests }); // Persist changes
    console.log('New content request received and DB updated:', newRequest);
    res.status(201).json({ message: 'Request submitted successfully!', request: newRequest });
});

app.get('/api/admin/requests', (req, res) => {
    res.json(contentRequests);
});

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
