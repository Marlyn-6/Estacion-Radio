const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

class ServicioTransmision {
    constructor(io) {
        this.io = io;
        this.modo = 'autodj'; // 'vivo' o 'autodj'
        this.estaEnVivo = false;
        this.listaActualId = null;
        this.indiceCancionActual = 0;
        this.bufferAudio = [];
    }

    /**
     * Manejar audio en vivo entrante del admin
     */
    manejarAudioEnVivo(datosAudio) {
        if (this.estaEnVivo && this.modo === 'vivo') {
            // Transmitir audio a todos los oyentes conectados
            this.io.emit('audio:transmitir', datosAudio);
        }
    }

    /**
     * Iniciar transmisión en vivo
     */
    async iniciarTransmisionEnVivo() {
        this.modo = 'vivo';
        this.estaEnVivo = true;

        // Actualizar base de datos
        try {
            await pool.query(`
                INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
                VALUES (TRUE, 'vivo', 0)
            `);
        } catch (error) {
            console.error('Error al actualizar estadísticas:', error);
        }

        console.log('🔴 Transmisión en vivo iniciada');
    }

    /**
     * Detener transmisión en vivo
     */
    async detenerTransmisionEnVivo() {
        this.estaEnVivo = false;

        // Cambiar a AutoDJ si hay una lista configurada
        if (this.listaActualId) {
            this.modo = 'autodj';
        }

        // Actualizar base de datos
        try {
            await pool.query(`
                INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
                VALUES (FALSE, $1, 0)
            `, [this.modo]);
        } catch (error) {
            console.error('Error al actualizar estadísticas:', error);
        }

        console.log('⏹️  Transmisión en vivo detenida');
    }

    /**
     * Iniciar AutoDJ con lista especificada
     */
    async iniciarAutoDJ(listaId) {
        this.listaActualId = listaId;
        this.modo = 'autodj';
        this.estaEnVivo = false;
        this.indiceCancionActual = 0;

        try {
            // Actualizar base de datos
            await pool.query(`
                INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
                VALUES (FALSE, 'autodj', 0)
            `);

            // Establecer lista como activa
            await pool.query('UPDATE listas_reproduccion SET esta_activa = FALSE');
            await pool.query('UPDATE listas_reproduccion SET esta_activa = TRUE WHERE id = $1', [listaId]);

            console.log(`🎵 AutoDJ iniciado con lista ${listaId}`);

            // Comenzar reproducción de primera canción
            this.reproducirSiguienteCancion();
        } catch (error) {
            console.error('Error al iniciar AutoDJ:', error);
        }
    }

    /**
     * Detener AutoDJ
     */
    detenerAutoDJ() {
        this.listaActualId = null;
        this.modo = 'autodj';
        this.indiceCancionActual = 0;

        console.log('⏹️  AutoDJ detenido');
    }

    /**
     * Reproducir siguiente canción en la lista
     */
    async reproducirSiguienteCancion() {
        if (!this.listaActualId || this.modo !== 'autodj') {
            return;
        }

        try {
            // Obtener canciones de la lista
            const result = await pool.query(`
                SELECT c.* 
                FROM canciones c
                JOIN canciones_lista cl ON c.id = cl.cancion_id
                WHERE cl.lista_id = $1
                ORDER BY cl.posicion ASC
            `, [this.listaActualId]);

            const canciones = result.rows;

            if (canciones.length === 0) {
                console.log('No hay canciones en la lista');
                return;
            }

            // Obtener canción actual
            const cancion = canciones[this.indiceCancionActual];

            // Actualizar canción actual en base de datos
            await pool.query(`
                INSERT INTO estadisticas_transmision (cancion_actual_id, esta_en_vivo, modo_actual, cantidad_oyentes)
                VALUES ($1, FALSE, 'autodj', 0)
            `, [cancion.id]);

            // Emitir actualización de canción a todos los clientes
            this.io.emit('cancion:actualizar', { cancion });

            console.log(`🎵 Reproduciendo ahora: ${cancion.titulo} - ${cancion.artista}`);

            // Moverse a siguiente canción
            this.indiceCancionActual = (this.indiceCancionActual + 1) % canciones.length;

            // Programar siguiente canción (usando duración de metadatos)
            if (cancion.duracion > 0) {
                setTimeout(() => {
                    this.reproducirSiguienteCancion();
                }, cancion.duracion * 1000);
            } else {
                // Por defecto 3 minutos si no hay duración
                setTimeout(() => {
                    this.reproducirSiguienteCancion();
                }, 180000);
            }
        } catch (error) {
            console.error('Error al reproducir siguiente canción:', error);
        }
    }

    /**
     * Obtener estado actual de transmisión
     */
    obtenerEstado() {
        return {
            modo: this.modo,
            estaEnVivo: this.estaEnVivo,
            listaActualId: this.listaActualId
        };
    }

    /**
     * Obtener canción actual
     */
    async obtenerCancionActual() {
        try {
            const estadisticaResult = await pool.query(`
                SELECT cancion_actual_id FROM estadisticas_transmision 
                WHERE cancion_actual_id IS NOT NULL
                ORDER BY registrado_en DESC 
                LIMIT 1
            `);

            if (estadisticaResult.rows.length > 0 && estadisticaResult.rows[0].cancion_actual_id) {
                const cancionResult = await pool.query(
                    'SELECT * FROM canciones WHERE id = $1',
                    [estadisticaResult.rows[0].cancion_actual_id]
                );
                return cancionResult.rows[0] || null;
            }
        } catch (error) {
            console.error('Error al obtener canción actual:', error);
        }

        return null;
    }
}

module.exports = ServicioTransmision;
