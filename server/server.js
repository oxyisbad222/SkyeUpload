const express = require('express');
const path = require('path');
// const cors = require('cors'); // No longer needed
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

async function startServer() {
    // Webtorrent and node-fetch are now dependencies in package.json
    const WebTorrent = (await import('webtorrent')).default;
    const fetch = (await import('node-fetch')).default;

    const app = express();
    const client = new WebTorrent();
    const PORT = process.env.PORT || 3000;
    const TMDB_API_KEY = process.env.TMDB_API_KEY;

    // --- Environment Variable Check ---
    const requiredEnv = [
        'STORJ_ACCESS_KEY', 'STORJ_SECRET_KEY', 'STORJ_ENDPOINT', 'STORJ_BUCKET_NAME',
        'B2_ACCESS_KEY', 'B2_SECRET_KEY', 'B2_ENDPOINT', 'B2_BUCKET_NAME'
    ];
    const missingEnv = requiredEnv.filter(v => !process.env[v]);

    if (missingEnv.length > 0) {
        console.error('FATAL ERROR: Missing required environment variables:');
        missingEnv.forEach(v => console.error(`- ${v}`));
        console.error('Please set these secrets in your Fly.io dashboard or a local .env file.');
        process.exit(1);
    }

    const {
        STORJ_ACCESS_KEY, STORJ_SECRET_KEY, STORJ_ENDPOINT, STORJ_BUCKET_NAME,
        B2_ACCESS_KEY, B2_SECRET_KEY, B2_ENDPOINT, B2_BUCKET_NAME
    } = process.env;
    
    let storjClient, b2Client;

    // --- S3 Client Initialization ---
    try {
        storjClient = new S3Client({
            credentials: { accessKeyId: STORJ_ACCESS_KEY, secretAccessKey: STORJ_SECRET_KEY },
            endpoint: `https://${STORJ_ENDPOINT}`,
            region: 'us-east-1',
        });

        b2Client = new S3Client({
            credentials: { accessKeyId: B2_ACCESS_KEY, secretAccessKey: B2_SECRET_KEY },
            endpoint: `https://${B2_ENDPOINT}`,
            region: B2_ENDPOINT.split('.')[1], // Region is derived from the endpoint for B2
        });
    } catch (error) {
        console.error('FATAL ERROR: Failed to initialize S3 clients. Check your endpoint and credential configuration.');
        console.error(error);
        process.exit(1);
    }
    
    // --- Torrent Trackers (No change) ---
    let trackers = [];
    try {
        const trackerData = fs.readFileSync(path.join(__dirname, 'best.txt'), 'utf8');
        trackers = trackerData.split('\n').filter(t => t.trim() !== '');
    } catch (error) {
        console.warn("Warning: best.txt not found. Using default tracker.");
        trackers = ['udp://tracker.opentrackr.org:1337/announce'];
    }

    // --- CORS is REMOVED ---
    // No longer needed as we serve everything from the same origin.
    // app.use(cors(corsOptions));
    
    // --- Database Setup ---
    const dbPath = path.join('/data', 'database.json'); // Fly.io persistent volume
    
    const readDb = () => {
        try {
            if (fs.existsSync(dbPath)) {
                return JSON.parse(fs.readFileSync(dbPath));
            }
            // Create default DB structure if it doesn't exist
            const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [], storageUsage: { storj: 0, b2: 0 } };
            if (!fs.existsSync('/data')) {
                fs.mkdirSync('/data', { recursive: true });
            }
            fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2));
            return defaultDb;
        } catch (error) {
            console.error("Fatal DB Read Error:", error);
            // On fatal read error, exit to prevent data corruption.
            process.exit(1);
        }
    };
    
    const writeDb = (data) => {
        try {
            fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error("DB Write Error:", error);
        }
    };

    let { mediaLibrary, contentRequests, storageUsage } = readDb();
    
    const upload = multer({ storage: multer.memoryStorage() });

    // --- Middleware ---
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // --- Static File Serving ---
    // Serve the admin panel from the /admin route
    app.use('/admin', express.static(path.join(__dirname, '../admin')));

    // Serve the client app from the root route
    app.use(express.static(path.join(__dirname, '../client')));


    // --- Core Functions ---
    const updateStorageUsage = async () => {
        let storjSize = 0;
        let b2Size = 0;
        try {
            const storjObjects = await storjClient.send(new ListObjectsV2Command({ Bucket: STORJ_BUCKET_NAME }));
            if (storjObjects.Contents) {
                storjSize = storjObjects.Contents.reduce((acc, item) => acc + item.Size, 0);
            }

            const b2Objects = await b2Client.send(new ListObjectsV2Command({ Bucket: B2_BUCKET_NAME }));
            if (b2Objects.Contents) {
                b2Size = b2Objects.Contents.reduce((acc, item) => acc + item.Size, 0);
            }

            storageUsage = { storj: storjSize, b2: b2Size };
            writeDb({ mediaLibrary, contentRequests, storageUsage });
            console.log('Storage usage updated:', storageUsage);
        } catch (error) {
            console.error("Could not update storage usage:", error);
        }
    };
    
    const addMediaToLibrary = (mediaItem) => {
        const library = mediaItem.type === 'movie' ? mediaLibrary.movies : mediaLibrary.tvShows;
        library.push(mediaItem);
        writeDb({ mediaLibrary, contentRequests, storageUsage });
    };

    async function fetchTmdbMetadata(title, type) {
        if (!TMDB_API_KEY) {
            console.warn("TMDB_API_KEY is not set. Metadata will be unavailable.");
            return { poster_path: null, overview: "No metadata available.", release_date: "N/A" };
        }
        const searchType = type === 'tvShow' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data.results?.[0] || null;
        } catch (error) {
            console.error("TMDB fetch error:", error);
            return null;
        }
    }

    // --- API Router ---
    const apiRouter = express.Router();

    // [ADMIN] Upload media file
    apiRouter.post('/admin/upload', upload.single('mediafile'), async (req, res) => {
        const { title, type } = req.body;
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        // Determine which storage to use (Storj is primary, B2 is overflow)
        const totalUsage = storageUsage.storj + storageUsage.b2;
        const useStorj = storageUsage.storj < (25 * 1024 * 1024 * 1024); // 25 GB limit for Storj
        
        const s3Client = useStorj ? storjClient : b2Client;
        const bucketName = useStorj ? STORJ_BUCKET_NAME : B2_BUCKET_NAME;
        const storageType = useStorj ? 'storj' : 'b2';
        const fileKey = `${uuidv4()}-${req.file.originalname}`;

        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            }));

            // Update storage usage in the database
            if (useStorj) storageUsage.storj += req.file.size;
            else storageUsage.b2 += req.file.size;
            
            const metadata = await fetchTmdbMetadata(title, type);
            addMediaToLibrary({
                id: Date.now(),
                title,
                type, // 'movie' or 'tvShow'
                poster_path: metadata?.poster_path,
                overview: metadata?.overview,
                release_date: metadata?.release_date || metadata?.first_air_date,
                streamType: 's3',
                storageDetails: { storageType, bucketName, fileKey }
            });

            writeDb({ mediaLibrary, contentRequests, storageUsage });
            res.status(201).json({ message: `File uploaded to ${storageType} successfully!` });
        } catch (error) {
            console.error(`Upload Error to ${storageType}:`, error);
            res.status(500).json({ message: 'Failed to upload file.' });
        }
    });
    
    // [CLIENT] Get a streamable link for a media item
    apiRouter.get('/stream/:id', async (req, res) => {
        const mediaId = parseInt(req.params.id);
        const allMedia = [...mediaLibrary.movies, ...mediaLibrary.tvShows];
        const mediaItem = allMedia.find(m => m.id === mediaId);

        if (!mediaItem || mediaItem.streamType !== 's3') {
            return res.status(404).json({ message: 'Media not found or not a streamable S3 file.' });
        }

        const { storageType, bucketName, fileKey } = mediaItem.storageDetails;
        const s3Client = storageType === 'storj' ? storjClient : b2Client;
        
        try {
            // Generate a temporary signed URL for the client to stream from directly
            const command = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL is valid for 1 hour
            res.redirect(url);
        } catch (error) {
            console.error("Error generating signed URL:", error);
            res.status(500).json({ message: "Could not generate streaming link." });
        }
    });

    // [CLIENT] Get all media
    apiRouter.get('/media', (req, res) => res.json(mediaLibrary));

    // [ADMIN] Delete a media item
    apiRouter.delete('/admin/media/:type/:id', async (req, res) => {
        const { type, id } = req.params; // type is 'movies' or 'tvShows'
        const numericId = parseInt(id);
        const library = type === 'movies' ? mediaLibrary.movies : mediaLibrary.tvShows;
        const itemIndex = library.findIndex(item => item.id === numericId);

        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Media not found' });
        }
        
        const item = library[itemIndex];

        // If the file is on S3, delete it from the bucket
        if (item.streamType === 's3' && item.storageDetails) {
            const { storageType, bucketName, fileKey } = item.storageDetails;
            const s3Client = storageType === 'storj' ? storjClient : b2Client;
            try {
                await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: fileKey }));
                console.log(`Successfully deleted ${fileKey} from ${storageType}.`);
            } catch (error) {
                // Log the error but continue, so the item is still removed from the DB
                console.error(`Failed to delete ${fileKey} from ${storageType}:`, error);
            }
        }

        // Remove from DB and save
        library.splice(itemIndex, 1);
        writeDb({ mediaLibrary, contentRequests, storageUsage });
        
        // Trigger a storage usage update after deletion
        await updateStorageUsage();
        
        res.status(200).json({ message: `Successfully deleted "${item.title}"` });
    });
    
    // [ADMIN] Get server status
    apiRouter.get('/admin/status', (req, res) => {
        res.json({
            status: 'online',
            uptime: `${Math.floor(process.uptime())}s`,
            storageUsage,
            movies_hosted: mediaLibrary.movies.length,
            shows_hosted: mediaLibrary.tvShows.length,
        });
    });

    // [CLIENT] Search media library
    apiRouter.get('/search', (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (!query) {
            return res.json({ movies: [], tvShows: [] });
        }
        const filteredMovies = mediaLibrary.movies.filter(movie => movie.title.toLowerCase().includes(query));
        const filteredTvShows = mediaLibrary.tvShows.filter(show => show.title.toLowerCase().includes(query));
        res.json({ movies: filteredMovies, tvShows: filteredTvShows });
    });

    // [ADMIN] Get all content requests
    apiRouter.get('/admin/requests', (req, res) => res.json(contentRequests));
    
    // [ADMIN] Delete a content request
    apiRouter.delete('/admin/requests/:id', (req, res) => {
        contentRequests = contentRequests.filter(r => r.id !== parseInt(req.params.id));
        writeDb({ mediaLibrary, contentRequests, storageUsage });
        res.status(200).json({ message: 'Request deleted.' });
    });

    // [ADMIN] Update a content request's status
    apiRouter.put('/admin/requests/:id', (req, res) => {
        const request = contentRequests.find(r => r.id === parseInt(req.params.id));
        if (request) {
            request.status = request.status === 'pending' ? 'fulfilled' : 'pending';
            writeDb({ mediaLibrary, contentRequests, storageUsage });
            res.status(200).json(request);
        } else {
            res.status(404).json({ message: 'Request not found.' });
        }
    });

    // [CLIENT] Submit a new content request
    apiRouter.post('/requests', (req, res) => {
        const { title, details } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ message: 'Title is required' });
        }
        const newRequest = {
            id: Date.now(),
            title,
            details,
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        contentRequests.push(newRequest);
        writeDb({ mediaLibrary, contentRequests, storageUsage });
        res.status(201).json({ message: 'Request submitted.', request: newRequest });
    });

    // Mount the API router
    app.use('/api', apiRouter);

    // --- Fallback for SPA (Single Page Application) ---
    // This ensures that if you refresh a page like /#search, the server still sends index.html
    app.get('*', (req, res) => {
        // If the request is for an admin sub-path, send the admin index. Otherwise, send the client index.
        if (req.originalUrl.startsWith('/admin')) {
             res.sendFile(path.join(__dirname, '../admin/index.html'));
        } else {
             res.sendFile(path.join(__dirname, '../client/index.html'));
        }
    });

    // --- Server Start ---
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`SkyeUpload server running on http://0.0.0.0:${PORT}`);
        // Initial update of storage usage on start
        updateStorageUsage();
    });
    
    // Update storage usage every hour
    setInterval(updateStorageUsage, 1000 * 60 * 60);
    
    process.on('SIGINT', () => {
        console.log("Shutting down server...");
        server.close(() => {
            process.exit(0);
        });
    });
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
