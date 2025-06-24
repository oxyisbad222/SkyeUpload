// Import required modules
const express = require('express');
const path =require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// The server logic is wrapped in an async function
// to allow for the dynamic, top-level import of WebTorrent and node-fetch.
async function startServer() {
    // Dynamically import the 'webtorrent' package which is an ES Module.
    const WebTorrent = (await import('webtorrent')).default;
    // Dynamically import 'node-fetch'
    const fetch = (await import('node-fetch')).default;

    // Initialize the Express app and WebTorrent client
    const app = express();
    const client = new WebTorrent();
    const PORT = process.env.PORT || 3000;
    const TMDB_API_KEY = process.env.TMDB_API_KEY;

    // --- Public Trackers List ---
    const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
    ];

    // --- CORS Configuration ---
    const allowedOrigins = ['https://skye-upload-admin.vercel.app', 'https://skye-upload.vercel.app'];
    const corsOptions = {
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    };
    app.use(cors(corsOptions));

    // --- Persistent Storage Setup ---
    const dataDir = process.env.FLYSK_DATA_DIR || '/data';
    const dbPath = path.join(dataDir, 'database.json');
    const uploadDir = path.join(dataDir, 'uploads');
    console.log(`Using data directory: ${dataDir}`);

    // --- Database Functions ---
    const readDb = () => {
        try {
            if (fs.existsSync(dbPath)) return JSON.parse(fs.readFileSync(dbPath));
            const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] };
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2));
            return defaultDb;
        } catch (error) { console.error("DB Read Error:", error); return { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [] }; }
    };
    const writeDb = (data) => {
        try { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
        catch (error) { console.error("DB Write Error:", error); }
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

    // --- Middleware & Helpers ---
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use('/uploads', express.static(uploadDir));
    const addMediaToLibrary = (mediaItem) => {
        const library = mediaItem.type === 'movie' ? mediaLibrary.movies : mediaLibrary.tvShows;
        if (library.some(item => item.title.toLowerCase() === mediaItem.title.toLowerCase())) {
             console.log(`Duplicate found for "${mediaItem.title}". Skipping.`);
             return;
        }
        library.push(mediaItem);
        writeDb({ mediaLibrary, contentRequests });
        console.log('New media added:', mediaItem.title);
    };

    // --- TMDB Helper ---
    async function fetchTmdbMetadata(title, type) {
        if (!TMDB_API_KEY) {
            return { poster_path: null, overview: "No metadata available.", release_date: "N/A" };
        }
        const searchType = type === 'movie' ? 'movie' : 'tv';
        const url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.results && data.results.length > 0) return data.results[0];
        } catch (error) { console.error("TMDB fetch error:", error); }
        return null;
    }

    // --- Direct Download Helper ---
    const downloadFromLink = async (link, title, type) => {
        try {
            console.log(`[Direct DL] Starting download for "${title}" from ${link}`);
            const response = await fetch(link);
            if (!response.ok) {
                throw new Error(`Unexpected response ${response.statusText}`);
            }
            const fileName = `${uuidv4()}.mp4`;
            const filePath = path.join(uploadDir, fileName);
            const dest = fs.createWriteStream(filePath);
            response.body.pipe(dest);

            dest.on('finish', async () => {
                console.log(`[Direct DL] Finished downloading "${title}"`);
                const metadata = await fetchTmdbMetadata(title, type);
                addMediaToLibrary({
                    id: Date.now(), title, type, genre: "Direct Download",
                    poster_path: metadata?.poster_path, overview: metadata?.overview,
                    release_date: metadata?.release_date || metadata?.first_air_date,
                    filePath: `/uploads/${fileName}`, streamType: 'file'
                });
            });
        } catch (error) {
            console.error(`[Direct DL] Error downloading "${title}":`, error.message);
        }
    };


    // --- API Router ---
    const apiRouter = express.Router();

    // UPLOAD MEDIA
    apiRouter.post('/admin/upload', upload.single('mediafile'), async (req, res) => {
        const { title, type, genre, url, source_type, batch_links } = req.body;
        
        // --- BATCH LINK Processing ---
        if (source_type === 'batch-link') {
            if (!batch_links) return res.status(400).json({ message: 'No links provided for batch upload.' });
            
            const links = batch_links.split('\n').filter(link => link.trim() !== '');
            console.log(`[Batch] Received ${links.length} links for processing.`);

            for (const link of links) {
                let guessedTitle = 'Unknown Media';
                try {
                     guessedTitle = path.basename(new URL(link).pathname).replace(/[\._]/g, ' ').replace(/\.mp4/i, '');
                } catch {}
                downloadFromLink(link, guessedTitle, 'movie');
            }
            return res.status(202).json({ message: `${links.length} links are being processed in the background.` });
        }
        
        // --- Single Upload Logic ---
        if (!title || !type) return res.status(400).json({ message: 'Title and type are required.' });
        const metadata = await fetchTmdbMetadata(title, type);

        if (source_type === 'file' && req.file) {
            addMediaToLibrary({
                id: Date.now(), title, type, genre: genre || "Uncategorized",
                poster_path: metadata?.poster_path, overview: metadata?.overview,
                release_date: metadata?.release_date || metadata?.first_air_date,
                filePath: `/uploads/${req.file.filename}`, streamType: 'file'
            });
            return res.status(201).json({ message: 'File uploaded successfully!'});
        } else if (source_type === 'magnet' && url) {
            const torrentOptions = { path: uploadDir, announce: trackers };
            const torrent = client.add(url, torrentOptions);
            torrent.on('ready', () => {
                const file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
                const fileIndex = torrent.files.indexOf(file);
                addMediaToLibrary({
                    id: Date.now(), title, type, genre: genre || "Uncategorized",
                    poster_path: metadata?.poster_path, overview: metadata?.overview,
                    release_date: metadata?.release_date || metadata?.first_air_date,
                    filePath: `/api/stream/${torrent.infoHash}/${fileIndex}`, streamType: 'torrent',
                    infoHash: torrent.infoHash, fileIndex: fileIndex, addedAt: Date.now()
                });
            });
            return res.status(202).json({ message: `"${title}" is processing and will be available.` });
        } else {
            return res.status(400).json({ message: 'Invalid request.' });
        }
    });

    // STREAM TORRENT
    apiRouter.get('/stream/:infoHash/:fileIndex', (req, res) => {
        const torrent = client.get(req.params.infoHash);
        if (!torrent || !torrent.ready) return res.status(404).send('Torrent not ready for streaming.');
        const file = torrent.files[parseInt(req.params.fileIndex, 10)];
        if (!file) return res.status(404).send('File not found in torrent.');
        
        console.log(`[Stream] Streaming request for ${file.name}`);
        const range = req.headers.range;
        const fileSize = file.length;
        const head = { 'Content-Length': fileSize, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
        
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            head['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
            head['Content-Length'] = (end - start) + 1;
            res.writeHead(206, head);
            file.createReadStream({ start, end }).pipe(res);
        } else {
            res.writeHead(200, head);
            file.createReadStream().pipe(res);
        }
    });
    
    // GET ALL MEDIA
    apiRouter.get('/media', (req, res) => res.json(mediaLibrary));

    // SEARCH MEDIA
    apiRouter.get('/search', (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (!query) {
            return res.json({ movies: [], tvShows: [] });
        }
        const filteredMovies = mediaLibrary.movies.filter(movie => movie.title.toLowerCase().includes(query));
        const filteredTvShows = mediaLibrary.tvShows.filter(show => show.title.toLowerCase().includes(query));
        res.json({ movies: filteredMovies, tvShows: filteredTvShows });
    });

    // MANAGE REQUESTS
    apiRouter.get('/admin/requests', (req, res) => res.json(contentRequests));
    apiRouter.delete('/admin/requests/:id', (req, res) => {
        contentRequests = contentRequests.filter(r => r.id !== parseInt(req.params.id));
        writeDb({ mediaLibrary, contentRequests });
        res.status(200).json({ message: 'Request deleted.' });
    });
    apiRouter.put('/admin/requests/:id', (req, res) => {
        const request = contentRequests.find(r => r.id === parseInt(req.params.id));
        if (request) {
            request.status = request.status === 'pending' ? 'fulfilled' : 'pending';
            writeDb({ mediaLibrary, contentRequests });
            res.status(200).json(request);
        } else {
            res.status(404).json({ message: 'Request not found.' });
        }
    });
    apiRouter.post('/requests', (req, res) => {
        const { title, details } = req.body;
        if (!title) return res.status(400).json({ message: 'Title is required' });
        const newRequest = { id: Date.now(), title, details, status: 'pending', timestamp: new Date().toISOString() };
        contentRequests.push(newRequest);
        writeDb({ mediaLibrary, contentRequests });
        res.status(201).json({ message: 'Request submitted.', request: newRequest });
    });

    // GET SERVER STATUS
    apiRouter.get('/admin/status', (req, res) => {
        const torrents = client.torrents.map(t => ({
            name: t.name, infoHash: t.infoHash, progress: (t.progress * 100).toFixed(2),
            downloadSpeed: (t.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s', peers: t.numPeers
        }));
        res.json({
            status: 'online', uptime: `${Math.floor(process.uptime())}s`, version: '1.0.0',
            requests_pending: contentRequests.length,
            movies_hosted: mediaLibrary.movies.length,
            shows_hosted: mediaLibrary.tvShows.length,
            torrents_active: client.torrents.length,
            total_download_speed: (client.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s',
            torrents
        });
    });
    
    app.use('/api', apiRouter);

    // --- Resource Management ---
    setInterval(() => {
        const now = Date.now();
        const INACTIVE_TIME = 1000 * 60 * 30;
        client.torrents.forEach(torrent => {
            const mediaItem = mediaLibrary.movies.find(m => m.infoHash === torrent.infoHash) || mediaLibrary.tvShows.find(t => t.infoHash === torrent.infoHash);
            if (torrent.done && mediaItem && (now - mediaItem.addedAt > INACTIVE_TIME)) {
                 client.remove(torrent.infoHash);
            }
        });
    }, 1000 * 60 * 5);

    // --- Start Server ---
    const server = app.listen(PORT, () => console.log(`SkyeUpload server running on http://localhost:${PORT}`));
    process.on('SIGINT', () => server.close(() => client.destroy(() => process.exit(0))));
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
