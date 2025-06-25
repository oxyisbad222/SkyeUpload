const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

async function startServer() {
    const WebTorrent = (await import('webtorrent')).default;
    const fetch = (await import('node-fetch')).default;

    const app = express();
    const client = new WebTorrent();
    const PORT = process.env.PORT || 3000;
    const TMDB_API_KEY = process.env.TMDB_API_KEY;

    const requiredEnv = [
        'STORJ_ACCESS_KEY', 'STORJ_SECRET_KEY', 'STORJ_ENDPOINT', 'STORJ_BUCKET_NAME',
        'B2_ACCESS_KEY', 'B2_SECRET_KEY', 'B2_ENDPOINT', 'B2_BUCKET_NAME'
    ];
    const missingEnv = requiredEnv.filter(v => !process.env[v]);

    if (missingEnv.length > 0) {
        console.error('FATAL ERROR: Missing required environment variables:');
        missingEnv.forEach(v => console.error(`- ${v}`));
        console.error('Please set these secrets in your Fly.io dashboard by following INSTRUCTIONS.md');
        process.exit(1);
    }

    const {
        STORJ_ACCESS_KEY, STORJ_SECRET_KEY, STORJ_ENDPOINT, STORJ_BUCKET_NAME,
        B2_ACCESS_KEY, B2_SECRET_KEY, B2_ENDPOINT, B2_BUCKET_NAME
    } = process.env;
    
    let storjClient, b2Client;

    try {
        const s3ConfigStorj = {
            credentials: { accessKeyId: STORJ_ACCESS_KEY, secretAccessKey: STORJ_SECRET_KEY },
            endpoint: `https://${STORJ_ENDPOINT}`,
            region: 'us-east-1',
        };
        storjClient = new S3Client(s3ConfigStorj);

        const s3ConfigB2 = {
            credentials: { accessKeyId: B2_ACCESS_KEY, secretAccessKey: B2_SECRET_KEY },
            endpoint: `https://${B2_ENDPOINT}`,
            region: B2_ENDPOINT.split('.')[1],
        };
        b2Client = new S3Client(s3ConfigB2);
    } catch (error) {
        console.error('FATAL ERROR: Failed to initialize S3 clients. Check your endpoint and credential configuration.');
        console.error(error);
        process.exit(1);
    }
    
    let trackers = [];
    try {
        const trackerData = fs.readFileSync(path.join(__dirname, 'best.txt'), 'utf8');
        trackers = trackerData.split('\n').filter(t => t.trim() !== '');
    } catch (error) {
        trackers = ['udp://tracker.opentrackr.org:1337/announce'];
    }

    const allowedOrigins = ['https://skye-upload-admin.vercel.app', 'https://skye-upload.vercel.app'];
    const corsOptions = {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) callback(null, true);
            else callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        optionsSuccessStatus: 204
    };
    app.use(cors(corsOptions));
    
    const dbPath = path.join('/data', 'database.json');
    
    const readDb = () => {
        try {
            if (fs.existsSync(dbPath)) return JSON.parse(fs.readFileSync(dbPath));
            const defaultDb = { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [], storageUsage: { storj: 0, b2: 0 } };
            if (!fs.existsSync('/data')) fs.mkdirSync('/data', { recursive: true });
            fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2));
            return defaultDb;
        } catch (error) {
            console.error("DB Read Error:", error);
            return { mediaLibrary: { movies: [], tvShows: [] }, contentRequests: [], storageUsage: { storj: 0, b2: 0 } };
        }
    };
    
    const writeDb = (data) => {
        try { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }
        catch (error) { console.error("DB Write Error:", error); }
    };

    let { mediaLibrary, contentRequests, storageUsage } = readDb();
    
    const upload = multer({ storage: multer.memoryStorage() });

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    const updateStorageUsage = async () => {
        let storjSize = 0;
        let b2Size = 0;
        try {
            const storjObjects = await storjClient.send(new ListObjectsV2Command({ Bucket: STORJ_BUCKET_NAME }));
            if (storjObjects.Contents) storjSize = storjObjects.Contents.reduce((acc, item) => acc + item.Size, 0);

            const b2Objects = await b2Client.send(new ListObjectsV2Command({ Bucket: B2_BUCKET_NAME }));
            if (b2Objects.Contents) b2Size = b2Objects.Contents.reduce((acc, item) => acc + item.Size, 0);

            storageUsage = { storj: storjSize, b2: b2Size };
            writeDb({ mediaLibrary, contentRequests, storageUsage });
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
        if (!TMDB_API_KEY) return { poster_path: null, overview: "No metadata available.", release_date: "N/A" };
        const url = `https://api.themoviedb.org/3/search/${type === 'movie' ? 'movie' : 'tv'}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data.results?.[0] || null;
        } catch (error) {
            console.error("TMDB fetch error:", error);
            return null;
        }
    }

    const apiRouter = express.Router();

    apiRouter.post('/admin/upload', upload.single('mediafile'), async (req, res) => {
        const { title, type } = req.body;
        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

        const totalUsage = storageUsage.storj + storageUsage.b2;
        const useStorj = totalUsage < (25 * 1024 * 1024 * 1024);
        
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

            if (useStorj) storageUsage.storj += req.file.size;
            else storageUsage.b2 += req.file.size;
            
            const metadata = await fetchTmdbMetadata(title, type);
            addMediaToLibrary({
                id: Date.now(), title, type,
                poster_path: metadata?.poster_path, overview: metadata?.overview,
                release_date: metadata?.release_date || metadata?.first_air_date,
                streamType: 's3',
                storageDetails: { storageType, bucketName, fileKey }
            });

            res.status(201).json({ message: `File uploaded to ${storageType} successfully!` });
        } catch (error) {
            console.error(`Upload Error to ${storageType}:`, error);
            res.status(500).json({ message: 'Failed to upload file.' });
        }
    });
    
    apiRouter.get('/stream/:id', async (req, res) => {
        const mediaId = parseInt(req.params.id);
        const allMedia = [...mediaLibrary.movies, ...mediaLibrary.tvShows];
        const mediaItem = allMedia.find(m => m.id === mediaId);

        if (!mediaItem || mediaItem.streamType !== 's3') {
            return res.status(404).json({ message: 'Media not found or not streamable.' });
        }

        const { storageType, bucketName, fileKey } = mediaItem.storageDetails;
        const s3Client = storageType === 'storj' ? storjClient : b2Client;
        
        try {
            const command = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            res.redirect(url);
        } catch (error) {
            console.error("Error generating signed URL:", error);
            res.status(500).json({ message: "Could not generate streaming link." });
        }
    });

    apiRouter.get('/media', (req, res) => res.json(mediaLibrary));

    apiRouter.delete('/admin/media/:type/:id', async (req, res) => {
        const { type, id } = req.params;
        const numericId = parseInt(id);
        const library = type === 'movies' ? mediaLibrary.movies : mediaLibrary.tvShows;
        const itemIndex = library.findIndex(item => item.id === numericId);

        if (itemIndex === -1) return res.status(404).json({ message: 'Media not found' });
        
        const item = library[itemIndex];

        if (item.streamType === 's3') {
            const { storageType, bucketName, fileKey } = item.storageDetails;
            const s3Client = storageType === 'storj' ? storjClient : b2Client;
            try {
                await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: fileKey }));
            } catch (error) {
                console.error(`Failed to delete ${fileKey} from ${storageType}:`, error);
            }
        }

        library.splice(itemIndex, 1);
        writeDb({ mediaLibrary, contentRequests, storageUsage });
        await updateStorageUsage();
        res.status(200).json({ message: `Successfully deleted "${item.title}"` });
    });
    
    apiRouter.get('/admin/status', (req, res) => {
        res.json({
            status: 'online',
            uptime: `${Math.floor(process.uptime())}s`,
            storageUsage,
            movies_hosted: mediaLibrary.movies.length,
            shows_hosted: mediaLibrary.tvShows.length,
        });
    });

    apiRouter.get('/search', (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (!query) return res.json({ movies: [], tvShows: [] });
        const filteredMovies = mediaLibrary.movies.filter(movie => movie.title.toLowerCase().includes(query));
        const filteredTvShows = mediaLibrary.tvShows.filter(show => show.title.toLowerCase().includes(query));
        res.json({ movies: filteredMovies, tvShows: filteredTvShows });
    });

    apiRouter.get('/admin/requests', (req, res) => res.json(contentRequests));
    apiRouter.delete('/admin/requests/:id', (req, res) => {
        contentRequests = contentRequests.filter(r => r.id !== parseInt(req.params.id));
        writeDb({ mediaLibrary, contentRequests, storageUsage });
        res.status(200).json({ message: 'Request deleted.' });
    });
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
    apiRouter.post('/requests', (req, res) => {
        const { title, details } = req.body;
        if (!title) return res.status(400).json({ message: 'Title is required' });
        const newRequest = { id: Date.now(), title, details, status: 'pending', timestamp: new Date().toISOString() };
        contentRequests.push(newRequest);
        writeDb({ mediaLibrary, contentRequests, storageUsage });
        res.status(201).json({ message: 'Request submitted.', request: newRequest });
    });

    app.use('/api', apiRouter);

    setInterval(updateStorageUsage, 1000 * 60 * 60);

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`SkyeUpload server running on http://localhost:${PORT}`);
        updateStorageUsage();
    });
    
    process.on('SIGINT', () => server.close(() => process.exit(0)));
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
