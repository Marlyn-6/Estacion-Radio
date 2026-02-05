const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

class StreamingService {
    constructor(io) {
        this.io = io;
        this.mode = 'autodj'; // 'live' or 'autodj'
        this.isLive = false;
        this.currentPlaylistId = null;
        this.currentSongIndex = 0;
        this.audioBuffer = [];
    }

    /**
     * Handle incoming live audio from admin
     */
    handleLiveAudio(audioData) {
        if (this.isLive && this.mode === 'live') {
            // Broadcast audio to all connected listeners
            this.io.emit('audio:stream', audioData);
        }
    }

    /**
     * Start live broadcast
     */
    startLiveBroadcast() {
        this.mode = 'live';
        this.isLive = true;

        // Update database
        db.prepare(`
      INSERT INTO stream_stats (is_live, current_mode, listener_count)
      VALUES (1, 'live', 0)
    `).run();

        console.log('🔴 Live broadcast started');
    }

    /**
     * Stop live broadcast
     */
    stopLiveBroadcast() {
        this.isLive = false;

        // Switch back to AutoDJ if a playlist is set
        if (this.currentPlaylistId) {
            this.mode = 'autodj';
        }

        // Update database
        db.prepare(`
      INSERT INTO stream_stats (is_live, current_mode, listener_count)
      VALUES (0, ?, 0)
    `).run(this.mode);

        console.log('⏹️  Live broadcast stopped');
    }

    /**
     * Start AutoDJ with specified playlist
     */
    async startAutoDJ(playlistId) {
        this.currentPlaylistId = playlistId;
        this.mode = 'autodj';
        this.isLive = false;
        this.currentSongIndex = 0;

        // Update database
        db.prepare(`
      INSERT INTO stream_stats (is_live, current_mode, listener_count)
      VALUES (0, 'autodj', 0)
    `).run();

        // Set playlist as active
        db.prepare('UPDATE playlists SET is_active = 0').run();
        db.prepare('UPDATE playlists SET is_active = 1 WHERE id = ?').run(playlistId);

        console.log(`🎵 AutoDJ started with playlist ${playlistId}`);

        // Start playing first song
        this.playNextSong();
    }

    /**
     * Stop AutoDJ
     */
    stopAutoDJ() {
        this.currentPlaylistId = null;
        this.mode = 'autodj';
        this.currentSongIndex = 0;

        console.log('⏹️  AutoDJ stopped');
    }

    /**
     * Play next song in playlist
     */
    playNextSong() {
        if (!this.currentPlaylistId || this.mode !== 'autodj') {
            return;
        }

        try {
            // Get songs from playlist
            const songs = db.prepare(`
        SELECT s.* 
        FROM songs s
        JOIN playlist_songs ps ON s.id = ps.song_id
        WHERE ps.playlist_id = ?
        ORDER BY ps.position ASC
      `).all(this.currentPlaylistId);

            if (songs.length === 0) {
                console.log('No songs in playlist');
                return;
            }

            // Get current song
            const song = songs[this.currentSongIndex];

            // Update current song in database
            db.prepare(`
        INSERT INTO stream_stats (current_song_id, is_live, current_mode, listener_count)
        VALUES (?, 0, 'autodj', 0)
      `).run(song.id);

            // Emit song update to all clients
            this.io.emit('song:update', { song });

            console.log(`🎵 Now playing: ${song.title} - ${song.artist}`);

            // Move to next song
            this.currentSongIndex = (this.currentSongIndex + 1) % songs.length;

            // Schedule next song (using duration from metadata)
            if (song.duration > 0) {
                setTimeout(() => {
                    this.playNextSong();
                }, song.duration * 1000);
            } else {
                // Default 3 minutes if no duration
                setTimeout(() => {
                    this.playNextSong();
                }, 180000);
            }
        } catch (error) {
            console.error('Error playing next song:', error);
        }
    }

    /**
     * Get current streaming status
     */
    getStatus() {
        return {
            mode: this.mode,
            isLive: this.isLive,
            currentPlaylistId: this.currentPlaylistId
        };
    }

    /**
     * Get current song
     */
    getCurrentSong() {
        try {
            const latestStat = db.prepare(`
        SELECT current_song_id FROM stream_stats 
        WHERE current_song_id IS NOT NULL
        ORDER BY recorded_at DESC 
        LIMIT 1
      `).get();

            if (latestStat && latestStat.current_song_id) {
                return db.prepare('SELECT * FROM songs WHERE id = ?').get(latestStat.current_song_id);
            }
        } catch (error) {
            console.error('Error getting current song:', error);
        }

        return null;
    }
}

module.exports = StreamingService;
