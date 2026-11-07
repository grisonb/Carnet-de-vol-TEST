// v0.15 dans Chromium, écran 390 px (vols et avions INVENTÉS) : vols envoyés par NPF-Q400 via un FAUX NAS local
// (carnet.php version 3 imité : vols-liste, vol-retirer). Bandeau, liste, brouillon pré-rempli (LOC / UTC, vol passant
// minuit UTC, avion inconnu, 0 / 1 / 3 feux), Enregistrer -> retrait du NAS, Ignorer, même id -> mise à jour, feux sur
// la Carte du vol hors ligne, jamais d'enregistrement automatique. Toute adresse non locale est BLOQUÉE.
// Captures : tests/navigateur/captures/v015-*.png (non commitées). Usage : node tests/navigateur/v015.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP_NAS = 'mot-de-passe-essai-nas';
const npf = (id, change = {}) => ({ format: 'carnet-vol-npf', version: 1, id, exporteLe: '2026-11-06T10:00:00Z', date: '2025-08-14',
  blocDepart: '13:05', blocArrivee: '15:40', immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFKJ', ...change });
const A = npf('npf-a');                                                          // avion connu, 0 feu
const B = npf('npf-b', { date: '2025-08-15', blocDepart: '23:30', blocArrivee: '01:10', blocArriveeJ1: true, immat: 'F-XZZZ', nomAvion: 'ZX9',
  depart: 'FMEE', arrivee: 'FMEE', feux: [                                       // avion inconnu, minuit UTC, 3 feux (La Réunion)
    { heure: '23:50', lat: -21.05, lon: 55.45, commune: 'COMMUNE-ESSAI-1' },
    { heure: '00:20', lat: -21.15, lon: 55.55, commune: 'COMMUNE-ESSAI-2' },
    { heure: '00:40', lat: -21.25, lon: 55.35, nom: 'FEU-ESSAI-3' }] });
const C = npf('npf-c', { date: '2025-08-16', blocDepart: '09:00', blocArrivee: '10:30', feux: [{ heure: '09:40', lat: 43.95, lon: 7.25, commune: 'COMMUNE-ESSAI-4' }] });

// ---------- Faux NAS (protocole 2 : erreurs en 200 + JSON) ----------
const nas = { vols: new Map([[A.id, A], [B.id, B], [C.id, C]]), retraits: [], retraitEnPanne: false, listes: 0, copies: 0 };
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = d => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  req.on('data', () => {});
  req.on('end', () => {
    if (req.headers['x-carnet-cle'] !== MDP_NAS) return json({ erreur: 'mot-de-passe', code: 401 });
    if (action === 'vols-liste') { nas.listes++; return json({ vols: [...nas.vols.values()] }); }
    if (action === 'vol-retirer') {
      if (nas.retraitEnPanne) { res.writeHead(500); return res.end(); }
      const id = u.searchParams.get('id'); nas.retraits.push(id);
      return json({ ok: true, retire: nas.vols.delete(id) });
    }
    if (action === 'envoyer') { nas.copies++; return json({ ok: true, vols: 0, taille: 0 }); }
    if (action === 'test') return json({ ok: true, copies: 0 });
    json({ erreur: 'action', code: 400 });
  });
});
await new Promise(ok => fauxNas.listen(0, '127.0.0.1', ok));
const ADRESSE_NAS = `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`;

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
const volsBase = () => base("return await new Promise(ok => { const r = db.transaction('vols').objectStore('vols').getAll(); r.onsuccess = () => ok(r.result); });");
const bandeau = () => p.evaluate(() => { const b = document.getElementById('npf-bandeau'); return b.hidden ? '' : b.textContent; });
const ouvrirListe = async () => { await p.click('#npf-bandeau'); await p.waitForSelector('#npf-l'); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v015.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  await p.click('.tabs button[data-v="carnet"]');
  const depart = (await volsBase()).length;
  verifier(!(await bandeau()) && nas.listes === 0, 'copie NAS pas configurée : rien n\'est demandé, pas de bandeau');
  // Copie NAS configurée sur ce téléphone (adresse + mot de passe), puis ouverture de l'app
  await base("const t = db.transaction('reglages', 'readwrite'); const s = t.objectStore('reglages'); s.put({ cle: 'nasAdresse', valeur: arg[0] }); s.put({ cle: 'nasMotDePasse', valeur: arg[1] }); s.put({ cle: 'nasAuto', valeur: false }); await new Promise(ok => { t.oncomplete = ok; });", [ADRESSE_NAS, MDP_NAS]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForFunction(() => !document.getElementById('npf-bandeau').hidden, null, { timeout: 10000 });

  console.log('Bandeau et liste');
  verifier(await bandeau() === '3 vols à importer depuis NPF-Q400 ›', 'bandeau en haut du Carnet : « 3 vols à importer depuis NPF-Q400 › »');
  const bb = await p.$eval('#npf-bandeau', e => e.getBoundingClientRect().toJSON());
  verifier(bb.top < 80 && bb.right <= 390, '  en haut de l\'écran, rien ne dépasse à 390 px');
  verifier((await volsBase()).length === depart, 'aucun vol enregistré automatiquement');
  await p.screenshot({ path: join(CAPT, 'v015-01-bandeau.png') });
  await ouvrirListe();
  const lignes = await p.$$eval('#npf-l .npfv', l => l.map(b => b.innerText.replace(/\s+/g, ' ')));
  verifier(lignes.length === 3 && lignes[0].includes('14/08/2025') && lignes[0].includes('F-XZZA') && lignes[0].includes('LFMN → LFKJ')
    && lignes[0].includes('13:05 → 15:40 UTC'), 'liste : date, avion, départ → arrivée, bloc : ' + lignes[0]);
  verifier(lignes[1].includes('ZX9 F-XZZZ') && lignes[1].includes('(J+1)') && lignes[1].includes('3 feux') && lignes[1].includes('Avion à ajouter'),
    '  vol passant minuit UTC, 3 feux, avion inconnu : ' + lignes[1]);
  await p.screenshot({ path: join(CAPT, 'v015-02-liste.png') });

  console.log('Brouillon A (avion connu, 0 feu) : LOC / UTC, Annuler, Enregistrer');
  await p.click('#npf-l [data-npf="npf-a"]');
  await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await p.textContent('#f-title') === 'Vol NPF-Q400 à vérifier' && await p.isVisible('#npf-zone'), 'saisie ouverte en brouillon « Vol NPF-Q400 à vérifier »');
  const loc = await p.evaluate(() => ({ d: document.getElementById('f-date').value, t0: document.getElementById('f-t0').value, t1: document.getElementById('f-t1').value,
    dep: document.getElementById('f-dep').value, arr: document.getElementById('f-arr').value, ac: document.getElementById('ac-sub').textContent + document.getElementById('ac-reg').textContent,
    bloc: document.getElementById('f-bloc').textContent, feux: document.getElementById('s-feu').textContent }));
  verifier(loc.d === '2025-08-14' && loc.t0 === '15h05' && loc.t1 === '17h40', `heures affichées en LOC (mon réglage) : ${loc.t0} → ${loc.t1}`);
  verifier(loc.dep === 'LFMN' && loc.arr === 'LFKJ' && loc.ac.includes('F-XZZA') && loc.bloc === '2h35' && loc.feux === '0', `terrains, avion trouvé par son immatriculation, bloc ${loc.bloc}, 0 feu`);
  await p.click('#tz-utc');
  verifier(await p.inputValue('#f-t0') === '13h05' && await p.inputValue('#f-t1') === '15h40', '  en UTC : 13:05 → 15:40 (comme envoyé par NPF)');
  await p.screenshot({ path: join(CAPT, 'v015-03-brouillon.png') });
  await p.click('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])');
  verifier((await volsBase()).length === depart && await bandeau() === '3 vols à importer depuis NPF-Q400 ›' && !nas.retraits.length,
    'Annuler : rien n\'est enregistré, le vol reste en attente');
  await ouvrirListe(); await p.click('#npf-l [data-npf="npf-a"]'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(500);
  let vols = await volsBase();
  const va = vols.find(v => v.npfId === 'npf-a');
  verifier(vols.length === depart + 1 && va && va.hDep === '13:05' && va.hArr === '15:40' && va.date === '2025-08-14' && va.dep === 'LFMN',
    'Enregistrer : le vol entre dans le carnet (heures UTC 13:05 → 15:40)');
  verifier(nas.retraits.includes('npf-a') && !nas.vols.has('npf-a') && await bandeau() === '2 vols à importer depuis NPF-Q400 ›', '  puis il est retiré du NAS (bandeau : 2 vols)');

  console.log('Brouillon B (avion inconnu, minuit UTC, 3 feux) : feux, carte, Ignorer');
  await ouvrirListe(); await p.click('#npf-l [data-npf="npf-b"]'); await p.waitForSelector('#v-saisie:not([hidden])');
  const b = await p.evaluate(() => ({ lignes: [...document.querySelectorAll('#ml input')].map(i => i.value), feux: document.getElementById('s-feu').textContent,
    j1: !document.getElementById('f-j1').hidden, bloc: document.getElementById('f-bloc').textContent, ac: document.getElementById('ac-q').value,
    ajouter: !!document.querySelector('#ac-res [data-new]'), txt: document.getElementById('npf-txt').textContent }));
  verifier(b.lignes.length === 3 && /^FEU n°\d+ COMMUNE-ESSAI-1$/.test(b.lignes[0]) && b.lignes[2].endsWith('FEU-ESSAI-3') && b.feux === '3',
    `3 lignes « FEU n°NN COMMUNE » + compteur Feux 3 : ${b.lignes.join(' | ')}`);
  const nums = b.lignes.map(l => Number(l.match(/n°(\d+)/)[1]));
  verifier(nums[1] === nums[0] + 1 && nums[2] === nums[0] + 2, `  numéros qui se suivent (n°${nums.join(', ')})`);
  // En LOC (La Réunion, UTC+4) : 03h30 → 05h10 le 16/08, même jour ; en UTC : 23h30 → 01h10, arrivée J+1
  const enLoc = await p.evaluate(() => [document.getElementById('f-date').value, document.getElementById('f-t0').value, document.getElementById('f-t1').value].join(' '));
  verifier(enLoc === '2025-08-16 03h30 05h10' && b.bloc === '1h40', `vol passant minuit UTC, en LOC : ${enLoc}, bloc ${b.bloc}`);
  await p.click('#tz-utc');
  const enUtc = await p.evaluate(() => ({ v: [document.getElementById('f-date').value, document.getElementById('f-t0').value, document.getElementById('f-t1').value].join(' '),
    j1: !document.getElementById('f-j1').hidden, bloc: document.getElementById('f-bloc').textContent }));
  verifier(enUtc.v === '2025-08-15 23h30 01h10' && enUtc.j1 && enUtc.bloc === '1h40', `  en UTC : ${enUtc.v}, « Arrivée le lendemain (J+1) », bloc ${enUtc.bloc}`);
  verifier(b.ac === 'F-XZZZ' && b.ajouter && b.txt.includes('F-XZZZ inconnu'), 'avion inconnu : recherche ouverte sur F-XZZZ avec « + Ajouter un avion »');
  await p.waitForSelector('#carte-mini:not([hidden]) .carte-feu', { timeout: 10000 });
  verifier((await p.$$('#carte-mini .carte-feu')).length === 3 && (await p.textContent('#carte-mini')).includes('COMMUNE-ESSAI-1'),
    'Carte du vol : 3 flammes avec la commune (sans trace ADS-B)');
  await p.locator('#carte-zone').scrollIntoViewIfNeeded();
  await attendre(2500); // le message « Vol NPF-Q400 enregistré » du vol précédent a disparu
  await p.screenshot({ path: join(CAPT, 'v015-04-brouillon-feux.png') });
  await p.click('#npf-ign'); await p.waitForSelector('#ni-ok');
  await p.click('#ni-no');
  verifier(await p.isVisible('#v-saisie') && nas.vols.has('npf-b'), 'Ignorer puis Annuler : rien ne change');
  await p.click('#npf-ign'); await p.click('#ni-ok'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(300);
  verifier(!nas.vols.has('npf-b') && (await volsBase()).length === depart + 1 && await bandeau() === '1 vol à importer depuis NPF-Q400 ›',
    'Ignorer ce vol (confirmé) : retiré du NAS, rien enregistré, bandeau « 1 vol »');

  console.log('Même id déjà enregistré : mise à jour');
  nas.vols.set('npf-a', { ...A, exporteLe: '2026-11-06T12:00:00Z', blocArrivee: '16:10', feux: [{ heure: '14:00', lat: 43.9, lon: 7.1, commune: 'COMMUNE-ESSAI-5' }] });
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForFunction(() => document.getElementById('npf-bandeau').textContent.startsWith('2 vols'), null, { timeout: 10000 });
  await ouvrirListe();
  verifier((await p.textContent('#npf-l [data-npf="npf-a"]')).includes('Déjà dans le carnet'), 'liste : « Déjà dans le carnet : mise à jour »');
  await p.click('#npf-l [data-npf="npf-a"]'); await p.waitForSelector('#nu-ok');
  const diff = await p.$$eval('.npf-diff div', l => l.map(d => d.innerText.replace(/\s+/g, ' ')));
  verifier(diff.some(d => d.includes('Bloc arrivée (UTC)') && d.includes('15:40') && d.includes('16:10')) && diff.some(d => d.startsWith('Feux')),
    'ce qui change : ' + diff.join(' ; '));
  await p.screenshot({ path: join(CAPT, 'v015-05-mise-a-jour.png') });
  await p.click('#nu-ok'); await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await p.textContent('#f-title') === 'Mettre à jour le vol' && (await p.$$('#ml input')).length === 1, 'saisie « Mettre à jour le vol », la ligne de feu ajoutée');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(500);
  vols = await volsBase();
  const va2 = vols.filter(v => v.npfId === 'npf-a');
  verifier(vols.length === depart + 1 && va2.length === 1 && va2[0].hArr === '16:10' && va2[0].feux === 1 && va2[0].feuxPositions.length === 1,
    'Enregistrer : le même vol est mis à jour (pas de second vol), 1 feu et sa position');
  verifier(!nas.vols.has('npf-a'), '  retiré du NAS');

  console.log('Vol enregistré sans réseau pour le retrait : retiré plus tard, sans le reproposer');
  nas.retraitEnPanne = true;
  await ouvrirListe(); await p.click('#npf-l [data-npf="npf-c"]'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(500);
  verifier(nas.vols.has('npf-c') && !(await bandeau()), 'enregistré, mais le NAS n\'a pas pu le retirer : il n\'est plus proposé');
  nas.retraitEnPanne = false;
  await p.reload(); await p.waitForSelector('body[data-pret="1"]'); await attendre(2500);
  verifier(!nas.vols.has('npf-c') && !(await bandeau()) && (await volsBase()).length === depart + 2, 'à l\'ouverture suivante : retiré du NAS discrètement, aucun doublon');

  console.log('Feux sur la Carte du vol, hors ligne');
  await ctx.setOffline(true);
  await p.click('#q-open'); await p.fill('#q', 'COMMUNE-ESSAI-5'); await attendre(500);
  await p.click('#list .flight'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.waitForSelector('#carte-mini:not([hidden]) .carte-feu', { timeout: 10000 });
  const carte = await p.evaluate(() => ({ feux: document.querySelectorAll('#carte-mini .carte-feu').length, nom: document.getElementById('carte-mini').textContent,
    txt: document.getElementById('carte-txt').textContent, sansFond: document.getElementById('carte-mini').classList.contains('sans-fond'),
    t0: document.getElementById('f-t0').value, t1: document.getElementById('f-t1').value }));
  verifier(carte.feux === 1 && carte.nom.includes('COMMUNE-ESSAI-5') && carte.sansFond, 'hors ligne : flamme + commune sur fond neutre');
  verifier(carte.txt.startsWith('Positions des feux (NPF-Q400)'), '  texte : ' + carte.txt);
  verifier(carte.t0 === '15h05' && carte.t1 === '18h10', '  les heures du vol ne changent pas');
  await p.locator('#carte-zone').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPT, 'v015-06-carte-feux-hors-ligne.png') });
  await p.click('#carte-mini'); await p.waitForSelector('#carte-plein:not([hidden]) .carte-feu');
  verifier(true, 'plein écran : la flamme s\'affiche aussi');
  await p.click('#cp-x'); await p.click('#cancel');
  await ctx.setOffline(false);

  console.log('Vol saisi à la main : rien ne change');
  await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await p.isHidden('#npf-zone') && await p.textContent('#f-title') === 'Nouveau vol', 'nouveau vol : pas de zone NPF, titre « Nouveau vol »');
  await p.click('#cancel');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + bloquees.join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.15 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v015-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
