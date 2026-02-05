# 🎵 Radio Online - Estación de Radio en Vivo

Plataforma completa de radio online con transmisión en vivo, AutoDJ, y panel de administración.

## ✨ Características

### Panel de Administración
- 🔐 Autenticación segura
- 📊 Dashboard con estadísticas en tiempo real
- 🎤 Transmisión en vivo con micrófono
- 📁 Gestión de biblioteca musical (upload MP3)
- 📋 Creación y administración de playlists
- 🤖 Sistema AutoDJ automático
- 👥 Contador de oyentes en vivo

### Interfaz Pública
- 🎨 Diseño moderno con glassmorphism
- ▶️ Reproductor web integrado
- 📡 Visualizador de audio en tiempo real
- 🎵 Muestra canción actual
- 📈 Estadísticas de oyentes
- 📱 Diseño responsive

## 🚀 Instalación

### Requisitos Previos
- Node.js 16+ installed
- Cuenta en servidor Icecast gratuito (ej: Caster.fm) o Icecast auto-alojado

### Pasos de Instalación

1. **Instalar dependencias:**
```bash
cd C:\Users\Lyan\Documents\Radio
npm install
```

2. **Configurar variables de entorno:**
```bash
# Copia el archivo de ejemplo
copy .env.example .env

# Edita .env con tu editor favorito y configura:
# - SESSION_SECRET (genera una clave aleatoria segura)
# - Datos de tu servidor Icecast (ICECAST_HOST, ICECAST_PORT, etc.)
# - Información de tu estación (STATION_NAME, STATION_DESCRIPTION)
```

3. **Obtener servidor Icecast gratuito (Caster.fm):**
   - Visita https://caster.fm/free-shoutcast-icecast-hosting/
   - Regístrate para una cuenta gratuita
   - Obtén tus credenciales: host, puerto, password, mount point
   - Actualiza el archivo `.env` con estos datos

4. **Iniciar el servidor:**
```bash
npm start
```

El servidor estará corriendo en: `http://localhost:3000`

## 📖 Uso

### Acceso Inicial

**Panel de Administración:**
- URL: `http://localhost:3000/admin`
- Usuario por defecto: `admin`
- Contraseña por defecto: `admin123`

**Página Pública:**
- URL: `http://localhost:3000`
- Sin autenticación requerida

### Flujo de Trabajo

1. **Configurar tu estación:**
   - Inicia sesión en el panel admin
   - Ve a "Música" y sube tus archivos MP3
   - Ve a "Playlists" y crea una nueva playlist
   - Agrega canciones a la playlist

2. **Activar AutoDJ:**
   - En "Playlists", selecciona una playlist
   - Haz clic en "Activar AutoDJ"
   - La playlist comenzará a reproducirse automáticamente

3. **Transmitir en Vivo:**
   - Ve a "En Vivo"
   - Haz clic en "Habilitar Micrófono" (permite el acceso)
   - Haz clic en "Salir en Vivo"
   - ¡Habla! Tu voz se transmitirá en tiempo real

4. **Oyentes:**
   - Los usuarios visitan `http://localhost:3000`
   - Hacen clic en "Escuchar en Vivo"
   - Disfrutan de la música/transmisión

## 🛠️ Configuración de Icecast

### Opción 1: Caster.fm (Recomendado para principiantes)

Servicio gratuito con hasta 400 oyentes:

1. Regístrate en https://caster.fm
2. Crea un servidor Icecast gratuito
3. Obtén tus credenciales
4. Actualiza `.env`:
```env
ICECAST_HOST=stream.caster.fm
ICECAST_PORT=8000
ICECAST_PASSWORD=tu-password-aqui
ICECAST_MOUNT=/live.mp3
ICECAST_STREAM_URL=http://stream.caster.fm:8000/live.mp3
```

### Opción 2: Auto-alojado (Avanzado)

Si prefieres instalar Icecast en tu propio servidor:

