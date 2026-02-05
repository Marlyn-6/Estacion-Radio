const { bd } = require('../config/database');
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
    iniciarTransmisionEnVivo() {
        this.modo = 'vivo';
        this.estaEnVivo = true;

        // Actualizar base de datos
        bd.prepare(`
      INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
      VALUES (1, 'vivo', 0)
    `).run();

        console.log('🔴 Transmisión en vivo iniciada');
    }

    /**
     * Detener transmisión en vivo
     */
    detenerTransmisionEnVivo() {
        this.estaEnVivo = false;

        // Cambiar a AutoDJ si hay una lista configurada
        if (this.listaActualId) {
            this.modo = 'autodj';
        }

        // Actualizar base de datos
        bd.prepare(`
      INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
      VALUES (0, ?, 0)
    `).run(this.modo);

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

        // Actualizar base de datos
        bd.prepare(`
      INSERT INTO estadisticas_transmision (esta_en_vivo, modo_actual, cantidad_oyentes)
      VALUES (0, 'autodj', 0)
    `).run();

        // Establecer lista como activa
        bd.prepare('UPDATE listas_reproduccion SET esta_activa = 0').run();
        bd.prepare('UPDATE listas_reproduccion SET esta_activa = 1 WHERE id = ?').run(listaId);

        console.log(`🎵 AutoDJ iniciado con lista ${listaId}`);

        // Comenzar reproducción de primera canción
        this.reproducirSiguienteCancion();
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
    reproducirSiguienteCancion() {
        if (!this.listaActualId || this.modo !== 'autodj') {
            return;
        }

        try {
            // Obtener canciones de la lista
            const canciones = bd.prepare(`
        SELECT c.* 
        FROM canciones c
        JOIN canciones_lista cl ON c.id = cl.cancion_id
        WHERE cl.lista_id = ?
        ORDER BY cl.posicion ASC
      `).all(this.listaActualId);

            if (canciones.length === 0) {
                console.log('No hay canciones en la lista');
                return;
            }

            // Obtener canción actual
            const cancion = canciones[this.indiceCancionActual];

            // Actualizar canción actual en base de datos
            bd.prepare(`
        INSERT INTO estadisticas_transmision (cancion_actual_id, esta_en_vivo, modo_actual, cantidad_oyentes)
        VALUES (?, 0, 'autodj', 0)
      `).run(cancion.id);

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
    obtenerCancionActual() {
        try {
            const ultimaEstadistica = bd.prepare(`
        SELECT cancion_actual_id FROM estadisticas_transmision 
        WHERE cancion_actual_id IS NOT NULL
        ORDER BY registrado_en DESC 
        LIMIT 1
      `).get();

            if (ultimaEstadistica && ultimaEstadistica.cancion_actual_id) {
                return bd.prepare('SELECT * FROM canciones WHERE id = ?').get(ultimaEstadistica.cancion_actual_id);
            }
        } catch (error) {
            console.error('Error al obtener canción actual:', error);
        }

        return null;
    }
}

module.exports = ServicioTransmision;
