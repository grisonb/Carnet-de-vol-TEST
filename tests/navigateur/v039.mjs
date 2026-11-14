// v0.39 : changement d'adresse /Carnet-de-vol-TEST/ -> /Carnet-de-vol/. Le faux serveur sert l'app aux DEUX adresses
// (même origine, donc même base de données, comme sur grisonb.github.io) ; la nouvelle peut répondre « introuvable ».
// Ancienne adresse + nouvelle qui ne répond pas : app normale (écritures, NAS). Nouvelle qui répond : écran « Le carnet a
// changé d'adresse », AUCUNE écriture, AUCUNE demande au NAS (faux NAS local qui compte), sauvegarde possible, bouton vers
// la nouvelle adresse (mêmes données). Caches séparés par adresse. Icônes, nom « Carnet de vol » / « Carnet », aucun « TEST ».
// Téléphone (Chromium 390 px), iPad (WebKit). Vols INVENTÉS. Captures : tests/navigateur/captures/v039-*.png (non commitées).
// Usage : node tests/navigateur/v039.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE, DOSSIER, ANCIEN_DOSSIER } from './outils.mjs';
import { VERSION } from '../../js/version.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-14T08:00:00Z';
const AVION = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H };
const vol = (id, jour) => ({ id, date: `2026-11-${jour}`, hDep: '10:00', hArr: '11:30', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 90, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 90, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['TRANSIT ESSAI'], remarques: '',
  feux: 0, compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(`2026-11-${jour}T10:00Z`),
  creeLe: H, modifieLe: H });

// Faux NAS local : compte TOUTES les demandes reçues (le vrai NAS n'est jamais appelé)
let demandesNas = 0;
const faux = createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  demandesNas++;
  req.resume(); req.on('end', () => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, copies: 0, cle: 'carnet', version: 5, vols: [] })); });
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const ADRESSE_NAS = `http://127.0.0.1:${faux.address().port}/carnet-api/`;

