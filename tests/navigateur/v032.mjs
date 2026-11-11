// v0.32 : R76 heures bloc d'un ancien vol (nuit gardée), R77 avion « nom / immat / type », R78 libellés de la saisie,
// R79 numéro du feu, R81 fichier KML pour Google Earth (partage simulé / téléchargement, aucun appel réseau).
// Téléphone (Chromium 390 et 360 px), PC (Chromium 1280 px), iPad (WebKit 1080 × 810) avec un FAUX NAS v5 local.
// Vols, feux, communes et avions INVENTÉS. Captures : tests/navigateur/captures/v032-*.png (non commitées).
// Usage : node tests/navigateur/v032.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-09T18:00:00Z';

// ---------- Faux NAS v5 (synchro), comme v027 ----------
const nas = { mdp: 'mot-de-passe-essai-32', rev: 0, el: new Map() };
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
const avion = (id, immat, nom, typeOACI, modele, extra = {}) => ({ id, immat, typeOACI, modele, constructeur: 'ESSAI', nom, indicatif: '', equipage: typeOACI === 'DH8D' ? 'MP' : 'SP',
  moteurs: typeOACI === 'DH8D' ? 'ME' : 'SE', moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H, ...extra });
const AVIONS = [avion('a1', 'F-XZZA', 'M91', 'DH8D', 'Dash 8 Q400 MRE'),
  avion('a2', 'F-XAAB', '', 'DR40', 'Robin DR400-120 Petit Prince modèle au nom vraiment très très long pour essayer')];
const vol = (id, date, champs) => ({ id, date, hDep: '10:00', hArr: '11:00', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 60, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 60, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['TRANSIT ESSAI'], remarques: '',
  feux: 0, compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie',
  ordre: Date.parse(`${date}T10:00Z`), creeLe: H, modifieLe: H, ...champs });
const sansHeures = { hDep: undefined, hArr: undefined, mode: 'loc' };
const VOLS = [
  vol('v-recent', '2026-11-08', {}),
  vol('v-f58', '2026-11-02', { missions: ['FEU n°58 COMMUNE-ESSAI-A'], feux: 1 }),
  vol('v-f54', '2026-10-01', { missions: ['FEU n°54 COMMUNE-ESSAI-B'], feux: 1 }),
  vol('v-kml', '2026-08-14', { missions: ['FEU n°12 VILLE-SUR-ESSAI', 'FEU n°13 VILLE-ESSAI-B'], feux: 2, compteurs: { largCdbDash: 3 },
    feuxPositions: [{ heure: '10:20', lat: 43.2512, lon: 2.4467, commune: 'Ville-sur-Essai', nom: '' },
      { heure: '10:40', lat: 43.1187, lon: 2.2051, commune: '', communeNpf: 'VILLE-ESSAI-B', nom: '' }] }),
  vol('v-a2', '2026-07-01', { avionId: 'a2', tempsMP: null }),
  vol('v-ancien', '2010-06-15', { ...sansHeures, tempsTotal: 60, tempsCdB: 60 }),
  vol('v-ancien-arr', '2010-06-16', { ...sansHeures, tempsTotal: 60, tempsCdB: 60 }),
  vol('v-ancien-minuit', '2010-06-17', { ...sansHeures, tempsTotal: 90, tempsCdB: 90, mode: 'utc' }),
  vol('v-ancien-nuit', '2010-12-15', { ...sansHeures, tempsTotal: 60, tempsCdB: 60, tempsIFR: 30, attJour: 1, attNuit: 0 }),
];

