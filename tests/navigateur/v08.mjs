// v0.8 dans Chromium, écran 390 px : « Carte du vol » avec un FAUX serveur de traces (mot de passe, index,
// traces INVENTÉES) et un FAUX serveur de tuiles. Le vrai VPS n'est jamais appelé.
// Captures : tests/navigateur/captures/v08-*.png (non commitées). Usage : node tests/navigateur/v08.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP = 'mot-de-passe-essai';
const TUILE = readFileSync(join(RACINE, 'icones/icone-192.png'));
// Trace inventée : un point par minute de 22h00 (20/08) à 02h00 (21/08) entre Nice et Cannes
const fichier = (jour, h0, h1) => ({ hex: 'abc123', immat: 'F-XZZB', jour, source: 'Données © adsb.lol, ODbL',
  points: Array.from({ length: (h1 - h0) * 60 }, (_, k) => { const f = ((h0 * 60 + k) % 240) / 240; return [h0 * 3600 + k * 60, 43.665 - 0.117 * f + 0.05 * Math.sin(f * 6), 7.215 - 0.26 * f, 3000]; }) });
const INDEX = { maj: '2026-11-05T04:20:00Z', derniereArchive: '2026-11-04', avions: { 'F-XZZB': 'abc123' },
  traces: { abc123: ['2025-08-20', '2025-08-21'] }, source: 'Données © adsb.lol, ODbL' };
