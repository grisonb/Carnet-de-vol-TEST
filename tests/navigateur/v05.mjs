// v0.5 dans Chromium, écran 390 px tactile (missions INVENTÉES) : glisser une suggestion de mission vers la
// gauche pour la supprimer, Annuler, suggestion masquée qui ne revient pas (rechargement, recalcul),
// vols inchangés, sauvegarde / restauration, « Remettre » depuis Plus, retapée avec « + ».
// Capture : tests/navigateur/captures/v05-*.png (non commitées).
// Usage : node tests/navigateur/v05.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const { chromium } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const cdp = await ctx.newCDPSession(p);

// Glissé tactile réel (touchstart / touchmove / touchend), à partir de 70 % de la largeur de l'élément
async function glisser(loc, dx, dy = 0, etapes = 10) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const x0 = b.x + b.width * 0.7, y0 = b.y + b.height / 2;
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x0, y0) });
  for (let i = 1; i <= etapes; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x0 + dx * i / etapes, y0 + dy * i / etapes) });
    await p.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);
}
const sugg = () => p.$$eval('#m-res .swfront', l => l.map(b => b.textContent));
const ouvertes = () => p.$$eval('#m-res .swrow.ouvert .swfront', l => l.map(b => b.textContent));
const lignes = () => p.locator('#ml input').count();
async function ouvrirSaisie(q = 'EN') {
  await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.fill('#m-q', q);
}

const H = '2026-01-01T00:00:00.000Z';
const vol = (id, date, missions) => ({ id, creeLe: H, modifieLe: H, source: 'saisie', ordre: 1, date, dep: 'LFMN', arr: 'LFMN', escales: [], hDep: '09:00', hArr: '10:00', mode: 'utc',
  avionId: 'av-1', indicatif: '', etiquettes: [], fonction: 'cdb', nomCdB: 'SELF', nomCopi: '', nomEleve: '', nomInstructeur: '', nomExaminateur: '',
  tempsTotal: 60, tempsSE: null, tempsME: null, tempsMP: null, tempsCdB: 60, tempsCopi: 0, tempsDC: 0, tempsInst: 0, tempsPICUS: 0, tempsExam: 0,
  tempsNuit: 0, tempsIFR: 0, tempsXC: 0, regleIFR: false, approches: 0, approcheType: '', attJour: 1, attNuit: 0, decJour: 0, decNuit: 0, simTemps: 0, simType: '',
  missions, feux: 0, compteurs: {}, remarques: '', notePerso: '', route: '' });
