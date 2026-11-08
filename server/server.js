// PetCare server for this computer: `npm run server`.
// Serves the API (server/api.js) and the built app from ../www, so after
// `npm run build` phones on the same Wi-Fi can open
// http://<this-computer's-IP>:3000.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handle, send, DB_FILE } = require('./api');

const PORT = Number(process.env.PORT) || 3000;
const WEB_ROOT = path.join(__dirname, '..', 'www');

// ---------- Static app (www) ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

function serveApp(req, res, pathname) {
  if (!fs.existsSync(WEB_ROOT)) {
    send(res, 404, { error: 'App not built yet. Run `npm run build` first.' });
    return;
  }

  let file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));

  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) {
    send(res, 403, { error: 'Forbidden' });
    return;
  }

  // Angular routes like /dashboard fall back to index.html.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(WEB_ROOT, 'index.html');
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'
  });
  fs.createReadStream(file).pipe(res);
}

// ---------- Server ----------

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname.startsWith('/api/')) {
    void handle(req, res);
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  serveApp(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(require('node:os').networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => `  http://${item.address}:${PORT}`);

  console.log(`PetCare server running. Database: ${DB_FILE}`);
  console.log(`  http://localhost:${PORT}`);
  addresses.forEach(line => console.log(line));
});
