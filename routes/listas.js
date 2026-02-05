const express = require('express');
const { pool } = require('../config/database');
const { requerirAutenticacion } = require('./auth');

const enrutador = express.Router();

// Crear lista de reproducción
enrutador.post('/', requerirAutenticacion, async (req, res) => {
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO listas_reproduccion (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );
        res.json({ exito: true, lista: result.rows[0] });
    } catch (error) {
        console.error('Error al crear lista:', error);
        res.status(500).json({ error: 'Error al crear lista de reproducción' });
    }
});

// Obtener todas las listas
enrutador.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.*, COUNT(cl.id) as cantidadCanciones
            FROM listas_reproduccion l
            LEFT JOIN canciones_lista cl ON l.id = cl.lista_id
            GROUP BY l.id
            ORDER BY l.creado_en DESC
        `);

        // Convertir cantidadCanciones a número
        const listas = result.rows.map(lista => ({
            ...lista,
            cantidadCanciones: parseInt(lista.cantidadcanciones || 0)
        }));

        res.json({ listas });
    } catch (error) {
        console.error('Error al obtener listas:', error);
        res.status(500).json({ error: 'Error al obtener listas de reproducción' });
    }
});

// Obtener una lista con canciones
enrutador.get('/:id', async (req, res) => {
    try {
        const listaResult = await pool.query(
            'SELECT * FROM listas_reproduccion WHERE id = $1',
            [req.params.id]
        );

        if (listaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        const cancionesResult = await pool.query(`
            SELECT c.*, cl.posicion 
            FROM canciones c
            JOIN canciones_lista cl ON c.id = cl.cancion_id
            WHERE cl.lista_id = $1
            ORDER BY cl.posicion ASC
        `, [req.params.id]);

        const lista = listaResult.rows[0];
        lista.canciones = cancionesResult.rows;

        res.json({ lista });
    } catch (error) {
        console.error('Error al obtener lista:', error);
        res.status(500).json({ error: 'Error al obtener lista de reproducción' });
    }
});

// Actualizar lista
enrutador.put('/:id', requerirAutenticacion, async (req, res) => {
    const { nombre, estaActiva } = req.body;

    try {
        const listaResult = await pool.query(
            'SELECT * FROM listas_reproduccion WHERE id = $1',
            [req.params.id]
        );

        if (listaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        // Si se activa esta lista, desactivar todas las demás
        if (estaActiva) {
            await pool.query('UPDATE listas_reproduccion SET esta_activa = FALSE');
        }

        const actualizaciones = [];
        const valores = [];
        let contador = 1;

        if (nombre !== undefined) {
            actualizaciones.push(`nombre = $${contador++}`);
            valores.push(nombre);
        }

        if (estaActiva !== undefined) {
            actualizaciones.push(`esta_activa = $${contador++}`);
            valores.push(estaActiva);
        }

        if (actualizaciones.length > 0) {
            valores.push(req.params.id);
            await pool.query(
                `UPDATE listas_reproduccion SET ${actualizaciones.join(', ')} WHERE id = $${contador}`,
                valores
            );
        }

        const listaActualizada = await pool.query(
            'SELECT * FROM listas_reproduccion WHERE id = $1',
            [req.params.id]
        );
        res.json({ exito: true, lista: listaActualizada.rows[0] });
    } catch (error) {
        console.error('Error al actualizar lista:', error);
        res.status(500).json({ error: 'Error al actualizar lista de reproducción' });
    }
});

// Eliminar lista
enrutador.delete('/:id', requerirAutenticacion, async (req, res) => {
    try {
        const listaResult = await pool.query(
            'SELECT * FROM listas_reproduccion WHERE id = $1',
            [req.params.id]
        );

        if (listaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        await pool.query('DELETE FROM listas_reproduccion WHERE id = $1', [req.params.id]);
        res.json({ exito: true });
    } catch (error) {
        console.error('Error al eliminar lista:', error);
        res.status(500).json({ error: 'Error al eliminar lista de reproducción' });
    }
});

// Agregar canción a lista
enrutador.post('/:id/canciones', requerirAutenticacion, async (req, res) => {
    const { cancionId } = req.body;

    try {
        const listaResult = await pool.query(
            'SELECT * FROM listas_reproduccion WHERE id = $1',
            [req.params.id]
        );
        const cancionResult = await pool.query(
            'SELECT * FROM canciones WHERE id = $1',
            [cancionId]
        );

        if (listaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        if (cancionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Canción no encontrada' });
        }

        // Obtener siguiente posición
        const maxPosResult = await pool.query(
            'SELECT MAX(posicion) as max FROM canciones_lista WHERE lista_id = $1',
            [req.params.id]
        );
        const posicion = (maxPosResult.rows[0].max || 0) + 1;

        await pool.query(
            'INSERT INTO canciones_lista (lista_id, cancion_id, posicion) VALUES ($1, $2, $3)',
            [req.params.id, cancionId, posicion]
        );

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al agregar canción a lista:', error);
        res.status(500).json({ error: 'Error al agregar canción a la lista' });
    }
});

// Eliminar canción de lista
enrutador.delete('/:id/canciones/:cancionId', requerirAutenticacion, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM canciones_lista WHERE lista_id = $1 AND cancion_id = $2',
            [req.params.id, req.params.cancionId]
        );

        // Reordenar canciones restantes
        const cancionesResult = await pool.query(
            'SELECT * FROM canciones_lista WHERE lista_id = $1 ORDER BY posicion',
            [req.params.id]
        );

        for (let i = 0; i < cancionesResult.rows.length; i++) {
            await pool.query(
                'UPDATE canciones_lista SET posicion = $1 WHERE id = $2',
                [i + 1, cancionesResult.rows[i].id]
            );
        }

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al eliminar canción de lista:', error);
        res.status(500).json({ error: 'Error al eliminar canción de la lista' });
    }
});

// Reordenar canciones en lista
enrutador.put('/:id/canciones/reordenar', requerirAutenticacion, async (req, res) => {
    const { idsCancion } = req.body; // Array de IDs en nuevo orden

    if (!Array.isArray(idsCancion)) {
        return res.status(400).json({ error: 'idsCancion debe ser un array' });
    }

    try {
        for (let i = 0; i < idsCancion.length; i++) {
            await pool.query(
                'UPDATE canciones_lista SET posicion = $1 WHERE lista_id = $2 AND cancion_id = $3',
                [i + 1, req.params.id, idsCancion[i]]
            );
        }

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al reordenar canciones:', error);
        res.status(500).json({ error: 'Error al reordenar canciones' });
    }
});

module.exports = enrutador;
