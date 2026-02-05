# 🚀 Guía de Despliegue en Render.com

## ✅ Pre-requisitos Completados
- ✓ Código subido a GitHub: https://github.com/Marlyn-6/Estacion-Radio
- ✓ Archivo `render.yaml` configurado
- ✓ `.gitignore` y `package.json` listos para producción

---

## 📋 Paso a Paso: Desplegar en Render

### 1️⃣ Crear Cuenta en Render
1. Ve a **https://render.com**
2. Haz clic en **"Get Started"** o **"Sign Up"**
3. Regístrate usando tu cuenta de **GitHub** (recomendado)
4. Autoriza a Render para acceder a tus repositorios

---

### 2️⃣ Crear un Nuevo Web Service

1. En el dashboard de Render, haz clic en **"New +"** (esquina superior derecha)
2. Selecciona **"Web Service"**
3. Conecta tu repositorio:
   - Si no aparece, haz clic en **"Configure account"** para dar acceso
   - Busca y selecciona: **`Marlyn-6/Estacion-Radio`**
4. Haz clic en **"Connect"**

---

### 3️⃣ Configurar el Servicio

Render detectará automáticamente el archivo `render.yaml`, pero verifica lo siguiente:

#### Configuración Básica:
- **Name:** `radio-webrtc` (o el que prefieras)
- **Region:** Elige la más cercana (ej: `Oregon (US West)`)
- **Branch:** `main`
- **Runtime:** `Node`

#### Comandos de Build y Start:
- **Build Command:** `npm install`
- **Start Command:** `npm start`

---

### 4️⃣ Configurar Variables de Entorno

**⚠️ IMPORTANTE:** Haz clic en **"Advanced"** y añade estas variables de entorno:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `PORT` | *(Render lo maneja automáticamente)* | Puerto del servidor |
| `SESSION_SECRET` | `TuClaveSecretaSuperSegura123!@#` | Clave para sesiones (genera una aleatoria) |
| `NODE_ENV` | `production` | Modo de producción |

**Generador de SESSION_SECRET:** Puedes usar cualquier cadena larga y aleatoria. Ejemplo:
```
SESSION_SECRET=RadioWebRTC2026_Ultra$ecur3P@ssw0rd!
```

---

### 5️⃣ Plan y Despliegue

1. **Plan:** Selecciona **"Free"** (Gratis, ideal para empezar)
   - ⚠️ El plan gratuito se duerme después de 15 minutos de inactividad
   - Se despierta automáticamente cuando alguien accede (tarda ~30 segundos)

2. Haz clic en **"Create Web Service"**

3. **Espera el despliegue** (3-5 minutos):
   - Verás los logs en tiempo real
   - Espera a que diga: **"Your service is live 🎉"**

---

### 6️⃣ Verificar la URL

1. Una vez desplegado, Render te dará una URL como:
   ```
   https://radio-webrtc.onrender.com
   ```

2. **✅ IMPORTANTE para WebRTC:** La URL será **HTTPS automáticamente**
   - ✓ Esto es **obligatorio** para que el navegador permita usar el micrófono
   - ✓ Render proporciona certificados SSL gratuitos

---

## 🎤 Probar la Radio en Vivo

1. Ve a tu URL: `https://TU-APP.onrender.com`
2. Ingresa al panel de administración: `https://TU-APP.onrender.com/admin`
   - **Usuario:** `admin`
   - **Contraseña:** `admin123` (cámbiala después)
3. Ve a **"Transmisión en Vivo"**
4. Haz clic en **"Iniciar Transmisión"**
5. Permite el acceso al micrófono cuando el navegador lo solicite
6. **¡Ya estás transmitiendo en vivo!** 🎙️

---

## 🔧 Configuración Adicional (Opcional)

### Dominio Personalizado
1. En Render, ve a tu servicio
2. Haz clic en **"Settings"** → **"Custom Domain"**
3. Añade tu dominio (ej: `radio.tudominio.com`)
4. Configura los DNS según las instrucciones de Render

### Variables de Entorno Adicionales
Puedes añadir más variables en **Settings → Environment**:
- `STATION_NAME`: Nombre de tu radio
- `STATION_DESCRIPTION`: Descripción
- `ADMIN_USERNAME`: Usuario administrador
- `ADMIN_PASSWORD_HASH`: Hash de contraseña (usando bcrypt)

### Monitoreo
- **Logs:** Settings → Logs (ver en tiempo real)
- **Métricas:** Dashboard → Metrics (CPU, memoria, etc.)
- **Health Checks:** Render hace ping automático cada 5 minutos

---

## 🐛 Solución de Problemas

### El servicio no inicia
1. Revisa los logs: **Settings → Logs**
2. Verifica que `SESSION_SECRET` esté configurado
3. Asegúrate de que `npm install` se completó correctamente

### El micrófono no funciona
1. **Verifica que la URL sea HTTPS** (debe serlo en Render)
2. En el navegador, ve a Configuración → Privacidad → Micrófono
3. Permite el acceso al sitio de Render

### El plan gratuito se duerme
- Es normal, se despertará en ~30 segundos cuando alguien acceda
- Para evitarlo, actualiza al plan Starter ($7/mes)
- O usa un servicio de "keep-alive" como UptimeRobot

### Base de datos no persiste
- El plan gratuito de Render **no persiste el sistema de archivos**
- Necesitas conectar una base de datos PostgreSQL (también tiene plan gratuito)
- O actualizar al plan Starter para persistencia de archivos

---

## 📞 Soporte

- **Documentación oficial:** https://render.com/docs
- **Community Forum:** https://community.render.com
- **Status:** https://status.render.com

---

## ✅ Checklist de Despliegue

- [ ] Cuenta de Render creada
- [ ] Repositorio conectado
- [ ] Variables de entorno configuradas
- [ ] Servicio desplegado exitosamente
- [ ] URL HTTPS funcionando
- [ ] Panel de administración accesible
- [ ] Micrófono probado y funcionando
- [ ] Contraseña de admin cambiada

---

**¡Tu Radio WebRTC está lista para transmitir en vivo! 🎉🎙️**
