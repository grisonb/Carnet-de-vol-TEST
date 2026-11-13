// v0.37 : R89 « att » et « appr » sans point (cartes du Carnet, terrains intermédiaires de la saisie), R90 avion
// « nom / immatriculation / type » sur UNE ligne (police réduite si besoin, jamais sous 12 px, « … » en dernier recours,
// boutons « i » et « + » inchangés), R91 « Feux » rangé parmi les compteurs (ordre gardé après réouverture, « + » et
// « prochain : n°… » inchangés). Téléphone (Chromium 390 et 360 px), iPad (WebKit). Vols et avions INVENTÉS.
// Captures : tests/navigateur/captures/v037-*.png (non commitées). Usage : node tests/navigateur/v037.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-12T08:00:00Z';
const avion = (id, immat, nom, modele) => ({ id, immat, typeOACI: 'DH8D', modele, constructeur: 'ESSAI', nom, indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H });
const AVIONS = [avion('a1', 'F-XZZZ', 'M99', 'Dash 8 Q400 MRE'), avion('a2', 'F-XZZY', 'M199', 'Dash 8 Q400 MRE 2'),
  avion('a3', 'F-XZZX', 'M299', 'Bombardier Dash 8 Q400 MRE version très très longue pour un essai de la ligne avion')];
const vol = (id, jour, champs) => ({ id, date: `2026-11-${jour}`, hDep: '10:00', hArr: '11:30', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 90, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 90, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['TRANSIT ESSAI'], remarques: '', feux: 0,
  compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(`2026-11-${jour}T10:00Z`),
  creeLe: H, modifieLe: H, ...champs });
