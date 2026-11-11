// v0.36 : R88 numéros de feu des vols de SIMULATION (NPF-Q400-RUN) : ils se suivent d'une simulation à l'autre (plus
// grand n° des vrais vols ET des simulations + 1) ; un VRAI vol ignore toujours les simulations. Scénario : dernier vrai feu
// n°54 ; sim 1 (1 feu) -> n°55 ; sim 2 (2 feux) -> n°56, n°57 ; vrai vol (1 feu) -> n°55 ; sim 3 -> n°58 ; « + » d'un
// nouveau vrai vol -> n°56. Vols déjà enregistrés jamais renumérotés. FAUX NAS v5 local ; téléphone (Chromium 390 px) et
// iPad (WebKit). Vols, feux, avions INVENTÉS. Captures : tests/navigateur/captures/v036-*.png (non commitées).
// Usage : node tests/navigateur/v036.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-09T18:00:00Z';
const jour = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// ---------- Faux NAS v5 (vols NPF en attente + synchro) ----------
const nas = { mdp: 'mot-de-passe-essai-36', rev: 0, el: new Map(), npf: [] };
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

// ---------- Carnet inventé : dernier vrai feu n°54 ----------
const avion = (id, immat, nom) => ({ id, immat, typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom, indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H });
const AVIONS = [avion('a1', 'F-XZZA', 'M91')];
const VOLS = [{ id: 'v-54', date: jour(10), hDep: '10:00', hArr: '12:00', mode: 'utc', dep: 'LFTW', arr: 'LFMN', escales: [], avionId: 'a1', tempsTotal: 120,
  tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 120, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['FEU n°54 VILLE-ESSAI-A'], remarques: '', feux: 1,
  compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(`${jour(10)}T10:00Z`), creeLe: H, modifieLe: H }];
const npf = (id, j, heure, simulation, communes) => ({ format: 'carnet-vol-npf', version: 2, id, exporteLe: H, date: jour(j), blocDepart: heure, blocArrivee: heure.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, '0')),
  immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMN', ...(simulation ? { simulation: true } : {}),
  feux: communes.map((c, i) => ({ heure: heure.slice(0, 3) + String(20 + i * 10), lat: 43.6 + i / 10, lon: 6.9, commune: c, nom: '' })) });

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
const lignesFeu = p => p.$$eval('#ml input', l => l.map(x => x.value.trim()).filter(t => /^FEU/.test(t)));
// Un vol NPF déposé sur le faux NAS, ouvert en brouillon, vérifié puis enregistré
async function importer(p, n, attendu, nom) {
  nas.npf.push(n);
  await p.click('.tabs button[data-v="plus"]'); await p.click('.tabs button[data-v="carnet"]');
  await p.evaluate(async () => (await import('./js/ui/npf.js')).verifierVolsNpf());
  await ouvrirNpf(p, n.id);
  const l = await lignesFeu(p);
  verifier(JSON.stringify(l) === JSON.stringify(attendu), `${nom} : ${l.join(', ')}`);
  return l;
}
const enregistrer = async (p, id) => { await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])'); return attendreVolNpf(p, id); };

try {
  console.log('Téléphone 390 px');
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const T = tel.p;
  await importer(T, npf('sim-1', 4, '08:00', true, ['VILLE-ESSAI-B']), ['FEU n°55 VILLE-ESSAI-B'], 'simulation 1 (1 feu)');
  await T.screenshot({ path: join(CAPT, 'v036-01-tel-brouillon-sim-1.png') });
  const s1 = await enregistrer(T, 'sim-1');
  await importer(T, npf('sim-2', 3, '08:00', true, ['VILLE-ESSAI-C', 'VILLE-ESSAI-D']), ['FEU n°56 VILLE-ESSAI-C', 'FEU n°57 VILLE-ESSAI-D'], 'simulation 2 (2 feux)');
  const s2 = await enregistrer(T, 'sim-2');
  await importer(T, npf('vrai-1', 2, '08:00', false, ['VILLE-ESSAI-E']), ['FEU n°55 VILLE-ESSAI-E'], 'vrai vol (1 feu) : les simulations sont ignorées');
  verifier(await T.isHidden('#f-sim'), 'vrai vol : pas de bandeau SIMULATION');
  const r1 = await enregistrer(T, 'vrai-1');
  verifier(!('simulation' in r1), 'vrai vol enregistré sans marque');
  await importer(T, npf('sim-3', 1, '08:00', true, ['VILLE-ESSAI-F']), ['FEU n°58 VILLE-ESSAI-F'], 'simulation 3 : suite des simulations');
  const s3 = await enregistrer(T, 'sim-3');
  const apres = await T.evaluate(async () => Object.fromEntries((await import('./js/etat.js')).etat.vols.map(v => [v.npfId || v.id, v.missions.join(' + ')])));
  verifier(apres['sim-1'] === 'FEU n°55 VILLE-ESSAI-B' && apres['sim-2'] === 'FEU n°56 VILLE-ESSAI-C + FEU n°57 VILLE-ESSAI-D' && apres['vrai-1'] === 'FEU n°55 VILLE-ESSAI-E'
    && apres['v-54'] === 'FEU n°54 VILLE-ESSAI-A' && apres['sim-3'] === 'FEU n°58 VILLE-ESSAI-F', 'vols déjà enregistrés : jamais renumérotés');
  verifier([s1, s2, s3].every(v => v.simulation === true), 'les 3 simulations gardent leur marque');

  console.log('Saisie : « + » d\'un vrai vol et d\'un vol de simulation');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  verifier((await T.textContent('#fire-next')) === '(prochain : n°56)', `nouveau vrai vol : prochain feu n°56 (simulations ignorées) : ${await T.textContent('#fire-next')}`);
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  await T.click(`.flight[data-id="${s3.id}"]`); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  await T.click('#feu-p');
  verifier(JSON.stringify(await lignesFeu(T)) === '["FEU n°58 VILLE-ESSAI-F","FEU n°59"]', `« + » dans la simulation 3 : n°59 (suite des simulations)`);
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  await T.click(`.flight[data-id="${r1.id}"]`); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  await T.click('#feu-p');
  verifier(JSON.stringify(await lignesFeu(T)) === '["FEU n°55 VILLE-ESSAI-E","FEU n°56"]', '« + » dans le vrai vol : n°56 (simulations ignorées)');
  await T.click('#cancel'); await T.click('#ab-yes').catch(() => {}); await T.waitForSelector('#v-carnet:not([hidden])');
  await T.locator('#list').screenshot({ path: join(CAPT, 'v036-02-tel-390-liste.png') });

  console.log('iPad (WebKit) : même règle');
  const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' },
    { vols: [...VOLS, { ...VOLS[0], id: 'v-sim-ipad', simulation: true, missions: ['FEU n°60 ESSAI'], ordre: VOLS[0].ordre + 1 }] });
  const I = ipad.p;
  await importer(I, npf('sim-ipad', 0, '06:00', true, ['VILLE-ESSAI-G']), ['FEU n°61 VILLE-ESSAI-G'], 'iPad : simulation après une simulation n°60');
  await I.click('#cancel'); await I.click('#ab-yes').catch(() => {}); await I.waitForSelector('#v-carnet:not([hidden])');
  nas.npf = nas.npf.filter(v => v.id !== 'sim-ipad');
  await importer(I, npf('vrai-ipad', 0, '06:00', false, ['VILLE-ESSAI-H']), ['FEU n°55 VILLE-ESSAI-H'], 'iPad : vrai vol, simulations ignorées');
  await I.click('#cancel'); await I.click('#ab-yes').catch(() => {});

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.36 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer(); faux.close();
}
