// Minimal static file server for local previews and headless captures.
// usage: node tools/serve.cjs <root> <port>
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const port = +(process.argv[3] || 8862);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.json': 'application/json', '.csv': 'text/csv', '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.vtt': 'text/vtt; charset=utf-8'
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    const data = fs.readFileSync(f);
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port));
