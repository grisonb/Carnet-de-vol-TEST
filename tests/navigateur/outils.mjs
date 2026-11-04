// Outils des tests navigateur : petit serveur web local + lancement de Chromium (Playwright).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

export function serveur() {
  const s = createServer(async (req, res) => {
    let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    const f = normalize(join(RACINE, chemin));
    if (!f.startsWith(RACINE) || /node_modules|tests|outils|\.git/.test(f.slice(RACINE.length))) { res.writeHead(404); return res.end(); }
    try { const d = await readFile(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(d); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${s.address().port}/`, fermer: () => s.close() })));
}

export function playwright() {
  return createRequire(import.meta.url)(join(RACINE, 'node_modules/playwright'));
}

export const verifier = (cond, message) => { if (!cond) throw new Error('ÉCHEC : ' + message); console.log('  ✓ ' + message); };
