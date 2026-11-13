// v0.29 : R68 pastille du temps de vol PLEINE (couleur « Feu n°… ») pour TOUT vol feu, y compris « Feu » en contour.
// Téléphone (Chromium 390 px, clair et sombre), PC (Chromium 1280 px), iPad (WebKit 1080 × 810). Vols INVENTÉS.
// Captures : tests/navigateur/captures/v029-*.png (non commitées). Usage : node tests/navigateur/v029.mjs
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
  vol('v-num', '14', '10:00', { missions: ['FEU n°60 ESSAI'], feux: 1 }),                    // « Feu n°60 » (pleine)
  vol('v-rep', '14', '08:00', { missions: ['FEU n°60 ESSAI'], feux: 0 }),                    // feu repris : « Feu » en contour
  vol('v-ifr', '13', '10:00', { missions: ['FEU ESSAI'], feux: 0, tempsIFR: 30 }),          // « Feu » (contour) + IFR
  vol('v-ent', '12', '10:00', { missions: ['FEU n°61 ESSAI', 'ENT. OPS'], feux: 1 }),        // feu + entraînement
  vol('v-mi', '11', '10:00', { missions: ['ENT. OPS'], tempsIFR: 20 }),                     // entraînement seul (inchangé)
  vol('v-sable', '10', '10:00', {}),                                                         // autre (inchangé)
];

const srv = await serveur();
const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const erreurs = [];
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  // WebKit sans écran : la vérification du service worker (sw.js) peut échouer quand le serveur de test se ferme ; ce n'est pas une erreur de l'app
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
// Pastille du temps et étiquettes de la carte : fond, texte et bordure calculés par le navigateur
const carte = (p, id) => p.$eval(`.flight[data-id="${id}"]`, c => {
  const st = e => { const s = getComputedStyle(e); return { fond: s.backgroundColor, encre: s.color, bord: s.borderTopColor }; };
  const b = c.querySelector('.fl-bloc');
  const feu = [...c.querySelectorAll('.chips .chip.feu, .chips .chip.feu2')][0];
  return { classe: ([...b.classList].find(k => k.startsWith('t-')) || '').slice(2), pastille: st(b),
    etiquette: feu ? { texte: feu.textContent, classe: feu.classList.contains('feu2') ? 'feu2' : 'feu', ...st(feu) } : null };
});
// Couleur de référence : une étiquette « Feu n°… » pleine (celle du vol v-num)
const tout = async p => Object.fromEntries(await Promise.all(VOLS.map(async v => [v.id, await carte(p, v.id)])));
const memes = (a, b) => a.fond === b.fond && a.encre === b.encre;

function controler(nomVue, c) {
  const ref = c['v-num'].etiquette;
  verifier(ref && ref.classe === 'feu' && /^Feu n°60$/.test(ref.texte), `${nomVue} : vol « Feu n°60 » : étiquette pleine (référence ${ref?.fond} / ${ref?.encre})`);
  // v0.38 (R95) : la pastille n'est plus pleine : fond blanc (ou fond de la carte en sombre), heure et contour de la couleur
  // « Feu » (#d32f2f ; sombre : #ff6b6b). Ce qui reste vérifié : TOUT vol feu a la même pastille, couleur feu.
  const rougeFeu = ref.fond === 'rgb(211, 47, 47)' && c['v-num'].pastille.fond === 'rgb(255, 255, 255)' ? 'rgb(211, 47, 47)' : 'rgb(255, 107, 107)';
  verifier(c['v-num'].classe === 'feu' && c['v-num'].pastille.encre === rougeFeu && c['v-num'].pastille.bord === rougeFeu,
    `${nomVue} : vol « Feu n°60 » : pastille couleur « Feu » (${c['v-num'].pastille.fond} / ${c['v-num'].pastille.encre})`);
  const r = c['v-rep'];
  verifier(r.etiquette && r.etiquette.classe === 'feu2' && r.etiquette.texte === 'Feu' && r.etiquette.fond === 'rgba(0, 0, 0, 0)',
    `${nomVue} : vol « Feu » sans numéro : l'étiquette reste en contour (fond transparent, bord ${r.etiquette?.bord})`);
  verifier(r.classe === 'feu' && memes(r.pastille, c['v-num'].pastille) && r.pastille.bord === c['v-num'].pastille.bord,
    `${nomVue} : vol « Feu » sans numéro : même pastille que le « Feu n°60 » (${r.pastille.fond} / ${r.pastille.encre})`);
  verifier(c['v-ifr'].classe === 'feu' && memes(c['v-ifr'].pastille, c['v-num'].pastille), `${nomVue} : « Feu » + IFR : pastille feu`);
  verifier(c['v-ent'].classe === 'feu' && memes(c['v-ent'].pastille, c['v-num'].pastille), `${nomVue} : feu + entraînement : pastille feu`);
  verifier(c['v-mi'].classe === 'mi' && c['v-sable'].classe === 'sable', `${nomVue} : entraînement et autre vol inchangés (orange, sable)`);
}

try {
  console.log('Téléphone 390 px');
  const T = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await T.emulateMedia({ colorScheme: 'light' });
  controler('clair', await tout(T));
  await T.screenshot({ path: join(CAPT, 'v029-01-tel-clair.png') });
  await T.emulateMedia({ colorScheme: 'dark' });
  const sombre = await tout(T);
  controler('sombre (réglage du téléphone)', sombre);
  verifier(sombre['v-rep'].pastille.fond === 'rgb(23, 34, 46)', `sombre : la pastille prend bien les couleurs sombres (${sombre['v-rep'].pastille.fond})`);
  await T.screenshot({ path: join(CAPT, 'v029-02-tel-sombre.png') });
  await T.emulateMedia({ colorScheme: 'light' });
  await T.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  controler('sombre (thème choisi dans l\'app)', await tout(T));
  await T.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  controler('clair (thème choisi dans l\'app)', await tout(T));

  console.log('PC 1280 px');
  const P = await appareil('PC', nav, { viewport: { width: 1280, height: 900 } });
  controler('PC', await tout(P));

  console.log('iPad WebKit 1080 × 810');
  const I = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  controler('iPad', await tout(I));
  await I.screenshot({ path: join(CAPT, 'v029-03-ipad.png') });

  verifier(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' / ') : ''));
  console.log('v0.29 réussie.');
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
