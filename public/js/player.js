// ============================================
// RADIO OYENTE - WebRTC Audio Streaming
// ============================================

// Conexión Socket.IO
const socket = io();

// Estado global
const state = {
    peerConnection: null,
    audioElement: null,
    audioContext: null,
    analyser: null,
    audioSource: null,
    userInteracted: false,
    pendingStream: null,
    currentVolume: 0.7,
    isMuted: false
};

// Configuración WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Elementos DOM
const elements = {
    volumeSlider: document.getElementById('volume-slider'),
    songTitle: document.getElementById('song-title'),
    songArtist: document.getElementById('song-artist'),
    listenersCount: document.getElementById('listener-count'),
    liveIndicator: document.getElementById('live-indicator'),
    visualizer: document.getElementById('visualizer'),
    mobilePlayBtn: document.getElementById('mobile-play-btn'),
    debugPanel: document.getElementById('debug-panel'),
    debugInfo: document.getElementById('debug-info')
};

// Función de debug visible
function mostrarDebug(mensaje) {
    if (elements.debugPanel && elements.debugInfo) {
        elements.debugPanel.style.display = 'block';
        const timestamp = new Date().toLocaleTimeString();
        elements.debugInfo.innerHTML += `<div>[${timestamp}] ${mensaje}</div>`;
        // Mantener solo los últimos 10 mensajes
        const lines = elements.debugInfo.querySelectorAll('div');
        if (lines.length > 10) {
            lines[0].remove();
        }
    }
    console.log(mensaje);
}

// ============================================
// INICIALIZACIÓN
// ============================================

function inicializar() {
    // Crear elemento de audio (SIN autoplay)
    state.audioElement = document.createElement('audio');
    state.audioElement.autoplay = false;
    state.audioElement.controls = false;
    state.audioElement.style.display = 'none';
    state.audioElement.volume = state.currentVolume;
    state.audioElement.muted = false; // Asegurar que NO esté muted
    state.audioElement.playsInline = true; // Importante para iOS/móviles
    document.body.appendChild(state.audioElement);
    
    mostrarDebug('🔧 AudioElement creado: vol=' + state.audioElement.volume + ', muted=' + state.audioElement.muted);

    // Configurar canvas del visualizador
    ajustarCanvas();
    window.addEventListener('resize', ajustarCanvas);

    // Detectar interacción del usuario (incluyendo eventos táctiles para móviles)
    document.addEventListener('click', manejarInteraccionUsuario);
    document.addEventListener('keydown', manejarInteraccionUsuario);
    document.addEventListener('touchstart', manejarInteraccionUsuario); // Para móviles
    document.addEventListener('touchend', manejarInteraccionUsuario);   // Para móviles

    // Configurar controles
    configurarControles();

    // Configurar botón móvil específicamente
    if (elements.mobilePlayBtn) {
        elements.mobilePlayBtn.addEventListener('click', manejarClickBotonMovil);
        elements.mobilePlayBtn.addEventListener('touchstart', manejarClickBotonMovil);
        mostrarDebug('✅ Botón móvil configurado');
    }

    // Notificar al servidor que somos un oyente
    socket.emit('oyente:unirse');

    console.log('✅ Oyente inicializado');
}

function ajustarCanvas() {
    const canvas = elements.visualizer;
    if (canvas) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
}

// ============================================
// INTERACCIÓN DEL USUARIO (Política de Autoplay)
// ============================================

// Manejador ESPECÍFICO para el botón móvil
function manejarClickBotonMovil(e) {
    e.preventDefault();
    e.stopPropagation();
    
    mostrarDebug('🔵 BOTÓN TOCADO - Reproduciendo AHORA');
    
    state.userInteracted = true;
    
    // Eliminar botón inmediatamente
    if (elements.mobilePlayBtn) {
        elements.mobilePlayBtn.style.display = 'none';
        elements.mobilePlayBtn.remove();
        mostrarDebug('🗑️ Botón eliminado');
    }
    
    // Reanudar AudioContext
    if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }
    
    // Reproducir INMEDIATAMENTE con esta interacción fresca
    reproducirStreamInmediato();
}

function manejarInteraccionUsuario() {
    if (!state.userInteracted) {
        state.userInteracted = true;
        mostrarDebug('✅ Usuario interactuó');

        // Reanudar AudioContext si está suspendido
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }

        // Reproducir si hay stream pendiente
        if (state.pendingStream || (state.audioElement && state.audioElement.srcObject)) {
            reproducirStreamInmediato();
        }
    }
}

