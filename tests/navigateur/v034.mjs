// v0.34 (R84), mis à jour en v0.35 par R86 (texte BLANC gras, remplace R70 et R84) : Feu « n°… » et pastille de tout vol
// feu #d32f2f / blanc (≥ 4,5) ; « Feu » en contour bord et texte #d32f2f (sombre : #ef5350 / #ff8a80) ; Entraînement et sa
// pastille #c8650f / blanc gras (3,9 : choix du pilote) ; GAAR framboise #d81b60 / blanc (≥ 4,5), pastille du temps d'un vol
// GAAR aussi (R87 : feu, puis GAAR, puis Entraînement, puis IFR, sinon sable) ; mêmes fonds en sombre,
// distincts de la carte sombre ; IFR, sable, Appr, att., autres pastilles, ligne de mission, saisie et bandeau SIMULATION
// inchangés. Téléphone (Chromium 390 px, clair et sombre), PC (Chromium 1280 px),
// iPad (WebKit 1080 × 810, clair et sombre). Vols INVENTÉS. Captures : tests/navigateur/captures/v034-*.png (non commitées).
// Usage : node tests/navigateur/v034.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-14T08:00:00Z';
const AVION = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H };
const vol = (id, jour, heure, champs) => ({ id, date: `2026-11-${jour}`, hDep: heure, hArr: '12:00', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 72, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 72, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: [], remarques: '', feux: 0,
  compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(`2026-11-${jour}T${heure}Z`),
  creeLe: H, modifieLe: H, ...champs });
const VOLS = [
  vol('v-feu', '14', '10:00', { missions: ['FEU n°60 ESSAI'], feux: 1 }),       // « Feu n°60 » plein
  vol('v-rep', '13', '10:00', { missions: ['FEU n°60 ESSAI'], feux: 0 }),       // feu repris : « Feu » en contour, pastille pleine
  vol('v-ent', '12', '10:00', { missions: ['ENT. OPS'] }),                      // entraînement (orange R70, inchangé)
  vol('v-gaar', '11', '14:00', { hArr: '15:12', missions: ['GAAR ESSAI', 'XTRA ESSAI'], approches: 2 }), // GAAR (framboise) + pastille d'une règle perso (inchangée)
  vol('v-gaar-ifr', '11', '12:00', { hArr: '13:12', missions: ['GAAR ESSAI'], tempsIFR: 30 }),          // R87 : GAAR + IFR -> framboise
  vol('v-gaar-feu', '11', '08:00', { hArr: '09:12', missions: ['GAAR ESSAI', 'FEU n°61 ESSAI'], feux: 1 }), // R87 : GAAR + feu -> feu
  vol('v-gaar-ent', '11', '06:00', { hArr: '07:12', missions: ['GAAR ESSAI', 'ENT. OPS'] }),          // R87 : GAAR + entraînement -> framboise
  vol('v-ifr', '11', '10:00', { missions: ['TRANSIT ESSAI'], tempsIFR: 40 }),   // IFR (inchangé)
  vol('v-sable', '10', '10:00', { missions: ['TRANSIT ESSAI'] }),               // autre (inchangé)
  vol('v-sim', '09', '10:00', { missions: ['FEU n°70 ESSAI'], feux: 1, simulation: true }), // simulation (R85) : bandeau inchangé
];

const srv = await serveur();
const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const erreurs = [], bloquees = [];
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1') return r.continue(); bloquees.push(u.href); return r.abort(); });
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|access control/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([a, vols]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols', 'reglages'], 'readwrite'); t.objectStore('avions').put(a); for (const v of vols) t.objectStore('vols').put(v);
    t.objectStore('reglages').put({ cle: 'regles', valeur: [{ debut: 'ENT.', pastille: 'Entraînement' }, { debut: 'GAAR', pastille: 'GAAR' }, { debut: 'XTRA', pastille: 'Perso' }] });
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVION, VOLS]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return p;
}

// Contraste WCAG entre deux couleurs « rgb(r, g, b) »
const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Couleurs calculées par le navigateur : pastille du temps, étiquettes, ligne de mission, fond de la carte ; variables --feu
const mesurer = p => p.evaluate(ids => {
  const st = e => { if (!e) return null; const s = getComputedStyle(e); return { fond: s.backgroundColor, encre: s.color, bord: s.borderTopColor, graisse: s.fontWeight }; };
  const r = {};
  for (const id of ids) {
    const c = document.querySelector(`.flight[data-id="${id}"]`), b = c.querySelector('.fl-bloc');
    r[id] = { classe: ([...b.classList].find(k => k.startsWith('t-')) || '').slice(2), pastille: st(b), feu: st(c.querySelector('.chip.feu')), feu2: st(c.querySelector('.chip.feu2')),
      ent: st(c.querySelector('.chip.mi.ent')), gaar: st(c.querySelector('.chip.mi.gaar')), perso: st([...c.querySelectorAll('.chip.mi')].find(x => x.textContent === 'Perso')),
      ifr: st(c.querySelector('.chip.ifr')), appr: st(c.querySelector('.chip.appr')), att: st([...c.querySelectorAll('.chip')].find(x => / att$/.test(x.textContent))),
      sim: st(c.querySelector('.fl-sim')), mission: st(c.querySelector('.fl-rem')), carte: getComputedStyle(c).backgroundColor };
  }
  const rs = getComputedStyle(document.documentElement);
  r.vars = { feu: rs.getPropertyValue('--feu').trim(), feuSoft: rs.getPropertyValue('--feu-soft').trim() };
  return r;
}, VOLS.map(v => v.id));