const srv = await serveur({ dossiers: [ANCIEN_DOSSIER, DOSSIER] });
const ANCIENNE = srv.origine + ANCIEN_DOSSIER, NOUVELLE = srv.origine + DOSSIER;
const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const erreurs = [], bloquees = [];
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...options });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return r.continue(); bloquees.push(u.href); return r.abort(); });
  await ctx.addInitScript(() => {
    globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png';
    for (const c of [Navigator.prototype, navigator]) try { Object.defineProperty(c, 'canShare', { value: undefined, configurable: true, writable: true }); } catch { /* idem */ }
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/sw\.js due to access control checks|Le carnet a changé d'adresse/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|access control|404/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  return { ctx, p };
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const nbVols = p => p.evaluate(async () => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const n = await new Promise(ok => { const q = db.transaction('vols').objectStore('vols').count(); q.onsuccess = () => ok(q.result); }); db.close(); return n;
});
const essaiEcriture = p => p.evaluate(async v => { try { await (await import('./js/etat.js')).enregistrerVol(v); return 'enregistré'; } catch (e) { return 'refusé : ' + e.message; } }, vol('v-essai-ecriture', '13'));

try {
  console.log('Ancienne adresse, nouvelle adresse PAS encore en ligne : app normale');
  srv.fermerDossier(DOSSIER, true);
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const T = tel.p;
  await T.goto(ANCIENNE); await T.waitForSelector('body[data-pret="1"]');
  await T.evaluate(async ([a, vs, url]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols', 'reglages'], 'readwrite'); t.objectStore('avions').put(a); for (const v of vs) t.objectStore('vols').put(v);
    const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: 'mot-de-passe-essai-39' }); g.put({ cle: 'nasAuto', valeur: true });
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVION, [vol('v1', '10'), vol('v2', '11')], ADRESSE_NAS]);
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  verifier(await T.isHidden('#demenage') && await T.locator('#list .flight').count() === 2, 'pas d\'écran « déménagé », le carnet s\'affiche');
  verifier((await essaiEcriture(T)) === 'enregistré' && (await nbVols(T)) === 3, 'un vol s\'enregistre normalement');
  const avantNas = demandesNas;
  const r1 = await T.evaluate(async () => (await import('./js/ui/nas.js')).requete('test'));
  verifier(r1.statut === 'ok' && demandesNas > avantNas, 'le NAS est joint normalement');

  console.log('La nouvelle adresse répond (après le renommage) : l\'app ouverte le voit au retour au premier plan');
  srv.fermerDossier(DOSSIER, false);
  await T.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await T.waitForSelector('#demenage:not([hidden])', { timeout: 10000 });
  const nasAvant = demandesNas;
  verifier((await essaiEcriture(T)).startsWith('refusé') && (await nbVols(T)) === 3, 'plus aucune écriture (vol refusé, base inchangée)');
  const r2 = await T.evaluate(async () => (await import('./js/ui/nas.js')).requete('envoyer'));
  verifier(r2.statut === 'demenage', `plus aucune demande au NAS (copie, synchro, vols NPF : « ${r2.statut} »)`);

  console.log('Ancienne adresse rouverte, nouvelle adresse en ligne : écran tout de suite');
  await T.reload(); await T.waitForSelector('#demenage:not([hidden])', { timeout: 10000 }); await attendre(T, 1500);
  const ecran = await T.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), b = r('#dm-go');
    return { titre: document.getElementById('dm-t').textContent, lien: document.getElementById('dm-go').href, h: b.height, dansEcran: b.bottom <= innerHeight && b.top >= 0,
      seul: [...document.body.children].filter(e => e.id !== 'demenage' && e.id !== 'toast' && getComputedStyle(e).display !== 'none' && e.tagName !== 'SCRIPT').length === 0,
      pret: document.body.dataset.pret || '' }; });
  verifier(ecran.titre === 'Le carnet a changé d\'adresse' && ecran.lien === NOUVELLE && ecran.h >= 44 && ecran.dansEcran && ecran.seul,
    `écran plein « ${ecran.titre} », gros bouton (${Math.round(ecran.h)} px) vers ${ecran.lien.replace(srv.origine, '')}`);
  verifier(ecran.pret === '' && demandesNas === nasAvant, 'le carnet n\'est pas lancé : aucune copie, aucune synchro, aucun vol NPF demandé au NAS');
  verifier((await essaiEcriture(T)).startsWith('refusé') && (await nbVols(T)) === 3, 'toujours aucune écriture');
  await T.screenshot({ path: join(CAPT, 'v039-01-tel-390-demenage.png') });
  const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#dm-sauv')]);
  const sauvegarde = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  verifier(sauvegarde.vols.length === 3 && !JSON.stringify(sauvegarde).includes('mot-de-passe-essai-39'), `sauvegarde enregistrée (${dl.suggestedFilename()}, ${sauvegarde.vols.length} vols, sans le mot de passe du NAS)`);
  verifier(demandesNas === nasAvant, 'toujours aucune demande au NAS');

  console.log('Bouton : la nouvelle adresse, mêmes données (même site)');
  await T.click('#dm-go'); await T.waitForURL(NOUVELLE); await T.waitForSelector('body[data-pret="1"]');
  verifier(await T.isHidden('#demenage') && await T.locator('#list .flight').count() === 3, 'nouvelle adresse : carnet normal, les 3 vols sont là');
  verifier((await essaiEcriture(T)) === 'enregistré', 'nouvelle adresse : les écritures marchent');
  await T.evaluate(() => navigator.serviceWorker.ready); await T.reload(); await T.waitForSelector('body[data-pret="1"]'); await attendre(T, 500);
  const caches = await T.evaluate(async () => caches.keys());
  verifier(caches.includes('carnet-app-v' + VERSION) && caches.includes('carnet-de-vol-v' + VERSION), `caches séparés et gardés tous les deux : ${caches.join(', ')}`);
  const tete = await T.evaluate(async () => ({ titre: document.title, apple: document.querySelector('link[rel="apple-touch-icon"]').href, icone: document.querySelector('link[rel="icon"]').href,
    nomIpad: document.querySelector('meta[name="apple-mobile-web-app-title"]').content, testVisible: /TEST/.test(document.body.innerText) }));
  verifier(tete.titre === 'Carnet de vol' && tete.nomIpad === 'Carnet' && !tete.testVisible && /apple-touch-icon\.png$/.test(tete.apple) && /favicon\.ico$/.test(tete.icone),
    'nom « Carnet de vol » (« Carnet » sous l\'icône), nouvelles icônes, aucun « TEST » visible');
  const tailles = await T.evaluate(async () => Promise.all(['icones/icon-192.png', 'icones/icon-512.png', 'icones/apple-touch-icon.png', 'icones/favicon-32.png'].map(async f => {
    const i = new Image(); i.src = f; await i.decode(); return i.naturalWidth; })));
  verifier(tailles.join(',') === '192,512,180,32', `icônes du pilote : ${tailles.join(', ')} px`);

  console.log('iPad (WebKit) : même écran à l\'ancienne adresse');
  const I = (await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' })).p;
  srv.fermerDossier(DOSSIER, true);
  await I.goto(ANCIENNE); await I.waitForSelector('body[data-pret="1"]');
  verifier(await I.isHidden('#demenage'), 'iPad, nouvelle adresse absente : app normale');
  srv.fermerDossier(DOSSIER, false);
  await I.reload(); await I.waitForSelector('#demenage:not([hidden])', { timeout: 10000 });
  verifier((await essaiEcriture(I)).startsWith('refusé'), 'iPad, nouvelle adresse en ligne : écran « déménagé », aucune écriture');
  await I.screenshot({ path: join(CAPT, 'v039-02-ipad-demenage.png') });

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.39 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer(); faux.close();
}