1. Descarga Icecast: https://icecast.org/download/
2. Instala y configura `icecast.xml`
3. Inicia el servidor Icecast
4. Actualiza `.env` con `localhost` o tu IP

## 📁 Estructura del Proyecto

```
Radio/
├── config/
│   └── database.js          # Configuración de SQLite
├── routes/
│   ├── auth.js              # Rutas de autenticación
│   ├── songs.js             # Gestión de canciones
│   ├── playlists.js         # Gestión de playlists
│   └── streaming.js         # Control de streaming
├── services/
│   └── StreamingService.js  # Lógica de streaming
├── public/
│   ├── admin/              # Panel de administración
│   │   ├── index.html      # Login
│   │   ├── dashboard.html  # Dashboard
│   │   ├── live.html       # Transmisión en vivo
│   │   ├── music.html      # Gestión de música
│   │   ├── playlists.html  # Gestión de playlists
│   │   └── css/admin-styles.css
│   ├── index.html          # Página pública
│   ├── css/styles.css      # Estilos públicos
│   └── js/player.js        # Reproductor web
├── uploads/                # Archivos MP3 subidos
├── server.js               # Servidor principal
├── package.json
└── .env                    # Variables de entorno
```

## 🔧 Tecnologías Utilizadas

- **Backend:** Node.js, Express, Socket.IO
- **Base de Datos:** SQLite (better-sqlite3)
- **Streaming:** Icecast
- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Audio:** Web Audio API, getUserMedia API
- **Tiempo Real:** Socket.IO (WebSocket)

## 🎨 Personalización

### Cambiar nombre y descripción de la estación:

Edita `.env`:
```env
STATION_NAME=Tu Radio Increíble
STATION_DESCRIPTION=La mejor música de tu ciudad
```

### Cambiar logo:

1. Edita `public/index.html` y `public/admin/index.html`
2. Reemplaza el emoji 🎵 con tu logo o imagen

### Colores y estilo:

Edita las variables CSS en:
- `public/css/styles.css` (página pública)
- `public/admin/css/admin-styles.css` (panel admin)

## 📡 Integración con Icecast

La aplicación envía audio a Icecast, que luego distribuye el stream a los oyentes. El flujo es:

```
Admin (Micrófono) → Node.js → Icecast → Oyentes
```

Para AutoDJ:
```
Archivos MP3 → Node.js (StreamingService) → Icecast → Oyentes
```

## ⚠️ Notas Importantes

1. **Permisos de Micrófono:** Los navegadores requieren HTTPS para acceso al micrófono en producción. Para desarrollo local, HTTP funciona.

2. **Archivos MP3:** Solo se aceptan archivos .mp3. La aplicación extrae automáticamente los metadatos (título, artista, duración).

3. **Seguridad:** Cambia la contraseña del admin por defecto en producción.

4. **Icecast Stream URL:** Actualiza `public/js/player.js` con tu URL real de Icecast para que los oyentes puedan escuchar.

## 🐛 Solución de Problemas

**El micrófono no funciona:**
- Verifica que hayas dado permisos al navegador
- En Chrome, ve a Settings → Privacy → Microphone

**No se suben archivos:**
- Verifica que la carpeta `uploads/` exista y tenga permisos de escritura
- Límite de tamaño: 50MB por archivo

**Los oyentes no escuchan audio:**
- Verifica que Icecast esté corriendo
- Verifica la URL de stream en `player.js`
- Verifica las credenciales de Icecast en `.env`

**Error de base de datos:**
- Elimina `database.sqlite` y reinicia el servidor
- Se creará una nueva base de datos con el usuario admin por defecto

## 📄 Licencia

MIT License - Libre para uso educativo y comercial.

## 👨‍💻 Desarrollo

Para desarrollo con auto-reload:
```bash
npm install -g nodemon
npm run dev
```

## 🙏 Créditos

Desarrollado como práctica escolar enfocada en plataformas digitales y streaming.
