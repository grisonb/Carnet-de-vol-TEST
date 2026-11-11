// v0.34 : R84 rouge « Feu » franc (choix C) : étiquette « Feu n°… » et pastille du temps de tout vol feu #e5534b / #2a0503,
// « Feu » en contour (bord #e5534b, texte rouge foncé), thème sombre ; contrastes ≥ 4,5 ; Entraînement, IFR, sable,
// ligne de mission et couleurs de la saisie inchangés. Téléphone (Chromium 390 px, clair et sombre), PC (Chromium 1280 px),
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
  vol('v-ifr', '11', '10:00', { missions: ['TRANSIT ESSAI'], tempsIFR: 40 }),   // IFR (inchangé)
  vol('v-sable', '10', '10:00', { missions: ['TRANSIT ESSAI'] }),               // autre (inchangé)
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
    const t = db.transaction(['avions', 'vols'], 'readwrite'); t.objectStore('avions').put(a); for (const v of vols) t.objectStore('vols').put(v);
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
      ent: st(c.querySelector('.chip.mi.ent')), ifr: st(c.querySelector('.chip.ifr')), mission: st(c.querySelector('.fl-rem')), carte: getComputedStyle(c).backgroundColor };
  }
  const rs = getComputedStyle(document.documentElement);
  r.vars = { feu: rs.getPropertyValue('--feu').trim(), feuSoft: rs.getPropertyValue('--feu-soft').trim() };
  return r;
}, VOLS.map(v => v.id));

const ATTENDU = {
  clair: { feuFond: 'rgb(229, 83, 75)', feuEncre: 'rgb(42, 5, 3)', contourEncre: 'rgb(179, 38, 30)', entFond: 'rgb(240, 160, 80)', entEncre: 'rgb(63, 28, 2)',
    vars: { feu: '#c62828', feuSoft: '#fde3e1' } },
  sombre: { feuFond: 'rgb(229, 83, 75)', feuEncre: 'rgb(31, 3, 2)', contourEncre: 'rgb(255, 138, 128)', entFond: 'rgb(217, 123, 43)', entEncre: 'rgb(31, 13, 0)',
    vars: { feu: '#ef5350', feuSoft: '#3a1c1c' } },
};
let reference = null; // IFR, sable et ligne de mission mesurés en v0.33 (fichier CSS d'avant) : voir plus bas
function controler(nom, theme, m, avant) {
  const a = ATTENDU[theme], f = m['v-feu'], r = m['v-rep'];
  const cF = contraste(f.feu.fond, f.feu.encre), cP = contraste(f.pastille.fond, f.pastille.encre), cC = contraste(r.carte, r.feu2.encre);
  verifier(f.feu.fond === a.feuFond && f.feu.encre === a.feuEncre && cF >= 4.5, `${nom} ${theme} : « Feu n°60 » ${f.feu.fond} / ${f.feu.encre}, contraste ${cF.toFixed(2)}`);
  verifier(f.classe === 'feu' && f.pastille.fond === a.feuFond && f.pastille.encre === a.feuEncre && cP >= 4.5, `${nom} ${theme} : pastille du temps feu pleine, contraste ${cP.toFixed(2)}`);
  verifier(r.feu2 && r.feu2.fond === 'rgba(0, 0, 0, 0)' && r.feu2.bord === a.feuFond && r.feu2.encre === a.contourEncre && cC >= 4.5,
    `${nom} ${theme} : « Feu » en contour : bord ${r.feu2.bord}, texte ${r.feu2.encre} sur ${r.carte}, contraste ${cC.toFixed(2)}`);
  verifier(r.classe === 'feu' && r.pastille.fond === a.feuFond && r.pastille.encre === a.feuEncre, `${nom} ${theme} : feu repris : pastille pleine identique`);
  verifier(m['v-ent'].classe === 'mi' && m['v-ent'].ent.fond === a.entFond && m['v-ent'].ent.encre === a.entEncre && m['v-ent'].pastille.fond === a.entFond,
    `${nom} ${theme} : Entraînement inchangé (${m['v-ent'].ent.fond})`);
  verifier(m.vars.feu === a.vars.feu && m.vars.feuSoft === a.vars.feuSoft, `${nom} ${theme} : rouge de la saisie, du champ Mission et des messages inchangé (--feu ${m.vars.feu})`);
  if (avant) {
    verifier(JSON.stringify(m['v-ifr'].ifr) === JSON.stringify(avant['v-ifr'].ifr) && JSON.stringify(m['v-ifr'].pastille) === JSON.stringify(avant['v-ifr'].pastille)
      && JSON.stringify(m['v-sable'].pastille) === JSON.stringify(avant['v-sable'].pastille), `${nom} ${theme} : IFR et sable identiques à la v0.33`);
    verifier(VOLS.every(v => JSON.stringify(m[v.id].mission) === JSON.stringify(avant[v.id].mission)), `${nom} ${theme} : ligne de mission sous la carte identique à la v0.33`);
  }
}

try {
  // Référence : la même page avec la feuille de style d'avant R84 (règles v0.34 retirées) = couleurs de la v0.33
  const T = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const sansR84 = async () => T.evaluate(() => {
    for (const ss of document.styleSheets) {
      let regles; try { regles = ss.cssRules; } catch { continue; }
      for (let i = regles.length - 1; i >= 0; i--) {
        const t = regles[i].cssText;
        if (/chip\.feu|t-feu/.test(t) && /229, 83, 75|#e5534b|#b3261e|#ff8a80|#1f0302|179, 38, 30|255, 138, 128|31, 3, 2/i.test(t)) ss.deleteRule(i);
      }
    }
  });
  reference = {};
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    reference[theme] = await mesurer(T);
  }
  await sansR84();
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    const avant = await mesurer(T);
    verifier(avant['v-feu'].feu.fond !== reference[theme]['v-feu'].feu.fond, `référence ${theme} : la page sans R84 a bien l'ancien rouge (${avant['v-feu'].feu.fond})`);
    reference[theme].avant = avant;
  }
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');

  console.log('Téléphone 390 px');
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    controler('téléphone', theme, await mesurer(T), reference[theme].avant);
    await T.screenshot({ path: join(CAPT, `v034-0${theme === 'clair' ? 1 : 2}-tel-390-${theme}.png`) });
    // la liste entière : feu, feu repris, entraînement, IFR (et vol ordinaire)
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

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.34 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
