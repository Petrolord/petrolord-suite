// Serves a built Suite (dist/) on localhost with the SPA fallback, so a
// recording can run against an exact build. localhost counts as a secure
// origin, so the service worker and the Supabase session behave as live.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.txt': 'text/plain', '.las': 'text/plain', '.csv': 'text/csv' };

export function serveDist(dist, port = 4173) {
  const root = path.resolve(dist);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let f = path.join(root, url);
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dist, port] = process.argv.slice(2);
  await serveDist(dist, Number(port) || 4173);
  console.log(`serving ${dist} on http://127.0.0.1:${Number(port) || 4173}`);
}
