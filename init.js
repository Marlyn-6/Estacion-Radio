// Script de inicialización para asegurar que existan las carpetas necesarias
const fs = require('fs');
const path = require('path');

// Crear directorios necesarios si no existen
const directorios = ['subidas', 'data'];

directorios.forEach(dir => {
    const rutaCompleta = path.join(__dirname, dir);
    if (!fs.existsSync(rutaCompleta)) {
        fs.mkdirSync(rutaCompleta, { recursive: true });
        console.log(`✓ Directorio creado: ${dir}`);
    }
});

console.log('✓ Inicialización completada');
