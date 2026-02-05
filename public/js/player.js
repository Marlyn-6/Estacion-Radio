// Conexión Socket.IO
const socket = io();

// Variables de estado
let contextoAudio = null;
let analizador = null;
let estaReproduciendo = false;
let fuenteAudio = null;

// Variables WebRTC
let conexionPar = null; // RTCPeerConnection
const configRTC = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Elementos DOM
const botonPlay = document.getElementById('play-button');
const iconoPlay = document.getElementById('play-icon');
const sliderVolumen = document.getElementById('volume-slider');
const tituloCancion = document.getElementById('song-title');
const artistaCancion = document.getElementById('song-artist');
const contadorOyentes = document.getElementById('listener-count');
const indicadorEnVivo = document.getElementById('live-indicator');
const canvas = document.getElementById('visualizer');
const ctxCanvas = canvas.getContext('2d');

// Ajustar tamaño del canvas
function ajustarCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', ajustarCanvas);
ajustarCanvas();

// Elemento de audio (oculto, usamos AudioContext para visualización)
const elementoAudio = new Audio();
elementoAudio.crossOrigin = 'anonymous';

// Evento Play/Pausa
botonPlay.addEventListener('click', alternarReproduccion);

function alternarReproduccion() {
    if (!estaReproduciendo) {
        iniciarReproduccion();
    } else {
        detenerReproduccion();
    }
}

async function iniciarReproduccion() {
    try {
        // Inicializar contexto de audio (necesario interacción usuario)
        if (!contextoAudio) {
            contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
            analizador = contextoAudio.createAnalyser();
            analizador.fftSize = 256;
        }

        if (contextoAudio.state === 'suspended') {
            await contextoAudio.resume();
        }

        // Conectar nodo de audio al analizador (solo si no está ya conectado)
        if (!fuenteAudio) {
            fuenteAudio = contextoAudio.createMediaElementSource(elementoAudio);
            fuenteAudio.connect(analizador);
            analizador.connect(contextoAudio.destination);
        }

        // Configurar volumen
        elementoAudio.volume = sliderVolumen.value / 100;

        // Determinar qué reproducir (Vivo o AutoDJ)
        try {
            const respuestaEstado = await fetch('/api/transmision/estado');
            const datosEstado = await respuestaEstado.json();

            if (datosEstado.estado.estaEnVivo) {
                console.log('📻 Modo EN VIVO detectado - Esperando conexión WebRTC...');
                tituloCancion.textContent = "Transmisión En Vivo";
                artistaCancion.textContent = "Conectando...";
                indicadorEnVivo.style.display = 'block';
            } else if (datosEstado.estado.cancionActual) {
                console.log('🎵 Modo AutoDJ - Reproduciendo archivo');
                elementoAudio.src = `/api/canciones/${datosEstado.estado.cancionActual.id}/audio`;
                await elementoAudio.play();

                tituloCancion.textContent = datosEstado.estado.cancionActual.titulo;
                artistaCancion.textContent = datosEstado.estado.cancionActual.artista;
                indicadorEnVivo.style.display = 'none';
            } else {
                console.log('Silencio... esperando música.');
                indicadorEnVivo.style.display = 'none';
            }
        } catch (e) {
            console.error("Error al obtener estado:", e);
        }

        estaReproduciendo = true;
        botonPlay.classList.add('playing');
        iconoPlay.textContent = '⏸';

        // Notificar al servidor que hay un oyente activo
        socket.emit('oyente:unirse');

        // Iniciar visualizador
        dibujarVisualizador();

    } catch (error) {
        console.error('Error de reproducción:', error);
    }
}

function detenerReproduccion() {
    elementoAudio.pause();
    estaReproduciendo = false;
    botonPlay.classList.remove('playing');
    iconoPlay.textContent = '▶';
}

// Control de Volumen
sliderVolumen.addEventListener('input', (e) => {
    elementoAudio.volume = e.target.value / 100;
});

// Visualizador (Ondas)
function dibujarVisualizador() {
    if (!estaReproduciendo) return;
    requestAnimationFrame(dibujarVisualizador);
    if (!analizador) return;

    const bufferLength = analizador.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analizador.getByteFrequencyData(dataArray);

    ctxCanvas.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctxCanvas.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        const gradient = ctxCanvas.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.5, '#ec4899');
        gradient.addColorStop(1, '#14b8a6');

        ctxCanvas.fillStyle = gradient;
        ctxCanvas.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }
}

// ============================================
// LÓGICA WEBRTC (Lado Oyente)
// ============================================

