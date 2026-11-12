// v0.28 : R65 étiquette « N appr. », R66 pastille de couleur du temps de vol, R67 barre du bas (« + » vert, texte 19 px).
// Téléphone (Chromium 390 px et 360 px), PC (Chromium 1280 px), iPad (WebKit 1080 × 810 et 810 × 1080). Vols INVENTÉS.
// Captures : tests/navigateur/captures/v028-*.png (non commitées). Usage : node tests/navigateur/v028.mjs
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
  vol('v-feu', '14', '10:00', { missions: ['FEU n°60 ESSAI'], feux: 1, tempsIFR: 30 }),                       // feu + IFR -> feu
  vol('v-ifr', '13', '10:00', { tempsIFR: 96, approches: 3, dep: 'LFTW', arr: 'LFTW',                        // IFR, route à 4 terrains
    escales: [{ code: 'LFMN', attJour: 1, attNuit: 0, approches: 1 }, { code: 'LFKJ', attJour: 1, attNuit: 0 }] }),
  vol('v-ent', '12', '10:00', { missions: ['ENT. OPS'], tempsIFR: 20 }),                                     // entraînement + IFR -> entraînement
  vol('v-autre', '11', '10:00', { approches: 2 }),                                                           // VFR 2 approches -> sable
  vol('v-zero', '10', '10:00', {}),                                                                          // aucune approche
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
  p.on('pageerror', e => erreurs.push(`${nom} : ${e.message}`));
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
const carte = (p, id) => p.$eval(`.flight[data-id="${id}"]`, c => {
  const b = c.querySelector('.fl-bloc'), r = c.querySelector('.fl-route').getBoundingClientRect(), br = b.getBoundingClientRect(), s = getComputedStyle(b);
  const chips = [...c.querySelectorAll('.chips .chip')].map(x => x.textContent);
  const ref = cls => { const e = c.querySelector(`.chips .chip.${cls}`); return e ? getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).color : null; };
  return { classe: ([...b.classList].find(k => k.startsWith('t-')) || '').slice(2), fond: s.backgroundColor + '|' + s.color, taille: parseFloat(s.fontSize),
    graisse: s.fontWeight, rayon: s.borderRadius, chips, refFeu: ref('feu'), refMi: ref('mi'), refIfr: ref('ifr'), refAppr: ref('appr'),
    chevauche: r.right > br.left + 1 && r.bottom > br.top + 1 && r.top < br.bottom - 1, routeLignes: Math.round(r.height / parseFloat(getComputedStyle(c.querySelector('.fl-route')).lineHeight || 22)) };
});
const barre = p => p.evaluate(() => {
  const t = [...document.querySelectorAll('.tabs button[data-v]')], f = document.getElementById('fab'), r = f.getBoundingClientRect();
  return { tailles: t.map(b => parseFloat(getComputedStyle(b).fontSize)), uneLigne: t.every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().height < 60),
    fab: { l: Math.round(r.width), h: Math.round(r.height), fond: getComputedStyle(f).backgroundColor, droite: r.left > t[2].getBoundingClientRect().right, dansBarre: !!f.closest('.tabs'),
      svg: !!f.querySelector('svg path'), visible: !!f.offsetParent }, flottant: !!document.querySelector('.fab:not(.tabs .fab)'),
    vertSave: getComputedStyle(document.getElementById('save')).getPropertyValue('--vert-fond') || getComputedStyle(document.documentElement).getPropertyValue('--vert-fond').trim() };
});

