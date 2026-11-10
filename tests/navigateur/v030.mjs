// v0.30 : R69 libellés des compteurs de la saisie plus lisibles (Feux, compteurs choisis, Appr, Att. Jour / Nuit,
// fenêtre Terrain intermédiaire) : couleur du texte, gras 600, ~17 px ; complément « (n°…) » ~14 px gris foncé.
// Téléphone (Chromium 390 px clair et sombre, 360 px), PC (Chromium 1280 px), iPad (WebKit 1080 × 810). Vols INVENTÉS.
// Captures : tests/navigateur/captures/v030-*.png (non commitées). Usage : node tests/navigateur/v030.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-14T08:00:00Z';
const AVION = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H };
const VOL = { id: 'v-feu', date: '2026-11-14', hDep: '10:00', hArr: '12:00', mode: 'utc', dep: 'LFTW', arr: 'LFTW', avionId: 'a1',
  escales: [{ code: 'LFMN', attJour: 1, attNuit: 0, approches: 1 }],
  tempsTotal: 120, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 120, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['FEU n°54 ESSAI'], remarques: '',
  feux: 1, compteurs: { largCdbDash: 2, largInstrCdbDash: 1 }, etiquettes: [], attJour: 1, attNuit: 0, approches: 2, tempsIFR: 0, tempsNuit: 0, simTemps: 0,
  source: 'saisie', ordre: Date.parse('2026-11-14T10:00Z'), creeLe: H, modifieLe: H };

const srv = await serveur();
const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const erreurs = [];
const attendre = (p, ms) => p.waitForTimeout(ms);
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  // WebKit sans écran : la vérification du service worker (sw.js) peut échouer quand le serveur de test se ferme ; ce n'est pas une erreur de l'app
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|access control/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([a, v]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols'], 'readwrite'); t.objectStore('avions').put(a); t.objectStore('vols').put(v);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVION, VOL]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.click('.flight[data-id="v-feu"]'); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(p, 200);
  return p;
}

// Styles calculés par le navigateur. Contraste = rapport de luminance WCAG entre le texte et le premier fond non transparent.
const MESURE = () => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fond = e => { for (let x = e; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0.5)) return c; } return [255, 255, 255]; };
  const info = (e, nom) => { const s = getComputedStyle(e), a = lum(rgb(s.color)), b = lum(fond(e));
    return { nom, texte: e.textContent.trim(), taille: parseFloat(s.fontSize), graisse: Number(s.fontWeight), couleur: s.color,
      contraste: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10 }; };
  const valeur = getComputedStyle(document.querySelector('#feu-row output')).color;
  const feux = document.querySelector('#feu-row > span:first-child');
  const libelles = [info(feux, 'Feux'), ...[...document.querySelectorAll('#ctrs .step > span:first-child')].map(e => info(e, 'compteur')),
    ...[...document.querySelectorAll('#v-saisie .mstep .mlbl, #via-modal .mstep .mlbl')].map(e => info(e, 'mlbl'))];
  const compl = document.getElementById('fire-next');
  // Boutons – / + : taille et chevauchement avec le libellé (compteurs du bloc Mission)
  const rangs = [...document.querySelectorAll('#feu-row, #ctrs .step')].map(r => {
    const l = r.querySelector(':scope > span:first-child').getBoundingClientRect(), c = r.querySelector('.ctl').getBoundingClientRect();
    const bs = [...r.querySelectorAll('.ctl button')].map(b => b.getBoundingClientRect());
    return { texte: r.querySelector(':scope > span:first-child').textContent.trim(), lignes: Math.round(l.height / 21), chevauche: l.right > c.left + 0.5,
      boutons: bs.map(b => `${Math.round(b.width)}×${Math.round(b.height)}`), dansEcran: c.right <= document.documentElement.clientWidth + 0.5 };
  });
  return { valeur, libelles, compl: { ...info(compl, 'complément') }, rangs };
};

