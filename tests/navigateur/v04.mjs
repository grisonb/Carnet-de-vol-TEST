// v0.4 dans Chromium, écran 390 px (avions et vols INVENTÉS) : migration des données v0.3, accueil (loupe),
// ligne avion, fiche en lecture seule puis crayon, étiquettes par avion, monopilote sans Copi., Tous mes avions,
// terrain LFBD connu et ajout d'un terrain inconnu, signes « + » centrés, libellé IFR entier.
// Captures dans tests/navigateur/captures/v04-*.png (non commitées).
// Usage : node tests/navigateur/v04.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { VERSION } from '../../js/version.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const { chromium } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const cap = (nom, plein = false) => p.screenshot({ path: join(CAPT, `v04-${nom}.png`), fullPage: plein });
const bloc = (sel, nom) => p.locator(sel).screenshot({ path: join(CAPT, `v04-${nom}.png`) });
// Fenêtre plein écran (fiche) : capture sur un écran haut pour la voir en entier
async function capFenetre(nom) {
  await p.setViewportSize({ width: 390, height: 2200 });
  await p.screenshot({ path: join(CAPT, `v04-${nom}.png`) });
  await p.setViewportSize({ width: 390, height: 844 });
}

// Données « comme en v0.3 » (inventées) : pas d'étiquettes par avion, pas de drapeau de migration
const H = '2026-01-01T00:00:00.000Z';
const AV = {
  dash: { id: 'av-dash', creeLe: H, modifieLe: H, immat: 'F-XQAA', sim: false, typeOACI: 'DH8D', constructeur: 'DE HAVILLAND CANADA', modele: 'Dash 8 Q400', indicatif: 'QUEBEC 1', nom: '', etiquettes: [], remarques: '', photo: null, equipage: 'MP', moteurs: 'ME', moteur: 'T', surface: 'L', train: 'tricycle', fstd: null },
  cub: { id: 'av-cub', creeLe: H, modifieLe: H, immat: 'F-XQCC', sim: false, typeOACI: 'PA18', constructeur: 'PIPER', modele: 'Super Cub', indicatif: '', nom: '', etiquettes: ['TAILWHEEL'], remarques: '', photo: null, equipage: 'SP', moteurs: 'SE', moteur: 'P', surface: 'L', train: 'classique', fstd: null },
  cessna: { id: 'av-cessna', creeLe: H, modifieLe: H, immat: 'F-XQBB', sim: false, typeOACI: 'C177', constructeur: 'CESSNA', modele: '177 Cardinal à très long nom de modèle pour tester les points de suspension', indicatif: '', nom: '', etiquettes: [], remarques: '', photo: null, equipage: 'SP', moteurs: 'SE', moteur: 'P', surface: 'L', train: 'tricycle', fstd: null },
};
const VOL = { id: 'vol-1', creeLe: H, modifieLe: H, source: 'saisie', ordre: 1, date: '2026-01-10', dep: 'LFMN', arr: 'LFMN', escales: [], hDep: '09:00', hArr: '10:00', mode: 'loc',
  avionId: 'av-dash', indicatif: 'QUEBEC 1', etiquettes: ['TRANSPORT'], fonction: 'copi', nomCdB: 'ZZA', nomCopi: '', nomEleve: '', nomInstructeur: '', nomExaminateur: '',
  tempsTotal: 60, tempsSE: null, tempsME: null, tempsMP: null, tempsCdB: 0, tempsCopi: 60, tempsDC: 0, tempsInst: 0, tempsPICUS: 0, tempsExam: 0,
  tempsNuit: 0, tempsIFR: 30, tempsXC: 0, regleIFR: false, approches: 0, approcheType: '', attJour: 1, attNuit: 0, decJour: 0, decNuit: 0, simTemps: 0, simType: '',
  missions: ['ENT. ESSAI'], feux: 0, compteurs: {}, remarques: '', notePerso: '', route: '' };

const centre = async sel => p.evaluate(s => [...document.querySelectorAll(s)].filter(b => b.offsetParent).map(b => {
  const r = b.getBoundingClientRect(), i = b.querySelector('svg').getBoundingClientRect();
  return Math.max(Math.abs((r.left + r.right) / 2 - (i.left + i.right) / 2), Math.abs((r.top + r.bottom) / 2 - (i.top + i.bottom) / 2));
}), sel);