const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
async function appareil(nom, moteur, options, { nasConfig = true, partage = false, vols = VOLS } = {}) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...options });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return r.continue(); // blob: = fichier fait en mémoire
    if (u.hostname === 'tuiles-essai.invalid') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ece8de"/></svg>' });
    bloquees.push(u.href); return r.abort();
  });
  await ctx.addInitScript(p => {
    globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://tuiles-essai.invalid/{z}/{x}/{y}.svg';
    // Partage du téléphone SIMULÉ : on garde ce qui aurait été partagé
    if (p) {
      globalThis.__partages = [];
      for (const cible of [Navigator.prototype, navigator]) {
        try {
          Object.defineProperty(cible, 'canShare', { value: d => !!(d && d.files && d.files.length), configurable: true, writable: true });
          Object.defineProperty(cible, 'share', { value: async d => {
            // WebKit sans écran ne sait pas toujours lire un fichier (File.text) : autres lectures en repli
            const lire = async f => { try { return await f.text(); } catch { try { return await new Response(f).text(); } catch { return await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsText(f); }); } } };
            for (const f of d.files) globalThis.__partages.push({ nom: f.name, type: f.type, texte: await lire(f).catch(e => 'ILLISIBLE ' + e.name) });
          }, configurable: true, writable: true });
        } catch { /* propriété non modifiable ici : l'autre cible suffit */ }
      }
    } else {
      for (const cible of [Navigator.prototype, navigator]) try { Object.defineProperty(cible, 'canShare', { value: undefined, configurable: true, writable: true }); } catch { /* idem */ } // PC : pas de partage de fichier
    }
  }, partage);
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control|restricted network port/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([as, vs, url, mdp, nasConfig]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols', 'reglages'], 'readwrite');
    for (const a of as) t.objectStore('avions').put(a);
    for (const v of vs) { const x = { ...v }; for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k]; t.objectStore('vols').put(x); }
    if (nasConfig) { const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: mdp }); g.put({ cle: 'nasAuto', valeur: false }); }
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVIONS, vols, ADRESSE, nas.mdp, nasConfig]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const volEnregistre = (p, id) => p.evaluate(async i => (await import('./js/etat.js')).etat.vols.find(v => v.id === i) || null, id);
async function attendreVol(p, id, cond) {
  for (let k = 0; k < 150; k++) { const v = await volEnregistre(p, id); if (v && cond(v)) return v; await p.waitForTimeout(100); }
  throw new Error('ÉCHEC : délai dépassé pour le vol ' + id);
}
const ouvrir = async (p, id) => { await p.click('.tabs button[data-v="carnet"]'); await p.click(`#list .flight[data-id="${id}"]`); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(p, 250); };
const taper = async (p, sel, texte) => { await p.click(sel); await p.fill(sel, ''); await p.locator(sel).pressSequentially(texte); await attendre(p, 150); };
const valeurs = p => p.evaluate(() => ({ t0: document.getElementById('f-t0').value, t1: document.getElementById('f-t1').value, bloc: document.getElementById('f-bloc').textContent,
  nuit: document.getElementById('c-nuit').value, ifr: document.getElementById('c-ifr').value, j: document.getElementById('s-attJour').textContent, n: document.getElementById('s-attNuit').textContent,
  msg: !document.getElementById('nuit-calc').hidden && document.getElementById('nuit-calc-t').textContent, j1: !document.getElementById('f-j1').hidden }));
// champ absent = vide (l'enregistrement normal de l'app écrit indicatif '' et regleIFR false ; les vrais vols les ont déjà)
const pareil = (x, y) => JSON.stringify(x ?? '') === JSON.stringify(y ?? '') || (!x && !y);
const memeVol = (a, b, sauf = []) => Object.keys({ ...a, ...b }).filter(k => !['modifieLe', ...sauf].includes(k)).every(k => pareil(a[k], b[k]));
const lireKmlPage = (p, texte) => p.evaluate(t => {
  const d = new DOMParser().parseFromString(t, 'application/xml');
  return { valide: !d.querySelector('parsererror') && d.documentElement.localName === 'kml',
    points: [...d.getElementsByTagName('Placemark')].map(pm => ({ nom: pm.getElementsByTagName('name')[0].textContent, coord: pm.getElementsByTagName('coordinates')[0].textContent.trim() })) };
}, texte);

