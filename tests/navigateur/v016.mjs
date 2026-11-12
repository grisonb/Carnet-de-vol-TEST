// v0.16 dans Chromium, écran 390 px (vols, avions, personnes et pélicandromes INVENTÉS) : vols NPF au format 2 via un
// FAUX NAS local. Avion par son nom (trouvé, deux avions du même nom), escales ordonnées LFHO ×2 → LFLU → LFHO avec
// Att. Jour / Nuit (atterrissage intermédiaire de nuit), pélicandrome sans code OACI, copilote trouvé / inconnu (rien
// créé sans accord), mise à jour du même id, vol au format 1 toujours lu. Toute adresse non locale est BLOQUÉE.
// Captures : tests/navigateur/captures/v016-*.png (non commitées). Usage : node tests/navigateur/v016.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP_NAS = 'mot-de-passe-essai-nas';
const v2 = (id, change = {}) => ({ format: 'carnet-vol-npf', version: 2, id, exporteLe: '2026-11-07T10:00:00Z', date: '2025-08-14',
  blocDepart: '17:00', blocArrivee: '21:30', nomAvion: 'M73', depart: 'LFMN', arrivee: 'LFMN', ...change });
const P = v2('npf-p', { copilote: 'ZZQ', escales: [
  { oaci: 'LFHO', nom: 'PELICANDROME-ESSAI-1', atterrissages: ['2025-08-14T17:30Z', '2025-08-14T18:00Z'] },
  { oaci: 'LFLU', atterrissages: ['2025-08-14T18:40Z'] },
  { oaci: 'LFHO', atterrissages: ['2025-08-14T20:30Z'] },
  { nom: 'PELICANDROME-SANS-CODE', lat: 44.6, lon: 4.4, atterrissages: ['2025-08-14T20:50Z'] }],
  feux: [{ heure: '17:20', lat: 44.2, lon: 4.6, commune: 'COMMUNE-ESSAI-1' }] });