function controler(vue, m) {
  verifier(m.libelles.length >= 9, `${vue} : ${m.libelles.length} libellés de compteurs contrôlés (${[...new Set(m.libelles.map(l => l.texte.replace(/\s*\(.*\)/, '')))].join(', ')})`);
  const mauvais = m.libelles.filter(l => l.taille < 16.5 || l.taille > 17.5 || l.graisse !== 600 || l.contraste < 7);
  verifier(!mauvais.length, `${vue} : tous en ~17 px, gras 600, contraste ≥ 7 (${mauvais.map(l => `${l.texte} ${l.taille}px ${l.graisse} ${l.contraste}`).join(' / ') || `ex. ${m.libelles[0].taille} px, ${m.libelles[0].graisse}, contraste ${Math.min(...m.libelles.map(l => l.contraste))} au moins`})`);
  verifier(m.libelles.filter(l => l.nom !== 'mlbl').every(l => l.couleur === m.valeur), `${vue} : libellés Feux et compteurs de la même couleur que les valeurs (${m.valeur})`);
  verifier(m.compl.texte === '(n°54)' && m.compl.taille >= 13.5 && m.compl.taille <= 14.5 && m.compl.contraste >= 7 && m.compl.couleur !== m.valeur,
    `${vue} : complément « ${m.compl.texte} » plus discret mais lisible (${m.compl.taille} px, ${m.compl.couleur}, contraste ${m.compl.contraste})`);
  verifier(m.rangs.every(r => !r.chevauche && r.dansEcran && r.boutons.every(b => b === '44×44')), `${vue} : boutons – / + intacts (44 × 44) et jamais recouverts par le libellé`);
}

try {
  console.log('Téléphone 390 px');
  const T = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await T.click('#via-add'); await T.waitForSelector('#via-modal:not([hidden])'); await attendre(T, 150);
  await T.fill('#vm-icao', 'LFKJ'); await T.dispatchEvent('#vm-icao', 'input'); await attendre(T, 150);
  await T.locator('#via-modal .mbox').screenshot({ path: join(CAPT, 'v030-02-tel-terrain-clair.png') });
  controler('390 px clair (avec la fenêtre Terrain intermédiaire)', await T.evaluate(MESURE));
  await T.emulateMedia({ colorScheme: 'dark' }); await attendre(T, 100);
  controler('390 px sombre (avec la fenêtre Terrain intermédiaire)', await T.evaluate(MESURE));
  await T.locator('#via-modal .mbox').screenshot({ path: join(CAPT, 'v030-04-tel-terrain-sombre.png') });
  await T.click('#vm-cancel'); await attendre(T, 150);
  await T.emulateMedia({ colorScheme: 'light' });
  await T.locator('.sec.c-mi').scrollIntoViewIfNeeded();
  await T.locator('.sec.c-mi').screenshot({ path: join(CAPT, 'v030-01-tel-mission-clair.png') });
  await T.emulateMedia({ colorScheme: 'dark' }); await attendre(T, 100);
  await T.locator('.sec.c-mi').screenshot({ path: join(CAPT, 'v030-03-tel-mission-sombre.png') });
  await T.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await T.emulateMedia({ colorScheme: 'light' });
  controler('390 px sombre (thème choisi dans l\'app)', await T.evaluate(MESURE));
  await T.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

  console.log('Téléphone 360 px : libellé long');
  const S = await appareil('360 px', nav, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // libellé encore plus long qu'aujourd'hui, pour vérifier le passage à la ligne
  await S.evaluate(() => { document.querySelector('#ctrs .step > span:first-child').textContent = 'Largages instruction commandant de bord Dash (essai)'; });
  const m360 = await S.evaluate(MESURE);
  controler('360 px', m360);
  const long = m360.rangs.find(r => /essai/.test(r.texte));
  verifier(long.lignes >= 2, `360 px : libellé long sur ${long.lignes} lignes, boutons ${long.boutons.join(' ')} à leur place`);
  await S.locator('#ctrs').scrollIntoViewIfNeeded();
  await S.locator('.sec.c-mi').screenshot({ path: join(CAPT, 'v030-05-tel-360-long.png') });

  console.log('PC 1280 px');
  const P = await appareil('PC', nav, { viewport: { width: 1280, height: 900 } });
  controler('PC', await P.evaluate(MESURE));

  console.log('iPad WebKit 1080 × 810');
  const I = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  controler('iPad', await I.evaluate(MESURE));
  await I.locator('.sec.c-mi').scrollIntoViewIfNeeded();
  await I.screenshot({ path: join(CAPT, 'v030-06-ipad-mission.png') });
  await I.tap('#via-add'); await I.waitForSelector('#via-modal:not([hidden])'); await attendre(I, 200);
  controler('iPad (fenêtre Terrain intermédiaire)', await I.evaluate(MESURE));
  await I.screenshot({ path: join(CAPT, 'v030-07-ipad-terrain.png') });

  verifier(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' / ') : ''));
  console.log('v0.30 réussie.');
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