try {
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { partage: true });
  const T = tel.p;

  console.log('R76 : ancien vol sans heures');
  await ouvrir(T, 'v-ancien');
  verifier(await T.isVisible('#f-ancien'), 'ancien vol : l\'explication s\'affiche');
  const avantAncien = await volEnregistre(T, 'v-ancien');
  await taper(T, '#f-t0', '1000');
  let f = await valeurs(T);
  verifier(f.t0 === '10h00' && f.t1 === '11h00' && f.bloc === '1h00', `départ 10h00 -> arrivée calculée ${f.t1}, temps de vol ${f.bloc} (inchangé)`);
  await T.screenshot({ path: join(CAPT, 'v032-01-tel-ancien-vol-heures.png') });
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const apresAncien = await volEnregistre(T, 'v-ancien');
  verifier(apresAncien.hDep && apresAncien.hArr && apresAncien.tempsTotal === 60 && memeVol(avantAncien, apresAncien, ['hDep', 'hArr', 'date']),
    `enregistré : heures ${apresAncien.hDep} → ${apresAncien.hArr} UTC ; temps, nuit, IFR, atterrissages inchangés`);
  await ouvrir(T, 'v-ancien-arr');
  await taper(T, '#f-t1', '0930');
  f = await valeurs(T);
  verifier(f.t0 === '08h30' && f.t1 === '09h30' && f.bloc === '1h00', `arrivée seule 09h30 -> départ calculé ${f.t0}`);
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  await ouvrir(T, 'v-ancien-minuit');
  await taper(T, '#f-t0', '2330');
  f = await valeurs(T);
  verifier(f.t1 === '01h00' && f.bloc === '1h30' && f.j1, `passage de minuit : 23h30 + 1h30 -> ${f.t1} (J+1)`);
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  await ouvrir(T, 'v-ancien-nuit');
  const avantNuit = await valeurs(T);
  await taper(T, '#f-t0', '1900');
  f = await valeurs(T);
  verifier(f.nuit === '0h00' && f.ifr === avantNuit.ifr && f.j === avantNuit.j && f.n === avantNuit.n, `nuit, IFR (${f.ifr}) et atterrissages gardés malgré le calcul`);
  verifier(f.msg === 'Calcul de nuit : 1h00 (gardé : 0h00)', `message « ${f.msg} »`);
  await T.locator('.sec.c-vol').screenshot({ path: join(CAPT, 'v032-02-tel-ancien-vol-nuit-proposee.png') });
  await T.click('#nuit-appl');
  f = await valeurs(T);
  verifier(f.nuit === '1h00' && !f.msg, 'bouton « Appliquer » : la nuit calculée remplace 0h00 (seulement à la demande)');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const vn = await volEnregistre(T, 'v-ancien-nuit');
  verifier(vn.tempsNuit === 60 && vn.tempsTotal === 60 && vn.tempsIFR === 30 && vn.attJour === 1 && vn.attNuit === 0, 'enregistré : nuit 1h00 choisie, temps, IFR et atterrissages inchangés');
  console.log('R76 : vol récent (comportement inchangé)');
  await ouvrir(T, 'v-recent');
  await taper(T, '#f-t1', '1130');
  f = await valeurs(T);
  verifier(f.bloc === '1h30' && f.t0 === '10h00' && !f.msg && await T.isHidden('#f-ancien'), 'vol récent : le temps de vol suit les heures comme avant (1h30), départ non touché');
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');

  console.log('R77 / R78 : bloc Avion et libellés de la saisie');
  const accueilAvant = await T.innerText('.flight[data-id="v-recent"] .fl-id');
  await ouvrir(T, 'v-recent');
  const av = () => T.evaluate(() => {
    const t = document.querySelector('#ac-cur .t'), b = document.getElementById('ac-cur').getBoundingClientRect(), i = document.getElementById('ac-fiche').getBoundingClientRect();
    const r = id => document.getElementById(id).getBoundingClientRect();
    const typ = document.getElementById('ac-type');
    return { texte: ['ac-reg', 'ac-sub', 'ac-type'].map(id => document.getElementById(id).textContent.trim()).filter(Boolean).join(' / '), ordre: r('ac-reg').left <= r('ac-sub').left && (r('ac-sub').left < r('ac-type').left || r('ac-type').top > r('ac-sub').top),
      dedans: t.getBoundingClientRect().right <= b.right + 0.5 && b.right <= i.left + 0.5, coupe: typ.scrollWidth > typ.clientWidth };
  });
  let a1 = await av();
  verifier(/^M91 \/ F-XZZA \/ Dash 8 Q400 MRE$/.test(a1.texte.replace(/\s*\/\s*/g, ' / ')) && a1.ordre && a1.dedans, `avion avec nom : « ${a1.texte} »`);
  const labels = async () => T.$$eval('#v-saisie .field>label, #v-saisie .flabel', l => l.filter(x => x.offsetParent).map(x => { const s = getComputedStyle(x); return { t: x.textContent.trim(), taille: parseFloat(s.fontSize), graisse: s.fontWeight, couleur: s.color }; }));
  let lb = await labels();
  const encre = await T.evaluate(() => getComputedStyle(document.getElementById('s-attJour')).color);
  verifier(lb.length >= 6 && lb.every(x => x.taille === 17 && x.graisse === '600' && x.couleur === encre),
    `clair : ${lb.length} libellés en 17 px, gras 600, couleur du texte (${lb.map(x => x.t).join(', ')})`);
  const titre = await T.$eval('.sec.c-av h3', h => ({ taille: getComputedStyle(h).fontSize, couleur: getComputedStyle(h).color }));
  verifier(titre.couleur !== encre, `titres de blocs inchangés (AVION : ${titre.taille}, ${titre.couleur})`);
  await T.screenshot({ path: join(CAPT, 'v032-03-tel-saisie-avion-libelles.png') });
  await T.emulateMedia({ colorScheme: 'dark' }); await attendre(T, 100);
  lb = await labels();
  const encreSombre = await T.evaluate(() => getComputedStyle(document.getElementById('s-attJour')).color);
  verifier(lb.every(x => x.couleur === encreSombre && x.taille === 17), `sombre : libellés en couleur claire du texte (${encreSombre})`);
  await T.screenshot({ path: join(CAPT, 'v032-04-tel-saisie-sombre.png') });
  await T.emulateMedia({ colorScheme: 'light' });
  await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');
  await ouvrir(T, 'v-a2');
  a1 = await av();
  verifier(/^F-XAAB \/ Robin/.test(a1.texte) && a1.dedans, `avion sans nom : « ${a1.texte.slice(0, 40)}… », jamais sous les boutons i et +`);
  await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');
  verifier(await T.innerText('.flight[data-id="v-recent"] .fl-id') === accueilAvant, `page d'accueil inchangée (« ${accueilAvant.replace(/\s+/g, ' ')} »)`);

  console.log('R79 : numéro du feu');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  verifier((await T.textContent('#fire-next')) === '(prochain : n°59)', 'prochain n° = plus grand du carnet (58) + 1 : n°59');
  await T.fill('#m-q', 'COMMUNE-ESSAI-C'); await T.click('#feu-p'); await attendre(T, 150);
  await T.click('#feu-num'); await T.waitForSelector('#fn-modal:not([hidden])');
  let fen = await T.evaluate(() => ({ n: document.getElementById('fn-n').value, ap: document.getElementById('fn-apercu').innerText, alerte: !document.getElementById('fn-alerte').hidden,
    oui: document.getElementById('fn-oui').classList.contains('vert'), non: document.getElementById('fn-non').classList.contains('annuler') }));
  verifier(fen.n === '59' && /Ce vol : FEU n°59 COMMUNE-ESSAI-C/.test(fen.ap) && /Feu suivant : n°60/.test(fen.ap) && !fen.alerte && fen.oui && fen.non,
    'fenêtre « Numéro du feu » : n°59, aperçu « Ce vol / Feu suivant », Annuler rouge / Valider vert');
  await T.screenshot({ path: join(CAPT, 'v032-05-tel-numero-feu.png') });
  await T.click('#fn-m');
  fen = await T.evaluate(() => ({ n: document.getElementById('fn-n').value, alerte: !document.getElementById('fn-alerte').hidden && document.getElementById('fn-alerte').textContent, oui: !document.getElementById('fn-oui').disabled }));
  verifier(fen.n === '58' && /^Le n°58 est déjà dans le vol du 02\/11\/2026/.test(fen.alerte) && fen.oui, `doublon signalé sans bloquer : « ${fen.alerte} »`);
  await T.screenshot({ path: join(CAPT, 'v032-06-tel-numero-feu-doublon.png') });
  await T.click('#fn-non');
  verifier((await T.inputValue('#ml input')) === 'FEU n°59 COMMUNE-ESSAI-C', 'Annuler : rien ne change');
  await T.click('#feu-num'); await T.waitForSelector('#fn-modal:not([hidden])');
  await T.fill('#fn-n', ''); await T.locator('#fn-n').pressSequentially('62');
  verifier(/Feu suivant : n°63/.test(await T.innerText('#fn-apercu')), 'saisie directe 62 : feu suivant n°63');
  await T.click('#fn-oui');
  verifier((await T.inputValue('#ml input')) === 'FEU n°62 COMMUNE-ESSAI-C' && (await T.textContent('#fire-next')) === '(n°62)', 'Valider : la ligne de mission prend le n°62');
  await taper(T, '#f-t0', '1400'); await taper(T, '#f-t1', '1500');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const vf = await T.evaluate(async () => (await import('./js/etat.js')).etat.vols.find(v => (v.missions || []).some(m => m.includes('COMMUNE-ESSAI-C'))));
  verifier(vf && vf.missions[0] === 'FEU n°62 COMMUNE-ESSAI-C' && vf.feux === 1, 'vol enregistré avec FEU n°62');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 200);
  verifier((await T.textContent('#fire-next')) === '(prochain : n°63)', 'vol suivant : prochain n°63');
  await T.click('#feu-p');
  verifier((await T.inputValue('#ml input')) === 'FEU n°63 ', 'le « + » donne bien FEU n°63');
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  console.log('R79 : vol déjà enregistré, modifié plus tard');
  await ouvrir(T, 'v-f54');
  await T.click('#feu-num'); await T.waitForSelector('#fn-modal:not([hidden])');
  verifier(await T.inputValue('#fn-n') === '54', 'vol du 01/10/2026 : son n°54');
  await T.click('#fn-p'); await T.click('#fn-oui');
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const v55 = await volEnregistre(T, 'v-f54');
  verifier(v55.missions[0] === 'FEU n°55 COMMUNE-ESSAI-B' && v55.feux === 1, 'mission du vol modifié : FEU n°55');

  console.log('R81 : Google Earth (fichier KML, partage simulé sur le téléphone)');
  await ouvrir(T, 'v-kml');
  await T.waitForSelector('#carte-mini .carte-feu', { timeout: 15000 });
  await T.click('#carte-mini'); await T.waitForSelector('#carte-grande .carte-feu'); await attendre(T, 400);
  const avantReseau = bloquees.length;
  await T.click('#carte-grande .carte-feu[data-feu="0"]'); await T.waitForSelector('#carte-grande .feu-ge');
  await T.screenshot({ path: join(CAPT, 'v032-07-tel-bulle-google-earth.png') });
  await T.click('#carte-grande .feu-ge'); await attendre(T, 400);
  let partages = await T.evaluate(() => globalThis.__partages);
  verifier(partages.length === 1 && partages[0].nom === 'Feu-12-2026-VILLE-SUR-ESSAI.kml' && partages[0].type === 'application/vnd.google-earth.kml+xml',
    `menu Partager (simulé) : ${partages[0] && partages[0].nom}`);
  let k = await lireKmlPage(T, partages[0].texte);
  verifier(k.valide && k.points.length === 1 && k.points[0].nom === 'Feu n°12 / 2026 / VILLE SUR ESSAI' && k.points[0].coord === '2.4467,43.2512,0',
    `KML valide : « ${k.points[0].nom} » en ${k.points[0].coord} (longitude, latitude)`);
  verifier(partages[0].texte.includes('firedept.png') && partages[0].texte.includes('<LabelStyle><color>ff1a8cff</color>'), 'épingle flamme (icône Google Earth « pompiers ») et libellé orange');
  await T.click('#cp-ge'); await attendre(T, 400);
  partages = await T.evaluate(() => globalThis.__partages);
  k = await lireKmlPage(T, partages[1].texte);
  verifier(partages[1].nom === 'Feux-14-08-2026.kml' && k.valide && k.points.map(x => x.nom).join(' | ') === 'Feu n°12 / 2026 / VILLE SUR ESSAI | Feu n°13 / 2026',
    `tous les feux du vol : ${partages[1].nom} (${k.points.map(x => x.nom).join(' | ')})`);
  verifier(bloquees.length === avantReseau, 'aucun appel réseau pour fabriquer et partager le fichier');
  const vk = await volEnregistre(T, 'v-kml');
  verifier(vk.feuxPositions.length === 2 && vk.compteurs.largCdbDash === 3, 'le vol n\'est pas modifié par l\'envoi');
  await T.click('#cp-x'); await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');

  console.log('Synchro vers le PC');
  await T.click('.tabs button[data-v="plus"]'); await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok');
  await T.waitForFunction(() => /^Synchronisé/.test(document.getElementById('sr-res').textContent), null, { timeout: 30000 }); await T.click('#ou-x');
  const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } }, { vols: [] });
  const P = pc.p;
  await P.click('.tabs button[data-v="plus"]'); await P.click('#pl-sync'); await P.click('#sy-mod'); await P.click('#sc-ok');
  await P.waitForFunction(() => /^À jour/.test(document.getElementById('sc-res').textContent), null, { timeout: 30000 }); await P.click('#ou-x');
  const surPc = await P.evaluate(async () => (await import('./js/etat.js')).etat.vols.filter(v => /n°62|n°55/.test((v.missions || []).join(' '))).map(v => v.missions[0]).sort());
  const ancienPc = await volEnregistre(P, 'v-ancien-nuit');
  verifier(surPc.join(' | ') === 'FEU n°55 COMMUNE-ESSAI-B | FEU n°62 COMMUNE-ESSAI-C' && ancienPc.tempsNuit === 60 && ancienPc.hDep, `PC : numéros de feu (${surPc.join(', ')}) et heures de l'ancien vol reçus`);
  console.log('R81 : PC (pas de partage de fichier : téléchargement)');
  await ouvrir(P, 'v-kml');
  await P.waitForSelector('#carte-mini .carte-feu', { timeout: 15000 });
  await P.click('#carte-mini'); await P.waitForSelector('#carte-grande .carte-feu'); await attendre(P, 400);
  const [dl] = await Promise.all([P.waitForEvent('download'), P.click('#cp-ge')]);
  const texteDl = readFileSync(await dl.path(), 'utf8');
  k = await lireKmlPage(P, texteDl);
  verifier(dl.suggestedFilename() === 'Feux-14-08-2026.kml' && k.valide && k.points.length === 2, `téléchargement : ${dl.suggestedFilename()} (${k.points.length} points)`);
  await P.click('#cp-x'); await P.click('#cancel');

  console.log('360 px : avion au texte long');
  const t360 = await appareil('360 px', nav, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, { nasConfig: false });
  const S = t360.p;
  await ouvrir(S, 'v-a2');
  const a360 = await S.evaluate(() => {
    const t = document.querySelector('#ac-cur .t').getBoundingClientRect(), i = document.getElementById('ac-fiche').getBoundingClientRect(), b = document.getElementById('ac-cur').getBoundingClientRect();
    const typ = document.getElementById('ac-type');
    return { dedans: t.right <= b.right + 0.5 && b.right <= i.left + 0.5, coupe: typ.scrollWidth > typ.clientWidth || typ.getBoundingClientRect().top > document.getElementById('ac-reg').getBoundingClientRect().top };
  });
  verifier(a360.dedans && a360.coupe, '360 px : type long à la ligne / « … », jamais sous les boutons i et +');
  await S.locator('.sec.c-av').screenshot({ path: join(CAPT, 'v032-08-tel-360-avion-long.png') });

  console.log('iPad (WebKit, paysage)');
  const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' }, { nasConfig: false, partage: true });
  const I = ipad.p;
  await ouvrir(I, 'v-ancien');
  await taper(I, '#f-t0', '1000');
  verifier((await valeurs(I)).t1 === '11h00', 'iPad : ancien vol, arrivée calculée 11h00');
  await I.screenshot({ path: join(CAPT, 'v032-09-ipad-saisie-ancien-vol.png') });
  await I.click('#cancel'); await I.click('#ab-yes').catch(() => {}); await I.waitForSelector('#v-carnet:not([hidden])');
  await ouvrir(I, 'v-f58');
  await I.click('#feu-num'); await I.waitForSelector('#fn-modal:not([hidden])');
  verifier(await I.inputValue('#fn-n') === '58' && await I.isHidden('#fn-alerte'), 'iPad : fenêtre « Numéro du feu » (n°58, pas de doublon)');
  await I.screenshot({ path: join(CAPT, 'v032-10-ipad-numero-feu.png') });
  await I.click('#fn-m'); await I.click('#fn-m'); await I.click('#fn-m'); await I.click('#fn-m'); // 54 : déjà dans un autre vol
  verifier(await I.isVisible('#fn-alerte'), 'iPad : doublon n°54 signalé');
  await I.screenshot({ path: join(CAPT, 'v032-11-ipad-numero-feu-doublon.png') });
  await I.click('#fn-non'); await I.click('#cancel'); await I.waitForSelector('#v-carnet:not([hidden])');
  await ouvrir(I, 'v-kml');
  await I.waitForSelector('#carte-mini .carte-feu', { timeout: 15000 });
  await I.click('#carte-mini'); await I.waitForSelector('#carte-grande .carte-feu'); await attendre(I, 500);
  await I.click('#carte-grande .carte-feu[data-feu="1"]'); await I.waitForSelector('#carte-grande .feu-ge');
  await I.screenshot({ path: join(CAPT, 'v032-12-ipad-bulle-google-earth.png') });
  await I.click('#carte-grande .feu-ge'); await attendre(I, 400);
  const pI = await I.evaluate(() => globalThis.__partages);
  // WebKit sans écran ne sait pas relire le fichier partagé : son contenu est refait avec le même module de l'app
  const texteI = /^ILLISIBLE/.test(pI[0]?.texte || '') ? await I.evaluate(async () => (await import('./js/kml.js')).kmlDuVol((await import('./js/etat.js')).etat.vols.find(v => v.id === 'v-kml'), 1).texte) : pI[0]?.texte;
  verifier(pI.length === 1 && pI[0].nom === 'Feu-13-2026.kml' && pI[0].type === 'application/vnd.google-earth.kml+xml' && texteI.includes('<name>Feu n°13 / 2026</name>'),
    `iPad : menu Partager (simulé) avec ${pI[0] && pI[0].nom} (feu sans commune : « Feu n°13 / 2026 »)`);

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.32 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer(); faux.close();
}
