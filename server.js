require('dotenv').config();
const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { inicializarBaseDatos } = require('./config/database');

// Inicializar base de datos
inicializarBaseDatos();

const app = express();
const servidor = http.createServer(app);
const io = socketIo(servidor, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto-radio-cambiar-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Establecer a true si usa HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/subidas', express.static(path.join(__dirname, 'subidas')));

// Importar rutas
const rutasAuth = require('./routes/auth');
const rutasCanciones = require('./routes/canciones');
const rutasListas = require('./routes/listas');
const rutasTransmision = require('./routes/transmision');

// Usar rutas
app.use('/api/auth', rutasAuth);
app.use('/api/canciones', rutasCanciones);
app.use('/api/listas', rutasListas);
app.use('/api/transmision', rutasTransmision);

// Importar servicios
const ServicioTransmision = require('./services/ServicioTransmision');
const servicioTransmision = new ServicioTransmision(io);

// Manejo de conexiones Socket.IO
let cantidadOyentes = 0;

io.on('connection', (socket) => {
    // ============================================
    // SEÑALIZACIÓN WEBRTC (Conexión P2P)
    // ============================================

    // 1. Transmisor (Admin) notifica que está listo
    socket.on('transmisor-listo', () => {
        // Verificar sesión de admin (simplificado aquí, idealmente usar middleware)
        socket.broadcast.emit('transmisor-listo'); // Notificar a todos los oyentes
        console.log('🎤 Transmisor listo le ha notificado a los oyentes');
    });

    // 2. Transmisor solicita lista de oyentes actuales
    socket.on('obtener-oyentes-actuales', () => {
        const oyentesActuales = Array.from(io.sockets.sockets.keys()).filter(id => id !== socket.id);
        socket.emit('oyentes-actuales', oyentesActuales);
    });

    // 3. Notificar al transmisor cuando llega un nuevo oyente
    // (Esto ya se hace parcialmente abajo, pero especificamos el evento WebRTC)

    // 4. Reenviar OFERTA WebRTC (del Admin al Oyente)
    socket.on('oferta-webrtc', (data) => {
        const { oferta, para } = data;
        io.to(para).emit('oferta-webrtc', {
            oferta: oferta,
            de: socket.id
        });
    });

    // 5. Reenviar RESPUESTA WebRTC (del Oyente al Admin)
    socket.on('respuesta-webrtc', (data) => {
        const { respuesta, para } = data;
        io.to(para).emit('respuesta-webrtc', {
            respuesta: respuesta,
            de: socket.id
        });
    });

    // 6. Reenviar CANDIDATOS ICE (bidireccional)
    socket.on('candidato-ice-webrtc', (data) => {
        const { candidato, para } = data;
        io.to(para).emit('candidato-ice-webrtc', {
            candidato: candidato,
            de: socket.id
        });
    });

    // Oyente se unió
    socket.on('oyente:unirse', () => {
        cantidadOyentes++;
        io.emit('estadisticas:actualizar', { cantidadOyentes });
        console.log(`Oyente se unió. ID: ${socket.id}. Total: ${cantidadOyentes}`);

        // Notificar a todos (incluyendo al admin si está conectado) que hay un nuevo oyente
        socket.broadcast.emit('nuevo-oyente', socket.id);
    });

    // Oyente se fue
    socket.on('disconnect', () => {
        cantidadOyentes = Math.max(0, cantidadOyentes - 1);
        io.emit('estadisticas:actualizar', { cantidadOyentes });
        console.log(`Cliente desconectado: ${socket.id}. Total: ${cantidadOyentes}`);

        // Notificar desconexión para que el admin limpie la conexión P2P
        socket.broadcast.emit('oyente-desconectado', socket.id);
    });

    // Admin inicia/detiene transmisión (Estado visual)
    socket.on('admin:vivo:iniciar', () => {
        servicioTransmision.iniciarTransmisionEnVivo();
        io.emit('transmision:modo', { modo: 'vivo', estaEnVivo: true });
    });

    socket.on('admin:vivo:detener', () => {
        servicioTransmision.detenerTransmisionEnVivo();
        io.emit('transmision:modo', { modo: 'autodj', estaEnVivo: false });
    });

    // Controles AutoDJ
    socket.on('admin:autodj:iniciar', (datos) => {
        servicioTransmision.iniciarAutoDJ(datos.listaId);
        io.emit('transmision:modo', { modo: 'autodj', estaEnVivo: false });
    });

    socket.on('admin:autodj:detener', () => {
        servicioTransmision.detenerAutoDJ();
    });
});

// Hacer servicio de transmisión disponible para rutas
app.locals.servicioTransmision = servicioTransmision;
app.locals.io = io;

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '¡Algo salió mal!' });
});

// Iniciar servidor
const PUERTO = process.env.PORT || 3000;
servidor.listen(PUERTO, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   🎵 Servidor Radio Online Iniciado 🎵    ║
╚═══════════════════════════════════════════╝

🌐 Servidor corriendo en: http://localhost:${PUERTO}
📻 Página pública: http://localhost:${PUERTO}
🔐 Panel admin: http://localhost:${PUERTO}/admin

Credenciales por defecto:
  Usuario: admin
  Contraseña: admin123

Estación: ${process.env.STATION_NAME || 'Mi Radio Online'}
  `);
});
