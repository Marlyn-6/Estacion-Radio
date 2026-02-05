const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// Get streaming status
router.get('/status', (req, res) => {
    try {
        const status = db.prepare(`
      SELECT * FROM stream_stats 
      ORDER BY recorded_at DESC 
      LIMIT 1
    `).get() || {
            is_live: 0,
            current_mode: 'autodj',
            listener_count: 0
        };

        let currentSong = null;
        if (status.current_song_id) {
            currentSong = db.prepare('SELECT * FROM songs WHERE id = ?').get(status.current_song_id);
        }

        res.json({
            status: {
                isLive: Boolean(status.is_live),
                mode: status.current_mode,
                currentSong: currentSong
            }
        });
    } catch (error) {
        console.error('Error fetching streaming status:', error);
        res.status(500).json({ error: 'Failed to fetch streaming status' });
    }
});

// Set streaming mode
router.post('/mode', requireAuth, (req, res) => {
    const { mode, isLive } = req.body;

    if (!mode || !['live', 'autodj'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode. Must be "live" or "autodj"' });
    }

    try {
        // Update or insert current status
        db.prepare(`
      INSERT INTO stream_stats (is_live, current_mode, listener_count)
      VALUES (?, ?, 0)
    `).run(isLive ? 1 : 0, mode);

        // Notify via Socket.IO (if available)
        if (req.app.locals.io) {
            req.app.locals.io.emit('streaming:mode', { mode, isLive });
        }

        res.json({ success: true, mode, isLive });
    } catch (error) {
        console.error('Error setting streaming mode:', error);
        res.status(500).json({ error: 'Failed to set streaming mode' });
    }
});

// Get listener statistics
router.get('/stats', (req, res) => {
    try {
        const stats = db.prepare(`
      SELECT * FROM stream_stats 
      ORDER BY recorded_at DESC 
      LIMIT 100
    `).all();

        const currentStats = stats[0] || { listener_count: 0 };

        res.json({
            current: {
                listenerCount: currentStats.listener_count || 0,
                isLive: Boolean(currentStats.is_live),
                mode: currentStats.current_mode || 'autodj'
            },
            history: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Update current song (called by streaming service)
router.post('/current-song', requireAuth, (req, res) => {
    const { songId } = req.body;

    try {
        db.prepare(`
      INSERT INTO stream_stats (current_song_id, is_live, current_mode, listener_count)
      SELECT ?, 
             (SELECT is_live FROM stream_stats ORDER BY recorded_at DESC LIMIT 1),
             (SELECT current_mode FROM stream_stats ORDER BY recorded_at DESC LIMIT 1),
             0
    `).run(songId || null);

        // Notify listeners via Socket.IO
        if (req.app.locals.io && songId) {
            const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
            req.app.locals.io.emit('song:update', { song });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating current song:', error);
        res.status(500).json({ error: 'Failed to update current song' });
    }
});

module.exports = router;
