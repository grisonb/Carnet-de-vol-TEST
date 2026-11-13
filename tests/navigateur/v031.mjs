// v0.31 : R70 orange « Entraînement », R71 période dans la loupe, R72 déplacer / supprimer une flamme (Carte du vol),
// R73 fond photo aérienne (IGN), R74 étiquettes des terrains intermédiaires.
// Téléphone (Chromium 390 px et 360 px), PC (Chromium 1280 px) et iPad (WebKit 1080 × 810) autour d'un FAUX NAS v5 local
// (vols NPF-Q400 + synchro). Les services IGN (photos aériennes, géocodage inverse) sont SIMULÉS dans le navigateur de test
// (adresse fictive ign-essai.invalid) : aucun appel réel. Vols, feux, communes et avions INVENTÉS.
// Captures : tests/navigateur/captures/v031-*.png (non commitées). Usage : node tests/navigateur/v031.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-09T18:00:00Z';

// ---------- Tuile « photo » inventée (PNG 256 × 256 en dégradé vert / brun, fabriqué ici) ----------
function tuilePng(plan = false) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloc = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
  const lignes = [];
  for (let y = 0; y < 256; y++) { const l = Buffer.alloc(1 + 256 * 3); for (let x = 0; x < 256; x++) { l[1 + x * 3] = plan ? 236 : 70 + ((x * 3 + y) % 60); l[2 + x * 3] = plan ? 232 : 95 + ((x + y * 2) % 50); l[3 + x * 3] = plan ? 222 : 55; } lignes.push(l); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.concat(lignes))), bloc('IEND', Buffer.alloc(0))]);
}
const TUILE = tuilePng(), TUILE_PLAN = tuilePng(true);
const IGN = { tuiles: 0, geocodage: [] };
const communeInventee = lat => (lat >= 43.75 ? 'COMMUNE-ESSAI-NORD' : 'COMMUNE-ESSAI-SUD');

// ---------- Faux NAS v5 (vols NPF-Q400 + synchro), comme v027 ----------
const npfFeux = (exporteLe, feux) => ({ format: 'carnet-vol-npf', version: 2, id: 'npf-feux', exporteLe, date: '2026-11-09', blocDepart: '10:00', blocArrivee: '11:30',
  immat: 'F-XZZA', depart: 'LFTW', arrivee: 'LFTW', remarques: '', feux });
const FEUX_NPF = [{ heure: '10:20', lat: 43.80, lon: 4.30, commune: 'COMMUNE-NPF-UN', nom: '' }, { heure: '10:50', lat: 43.70, lon: 4.60, commune: 'COMMUNE-NPF-DEUX', nom: '' }];
const nas = { mdp: 'mot-de-passe-essai-31', rev: 0, el: new Map(), npf: [npfFeux(H, FEUX_NPF)] };
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
const AVION = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H };
const vol = (id, date, champs) => ({ id, date, hDep: '10:00', hArr: '11:00', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 60, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 60, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['TRANSIT ESSAI'], remarques: '',
  feux: 0, compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie',
  ordre: Date.parse(`${date}T10:00Z`), creeLe: H, modifieLe: H, ...champs });
// 30 vols de 2023 à 2026 (durées différentes pour que les totaux d'une période se distinguent)
const VOLS = [];
for (let k = 0; k < 30; k++) {
  const d = new Date(Date.UTC(2023, 0, 5) + k * 47 * 864e5).toISOString().slice(0, 10);
  VOLS.push(vol(`v-${String(k).padStart(2, '0')}`, d, { tempsTotal: 30 + k * 7, tempsCdB: 30 + k * 7, missions: [k % 3 ? 'TRANSIT ESSAI' : 'GAAR ESSAI'] }));
}
VOLS.push(vol('v-ent', '2026-10-20', { missions: ['ENT. OPS ESSAI'], tempsIFR: 20 }));                        // entraînement (+ IFR)
VOLS.push(vol('v-via', '2026-10-21', { escales: [                                                          // terrains intermédiaires
  { code: '', nom: 'PELICANDROME-AU-NOM-TRES-TRES-LONG-POUR-ESSAYER-LE-RACCOURCI', attJour: 2, attNuit: 1, approches: 0, lat: 43.7, lon: 4.4 },
  { code: 'LFMN', attJour: 1, attNuit: 0, approches: 1 }], approches: 1 }));
const FEU_IPAD = vol('v-feu-ipad', '2026-10-22', { missions: ['FEU n°70 ESSAI'], feux: 1, compteurs: { largCdbDash: 2 },
  feuxPositions: [{ heure: '10:20', lat: 43.80, lon: 4.30, commune: 'COMMUNE-NPF-UN', nom: '' }] });

