// v0.26 : R60 majuscules, R61 bouton « Rafraîchir », R62 envoi dès l'enregistrement et à la fermeture, R59 fenêtre photo.
// Téléphone (Chromium 390 px), PC (Chromium 1280 px), iPad (WebKit 1080 px) autour d'un FAUX NAS v5 local ; faux Commons
// et faux Planespotters. Vols et avions INVENTÉS ; toute adresse non locale est BLOQUÉE.
// Captures : tests/navigateur/captures/v026-*.png (non commitées). Usage : node tests/navigateur/v026.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { volsPDF } from '../outils/vols-pdf.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const IMAGE = readFileSync(join(RACINE, 'icones/icone-512.png'));
const srv = await serveur();
const nas = { mdp: 'mot-de-passe-essai-26', rev: 0, el: new Map(), lent: 0 };
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action'), base = `http://127.0.0.1:${faux.address().port}`;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte, Api-User-Agent', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => setTimeout(() => {
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    // Faux Commons / Planespotters (fenêtre photo)
    if (u.pathname === '/w/api.php') {
      const p = u.searchParams, avec = (p.get('gcmtitle') || '').includes('F-XZZA') || (p.get('gsrsearch') || '').includes('F-XZZA');
      if (!avec) return json({ batchcomplete: true });
      return json({ query: { pages: [{ title: 'File:F-XZZA Dash 8 essai.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: `${base}/img/a.png`, url: `${base}/img/a.png`, descriptionurl: `${base}/wiki/a`,
        extmetadata: { Artist: { value: 'Marie Essai' }, LicenseShortName: { value: 'CC BY 4.0' } } }] }] } });
    }
    if (u.pathname.startsWith('/img/')) { res.writeHead(200, { ...cors, 'Content-Type': 'image/png' }); return res.end(IMAGE); }
    if (u.pathname.startsWith('/reg/')) return json(u.pathname === '/reg/F-XZZA' ? { photos: [{ thumbnail_large: { src: `${base}/img/ps.png` }, link: `${base}/photo/1`, photographer: 'Luc Essai' }] } : { photos: [] });
    // Faux NAS v5
    if (req.headers['x-carnet-cle'] !== nas.mdp) return json({ erreur: 'mot-de-passe' }, 401);
    if (action === 'test') return json({ ok: true, copies: 0, cle: 'carnet', version: 5 });
    if (action === 'envoyer') return json({ ok: true, id: 'x', vols: 1, taille: 1, verification: 'empreinte' });
    if (action === 'vols-liste') return json({ vols: [] });
    if (action === 'synchro-etat') return json({ ok: true, rev: nas.rev, nombres: {} });
    if (action === 'synchro-recevoir') {
      const depuis = Number(u.searchParams.get('depuis')), limite = Number(u.searchParams.get('limite'));
      const tous = [...nas.el.entries()].filter(([, e]) => e.rev > depuis).sort((a, b) => a[1].rev - b[1].rev);
      const page = tous.slice(0, limite).map(([cle, e]) => ({ magasin: cle.split('/')[0], id: cle.slice(cle.indexOf('/') + 1), ...e }));
      const suite = tous.length > limite;
      return json({ ok: true, rev: nas.rev, elements: page, suite, jusqua: suite ? page.at(-1).rev : nas.rev });
    }
    if (action === 'synchro-envoyer') {
      const b = JSON.parse(Buffer.concat(morceaux).toString());
      const acceptees = [], deja = [], conflits = [];
      for (const m of b.modifications) {
        const cle = `${m.magasin}/${m.id}`, a = nas.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : m.donnees;
        if (a && !!a.supprime === !!m.supprime && JSON.stringify(a.donnees) === JSON.stringify(donnees)) { deja.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        if (m.base !== revA) { conflits.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        nas.rev++; nas.el.set(cle, { rev: nas.rev, supprime: !!m.supprime, donnees, appareil: b.appareil, le: '2026-11-09T10:00:00+01:00' });
        acceptees.push({ magasin: m.magasin, id: m.id, rev: nas.rev });
      }
      return json({ ok: true, rev: nas.rev, acceptees, deja, conflits });
    }
    return json({ erreur: 'action' }, 400);
  }, action && action.startsWith('synchro') ? nas.lent : 0));
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const F = `http://127.0.0.1:${faux.address().port}`;
const ADRESSE = `${F}/carnet-api/`;

