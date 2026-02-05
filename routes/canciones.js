const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('music-metadata');
const { bd } = require('../config/database');
const { requerirAutenticacion } = require('./auth');

const enrutador = express.Router();

// Asegurar que existe el directorio de subidas
const directorioSubidas = path.join(__dirname, '..', 'subidas');
if (!fs.existsSync(directorioSubidas)) {
    fs.mkdirSync(directorioSubidas, { recursive: true });
}

// Configurar multer para subida de archivos
const almacenamiento = multer.diskStorage({
    destination: (req, archivo, cb) => {
        cb(null, directorioSubidas);
    },
    filename: (req, archivo, cb) => {
        const sufijoUnico = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, sufijoUnico + path.extname(archivo.originalname));
    }
});

const subir = multer({
    storage: almacenamiento,
    fileFilter: (req, archivo, cb) => {
        const extension = path.extname(archivo.originalname).toLowerCase();
        if (extension !== '.mp3') {
            return cb(new Error('Solo se permiten archivos MP3'));
        }
        cb(null, true);
    },
    limits: { fileSize: 50 * 1024 * 1024 } // Límite de 50MB
});

// Subir canción
enrutador.post('/subir', requerirAutenticacion, subir.single('cancion'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const rutaArchivo = req.file.path;

        // Extraer metadatos
        let metadatos = {
            titulo: path.parse(req.file.originalname).name,
            artista: 'Artista Desconocido',
            album: 'Álbum Desconocido',
            duracion: 0
        };

        try {
            const metadatosMusica = await parseFile(rutaArchivo);
            metadatos.titulo = metadatosMusica.common.title || metadatos.titulo;
            metadatos.artista = metadatosMusica.common.artist || metadatos.artista;
            metadatos.album = metadatosMusica.common.album || metadatos.album;
            metadatos.duracion = Math.floor(metadatosMusica.format.duration || 0);
        } catch (errorMeta) {
            console.warn('No se pudieron extraer los metadatos:', errorMeta.message);
        }

        // Guardar en base de datos
        const resultado = bd.prepare(`
      INSERT INTO canciones (nombre_archivo, titulo, artista, album, duracion, ruta_archivo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            req.file.originalname,
            metadatos.titulo,
            metadatos.artista,
            metadatos.album,
            metadatos.duracion,
            rutaArchivo
        );

        const cancion = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(resultado.lastInsertRowid);

        res.json({
            exito: true,
            cancion: cancion
        });
    } catch (error) {
        console.error('Error al subir:', error);
        res.status(500).json({ error: 'Error al subir la canción' });
    }
});

// Obtener todas las canciones
enrutador.get('/', (req, res) => {
    try {
        const canciones = bd.prepare('SELECT * FROM canciones ORDER BY subido_en DESC').all();
        res.json({ canciones });
    } catch (error) {
        console.error('Error al obtener canciones:', error);
        res.status(500).json({ error: 'Error al obtener canciones' });
    }
});

// Obtener una canción
enrutador.get('/:id', (req, res) => {
    try {
        const cancion = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(req.params.id);
        if (!cancion) {
            return res.status(404).json({ error: 'Canción no encontrada' });
        }
        res.json({ cancion });
    } catch (error) {
        console.error('Error al obtener canción:', error);
        res.status(500).json({ error: 'Error al obtener canción' });
    }
});

// Servir archivo de audio
enrutador.get('/:id/audio', (req, res) => {
    try {
        const cancion = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(req.params.id);
        if (!cancion) {
            return res.status(404).json({ error: 'Canción no encontrada' });
        }

        if (fs.existsSync(cancion.ruta_archivo)) {
            res.sendFile(path.resolve(cancion.ruta_archivo));
        } else {
            res.status(404).json({ error: 'Archivo de audio no encontrado en el servidor' });
        }
    } catch (error) {
        console.error('Error al servir audio:', error);
        res.status(500).send('Error interno');
    }
});

// Eliminar canción
enrutador.delete('/:id', requerirAutenticacion, (req, res) => {
    try {
        const cancion = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(req.params.id);

        if (!cancion) {
            return res.status(404).json({ error: 'Canción no encontrada' });
        }

        // Eliminar archivo del sistema
        if (fs.existsSync(cancion.ruta_archivo)) {
            fs.unlinkSync(cancion.ruta_archivo);
        }

        // Eliminar de la base de datos
        bd.prepare('DELETE FROM canciones WHERE id = ?').run(req.params.id);

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al eliminar canción:', error);
        res.status(500).json({ error: 'Error al eliminar canción' });
    }
});

module.exports = enrutador;
