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
        elements.mobilePlayBtn.addEventListener('click', manejarInteraccionUsuario);
        elements.mobilePlayBtn.addEventListener('touchstart', manejarInteraccionUsuario);
        console.log('✅ Botón móvil configurado');
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

function manejarInteraccionUsuario() {
    if (!state.userInteracted) {
        state.userInteracted = true;
        mostrarDebug('✅ Usuario interactuó - Autoplay habilitado');

        // Ocultar botón móvil si está visible (PERMANENTEMENTE)
        if (elements.mobilePlayBtn) {
            elements.mobilePlayBtn.style.display = 'none';
            elements.mobilePlayBtn.remove(); // Eliminar completamente del DOM
            mostrarDebug('🗑️ Botón eliminado');
        }

        // Reanudar AudioContext si está suspendido
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume();
            mostrarDebug('🔊 AudioContext reanudado');
        }

        // Asegurar que el audio no esté muted
        if (state.audioElement) {
            state.audioElement.muted = false;
            mostrarDebug('🔇 Unmuted confirmado');
        }

        // NUEVO: Intentar reproducir inmediatamente si ya hay stream
        if (state.audioElement && state.audioElement.srcObject) {
            mostrarDebug('🎵 Intentando reproducir stream existente...');
            reproducirStreamPendiente();
        }

        // Reproducir stream pendiente si existe
        if (state.pendingStream) {
            mostrarDebug('🎵 Reproduciendo stream pendiente...');
            reproducirStreamPendiente();
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

                    // Reproducir automáticamente si el usuario ya interactuó
                    if (state.userInteracted) {
                        mostrarDebug('✅ Usuario ya interactuó, reproduciendo...');
                        reproducirStreamPendiente();
                    } else {
                        // Guardar como pendiente
                        state.pendingStream = stream;
                        mostrarDebug('⏳ Esperando interacción...');
                        
                        // Mostrar botón móvil "Toca para Escuchar"
                        if (elements.mobilePlayBtn) {
                            elements.mobilePlayBtn.style.display = 'block';
                            mostrarDebug('🔵 Botón visible - TOCA AQUÍ');
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

function reproducirStreamPendiente() {
    if (!state.audioElement || !state.audioElement.srcObject) {
        mostrarDebug('⚠️ No hay stream para reproducir');
        return;
    }

    // TRUCO PARA MÓVILES: Reproducir muted primero (siempre funciona)
    // y luego unmutear (esto evita el NotAllowedError)
    state.audioElement.muted = true;
    if (state.audioElement.volume < 0.1) {
        state.audioElement.volume = 0.7;
    }

    mostrarDebug('▶️ Reproduciendo MUTED primero...');
    state.audioElement.play()
        .then(() => {
            mostrarDebug('✅ Play exitoso (muted)');
            
            // UNMUTEAR después de 100ms (esto SÍ funciona en móviles)
            setTimeout(() => {
                state.audioElement.muted = false;
                mostrarDebug('🔊 UNMUTED - AUDIO DEBERÍA SONAR AHORA');
                mostrarDebug('📊 Vol: ' + state.audioElement.volume + ', Muted: ' + state.audioElement.muted);
            }, 100);
            
            state.pendingStream = null;
            
            // Verificar después de 1 segundo
            setTimeout(() => {
                if (!state.audioElement.paused) {
                    mostrarDebug('✅ Audio activo confirmado');
                } else {
                    mostrarDebug('⚠️ Audio pausado');
                }
            }, 1000);
        })
        .catch(err => {
            mostrarDebug('❌ Error: ' + err.name);
            
            // Si falla, intentar SIN muted (para navegadores de escritorio)
            mostrarDebug('🔄 Reintentando sin muted...');
            state.audioElement.muted = false;
            state.audioElement.play()
                .then(() => {
                    mostrarDebug('✅ Segundo intento exitoso');
                    state.pendingStream = null;
                })
                .catch(err2 => {
                    mostrarDebug('❌ Segundo intento falló: ' + err2.name);
                    if (state.audioElement.srcObject) {
                        state.pendingStream = state.audioElement.srcObject;
                    }
                });
        });
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
