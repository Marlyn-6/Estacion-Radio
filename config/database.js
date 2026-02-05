const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const rutaBaseDatos = path.join(__dirname, '..', 'basedatos.sqlite');
const bd = new Database(rutaBaseDatos);

// Habilitar claves foráneas
bd.pragma('foreign_keys = ON');

function inicializarBaseDatos() {
  // Crear tabla usuarios
  bd.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_usuario TEXT UNIQUE NOT NULL,
      hash_contrasena TEXT NOT NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla canciones
  bd.exec(`
    CREATE TABLE IF NOT EXISTS canciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_archivo TEXT NOT NULL,
      titulo TEXT,
      artista TEXT,
      album TEXT,
      duracion INTEGER,
      ruta_archivo TEXT NOT NULL,
      subido_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla listas_reproduccion
  bd.exec(`
    CREATE TABLE IF NOT EXISTS listas_reproduccion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      esta_activa BOOLEAN DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla canciones_lista (tabla de unión)
  bd.exec(`
    CREATE TABLE IF NOT EXISTS canciones_lista (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lista_id INTEGER NOT NULL,
      cancion_id INTEGER NOT NULL,
      posicion INTEGER DEFAULT 0,
      FOREIGN KEY (lista_id) REFERENCES listas_reproduccion(id) ON DELETE CASCADE,
      FOREIGN KEY (cancion_id) REFERENCES canciones(id) ON DELETE CASCADE
    )
  `);

  // Crear tabla estadisticas_transmision
  bd.exec(`
    CREATE TABLE IF NOT EXISTS estadisticas_transmision (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cantidad_oyentes INTEGER DEFAULT 0,
      esta_en_vivo BOOLEAN DEFAULT 0,
      cancion_actual_id INTEGER,
      modo_actual TEXT DEFAULT 'autodj',
      registrado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cancion_actual_id) REFERENCES canciones(id)
    )
  `);

  // Crear usuario admin por defecto si no existe
  const adminExiste = bd.prepare('SELECT id FROM usuarios WHERE nombre_usuario = ?').get('admin');

  if (!adminExiste) {
    const contrasenaDefecto = 'admin123';
    const hash = bcrypt.hashSync(contrasenaDefecto, 10);
    bd.prepare('INSERT INTO usuarios (nombre_usuario, hash_contrasena) VALUES (?, ?)').run('admin', hash);
    console.log('✓ Usuario admin por defecto creado (usuario: admin, contraseña: admin123)');
  }

  console.log('✓ Base de datos inicializada exitosamente');
}

module.exports = { bd, inicializarBaseDatos };
