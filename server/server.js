// Import required modules
const express = require('express');
const path =require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

// The server logic is wrapped in an async function
// to allow for the dynamic, top-level import of WebTorrent.
async function startServer() {
    // Dynamically import the 'webtorrent' package which is an ES Module.
    const WebTorrent = (await import('webtorrent')).default;

    // Initialize the Express app and WebTorrent client
    const app = express();
    const client = new WebTorrent();
    const PORT = process.env.PORT || 3000;

    // --- CORS Configuration ---
    const allowedOrigins = [
        'https://skye-upload-admin.vercel.app',
        'https://skye-upload.vercel.app' // Assuming this is your client URL
    ];
    const corsOptions = {
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    };
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
                return JSON.parse(fs.readFileSync(dbPath));
            }
            const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] };
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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
    app.use('/uploads', express.static(uploadDir));

    // --- Helper ---
    const addMediaToLibrary = (mediaItem) => {
        if (mediaItem.type === 'movie') {
            mediaLibrary.movies.push(mediaItem);
        } else if (mediaItem.type === 'tvShow') {
            mediaLibrary.tvShows.push(mediaItem);
        } else {
            throw new Error('Invalid media type');
        }
        writeDb({ mediaLibrary, contentRequests });
        console.log('New media added:', mediaItem);
        return mediaItem;
    };


    // --- API Router ---
    const apiRouter = express.Router();

    apiRouter.post('/admin/upload', upload.single('mediafile'), (req, res) => {
        const { title, type, genre, url, source_type } = req.body;
        if (!title || !type) return res.status(400).json({ message: 'Title and type are required.' });
        
        // --- File Upload Logic ---
        if (source_type === 'file' && req.file) {
            try {
                const newMedia = {
                    id: Date.now(), title, type, genre: genre || "Uncategorized",
                    thumbnail: 'https://placehold.co/400x600/3a3a3a/ffffff?text=' + encodeURIComponent(title),
                    filePath: `/uploads/${req.file.filename}`, // Path to the static file
                    streamType: 'file'
                };
                addMediaToLibrary(newMedia);
                return res.status(201).json({ message: 'File uploaded successfully!', media: newMedia });
            } catch (error) { return res.status(400).json({ message: error.message }); }
        
        // --- Magnet Link Logic ---
        } else if (source_type === 'magnet' && url) {
            // Add the torrent to the client
            client.add(url, { path: uploadDir }, (torrent) => {
                console.log(`[WebTorrent] Metadata received for: ${torrent.name}`);
                
                // Find the largest file in the torrent (usually the video)
                const file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
                const fileIndex = torrent.files.indexOf(file);

                console.log(`[WebTorrent] Identified main file: ${file.name} at index ${fileIndex}`);

                // Instantly add the media to the library for streaming
                const newMedia = {
                    id: Date.now(), title, type, genre: genre || "Uncategorized",
                    thumbnail: 'https://placehold.co/400x600/3a3a3a/ffffff?text=' + encodeURIComponent(title),
                    filePath: `/api/stream/${torrent.infoHash}/${fileIndex}`, // Special streaming path
                    streamType: 'torrent',
                    infoHash: torrent.infoHash,
                    fileIndex: fileIndex
                };
                addMediaToLibrary(newMedia);

                torrent.on('done', () => {
                    console.log(`[WebTorrent] Download finished for: ${file.name}.`);
                    // Optionally update the DB entry to note that it's fully downloaded
                });
                torrent.on('error', (err) => console.error(`[WebTorrent] Error:`, err));
            });
            return res.status(202).json({ message: `"${title}" is being processed and will be available to stream shortly.` });
        } else {
            return res.status(400).json({ message: 'Invalid request.' });
        }
    });

    // --- New Torrent Streaming Endpoint ---
    apiRouter.get('/stream/:infoHash/:fileIndex', (req, res) => {
        const { infoHash, fileIndex } = req.params;
        const torrent = client.get(infoHash);

        if (!torrent) {
            return res.status(404).send('Torrent not found or not ready.');
        }

        const file = torrent.files[parseInt(fileIndex, 10)];
        if (!file) {
            return res.status(404).send('File not found in torrent.');
        }

        console.log(`[Stream] Streaming ${file.name} for infoHash ${infoHash}`);

        const range = req.headers.range;
        const fileSize = file.length;

        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes'
        };

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            head['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
            head['Content-Length'] = chunksize;

            res.writeHead(206, head); // 206 Partial Content
            const stream = file.createReadStream({ start, end });
            stream.pipe(res);
        } else {
            res.writeHead(200, head); // 200 OK
            const stream = file.createReadStream();
            stream.pipe(res);
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
        res.status(201).json({ message: 'Request submitted.', request: newRequest });
    });
    
    app.use('/api', apiRouter);

    // --- Start Server ---
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
}

// Start the asynchronous server function
startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