const BLANC = 'rgb(255, 255, 255)', ROUGE = 'rgb(211, 47, 47)', ORANGE = 'rgb(200, 101, 15)', FRAMBOISE = 'rgb(216, 27, 96)';
const ATTENDU = {
  clair: { contourBord: ROUGE, contourEncre: ROUGE, vars: { feu: '#c62828', feuSoft: '#fde3e1' } },
  sombre: { contourBord: 'rgb(239, 83, 80)', contourEncre: 'rgb(255, 138, 128)', vars: { feu: '#ef5350', feuSoft: '#3a1c1c' } },
};
const gras = x => Number(x.graisse) >= 700;
function controler(nom, theme, m, avant) {
  const a = ATTENDU[theme], f = m['v-feu'], r = m['v-rep'], e = m['v-ent'], g = m['v-gaar'];
  const c = (x, y) => contraste(x, y), cartes = m['v-feu'].carte;
  const cF = c(f.feu.fond, f.feu.encre), cC = c(r.carte, r.feu2.encre), cE = c(e.ent.fond, e.ent.encre), cG = c(g.gaar.fond, g.gaar.encre);
  verifier(f.feu.fond === ROUGE && f.feu.encre === BLANC && gras(f.feu) && cF >= 4.5, `${nom} ${theme} : « Feu n°60 » #d32f2f / blanc gras, contraste ${cF.toFixed(2)}`);
  // v0.38 (R95) : pastilles du temps : fond blanc (sombre : fond de la carte), heure et contour de la couleur du vol
  const FOND = theme === 'clair' ? BLANC : 'rgb(23, 34, 46)';
  const V = theme === 'clair' ? { feu: ROUGE, ent: ORANGE, gaar: FRAMBOISE } : { feu: 'rgb(255, 107, 107)', ent: 'rgb(232, 145, 63)', gaar: 'rgb(240, 98, 146)' };
  const pastilleDe = (x, k) => x.fond === FOND && x.encre === V[k] && x.bord === V[k] && gras(x);
  verifier(f.classe === 'feu' && pastilleDe(f.pastille, 'feu'), `${nom} ${theme} : pastille du temps feu (${f.pastille.fond} / ${f.pastille.encre})`);
  verifier(r.classe === 'feu' && pastilleDe(r.pastille, 'feu'), `${nom} ${theme} : feu repris : pastille identique`);
  verifier(r.feu2 && r.feu2.fond === 'rgba(0, 0, 0, 0)' && r.feu2.bord === a.contourBord && r.feu2.encre === a.contourEncre && gras(r.feu2) && cC >= 4.5,
    `${nom} ${theme} : « Feu » en contour : bord ${r.feu2.bord}, texte ${r.feu2.encre} sur ${r.carte}, contraste ${cC.toFixed(2)}`);
  verifier(e.classe === 'mi' && e.ent.fond === ORANGE && e.ent.encre === BLANC && gras(e.ent) && pastilleDe(e.pastille, 'ent') && cE >= 3.9,
    `${nom} ${theme} : Entraînement (étiquette et pastille) #c8650f / blanc gras 700, contraste ${cE.toFixed(2)} (choix du pilote)`);
  verifier(g.gaar && g.gaar.fond === FRAMBOISE && g.gaar.encre === BLANC && gras(g.gaar) && cG >= 4.5, `${nom} ${theme} : GAAR framboise #d81b60 / blanc gras, contraste ${cG.toFixed(2)}`);
  // R87 : pastille du temps : feu, puis GAAR, puis Entraînement, puis IFR, sinon sable
  const past = id => m[id].pastille, framboise = x => pastilleDe(x, 'gaar');
  verifier(m['v-gaar'].classe === 'gaar' && framboise(past('v-gaar')), `${nom} ${theme} : vol GAAR seul : pastille framboise`);
  verifier(m['v-gaar-ifr'].classe === 'gaar' && framboise(past('v-gaar-ifr')) && m['v-gaar-ifr'].ifr, `${nom} ${theme} : GAAR + IFR : pastille framboise (étiquette IFR toujours là)`);
  verifier(m['v-gaar-feu'].classe === 'feu' && pastilleDe(past('v-gaar-feu'), 'feu') && m['v-gaar-feu'].gaar.fond === FRAMBOISE, `${nom} ${theme} : GAAR + feu : pastille couleur feu`);
  verifier(m['v-gaar-ent'].classe === 'gaar' && framboise(past('v-gaar-ent')) && m['v-gaar-ent'].ent.fond === ORANGE, `${nom} ${theme} : GAAR + entraînement : pastille framboise (GAAR)`);
  const distincts = [ROUGE, ORANGE, FRAMBOISE].map(x => c(x, cartes));
  verifier(distincts.every(x => x >= 3), `${nom} ${theme} : les trois fonds se distinguent de la carte (${distincts.map(x => x.toFixed(1)).join(' / ')})`);
  verifier(m.vars.feu === a.vars.feu && m.vars.feuSoft === a.vars.feuSoft, `${nom} ${theme} : rouge de la saisie, du champ Mission et des messages inchangé (--feu ${m.vars.feu})`);
  if (avant) {
    const meme = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    verifier(meme(m['v-ifr'].ifr, avant['v-ifr'].ifr) && meme(m['v-ifr'].pastille, avant['v-ifr'].pastille) && meme(m['v-sable'].pastille, avant['v-sable'].pastille)
      && meme(g.appr, avant['v-gaar'].appr) && meme(g.att, avant['v-gaar'].att) && meme(g.perso, avant['v-gaar'].perso)
      && meme(m['v-gaar-ifr'].ifr, avant['v-gaar-ifr'].ifr),
      `${nom} ${theme} : IFR, sable, « Appr », « att » et autre pastille de règle identiques à avant`);
    verifier(VOLS.every(v => meme(m[v.id].mission, avant[v.id].mission)) && meme(m['v-sim'].sim, avant['v-sim'].sim), `${nom} ${theme} : ligne de mission et bandeau SIMULATION identiques à avant`);
  }
}

