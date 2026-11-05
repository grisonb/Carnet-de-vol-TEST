// Outils des tests navigateur : petit serveur web local + lancement de Chromium (Playwright).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

// Comme sur GitHub Pages, l'app est servie sous /Carnet-de-vol-TEST/. Le serveur imite aussi deux
// autres apps du même site (même origine), pour vérifier que Chrome ne les confond pas avec le Carnet.
// Leurs manifestes reprennent l'id / start_url / scope publiés par NPF-Q400-TEST et NPF-Q400.
export const DOSSIER = '/Carnet-de-vol-TEST/';
export const AUTRES_APPS = {
  '/NPF-Q400-TEST/': { name: 'NPF-Q400', short_name: 'NPF-Q400', id: './index.html?prod=1', start_url: './index.html?appv=test', scope: './' },
  '/NPF-Q400/': { name: 'NPF-Q400', short_name: 'NPF-Q400', id: './index.html?prod=1', start_url: './index.html?appv=prod', scope: './' },
};
function autreApp(chemin, res) {
  const dossier = Object.keys(AUTRES_APPS).find(d => chemin.startsWith(d));
  if (!dossier) return false;
  const reste = chemin.slice(dossier.length);
  if (reste === 'manifest.json') {
    const m = { ...AUTRES_APPS[dossier], display: 'standalone',
      icons: [{ src: '/Carnet-de-vol-TEST/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/Carnet-de-vol-TEST/icones/icone-512.png', sizes: '512x512', type: 'image/png' }] };
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); res.end(JSON.stringify(m));
  } else if (reste === 'sw.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end("self.addEventListener('fetch', e => {});");
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><link rel="manifest" href="manifest.json"><title>autre app</title><p>autre app</p>');
  }
  return true;
}

export function serveur() {
  const s = createServer(async (req, res) => {
    let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (autreApp(chemin, res)) return;
    if (!chemin.startsWith(DOSSIER)) { res.writeHead(404); return res.end(); }
    chemin = '/' + chemin.slice(DOSSIER.length);
    if (chemin.endsWith('/')) chemin += 'index.html';
    const f = normalize(join(RACINE, chemin));
    if (!f.startsWith(RACINE) || /node_modules|tests|outils|\.git/.test(f.slice(RACINE.length))) { res.writeHead(404); return res.end(); }
    try { const d = await readFile(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(d); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok({ origine: `http://127.0.0.1:${s.address().port}`, url: `http://127.0.0.1:${s.address().port}${DOSSIER}`, fermer: () => s.close() })));
}

export function playwright() {
  return createRequire(import.meta.url)(join(RACINE, 'node_modules/playwright'));
}

export const verifier = (cond, message) => { if (!cond) throw new Error('ÉCHEC : ' + message); console.log('  ✓ ' + message); };
