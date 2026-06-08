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

const server = http.createServer((req, res) => {
    // Sanitizar la URL: evitar path traversal
    let urlPath = req.url.split('?')[0]; // quitar query params

    // Si la ruta termina en /, servir index.html
    if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
    }

    // Construir ruta absoluta dentro de public/
    const filePath = path.join(PUBLIC_DIR, urlPath);

    // Verificar que la ruta está dentro de public/ (seguridad)
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Obtener extensión
    const ext = path.extname(filePath).toLowerCase();

    // Leer y servir el archivo
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
