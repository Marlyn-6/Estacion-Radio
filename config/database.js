const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Configurar conexión a PostgreSQL
// DATABASE_URL será proporcionada por Render automáticamente
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function inicializarBaseDatos() {
  try {
    const client = await pool.connect();

    // Crear tabla usuarios
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre_usuario VARCHAR(255) UNIQUE NOT NULL,
        hash_contrasena TEXT NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla canciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS canciones (
        id SERIAL PRIMARY KEY,
        nombre_archivo TEXT NOT NULL,
        titulo TEXT,
        artista TEXT,
        album TEXT,
        duracion INTEGER,
        ruta_archivo TEXT NOT NULL,
        subido_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla listas_reproduccion
    await client.query(`
      CREATE TABLE IF NOT EXISTS listas_reproduccion (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        esta_activa BOOLEAN DEFAULT FALSE,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla canciones_lista (tabla de unión)
    await client.query(`
      CREATE TABLE IF NOT EXISTS canciones_lista (
        id SERIAL PRIMARY KEY,
        lista_id INTEGER NOT NULL,
        cancion_id INTEGER NOT NULL,
        posicion INTEGER DEFAULT 0,
        FOREIGN KEY (lista_id) REFERENCES listas_reproduccion(id) ON DELETE CASCADE,
        FOREIGN KEY (cancion_id) REFERENCES canciones(id) ON DELETE CASCADE
      )
    `);

    // Crear tabla estadisticas_transmision
    await client.query(`
      CREATE TABLE IF NOT EXISTS estadisticas_transmision (
        id SERIAL PRIMARY KEY,
        cantidad_oyentes INTEGER DEFAULT 0,
        esta_en_vivo BOOLEAN DEFAULT FALSE,
        cancion_actual_id INTEGER,
        modo_actual VARCHAR(50) DEFAULT 'autodj',
        registrado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cancion_actual_id) REFERENCES canciones(id)
      )
    `);

    // Crear usuario admin por defecto si no existe
    const adminResult = await client.query(
      'SELECT id FROM usuarios WHERE nombre_usuario = $1',
      ['admin']
    );

    if (adminResult.rows.length === 0) {
      const contrasenaDefecto = 'admin123';
      const hash = await bcrypt.hash(contrasenaDefecto, 10);
      await client.query(
        'INSERT INTO usuarios (nombre_usuario, hash_contrasena) VALUES ($1, $2)',
        ['admin', hash]
      );
      console.log('✓ Usuario admin por defecto creado (usuario: admin, contraseña: admin123)');
    }

    client.release();
    console.log('✓ Base de datos PostgreSQL inicializada exitosamente');
  } catch (error) {
    console.error('Error al inicializar base de datos:', error);
    throw error;
  }
}

// Función helper para ejecutar queries
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

module.exports = { pool, query, inicializarBaseDatos };
