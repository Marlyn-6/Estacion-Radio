const express = require('express');
const { bd } = require('../config/database');
const { requerirAutenticacion } = require('./auth');

const enrutador = express.Router();

// Crear lista de reproducción
enrutador.post('/', requerirAutenticacion, (req, res) => {
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).json({ error: 'El nombre de la lista es requerido' });
    }

    try {
        const resultado = bd.prepare('INSERT INTO listas_reproduccion (nombre) VALUES (?)').run(nombre);
        const lista = bd.prepare('SELECT * FROM listas_reproduccion WHERE id = ?').get(resultado.lastInsertRowid);
        res.json({ exito: true, lista });
    } catch (error) {
        console.error('Error al crear lista:', error);
        res.status(500).json({ error: 'Error al crear lista de reproducción' });
    }
});

// Obtener todas las listas
enrutador.get('/', (req, res) => {
    try {
        const listas = bd.prepare('SELECT * FROM listas_reproduccion ORDER BY creado_en DESC').all();

        // Obtener cantidad de canciones para cada lista
        const listasConDetalle = listas.map(lista => {
            const cantidadCanciones = bd.prepare('SELECT COUNT(*) as cantidad FROM canciones_lista WHERE lista_id = ?')
                .get(lista.id);

            return {
                ...lista,
                cantidadCanciones: cantidadCanciones.cantidad
            };
        });

        res.json({ listas: listasConDetalle });
    } catch (error) {
        console.error('Error al obtener listas:', error);
        res.status(500).json({ error: 'Error al obtener listas de reproducción' });
    }
});

// Obtener una lista con canciones
enrutador.get('/:id', (req, res) => {
    try {
        const lista = bd.prepare('SELECT * FROM listas_reproduccion WHERE id = ?').get(req.params.id);

        if (!lista) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        const canciones = bd.prepare(`
      SELECT c.*, cl.posicion 
      FROM canciones c
      JOIN canciones_lista cl ON c.id = cl.cancion_id
      WHERE cl.lista_id = ?
      ORDER BY cl.posicion ASC
    `).all(req.params.id);

        res.json({ lista: { ...lista, canciones } });
    } catch (error) {
        console.error('Error al obtener lista:', error);
        res.status(500).json({ error: 'Error al obtener lista de reproducción' });
    }
});

// Actualizar lista
enrutador.put('/:id', requerirAutenticacion, (req, res) => {
    const { nombre, estaActiva } = req.body;

    try {
        const lista = bd.prepare('SELECT * FROM listas_reproduccion WHERE id = ?').get(req.params.id);

        if (!lista) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        // Si se activa esta lista, desactivar todas las demás
        if (estaActiva) {
            bd.prepare('UPDATE listas_reproduccion SET esta_activa = 0').run();
        }

        const actualizaciones = [];
        const valores = [];

        if (nombre !== undefined) {
            actualizaciones.push('nombre = ?');
            valores.push(nombre);
        }

        if (estaActiva !== undefined) {
            actualizaciones.push('esta_activa = ?');
            valores.push(estaActiva ? 1 : 0);
        }

        if (actualizaciones.length > 0) {
            valores.push(req.params.id);
            bd.prepare(`UPDATE listas_reproduccion SET ${actualizaciones.join(', ')} WHERE id = ?`).run(...valores);
        }

        const listaActualizada = bd.prepare('SELECT * FROM listas_reproduccion WHERE id = ?').get(req.params.id);
        res.json({ exito: true, lista: listaActualizada });
    } catch (error) {
        console.error('Error al actualizar lista:', error);
        res.status(500).json({ error: 'Error al actualizar lista de reproducción' });
    }
});

// Eliminar lista
enrutador.delete('/:id', requerirAutenticacion, (req, res) => {
    try {
        const lista = bd.prepare('SELECT * FROM listas_reproduccion WHERE id = ?').get(req.params.id);

        if (!lista) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        bd.prepare('DELETE FROM listas_reproduccion WHERE id = ?').run(req.params.id);
        res.json({ exito: true });
    } catch (error) {
        console.error('Error al eliminar lista:', error);
        res.status(500).json({ error: 'Error al eliminar lista de reproducción' });
    }
});

// Agregar canción a lista
enrutador.post('/:id/canciones', requerirAutenticacion, (req, res) => {
    const { cancionId } = req.body;

    try {
        const lista = bd.prepare('SELECT * FROM listas_reproduccion WHERE id = ?').get(req.params.id);
        const cancion = bd.prepare('SELECT * FROM canciones WHERE id = ?').get(cancionId);

        if (!lista) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        if (!cancion) {
            return res.status(404).json({ error: 'Canción no encontrada' });
        }

        // Obtener siguiente posición
        const maxPosicion = bd.prepare('SELECT MAX(posicion) as max FROM canciones_lista WHERE lista_id = ?')
            .get(req.params.id);
        const posicion = (maxPosicion.max || 0) + 1;

        bd.prepare('INSERT INTO canciones_lista (lista_id, cancion_id, posicion) VALUES (?, ?, ?)')
            .run(req.params.id, cancionId, posicion);

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al agregar canción a lista:', error);
        res.status(500).json({ error: 'Error al agregar canción a la lista' });
    }
});

// Eliminar canción de lista
enrutador.delete('/:id/canciones/:cancionId', requerirAutenticacion, (req, res) => {
    try {
        bd.prepare('DELETE FROM canciones_lista WHERE lista_id = ? AND cancion_id = ?')
            .run(req.params.id, req.params.cancionId);

        // Reordenar canciones restantes
        const canciones = bd.prepare('SELECT * FROM canciones_lista WHERE lista_id = ? ORDER BY posicion')
            .all(req.params.id);

        canciones.forEach((cancion, indice) => {
            bd.prepare('UPDATE canciones_lista SET posicion = ? WHERE id = ?')
                .run(indice + 1, cancion.id);
        });

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al eliminar canción de lista:', error);
        res.status(500).json({ error: 'Error al eliminar canción de la lista' });
    }
});

// Reordenar canciones en lista
enrutador.put('/:id/canciones/reordenar', requerirAutenticacion, (req, res) => {
    const { idsCancion } = req.body; // Array de IDs en nuevo orden

    if (!Array.isArray(idsCancion)) {
        return res.status(400).json({ error: 'idsCancion debe ser un array' });
    }

    try {
        idsCancion.forEach((cancionId, indice) => {
            bd.prepare('UPDATE canciones_lista SET posicion = ? WHERE lista_id = ? AND cancion_id = ?')
                .run(indice + 1, req.params.id, cancionId);
        });

        res.json({ exito: true });
    } catch (error) {
        console.error('Error al reordenar canciones:', error);
        res.status(500).json({ error: 'Error al reordenar canciones' });
    }
});

module.exports = enrutador;
