// v0.20 (R58) dans Chromium, écran 390 px (vols et avions INVENTÉS, aucun réseau extérieur) : à La Réunion, départ FMEP ->
// arrivée par défaut FMEP ; ailleurs LFTW comme avant ; l'arrivée suit le départ tant que le pilote n'y a pas touché ;
// vol de fin d'après-midi FMEP -> FMEP (nuit EASA, atterrissage de nuit) ; vol suivant après une arrivée FMEP ;
// saisie de FMEP / FMEE avec et sans le bouton « LF » (départ, arrivée, terrain intermédiaire).
// Captures : tests/navigateur/captures/v020-*.png (non commitées). Usage : node tests/navigateur/v020.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const avion = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Modele essai', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP',
  moteurs: 'ME', moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H };
const srv = await serveur();
const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Indian/Reunion' });
await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
const recharger = async () => { await p.reload(); await p.waitForSelector('body[data-pret="1"]'); };
const nouveauVol = async () => { await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(100); };
const fermer = async () => { await p.click('#cancel'); if (await p.isVisible('#ab-modal')) await p.click('#ab-yes'); await p.waitForSelector('#v-carnet:not([hidden])'); };
const terrains = () => p.evaluate(() => [document.getElementById('f-dep').value, document.getElementById('f-arr').value].join(' → '));
const taper = async (sel, texte) => { await p.tap(sel); await attendre(150); await p.keyboard.type(texte); await attendre(50); };
const effacer = async n => { for (let i = 0; i < n; i++) await p.keyboard.press('Backspace'); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async a => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction('avions', 'readwrite'); t.objectStore('avions').put(a); await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, avion);
  await recharger();

  console.log('R58 : arrivée par défaut selon le départ');
  await nouveauVol();
  verifier(await terrains() === 'LFTW → LFTW', 'départ LFTW → arrivée LFTW (comme avant)');
  await taper('#f-dep', 'FMEP');
  verifier(await terrains() === 'FMEP → FMEP', 'départ changé à la main en FMEP → l\'arrivée devient FMEP');
  verifier(await p.textContent('#n-arr') === 'Saint-Pierre Pierrefonds', '  nom affiché : Saint-Pierre Pierrefonds');
  await attendre(100);
  const s = await p.$eval('#f-arr', e => [e.selectionStart, e.selectionEnd, document.activeElement === e]);
  verifier(s[0] === 0 && s[1] === 4 && s[2], '  le curseur est sur l\'arrivée, FMEP sélectionné (on peut taper directement)');
  await taper('#f-dep', 'LFMN');
  verifier(await terrains() === 'LFMN → LFTW', 'départ LFMN → l\'arrivée revient à LFTW');
  await taper('#f-dep', 'FMEE');
  verifier(await terrains() === 'FMEE → LFTW', 'départ FMEE (Roland Garros) → arrivée LFTW (seul FMEP change la règle)');
  await fermer();

  console.log('Vol FMEP → FMEP de fin d\'après-midi (heures locales, UTC+4)');
  await nouveauVol();
  await taper('#f-dep', 'FMEP');
  await p.fill('#f-date', '2026-11-20'); await p.dispatchEvent('#f-date', 'input');
  await taper('#f-t0', '1830'); await taper('#f-t1', '1945');
  const nuit = await p.inputValue('#c-nuit'), attJ = await p.textContent('#s-attJour'), attN = await p.textContent('#s-attNuit');
  verifier(await terrains() === 'FMEP → FMEP' && await p.textContent('#f-bloc') === '1h15', 'FMEP → FMEP, 18h30 → 19h45 locale : bloc 1h15');
  verifier(/^0h4[01]$/.test(nuit), `  nuit ${nuit} (fin du crépuscule civil à 19h05 locale)`);
  verifier(attJ === '0' && attN === '1', `  atterrissage de nuit (Att. Jour ${attJ} / Nuit ${attN})`);
  await p.screenshot({ path: join(CAPT, 'v020-01-vol-fmep-nuit.png') });
  await p.click('#save'); await p.waitForSelector('#v-carnet:not([hidden])');
  const enr = await p.evaluate(async () => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const v = await new Promise(ok => { const r = db.transaction('vols').objectStore('vols').getAll(); r.onsuccess = () => ok(r.result); }); db.close(); return v;
  });
  verifier(enr.length === 1 && enr[0].dep === 'FMEP' && enr[0].arr === 'FMEP' && enr[0].hDep === '14:30' && enr[0].hArr === '15:45' && enr[0].attNuit === 1,
    `  enregistré en UTC : ${enr[0]?.hDep} → ${enr[0]?.hArr}, nuit ${enr[0]?.tempsNuit} min, 1 atterrissage de nuit`);

  console.log('Vol suivant après une arrivée FMEP');
  await recharger();
  await nouveauVol();
  verifier(await terrains() === 'FMEP → FMEP', 'nouveau vol : départ FMEP, arrivée FMEP');
  await p.screenshot({ path: join(CAPT, 'v020-02-vol-suivant-fmep.png') });
  // Arrivée changée à la main, puis départ changé : mon arrivée est gardée
  await taper('#f-arr', 'FMEE');
  await taper('#f-dep', 'LFTW');
  verifier(await terrains() === 'LFTW → FMEE', 'arrivée changée à la main (FMEE) puis départ changé (LFTW) : FMEE gardé');
  await taper('#f-dep', 'FMEP');
  verifier(await terrains() === 'FMEP → FMEE', '  puis départ FMEP : FMEE toujours gardé');
  await fermer();
  // Le vol enregistré n'est jamais modifié par la règle
  await p.click('#list .flight'); await p.waitForSelector('#v-saisie:not([hidden])');
  await taper('#f-dep', 'LFMN');
  verifier(await terrains() === 'LFMN → FMEP', 'vol déjà enregistré : changer le départ ne touche pas à son arrivée');
  await fermer();

  console.log('Saisie de FMEP / FMEE avec le bouton « LF » activé');
  await nouveauVol();
  await p.click('#tz-lf');
  verifier(await p.getAttribute('#tz-lf', 'aria-pressed') === 'true', 'bouton « LF » activé');
  // Case qui contient déjà FMEP (tout est sélectionné) : un retour arrière libère la case, puis FMEP
  await p.tap('#f-dep'); await attendre(150); await effacer(1); await p.keyboard.type('FMEP');
  verifier(await p.inputValue('#f-dep') === 'FMEP', 'départ : 1 retour arrière puis FMEP → FMEP');
  // Taper « TW » (2 lettres) depuis FMEP : LFTW, et l'arrivée revient à LFTW
  await taper('#f-dep', 'TW');
  verifier(await terrains() === 'LFTW → LFTW', 'départ : « TW » → LFTW, arrivée LFTW');
  // Case LF : 2 retours arrière (les 2 lettres puis « LF »), puis FMEP
  await p.tap('#f-dep'); await attendre(150); await effacer(2); await p.keyboard.type('FMEP');
  verifier(await terrains() === 'FMEP → FMEP', 'départ LFTW : 2 retours arrière puis FMEP → FMEP, arrivée FMEP');
  await p.tap('#f-arr'); await attendre(150); await effacer(1); await p.keyboard.type('FMEE');
  verifier(await p.inputValue('#f-arr') === 'FMEE', 'arrivée : 1 retour arrière puis FMEE → FMEE');
  await p.tap('#f-arr'); await attendre(150); await effacer(1); await p.keyboard.type('FMEP');
  verifier(await p.inputValue('#f-arr') === 'FMEP', 'arrivée : 1 retour arrière puis FMEP → FMEP');
  // Sans retour arrière, « LF » reste devant (règle R48) : on le voit tout de suite à l'écran
  await p.tap('#f-arr'); await attendre(150); await p.keyboard.type('FMEP');
  console.log(`  (pour info : sans retour arrière, taper FMEP donne « ${await p.inputValue('#f-arr')} »)`);
  await p.tap('#f-arr'); await attendre(150); await effacer(3); await p.keyboard.type('FMEP');
  verifier(await p.inputValue('#f-arr') === 'FMEP', '  corrigé : retours arrière puis FMEP → FMEP');
  // Terrain intermédiaire : la case vide affiche « LF »
  await p.tap('#via-add'); await p.waitForSelector('#via-modal:not([hidden])'); await attendre(200);
  verifier(await p.inputValue('#vm-icao') === 'LF', 'terrain intermédiaire : « LF » déjà écrit');
  await effacer(1); await p.keyboard.type('FMEE');
  verifier(await p.inputValue('#vm-icao') === 'FMEE', '  1 retour arrière puis FMEE → FMEE');
  await p.screenshot({ path: join(CAPT, 'v020-03-escale-fmee-lf.png') });
  await p.click('#vm-ok');
  verifier((await p.textContent('#via-list')).includes('FMEE'), '  escale FMEE ajoutée');
  await fermer();

  console.log('Saisie de FMEP / FMEE sans le bouton « LF »');
  await nouveauVol();
  await p.click('#tz-lf');
  verifier(await p.getAttribute('#tz-lf', 'aria-pressed') === 'false', 'bouton « LF » désactivé');
  await taper('#f-dep', 'FMEE');
  await taper('#f-arr', 'FMEP');
  verifier(await terrains() === 'FMEE → FMEP', 'départ FMEE, arrivée FMEP tapés directement');
  await p.tap('#via-add'); await p.waitForSelector('#via-modal:not([hidden])'); await attendre(200);
  await p.keyboard.type('FMEP'); await p.click('#vm-ok');
  verifier((await p.textContent('#via-list')).includes('FMEP'), 'terrain intermédiaire FMEP tapé directement');
  await p.screenshot({ path: join(CAPT, 'v020-04-sans-lf.png') });
  await fermer();

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.20 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v020-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