const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => { if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
  await ctx.addInitScript(f => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png';
    globalThis.CARNET_COMMONS = f + '/w/api.php'; globalThis.CARNET_PLANESPOTTERS = f + '/reg/'; }, F);
  const ouvrir = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => erreurs.push(`${nom} : ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control|network connection was lost/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
    await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
    return p;
  };
  return { ctx, ouvrir, p: await ouvrir() };
}
const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } });
const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' });
const T = tel.p, I = ipad.p;
let P = pc.p;
const attendre = (p, ms) => p.waitForTimeout(ms);
const fini = (p, sel) => p.waitForFunction(s => { const e = document.querySelector(s); return e && e.textContent.trim() && !/en cours|Envoi :|Réception :|prêt \?/.test(e.textContent); }, sel, { timeout: 60000 });
const configurerNas = async p => {
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas');
  await p.fill('#nas-adr', ADRESSE); await p.fill('#nas-mdp', nas.mdp); await p.click('#nas-ok'); await attendre(p, 300); await p.click('#ou-x');
};
const onglet = (p, v) => p.click(`.tabs button[data-v="${v}"]`);
const surNas = id => nas.el.get(`vols/${id}`)?.donnees || null;
const attendreQue = async (cond, ms = 8000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
const toast = p => p.waitForFunction(() => { const t = document.getElementById('toast'); return t && !t.hidden && t.textContent.trim(); }, null, { timeout: 15000 }).then(() => p.textContent('#toast'));
const bouton = p => p.$eval('#rafraichir', e => { const r = e.getBoundingClientRect(), l = document.getElementById('q-open').getBoundingClientRect();
  return { l: Math.round(r.width), h: Math.round(r.height), gauche: r.left < l.left, visible: !!e.offsetParent, svg: !!e.querySelector('svg path') }; });

try {
  console.log('Mise en place : téléphone (référence), PC et iPad (modification)');
  const { vols, avions } = volsPDF(30);
  await T.evaluate(async ([v, a]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['vols', 'avions'], 'readwrite');
    for (const x of v) t.objectStore('vols').put(x); for (const x of a) t.objectStore('avions').put(x);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [vols, [...avions.values()]]);
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await configurerNas(T); await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok'); await fini(T, '#sr-res'); await T.click('#ou-x');
  for (const p of [P, I]) { await configurerNas(p); await p.click('#pl-sync'); await p.click('#sy-mod'); await p.click('#sc-ok'); await fini(p, '#sc-res'); await p.click('#ou-x'); }

  console.log('R60 : majuscules (dans la page affichée)');
  const maj = await T.evaluate(() => Object.fromEntries(['f-dep', 'f-arr', 'fi-reg', 'fi-nm', 'pm-tri', 'pm-nom', 'pm-pre', 'f-rem', 'fi-rem', 'f-copi', 'vm-icao']
    .map(id => [id, document.getElementById(id)?.getAttribute('autocapitalize')])));
  verifier(maj['f-dep'] === 'characters' && maj['fi-reg'] === 'characters' && maj['fi-nm'] === 'characters' && maj['pm-tri'] === 'characters' && maj['vm-icao'] === 'characters',
    'codes terrains, immatriculation, nom d\'avion, trigramme : MAJUSCULES');
  verifier(maj['pm-nom'] === 'words' && maj['pm-pre'] === 'words' && maj['f-rem'] === 'sentences' && maj['fi-rem'] === 'sentences', 'noms de personnes : majuscule à chaque mot ; remarques : au début');

  console.log('R61 : bouton « Rafraîchir » sur les trois appareils');
  for (const [nom, p] of [['téléphone', T], ['PC', P], ['iPad', I]]) {
    await onglet(p, 'carnet'); await attendre(p, 300);
    const b = await bouton(p);
    verifier(b.visible && b.l >= 44 && b.h >= 44 && b.gauche && b.svg, `${nom} : en haut à gauche, opposé à la loupe, ${b.l} × ${b.h} px, icône dessinée`);
  }
  await T.screenshot({ path: join(CAPT, 'v026-01-tel-haut-carnet.png'), clip: { x: 0, y: 0, width: 390, height: 260 } });
  await I.screenshot({ path: join(CAPT, 'v026-02-ipad-haut-carnet.png'), clip: { x: 0, y: 0, width: 1080, height: 320 } });
  nas.lent = 1200;
  await T.click('#rafraichir');
  verifier(await T.$eval('#rafraichir', e => e.classList.contains('tourne') && getComputedStyle(e.querySelector('svg')).animationName === 'tourne'), 'pendant la synchro : l\'icône tourne');
  verifier(await toast(T) === 'À jour', 'à la fin : « À jour »');
  verifier(!(await T.$eval('#rafraichir', e => e.classList.contains('tourne'))), 'l\'icône s\'arrête');
  nas.lent = 0;
  await attendre(T, 2000);
  await tel.ctx.setOffline(true);
  await T.evaluate(async () => { const e = await import('./js/etat.js'); await e.enregistrerVol({ ...e.etat.vols[0], remarques: 'TEL HORS LIGNE' }); });
  await attendre(T, 800);
  await T.click('#rafraichir');
  verifier(await toast(T) === 'Pas de réseau, 1 en attente', 'hors ligne : « Pas de réseau, 1 en attente »');
  verifier(await T.isVisible('#sync-bandeau') && (await T.textContent('#sync-bandeau')).startsWith('1 en attente d\'envoi'), `indicateur discret : « ${await T.textContent('#sync-bandeau')} »`);
  await T.screenshot({ path: join(CAPT, 'v026-03-tel-en-attente.png'), clip: { x: 0, y: 0, width: 390, height: 300 } });
  await tel.ctx.setOffline(false); await T.evaluate(() => dispatchEvent(new Event('online')));
  verifier(await attendreQue(async () => !(await T.isVisible('#sync-bandeau'))), 'réseau revenu : parti, l\'indicateur disparaît');

  console.log('R62 : enregistrement puis fermeture IMMÉDIATE de l\'app (PC)');
  const v1 = vols[3].id, v2 = vols[4].id, v3 = vols[5].id;
  const t0 = Date.now();
  await P.evaluate(async id => { const e = await import('./js/etat.js'); await e.enregistrerVol({ ...e.etat.vols.find(v => v.id === id), remarques: 'PC ENVOI IMMEDIAT' }); }, v1);
  verifier(await attendreQue(() => surNas(v1)?.remarques === 'PC ENVOI IMMEDIAT', 3000), `envoyé dès l'enregistrement (${Date.now() - t0} ms, au lieu de 5 s avant)`);
  await P.evaluate(async id => { const e = await import('./js/etat.js'); await e.enregistrerVol({ ...e.etat.vols.find(v => v.id === id), remarques: 'PC FERME TOUT DE SUITE' }); }, v2);
  await P.close({ runBeforeUnload: true });
  verifier(await attendreQue(() => surNas(v2)?.remarques === 'PC FERME TOUT DE SUITE', 5000), 'app fermée juste après l\'enregistrement : la modification est quand même arrivée au NAS');
  P = await pc.ouvrir();
  await pc.ctx.setOffline(true);
  await P.evaluate(async id => { const e = await import('./js/etat.js'); await e.enregistrerVol({ ...e.etat.vols.find(v => v.id === id), remarques: 'PC FERME HORS LIGNE' }); }, v3);
  await attendre(P, 600);
  const ind = await P.evaluate(async () => ({ t: document.getElementById('sync-bandeau').textContent, h: document.getElementById('sync-bandeau').hidden, e: JSON.stringify((await import('./js/etat.js')).etat.reglages.synchroEtat.attente) }));
  // (la modification partie à la fermeture compte encore tant que le NAS ne l'a pas confirmée : « déjà là » à la prochaine synchro)
  verifier(/^\d en attente d'envoi \(pas de réseau\)/.test(ind.t) && !ind.h, `hors ligne : « ${ind.t} » en haut du Carnet`);
  await P.close({ runBeforeUnload: true });
  await attendre(T, 1000);
  verifier(!surNas(v3) || surNas(v3).remarques !== 'PC FERME HORS LIGNE', 'fermé hors ligne : rien n\'a pu partir');
  await pc.ctx.setOffline(false);
  P = await pc.ouvrir();
  verifier(await attendreQue(() => surNas(v3)?.remarques === 'PC FERME HORS LIGNE', 8000), 'réouverture : la modification gardée sur le PC est partie toute seule');
  verifier((await P.evaluate(async id => (await import('./js/etat.js')).etat.vols.find(v => v.id === id).remarques, v3)) === 'PC FERME HORS LIGNE', 'rien de perdu sur le PC');
  await T.click('#rafraichir'); await toast(T);
  verifier((await T.evaluate(async id => (await import('./js/etat.js')).etat.vols.find(v => v.id === id).remarques, v2)) === 'PC FERME TOUT DE SUITE', 'le téléphone a reçu la modification faite juste avant la fermeture');

  console.log('R59 : fenêtre « Chercher une photo »');
  const ouvrirFiche = async (p, immat) => {
    await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
    await p.click('#ac-cur'); await p.click('#ac-all'); await p.waitForSelector('#fl-list .acitem');
    const id = await p.evaluate(async im => [...(await import('./js/etat.js')).etat.avions.values()].find(a => a.immat === im).id, immat);
    await p.click(`[data-ed="${id}"]`); await p.waitForSelector('#fiche:not([hidden])');
    await p.click('#fi-web'); await p.waitForSelector('#ph-modal:not([hidden])');
  };
  await onglet(T, 'carnet');
  await ouvrirFiche(T, 'F-XZZA');
  await T.waitForFunction(() => document.querySelector('#ph-l .phv') && document.querySelector('#ph-ps h4'), null, { timeout: 10000 });
  verifier(await T.textContent('#ph-l .phv .phtap') === 'Toucher pour utiliser', 'sous chaque vignette Commons : « Toucher pour utiliser »');
  verifier(await T.textContent('#ph-ps .ph-seule') === 'À voir seulement : ne peut pas être gardée', 'sur la photo Planespotters : « À voir seulement : ne peut pas être gardée »');
  await T.screenshot({ path: join(CAPT, 'v026-04-tel-photos.png') });
  await T.click('#ph-x'); await T.click('#fi-x'); await T.click('#fl-x'); await T.click('#cancel');
  await ouvrirFiche(T, 'F-XZZB');
  await T.waitForSelector('.ph-aucune');
  verifier((await T.textContent('.ph-aucune')).includes('Aucune photo libre de F-XZZB sur Wikimedia Commons.'), 'aucune photo Commons : dit clairement');
  verifier(await T.isVisible('label:has(#ph-cam)') && await T.isVisible('label:has(#ph-gal)') && await T.$eval('#ph-cam', e => e.getAttribute('capture')) === 'environment',
    '« Prendre une photo » (appareil photo) et « Choisir dans la galerie »');
  await T.screenshot({ path: join(CAPT, 'v026-05-tel-aucune-photo.png') });
  await T.setInputFiles('#ph-gal', join(RACINE, 'icones/icone-192.png'));
  await T.waitForSelector('#ph-modal', { state: 'hidden' });
  // v0.38 (R93) : photo de la galerie = photo à moi : la fenêtre « Recadrer la photo » s'ouvre ; Valider
  await T.waitForSelector('#rc-modal:not([hidden])'); await T.click('#rc-oui'); await T.waitForSelector('#rc-modal', { state: 'hidden' });
  verifier(await T.isVisible('#fiche img') && !(await T.isVisible('#fi-credit')), 'photo de la galerie mise dans la fiche (sans crédit)');
  await T.click('#fi-x'); await T.click('#fl-x'); await T.click('#cancel');
  await onglet(I, 'carnet');
  await ouvrirFiche(I, 'F-XZZA');
  await I.waitForFunction(() => document.querySelector('#ph-l .phv') && document.querySelector('#ph-ps h4'), null, { timeout: 10000 });
  await I.screenshot({ path: join(CAPT, 'v026-06-ipad-photos.png') });

  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.26 réussie.');
} catch (e) {
  console.error(e.message);
  await T.screenshot({ path: join(CAPT, 'v026-erreur-tel.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close();
  srv.fermer(); faux.close();
}