const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
async function appareil(nom, moteur, options, { nasConfig = true, vols = VOLS } = {}) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1') return r.continue();
    if (u.hostname === 'ign-essai.invalid') { // FAUX services IGN (simulés ici)
      if (u.pathname.startsWith('/plan/')) return r.fulfill({ status: 200, contentType: 'image/png', body: TUILE_PLAN });
      if (u.pathname.startsWith('/photo/')) { IGN.tuiles++; return r.fulfill({ status: 200, contentType: 'image/png', body: TUILE, headers: { 'Access-Control-Allow-Origin': '*' } }); }
      if (u.pathname === '/geocodage/reverse') {
        const lat = Number(u.searchParams.get('lat')); IGN.geocodage.push({ index: u.searchParams.get('index'), lat, lon: Number(u.searchParams.get('lon')) });
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { city: communeInventee(lat) } }] }) });
      }
    }
    bloquees.push(u.href); return r.abort();
  });
  await ctx.addInitScript(() => {
    globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://ign-essai.invalid/plan/{z}/{x}/{y}.png'; // faux plan (simulé)
    globalThis.CARNET_TUILES_PHOTO = 'http://ign-essai.invalid/photo/{z}/{x}/{y}.png'; globalThis.CARNET_GEOCODAGE = 'http://ign-essai.invalid/geocodage/';
  });
  const p = await ctx.newPage();
  // WebKit sans écran : la vérification du service worker (sw.js) peut échouer quand le serveur de test se ferme ; ce n'est pas une erreur de l'app
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([a, vs, url, mdp, nasConfig]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols', 'reglages'], 'readwrite'); t.objectStore('avions').put(a);
    for (const v of vs) t.objectStore('vols').put(v);
    if (nasConfig) { const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: mdp }); g.put({ cle: 'nasAuto', valeur: false }); }
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVION, vols, ADRESSE, nas.mdp, nasConfig]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const volEnregistre = (p, cond) => p.evaluate(async c => { const e = await import('./js/etat.js'); return e.etat.vols.find(new Function('v', `return ${c}`)) || null; }, cond);
// Attend qu'un vol remplisse une condition (relu toutes les 100 ms, 15 s au plus)
async function attendreVol(p, id, cond) {
  for (let k = 0; k < 150; k++) {
    const v = await p.evaluate(async i => (await import('./js/etat.js')).etat.vols.find(x => x.id === i) || null, id);
    if (v && cond(v)) return v;
    await p.waitForTimeout(100);
  }
  throw new Error('ÉCHEC : délai dépassé pour le vol ' + id);
}
const reglageDe = (p, cle) => p.evaluate(async c => (await import('./js/etat.js')).etat.reglages[c], cle);
const hmTexte = m => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
const totalDe = vs => vs.reduce((s, v) => s + (v.tempsTotal || 0), 0);
// contraste WCAG d'un élément (texte / fond calculés par le navigateur)
const couleurs = (p, sel) => p.$eval(sel, e => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const s = getComputedStyle(e), a = lum(rgb(s.color)), b = lum(rgb(s.backgroundColor));
  return { fond: s.backgroundColor, texte: s.color, contraste: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10 };
});

