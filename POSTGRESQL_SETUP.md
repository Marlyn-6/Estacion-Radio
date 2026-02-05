# 🗄️ Configuración de PostgreSQL en Render

## ✅ Cambios Realizados

Tu aplicación ahora usa **PostgreSQL** en lugar de SQLite, lo que proporciona:
- ✅ Mayor estabilidad en producción
- ✅ Datos persistentes (no se pierden al reiniciar)
- ✅ Mejor rendimiento
- ✅ Compatible con Render

---

## 📋 Pasos para Configurar PostgreSQL en Render

### 1️⃣ Crear Base de Datos PostgreSQL (Gratis)

1. Ve a tu dashboard de Render: https://dashboard.render.com
2. Haz clic en **"New +"** (esquina superior derecha)
3. Selecciona **"PostgreSQL"**
4. Configura:
   - **Name:** `radio-database` (o el nombre que prefieras)
   - **Database:** `radio_db`
   - **User:** `radio_user` (o deja el default)
   - **Region:** **La misma que tu Web Service** (importante!)
   - **PostgreSQL Version:** Deja la más reciente
   - **Plan:** **Free** (500MB de almacenamiento)

5. Haz clic en **"Create Database"**
6. **Espera 2-3 minutos** mientras Render crea la base de datos

---

### 2️⃣ Obtener la URL de Conexión

1. Una vez creada, Render mostrará los detalles de conexión
2. Busca la sección **"Connections"**
3. Copia el valor de **"Internal Database URL"** (comienza con `postgresql://...`)
   - **IMPORTANTE:** Usa la **Internal URL**, NO la External (es más rápida y gratuita)

---

### 3️⃣ Conectar la Base de Datos a tu Web Service

1. Ve a tu Web Service: **"Estación de radio"**
2. En el menú izquierdo, haz clic en **"Environment"**
3. Haz clic en **"Add Environment Variable"**
4. Agrega:

```
Key:   DATABASE_URL
Value: [Pega aquí la Internal Database URL que copiaste]
```

**Ejemplo de DATABASE_URL:**
```
postgresql://radio_user:XXXXXX@dpg-XXXXX-a/radio_db
```

5. Haz clic en **"Save Changes"**
6. Render reiniciará automáticamente tu servicio

---

### 4️⃣ Verificar que Funciona

1. Espera 2-3 minutos mientras Render despliega
2. Ve a los **Logs** de tu Web Service
3. Deberías ver:
   ```
   ✓ Base de datos PostgreSQL inicializada exitosamente
   ✓ Usuario admin por defecto creado
   🎵 Servidor Radio Online Iniciado 🎵
   ```

4. Abre tu URL: `https://estacion-radio.onrender.com`
5. **¡Debería funcionar!** ✅

---

## 🎯 Variables de Entorno Completas

Asegúrate de tener estas 3 variables en tu Web Service:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` | URL de conexión a PostgreSQL |
| `SESSION_SECRET` | Tu clave secreta | Para las sesiones de login |
| `NODE_ENV` | `production` | Modo de producción |

---

## 🔧 Solución de Problemas

### Error: "Connection refused" o "Cannot connect to database"

**Causa:** La `DATABASE_URL` no está configurada o es incorrecta

**Solución:**
1. Verifica que la variable `DATABASE_URL` existe en Environment
2. Asegúrate de usar la **Internal Database URL**
3. Verifica que la base de datos PostgreSQL esté en estado "Available"

---

### Error: "SSL connection required"

**Causa:** Render requiere SSL para conexiones externas

**Solución:**
- El código ya maneja esto automáticamente
- Asegúrate de usar la **Internal URL** (no requiere SSL)

---

### La base de datos está vacía después de reiniciar

**Solución:** Con PostgreSQL esto YA NO PASA
- Los datos persisten entre reinicios
- A diferencia de SQLite, PostgreSQL mantiene tus datos seguros

---

## 📊 Monitoreo de la Base de Datos

### Ver Métricas

1. Ve al dashboard de PostgreSQL en Render
2. Haz clic en **"Metrics"**
3. Verás:
   - Uso de almacenamiento
   - Conexiones activas
   - Consultas por segundo

### Hacer Backups

1. En el dashboard de PostgreSQL
2. Ve a **"Backups"**
3. Render hace backups automáticos diarios (plan gratuito: últimos 7 días)

---

## 🚀 Próximos Pasos

1. ✅ **Crea la base de datos PostgreSQL** (Paso 1)
2. ✅ **Conecta con DATABASE_URL** (Paso 3)
3. ✅ **Verifica que funciona** (Paso 4)
4. 🎉 **¡Tu radio está lista para producción!**

---

## 📝 Notas Importantes

- **Plan Gratuito PostgreSQL:**
  - 500MB de almacenamiento
  - 90 días de inactividad antes de suspender
  - Backups automáticos (últimos 7 días)

- **Persistencia de Archivos MP3:**
  - Los archivos MP3 subidos **NO persisten** en el plan gratuito de Web Services
  - Para persistir archivos, necesitas:
    - Plan Starter ($7/mes) con disco persistente
    - O usar almacenamiento externo (Amazon S3, Cloudinary, etc.)

- **Rendimiento:**
  - Internal URL es más rápida (misma región)
  - El plan gratuito es suficiente para empezar
  - Actualiza al plan Starter si necesitas más conexiones

---

¿Problemas? Revisa los logs en Render o consulta: https://render.com/docs/databases
