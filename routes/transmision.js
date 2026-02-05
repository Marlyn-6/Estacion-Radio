const express = require('express');
const { pool } = require('../config/database');
const { requerirAutenticacion } = require('./auth');

const enrutador = express.Router();

// Obtener estado de transmisión
enrutador.get('/estado', async (req, res) => {
    try {
        const estadoResult = await pool.query(`
            SELECT * FROM estadisticas_transmision 
            ORDER BY registrado_en DESC 
            LIMIT 1
        `);

        const estado = estadoResult.rows[0] || {
            esta_en_vivo: false,
            modo_actual: 'autodj',
            cantidad_oyentes: 0
        };

        let cancionActual = null;
        if (estado.cancion_actual_id) {
            const cancionResult = await pool.query(
                'SELECT * FROM canciones WHERE id = $1',
                [estado.cancion_actual_id]
            );
            cancionActual = cancionResult.rows[0] || null;
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
enrutador.post('/modo', requerirAutenticacion, async (req, res) => {
    const { modo, estaEnVivo } = req.body;

    if (!modo || !['vivo', 'autodj'].includes(modo)) {
        return res.status(400).json({ error: 'Modo inválido. Debe ser "vivo" o "autodj"' });
    }

    try {
        // Insertar nuevo estado
        await pool.query(`
            INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
            VALUES ($1, $2, 0)
        `, [estaEnVivo || false, modo]);

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
enrutador.get('/estadisticas', async (req, res) => {
    try {
        const estadisticasResult = await pool.query(`
            SELECT * FROM estadisticas_transmision 
            ORDER BY registrado_en DESC 
            LIMIT 100
        `);

        const estadisticas = estadisticasResult.rows;
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
enrutador.post('/cancion-actual', requerirAutenticacion, async (req, res) => {
    const { cancionId } = req.body;

    try {
        // Obtener estado actual
        const estadoResult = await pool.query(`
            SELECT esta_en_vivo, modo_actual 
            FROM estadisticas_transmision 
            ORDER BY registrado_en DESC 
            LIMIT 1
        `);

        const estadoActual = estadoResult.rows[0] || { esta_en_vivo: false, modo_actual: 'autodj' };

        // Insertar nuevo registro
        await pool.query(`
            INSERT INTO estadisticas_transmision (cancion_actual_id, esta_en_vivo, modo_actual, cantidad_oyentes)
            VALUES ($1, $2, $3, 0)
        `, [cancionId || null, estadoActual.esta_en_vivo, estadoActual.modo_actual]);

        // Notificar a oyentes vía Socket.IO
        if (req.app.locals.io && cancionId) {
            const cancionResult = await pool.query('SELECT * FROM canciones WHERE id = $1', [cancionId]);
            if (cancionResult.rows.length > 0) {
                req.app.locals.io.emit('cancion:actualizar', { cancion: cancionResult.rows[0] });
            }
        }

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al actualizar canción actual:', error);
        res.status(500).json({ error: 'Error al actualizar canción actual' });
    }
});

module.exports = enrutador;
