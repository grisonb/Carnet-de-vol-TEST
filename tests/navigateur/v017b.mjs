// v0.17 (R52) dans Chromium, écran 390 px (avions et vols INVENTÉS) : dans « Tous mes avions » et la recherche d'avion de
// la saisie, les avions d'un même type OACI sont classés par immatriculation (quel que soit le modèle) ; l'ordre des
// types ne change pas. Captures : tests/navigateur/captures/v017b-*.png (non commitées). Usage : node tests/navigateur/v017b.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const avion = (id, immat, typeOACI, modele, nom = '') => ({ id, immat, typeOACI, modele, nom, constructeur: 'ESSAI', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H });
// Types mélangés, modèles différents d'un même type, heures très différentes (l'ancien ordre suivait les heures)
const AVIONS = [avion('a1', 'F-XZZH', 'DH8D', 'Modele essai MRE', 'M93'), avion('a2', 'F-XAAB', 'DR40', 'DR400'), avion('a3', 'F-XZZC', 'DH8D', 'Modele essai MR', 'M91'),
  avion('a4', 'F-XZZD', 'DH8D', 'Modele essai MR', 'M92'), avion('a5', 'F-XAAA', 'DR40', 'DR400'), avion('a6', 'F-XZZA', 'DH8D', 'Modele essai MRE', 'M90'),
  avion('a7', 'F-XBBA', 'C172', 'Cessna 172')];
const vol = (id, date, avionId, minutes) => ({ id, date, hDep: '10:00', hArr: '11:00', mode: 'utc', dep: 'LFMN', arr: 'LFMN', escales: [], avionId, tempsTotal: minutes,
  tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: minutes, fonction: 'cdb', nomCdB: 'SELF', nomCopi: '', missions: [], remarques: '', feux: 0, compteurs: {},
  etiquettes: [], attJour: 1, attNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(date), creeLe: H, modifieLe: H });
// Dernier vol : sur le DR40 (puis DH8D, puis C172) ; le F-XZZH a le plus d'heures, le F-XZZA le moins
const VOLS = [vol('v1', '2026-01-10', 'a2', 60), vol('v2', '2026-01-09', 'a1', 600), vol('v3', '2026-01-08', 'a6', 30), vol('v4', '2026-01-07', 'a4', 300),
  vol('v5', '2026-01-06', 'a3', 120), vol('v6', '2026-01-05', 'a7', 60), vol('v7', '2026-01-04', 'a5', 200)];

const srv = await serveur();
const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const ecrire = (magasin, lignes) => p.evaluate(async ([magasin, lignes]) => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const t = db.transaction(magasin, 'readwrite'); for (const l of lignes) t.objectStore(magasin).put(l);
  await new Promise(ok => { t.oncomplete = ok; }); db.close();
}, [magasin, lignes]);

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await ecrire('avions', AVIONS); await ecrire('vols', VOLS);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');

  console.log('Plus › Mes avions (Tous mes avions)');
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-avions'); await p.waitForSelector('#fleet:not([hidden]) .acitem');
  const flotte = await p.evaluate(() => [...document.querySelectorAll('#fl-list .grp')].map(g => ({ type: g.firstElementChild.textContent,
    immats: [...g.nextElementSibling.querySelectorAll('.acitem .t1')].map(x => x.firstChild.textContent) })));
  verifier(JSON.stringify(flotte.map(g => g.type)) === '["C172","DH8D","DR40"]', 'ordre des types inchangé : ' + flotte.map(g => g.type).join(', '));
  verifier(JSON.stringify(flotte[1].immats) === '["F-XZZA","F-XZZC","F-XZZD","F-XZZH"]', 'DH8D par immatriculation (modèles MR et MRE mélangés) : ' + flotte[1].immats.join(', '));
  verifier(JSON.stringify(flotte[2].immats) === '["F-XAAA","F-XAAB"]', 'DR40 par immatriculation : ' + flotte[2].immats.join(', '));
  await p.screenshot({ path: join(CAPT, 'v017b-01-tous-mes-avions.png') });
  await p.click('#fl-x').catch(() => {});

  console.log('Recherche d\'avion de la saisie');
  await p.click('.tabs button[data-v="carnet"]'); await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#ac-cur'); await p.fill('#ac-q', 'F-X'); await p.dispatchEvent('#ac-q', 'input');
  const res = await p.$$eval('#ac-res .acitem .t1', l => l.map(x => x.firstChild.textContent));
  verifier(JSON.stringify(res) === '["F-XAAA","F-XAAB","F-XZZA","F-XZZC","F-XZZD","F-XZZH"]',
    'types dans l\'ordre du dernier vol (DR40 puis DH8D), chacun par immatriculation : ' + res.join(', '));
  await p.fill('#ac-q', 'M9'); await p.dispatchEvent('#ac-q', 'input');
  const res2 = await p.$$eval('#ac-res .acitem .t1', l => l.map(x => x.firstChild.textContent));
  verifier(JSON.stringify(res2) === '["F-XZZA","F-XZZC","F-XZZD","F-XZZH"]', 'recherche « M9 » : les Dash 8 par immatriculation : ' + res2.join(', '));
  await p.screenshot({ path: join(CAPT, 'v017b-02-recherche.png') });

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.17 (R52) réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v017b-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
