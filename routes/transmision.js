const express = require('express');
const { bd } = require('../config/database');
const { requerirAutenticacion } = require('./auth');

const enrutador = express.Router();

// Obtener estado de transmisión
enrutador.get('/estado', (req, res) => {
    try {
        const estado = bd.prepare(`
      SELECT * FROM estadisticas_transmision 
      ORDER BY registrado_en DESC 
      LIMIT 1
    `).get() || {
            esta_en_vivo: 0,
            modo_actual: 'autodj',
            cantidad_oyentes: 0
        };

        let cancionActual = null;
        if (estado.cancion_actual_id) {
            cancionActual = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(estado.cancion_actual_id);
        }

        res.json({
            estado: {
                estaEnVivo: Boolean(estado.esta_en_vivo),
                modo: estado.modo_actual,
                cancionActual: cancionActual
            }
        });
    } catch (error) {
        console.error('Error al obtener estado de transmisión:', error);
        res.status(500).json({ error: 'Error al obtener estado de transmisión' });
    }
});

// Establecer modo de transmisión
enrutador.post('/modo', requerirAutenticacion, (req, res) => {
    const { modo, estaEnVivo } = req.body;

    if (!modo || !['vivo', 'autodj'].includes(modo)) {
        return res.status(400).json({ error: 'Modo inválido. Debe ser "vivo" o "autodj"' });
    }

    try {
        // Actualizar o insertar estado actual
        bd.prepare(`
      INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
      VALUES (?, ?, 0)
    `).run(estaEnVivo ? 1 : 0, modo);

        // Notificar vía Socket.IO (si está disponible)
        if (req.app.locals.io) {
            req.app.locals.io.emit('transmision:modo', { modo, estaEnVivo });
        }

        res.json({ exito: true, modo, estaEnVivo });
    } catch (error) {
        console.error('Error al establecer modo de transmisión:', error);
        res.status(500).json({ error: 'Error al establecer modo de transmisión' });
    }
});

// Obtener estadísticas de oyentes
enrutador.get('/estadisticas', (req, res) => {
    try {
        const estadisticas = bd.prepare(`
      SELECT * FROM estadisticas_transmision 
      ORDER BY registrado_en DESC 
      LIMIT 100
    `).all();

        const estadisticasActuales = estadisticas[0] || { cantidad_oyentes: 0 };

        res.json({
            actual: {
                cantidadOyentes: estadisticasActuales.cantidad_oyentes || 0,
                estaEnVivo: Boolean(estadisticasActuales.esta_en_vivo),
                modo: estadisticasActuales.modo_actual || 'autodj'
            },
            historial: estadisticas
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// Actualizar canción actual (llamado por servicio de transmisión)
enrutador.post('/cancion-actual', requerirAutenticacion, (req, res) => {
    const { cancionId } = req.body;

    try {
        bd.prepare(`
      INSERT INTO estadisticas_transmision (cancion_actual_id, esta_en_vivo, modo_actual, cantidad_oyentes)
      SELECT ?, 
             (SELECT esta_en_vivo FROM estadisticas_transmision ORDER BY registrado_en DESC LIMIT 1),
             (SELECT modo_actual FROM estadisticas_transmision ORDER BY registrado_en DESC LIMIT 1),
             0
    `).run(cancionId || null);

        // Notificar a oyentes vía Socket.IO
        if (req.app.locals.io && cancionId) {
            const cancion = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(cancionId);
            req.app.locals.io.emit('cancion:actualizar', { cancion });
        }

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al actualizar canción actual:', error);
        res.status(500).json({ error: 'Error al actualizar canción actual' });
    }
});

module.exports = enrutador;
