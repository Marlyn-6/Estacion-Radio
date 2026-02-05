const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

const enrutador = express.Router();

// Endpoint de inicio de sesión
enrutador.post('/iniciar-sesion', async (req, res) => {
    const { nombreUsuario, contrasena } = req.body;

    if (!nombreUsuario || !contrasena) {
        return res.status(400).json({ error: 'El nombre de usuario y contraseña son requeridos' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE nombre_usuario = $1',
            [nombreUsuario]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = result.rows[0];
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.hash_contrasena);

        if (!contrasenaValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Establecer sesión
        req.session.usuarioId = usuario.id;
        req.session.nombreUsuario = usuario.nombre_usuario;

        res.json({
            exito: true,
            usuario: {
                id: usuario.id,
                nombreUsuario: usuario.nombre_usuario
            }
        });
    } catch (error) {
        console.error('Error de inicio de sesión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint de cierre de sesión
enrutador.post('/cerrar-sesion', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.json({ exito: true });
    });
});

// Endpoint de verificación de sesión
enrutador.get('/verificar', (req, res) => {
    if (req.session.usuarioId) {
        res.json({
            autenticado: true,
            usuario: {
                id: req.session.usuarioId,
                nombreUsuario: req.session.nombreUsuario
            }
        });
    } else {
        res.json({ autenticado: false });
    }
});

// Middleware para proteger rutas
function requerirAutenticacion(req, res, next) {
    if (!req.session.usuarioId) {
        return res.status(401).json({ error: 'Se requiere autenticación' });
    }
    next();
}

module.exports = enrutador;
module.exports.requerirAutenticacion = requerirAutenticacion;
