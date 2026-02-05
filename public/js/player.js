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
    mobilePlayPrompt: document.getElementById('mobile-play-prompt'),
    mobilePlayBtn: document.getElementById('mobile-play-btn')
};

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
    document.body.appendChild(state.audioElement);

    // Configurar canvas del visualizador
    ajustarCanvas();
    window.addEventListener('resize', ajustarCanvas);

    // Detectar si es móvil
    const esMobil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('📱 Dispositivo móvil:', esMobil);

    // Detectar interacción del usuario (MÚLTIPLES EVENTOS para móviles)
    document.addEventListener('click', manejarInteraccionUsuario, { once: true });
    document.addEventListener('touchstart', manejarInteraccionUsuario, { once: true });
    document.addEventListener('touchend', manejarInteraccionUsuario, { once: true });
    document.addEventListener('keydown', manejarInteraccionUsuario, { once: true });

    // Configurar botón de reproducción para móviles
    if (elements.mobilePlayBtn) {
        elements.mobilePlayBtn.addEventListener('click', () => {
            console.log('🔊 Botón móvil presionado');
            manejarInteraccionUsuario();
            if (elements.mobilePlayPrompt) {
                elements.mobilePlayPrompt.style.display = 'none';
            }
        });

        elements.mobilePlayBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            console.log('🔊 Botón móvil tocado');
            manejarInteraccionUsuario();
            if (elements.mobilePlayPrompt) {
                elements.mobilePlayPrompt.style.display = 'none';
            }
        });
    }

    // Configurar controles
    configurarControles();

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
        console.log('✅ Usuario interactuó - Autoplay habilitado');

        // Reanudar AudioContext si está suspendido
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }

        // Reproducir stream pendiente si existe
        if (state.pendingStream) {
            reproducirStreamPendiente();
        }

        // MÓVILES: Intentar reproducir el audio inmediatamente si hay srcObject
        if (state.audioElement && state.audioElement.srcObject) {
            reproducirStreamPendiente();
        }
    }
}

// ============================================
// WEBRTC - RECIBIR OFERTA DEL LOCUTOR
// ============================================

socket.on('oferta-webrtc', async (data) => {
    const { oferta, de } = data;
    console.log('📡 Oferta WebRTC recibida del locutor:', de);
    await manejarOferta(oferta, de);
});

async function manejarOferta(oferta, de) {
    try {
        // Crear RTCPeerConnection si no existe
        if (!state.peerConnection) {
            state.peerConnection = new RTCPeerConnection(rtcConfig);

            // CRÍTICO: Cuando recibimos el stream
            state.peerConnection.ontrack = (event) => {
                console.log('🎵 Stream de audio recibido del locutor');
                const stream = event.streams[0];

                // Asignar stream al elemento de audio
                if (state.audioElement) {
                    state.audioElement.srcObject = stream;

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
                        reproducirStreamPendiente();
                    } else {
                        // Guardar como pendiente
                        state.pendingStream = stream;
                        console.log('⏳ Stream guardado, esperando interacción del usuario...');
                        
                        // Mostrar botón de reproducción para móviles
                        if (elements.mobilePlayPrompt) {
                            elements.mobilePlayPrompt.style.display = 'block';
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
    if (!state.audioElement || !state.audioElement.srcObject) return;

    state.audioElement.play()
        .then(() => {
            console.log('✅ Audio reproduciéndose correctamente');
            state.pendingStream = null;
        })
        .catch(err => {
            console.warn('⚠️ Error al reproducir audio:', err);
            // Guardar para intentar más tarde
            if (state.audioElement.srcObject) {
                state.pendingStream = state.audioElement.srcObject;
            }
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
