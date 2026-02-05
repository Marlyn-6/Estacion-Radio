const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// Create playlist
router.post('/', requireAuth, (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Playlist name is required' });
    }

    try {
        const result = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
        const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid);
        res.json({ success: true, playlist });
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

// Get all playlists
router.get('/', (req, res) => {
    try {
        const playlists = db.prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();

        // Get song count for each playlist
        const playlistsWithDetails = playlists.map(playlist => {
            const songCount = db.prepare('SELECT COUNT(*) as count FROM playlist_songs WHERE playlist_id = ?')
                .get(playlist.id);

            return {
                ...playlist,
                songCount: songCount.count
            };
        });

        res.json({ playlists: playlistsWithDetails });
    } catch (error) {
        console.error('Error fetching playlists:', error);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// Get single playlist with songs
router.get('/:id', (req, res) => {
    try {
        const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const songs = db.prepare(`
      SELECT s.*, ps.position 
      FROM songs s
      JOIN playlist_songs ps ON s.id = ps.song_id
      WHERE ps.playlist_id = ?
      ORDER BY ps.position ASC
    `).all(req.params.id);

        res.json({ playlist: { ...playlist, songs } });
    } catch (error) {
        console.error('Error fetching playlist:', error);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

// Update playlist
router.put('/:id', requireAuth, (req, res) => {
    const { name, isActive } = req.body;

    try {
        const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        // If setting this playlist as active, deactivate all others
        if (isActive) {
            db.prepare('UPDATE playlists SET is_active = 0').run();
        }

        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }

        if (isActive !== undefined) {
            updates.push('is_active = ?');
            values.push(isActive ? 1 : 0);
        }

        if (updates.length > 0) {
            values.push(req.params.id);
            db.prepare(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        const updatedPlaylist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
        res.json({ success: true, playlist: updatedPlaylist });
    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({ error: 'Failed to update playlist' });
    }
});

// Delete playlist
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

// Add song to playlist
router.post('/:id/songs', requireAuth, (req, res) => {
    const { songId } = req.body;

    try {
        const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
        const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        // Get next position
        const maxPosition = db.prepare('SELECT MAX(position) as max FROM playlist_songs WHERE playlist_id = ?')
            .get(req.params.id);
        const position = (maxPosition.max || 0) + 1;

        db.prepare('INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)')
            .run(req.params.id, songId, position);

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding song to playlist:', error);
        res.status(500).json({ error: 'Failed to add song to playlist' });
    }
});

// Remove song from playlist
router.delete('/:id/songs/:songId', requireAuth, (req, res) => {
    try {
        db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?')
            .run(req.params.id, req.params.songId);

        // Reorder remaining songs
        const songs = db.prepare('SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position')
            .all(req.params.id);

        songs.forEach((song, index) => {
            db.prepare('UPDATE playlist_songs SET position = ? WHERE id = ?')
                .run(index + 1, song.id);
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing song from playlist:', error);
        res.status(500).json({ error: 'Failed to remove song from playlist' });
    }
});

// Reorder songs in playlist
router.put('/:id/songs/reorder', requireAuth, (req, res) => {
    const { songIds } = req.body; // Array of song IDs in new order

    if (!Array.isArray(songIds)) {
        return res.status(400).json({ error: 'songIds must be an array' });
    }

    try {
        songIds.forEach((songId, index) => {
            db.prepare('UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?')
                .run(index + 1, req.params.id, songId);
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering songs:', error);
        res.status(500).json({ error: 'Failed to reorder songs' });
    }
});

module.exports = router;