// Appui long puis glissé : toucher réel (protocole DevTools, Chromium) ou souris (PC, iPad WebKit)
async function appuiLongGlisse(p, sel, dx, dy, cdp = null) {
  const b = await p.locator(sel).boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await attendre(p, 800);
    for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * k / 10, y: y + dy * k / 10 }] }); await attendre(p, 25); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await p.mouse.move(x, y); await p.mouse.down(); await attendre(p, 800);
    for (let k = 1; k <= 10; k++) { await p.mouse.move(x + dx * k / 10, y + dy * k / 10); await attendre(p, 25); }
    await p.mouse.up();
  }
  return { x, y };
}
const centre = async (p, sel) => { const b = await p.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function ouvrirCartePlein(p, idVol) {
  await p.click('.tabs button[data-v="carnet"]');
  await p.click(`#list .flight[data-id="${idVol}"]`); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.waitForSelector('#carte-mini .carte-feu', { timeout: 15000 });
  await p.click('#carte-mini'); await p.waitForSelector('#carte-plein:not([hidden])');
  await p.waitForSelector('#carte-grande .carte-feu', { timeout: 15000 }); await attendre(p, 400);
}
// R70 : étiquette et pastille Entraînement (clair ou sombre)
async function controlerEntrainement(p, vue, sombre) {
  const e = await couleurs(p, '.flight[data-id="v-ent"] .chip.mi.ent'), b = await couleurs(p, '.flight[data-id="v-ent"] .fl-bloc');
  // v0.35 (R86) : l'orange de R70 est remplacé par #c8650f, texte blanc gras (contraste 3,9 : choix du pilote)
  if (!sombre) verifier(e.fond === 'rgb(200, 101, 15)' && e.texte === 'rgb(255, 255, 255)', `${vue} : étiquette « Entraînement » #c8650f / blanc (R86)`);
  // v0.38 (R95) : pastille fond blanc (sombre : fond de la carte), heure de la couleur Entraînement (sombre : #e8913f)
  verifier(b.texte === (sombre ? 'rgb(232, 145, 63)' : e.fond) && b.fond === (sombre ? 'rgb(23, 34, 46)' : 'rgb(255, 255, 255)'), `${vue} : pastille du temps de vol de la couleur Entraînement (${b.fond} / ${b.texte})`);
  verifier(e.contraste >= 3.9, `${vue} : contraste mesuré ${e.contraste} (3,9 voulu par le pilote, texte gras)`);
  return e;
}

try {
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const T = tel.p, cdp = await tel.ctx.newCDPSession(T);

  console.log('R70 : orange « Entraînement »');
  const gaarAvant = await couleurs(T, '.flight[data-id="v-00"] .chip.mi.gaar');
  await controlerEntrainement(T, 'clair', false);
  verifier(gaarAvant.fond === 'rgb(216, 27, 96)' && (await couleurs(T, '.flight[data-id="v-ent"] .chip.ifr')).fond === 'rgb(230, 238, 247)', 'GAAR framboise (R86), IFR inchangé');
  await T.locator('.flight[data-id="v-ent"]').screenshot({ path: join(CAPT, 'v031-01-tel-entrainement-clair.png') });
  await T.emulateMedia({ colorScheme: 'dark' });
  await controlerEntrainement(T, 'sombre', true);
  await T.locator('.flight[data-id="v-ent"]').screenshot({ path: join(CAPT, 'v031-02-tel-entrainement-sombre.png') });
  await T.emulateMedia({ colorScheme: 'light' });

  console.log('R71 : période dans la loupe');
  const tousTotal = await T.textContent('#h-total');
  await T.click('.tabs button[data-v="totaux"]'); await T.waitForSelector('#t-h .tline');
  const totauxAvant = await T.innerText('#t-h');
  await T.click('.tabs button[data-v="carnet"]');
  await T.click('#q-open');
  verifier(await T.isVisible('#p-du') && await T.isVisible('#p-au'), 'loupe : champs « Du » et « Au »');
  await T.fill('#p-du', ''); await T.locator('#p-du').pressSequentially('01012025'); await attendre(T, 400);
  verifier(await T.inputValue('#p-du') === '01/01/2025', 'chiffres tapés mis en forme : 01/01/2025');
  const auj = await T.evaluate(async () => (await import('./js/temps.js')).aujourdhui());
  const depuis = [...VOLS, ].filter(v => v.date >= '2025-01-01' && v.date <= auj);
  let ecran = await T.evaluate(() => ({ n: document.querySelectorAll('#list .flight').length, total: document.getElementById('h-total').textContent,
    bandeau: !document.getElementById('periode-bandeau').hidden && document.getElementById('pb-txt').textContent, quick: !document.getElementById('h-quick').hidden }));
  verifier(ecran.n === depuis.length && ecran.total === hmTexte(totalDe(depuis)),
    `« Du » seule : jusqu'à aujourd'hui (${ecran.n} vols, TOTAL HdV ${ecran.total})`);
  verifier(/^Période : du 01\/01\/2025 au \d\d\/\d\d\/\d{4} \(aujourd'hui\)$/.test(ecran.bandeau) && !ecran.quick, `bandeau « ${ecran.bandeau} » ; 3 / 7 / 30 jours masqués`);
  await T.locator('#p-au').pressSequentially('10/05/2025'); await attendre(T, 400);
  const periode = VOLS.filter(v => v.date >= '2025-01-01' && v.date <= '2025-05-10');
  ecran = await T.evaluate(() => ({ n: document.querySelectorAll('#list .flight').length, total: document.getElementById('h-total').textContent,
    bandeau: document.getElementById('pb-txt').textContent, bande: document.getElementById('h-strip').innerText.replace(/\s+/g, ' ') }));
  const bandeAttendue = await T.evaluate(async ids => {
    const e = await import('./js/etat.js'), t = await import('./js/totaux.js'), b = await import('./js/bande.js');
    const tot = t.calculerTotaux(e.etat.vols.filter(v => ids.includes(v.id)), e.etat.avions);
    return e.reglage('bandeHeures').map(c => b.valeurBande(c, tot)).filter(Boolean).map(v => `${v.texte} ${v.lib}`).join(' ');
  }, periode.map(v => v.id));
  verifier(ecran.n === periode.length && ecran.total === hmTexte(totalDe(periode)) && ecran.bandeau === 'Période : du 01/01/2025 au 10/05/2025',
    `période complète : ${ecran.n} vols, TOTAL HdV ${ecran.total}, « ${ecran.bandeau} »`);
  verifier(ecran.bande.toUpperCase() === bandeAttendue.toUpperCase(), `bande d'heures sur la période : ${ecran.bande}`);
  await T.screenshot({ path: join(CAPT, 'v031-03-tel-loupe-periode.png') });
  await T.fill('#q', 'GAAR'); await attendre(T, 400);
  const avecTexte = periode.filter(v => v.missions[0].startsWith('GAAR'));
  verifier((await T.$$('#list .flight')).length === avecTexte.length && avecTexte.length > 0 && await T.textContent('#h-total') === hmTexte(totalDe(periode)),
    `période + recherche « GAAR » : ${avecTexte.length} vol(s) ; le TOTAL reste celui de la période`);
  await T.fill('#q', ''); await attendre(T, 300);
  await T.click('.tabs button[data-v="totaux"]'); await T.waitForSelector('#t-h .tline');
  verifier(await T.innerText('#t-h') === totauxAvant, 'onglet Totaux : tout le carnet (identique sans période)');
  await T.click('.tabs button[data-v="plus"]'); await T.click('#pl-pdf');
  await T.click('#xp-go'); await T.waitForSelector('#xp-fin:not([hidden])', { timeout: 30000 });
  const pagesAvecPeriode = await T.textContent('#xp-prog');
  await T.click('#ou-x');
  await T.click('.tabs button[data-v="carnet"]');
  verifier(!(await T.isHidden('#periode-bandeau')), 'retour au Carnet : la période est toujours là (bandeau)');
  await T.fill('#p-du', '10/05/2025'); await T.fill('#p-au', '01/01/2025'); await T.dispatchEvent('#p-au', 'input'); await attendre(T, 400);
  ecran = await T.evaluate(() => ({ err: !document.getElementById('p-err').hidden && document.getElementById('p-err').textContent, n: document.querySelectorAll('#list .flight').length,
    bandeau: !document.getElementById('periode-bandeau').hidden, total: document.getElementById('h-total').textContent }));
  verifier(ecran.err && /avant/.test(ecran.err) && !ecran.bandeau && ecran.total === tousTotal, `« Au » avant « Du » : « ${ecran.err} », rien n'est filtré (TOTAL ${ecran.total})`);
  await T.fill('#p-du', '01/01/2025'); await T.fill('#p-au', '10/05/2025'); await T.dispatchEvent('#p-au', 'input'); await attendre(T, 300);
  await T.click('#q-open'); await attendre(T, 200); // loupe refermée : la période reste
  verifier(await T.isVisible('#periode-bandeau') && await T.isHidden('#periode'), 'loupe refermée : bandeau toujours visible');
  await T.screenshot({ path: join(CAPT, 'v031-04-tel-bandeau-periode.png') });
  await T.click('#pb-x'); await attendre(T, 300);
  verifier(await T.isHidden('#periode-bandeau') && await T.textContent('#h-total') === tousTotal && await T.isVisible('#h-quick'), 'croix : retour à tout le carnet (TOTAL et 3 / 7 / 30 jours)');
  await T.click('.tabs button[data-v="plus"]'); await T.click('#pl-pdf');
  await T.click('#xp-go'); await T.waitForSelector('#xp-fin:not([hidden])', { timeout: 30000 });
  const pagesSans = await T.textContent('#xp-prog');
  await T.click('#ou-x'); await T.click('.tabs button[data-v="carnet"]');
  verifier(pagesAvecPeriode === pagesSans, `PDF EASA : tout le carnet, avec ou sans période (${pagesSans})`);

  console.log('R74 : étiquettes des terrains intermédiaires');
  await T.click('#list .flight[data-id="v-via"]'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 200);
  const via = await T.$$eval('#via-list .viachip', l => l.map(c => {
    const r = c.getBoundingClientRect(), n = c.querySelector('.vc-n').getBoundingClientRect(), nom = c.querySelector('.vc-nom');
    return { texte: c.innerText.replace(/\s+/g, ' '), coupe: nom.scrollWidth > nom.clientWidth, nVisible: n.right <= r.right + 0.5 && n.right <= innerWidth,
      pastilles: [...c.querySelectorAll('.vc-p')].map(p => ({ t: p.textContent, zero: p.classList.contains('zero'), couleur: getComputedStyle(p.querySelector('b')).color, graisse: getComputedStyle(p.querySelector('b')).fontWeight })) };
  }));
  verifier(via[0].pastilles.map(x => x.t).join(' | ') === '3 att | 1 nuit | 0 appr' && via[1].pastilles.map(x => x.t).join(' | ') === '1 att | 1 appr', `nombres en pastilles : ${via.map(v => v.pastilles.map(x => x.t).join(' · ')).join(' / ')}`);
  verifier(via[0].pastilles[2].zero && via[0].pastilles[2].couleur !== via[0].pastilles[0].couleur && via[0].pastilles[0].graisse === '800', `0 en gris (${via[0].pastilles[2].couleur}), autres en gras foncé (${via[0].pastilles[0].couleur}, 800)`);
  verifier(via[0].coupe && via.every(v => v.nVisible), '390 px : nom très long raccourci « … », nombres visibles');
  await T.locator('.sec.c-route, #via-list').first().screenshot({ path: join(CAPT, 'v031-05-tel-terrains.png') }).catch(() => T.locator('#via-list').screenshot({ path: join(CAPT, 'v031-05-tel-terrains.png') }));
  await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');

  console.log('Vol feu reçu de NPF-Q400 (2 flammes inventées)');
  await T.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 15000 }); await T.click('#npf-bandeau'); await T.waitForSelector('#npf-l');
  await T.click('#npf-l [data-npf="npf-feux"]'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 300);
  await T.click('[data-c="largCdbDash"][data-d="1"]'); await T.click('[data-c="largCdbDash"][data-d="1"]');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const v0 = await volEnregistre(T, "v.npfId === 'npf-feux'");
  verifier(v0 && v0.feuxPositions.length === 2 && v0.feux === 2 && v0.compteurs.largCdbDash === 2, 'vol enregistré : 2 flammes, 2 feux, 2 largages');

  console.log('R73 : fond Plan / Photo');
  await ouvrirCartePlein(T, v0.id);
  verifier(await T.getAttribute('#cp-fond [data-fond="plan"]', 'aria-pressed') === 'true', 'Plan par défaut');
  const tuilesAvant = IGN.tuiles;
  await T.click('#cp-fond [data-fond="photo"]'); await attendre(T, 800);
  const attribution = await T.textContent('#carte-grande .leaflet-control-attribution');
  verifier(IGN.tuiles > tuilesAvant && attribution.includes('© IGN') && !attribution.includes('OpenStreetMap'), `Photo : photos aériennes IGN (${IGN.tuiles - tuilesAvant} tuiles, crédit « ${attribution.trim()} »)`);
  verifier(await reglageDe(T, 'carteFond') === 'photo', 'choix « Photo » mémorisé');
  await T.screenshot({ path: join(CAPT, 'v031-06-tel-carte-photo-flamme.png') });

  console.log('R72 : appui long sur une flamme, Annuler');
  const avant = await centre(T, '#carte-grande .carte-feu[data-feu="0"]');
  await appuiLongGlisse(T, '#carte-grande .carte-feu[data-feu="0"]', 70, 60, cdp);
  await T.waitForSelector('#feu-modal:not([hidden])', { timeout: 5000 });
  const fen = await T.evaluate(() => ({ t: document.getElementById('feu-t').textContent, oui: document.getElementById('feu-oui').textContent, ouiVert: document.getElementById('feu-oui').classList.contains('vert'),
    non: document.getElementById('feu-non').textContent, nonRouge: document.getElementById('feu-non').classList.contains('annuler') }));
  const deplacee = await centre(T, '#carte-grande .carte-feu[data-feu="0"]');
  verifier(fen.t === 'Déplacer le feu ici ?' && fen.oui === 'Déplacer' && fen.ouiVert && fen.non === 'Annuler' && fen.nonRouge, 'fenêtre de l\'app « Déplacer le feu ici ? » (Déplacer vert / Annuler rouge)');
  verifier(Math.abs(deplacee.x - avant.x - 70) < 4 && Math.abs(deplacee.y - avant.y - 60) < 4, 'la flamme a suivi le doigt');
  await T.screenshot({ path: join(CAPT, 'v031-07-tel-deplacer-feu.png') });
  await T.click('#feu-non'); await attendre(T, 300);
  const retour = await centre(T, '#carte-grande .carte-feu[data-feu="0"]');
  const inchange = await volEnregistre(T, `v.id === '${v0.id}'`);
  verifier(Math.abs(retour.x - avant.x) < 2 && Math.abs(retour.y - avant.y) < 2 && inchange.feuxPositions[0].lat === 43.80 && !inchange.feuxRetouches, 'Annuler : la flamme revient, rien n\'est changé');
  verifier(IGN.geocodage.length === 0, 'aucune demande de commune tant qu\'on n\'a pas confirmé');

  console.log('R72 : déplacer (commune recalculée par le faux géocodage IGN)');
  await appuiLongGlisse(T, '#carte-grande .carte-feu[data-feu="0"]', -60, 80, cdp);
  await T.waitForSelector('#feu-modal:not([hidden])'); await T.click('#feu-oui');
  await attendreVol(T, v0.id, v => v.feuxRetouches);
  let v1 = await volEnregistre(T, `v.id === '${v0.id}'`);
  const f0 = v1.feuxPositions[0];
  verifier(f0.lat < 43.80 && f0.lon < 4.30 && f0.commune === communeInventee(f0.lat) && IGN.geocodage.length === 1 && IGN.geocodage[0].index === 'parcel',
    `feu déplacé (${f0.lat}, ${f0.lon}) ; commune « ${f0.commune} » (géocodage inverse, index parcelle)`);
  const memes = (a, b) => ['date', 'hDep', 'hArr', 'tempsTotal', 'tempsCdB', 'feux', 'attJour', 'approches'].every(k => a[k] === b[k])
    && JSON.stringify(a.compteurs) === JSON.stringify(b.compteurs) && JSON.stringify(a.missions) === JSON.stringify(b.missions);
  verifier(memes(v1, v0) && v1.feuxPositions[1].lat === 43.70, 'heures, compteurs (Feux, largages) et mission inchangés ; l\'autre flamme aussi');
  await T.waitForSelector('#carte-grande .carte-feu-nom');
  verifier((await T.innerText('#carte-grande')).includes(f0.commune), 'la nouvelle commune s\'affiche sur la carte');

  console.log('R72 + R73 : hors ligne');
  await tel.ctx.setOffline(true); await attendre(T, 300);
  await appuiLongGlisse(T, '#carte-grande .carte-feu[data-feu="1"]', 50, -70, cdp);
  await T.waitForSelector('#feu-modal:not([hidden])'); await T.click('#feu-oui');
  await attendreVol(T, v0.id, v => v.feuxPositions[1].communeAVenir);
  v1 = await volEnregistre(T, `v.id === '${v0.id}'`);
  const enAttente = await reglageDe(T, 'feuxCommunesEnAttente');
  verifier(v1.feuxPositions[1].lat > 43.70 && v1.feuxPositions[1].commune === '' && enAttente.length === 1, 'hors ligne : position gardée, commune en attente du réseau');
  await attendre(T, 300);
  const plein = await T.evaluate(() => ({ msg: document.getElementById('cp-msg').textContent, texte: document.getElementById('carte-grande').innerText,
    plan: document.querySelector('#cp-fond [data-fond="photo"]').getAttribute('aria-pressed') }));
  verifier(plein.msg === 'Photo aérienne disponible en ligne seulement' && plein.texte.includes('au retour du réseau'), `hors ligne : plan et « ${plein.msg} »`);
  await T.screenshot({ path: join(CAPT, 'v031-08-tel-hors-ligne.png') });
  await tel.ctx.setOffline(false);
  await attendreVol(T, v0.id, v => v.feuxPositions[1].commune && !v.feuxPositions[1].communeAVenir);
  v1 = await volEnregistre(T, `v.id === '${v0.id}'`);
  verifier(v1.feuxPositions[1].commune === communeInventee(v1.feuxPositions[1].lat) && (await reglageDe(T, 'feuxCommunesEnAttente')).length === 0,
    `retour du réseau : commune recalculée « ${v1.feuxPositions[1].commune} »`);

  console.log('R72 : supprimer un feu');
  await T.click('#cp-x'); await ouvrirCartePlein(T, v0.id); // le plein écran se rouvre en ligne (photo)
  await T.click('#carte-grande .carte-feu[data-feu="0"]'); await T.waitForSelector('#carte-grande .feu-suppr');
  await T.screenshot({ path: join(CAPT, 'v031-09-tel-bulle-supprimer.png') });
  await T.click('#carte-grande .feu-suppr'); await T.waitForSelector('#feu-modal:not([hidden])');
  verifier(await T.textContent('#feu-t') === 'Supprimer ce feu ?', 'confirmation dans l\'app « Supprimer ce feu ? »');
  await T.click('#feu-oui');
  await attendreVol(T, v0.id, v => v.feuxPositions.length === 1);
  v1 = await volEnregistre(T, `v.id === '${v0.id}'`);
  verifier(memes(v1, v0) && v1.feuxPositions.length === 1 && (await T.$$('#carte-grande .carte-feu')).length === 1, 'feu supprimé : 1 flamme ; heures, compteurs et mission inchangés');
  await T.click('#cp-x'); await attendre(T, 300);
  verifier((await T.$$('#carte-mini .carte-feu')).length === 1, 'petite carte de la saisie à jour (1 flamme)');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  v1 = await volEnregistre(T, `v.id === '${v0.id}'`);
  verifier(v1.feuxPositions.length === 1 && v1.feuxRetouches, '« Enregistrer » du vol ouvert ne remet pas l\'ancienne flamme');

  console.log('R73 : rien dans le cache hors ligne');
  const cache = await T.evaluate(async () => { const r = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const q of await c.keys()) r.push(q.url); } return r; });
  verifier(cache.length > 0 && !cache.some(u => /ign-essai|geopf|photo\//.test(u)), `cache du Carnet : ${cache.length} fichiers de l'app, aucune photo aérienne`);

  console.log('Synchro vers un 2e appareil (PC)');
  await T.click('.tabs button[data-v="plus"]'); await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok');
  await T.waitForFunction(() => /^Synchronisé/.test(document.getElementById('sr-res').textContent), null, { timeout: 30000 }); await T.click('#ou-x');
  const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } }, { vols: [] });
  const P = pc.p;
  await P.click('.tabs button[data-v="plus"]'); await P.click('#pl-sync'); await P.click('#sy-mod'); await P.click('#sc-ok');
  await P.waitForFunction(() => /^À jour/.test(document.getElementById('sc-res').textContent), null, { timeout: 30000 }); await P.click('#ou-x');
  const surPc = await volEnregistre(P, `v.id === '${v0.id}'`);
  verifier(surPc && surPc.feuxPositions.length === 1 && surPc.feuxPositions[0].lat === v1.feuxPositions[0].lat && surPc.feuxPositions[0].commune === v1.feuxPositions[0].commune && surPc.feuxRetouches,
    'PC : le vol arrive avec la flamme déplacée et sa commune (et sans celle supprimée)');
  await ouvrirCartePlein(P, v0.id);
  verifier((await P.$$('#carte-grande .carte-feu')).length === 1, 'PC : Carte du vol à jour');
  await appuiLongGlisse(P, '#carte-grande .carte-feu[data-feu="0"]', 40, 40);
  await P.waitForSelector('#feu-modal:not([hidden])'); await P.click('#feu-non');
  await P.click('#cp-x'); await P.click('#cancel');

  console.log('Même vol NPF-Q400 envoyé de nouveau (même id)');
  nas.npf = [npfFeux('2026-11-10T08:00:00Z', FEUX_NPF)];
  await T.click('.tabs button[data-v="carnet"]');
  await T.evaluate(async () => (await import('./js/ui/npf.js')).verifierVolsNpf?.());
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await T.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 15000 }); await T.click('#npf-bandeau'); await T.waitForSelector('#npf-l');
  await T.click('#npf-l [data-npf="npf-feux"]'); await T.waitForSelector('#nu-ok');
  const diff = await T.innerText('#outil');
  verifier(/Positions des feux[\s\S]*déplacées ou supprimées à la main[\s\S]*gardées/.test(diff), '« Ce qui change » : tes positions des feux sont gardées');
  await T.click('#nu-ok'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 300);
  verifier(await T.isVisible('#npf-feux') && (await T.textContent('#npf-txt')).includes('tes positions sont gardées'), 'brouillon : message et bouton « Reprendre les positions des feux envoyées par NPF-Q400 »');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  let v2 = await volEnregistre(T, `v.id === '${v0.id}'`);
  verifier(v2.feuxPositions.length === 1 && v2.feuxPositions[0].lat === v1.feuxPositions[0].lat && v2.feuxRetouches && v2.npfExporteLe === '2026-11-10T08:00:00Z',
    'mise à jour enregistrée SANS remettre les flammes de NPF (déplacée gardée, supprimée pas revenue)');
  nas.npf = [npfFeux('2026-11-10T09:00:00Z', FEUX_NPF)];
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await T.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 15000 }); await T.click('#npf-bandeau'); await T.waitForSelector('#npf-l');
  await T.click('#npf-l [data-npf="npf-feux"]'); await T.waitForSelector('#nu-ok'); await T.click('#nu-ok'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 300);
  await T.click('#npf-feux');
  verifier(await T.textContent('#npf-feux') === 'Garder mes positions des feux', 'choix « Reprendre » (et retour possible « Garder mes positions »)');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  v2 = await volEnregistre(T, `v.id === '${v0.id}'`);
  verifier(v2.feuxPositions.length === 2 && v2.feuxPositions[0].lat === 43.80 && !v2.feuxRetouches, 'seulement si on le demande : les positions de NPF-Q400 reviennent');

  console.log('Téléphone 360 px : terrains intermédiaires');
  const t360 = await appareil('360 px', nav, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, { nasConfig: false });
  const S = t360.p;
  await S.click('#list .flight[data-id="v-via"]'); await S.waitForSelector('#v-saisie:not([hidden])'); await attendre(S, 200);
  const via360 = await S.$$eval('#via-list .viachip', l => l.map(c => { const r = c.getBoundingClientRect(), n = c.querySelector('.vc-n').getBoundingClientRect(), nom = c.querySelector('.vc-nom');
    return { coupe: nom.scrollWidth > nom.clientWidth, ok: n.right <= r.right + 0.5 && r.right <= innerWidth && n.left >= r.left }; }));
  verifier(via360[0].coupe && via360.every(v => v.ok), '360 px : nom très long raccourci, nombres toujours visibles');
  await S.locator('#via-list').screenshot({ path: join(CAPT, 'v031-10-tel-360-terrains.png') });
  await S.emulateMedia({ colorScheme: 'dark' }); await attendre(S, 100);
  const sombre = await S.$$eval('#via-list .vc-p', l => l.map(p => { const s = getComputedStyle(p.querySelector('b')); return s.color; }));
  verifier(new Set(sombre).size === 2 && !sombre.includes('rgb(19, 32, 46)'), `sombre : nombres lisibles (${[...new Set(sombre)].join(', ')})`);
  await S.locator('#via-list').screenshot({ path: join(CAPT, 'v031-11-tel-360-terrains-sombre.png') });

  console.log('iPad (WebKit, paysage)');
  const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
    // WebKit : avec le service worker actif, Playwright ne voit plus les demandes vers l'extérieur (faux IGN) : bloqué ici seulement
    serviceWorkers: 'block' }, { nasConfig: false, vols: [...VOLS, FEU_IPAD] });
  const I = ipad.p;
  await controlerEntrainement(I, 'iPad', false);
  await I.locator('.flight[data-id="v-ent"]').screenshot({ path: join(CAPT, 'v031-12-ipad-entrainement.png') });
  await I.click('#q-open'); await I.fill('#p-du', '01/01/2025'); await I.fill('#p-au', '10/05/2025'); await I.dispatchEvent('#p-au', 'input'); await attendre(I, 400);
  verifier((await I.$$('#list .flight')).length === periode.length && await I.textContent('#pb-txt') === 'Période : du 01/01/2025 au 10/05/2025', 'iPad : période et bandeau');
  await I.screenshot({ path: join(CAPT, 'v031-13-ipad-loupe-periode.png') });
  await I.click('#pb-x'); await attendre(I, 300);
  await I.click('#list .flight[data-id="v-via"]'); await I.waitForSelector('#v-saisie:not([hidden])'); await attendre(I, 200);
  await I.locator('#via-list').screenshot({ path: join(CAPT, 'v031-14-ipad-terrains.png') });
  await I.click('#cancel');
  await ouvrirCartePlein(I, 'v-feu-ipad');
  await I.click('#cp-fond [data-fond="photo"]'); await attendre(I, 800);
  verifier((await I.textContent('#carte-grande .leaflet-control-attribution')).includes('© IGN'), 'iPad : fond Photo avec « © IGN »');
  await appuiLongGlisse(I, '#carte-grande .carte-feu[data-feu="0"]', 90, 50);
  await I.waitForSelector('#feu-modal:not([hidden])', { timeout: 5000 });
  await I.screenshot({ path: join(CAPT, 'v031-15-ipad-deplacer-feu.png') });
  await I.click('#feu-oui');
  await attendreVol(I, 'v-feu-ipad', v => v.feuxRetouches);
  const vi = await volEnregistre(I, "v.id === 'v-feu-ipad'");
  verifier(vi.feuxPositions[0].commune === communeInventee(vi.feuxPositions[0].lat) && vi.compteurs.largCdbDash === 2 && vi.feux === 1, `iPad : feu déplacé (« ${vi.feuxPositions[0].commune} »), compteurs inchangés`);
  await I.screenshot({ path: join(CAPT, 'v031-16-ipad-carte-photo.png') });

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur (IGN simulé)' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.31 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer(); faux.close();
}