const demandes = [];
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (u.pathname.startsWith('/tuiles/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); demandes.push('tuile'); return res.end(TUILE); }
  demandes.push(u.pathname);
  if (req.headers.authorization !== 'Basic ' + Buffer.from('carnet:' + MDP).toString('base64')) { res.writeHead(401); return res.end('Code refusé'); }
  const json = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/carnet-traces/index.json') return json(INDEX);
  const m = u.pathname.match(/^\/carnet-traces\/traces\/abc123\/(2025-08-2[01])\.json$/);
  if (m) return json(m[1] === '2025-08-20' ? fichier(m[1], 22, 24) : fichier(m[1], 0, 2));
  res.writeHead(404); res.end();
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const FAUX = `http://127.0.0.1:${faux.address().port}`;

const { chromium } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.addInitScript(([s, t]) => { window.CARNET_SERVEUR_TRACES = s; window.CARNET_TUILES = t; }, [`${FAUX}/carnet-traces/`, `${FAUX}/tuiles/{z}/{x}/{y}.png`]);
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
const lireVol = id => p.evaluate(async id => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const lire = (m, k) => new Promise(ok => { const q = db.transaction(m).objectStore(m).get(k); q.onsuccess = () => ok(q.result); });
  const v = await lire('vols', id), t = await lire('traces', id); db.close();
  return { vol: v, trace: t };
}, id);
const ouvrirVol = async texte => {
  await p.click('.tabs button[data-v="carnet"]');
  await p.click(`.flight:has-text("${texte}")`);
  await p.waitForSelector('#v-saisie:not([hidden])');
};
const texteCarte = async () => { await p.waitForFunction(() => document.querySelector('#carte-txt').textContent !== 'Recherche de la trace…'); return p.textContent('#carte-txt'); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v08.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');

  console.log('Sans mot de passe');
  await ouvrirVol('Dash 8 Q400');
  verifier(await texteCarte() === 'Saisis le mot de passe des cartes dans Plus.', 'texte « Saisis le mot de passe des cartes dans Plus. »');
  verifier((await p.textContent('#carte-source')) === 'Données © adsb.lol, ODbL', 'mention « Données © adsb.lol, ODbL » sous la carte');
  await p.click('#cancel');
  await p.click('#fab');
  verifier(await texteCarte() === 'La trace sera disponible demain matin, si l\'avion a été capté.', 'nouveau vol : « disponible demain matin »');
  await p.click('#cancel');

  console.log('Plus › Cartes de vol');
  await p.click('.tabs button[data-v="plus"]');
  await p.click('#pl-cartes');
  await p.fill('#cv-mdp', 'faux');
  await p.click('#cv-test');
  await p.waitForFunction(() => document.querySelector('#cv-res').textContent !== 'Test en cours…');
  verifier(await p.textContent('#cv-res') === 'Mot de passe refusé.', 'Tester : mot de passe refusé');
  await p.fill('#cv-mdp', MDP);
  await p.click('#cv-test');
  await p.waitForFunction(() => document.querySelector('#cv-res').textContent !== 'Test en cours…');
  verifier(await p.textContent('#cv-res') === 'OK : le serveur répond.', 'Tester : OK');
  await p.screenshot({ path: join(CAPT, 'v08-01-plus-cartes.png') });
  await p.click('#cv-ok');
  await p.waitForTimeout(1500);

  console.log('Codes ADS-B depuis le serveur');
  const hex = await p.evaluate(async () => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const l = await new Promise(ok => { const q = db.transaction('avions').objectStore('avions').getAll(); q.onsuccess = () => ok(q.result); });
    db.close(); return Object.fromEntries(l.map(a => [a.immat, a.hexAdsb || '']));
  });
  verifier(hex['F-XZZB'] === 'abc123' && hex['F-XZZA'] === '', 'code ADS-B rempli dans la fiche depuis la liste du serveur (et seulement là où il existe)');

  console.log('Carte avec fond (tuiles simulées)');
  await ouvrirVol('Dash 8 Q400');
  await p.waitForSelector('#carte-mini:not([hidden]) .leaflet-tile-loaded', { timeout: 15000 });
  verifier(await p.locator('#carte-mini path.leaflet-interactive').count() >= 1, 'trace dessinée (trait)');
  verifier(JSON.stringify(await p.$$eval('#carte-mini .carte-terrain', l => l.map(x => x.textContent).sort())) === '["LFMD","LFMN"]', 'terrains de départ et d\'arrivée marqués et nommés');
  verifier((await p.textContent('#carte-mini .leaflet-control-attribution')).includes('OpenStreetMap'), 'mention « © OpenStreetMap » sur la carte');
  verifier(demandes.includes('tuile'), 'fond de carte chargé (serveur de tuiles simulé)');
  await p.locator('#carte-zone').screenshot({ path: join(CAPT, 'v08-02-carte-fond.png') });
  const ids = await p.evaluate(async () => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = await new Promise(ok => { const q = db.transaction('traces').objectStore('traces').getAll(); q.onsuccess = () => ok(q.result); });
    db.close(); return t.filter(x => x.id !== '__index__').map(x => [x.id, x.etat, x.points.length, x.points[0][0], x.points.at(-1)[0]]);
  });
  verifier(ids.length === 1 && ids[0][1] === 'ok' && ids[0][2] === 101, `trace rangée sur le téléphone, découpée aux heures bloc : ${ids[0]?.[2]} points`);
  verifier(new Date(ids[0][3]).toISOString() === '2025-08-20T23:20:00.000Z' && new Date(ids[0][4]).toISOString() === '2025-08-21T01:00:00.000Z',
    'de 23h20 à 01h00 UTC (bloc 23h30 → 00h50, par-dessus minuit, marge 10 min)');
  const { vol } = await lireVol(ids[0][0]);
  verifier(vol.hDep === '23:30' && vol.hArr === '00:50' && vol.tempsTotal === 80 && vol.dep === 'LFMN' && vol.arr === 'LFMD', 'heures et terrains du vol inchangés');

  console.log('Plein écran');
  await p.click('#carte-mini');
  await p.waitForSelector('#carte-plein:not([hidden]) #carte-grande .leaflet-tile-loaded');
  verifier(await p.isVisible('#carte-grande .leaflet-control-zoom'), 'plein écran : zoom (boutons + pincement au doigt)');
  const dessus = await p.evaluate(() => { const r = document.querySelector('#carte-grande').getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.bottom - 60); return !!e.closest('#carte-plein'); });
  verifier(dessus, 'plein écran : rien de la page ne passe par-dessus la carte');
  await p.screenshot({ path: join(CAPT, 'v08-03-plein-ecran.png') });
  await p.click('#cp-x');
  verifier(await p.isHidden('#carte-plein'), 'bouton × : ferme le plein écran');
  await p.click('#cancel');

  console.log('Autres cas');
  await ouvrirVol('CL-415');
  verifier(await texteCarte() === 'Pas d\'archive ADS-B avant mars 2023.', 'vol de 2020 : « Pas d\'archive ADS-B avant mars 2023. »');
  await p.click('#cancel');
  await ouvrirVol('Simulateur');
  verifier(await texteCarte() === 'Pas de carte pour un vol au simulateur.', 'simulateur : pas de carte');
  await p.click('#cancel');

  console.log('Sans réseau');
  const avant = demandes.length;
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await ouvrirVol('Dash 8 Q400');
  await p.waitForSelector('#carte-mini:not([hidden]) path.leaflet-interactive');
  verifier(await p.$eval('#carte-mini', e => e.classList.contains('sans-fond')) && await p.locator('#carte-mini .leaflet-tile').count() === 0,
    'hors ligne : trace et terrains sur fond neutre, sans tuiles');
  verifier(demandes.length === avant, 'hors ligne : aucune demande au serveur');
  await p.locator('#carte-zone').screenshot({ path: join(CAPT, 'v08-04-carte-hors-ligne.png') });
  await p.click('#cancel');
  await ctx.setOffline(false);

  console.log('Vol modifié : trace recalculée');
  await ouvrirVol('Dash 8 Q400');
  await p.fill('#f-t0', ''); await p.type('#f-t0', '0145'); await p.type('#f-t1', '0300'); // LOC Nice = 23h45 -> 01h00 UTC
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])');
  await ouvrirVol('Dash 8 Q400');
  await p.waitForSelector('#carte-mini:not([hidden]) path.leaflet-interactive');
  const t2 = (await lireVol(ids[0][0])).trace;
  verifier(new Date(t2.points[0][0]).toISOString() === '2025-08-20T23:35:00.000Z' && new Date(t2.points.at(-1)[0]).toISOString() === '2025-08-21T01:10:00.000Z',
    'heures modifiées : la trace est redécoupée (23h35 → 01h10 UTC)');

  verifier(erreurs.length === 0, 'aucune erreur JavaScript ' + erreurs.join(' | '));
  console.log('\nv0.8 : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); faux.close();
}
