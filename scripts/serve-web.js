// 极简静态服务器：把 dist-web 跑在 http://127.0.0.1:8899
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dist-web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(String(req.url).split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const fp = path.join(root, rel);
    if (!fp.startsWith(root)) {
      res.writeHead(403);
      res.end('403');
      return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(8899, '127.0.0.1', () => console.log('dist-web serving on http://127.0.0.1:8899'));