// ============================================
// WEBRTC - RECIBIR OFERTA DEL LOCUTOR
// ============================================

socket.on('oferta-webrtc', async (data) => {
    const { oferta, de } = data;
    mostrarDebug('📡 Oferta WebRTC recibida');
    await manejarOferta(oferta, de);
});

async function manejarOferta(oferta, de) {
    try {
        // Crear RTCPeerConnection si no existe
        if (!state.peerConnection) {
            state.peerConnection = new RTCPeerConnection(rtcConfig);

            // CRÍTICO: Cuando recibimos el stream
            state.peerConnection.ontrack = (event) => {
                mostrarDebug('🎵 Stream recibido del locutor');
                const stream = event.streams[0];

                // Asignar stream al elemento de audio
                if (state.audioElement) {
                    state.audioElement.srcObject = stream;
                    state.audioElement.muted = false; // Asegurar que NO esté muted
                    mostrarDebug('📡 Stream asignado a audioElement');

                    // Conectar al visualizador INMEDIATAMENTE (no requiere interacción)
                    conectarStreamAlVisualizador(stream);

                    // Mostrar indicador EN VIVO
                    if (elements.liveIndicator) {
                        elements.liveIndicator.style.display = 'block';
                    }
                    if (elements.songTitle) {
                        elements.songTitle.textContent = '🔴 EN VIVO';
                    }
                    if (elements.songArtist) {
                        elements.songArtist.textContent = 'Transmisión en directo';
                    }

                    // Guardar stream como pendiente
                    state.pendingStream = stream;
                    
                    // Reproducir automáticamente si el usuario ya interactuó
                    if (state.userInteracted) {
                        mostrarDebug('✅ Usuario ya interactuó, reproduciendo...');
                        reproducirStreamInmediato();
                    } else {
                        mostrarDebug('⏳ Stream listo, esperando toque...');
                        
                        // Mostrar botón AHORA que el stream está listo
                        if (elements.mobilePlayBtn) {
                            elements.mobilePlayBtn.style.display = 'block';
                            mostrarDebug('🔵 BOTÓN VISIBLE - Toca para escuchar');
                        }
                    }
                }
            };

            // Manejar ICE candidates
            state.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('candidato-ice-webrtc', {
                        candidato: event.candidate,
                        para: de
                    });
                }
            };

            // Manejar cambios de estado de conexión
            state.peerConnection.onconnectionstatechange = () => {
                console.log('📡 Estado conexión WebRTC:', state.peerConnection.connectionState);
                if (state.peerConnection.connectionState === 'failed' || 
                    state.peerConnection.connectionState === 'disconnected') {
                    limpiarConexion();
                }
            };
        }

        // Configurar oferta remota
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(oferta));

        // Crear y enviar respuesta
        const respuesta = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(respuesta);

        socket.emit('respuesta-webrtc', {
            respuesta: respuesta,
            para: de
        });

        console.log('✅ Respuesta WebRTC enviada');

    } catch (error) {
        console.error('❌ Error al manejar oferta WebRTC:', error);
    }
}

// ============================================
// WEBRTC - RECIBIR ICE CANDIDATES
// ============================================

socket.on('candidato-ice-webrtc', async (data) => {
    const { candidato, de } = data;
    if (state.peerConnection) {
        try {
            await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidato));
            console.log('✅ ICE candidate agregado');
        } catch (error) {
            console.error('❌ Error al agregar ICE candidate:', error);
        }
    }
});

// ============================================
// VISUALIZADOR DE AUDIO
// ============================================

function conectarStreamAlVisualizador(stream) {
    // Crear AudioContext solo cuando sea necesario
    if (!state.audioContext || !state.analyser) {
        try {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 128;
            state.analyser.smoothingTimeConstant = 0.8;
            dibujarVisualizador(); // Iniciar loop de dibujo
        } catch (e) {
            console.log('⚠️ AudioContext no soportado:', e);
            return;
        }
    }

    try {
        // Conectar stream al analyser (NO a destination, solo visualización)
        if (!state.audioSource) {
            state.audioSource = state.audioContext.createMediaStreamSource(stream);
            state.audioSource.connect(state.analyser);
            console.log('✅ Stream conectado al visualizador');
        }
    } catch (e) {
        console.warn('⚠️ No se pudo conectar al visualizador:', e);
    }
}