let reference = null;
try {
  // Référence : la même page sans les règles R86 = couleurs d'avant (pour vérifier que le reste ne change pas)
  const T = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const sansR86 = async () => T.evaluate(() => {
    for (const ss of document.styleSheets) {
      let regles; try { regles = ss.cssRules; } catch { continue; }
      for (let i = regles.length - 1; i >= 0; i--) {
        const t = regles[i].cssText;
        if (/chip\.feu|t-feu|chip\.mi\.(ent|gaar)|t-mi|t-gaar/.test(t) && /#d32f2f|#c8650f|#d81b60|#ef5350|#ff8a80|211, 47, 47|200, 101, 15|216, 27, 96/i.test(t)) ss.deleteRule(i);
      }
    }
  });
  reference = {};
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    reference[theme] = await mesurer(T);
  }
  await sansR86();
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    const avant = await mesurer(T);
    verifier(avant['v-feu'].feu.fond !== reference[theme]['v-feu'].feu.fond && avant['v-gaar'].gaar.fond !== FRAMBOISE, `référence ${theme} : la page sans R86 a bien les anciennes couleurs (${avant['v-feu'].feu.fond}, GAAR ${avant['v-gaar'].gaar.fond})`);
    reference[theme].avant = avant;
  }
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');

  console.log('Téléphone 390 px');
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    controler('téléphone', theme, await mesurer(T), reference[theme].avant);
    await T.screenshot({ path: join(CAPT, `v034-0${theme === 'clair' ? 1 : 2}-tel-390-${theme}.png`) });
    // la liste entière : feu, feu repris, entraînement, GAAR, IFR, vol ordinaire, simulation
    await T.locator('#list').screenshot({ path: join(CAPT, `v034-0${theme === 'clair' ? 5 : 6}-tel-390-liste-${theme}.png`) });
  }
  console.log('Thème choisi dans l\'app (data-theme)');
  await T.emulateMedia({ colorScheme: 'light' });
  await T.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  controler('téléphone (thème sombre forcé)', 'sombre', await mesurer(T), reference.sombre.avant);
  await T.emulateMedia({ colorScheme: 'dark' });
  await T.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  controler('téléphone (thème clair forcé)', 'clair', await mesurer(T), reference.clair.avant);
  await T.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  console.log('PC 1280 px');
  const P = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } });
  await P.emulateMedia({ colorScheme: 'light' });
  controler('PC', 'clair', await mesurer(P), reference.clair.avant);
  await P.screenshot({ path: join(CAPT, 'v034-03-pc-clair.png') });

  console.log('iPad (WebKit)');
  const I = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' });
  for (const theme of ['clair', 'sombre']) {
    await I.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    controler('iPad', theme, await mesurer(I), reference[theme].avant);
  }
  await I.screenshot({ path: join(CAPT, 'v034-04-ipad-sombre.png') });
  await I.emulateMedia({ colorScheme: 'light' });
  await I.locator('#list').screenshot({ path: join(CAPT, 'v034-07-ipad-liste-clair.png') });

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.34 / R86 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
