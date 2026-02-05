const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('music-metadata');
const { db } = require('../config/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.mp3') {
            return cb(new Error('Only MP3 files are allowed'));
        }
        cb(null, true);
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Upload song
router.post('/upload', requireAuth, upload.single('song'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;

        // Extract metadata
        let metadata = {
            title: path.parse(req.file.originalname).name,
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 0
        };

        try {
            const musicMetadata = await parseFile(filePath);
            metadata.title = musicMetadata.common.title || metadata.title;
            metadata.artist = musicMetadata.common.artist || metadata.artist;
            metadata.album = musicMetadata.common.album || metadata.album;
            metadata.duration = Math.floor(musicMetadata.format.duration || 0);
        } catch (metaError) {
            console.warn('Could not extract metadata:', metaError.message);
        }

        // Save to database
        const result = db.prepare(`
      INSERT INTO songs (filename, title, artist, album, duration, file_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            req.file.originalname,
            metadata.title,
            metadata.artist,
            metadata.album,
            metadata.duration,
            filePath
        );

        const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(result.lastInsertRowid);

        res.json({
            success: true,
            song: song
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload song' });
    }
});

// Get all songs
router.get('/', (req, res) => {
    try {
        const songs = db.prepare('SELECT * FROM songs ORDER BY uploaded_at DESC').all();
        res.json({ songs });
    } catch (error) {
        console.error('Error fetching songs:', error);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

// Get single song
router.get('/:id', (req, res) => {
    try {
        const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }
        res.json({ song });
    } catch (error) {
        console.error('Error fetching song:', error);
        res.status(500).json({ error: 'Failed to fetch song' });
    }
});

// Delete song
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        // Delete file from filesystem
        if (fs.existsSync(song.file_path)) {
            fs.unlinkSync(song.file_path);
        }

        // Delete from database
        db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting song:', error);
        res.status(500).json({ error: 'Failed to delete song' });
    }
});

module.exports = router;
