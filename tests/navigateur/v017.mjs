// v0.17 dans Chromium, écran 390 px (vols et avions INVENTÉS) : `arriveePosition` (arrivée sans code OACI) des vols NPF
// au format 2, via un FAUX NAS local. Arrivée avec code ; sans code avec position (dernier atterrissage classé de nuit à
// cette position, puis de jour quand on tape un code dont le terrain est de jour) ; sans code ni position ; vol passant
// minuit UTC ; point d'arrivée sur la Carte du vol (hors ligne). Toute adresse non locale est BLOQUÉE.
// Captures : tests/navigateur/captures/v017-*.png (non commitées). Usage : node tests/navigateur/v017.mjs
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const REUNION = { lat: -21.3, lon: 55.6 }; // 17:00 UTC en décembre = 21:00 à La Réunion : nuit
const v2 = (id, change) => ({ format: 'carnet-vol-npf', version: 2, id, exporteLe: H, date: '2025-12-21', blocDepart: '13:00', blocArrivee: '17:00',
  immat: 'F-XZZA', depart: 'FMEE', ...change });
const VOLS = [
  v2('npf-code', { arrivee: 'FMEP' }),
  v2('npf-pos', { arriveePosition: REUNION }),
  v2('npf-rien', {}),
  v2('npf-minuit', { date: '2025-08-14', blocDepart: '23:30', blocArrivee: '01:10', blocArriveeJ1: true, arriveePosition: REUNION }),
];
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  req.on('data', () => {}); req.on('end', () => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(a === 'vols-liste' ? { vols: VOLS } : { ok: true })); });
});
await new Promise(ok => fauxNas.listen(0, '127.0.0.1', ok));

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const bloquees = [];
await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; if (h === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
const base = (code, arg) => p.evaluate(async ([code, arg]) => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const r = await new Function('db', 'arg', `return (async () => { ${code} })()`)(db, arg); db.close(); return r;
}, [code, arg]);
const tout = m => base(`return await new Promise(ok => { const r = db.transaction('${m}').objectStore('${m}').getAll(); r.onsuccess = () => ok(r.result); });`);
const ouvrir = async id => { await p.click('#npf-bandeau'); await p.waitForSelector('#npf-l'); await p.click(`#npf-l [data-npf="${id}"]`); await p.waitForSelector('#v-saisie:not([hidden])'); };
const etatSaisie = () => p.evaluate(() => ({ arr: document.getElementById('f-arr').value, t0: document.getElementById('f-t0').value, t1: document.getElementById('f-t1').value,
  utc: document.getElementById('tz-utc').getAttribute('aria-pressed') === 'true', j: document.getElementById('s-attJour').textContent,
  n: document.getElementById('s-attNuit').textContent, bloc: document.getElementById('f-bloc').textContent, j1: !document.getElementById('f-j1').hidden,
  txt: document.getElementById('npf-txt').textContent }));
const taperArrivee = async code => { await p.fill('#f-arr', code); await p.dispatchEvent('#f-arr', 'input'); await attendre(150); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await base(`const t = db.transaction(['avions', 'reglages'], 'readwrite');
    t.objectStore('avions').put({ id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Modele essai', nom: 'M91', indicatif: '', constructeur: 'ESSAI', equipage: 'MP', moteurs: 'ME',
      moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: '${H}', modifieLe: '${H}' });
    const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: arg }); g.put({ cle: 'nasMotDePasse', valeur: 'essai' }); g.put({ cle: 'nasAuto', valeur: false });
    await new Promise(ok => { t.oncomplete = ok; });`, `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForFunction(() => !document.getElementById('npf-bandeau').hidden, null, { timeout: 10000 });

  console.log('Arrivée avec code');
  await ouvrir('npf-code');
  let s = await etatSaisie();
  verifier(s.arr === 'FMEP' && !s.txt.includes('arrivée') && s.n === '1' && s.j === '0', `arrivée FMEP : dernier atterrissage classé à FMEP (nuit), ${s.j} jour / ${s.n} nuit`);
  await p.click('#cancel');

  console.log('Arrivée sans code, avec position');
  await ouvrir('npf-pos');
  s = await etatSaisie();
  verifier(s.arr === '' && s.utc && s.t0 === '13h00' && s.t1 === '17h00', 'case Arrivée vide à compléter ; heures restées en UTC (fuseau d\'arrivée inconnu)');
  verifier(s.n === '1' && s.j === '0', `dernier atterrissage classé avec la position GPS (21h00 à La Réunion) : nuit (${s.j} jour / ${s.n} nuit)`);
  verifier(s.txt.includes('arrivée sans code OACI'), 'message : « arrivée sans code OACI : complète-la… »');
  await p.locator('#carte-zone').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPT, 'v017-01-arrivee-sans-code.png') });
  await taperArrivee('KJFK');
  s = await etatSaisie();
  verifier(s.n === '0' && s.j === '1', `je tape KJFK : le calcul reprend les coordonnées du terrain (12h00 à New York : jour, ${s.j} jour / ${s.n} nuit)`);
  await taperArrivee('');
  s = await etatSaisie();
  verifier(s.n === '1' && s.j === '0', 'j\'efface le code : la position GPS sert de nouveau (nuit)');
  await taperArrivee('ZZZZ');
  s = await etatSaisie();
  verifier(s.n === '1', 'code inconnu de la table (ZZZZ) : la position GPS sert encore');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(400);
  const vp = (await tout('vols')).find(v => v.npfId === 'npf-pos');
  verifier(vp && vp.arr === 'ZZZZ' && vp.attNuit === 1 && vp.arriveePosition && vp.arriveePosition.lat === REUNION.lat, 'enregistré : arrivée ZZZZ, 1 att. de nuit, position gardée pour la carte');

  console.log('Carte du vol : point d\'arrivée (hors ligne)');
  await ctx.setOffline(true);
  await p.click('#list .flight'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.waitForSelector('#carte-mini:not([hidden]) .carte-terrain', { timeout: 10000 });
  const etiquettes = await p.$$eval('#carte-mini .carte-terrain', l => l.map(x => x.textContent));
  verifier(etiquettes.includes('ZZZZ') && etiquettes.includes('FMEE'), 'point d\'arrivée sur la carte à sa position GPS : ' + etiquettes.join(', '));
  await p.locator('#carte-zone').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPT, 'v017-02-carte-arrivee.png') });
  await p.click('#cancel');
  await ctx.setOffline(false);

  console.log('Sans code ni position');
  await ouvrir('npf-rien');
  s = await etatSaisie();
  verifier(s.arr === '' && s.utc && s.txt.includes('arrivée à compléter') && s.j === '1' && s.n === '0', 'case vide, « arrivée à compléter », classement par défaut (jour) comme aujourd\'hui');
  await taperArrivee('FMEP');
  s = await etatSaisie();
  verifier(s.n === '1' && s.j === '0', 'code tapé : classement avec le terrain (nuit)');
  await p.click('#cancel');

  console.log('Vol passant minuit UTC, arrivée sans code');
  await ouvrir('npf-minuit');
  s = await etatSaisie();
  verifier(s.bloc === '1h40' && s.j1 && s.n === '1' && s.t1 === '01h10', `23h30 → 01h10 UTC (J+1), bloc ${s.bloc}, atterrissage de nuit à la position GPS`);
  await p.click('#cancel');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + bloquees.join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.17 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v017-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
