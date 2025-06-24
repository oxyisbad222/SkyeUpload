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

// --- CORS Configuration ---
// Define the list of allowed origins from your error logs
const allowedOrigins = [
    'https://skye-upload-admin.vercel.app',
    'https://skye-upload.vercel.app' // Assuming this is your client's URL
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            callback(new Error(msg), false);
        }
    }
};

// Apply CORS middleware at the very top
app.use(cors(corsOptions));

// --- Persistent Storage Setup for Fly.io ---
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
        const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] };
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
    
    writeDb({ mediaLibrary, contentRequests });
    console.log('New media added and DB updated:', newMedia);
    return newMedia;
};

// --- API ROUTES ---
const apiRouter = express.Router();

// Main endpoint for adding new content
apiRouter.post('/admin/upload', upload.single('mediafile'), (req, res) => {
    const { title, type, genre, url, source_type } = req.body;
    if (!title || !type) return res.status(400).json({ message: 'Title and media type are required.' });
    if (source_type === 'file' && req.file) {
        try {
            const newMedia = addMediaToLibrary(title, type, genre, req.file.filename);
            return res.status(201).json({ message: 'File uploaded successfully!', media: newMedia });
        } catch (error) { return res.status(400).json({ message: error.message }); }
    } else if (source_type === 'magnet' && url) {
        console.log(`[WebTorrent] Received magnet link for: ${title}`);
        client.add(url, { path: uploadDir }, (torrent) => {
            console.log(`[WebTorrent] Started download for: ${torrent.name}`);
            const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv')) || torrent.files.reduce((a, b) => a.length > b.length ? a : b);
            console.log(`[WebTorrent] Main file identified: ${file.name}`);
            torrent.on('done', () => {
                console.log(`[WebTorrent] Download finished for ${file.name}.`);
                addMediaToLibrary(title, type, genre, file.name);
            });
            torrent.on('error', (err) => console.error(`[WebTorrent] Error:`, err));
        });
        return res.status(202).json({ message: `Download started for "${title}". It will be added on completion.` });
    } else {
        return res.status(400).json({ message: 'Invalid request.' });
    }
});

apiRouter.get('/media', (req, res) => res.json(mediaLibrary));
apiRouter.get('/admin/requests', (req, res) => res.json(contentRequests));
apiRouter.get('/admin/status', (req, res) => res.json({
    status: 'online', uptime: `${Math.floor(process.uptime())}s`, version: '1.0.0',
    requests_pending: contentRequests.length, torrents_active: client.torrents.length,
    download_speed: (client.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s'
}));
apiRouter.post('/requests', (req, res) => {
    const { title, details } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const newRequest = { id: Date.now(), title, details, status: 'pending', timestamp: new Date().toISOString() };
    contentRequests.push(newRequest);
    writeDb({ mediaLibrary, contentRequests });
    res.status(201).json({ message: 'Request submitted successfully!', request: newRequest });
});

// All API routes will be prefixed with /api
app.use('/api', apiRouter);

// Catch-all route for the client SPA
app.get(/^\/(?!admin).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Start Server & Graceful Shutdown
const server = app.listen(PORT, () => {
    console.log(`SkyeUpload server running on http://localhost:${PORT}`);
    console.log(`Database is being stored in: ${dbPath}`);
});

process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    server.close(() => client.destroy(() => {
        console.log('Server shut down.');
        process.exit(0);
    }));
});
