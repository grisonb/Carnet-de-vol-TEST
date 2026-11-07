// v0.16 (suite) dans Chromium, écran 390 px (vols et avions INVENTÉS) : R46 terrains par défaut d'un nouveau vol
// (arrivée du dernier vol -> LFTW), R47 sélection du code au toucher, R48 bouton « LF » (2 lettres, terrain hors LF,
// mémorisé), vol NPF-Q400 non modifié par ces défauts, R49 Plus › Importer des fiches avions (aperçu, Annuler,
// Appliquer, avion introuvable, rien d'autre modifié). Toute adresse non locale est BLOQUÉE.
// Captures : tests/navigateur/captures/v016b-*.png (non commitées). Usage : node tests/navigateur/v016b.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const avion = (id, immat, typeOACI, modele) => ({ id, immat, typeOACI, modele, constructeur: 'ESSAI', nom: '', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H });
const vol = (id, date, dep, arr) => ({ id, date, hDep: '10:00', hArr: '11:00', mode: 'utc', dep, arr, escales: [], avionId: 'a1', tempsTotal: 60,
  tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 60, fonction: 'cdb', nomCdB: 'SELF', nomCopi: '', missions: [], remarques: '', feux: 0,
  compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(date), creeLe: H, modifieLe: H });

// Faux NAS : un vol NPF (format 2) avec ses propres terrains, un autre sans terrains
const NPF = [{ format: 'carnet-vol-npf', version: 2, id: 'npf-t1', exporteLe: H, date: '2026-01-05', blocDepart: '10:00', blocArrivee: '11:00',
  immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFKJ' },
{ format: 'carnet-vol-npf', version: 2, id: 'npf-t2', exporteLe: H, date: '2026-01-06', blocDepart: '10:00', blocArrivee: '11:00', immat: 'F-XZZA' }];
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  req.on('data', () => {}); req.on('end', () => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(a === 'vols-liste' ? { vols: NPF } : { ok: true })); });
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
const ecrire = (magasin, lignes) => base(`const t = db.transaction('${magasin}', 'readwrite'); for (const l of arg) t.objectStore('${magasin}').put(l); await new Promise(ok => { t.oncomplete = ok; });`, lignes);
const tout = m => base(`return await new Promise(ok => { const r = db.transaction('${m}').objectStore('${m}').getAll(); r.onsuccess = () => ok(r.result); });`);
const recharger = async () => { await p.reload(); await p.waitForSelector('body[data-pret="1"]'); };
const nouveauVol = async () => { await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])'); };
const terrains = () => p.evaluate(() => [document.getElementById('f-dep').value, document.getElementById('f-arr').value].join(' → '));
const selection = sel => p.$eval(sel, e => [e.selectionStart, e.selectionEnd, e.value, document.activeElement === e]);

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await ecrire('avions', [avion('a1', 'F-XZZA', 'DH8D', 'Modele essai'), avion('a2', 'F-XZZB', 'DR40', 'DR400')]);
  await recharger();

  console.log('R46 : terrains par défaut d\'un nouveau vol');
  await nouveauVol();
  verifier(await terrains() === 'LFTW → LFTW', 'premier vol : LFTW → LFTW');
  await p.click('#cancel');
  await ecrire('vols', [vol('v1', '2026-01-02', 'LFTW', 'LFPB')]); await recharger();
  await nouveauVol();
  verifier(await terrains() === 'LFPB → LFTW', 'après LFTW → LFPB : nouveau vol LFPB → LFTW');
  await p.click('#cancel');
  await ecrire('vols', [vol('v2', '2026-01-03', 'LFPB', 'LFLY')]); await recharger();
  await nouveauVol();
  verifier(await terrains() === 'LFLY → LFTW', 'après LFPB → LFLY : nouveau vol LFLY → LFTW');
  await p.click('#cancel');
  await ecrire('vols', [vol('v3', '2026-01-04', 'LFLY', 'LFTW')]); await recharger();
  await nouveauVol();
  verifier(await terrains() === 'LFTW → LFTW', 'dernier vol arrivé à LFTW : LFTW → LFTW');
  await p.click('#cancel');
  await p.click('#list .flight'); await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await terrains() === 'LFLY → LFTW' && await p.textContent('#f-title') === 'Modifier le vol', 'vol existant modifié : ses terrains ne changent pas');
  await p.click('#cancel');

  console.log('R47 : toucher une case terrain sélectionne le code');
  await nouveauVol();
  await p.tap('#f-dep'); await attendre(150);
  let s = await selection('#f-dep');
  verifier(s[0] === 0 && s[1] === 4 && s[3], 'départ : tout le code sélectionné au toucher');
  await p.keyboard.type('LFMN');
  verifier(await p.inputValue('#f-dep') === 'LFMN' && await p.evaluate(() => document.activeElement.id) === 'f-arr', 'je tape LFMN : il remplace l\'ancien code, passage à l\'arrivée');
  await attendre(150);
  s = await selection('#f-arr');
  verifier(s[0] === 0 && s[1] === 4, 'arrivée : tout le code sélectionné aussi');
  await p.tap('#via-add'); await p.waitForSelector('#via-modal:not([hidden])'); await attendre(200);
  await p.keyboard.type('LFMD'); await p.click('#vm-ok');
  await p.tap('#via-list .viachip'); await p.waitForSelector('#via-modal:not([hidden])'); await attendre(150);
  s = await selection('#vm-icao');
  verifier(s[0] === 0 && s[1] === 4 && s[2] === 'LFMD', 'terrain intermédiaire : tout le code sélectionné au toucher');
  await p.keyboard.type('LFKB'); await p.click('#vm-ok');
  verifier((await p.textContent('#via-list')).includes('LFKB'), '  remplacé par LFKB');
  await p.click('#cancel');

  console.log('R48 : bouton « LF »');
  await nouveauVol();
  const lf = await p.$eval('#tz-lf', e => ({ r: e.getBoundingClientRect().toJSON(), d: document.getElementById('f-date').getBoundingClientRect().toJSON(),
    l: document.getElementById('tz-loc').getBoundingClientRect().toJSON(), pr: e.getAttribute('aria-pressed') }));
  verifier(lf.pr === 'false' && lf.r.left > lf.d.right && lf.r.right < lf.l.left && lf.l.right <= 390, 'bouton « LF » entre la date et « LOC », désactivé au départ');
  await p.click('#tz-lf');
  verifier(await p.getAttribute('#tz-lf', 'aria-pressed') === 'true', 'activé');
  await p.screenshot({ path: join(CAPT, 'v016b-01-bouton-lf.png') });
  await p.tap('#f-dep'); await attendre(150);
  s = await selection('#f-dep');
  verifier(s[0] === 2 && s[1] === 4 && s[2] === 'LFTW', 'LF activé : seules les 2 dernières lettres sont sélectionnées');
  await p.keyboard.type('MN');
  verifier(await p.inputValue('#f-dep') === 'LFMN' && await p.evaluate(() => document.activeElement.id) === 'f-arr', 'je tape « MN » : LFMN, passage à l\'arrivée');
  await attendre(150);
  await p.keyboard.type('PB');
  verifier(await p.inputValue('#f-arr') === 'LFPB' && await p.evaluate(() => document.activeElement.id) === 'f-t0', 'arrivée « PB » : LFPB, passage à l\'heure');
  await p.fill('#f-arr', ''); await p.$eval('#f-arr', e => e.blur()); await p.tap('#f-arr'); await attendre(150);
  verifier(await p.inputValue('#f-arr') === 'LF', 'case vide touchée : « LF » déjà écrit');
  await p.keyboard.type('MD');
  verifier(await p.inputValue('#f-arr') === 'LFMD', '  « MD » : LFMD');
  // Terrain hors LF : effacer le « LF » (retour arrière) libère la case
  await p.tap('#f-dep'); await attendre(150);
  await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
  verifier(await p.inputValue('#f-dep') === '', 'retour arrière jusqu\'à effacer « LF » : la case est libre');
  await p.keyboard.type('EGLL');
  verifier(await p.inputValue('#f-dep') === 'EGLL', 'terrain hors LF : EGLL');
  await p.screenshot({ path: join(CAPT, 'v016b-02-hors-lf.png') });
  await p.click('#cancel');
  await recharger(); await nouveauVol();
  verifier(await p.getAttribute('#tz-lf', 'aria-pressed') === 'true', 'LF mémorisé après fermeture et réouverture de l\'app');
  await p.click('#tz-lf');
  await p.tap('#f-dep'); await attendre(150);
  s = await selection('#f-dep');
  await p.keyboard.type('EGLL');
  verifier(s[0] === 0 && s[1] === 4 && await p.inputValue('#f-dep') === 'EGLL', 'LF désactivé : saisie normale des 4 lettres');
  await p.click('#cancel');

  console.log('Vol NPF-Q400 : ses terrains priment');
  await base(`const t = db.transaction('reglages', 'readwrite'); const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: arg }); g.put({ cle: 'nasMotDePasse', valeur: 'essai' }); g.put({ cle: 'nasAuto', valeur: false }); await new Promise(ok => { t.oncomplete = ok; });`,
    `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`);
  await recharger();
  await p.waitForFunction(() => !document.getElementById('npf-bandeau').hidden, null, { timeout: 10000 });
  await p.click('#npf-bandeau'); await p.click('#npf-l [data-npf="npf-t1"]'); await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await terrains() === 'LFMN → LFKJ', 'vol NPF : LFMN → LFKJ (pas LFTW)');
  await p.click('#cancel');
  await p.click('#npf-bandeau'); await p.click('#npf-l [data-npf="npf-t2"]'); await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await terrains() === ' → ', 'vol NPF sans terrains : cases vides à compléter (pas de terrain par défaut)');
  await p.click('#cancel');

  console.log('R49 : Plus › Importer des fiches avions');
  const avant = { avions: await tout('avions'), vols: await tout('vols') };
  const fichier = join(CAPT, 'fiches-avions-essai.csv');
  writeFileSync(fichier, 'immatriculation,nom,indicatif radio,modèle\nF-XZZA,M91,ESSAI 91,Modele essai Q\nF-XZZZ,M99,ESSAI 99,X\n');
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-fiches');
  await p.setInputFiles('#fa-fichier', fichier);
  await p.waitForSelector('#fa-apercu .fa-avion');
  const ap = await p.$eval('#fa-apercu', e => e.innerText.replace(/\s+/g, ' '));
  verifier(ap.includes('F-XZZA') && ap.includes('Nom : vide → M91') && ap.includes('Indicatif radio : vide → ESSAI 91') && ap.includes('Modèle : Modele essai → Modele essai Q'),
    'aperçu : F-XZZA, Nom vide → M91, Indicatif, Modèle');
  verifier(ap.includes('Introuvable dans ta flotte (ignoré) : F-XZZZ'), 'avion introuvable signalé, ignoré');
  await p.screenshot({ path: join(CAPT, 'v016b-03-fiches-apercu.png') });
  await p.click('#fa-no');
  verifier(JSON.stringify(await tout('avions')) === JSON.stringify(avant.avions), 'Annuler : aucun avion modifié');
  await p.click('#pl-fiches'); await p.setInputFiles('#fa-fichier', fichier); await p.waitForSelector('#fa-ok');
  await p.click('#fa-ok'); await p.waitForSelector('#outil', { state: 'hidden' });
  const apres = { avions: await tout('avions'), vols: await tout('vols') };
  const a1 = apres.avions.find(a => a.id === 'a1'), a1av = avant.avions.find(a => a.id === 'a1');
  verifier(a1.nom === 'M91' && a1.indicatif === 'ESSAI 91' && a1.modele === 'Modele essai Q' && a1.typeOACI === 'DH8D', 'Appliquer : Nom, Indicatif, Modèle remplis ; type OACI inchangé');
  const sansHorodatage = a => { const { modifieLe, nom, indicatif, modele, ...r } = a; return JSON.stringify(r); };
  verifier(sansHorodatage(a1) === sansHorodatage(a1av), '  rien d\'autre ne change sur cet avion');
  verifier(apres.avions.length === avant.avions.length && JSON.stringify(apres.avions.find(a => a.id === 'a2')) === JSON.stringify(avant.avions.find(a => a.id === 'a2')),
    'aucun avion créé, l\'autre avion intact');
  verifier(JSON.stringify(apres.vols) === JSON.stringify(avant.vols), 'aucun vol touché');
  await p.click('.tabs button[data-v="carnet"]'); await nouveauVol();
  verifier((await p.textContent('#ac-reg')) === 'M91' || (await p.textContent('#ac-cur')).includes('M91'), 'la saisie affiche le nouveau nom « M91 »');
  await p.click('#cancel');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + bloquees.join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.16 (terrains, LF, fiches avions) réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v016b-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