try {
  console.log('Téléphone 390 px : cartes du Carnet');
  const T = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const c = Object.fromEntries(await Promise.all(VOLS.map(async v => [v.id, await carte(T, v.id)])));
  // R65
  verifier(!c['v-zero'].chips.some(x => / appr$/.test(x)), 'vol sans approche : pas d\'étiquette « appr »');
  verifier(c['v-autre'].chips.includes('2 appr') && c['v-autre'].chips.indexOf('2 appr') === c['v-autre'].chips.indexOf('1 att') + 1, 'VFR 2 approches : « 2 appr » à la place de l\'IFR (après « 1 att. »)');
  const ci = c['v-ifr'].chips;
  verifier(ci.indexOf('3 appr') === ci.indexOf('IFR 1h36') + 1, `IFR avec approches à l'arrivée et sur un terrain intermédiaire : « IFR 1h36 » puis « 3 appr » (${ci.join(' | ')})`);
  verifier(c['v-ifr'].refAppr && c['v-ifr'].refAppr !== c['v-ifr'].refIfr && c['v-ifr'].refAppr.split('|')[0] === 'rgb(226, 242, 238)', `couleur propre (vert-de-gris clair) : ${c['v-ifr'].refAppr}`);
  // R66
  verifier(c['v-feu'].classe === 'feu' && c['v-feu'].fond === c['v-feu'].refFeu, `feu (+ IFR) : couleur de l'étiquette « Feu n°… » (${c['v-feu'].fond})`);
  verifier(c['v-ent'].classe === 'mi' && c['v-ent'].fond === c['v-ent'].refMi, `entraînement (+ IFR) : couleur de l'étiquette « Entraînement » (${c['v-ent'].fond})`);
  verifier(c['v-ifr'].classe === 'ifr' && c['v-ifr'].fond === c['v-ifr'].refIfr, `IFR : couleur de l'étiquette « IFR » (${c['v-ifr'].fond})`);
  verifier(c['v-autre'].classe === 'sable' && c['v-autre'].fond === 'rgb(239, 230, 211)|rgb(58, 47, 26)', `autre vol : sable (${c['v-autre'].fond})`);
  verifier(c['v-autre'].taille > 24 && Number(c['v-autre'].graisse) >= 800 && parseFloat(c['v-autre'].rayon) >= 10, `pastille arrondie, gras, ${c['v-autre'].taille} px (avant : 24 px, normal 700)`);
  verifier(!c['v-ifr'].chevauche, 'route à 4 terrains : passe à la ligne à gauche, la pastille garde sa place, rien ne se chevauche');
  await T.screenshot({ path: join(CAPT, 'v028-01-tel-carnet.png') });

  console.log('Téléphone : barre du bas');
  let b = await barre(T);
  verifier(b.tailles.every(x => x === 19) && b.uneLigne, `« Carnet », « Totaux », « Plus » : 19 px, sur une ligne (${b.tailles.join(', ')})`);
  verifier(b.fab.visible && b.fab.dansBarre && b.fab.droite && b.fab.l >= 48 && b.fab.h >= 48 && b.fab.svg && b.fab.fond === 'rgb(46, 125, 50)',
    `« + » vert (${b.fab.fond}) ${b.fab.l} × ${b.fab.h} px, dessiné, à droite de « Plus », dans la barre`);
  verifier(!b.flottant, 'plus de bouton flottant « + Nouveau vol »');
  for (const v of ['totaux', 'plus', 'carnet']) {
    await T.click(`.tabs button[data-v="${v}"]`); await T.click('#fab');
    await T.waitForSelector('#v-saisie:not([hidden])');
    verifier(await T.textContent('#f-title') === 'Nouveau vol' && await T.inputValue('#f-arr') === 'LFTW', `« + » depuis ${v} : nouveau vol (valeurs par défaut habituelles)`);
    await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');
  }
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])');
  await T.fill('#f-rem', 'EN COURS');
  await T.screenshot({ path: join(CAPT, 'v028-02-tel-saisie-barre.png') });
  const save = await T.evaluate(() => { const s = document.getElementById('save').getBoundingClientRect(), t = document.querySelector('.tabs').getBoundingClientRect(); return s.bottom <= t.top + 0.5; });
  verifier(save, '« Enregistrer le vol » ne recouvre ni la barre ni le « + »');
  await T.click('#fab'); await T.waitForSelector('#ab-modal:not([hidden])');
  verifier(true, 'saisie en cours : « + » demande « Abandonner la saisie ? »');
  await T.click('#ab-no');
  verifier(await T.inputValue('#f-rem') === 'EN COURS', '  « Continuer la saisie » : rien de perdu');
  await T.click('#fab'); await T.click('#ab-yes'); await T.waitForSelector('#v-saisie:not([hidden])'); await T.waitForTimeout(200);
  verifier(await T.textContent('#f-title') === 'Nouveau vol' && await T.inputValue('#f-rem') === '', '  « Abandonner » : un nouveau vol vide s\'ouvre');
  await T.click('#cancel');

  console.log('Téléphone 360 px');
  await T.setViewportSize({ width: 360, height: 780 });
  b = await barre(T);
  verifier(b.uneLigne && b.fab.l >= 48 && !(await T.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), '360 px : textes sur une ligne, « + » 48 px, rien ne dépasse');
  await T.screenshot({ path: join(CAPT, 'v028-03-tel-360.png') });

  console.log('PC 1280 px');
  const P = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } });
  b = await barre(P);
  verifier(b.uneLigne && b.fab.visible && b.fab.droite && (await carte(P, 'v-feu')).classe === 'feu', 'PC : même barre, mêmes pastilles');
  await P.screenshot({ path: join(CAPT, 'v028-04-pc-carnet.png') });

  console.log('iPad (WebKit) paysage et portrait');
  const I = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' });
  b = await barre(I);
  const ci2 = await carte(I, 'v-ent');
  verifier(b.uneLigne && b.fab.visible && b.fab.l >= 48 && ci2.classe === 'mi' && !(await carte(I, 'v-ifr')).chevauche, 'iPad paysage : barre, « + » et pastilles');
  await I.screenshot({ path: join(CAPT, 'v028-05-ipad-paysage.png') });
  await I.tap('#fab'); await I.waitForSelector('#v-saisie:not([hidden])');
  verifier(await I.textContent('#f-title') === 'Nouveau vol', 'iPad paysage : « + » au doigt ouvre un nouveau vol');
  // Portrait : fenêtre ouverte directement à cette taille (WebKit sans écran ne replace pas les éléments fixes
  // quand on change la taille d'une page déjà ouverte)
  const IP = await appareil('iPad portrait', navSafari, { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' });
  b = await barre(IP);
  verifier(b.uneLigne && b.fab.visible && (await carte(IP, 'v-autre')).classe === 'sable', 'iPad portrait : barre, « + » et pastilles');
  await IP.screenshot({ path: join(CAPT, 'v028-06-ipad-portrait.png') });
  await IP.tap('#fab'); await IP.waitForSelector('#v-saisie:not([hidden])');
  verifier(await IP.textContent('#f-title') === 'Nouveau vol', 'iPad portrait : « + » au doigt ouvre un nouveau vol');

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.28 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close();
  srv.fermer();
}