const Q = v2('npf-q', { date: '2025-08-15', blocDepart: '09:00', blocArrivee: '11:00', nomAvion: 'M75', copilote: 'ZZK' });
const R = { format: 'carnet-vol-npf', version: 1, id: 'npf-r', exporteLe: '2026-11-07T10:00:00Z', date: '2025-08-16', blocDepart: '09:00',
  blocArrivee: '10:00', immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFKJ', escales: ['LFKB'] };
const S = v2('npf-s', { date: '2025-08-17', blocDepart: '09:00', blocArrivee: '10:00', copilote: 'ZZW' });

const nas = { vols: new Map([P, Q, R, S].map(v => [v.id, v])), retraits: [] };
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
    if (action === 'vols-liste') return json({ vols: [...nas.vols.values()] });
    if (action === 'vol-retirer') { const id = u.searchParams.get('id'); nas.retraits.push(id); return json({ ok: true, retire: nas.vols.delete(id) }); }
    if (action === 'envoyer') return json({ ok: true, vols: 0, taille: 0 });
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
const tout = m => base(`return await new Promise(ok => { const r = db.transaction('${m}').objectStore('${m}').getAll(); r.onsuccess = () => ok(r.result); });`);
const ouvrir = async id => { await p.click('#npf-bandeau'); await p.waitForSelector('#npf-l'); await p.click(`#npf-l [data-npf="${id}"]`); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v016.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  // Flotte inventée : un avion « M73 », deux avions « M75 » ; une personne « ZZK » ; copie NAS configurée
  await base(`const t = db.transaction(['avions', 'personnes', 'reglages'], 'readwrite'); const s = t.objectStore('avions');
    const r = s.getAll(); r.onsuccess = () => { const l = r.result.filter(a => !a.sim).sort((x, y) => (x.immat < y.immat ? -1 : 1));
      const mp = { equipage: 'MP', moteurs: 'ME' }; // multipilote : la case copilote existe
      s.put({ ...l[0], ...mp, nom: 'M73' }); s.put({ ...l[1], ...mp, nom: 'M75' }); s.put({ ...l[2], ...mp, nom: 'm 75' }); };
    t.objectStore('personnes').put({ id: 'p-essai-zzk', tri: 'ZZK', prenom: '', nom: 'ESSAI', creeLe: '2026-01-01T00:00:00Z', modifieLe: '2026-01-01T00:00:00Z' });
    const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: arg[0] }); g.put({ cle: 'nasMotDePasse', valeur: arg[1] }); g.put({ cle: 'nasAuto', valeur: false });
    await new Promise(ok => { t.oncomplete = ok; });`, [ADRESSE_NAS, MDP_NAS]);
  const avions = (await tout('avions')).filter(a => !a.sim);
  const m73 = avions.find(a => a.nom === 'M73');
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForFunction(() => document.getElementById('npf-bandeau').textContent.startsWith('4 vols'), null, { timeout: 10000 });
  const volsDepart = (await tout('vols')).length, personnesDepart = (await tout('personnes')).length;

  console.log('Liste des vols en attente');
  await p.click('#npf-bandeau'); await p.waitForSelector('#npf-l');
  const lignes = await p.$$eval('#npf-l .npfv', l => l.map(b => b.innerText.replace(/\s+/g, ' ')));
  verifier(lignes[0].includes(`M73 ${m73.immat}`) && lignes[0].includes('LFMN → LFHO → LFLU → LFHO → PELICANDROME-SANS-CODE → LFMN'),
    'nom de l\'avion + immatriculation trouvée, escales dans l\'ordre : ' + lignes[0]);
  verifier(lignes[1].includes('M75') && lignes[1].includes('Plusieurs avions de ce nom'), 'deux avions « M75 » : « à choisir » : ' + lignes[1]);
  verifier(lignes[2].includes('F-XZZA') && lignes[2].includes('LFMN → LFKB → LFKJ'), 'vol au format 1 toujours lu : ' + lignes[2]);
  await p.screenshot({ path: join(CAPT, 'v016-01-liste.png') });
  await p.click('#ou-x');

  console.log('Brouillon P : avion par nom, escales, Att. Jour / Nuit, pélicandrome sans code, copilote inconnu');
  await ouvrir('npf-p'); await p.waitForSelector('#v-saisie:not([hidden])');
  const b = await p.evaluate(() => ({ ac: document.getElementById('ac-reg').textContent + ' ' + document.getElementById('ac-sub').textContent,
    via: [...document.querySelectorAll('#via-list .viachip')].map(x => x.innerText.replace(/\s+/g, ' ').trim()),
    sansCode: document.querySelectorAll('#via-list .viachip.sans-code').length,
    j: document.getElementById('s-attJour').textContent, n: document.getElementById('s-attNuit').textContent, copi: document.getElementById('f-copi').value,
    add: !document.getElementById('npf-copi-add').hidden && document.getElementById('npf-copi-add').textContent, txt: document.getElementById('npf-txt').textContent,
    nuit: document.getElementById('c-nuit').value }));
  verifier(b.ac.includes('M73') && b.ac.includes(m73.immat), 'avion trouvé par son nom « M73 » : ' + b.ac);
  verifier(b.via.length === 4 && /LFHO.*2 att\b/.test(b.via[0]) && /LFLU.*1 att\b/.test(b.via[1]) && /LFHO.*1 att 1 nuit/.test(b.via[2]), // v0.37 (R89) : « att » sans point
    'escales dans l\'ordre LFHO ×2 → LFLU → LFHO (dont 1 atterrissage de nuit) : ' + b.via.slice(0, 3).join(' | '));
  verifier(b.sansCode === 1 && b.via[3].includes('Code ?') && b.via[3].includes('PELICANDROME-SANS-CODE') && b.txt.includes('sans code OACI'),
    'pélicandrome sans code OACI : son nom s\'affiche, à compléter (pas de blocage) : ' + b.via[3]);
  verifier(b.j === '3' && b.n === '3', `totaux = sommes : Att. Jour ${b.j} (2 + 1), Att. Nuit ${b.n} (LFHO 20h30 + pélicandrome 20h50 + arrivée 21h30)`);
  verifier(b.nuit !== '0h00', `temps de nuit calculé le long du trajet, pélicandrome compris : ${b.nuit}`);
  verifier(b.copi === 'ZZQ' && b.add === '+ Ajouter ZZQ à mes personnes' && b.txt.includes('copilote ZZQ inconnu'), 'copilote inconnu : « ZZQ » proposé à l\'ajout');
  await p.screenshot({ path: join(CAPT, 'v016-02-brouillon-haut.png') });
  await p.evaluate(() => document.getElementById('s-attJour').scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -260));
  await p.screenshot({ path: join(CAPT, 'v016-03-brouillon-atterrissages.png') });
  await p.evaluate(() => { document.getElementById('f-copi-z').scrollIntoView({ block: 'center' }); });
  await p.screenshot({ path: join(CAPT, 'v016-03b-brouillon-copi.png') });
  // Compléter le code du pélicandrome dans le brouillon
  await p.click('#via-list .viachip.sans-code'); await p.waitForSelector('#via-modal:not([hidden])');
  await p.fill('#vm-icao', 'LFMV'); await p.click('#vm-ok');
  const via4 = await p.$$eval('#via-list .viachip', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim())[3]);
  verifier(via4.startsWith('LFMV') && via4.includes('1 nuit') && !(await p.$('#via-list .viachip.sans-code')), 'code complété : LFMV, ses atterrissages gardés : ' + via4);
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(500);
  let vols = await tout('vols');
  const vp = vols.find(v => v.npfId === 'npf-p');
  verifier(vols.length === volsDepart + 1 && vp.avionId === m73.id && vp.escales.map(e => e.code).join(' ') === 'LFHO LFLU LFHO LFMV'
    && vp.attJour === 3 && vp.attNuit === 3 && vp.nomCopi === 'ZZQ', 'Enregistrer : avion M73, 4 escales dans l\'ordre, 3 att. jour + 3 nuit, copi ZZQ');
  verifier((await tout('personnes')).length === personnesDepart, '  aucune personne créée sans mon accord');
  verifier(nas.retraits.includes('npf-p'), '  retiré du NAS');

  console.log('Brouillon Q : deux avions du même nom, copilote trouvé');
  await ouvrir('npf-q'); await p.waitForSelector('#v-saisie:not([hidden])');
  const q = await p.evaluate(() => ({ q: document.getElementById('ac-q').value, res: document.querySelectorAll('#ac-res [data-ac]').length,
    txt: document.getElementById('npf-txt').textContent, copi: document.getElementById('f-copi').value, add: document.getElementById('npf-copi-add').hidden }));
  verifier(q.q === 'M75' && q.res === 2 && q.txt.includes('2 avions s\'appellent M75'), 'recherche d\'avion ouverte sur « M75 » : 2 avions proposés, je choisis');
  verifier(q.copi === 'ZZK' && q.add, 'copilote ZZK retrouvé dans mes personnes, placé comme Copi');
  await p.screenshot({ path: join(CAPT, 'v016-04-deux-avions-meme-nom.png') });
  await p.click('#ac-res [data-ac] >> nth=1');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(500);
  const vq = (await tout('vols')).find(v => v.npfId === 'npf-q');
  verifier(vq && ['M75', 'm 75'].includes(avions.find(a => a.id === vq.avionId)?.nom) && vq.nomCopi === 'ZZK', 'enregistré avec l\'avion choisi et le copi ZZK');

  console.log('Vol S : copilote inconnu ajouté avec mon accord');
  await ouvrir('npf-s'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#npf-copi-add'); await p.waitForSelector('#p-modal:not([hidden])');
  verifier(await p.inputValue('#pm-tri') === 'ZZW', 'fiche personne pré-remplie avec le trigramme ZZW');
  await p.click('#pm-ok'); await attendre(300);
  verifier((await tout('personnes')).some(x => x.tri === 'ZZW') && await p.isHidden('#npf-copi-add'), 'ZZW ajouté à mes personnes (après mon « Ajouter »)');
  await p.click('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])');

  console.log('Vol R au format 1');
  await ouvrir('npf-r'); await p.waitForSelector('#v-saisie:not([hidden])');
  const r = await p.evaluate(() => ({ via: [...document.querySelectorAll('#via-list .viachip')].map(x => x.innerText.replace(/\s+/g, ' ').trim()),
    ac: document.getElementById('ac-reg').textContent + ' ' + document.getElementById('ac-sub').textContent }));
  verifier(r.ac.includes('F-XZZA') && r.via.length === 1 && r.via[0].startsWith('LFKB'), 'format 1 lu comme en v0.15 (immatriculation, escale LFKB)');
  await p.click('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])');

  console.log('Même id ré-exporté : « Ce qui change » (avion, escales, copi)');
  nas.vols.set('npf-p', { ...P, exporteLe: '2026-11-07T12:00:00Z', nomAvion: 'M75', copilote: 'ZZK', escales: [P.escales[0], P.escales[1]] });
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForFunction(() => !document.getElementById('npf-bandeau').hidden, null, { timeout: 10000 });
  await ouvrir('npf-p'); await p.waitForSelector('#nu-ok');
  const diff = await p.$$eval('.npf-diff div', l => l.map(d => d.innerText.replace(/\s+/g, ' ')));
  verifier(diff.some(d => d.startsWith('Avion')) && diff.some(d => d.startsWith('Escales') && d.includes('LFHO ×2 → LFLU'))
    && diff.some(d => d.startsWith('Copilote') && d.includes('ZZQ') && d.includes('ZZK')), 'ce qui change : ' + diff.join(' ; '));
  await p.screenshot({ path: join(CAPT, 'v016-05-ce-qui-change.png') });
  await p.click('#nu-ok'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#ac-res [data-ac] >> nth=0');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(500);
  vols = await tout('vols');
  const vp2 = vols.filter(v => v.npfId === 'npf-p');
  verifier(vp2.length === 1 && vp2[0].escales.length === 2 && vp2[0].nomCopi === 'ZZK', 'mis à jour (pas de second vol) : 2 escales, copi ZZK');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + bloquees.join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.16 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v016-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