const VOLS = [
  vol('v-att', '11', { attJour: 2, attNuit: 1, approches: 3, tempsIFR: 60, escales: [{ code: 'LFMN', attJour: 1, attNuit: 0, approches: 1 }] }),
  vol('v-54', '10', { missions: ['FEU n°54 VILLE-ESSAI-A'], feux: 1 }),
  vol('v-long', '09', { avionId: 'a2' }),
  vol('v-tres-long', '08', { avionId: 'a3' }),
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
  await p.evaluate(async ([as, vs]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols'], 'readwrite'); for (const a of as) t.objectStore('avions').put(a); for (const v of vs) t.objectStore('vols').put(v);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVIONS, VOLS]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return p;
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const ouvrir = async (p, id) => { await p.click('.tabs button[data-v="carnet"]'); await p.click(`#list .flight[data-id="${id}"]`); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(p, 300); };
const fermer = async p => { await p.click('#cancel'); await p.click('#ab-yes').catch(() => {}); await p.waitForSelector('#v-carnet:not([hidden])'); };
// Ligne Avion : une seule ligne, rien de coupé, tailles des polices, place des boutons « i » et « + »
const ligneAvion = p => p.evaluate(() => {
  const r = s => document.querySelector(s).getBoundingClientRect(), t = document.querySelector('#ac-cur .t');
  const parts = ['#ac-reg', '#ac-sub', '#ac-type'].map(s => document.querySelector(s));
  const rects = parts.map(e => e.getBoundingClientRect()), fs = parts.map(e => parseFloat(getComputedStyle(e).fontSize));
  const typ = parts[2], b = r('#ac-cur'), i = r('#ac-fiche'), plus = r('#ac-add');
  return { texte: [document.getElementById('ac-reg').textContent, document.getElementById('ac-sub').textContent, typ.textContent].join(' / '),
    // une seule ligne : hauteur de moins de 2 lignes de la plus grande police, et les trois parties côte à côte (de gauche à droite)
    uneLigne: t.getBoundingClientRect().height < 1.9 * Math.max(...fs) && rects[0].right <= rects[1].left + 1 && rects[1].right <= rects[2].left + 1,
    entier: t.scrollWidth <= t.clientWidth + 0.5 && typ.scrollWidth <= typ.clientWidth + 0.5, coupe: t.classList.contains('coupe'),
    polices: fs.map(x => Math.round(x * 10) / 10), typePlusPetit: fs[2] <= fs[0], dedans: b.right <= i.left + 0.5,
    boutons: [Math.round(i.width), Math.round(i.height), Math.round(plus.width), Math.round(plus.height)], droite: Math.round(innerWidth - plus.right) };
});

try {
  console.log('Téléphone 390 px');
  const T = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  console.log('R89 : « att » et « appr » sans point');
  const chips = await T.$$eval('.flight[data-id="v-att"] .chips .chip', l => l.map(x => x.textContent));
  // v0.38 (R98) : 2 de jour + 1 de nuit : « 2 att » et « 1 att nuit » (avant : « 3 att »)
  verifier(chips.includes('2 att') && chips.includes('1 att nuit') && chips.includes('3 appr') && !chips.some(x => /att\.|appr\./.test(x)), `carte du Carnet : ${chips.join(' | ')}`);
  await T.locator('.flight[data-id="v-att"]').screenshot({ path: join(CAPT, 'v037-01-tel-390-carte.png') });
  await ouvrir(T, 'v-att');
  const via = await T.$$eval('#via-list .vc-p', l => l.map(x => x.textContent));
  verifier(via.join(' | ') === '1 att | 1 appr', `terrain intermédiaire de la saisie : ${via.join(' | ')}`);

  console.log('R90 : avion sur une seule ligne');
  let a = await ligneAvion(T);
  const boutonsRef = a.boutons.join('x'), droiteRef = a.droite;
  verifier(a.texte === 'M99 / F-XZZZ / Dash 8 Q400 MRE' && a.uneLigne && a.entier && !a.coupe && a.typePlusPetit && a.dedans,
    `390 px : « ${a.texte} » sur une ligne, rien de coupé (polices ${a.polices.join(' / ')} px)`);
  await T.evaluate(() => document.querySelector('.sec.c-av').scrollIntoView({ block: 'center' })); await T.locator('.sec.c-av').screenshot({ path: join(CAPT, 'v037-02-tel-390-avion.png') });
  await fermer(T);
  await ouvrir(T, 'v-long');
  a = await ligneAvion(T);
  verifier(a.uneLigne && a.entier && !a.coupe && a.polices.every(x => x >= 12) && a.dedans && a.boutons.join('x') === boutonsRef && a.droite === droiteRef,
    `390 px, type long : une ligne, police réduite (${a.polices.join(' / ')} px), rien de coupé, boutons i et + inchangés (${a.boutons.join('x')})`);
  await fermer(T);
  await ouvrir(T, 'v-tres-long');
  a = await ligneAvion(T);
  verifier(a.uneLigne && a.coupe && a.polices.every(x => x === 12) && a.dedans && a.boutons.join('x') === boutonsRef,
    `390 px, type très long : « … » seulement quand tout est à 12 px (${a.polices.join(' / ')} px)`);
  await T.evaluate(() => document.querySelector('.sec.c-av').scrollIntoView({ block: 'center' })); await T.locator('.sec.c-av').screenshot({ path: join(CAPT, 'v037-03-tel-390-avion-tres-long.png') });
  await fermer(T);

  console.log('R91 : « Feux » rangé parmi les compteurs');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  const ordre = () => T.$$eval('.sec.c-mi .step', l => l.filter(x => !x.hidden).map(x => x.querySelector('span').childNodes[0].textContent.trim()));
  const ordreAvant = await ordre();
  verifier(ordreAvant[0] === 'Feux' && ordreAvant[1] === 'Largages CdB Dash', `par défaut : « Feux » en premier (${ordreAvant.join(', ')})`);
  await T.click('#ctr-open');
  const panneau = await T.$$eval('#ctr-panel .prow', l => l.map(x => ({ nom: x.querySelector('.pname').textContent, sw: !!x.querySelector('.sw'), fleches: x.querySelectorAll('.arrows button').length })));
  verifier(panneau[0].nom === 'Feux' && !panneau[0].sw && panneau[0].fleches === 2 && panneau.slice(1).every(x => x.sw), '« Choisir et ranger » : « Feux » avec ↑ ↓, sans interrupteur');
  await T.click('#ctr-panel [data-mv="0"][data-d="1"]'); await attendre(T, 200);
  verifier((await ordre()).join(', ') === ['Largages CdB Dash', 'Feux', ...ordreAvant.slice(2)].join(', '), `↓ : « Feux » sous « Largages CdB Dash » (${(await ordre()).join(', ')})`);
  await fermer(T);
  console.log('Fermer et rouvrir l\'app');
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  verifier((await ordre()).slice(0, 2).join(', ') === 'Largages CdB Dash, Feux', 'après réouverture : ordre gardé');
  verifier((await T.textContent('#fire-next')) === '(prochain : n°55)', 'prochain feu : n°55 (inchangé)');
  await T.click('#feu-p');
  verifier((await T.$$eval('#ml input', l => l.map(x => x.value))).includes('FEU n°55 ') && (await T.textContent('#s-feu')) === '1', '« + » sur Feux : ligne « FEU n°55 », compteur 1');
  await T.click('#feu-num'); await T.waitForSelector('#fn-modal:not([hidden])');
  verifier(await T.inputValue('#fn-n') === '55', 'le n° souligné ouvre toujours « Numéro du feu »');
  await T.click('#fn-non');
  await T.evaluate(() => document.querySelector('.sec.c-mi').scrollIntoView({ block: 'start' })); await T.locator('.sec.c-mi').screenshot({ path: join(CAPT, 'v037-04-tel-390-mission-feux-deplace.png') });
  await T.click('#feu-m');
  verifier((await T.textContent('#s-feu')) === '0' && !(await T.$$eval('#ml input', l => l.some(x => /^FEU/.test(x.value)))), '« − » sur Feux : ligne retirée');
  await T.click('#ctr-open');
  await T.click('#ctr-panel [data-mv="1"][data-d="-1"]'); await attendre(T, 200);
  verifier((await ordre())[0] === 'Feux', '↑ : « Feux » revient en premier');
  await fermer(T);

  console.log('Téléphone 360 px');
  const S = await appareil('360 px', nav, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  for (const id of ['v-att', 'v-long']) {
    await ouvrir(S, id);
    a = await ligneAvion(S);
    if (id === 'v-att') verifier(a.uneLigne && a.entier && !a.coupe && a.polices.every(x => x >= 12) && a.dedans, `360 px : « ${a.texte} » sur une ligne, rien de coupé (${a.polices.join(' / ')} px)`);
    // plus long que « M99 / F-XZZZ / Dash 8 Q400 MRE » : à 360 px, « … » seulement une fois tout à 12 px
    else verifier(a.uneLigne && a.dedans && (a.entier || (a.coupe && a.polices.every(x => x === 12))), `360 px : « ${a.texte} » sur une ligne${a.coupe ? ', « … » à 12 px (dernier recours)' : ''}`);
    if (id === 'v-att') { await S.evaluate(() => document.querySelector('.sec.c-av').scrollIntoView({ block: 'center' })); await S.locator('.sec.c-av').screenshot({ path: join(CAPT, 'v037-05-tel-360-avion.png') }); }
    await fermer(S);
  }

  console.log('iPad (WebKit)');
  const I = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' });
  await ouvrir(I, 'v-long');
  a = await ligneAvion(I);
  verifier(a.uneLigne && a.entier && !a.coupe && a.dedans, `iPad : « ${a.texte} » sur une ligne (${a.polices.join(' / ')} px)`);
  verifier((await I.$$eval('#via-list .vc-p', l => l.length)) === 0 && (await I.$$eval('.flight[data-id="v-att"] .chip', l => l.map(x => x.textContent))).includes('3 appr'), 'iPad : « 3 appr » sans point');
  await fermer(I);

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.37 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