const VOLS = [vol('v3', '2026-01-03', ['ENT, ESSAI']), vol('v2', '2026-01-02', ['ENT. AUTRE', 'ENT, ESSAI']), vol('v1', '2026-01-01', ['ENTRETIEN TEST'])];
const AVION = { id: 'av-1', creeLe: H, modifieLe: H, immat: 'F-XQAA', sim: false, typeOACI: 'DR40', constructeur: 'ROBIN', modele: 'DR400', indicatif: '', nom: '', etiquettes: [], remarques: '', photo: null, equipage: 'SP', moteurs: 'SE', moteur: 'P', surface: 'L', train: 'tricycle', fstd: null };
const lireVols = () => p.evaluate(async () => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const v = await new Promise(ok => { const q = db.transaction('vols').objectStore('vols').getAll(); q.onsuccess = () => ok(q.result); });
  db.close();
  return v.sort((a, b) => a.id.localeCompare(b.id)).map(x => x.missions);
});

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ({ vols, avion }) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const tx = db.transaction(['vols', 'avions'], 'readwrite');
    for (const v of vols) tx.objectStore('vols').put(v);
    tx.objectStore('avions').put(avion);
    await new Promise(ok => { tx.oncomplete = ok; });
    db.close();
  }, { vols: VOLS, avion: AVION });
  await p.reload();
  await p.waitForSelector('body[data-pret="1"]');
  const volsAvant = await lireVols();

  console.log('Glissé à gauche');
  await ouvrirSaisie();
  verifier(JSON.stringify(await sugg()) === '["ENT, ESSAI","ENT. AUTRE","ENTRETIEN TEST"]', 'suggestions « EN » : 3 missions');
  const ligne = i => p.locator('#m-res .swfront').nth(i);
  if (process.env.DEBUG_GLISSE) {
    await p.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'click']) document.addEventListener(t, e => window.__ev.push(t + ':' + (e.target.className || e.target.tagName) + ':' + Math.round(e.clientX ?? e.touches?.[0]?.clientX ?? -1)), true); });
  }
  await glisser(ligne(0), -160);
  if (process.env.DEBUG_GLISSE) console.log(await p.evaluate(() => window.__ev.join(' | ')), await p.evaluate(() => document.querySelector('#m-res .swrow').className));
  verifier(JSON.stringify(await ouvertes()) === '["ENT, ESSAI"]' && await p.isVisible('#m-res .swrow.ouvert .swdel'), 'glissé à gauche : la suggestion se décale, « Supprimer » apparaît à droite');
  verifier(await lignes() === 0, 'un glissé ne choisit jamais la suggestion');
  await p.screenshot({ path: join(CAPT, 'v05-01-glisse-supprimer.png') });
  await p.locator('.c-mi').screenshot({ path: join(CAPT, 'v05-02-bloc-mission-glisse.png') });
  await glisser(ligne(1), -30);
  verifier((await ouvertes()).length === 0 && await lignes() === 0, 'glissé trop court : la ligne revient en place (et l\'autre se referme)');
  await glisser(ligne(0), -160);
  await glisser(ligne(1), -160);
  verifier(JSON.stringify(await ouvertes()) === '["ENT. AUTRE"]', 'une seule suggestion ouverte à la fois');
  await glisser(ligne(1), 160);
  verifier((await ouvertes()).length === 0 && await lignes() === 0, 'glissé vers la droite : la ligne se referme');
  await glisser(ligne(2), -160);
  await p.tap('#m-res .swrow.ouvert .swfront');
  verifier((await ouvertes()).length === 0 && await lignes() === 0, 'toucher une ligne ouverte la referme sans la choisir');

  console.log('Défilement vertical');
  const y0 = await p.evaluate(() => scrollY);
  await glisser(ligne(1), 0, -300, 12);
  const y1 = await p.evaluate(() => scrollY);
  verifier(y1 > y0 + 100 && (await ouvertes()).length === 0 && await lignes() === 0, `glissé vertical : la page défile (${y0} -> ${y1} px), rien n'est choisi`);
  await p.locator('#m-q').scrollIntoViewIfNeeded();

  console.log('Toucher simple');
  await p.tap('#m-res .swfront >> text=ENTRETIEN TEST');
  verifier(await lignes() === 1 && await p.inputValue('#ml input') === 'ENTRETIEN TEST', 'toucher simple : la suggestion est choisie');

  console.log('Supprimer puis Annuler');
  await p.fill('#m-q', 'EN');
  const essai = () => p.locator('#m-res .swfront', { hasText: 'ENT, ESSAI' });
  await glisser(essai(), -160);
  await p.tap('#m-res .swrow.ouvert .swdel');
  verifier(!(await sugg()).includes('ENT, ESSAI'), '« Supprimer » : la suggestion disparaît de la liste');
  const msg = await p.textContent('#toast');
  verifier(msg.includes('« ENT, ESSAI » supprimée des suggestions') && msg.includes('Annuler'), `message : « ${msg} »`);
  await p.screenshot({ path: join(CAPT, 'v05-03-message-annuler.png') });
  await p.tap('#toast .tbtn');
  verifier((await sugg()).includes('ENT, ESSAI') && await p.isHidden('#toast'), '« Annuler » remet la suggestion');
  await glisser(essai(), -160);
  await p.tap('#m-res .swrow.ouvert .swdel');
  const t0 = Date.now();
  await p.waitForSelector('#toast', { state: 'hidden', timeout: 6000 });
  const duree = Date.now() - t0;
  verifier(duree > 3000 && duree < 5500, `message affiché environ 4 s (${(duree / 1000).toFixed(1)} s)`);
  verifier(JSON.stringify(await sugg()) === '["ENTRETIEN TEST","ENT. AUTRE"]', 'suggestion supprimée, les autres restent');

  console.log('Après rechargement et recalcul');
  await p.click('#cancel');
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await ouvrirSaisie();
  verifier(!(await sugg()).includes('ENT, ESSAI'), 'après redémarrage : la suggestion ne revient pas');
  verifier(JSON.stringify(await lireVols()) === JSON.stringify(volsAvant), 'vols enregistrés inchangés (texte des missions intact)');
  // recalcul : un nouveau vol enregistré, les suggestions sont recalculées à partir des vols
  await p.fill('#m-q', 'aut'); await p.tap('#m-res .swfront');
  await p.fill('#f-t0', '1000'); await p.fill('#f-t1', '1100');
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])');
  await ouvrirSaisie();
  verifier(!(await sugg()).includes('ENT, ESSAI'), 'après recalcul (nouveau vol enregistré) : toujours masquée');
  await p.click('#cancel');

  console.log('Sauvegarde puis restauration');
  await p.click('.tabs button[data-v="plus"]');
  await p.click('#pl-save');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sv-dl')]);
  const fichier = join(CAPT, 'sauvegarde-v05.json');
  await dl.saveAs(fichier);
  const s = JSON.parse(readFileSync(fichier, 'utf8'));
  verifier(JSON.stringify(s.reglages.find(r => r.cle === 'missionsMasquees')?.valeur) === '["ENT, ESSAI"]', 'la sauvegarde contient la liste des suggestions masquées');
  await p.click('#ou-x');

  console.log('Remettre depuis Plus');
  await p.click('#rules-open');
  verifier((await p.textContent('#rm-masq')).includes('ENT, ESSAI'), 'Plus › Pastilles des missions : liste « Suggestions masquées »');
  await p.locator('#rules-modal .mbox').screenshot({ path: join(CAPT, 'v05-04-suggestions-masquees.png') });
  await p.click('[data-remettre="ENT, ESSAI"]');
  verifier((await p.textContent('#rm-masq')).includes('Aucune suggestion masquée'), '« Remettre » : la liste est vide');
  await p.click('#rm-x');
  await p.click('.tabs button[data-v="carnet"]');
  await ouvrirSaisie();
  verifier((await sugg()).includes('ENT, ESSAI'), 'la suggestion remise est de nouveau proposée');
  await p.click('#cancel');

  console.log('Restauration de la sauvegarde');
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-restore', fichier);
  await p.click('#rs-ok');
  await p.click('.tabs button[data-v="carnet"]');
  await ouvrirSaisie();
  verifier(!(await sugg()).includes('ENT, ESSAI'), 'après réimport de la sauvegarde : de nouveau masquée');

  console.log('Retapée avec « + »');
  await p.fill('#m-q', 'ent, essai');
  await p.click('#m-add');
  await p.fill('#m-q', 'EN');
  verifier((await sugg()).includes('ENT, ESSAI'), 'retapée avec « + » : redevient une suggestion');

  verifier(erreurs.length === 0, 'aucune erreur JavaScript ' + erreurs.join(' | '));
  console.log('\nv0.5 : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
