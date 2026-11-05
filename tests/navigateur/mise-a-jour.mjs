// Mise à jour d'une app déjà installée (Chromium, Pixel 7) : on installe une ancienne version, on
// « publie » la version actuelle, puis on relance l'app comme sur le téléphone. Cas testés :
//   v0.1 (commit 690849d) -> actuelle ; v0.2 (commit deda13a, service worker module) -> actuelle ;
//   actuelle -> version suivante fictive (même code, numéro + 1).
// La nouvelle version doit s'afficher au plus tard au 2e lancement (dès le 1er à partir de la v0.3).
// Usage : node tests/navigateur/mise-a-jour.mjs
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { playwright, verifier, RACINE, DOSSIER } from './outils.mjs';
import { VERSION } from '../../js/version.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const tmp = await mkdtemp(join(tmpdir(), 'carnet-maj-'));
const ancienne = commit => { const d = join(tmp, commit); execSync(`mkdir -p "${d}" && git -C "${RACINE}" archive ${commit} | tar -x -C "${d}"`); return d; };
const suivante = String((Number(VERSION) + 0.1).toFixed(1));
const dSuivante = join(tmp, 'suivante');
await cp(RACINE, dSuivante, { recursive: true, filter: s => !/node_modules|\.git$|\/\.git\//.test(s) });
await writeFile(join(dSuivante, 'js/numero-version.js'), `globalThis.VERSION_CARNET = '${suivante}';\n`);

let racine;
// Comme GitHub Pages : fichiers sous /Carnet-de-vol-TEST/, gardés 10 min dans le cache HTTP du navigateur
const srv = createServer(async (req, res) => {
  let c = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!c.startsWith(DOSSIER)) { res.writeHead(404); return res.end(); }
  c = '/' + c.slice(DOSSIER.length); if (c.endsWith('/')) c += 'index.html';
  try { const d = await readFile(join(racine, c)); res.writeHead(200, { 'Content-Type': TYPES[extname(c)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}${DOSSIER}`;
const { chromium, devices } = playwright();
const navigateur = await chromium.launch();

async function scenario(nom, avant, apres, attendue, lancementMax) {
  console.log(nom);
  const ctx = await navigateur.newContext({ ...devices['Pixel 7'] });
  const lancer = async () => {
    const p = await ctx.newPage();
    await p.goto(url);
    let r;
    for (let i = 0; i < 6 && !r; i++) {
      try {
        await p.waitForSelector('body[data-pret="1"]', { timeout: 8000 });
        await p.waitForTimeout(2500); // laisse le temps à la vérification de mise à jour
        await p.waitForSelector('body[data-pret="1"]', { timeout: 8000 });
        r = await p.evaluate(async () => ({ v: (await import('./js/version.js')).VERSION, caches: await caches.keys() }));
      } catch { /* la page s'est rechargée pendant la lecture */ }
    }
    await p.close();
    return r || { v: '?', caches: [] };
  };
  racine = avant;
  await lancer(); await lancer();
  racine = apres;
  let n = 0, r;
  do { r = await lancer(); n++; console.log(`  lancement ${n} après publication : v${r.v}  caches ${r.caches.join(', ')}`); }
  while (r.v !== attendue && n < 4);
  verifier(r.v === attendue && n <= lancementMax, `v${attendue} affichée au lancement n°${n} (au plus tard le n°${lancementMax})`);
  verifier(r.caches.length === 1 && r.caches[0] === 'carnet-de-vol-v' + attendue, 'un seul cache, celui de la nouvelle version');
  await ctx.close();
}

try {
  await scenario('v0.1 -> v' + VERSION, ancienne('690849d'), RACINE, VERSION, 2);
  await scenario('v0.2 -> v' + VERSION, ancienne('deda13a'), RACINE, VERSION, 2);
  await scenario(`v${VERSION} -> v${suivante} (fictive)`, RACINE, dSuivante, suivante, 1);
  console.log('\nMises à jour : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.close();
  await rm(tmp, { recursive: true, force: true });
}
