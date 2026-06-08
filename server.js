// javascript
// server.js
// Servidor estático para LATEnte — Sirve los archivos del frontend desde /public
 
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 
const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
 
// Mapeo de extensiones a Content-Type
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.mp3':  'audio/mpeg',
    '.wav':  'audio/wav',
};
 
const PRESETS_DIR = path.join(__dirname, 'presets');
 
// Asegurar que la carpeta presets/ existe (síncrono solo al iniciar)
try {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
} catch (e) {
    console.warn('No se pudo crear la carpeta presets/:', e.message);
}
 
const server = http.createServer((req, res) => {
    // ── API: Guardar preset en disco ──
    if (req.method === 'POST' && req.url === '/api/presets') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const preset = JSON.parse(body);
                const name = preset.name || 'sin-nombre';
                const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 48);
                const timestamp = Date.now();
                const fileName = `${safeName}_${timestamp}.json`;
                const filePath = path.join(PRESETS_DIR, fileName);
 
                fs.writeFile(filePath, JSON.stringify(preset, null, 2), 'utf-8', (err) => {
                    if (err) {
                        console.error('Error al guardar preset:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message }));
                        return;
                    }
                    console.log(`💾 Preset guardado en disco: ${fileName}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, fileName }));
                });
            } catch (err) {
                console.error('Error al parsear preset:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
            }
        });
        return;
    }
 
    // ── Servir archivos estáticos ──
    let urlPath = req.url.split('?')[0];
 
    if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
    }
 
    const filePath = path.join(PUBLIC_DIR, urlPath);
 
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }
 
    const ext = path.extname(filePath).toLowerCase();
 
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
            return;
        }
 
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});
 
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════╗');
    console.log('  ║     LATEnte — Visual Server      ║');
    console.log('  ╠══════════════════════════════════╣');
    console.log(`  ║  http://localhost:${PORT}            ║`);
    console.log(`  ║  http://localhost:${PORT}/visual.html ║`);
    console.log('  ╚══════════════════════════════════╝');
    console.log('');
});