// 1. Recibir OFERTA del Transmisor
socket.on('oferta-webrtc', async (data) => {
    const { oferta, de } = data;
    console.log('📡 Recibida oferta WebRTC de:', de);

    try {
        // Si ya hay una conexión, ciérrala
        if (conexionPar) {
            conexionPar.close();
        }

        conexionPar = new RTCPeerConnection(configRTC);

        // A. Cuando llegue el STREAM de audio
        conexionPar.ontrack = (evento) => {
            console.log('🎵 ¡Audio en vivo recibido!');
            const stream = evento.streams[0];

            // Asignar el stream al elemento de audio
            elementoAudio.srcObject = stream;

            // Reproducir si el usuario ya le dio Play
            if (estaReproduciendo) {
                elementoAudio.play().catch(e => console.error("Error autoplay stream:", e));
            }
        };

        // B. Manejar Candidatos ICE
        conexionPar.onicecandidate = (evento) => {
            if (evento.candidate) {
                socket.emit('candidato-ice-webrtc', {
                    candidato: evento.candidate,
                    para: de
                });
            }
        };

        // C. Configurar oferta remota y crear respuesta
        await conexionPar.setRemoteDescription(new RTCSessionDescription(oferta));
        const respuesta = await conexionPar.createAnswer();
        await conexionPar.setLocalDescription(respuesta);

        // D. Enviar respuesta al Transmisor
        socket.emit('respuesta-webrtc', {
            respuesta: respuesta,
            para: de
        });

    } catch (error) {
        console.error('Error en WebRTC Oyente:', error);
    }
});

// 2. Recibir Candidatos ICE del Transmisor
socket.on('candidato-ice-webrtc', async (data) => {
    const { candidato } = data;
    if (conexionPar) {
        try {
            await conexionPar.addIceCandidate(new RTCIceCandidate(candidato));
        } catch (e) {
            console.error('Error agregando candidato ICE:', e);
        }
    }
});

// 3. Manejar reinicio del transmisor
socket.on('transmisor-listo', () => {
    console.log('Transmisor se ha reiniciado');
});

// Eventos de Socket.IO generales
socket.on('estadisticas:actualizar', (data) => {
    contadorOyentes.textContent = data.cantidadOyentes;
});

socket.on('cancion:actualizar', (data) => {
    if (data.cancion) {
        console.log('Nueva canción AutoDJ:', data.cancion.titulo);
        // Si estamos reproduciendo y NO estamos en vivo, cambiar canción AutoDJ
        const estaEnVivo = document.getElementById('live-indicator').style.display === 'block';

        if (estaReproduciendo && !estaEnVivo) {
            tituloCancion.textContent = data.cancion.titulo;
            artistaCancion.textContent = data.cancion.artista;
            document.getElementById('page-title').textContent = `${data.cancion.titulo} | Radio`;

            // Importante: Limpiar WebRTC si hubiera
            if (elementoAudio.srcObject) {
                elementoAudio.srcObject = null;
            }

            elementoAudio.src = `/api/canciones/${data.cancion.id}/audio`;
            elementoAudio.play().catch(e => console.log('Autoplay error:', e));
        }
    }
});

socket.on('transmision:modo', (data) => {
    console.log('Cambio de modo:', data);
    if (data.estaEnVivo) {
        indicadorEnVivo.style.display = 'block';
        tituloCancion.textContent = "🔴 EN VIVO";
        artistaCancion.textContent = "Escuchando transmisión...";
        // El audio cambiará cuando llegue la oferta WebRTC (evento oferta-webrtc)
    } else {
        indicadorEnVivo.style.display = 'none';

        // Si estábamos en vivo y terminó, limpiar conexión
        if (conexionPar) {
            conexionPar.close();
            conexionPar = null;
        }
        elementoAudio.srcObject = null;

        // Volverá a AutoDJ cuando llegue el siguiente 'cancion:actualizar' o si recargamos estado
        tituloCancion.textContent = "Esperando señal...";
        artistaCancion.textContent = "";
    }
});

// Cargar estado inicial y metadatos de la estación
(async () => {
    try {
        const name = 'Mi Radio Online';
        const description = 'La mejor música en vivo 24/7';
        document.getElementById('station-name').textContent = name;
        document.getElementById('station-description').textContent = description;
    } catch (error) {
        console.error('Error loading info:', error);
    }
})();

// Limpieza al salir
window.addEventListener('beforeunload', () => {
    if (conexionPar) conexionPar.close();
    socket.disconnect();
});
