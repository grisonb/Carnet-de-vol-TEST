// v0.35 : R85 vols de SIMULATION envoyés par NPF-Q400-RUN (« simulation »: true, format carnet-vol-npf v2 inchangé).
// FAUX NAS v5 local : un vrai vol NPF (sans le champ) et un vol de simulation avec 2 feux. Bandeaux rouges (bandeau
// « à importer », liste NPF, brouillon, Carte du vol, carte du Carnet, écran du vol) ; jamais compté (totaux, bande,
// 3/7/30 j, onglet Totaux, PDF, n° des feux, valeurs par défaut, doublons) ; gardé (CSV « Simulation » = oui, synchro
// vers le PC et l'iPad avec sa marque, Google Earth « SIMULATION – ») ; suppression avec Annuler. Vrai vol : inchangé.
// Téléphone (Chromium 390 px), PC (Chromium 1280 px), iPad (WebKit 1080 × 810). Vols, feux, avions INVENTÉS.
// Captures : tests/navigateur/captures/v035-*.png (non commitées). Usage : node tests/navigateur/v035.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-09T18:00:00Z';
const jour = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); // aujourd'hui - n jours (UTC)
const AUJ = jour(0), HIER = jour(1), AVANT = jour(4);

// ---------- Vols NPF (format carnet-vol-npf v2) ----------
const npfReel = { format: 'carnet-vol-npf', version: 2, id: 'npf-reel-1', exporteLe: H, date: HIER, blocDepart: '10:00', blocArrivee: '11:30',
  immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMD', feux: [{ heure: '10:30', lat: 43.61, lon: 6.95, commune: 'VILLE-ESSAI-R', nom: '' }] };
const npfSim = { format: 'carnet-vol-npf', version: 2, id: 'npf-sim-1', exporteLe: H, date: AUJ, blocDepart: '08:00', blocArrivee: '10:40',
  nomAvion: 'M92', depart: 'LFKJ', arrivee: 'LFKJ', simulation: true, remarques: 'EXERCICE ESSAI',
  feux: [{ heure: '08:40', lat: 42.10, lon: 9.05, commune: 'VILLE-ESSAI-S', nom: '' }, { heure: '09:30', lat: 41.90, lon: 8.95, commune: 'VILLE-ESSAI-T', nom: '' }] };

// ---------- Faux NAS v5 (vols NPF en attente + synchro) ----------
const nas = { mdp: 'mot-de-passe-essai-35', rev: 0, el: new Map(), npf: [npfReel, npfSim] };
const srv = await serveur();
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    if (req.headers['x-carnet-cle'] !== nas.mdp) return json({ erreur: 'mot-de-passe' }, 401);
    if (action === 'test') return json({ ok: true, copies: 0, cle: 'carnet', version: 5 });
    if (action === 'envoyer') return json({ ok: true, id: 'x', vols: 1, taille: 1, verification: 'empreinte' });
    if (action === 'vols-liste') return json({ vols: nas.npf });
    if (action === 'vol-retirer') { nas.npf = nas.npf.filter(v => v.id !== u.searchParams.get('id')); return json({ ok: true, retire: true }); }
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
        nas.rev++; nas.el.set(cle, { rev: nas.rev, supprime: !!m.supprime, donnees, appareil: b.appareil, le: H });
        acceptees.push({ magasin: m.magasin, id: m.id, rev: nas.rev });
      }
      return json({ ok: true, rev: nas.rev, acceptees, deja, conflits });
    }
    return json({ erreur: 'action' }, 400);
  });
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const ADRESSE = `http://127.0.0.1:${faux.address().port}/carnet-api/`;

// ---------- Carnet inventé ----------
const avion = (id, immat, nom) => ({ id, immat, typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom, indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H });
const AVIONS = [avion('a1', 'F-XZZA', 'M91'), avion('a2', 'F-XZZB', 'M92')];
const VOLS = [{ id: 'v-ancien', date: AVANT, hDep: '10:00', hArr: '12:00', mode: 'utc', dep: 'LFTW', arr: 'LFMN', escales: [], avionId: 'a1', tempsTotal: 120,
  tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 120, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['FEU n°40 VILLE-ESSAI-A'], remarques: '', feux: 1,
  compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(`${AVANT}T10:00Z`), creeLe: H, modifieLe: H }];

