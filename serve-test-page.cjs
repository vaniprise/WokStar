/**
 * Standalone server for the LiquidFun test page only.
 * Serves public/ with NO Content-Security-Policy headers so eval/WASM work.
 * Run: node serve-test-page.cjs   or   npm run test-page
 * Then open: http://localhost:3080/test-wok-svg.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3080;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const pathname = req.url?.split('?')[0] || '/';
  const file = pathname === '/' ? '/test-wok-svg.html' : pathname;
  const filePath = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, ''));

  if (!path.resolve(filePath).startsWith(path.resolve(PUBLIC))) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end();
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Test page server: http://localhost:${PORT}/test-wok-svg.html`);
  console.log('(No CSP headers — use this if Chrome blocks eval on the Vite server.)');
});