function dibujarVisualizador() {
    requestAnimationFrame(dibujarVisualizador);

    const canvas = elements.visualizer;
    if (!canvas || !state.analyser) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    state.analyser.getByteFrequencyData(dataArray);

    // Fondo con efecto de trail
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Gradiente de colores
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.5, '#ec4899');
        gradient.addColorStop(1, '#14b8a6');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }
}

// ============================================
// REPRODUCCIÓN DE AUDIO
// ============================================

// Reproducir inmediatamente con interacción fresca
function reproducirStreamInmediato() {
    if (!state.audioElement || !state.audioElement.srcObject) {
        mostrarDebug('⚠️ No hay stream');
        return;
    }

    // Configurar volumen
    if (state.audioElement.volume < 0.1) {
        state.audioElement.volume = 0.7;
    }

    // ESTRATEGIA: Muted primero, unmute después
    state.audioElement.muted = true;
    mostrarDebug('▶️ Play con muted=true...');
    
    state.audioElement.play()
        .then(() => {
            mostrarDebug('✅ Play exitoso');
            
            // Unmutear después de un momento
            setTimeout(() => {
                state.audioElement.muted = false;
                mostrarDebug('🔊 UNMUTED - Vol: ' + state.audioElement.volume);
                state.pendingStream = null;
                
                // Verificar
                setTimeout(() => {
                    if (!state.audioElement.paused) {
                        mostrarDebug('✅ AUDIO FUNCIONANDO');
                    } else {
                        mostrarDebug('⚠️ Audio pausado');
                    }
                }, 500);
            }, 200);
        })
        .catch(err => {
            mostrarDebug('❌ Error muted: ' + err.name);
            
            // Intentar sin muted
            state.audioElement.muted = false;
            state.audioElement.play()
                .then(() => {
                    mostrarDebug('✅ Play sin muted OK');
                    state.pendingStream = null;
                })
                .catch(err2 => {
                    mostrarDebug('❌ Falló todo: ' + err2.name);
                });
        });
}

// Función legacy para otros usos
function reproducirStreamPendiente() {
    reproducirStreamInmediato();
}

// ============================================
// CONTROLES DE VOLUMEN Y MUTE
// ============================================

function configurarControles() {
    // Control de volumen
    if (elements.volumeSlider) {
        elements.volumeSlider.value = state.currentVolume * 100;
        elements.volumeSlider.addEventListener('input', (e) => {
            // Activar interacción si es la primera vez
            if (!state.userInteracted) {
                manejarInteraccionUsuario();
            }
            manejarCambioVolumen(e);
        });
    }
}

function manejarCambioVolumen(e) {
    const volumen = e.target.value / 100;
    state.currentVolume = volumen;
    
    if (state.audioElement) {
        state.audioElement.volume = volumen;
    }

    // Si estaba muteado, desmutearlo
    if (state.isMuted && volumen > 0) {
        state.isMuted = false;
    }
}

// ============================================
// LIMPIEZA Y DESCONEXIÓN
// ============================================

function limpiarConexion() {
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    if (state.audioElement) {
        state.audioElement.srcObject = null;
    }
    if (elements.liveIndicator) {
        elements.liveIndicator.style.display = 'none';
    }
    console.log('🔌 Conexión WebRTC cerrada');
}

// ============================================
// EVENTOS DE SOCKET.IO
// ============================================

socket.on('estadisticas:actualizar', (data) => {
    if (elements.listenersCount) {
        elements.listenersCount.textContent = data.cantidadOyentes;
    }
});

socket.on('transmision:modo', (data) => {
    console.log('📻 Cambio de modo:', data);
    if (data.estaEnVivo) {
        if (elements.liveIndicator) {
            elements.liveIndicator.style.display = 'block';
        }
        if (elements.songTitle) {
            elements.songTitle.textContent = '🔴 EN VIVO';
        }
        if (elements.songArtist) {
            elements.songArtist.textContent = 'Escuchando transmisión...';
        }
    } else {
        limpiarConexion();
        if (elements.songTitle) {
            elements.songTitle.textContent = 'Esperando señal...';
        }
        if (elements.songArtist) {
            elements.songArtist.textContent = '';
        }
    }
});

// Limpieza al salir
window.addEventListener('beforeunload', () => {
    limpiarConexion();
    socket.disconnect();
});

// ============================================
// INICIAR AL CARGAR LA PÁGINA
// ============================================
document.addEventListener('DOMContentLoaded', inicializar);
