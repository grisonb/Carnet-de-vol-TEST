// v0.21 (R34) dans Chromium, écran 390 px : fiche avion › « Chercher une photo ». FAUX Commons et FAUX Planespotters
// locaux (avions, photos et auteurs INVENTÉS ; toute adresse non locale est BLOQUÉE). Vérifie : vignettes à choisir
// (catégorie, titre, « À vérifier »), crédit sous la photo, rien gardé sans choix ni sans « Enregistrer », photo
// Planespotters affichée avec crédit et lien mais JAMAIS gardée, photo du téléphone = pas de crédit, sans réseau,
// immatriculation inconnue, simulateur, flèche retour, sauvegarde et copie NAS.
// Captures : tests/navigateur/captures/v021-*.png (non commitées). Usage : node tests/navigateur/v021.mjs
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const IMAGE = readFileSync(join(RACINE, 'icones/icone-512.png'));
const avion = (id, immat, typeOACI, modele, sim = false) => ({ id, immat, typeOACI, modele, constructeur: 'ESSAI', nom: '', indicatif: '', equipage: sim ? null : 'MP',
  moteurs: sim ? null : 'ME', moteur: sim ? null : 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim, photo: null, remarques: '', creeLe: H, modifieLe: H });

const srv = await serveur();
const journal = { commons: [], agent: [], images: [], ps: [] };
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), base = `http://127.0.0.1:${faux.address().port}`;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'api-user-agent', 'Access-Control-Allow-Methods': 'GET' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = o => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const page = (titre, auteur) => ({ title: titre, imageinfo: [{ mime: 'image/jpeg', thumburl: `${base}/img/330/${encodeURIComponent(titre)}`,
    url: `${base}/img/orig.png`, descriptionurl: `${base}/wiki/${encodeURIComponent(titre)}`,
    extmetadata: { Artist: { value: `<a href="${base}/wiki/User:${auteur}">${auteur}</a>` }, LicenseShortName: { value: 'CC BY-SA 4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] });
  if (u.pathname === '/w/api.php') {
    journal.commons.push(u.search); journal.agent.push(req.headers['api-user-agent'] || '');
    const p = u.searchParams;
    if (p.get('generator') === 'categorymembers') {
      return json(p.get('gcmtitle') === 'Category:F-XZZA (aircraft)'
        ? { query: { pages: [page('File:Incendie essai 2026-07-15.jpg', 'Jean Essai'), page('File:F-XZZA Dash 8 essai.jpg', 'Marie Essai')] } } : { batchcomplete: true });
    }
    if (p.get('generator') === 'search') {
      return json(p.get('gsrsearch') === 'intitle:"F-XZZA"'
        ? { query: { pages: [page('File:F-XZZA Dash 8 essai.jpg', 'Marie Essai'), page('File:F-XZZA meeting 2015.jpg', 'Paul Essai'), page('File:Autre avion.jpg', 'X')] } } : { batchcomplete: true });
    }
    if (p.get('titles')) return json({ query: { pages: [{ title: p.get('titles'), imageinfo: [{ mime: 'image/jpeg', thumburl: `${base}/img/1280/grande.png`, url: `${base}/img/orig.png` }] }] } });
  }
  if (u.pathname.startsWith('/img/')) { journal.images.push(u.pathname); res.writeHead(200, { ...cors, 'Content-Type': 'image/png' }); return res.end(IMAGE); }
  if (u.pathname.startsWith('/ps-img/')) { journal.images.push(u.pathname); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(IMAGE); } // sans CORS, comme Planespotters
  if (u.pathname.startsWith('/reg/')) {
    journal.ps.push(u.pathname);
    return json(u.pathname === '/reg/F-XZZA' ? { photos: [{ id: '1', thumbnail: { src: `${base}/ps-img/1_t.png`, size: { width: 200, height: 133 } },
      thumbnail_large: { src: `${base}/ps-img/1_280.png`, size: { width: 420, height: 280 } }, link: `${base}/photo/1/f-xzza`, photographer: 'Luc Essai' }] } : { photos: [] });
  }
  res.writeHead(404, cors); res.end();
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const F = `http://127.0.0.1:${faux.address().port}`;

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR',
  timezoneId: 'Europe/Paris', acceptDownloads: true });
const bloquees = [];
await ctx.route('**/*', r => { if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
await ctx.addInitScript(f => {
  globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png';
  globalThis.CARNET_COMMONS = f + '/w/api.php'; globalThis.CARNET_PLANESPOTTERS = f + '/reg/';
}, F);
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
const avions = () => p.evaluate(async () => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const v = await new Promise(ok => { const r = db.transaction('avions').objectStore('avions').getAll(); r.onsuccess = () => ok(r.result); }); db.close();
  return Object.fromEntries(v.map(a => [a.id, a]));
});
const ouvrirFiche = async id => {
  await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#ac-cur'); await p.click('#ac-all'); await p.waitForSelector('#fl-list .acitem');
  await p.click(`[data-ed="${id}"]`); await p.waitForSelector('#fiche:not([hidden])'); await attendre(150);
};
const fermerTout = async () => {
  for (const s of ['#ph-x', '#fi-x', '#fl-x']) if (await p.isVisible(s)) { await p.click(s); await attendre(150); }
  if (await p.isVisible('#cancel')) { await p.click('#cancel'); if (await p.isVisible('#ab-yes')) await p.click('#ab-yes'); }
  await p.waitForSelector('#v-carnet:not([hidden])');
};

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async l => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction('avions', 'readwrite'); for (const a of l) t.objectStore('avions').put(a); await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [avion('a1', 'F-XZZA', 'DH8D', 'Dash 8 Q400'), avion('a2', 'F-XZZB', 'DR40', 'DR400'), avion('s1', 'SIM-ESSAI', 'SIM', 'Simulateur essai', true)]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');

  console.log('Fiche avion : bouton « Chercher une photo »');
  await ouvrirFiche('a1');
  verifier(await p.isVisible('#fi-web') && await p.textContent('#fi-web') === 'Chercher une photo ›', 'bouton « Chercher une photo › » sous la photo');
  verifier(!(await p.isVisible('#fi-credit')), 'pas de crédit tant qu\'il n\'y a pas de photo d\'Internet');
  await p.screenshot({ path: join(CAPT, 'v021-01-fiche-bouton.png') });

  console.log('Recherche : vignettes Commons + photo Planespotters');
  await p.click('#fi-web'); await p.waitForSelector('#ph-modal:not([hidden])');
  await p.waitForFunction(() => document.querySelectorAll('#ph-l .phv').length && document.querySelector('#ph-ps h4'), null, { timeout: 10000 });
  const v = await p.$$eval('#ph-l .phv', l => l.map(b => ({ c: b.querySelector('.phc').textContent, w: !!b.querySelector('.phw') })));
  verifier(v.length === 3, `3 photos Commons (catégorie, puis titres, sans doublon ; « Autre avion » écarté) : ${v.length}`);
  verifier(v[0].c === 'Jean Essai · CC BY-SA 4.0' && !v[0].w && !v[1].w && v[2].w, 'auteur et licence sous chaque vignette ; « À vérifier » seulement sur la photo sans le type');
  verifier((await p.textContent('#ph-etat')).startsWith('3 photos libres sur Wikimedia Commons'), 'message : 3 photos libres, touche celle que tu veux garder');
  verifier(journal.agent.every(a => a.startsWith('CarnetDeVol')), 'Commons : l\'app se présente (Api-User-Agent)');
  const ps = await p.$eval('#ph-ps', e => ({ href: e.querySelector('a.ph-psimg').getAttribute('href'), rel: e.querySelector('a.ph-psimg').getAttribute('rel'),
    img: e.querySelector('img').getAttribute('src'), credit: e.querySelector('.phcredit').textContent, cible: e.querySelector('.phcredit a').getAttribute('href') }));
  verifier(ps.img === `${F}/ps-img/1_280.png` && ps.href === `${F}/photo/1/f-xzza` && ps.cible === ps.href && !/nofollow/.test(ps.rel || ''),
    'Planespotters : photo affichée telle quelle, la photo et le nom mènent à sa page (sans nofollow)');
  verifier(ps.credit === 'Photo : Luc Essai · Planespotters.net', `  crédit : ${ps.credit}`);
  verifier(await p.isVisible('#ph-x') && await p.$eval('#ph-x', e => e.classList.contains('annuler')), '« Annuler » rouge');
  const largeur = await p.$eval('.ph-box', e => e.scrollWidth <= e.clientWidth + 1);
  verifier(largeur, 'rien ne dépasse à 390 px');
  await p.screenshot({ path: join(CAPT, 'v021-02-vignettes.png') });
  await p.$eval('#ph-ps', e => e.scrollIntoView()); await p.screenshot({ path: join(CAPT, 'v021-03-planespotters.png') });

  console.log('Choix d\'une photo');
  await p.click('#ph-l .phv[data-ph="2"]'); await p.waitForSelector('#ph-choix:not([hidden])');
  verifier(await p.isVisible('#ph-avert'), 'photo « À vérifier » : avertissement en grand');
  await p.click('#ph-autres');
  verifier(await p.isVisible('#ph-l') && !(await p.isVisible('#ph-choix')), '« Autres photos » : retour aux vignettes');
  await p.click('#ph-l .phv[data-ph="1"]'); await p.waitForSelector('#ph-choix:not([hidden])');
  verifier(!(await p.isVisible('#ph-avert')), 'photo dont le titre cite le type : pas d\'avertissement');
  verifier(await p.textContent('#ph-credit') === 'Photo : Marie Essai · CC BY-SA 4.0 · Wikimedia Commons', 'crédit complet sous la grande photo');
  verifier(await p.$eval('#ph-ok', e => e.classList.contains('vert')), '« Utiliser cette photo » vert');
  await p.screenshot({ path: join(CAPT, 'v021-04-choix.png') });
  await p.click('#ph-ok'); await p.waitForSelector('#ph-modal', { state: 'hidden' });
  verifier(journal.images.includes('/img/1280/grande.png'), 'la grande version (1280 px) est téléchargée');
  const credit = await p.textContent('#fi-credit');
  verifier(await p.isVisible('#fi-credit') && credit === 'Photo : Marie Essai · CC BY-SA 4.0 · Wikimedia Commons', `crédit sous la photo de la fiche : ${credit}`);
  verifier(await p.$eval('#fi-credit', e => [...e.querySelectorAll('a')].map(a => a.getAttribute('href')).join(' ')) === `${F}/wiki/File%3AF-XZZA%20Dash%208%20essai.jpg https://creativecommons.org/licenses/by-sa/4.0`,
    '  liens vers la page de la photo et vers la licence');
  verifier(!(await avions()).a1.photo, 'rien n\'est gardé avant « Enregistrer »');
  await p.screenshot({ path: join(CAPT, 'v021-05-fiche-credit.png') });
  await p.click('#fi-save'); await attendre(400);
  let a = (await avions()).a1;
  verifier(/^data:image\/jpeg;base64,/.test(a.photo) && a.photoCredit && a.photoCredit.auteur === 'Marie Essai' && a.photoCredit.licence === 'CC BY-SA 4.0',
    `« Enregistrer » : photo gardée dans la fiche (${Math.round(a.photo.length * 0.75 / 1024)} Ko) avec son crédit`);
  verifier(!JSON.stringify(a).includes('ps-img'), 'la photo Planespotters n\'est jamais gardée');
  const caches = await p.evaluate(async () => { const r = []; for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) r.push(q.url); return r; });
  verifier(!caches.some(u => /ps-img|\/img\//.test(u)), 'aucune photo d\'Internet dans le cache du service worker');
  await fermerTout();

  console.log('Fiche rouverte, puis photo du téléphone');
  await ouvrirFiche('a1');
  verifier(await p.isVisible('#fi-credit') && await p.isVisible('#fiche img'), 'fiche rouverte : photo et crédit');
  await p.setInputFiles('#fi-file', join(RACINE, 'icones/icone-192.png')); await attendre(400);
  verifier(!(await p.isVisible('#fi-credit')), 'photo prise au téléphone : le crédit disparaît');
  await p.click('#fi-save'); await attendre(400);
  a = (await avions()).a1;
  verifier(a.photo && a.photoCredit === null, '  enregistrée sans crédit');
  await fermerTout();

  console.log('Immatriculation sans photo, simulateur, sans réseau, flèche retour');
  await ouvrirFiche('a2');
  await p.click('#fi-web'); await p.waitForSelector('#ph-modal:not([hidden])');
  await p.waitForFunction(() => document.querySelector('#ph-ps .hint'), null, { timeout: 10000 });
  verifier(await p.textContent('#ph-etat') === 'Aucune photo libre de F-XZZB sur Wikimedia Commons.' && (await p.textContent('#ph-ps')).includes('aucune photo de F-XZZB'),
    'aucune photo : messages clairs (Commons et Planespotters)');
  await p.screenshot({ path: join(CAPT, 'v021-06-aucune.png') });
  await p.goBack(); await attendre(600);
  verifier(!(await p.isVisible('#ph-modal')) && await p.isVisible('#fiche'), 'flèche retour : la fenêtre se ferme, la fiche reste ouverte');
  await ctx.setOffline(true);
  await p.click('#fi-web'); await p.waitForSelector('#ph-modal:not([hidden])');
  verifier(await p.textContent('#ph-etat') === 'Pas de réseau : la recherche de photos a besoin d\'Internet.', 'sans réseau : message, rien ne bloque');
  await ctx.setOffline(false);
  await p.click('#ph-x');
  verifier(!(await avions()).a2.photo, 'rien n\'a été gardé pour F-XZZB');
  await fermerTout();
  await ouvrirFiche('s1');
  verifier(!(await p.isVisible('#fi-web')), 'simulateur : pas de bouton « Chercher une photo »');
  await fermerTout();

  console.log('Sauvegarde et copie NAS');
  const s = await p.evaluate(async () => {
    const m = await import('./js/sauvegarde.js');
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const av = await new Promise(ok => { const r = db.transaction('avions').objectStore('avions').getAll(); r.onsuccess = () => ok(r.result); }); db.close();
    const nas = m.sansPhotos({ vols: [], avions: av });
    return { nasSansPhoto: nas.avions.every(a => !('photo' in a) && !('photoCredit' in a)) };
  });
  verifier(s.nasSansPhoto, 'copie NAS : ni photo ni crédit (R35)');

  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.21 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v021-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); faux.close();
}