const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
async function appareil(nom, moteur, options, { vols = VOLS, nasConfig = true } = {}) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...options });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return r.continue();
    if (u.hostname === 'tuiles-essai.invalid') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ece8de"/></svg>' });
    bloquees.push(u.href); return r.abort();
  });
  await ctx.addInitScript(() => {
    globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://tuiles-essai.invalid/{z}/{x}/{y}.svg';
    for (const c of [Navigator.prototype, navigator]) try { Object.defineProperty(c, 'canShare', { value: undefined, configurable: true, writable: true }); } catch { /* idem */ } // fichiers : téléchargement
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control|restricted network port/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([as, vs, url, mdp, nasConfig]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols', 'reglages'], 'readwrite');
    for (const a of as) t.objectStore('avions').put(a);
    for (const v of vs) t.objectStore('vols').put(v);
    if (nasConfig) { const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: mdp }); g.put({ cle: 'nasAuto', valeur: false }); }
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVIONS, vols, ADRESSE, nas.mdp, nasConfig]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const volParNpf = (p, id) => p.evaluate(async i => (await import('./js/etat.js')).etat.vols.find(v => v.npfId === i) || null, id);
async function attendreVolNpf(p, id, cond = () => true) {
  for (let k = 0; k < 150; k++) { const v = await volParNpf(p, id); if (v && cond(v)) return v; await p.waitForTimeout(100); }
  throw new Error('ÉCHEC : délai dépassé pour le vol ' + id);
}
const ouvrirListeNpf = async p => { await p.click('.tabs button[data-v="carnet"]'); await p.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 15000 }); await p.click('#npf-bandeau'); await p.waitForSelector('#npf-l'); };
const ouvrirNpf = async (p, id) => { await ouvrirListeNpf(p); await p.click(`#npf-l [data-npf="${id}"]`); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(p, 300); };
// Tout ce qui est compté : TOTAL HdV, bande d'heures, 3/7/30 jours (accueil) et onglet Totaux
async function totaux(p) {
  await p.click('.tabs button[data-v="carnet"]'); await attendre(p, 200);
  const accueil = await p.evaluate(() => ({ total: document.getElementById('h-total').textContent, bande: document.getElementById('h-strip').innerText.replace(/\s+/g, ' '),
    jours: document.getElementById('h-quick').innerText.replace(/\s+/g, ' ') }));
  await p.click('.tabs button[data-v="totaux"]'); await attendre(p, 200);
  const onglet = await p.evaluate(() => document.getElementById('v-totaux').innerText.replace(/\s+/g, ' '));
  await p.click('.tabs button[data-v="carnet"]');
  return { ...accueil, onglet };
}
const visibleRouge = (p, sel) => p.$eval(sel, e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return { texte: e.textContent, fond: s.backgroundColor, visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' }; });
async function telecharger(p, ouvrir, bouton) {
  await p.click('.tabs button[data-v="plus"]'); await p.click(ouvrir);
  if (bouton === '#xp-dl') { await p.click('#xp-go'); await p.waitForSelector('#xp-fin:not([hidden])', { timeout: 60000 }); }
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click(bouton)]);
  const brut = readFileSync(await dl.path());
  let texte = brut.toString('latin1');
  // PDF compressé : on décompresse chaque flux pour y chercher le texte
  if (texte.startsWith('%PDF')) {
    const morceaux = [];
    for (const m of texte.matchAll(/stream\r?\n/g)) {
      const debut = m.index + m[0].length, fin = texte.indexOf('endstream', debut);
      try { morceaux.push(inflateSync(brut.subarray(debut, fin)).toString('latin1')); } catch { /* flux non compressé */ }
    }
    texte = texte.slice(0, 8) + morceaux.join('\n');
  }
  await p.click('#ou-x'); await p.click('.tabs button[data-v="carnet"]'); await p.waitForTimeout(200);
  return texte;
}
async function glisser(p, cdp, loc, dx) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const x0 = b.x + b.width * 0.7, y0 = b.y + Math.min(b.height / 2, 40);
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + dx * i / 10, y0) }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);
}