try {
  console.log('Migration des données v0.3');
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ({ avions, vol }) => {
    const db = await new Promise((ok, ko) => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
    const tx = db.transaction(['avions', 'vols', 'reglages'], 'readwrite');
    for (const a of avions) tx.objectStore('avions').put(a);
    tx.objectStore('vols').put(vol);
    tx.objectStore('reglages').delete('migrationV04');
    tx.objectStore('reglages').put({ cle: 'etiquettes', valeur: ['BOMBING', 'TRANSPORT', 'TAILWHEEL'] });
    await new Promise(ok => { tx.oncomplete = ok; });
    db.close();
  }, { avions: Object.values(AV), vol: VOL });
  await p.reload();
  await p.waitForSelector('body[data-pret="1"]');
  const migres = await p.evaluate(async () => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const lire = m => new Promise(ok => { const q = db.transaction(m).objectStore(m).getAll(); q.onsuccess = () => ok(q.result); });
    const [avions, vols, reglages] = [await lire('avions'), await lire('vols'), await lire('reglages')];
    db.close();
    return { avions: Object.fromEntries(avions.map(a => [a.id, a])), vols, migre: reglages.some(r => r.cle === 'migrationV04') };
  });
  verifier(migres.migre, 'migration v0.3 -> v0.4 faite une fois (drapeau enregistré)');
  verifier(JSON.stringify(migres.avions['av-dash'].etiquettes) === '["BOMBING","TRANSPORT"]' && migres.avions['av-dash'].indicatif === 'QUEBEC 1',
    'Dash : BOMBING + TRANSPORT ajoutées, indicatif radio conservé');
  verifier(JSON.stringify(migres.avions['av-cub'].etiquettes) === '["TAILWHEEL"]' && migres.avions['av-cessna'].etiquettes.length === 0,
    'train classique : TAILWHEEL ; autre avion : aucune étiquette');
  verifier(migres.vols.length === 1 && migres.vols[0].etiquettes[0] === 'TRANSPORT' && migres.vols[0].tempsCopi === 60, 'le vol existant est intact');

  console.log('Accueil');
  verifier(await p.textContent('#h-version') === 'v' + VERSION, `version v${VERSION} en haut à gauche`);
  verifier(await p.isHidden('#q'), 'barre de recherche cachée');
  const carte = await p.textContent('.flight');
  verifier(carte.includes('F-XQAA') && !carte.includes('QUEBEC'), 'carte du vol : immatriculation, sans indicatif radio');
  verifier(await p.locator('.flight .chip.fn').count() >= 1 && await p.locator('.flight .chip.mi').count() === 1 && await p.locator('.flight .chip.ifr').count() === 1,
    'pastilles en couleur : fonction (violet), mission (orange), IFR (bleu)');
  await cap('01-accueil');
  await p.click('#q-open');
  await cap('02-accueil-loupe');
  await p.click('#q-open');
  const hauteur = await p.evaluate(() => document.querySelector('#list').getBoundingClientRect().top);
  verifier(hauteur < 300, `accueil compact (avec la bande d'heures) : la liste commence à ${Math.round(hauteur)} px du haut`);

  console.log('Saisie : bloc Vol');
  await p.click('#fab');
  await p.waitForSelector('#v-saisie:not([hidden])');
  verifier(await p.locator('#v-saisie .tophead #f-date').count() === 1 && await p.locator('#v-saisie .sec.c-vol > h3').count() === 0,
    'pas de titre « Vol » : date en haut à gauche, LOC/UTC à droite');
  const ifr = await p.evaluate(() => { const l = document.querySelector('#lbl-ifr'), m = l.closest('.mstep').getBoundingClientRect(), r = l.getBoundingClientRect();
    return l.scrollWidth <= l.clientWidth + 1 && r.right <= m.right && r.top >= m.top && getComputedStyle(l).whiteSpace !== 'normal' || (r.right <= m.right && r.height < 24); });
  verifier(ifr, 'libellé IFR entier (non coupé)');
  const ecarts = await centre('.plus, .step button:not(.feu-num), .mstep .ctl button'); // v0.32 : le n° du feu souligné n'est pas un bouton – / +
  verifier(ecarts.length > 8 && Math.max(...ecarts) <= 0.6, `signes « + » / « − » centrés (écart max ${Math.max(...ecarts).toFixed(2)} px)`);
  await p.fill('#f-dep', 'LFBD');
  verifier((await p.textContent('#n-dep')).includes('Bordeaux'), 'LFBD : Bordeaux reconnu');
  await p.fill('#f-arr', 'ZZQ1');
  verifier((await p.textContent('#n-arr')).includes('inconnu') && await p.isVisible('[data-ajt="#f-arr"]'), 'terrain inconnu : « Ajouter ce terrain » proposé');
  await p.click('[data-ajt="#f-arr"]');
  await p.fill('#ter-nom', 'Piste inventée'); await p.fill('#ter-lat', '44,9'); await p.fill('#ter-lon', '-0.6');
  await p.fill('#ter-tz', 'Europe/Paris'); await p.fill('#ter-pays', 'fr');
  await cap('03-ajout-terrain');
  await p.click('#ter-ok');
  verifier((await p.textContent('#n-arr')) === 'Piste inventée' && await p.isHidden('[data-ajt="#f-arr"]'), 'terrain ajouté et reconnu aussitôt');
  await p.fill('#f-t0', '1000'); await p.fill('#f-t1', '1130');
  await bloc('.c-vol', '04-bloc-vol');

  console.log('Saisie : bloc Avion');
  // l'avion proposé est celui du dernier vol : le Dash
  verifier(await p.textContent('#ac-reg') === 'F-XQAA' && await p.textContent('#ac-sub') === '', 'Dash sans nom : immatriculation une seule fois');
  await p.click('#ac-fiche');
  verifier(await p.evaluate(() => document.querySelector('#fiche').classList.contains('ro') && document.querySelector('#fi-reg').readOnly), 'bouton i : fiche en lecture seule');
  verifier(await p.isHidden('#fi-save') && await p.isVisible('#fi-ed'), 'lecture seule : pas de bouton Enregistrer, crayon affiché');
  verifier(await p.locator('#fi-pil button:visible').count() === 1, 'lecture seule : seules les options choisies sont affichées');
  verifier(await p.$eval('#fi-nm', el => getComputedStyle(el, '::placeholder').color) === 'rgba(0, 0, 0, 0)', 'lecture seule : champ vide sans exemple affiché');
  verifier(JSON.stringify(await p.$$eval('#fi-tgs .tgchip', l => l.filter(b => b.offsetParent).map(b => b.textContent))) === '["BOMBING","TRANSPORT"]',
    'lecture seule : seules les étiquettes cochées sont affichées');
  await capFenetre('05-fiche-lecture');
  await p.click('#fi-ed');
  verifier(await p.isVisible('#fi-save') && !(await p.evaluate(() => document.querySelector('#fi-reg').readOnly)), 'crayon : fiche modifiable');
  await p.fill('#fi-nm', 'q1');
  await capFenetre('06-fiche-modif');
  await p.click('#fi-save');
  verifier(await p.textContent('#ac-reg') === 'Q1' && await p.textContent('#ac-type') === 'Dash 8 Q400' && await p.textContent('#ac-sub') === 'F-XQAA',
    'ligne avion : « Q1 Dash 8 Q400 F-XQAA »');
  verifier(!(await p.textContent('.c-av')).includes('QUEBEC'), "l'indicatif radio n'apparaît pas dans le bloc Avion");
  const tags = async () => p.$$eval('#tg-val .tgchip', l => l.map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')));
  const t0 = JSON.stringify(await tags());
  verifier(t0 === '["BOMBING","TRANSPORT*"]', `Dash : BOMBING et TRANSPORT proposées, TRANSPORT reprise du dernier vol (${t0})`);
  await p.click('[data-tg3="BOMBING"]');
  verifier(JSON.stringify(await tags()) === '["BOMBING*","TRANSPORT"]', 'BOMBING et TRANSPORT exclusives (choisir BOMBING enlève TRANSPORT)');
  await p.click('#f-fn button[data-r="copi"]');
  await p.click('#ac-cur');
  await bloc('.c-av', '07-bloc-avion-ouvert');
  verifier(await p.isVisible('#ac-all'), 'toucher la ligne ouvre la recherche (avec « Tous mes avions › »)');
  await p.fill('#ac-q', 'xqbb');
  await p.click('#ac-res [data-ac="av-cessna"]');
  verifier(await p.isHidden('#ac-sz'), 'avion choisi : la recherche se referme');
  verifier(await p.textContent('#ac-reg') === 'F-XQBB' && await p.textContent('#ac-sub') === '', 'avion sans nom : IMMAT puis modèle');
  verifier(await p.evaluate(() => { const t = document.querySelector('#ac-type'); return t.scrollWidth > t.clientWidth && getComputedStyle(t).textOverflow === 'ellipsis'; }),
    'modèle trop long raccourci avec « … »');
  verifier(await p.locator('#tg-val .tgchip').count() === 0 && await p.isVisible('#tg-add'), 'avion sans étiquette : seulement le « + »');
  verifier(await p.isHidden('#f-fn button[data-r="copi"]') && await p.getAttribute('#f-fn button[data-r="cdb"]', 'aria-pressed') === 'true',
    'monopilote : « Copi. » disparaît, retour en CdB');
  verifier(await p.isHidden('#f-copi-z'), 'monopilote en CdB : pas de champ de personne');
  await p.click('#f-fn button[data-r="dc"]');
  verifier(await p.isVisible('#f-copi-z') && await p.textContent('#f-copi-l') === 'Instructeur', 'monopilote en DC : champ Instructeur');
  await p.click('#f-fn button[data-r="inst"]');
  verifier(await p.isVisible('#f-copi-z') && await p.textContent('#f-copi-l') === 'Élève', 'monopilote en Inst. : champ Élève');
  await p.click('#f-fn button[data-r="cdb"]');
  await bloc('.c-fn', '08-bloc-fonction-monopilote');
  await p.click('#tg-add'); await p.fill('#pm2-v', 'essai'); await p.click('#pm2-ok');
  verifier(JSON.stringify(await tags()) === '["ESSAI*"]', 'étiquette créée : cochée et ajoutée à l\'avion choisi');
  await p.click('#ac-cur'); await p.fill('#ac-q', 'xqcc'); await p.click('#ac-res [data-ac="av-cub"]');
  verifier(JSON.stringify(await tags()) === '["TAILWHEEL*"]', 'train classique : TAILWHEEL cochée d\'office');
  await bloc('.c-av', '09-bloc-avion');
  for (const [s, n] of [['.c-fn', '10-bloc-fonction'], ['.c-mi', '11-bloc-mission'], ['.c-tp', '12-bloc-temps'], ['.c-rq', '13-bloc-remarques']]) await bloc(s, n);
  await cap('14-saisie-complete', true);

  console.log('Fiche : bloc Étiquettes et train');
  await p.click('#ac-fiche'); await p.click('#fi-ed');
  verifier(await p.locator('#fi-tgs .tgchip').count() >= 4, 'bloc Étiquettes : toutes les étiquettes existantes');
  await p.click('#fi-tw button >> nth=0');
  verifier(await p.getAttribute('[data-ft="TAILWHEEL"]', 'aria-pressed') === 'false', 'train tricycle : TAILWHEEL décochée');
  await p.click('#fi-tw button >> nth=1');
  verifier(await p.getAttribute('[data-ft="TAILWHEEL"]', 'aria-pressed') === 'true', 'train classique : TAILWHEEL cochée');
  await p.click('#fi-x');

  console.log('Tous mes avions');
  await p.click('#ac-cur'); await p.click('#ac-all');
  const plus = await p.locator('#sf-main').boundingBox(), titre = await p.locator('#fl-t').boundingBox();
  verifier(plus.y < 80 && Math.abs((plus.y + plus.height / 2) - (titre.y + titre.height / 2)) < 12 && plus.x > 300, '« + » en haut à droite, à la hauteur du titre');
  verifier(await p.locator('#fl-list .penbtn').count() === 3, 'un crayon sur chaque carte avion');
  await cap('15-tous-mes-avions');
  await p.click('#sf-main');
  await cap('16-tous-mes-avions-menu');
  await p.click('#sf-veil');
  await p.click('[data-ed="av-cessna"]');
  verifier(await p.isVisible('#fi-save') && await p.inputValue('#fi-reg') === 'F-XQBB', 'crayon : fiche ouverte directement en modification');
  await p.fill('#fi-nm', 'c1'); await p.click('#fi-save');
  verifier(await p.isVisible('#fleet') && (await p.textContent('[data-ac="av-cessna"]')).includes('C1'), 'après enregistrement : retour à la liste, mise à jour');
  verifier(await p.textContent('#ac-reg') === 'F-XQCC', "le crayon ne change pas l'avion du vol");
  await p.click('[data-ac="av-cessna"]');
  verifier(await p.isHidden('#fleet') && await p.textContent('#ac-reg') === 'C1', "toucher la carte choisit l'avion pour le vol");

  console.log('Mode sombre (teintes)');
  await p.emulateMedia({ colorScheme: 'dark' });
  await cap('17-saisie-sombre', true);
  await p.emulateMedia({ colorScheme: 'light' });

  verifier(erreurs.length === 0, 'aucune erreur JavaScript ' + erreurs.join(' | '));
  console.log('\nv0.4 : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