try {
  console.log('iPad (WebKit) : brouillon de simulation (sans l\'enregistrer)');
  const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' }, { vols: [] });
  const I = ipad.p;
  await ouvrirNpf(I, 'npf-sim-1');
  verifier((await visibleRouge(I, '#f-sim')).visible, 'iPad : bandeau « SIMULATION VOL » en haut du brouillon');
  await I.screenshot({ path: join(CAPT, 'v035-05-ipad-brouillon-simulation.png') });
  await I.click('#cancel'); await I.click('#ab-yes').catch(() => {}); await I.waitForSelector('#v-carnet:not([hidden])');

  console.log('Téléphone 390 px : bandeau « vols à importer » et liste NPF');
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const T = tel.p, cdp = await tel.ctx.newCDPSession(T);
  await T.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 15000 });
  const bandeau = await T.evaluate(() => ({ t: document.getElementById('npf-bandeau').textContent, sim: document.querySelector('#npf-bandeau .sim-ligne')?.textContent }));
  verifier(bandeau.t.startsWith('2 vols à importer depuis NPF-Q400 ›') && bandeau.sim === 'SIMULATION VOL : 1 sur 2', `bandeau : « ${bandeau.t} »`);
  const fondSim = (await visibleRouge(T, '#npf-bandeau .sim-ligne')).fond;
  verifier(fondSim === 'rgb(198, 40, 40)', `bandeau rouge (${fondSim}, texte blanc : contraste 5,6)`);
  await T.screenshot({ path: join(CAPT, 'v035-01-tel-bandeau-a-importer.png') });
  await ouvrirListeNpf(T);
  const lignes = await T.$$eval('#npf-l .npfv', l => l.map(b => ({ id: b.dataset.npf, sim: b.querySelector('.sim-bandeau')?.textContent || '' })));
  verifier(lignes.find(l => l.id === 'npf-sim-1').sim === 'SIMULATION VOL' && lignes.find(l => l.id === 'npf-reel-1').sim === '', 'liste NPF : « SIMULATION VOL » sur le vol de simulation seulement');
  await T.screenshot({ path: join(CAPT, 'v035-02-tel-liste-npf.png') });
  await T.click('#ou-x');

  console.log('Vrai vol NPF (sans le champ) : inchangé');
  const avantTout = await totaux(T);
  await ouvrirNpf(T, 'npf-reel-1');
  verifier(await T.isHidden('#f-sim') && (await T.textContent('#f-title')) === 'Vol NPF-Q400 à vérifier', 'vrai vol : brouillon habituel, sans bandeau');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const reel = await attendreVolNpf(T, 'npf-reel-1');
  verifier(!('simulation' in reel) && reel.missions[0] === 'FEU n°41 VILLE-ESSAI-R' && reel.feuxPositions.length === 1, `vrai vol enregistré sans marque (${reel.missions[0]})`);
  const apresReel = await totaux(T);
  verifier(apresReel.total !== avantTout.total, `vrai vol compté (TOTAL ${avantTout.total} -> ${apresReel.total})`);

  console.log('Vol de simulation : brouillon, Carte du vol, enregistrement');
  await ouvrirNpf(T, 'npf-sim-1');
  const fs = await visibleRouge(T, '#f-sim');
  verifier(fs.visible && fs.texte.startsWith('SIMULATION VOL') && fs.fond === 'rgb(198, 40, 40)', 'brouillon : bandeau rouge « SIMULATION VOL » en haut');
  verifier((await T.textContent('#f-title')) === 'Vol NPF-Q400 à vérifier' && (await T.textContent('#npf-txt')).startsWith('Vol envoyé par NPF-Q400 · 2 feux'), 'le reste du brouillon est celui d\'un vrai vol');
  const lignesSim = await T.$$eval('#ml input', l => l.map(x => x.value.trim()));
  verifier(JSON.stringify(lignesSim) === '["FEU n°42 VILLE-ESSAI-S","FEU n°43 VILLE-ESSAI-T"]', `feux du brouillon : ${lignesSim.join(', ')}`);
  await T.screenshot({ path: join(CAPT, 'v035-03-tel-brouillon-simulation.png') });
  await T.waitForSelector('#carte-mini.leaflet-container', { timeout: 15000 });
  await T.click('#carte-mini'); await T.waitForSelector('#carte-grande .carte-feu'); await attendre(T, 500);
  const cs = await T.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const b = r('#cp-sim'), c = r('#carte-grande'), o = r('#cp-fond');
    return { visible: !document.getElementById('cp-sim').hidden && b.height > 0, sousTitre: b.top >= r('#carte-plein .shead').bottom - 0.5, nonCache: b.bottom <= c.top + 0.5 && b.bottom <= o.top + 0.5, feux: document.querySelectorAll('#carte-grande .carte-feu').length }; });
  verifier(cs.visible && cs.sousTitre && cs.nonCache && cs.feux === 2, `Carte du vol : bandeau « SIMULATION VOL » (ne cache ni la carte ni Plan / Photo), ${cs.feux} feux`);
  await T.screenshot({ path: join(CAPT, 'v035-04-tel-carte-simulation.png') });
  await T.click('#cp-x');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const sim = await attendreVolNpf(T, 'npf-sim-1');
  verifier(sim.simulation === true && sim.feuxPositions.length === 2 && sim.avionId === 'a2', 'vol de simulation enregistré avec sa marque et ses 2 positions de feu');

  console.log('Jamais compté');
  const apresSim = await totaux(T);
  verifier(JSON.stringify(apresSim) === JSON.stringify(apresReel), `TOTAL HdV (${apresSim.total}), bande d'heures, 3/7/30 jours (${apresSim.jours}) et onglet Totaux inchangés`);
  const reels = await T.evaluate(async () => { const { etat } = await import('./js/etat.js'); const { hm } = await import('./js/temps.js');
    return { sans: hm(etat.vols.filter(v => !v.simulation).reduce((s, v) => s + v.tempsTotal, 0)), avec: hm(etat.vols.reduce((s, v) => s + v.tempsTotal, 0)) }; });
  verifier(apresSim.total === reels.sans && reels.sans !== reels.avec, `TOTAL = vrais vols seulement (${reels.sans} ; avec la simulation ce serait ${reels.avec})`);
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  const nv = await T.evaluate(() => ({ feu: document.getElementById('fire-next').textContent, dep: document.getElementById('f-dep').value, reg: document.getElementById('ac-reg').textContent }));
  verifier(nv.feu === '(prochain : n°42)', `nouveau vol : prochain feu n°42 (la simulation, n°42-43, est ignorée) : ${nv.feu}`);
  verifier(nv.dep === 'LFMD' && nv.reg === 'M91', `nouveau vol : départ ${nv.dep} et avion ${nv.reg} du dernier VRAI vol (pas LFKJ / M92 de la simulation)`);
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  const pdf = await telecharger(T, '#pl-pdf', '#xp-dl');
  verifier(pdf.startsWith('%PDF') && pdf.includes('LFMD') && !pdf.includes('LFKJ') && !pdf.includes('EXERCICE ESSAI'), 'PDF EASA : le vrai vol y est, le vol de simulation non');
  const dbl = await T.evaluate(async () => { const { doublons } = await import('./js/synchro.js'); const { etat } = await import('./js/etat.js');
    const s = etat.vols.find(v => v.simulation), r = etat.vols.find(v => v.npfId === 'npf-reel-1'), cle = v => `${v.date}|${v.dep}|${v.hDep}`;
    return { sim: doublons([s, { ...s, id: 'copie-sim' }], cle, '2000').length, reel: doublons([r, { ...r, id: 'copie-reel' }], cle, '2000').length }; });
  verifier(dbl.sim === 0 && dbl.reel === 1, 'doublons : une simulation n\'est jamais signalée (un vrai vol en double l\'est toujours)');

  console.log('Gardé : liste, écran du vol, CSV, Google Earth');
  const carteListe = await T.$eval(`.flight[data-id="${sim.id}"]`, c => ({ sim: c.classList.contains('sim'), bandeau: c.querySelector('.fl-sim')?.textContent }));
  verifier(carteListe.sim && carteListe.bandeau === 'SIMULATION VOLhors totaux', 'liste : bandeau rouge « SIMULATION VOL » sur la carte du vol');
  verifier(await T.$eval(`.flight[data-id="${reel.id}"]`, c => !c.querySelector('.fl-sim')), 'liste : rien sur le vrai vol');
  await T.screenshot({ path: join(CAPT, 'v035-06-tel-liste-simulation.png') });
  await T.click(`.flight[data-id="${sim.id}"]`); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 300);
  verifier((await visibleRouge(T, '#f-sim')).visible && (await T.textContent('#f-title')) === 'Modifier le vol', 'écran du vol : bandeau « SIMULATION VOL »');
  await T.waitForSelector('#carte-mini.leaflet-container', { timeout: 15000 });
  await T.click('#carte-mini'); await T.waitForSelector('#carte-grande .carte-feu'); await attendre(T, 400);
  verifier(await T.isVisible('#cp-sim'), 'Carte du vol enregistré : bandeau « SIMULATION VOL »');
  const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#cp-ge')]);
  const kml = readFileSync(await dl.path(), 'utf8');
  const noms = [...kml.matchAll(/<Placemark>\s*<name>([^<]*)<\/name>/g)].map(m => m[1]);
  verifier(noms.length === 2 && noms[0] === `SIMULATION – Feu n°42 / ${AUJ.slice(0, 4)} / VILLE ESSAI S` && noms[1].startsWith('SIMULATION – Feu n°43'), `Google Earth : ${noms.join(' | ')}`);
  await T.click('#cp-x'); await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');
  // un vrai vol garde son export Google Earth habituel
  const kmlReel = await T.evaluate(async () => { const { kmlDuVol } = await import('./js/kml.js'); const { etat } = await import('./js/etat.js'); return kmlDuVol(etat.vols.find(v => v.npfId === 'npf-reel-1')).points[0].nom; });
  verifier(kmlReel === `Feu n°41 / ${HIER.slice(0, 4)} / VILLE ESSAI R`, `vrai vol : « ${kmlReel} » (sans préfixe)`);
  const csv = await telecharger(T, '#pl-csv', '#cs-dl');
  const csvLignes = csv.replace(/^﻿|^ï»¿/, '').split(/\r?\n/).filter(Boolean).map(l => l.split(';'));
  const iSim = csvLignes[0].indexOf('Simulation'), iId = csvLignes[0].indexOf('Identifiant');
  const ligneDe = id => csvLignes.find(l => l[iId] === id);
  verifier(iSim > 0 && ligneDe(sim.id)[iSim] === 'oui' && ligneDe(reel.id)[iSim] === '' && ligneDe('v-ancien')[iSim] === '', 'CSV : colonne « Simulation » = oui pour la simulation seulement');

  console.log('Synchro vers le PC et l\'iPad (avec la marque)');
  await T.click('.tabs button[data-v="plus"]'); await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok');
  await T.waitForFunction(() => /^Synchronisé/.test(document.getElementById('sr-res').textContent), null, { timeout: 30000 }); await T.click('#ou-x');
  const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } }, { vols: [], nasConfig: true });
  const P = pc.p;
  await P.click('.tabs button[data-v="plus"]'); await P.click('#pl-sync'); await P.click('#sy-mod'); await P.click('#sc-ok');
  await P.waitForFunction(() => /^À jour/.test(document.getElementById('sc-res').textContent), null, { timeout: 30000 }); await P.click('#ou-x');
  const simPc = await attendreVolNpf(P, 'npf-sim-1');
  const totPc = await totaux(P);
  verifier(simPc.simulation === true && totPc.total === apresSim.total && totPc.jours === apresSim.jours, `PC : vol reçu avec sa marque, totaux identiques au téléphone (${totPc.total})`);
  verifier(await P.$eval(`.flight[data-id="${sim.id}"] .fl-sim`, e => e.textContent.startsWith('SIMULATION VOL')), 'PC : bandeau sur la carte du vol');
  await I.click('.tabs button[data-v="plus"]'); await I.click('#pl-sync'); await I.click('#sy-mod'); await I.click('#sc-ok');
  await I.waitForFunction(() => /^À jour/.test(document.getElementById('sc-res').textContent), null, { timeout: 30000 }); await I.click('#ou-x');
  const simI = await attendreVolNpf(I, 'npf-sim-1');
  verifier(simI.simulation === true && (await totaux(I)).total === apresSim.total, 'iPad : vol reçu avec sa marque, hors totaux');
  await I.click('.tabs button[data-v="carnet"]'); await attendre(I, 300);
  await I.screenshot({ path: join(CAPT, 'v035-07-ipad-liste-simulation.png') });
  await I.click(`.flight[data-id="${sim.id}"]`); await I.waitForSelector('#v-saisie:not([hidden])');
  await I.waitForSelector('#carte-mini.leaflet-container', { timeout: 15000 });
  await I.click('#carte-mini'); await I.waitForSelector('#carte-grande .carte-feu'); await attendre(I, 500);
  verifier(await I.isVisible('#cp-sim'), 'iPad : Carte du vol avec le bandeau « SIMULATION VOL »');
  await I.screenshot({ path: join(CAPT, 'v035-08-ipad-carte-simulation.png') });
  await I.click('#cp-x'); await I.click('#cancel');

  console.log('Suppression (glissé + Annuler)');
  const avantSuppr = await totaux(T);
  await glisser(T, cdp, T.locator(`.flight[data-id="${sim.id}"]`), -170);
  await T.tap('.flrow.ouvert .swdel'); await T.click('#fd-yes'); await attendre(T, 300);
  verifier(!(await T.$(`.flight[data-id="${sim.id}"]`)) && !(await volParNpf(T, 'npf-sim-1')), 'glissé + « Oui, supprimer » : le vol de simulation disparaît');
  verifier(JSON.stringify(await totaux(T)) === JSON.stringify(avantSuppr), 'totaux inchangés par la suppression (il n\'y comptait pas)');
  await T.waitForSelector('#toast:not([hidden]) .tbtn'); await T.tap('#toast .tbtn'); await attendre(T, 300);
  const remis = await volParNpf(T, 'npf-sim-1');
  verifier(remis && remis.simulation === true && JSON.stringify(remis) === JSON.stringify(sim), '« Annuler » : le vol revient à l\'identique, avec sa marque');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.35 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer(); faux.close();
}
