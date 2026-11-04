// Parcours complet dans Chromium en émulation téléphone Android (Pixel 7), sur des vols INVENTÉS :
// import FlyLog, saisie d'un vol, ajout d'avion, ajout de personne, mission avec feu, modification,
// suppression, sauvegarde puis restauration, fonctionnement hors ligne.
// Usage : node tests/navigateur/parcours.mjs   (captures dans tests/navigateur/captures/, non commitées)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const { chromium, devices } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const cap = (nom, plein = true) => p.screenshot({ path: join(CAPT, nom + '.png'), fullPage: plein });
const fichierFlyLog = join(CAPT, 'flylog-invente.csv');
writeFileSync(fichierFlyLog, fauxFlyLog(VOLS_INVENTES));

try {
  console.log('Chargement');
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  verifier(await p.textContent('#h-total') === '0h00', 'carnet vide au départ');

  console.log('Import FlyLog (fichier inventé)');
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', fichierFlyLog);
  await p.waitForSelector('#im-ok');
  verifier((await p.textContent('#ou-c')).includes('8 vols à ajouter'), 'résumé avant enregistrement : 8 vols');
  await cap('01-import-resume');
  await p.click('#im-ok');
  await p.waitForSelector('.ctab');
  verifier((await p.textContent('.ctab')).includes('7:15'), 'contrôle import : temps bloc 7:15');
  await p.click('#ou-x');
  await p.setInputFiles('#file-flylog', fichierFlyLog);
  await p.waitForSelector('#im-ok');
  verifier((await p.textContent('#ou-c')).includes('8 doublons refusés'), 'second import : 8 doublons refusés');
  verifier(await p.isDisabled('#im-ok'), 'second import : rien à enregistrer');
  await p.click('#im-no');

  console.log('Carnet');
  await p.click('.tabs button[data-v="carnet"]');
  verifier((await p.textContent('#h-total')).replace(/\s/g, ' ') === '7h15', 'TOTAL HdV = 7h15');
  verifier(await p.locator('.flight').count() === 8, '8 cartes de vol');
  const carteFeu = p.locator('.flight', { hasText: 'VILLAGE-TEST' });
  verifier((await carteFeu.textContent()).includes('Feu n°7'), 'pastille pleine « Feu n°7 »');
  verifier((await carteFeu.textContent()).includes('GAAR'), 'pastille de règle « GAAR »');
  verifier(await carteFeu.locator('svg.flag').count() === 3, 'drapeaux devant départ, escale et arrivée');
  const carteNuit = p.locator('.flight', { hasText: 'ENT. TEST' });
  verifier((await carteNuit.textContent()).includes('21/08/2025') && (await carteNuit.textContent()).includes('01h30 LOC → 02h50 LOC'), 'heures et date en LOC (vol importé, 23h30 UTC = 01h30 à Nice)');
  await cap('02-carnet', false);
  await p.fill('#q', 'f-xzza');
  await p.waitForTimeout(250);
  verifier(await p.locator('.flight').count() === 1, 'recherche par immatriculation');
  await p.fill('#q', '');
  await p.waitForTimeout(250);

  console.log('Nouveau vol');
  await p.click('#fab');
  verifier(await p.inputValue('#f-dep') === 'LFMN', 'départ pré-rempli = arrivée du dernier vol');
  verifier(await p.textContent('#ac-reg') === 'DHC8-400', 'avion pré-rempli = avion du dernier vol');
  await p.fill('#f-dep', ''); await p.type('#f-dep', 'lfmn');
  verifier(await p.evaluate(() => document.activeElement.id) === 'f-arr', 'passage automatique Départ -> Arrivée');
  await p.type('#f-arr', 'LFMD');
  verifier(await p.evaluate(() => document.activeElement.id) === 'f-t0', 'passage automatique Arrivée -> Bloc Départ');
  verifier((await p.textContent('#n-arr')).includes('Cannes'), 'nom complet du terrain affiché');
  await p.click('#tz-utc');
  await p.type('#f-t0', '2330');
  verifier(await p.evaluate(() => document.activeElement.id) === 'f-t1', 'passage automatique Bloc Départ -> Bloc Arrivée');
  await p.type('#f-t1', '0045');
  verifier(await p.textContent('#f-bloc') === '1h15', 'temps de vol 1h15 par-dessus minuit');
  verifier(!(await p.isHidden('#f-j1')), 'arrivée le lendemain signalée');

  console.log('Ajout d\'avion');
  await p.click('#ac-add');
  await p.fill('#a1-reg', 'fxtst');
  await p.click('#a1-go');
  await p.fill('#fi-oaci', 'DR40');
  verifier((await p.textContent('#fi-tl')) === 'ROBIN • DR40 • DR400', 'type OACI reconnu : ROBIN • DR40 • DR400');
  await p.fill('#fi-ind', 'tst1'); await p.fill('#fi-nm', 'Avion Test');
  await cap('03-fiche-avion');
  await p.click('#fi-save');
  verifier(await p.textContent('#ac-reg') === 'F-XTST', 'nouvel avion choisi pour le vol');
  verifier(await p.inputValue('#f-mis') === 'TST1', 'indicatif habituel repris');
  verifier((await p.textContent('#ac-col')).includes('Mono-pilote SE'), 'colonne EASA Mono-pilote SE');
  await p.fill('#ac-q', 'avion test');
  verifier(await p.locator('#ac-res .acitem').count() === 1, 'recherche d\'avion par nom');
  await p.fill('#ac-q', '');
  await p.click('#ac-all');
  await cap('04-mes-avions', false);
  await p.click('#sf-main');
  verifier(!(await p.isHidden('#sf-menu')) && (await p.textContent('#sf-main')) === '×', 'menu + -> Ajouter un simulateur / un avion');
  await p.click('#sf-veil'); await p.click('#fl-x');

  console.log('Escale, IFR, approches');
  await p.click('#via-add');
  await p.type('#vm-icao', 'LFKJ');
  verifier((await p.textContent('#vm-name')).includes('Ajaccio'), 'escale : nom complet affiché');
  await p.click('#vm-ok');
  verifier((await p.textContent('#via-list')).includes('LFKJ'), 'escale ajoutée');
  verifier(await p.textContent('#s-attJour') !== null, 'compteurs d\'atterrissages');
  const attTotal = Number(await p.textContent('#s-attJour')) + Number(await p.textContent('#s-attNuit'));
  verifier(attTotal === 2, 'atterrissages = escale + dernier atterrissage');
  verifier(await p.textContent('#s-attNuit') === '1', 'dernier atterrissage (00h45 UTC) classé de nuit');
  verifier(await p.inputValue('#c-nuit') === '1h15', 'temps de nuit calculé');
  await p.click('#f-ifr');
  verifier(await p.inputValue('#c-ifr') === '1h15', 'IFR : tout le vol en IFR');
  await p.click('[data-s="approches"][data-d="1"]');

  console.log('Ajout de personne');
  await p.click('#f-fn button[data-r="cdb"]');
  await p.click('#p-add');
  await p.fill('#pm-tri', 'xyz');
  await p.click('#pm-ok');
  verifier(await p.inputValue('#f-copi') === 'XYZ', 'personne ajoutée et choisie');
  await p.click('#f-fn button[data-r="copi"]');
  verifier(await p.textContent('#f-copi-l') === 'CdB', 'le champ suit la fonction (Copi. -> CdB)');
  await p.click('#f-fn button[data-r="cdb"]');
  verifier(await p.textContent('#f-copi-l') === 'Copi', 'le champ suit la fonction (CdB -> Copi)');

  console.log('Mission avec feu');
  await p.fill('#m-q', 'rodez');
  await p.click('#feu-p');
  verifier(await p.inputValue('#ml input >> nth=0') === 'FEU n°8 RODEZ', 'FEU +1 : « FEU n°8 RODEZ » (numéro suivant)');
  await p.click('#feu-p');
  verifier(await p.locator('#ml input').count() === 2, 'FEU +1 sans texte : nouvelle ligne');
  verifier(await p.evaluate(() => document.activeElement.value) === 'FEU n°9 ', 'curseur placé dans la nouvelle ligne');
  await p.click('#feu-m');
  verifier(await p.locator('#ml input').count() === 1 && await p.textContent('#s-feu') === '1', 'FEU −1 enlève le dernier feu');
  await p.fill('#m-q', 'en');
  await p.click('#m-res [data-mv2="ENT. TEST"]');
  verifier(await p.locator('#ml input').count() === 2, 'mission choisie dans les suggestions');
  verifier((await p.textContent('#m-prev')).includes('LFMN-LFKJ-LFMD • FEU n°8 RODEZ + ENT. TEST'), 'aperçu « Remarque du carnet »');
  await p.click('#ctr-open');
  await p.click('#ctr-panel [data-tg="2"]');
  verifier(await p.locator('#ctrs .step').count() === 3, 'compteur supplémentaire affiché (choix des compteurs)');
  await p.click('[data-c="largCdbDash"][data-d="1"]'); await p.click('[data-c="largCdbDash"][data-d="1"]');
  verifier((await p.textContent('#rec-x')).includes('XYZ'), 'temps du carnet : nom du copi');
  verifier((await p.textContent('#r-col-l')) === 'Mono-pilote SE', 'temps du carnet : colonne avion');
  await cap('05-saisie-complete');
  await p.click('#save');
  await p.waitForSelector('#v-carnet:not([hidden])');
  const nouvelle = p.locator('.flight').first();
  const txt = await nouvelle.textContent();
  verifier(txt.includes('Feu n°8') && txt.includes('Copi XYZ') && txt.includes('Entraînement') && txt.includes('2 lrg'), 'carte du nouveau vol : pastilles');
  verifier(txt.includes('23h30 UTC → 00h45 UTC (J+1)'), 'heures UTC avec (J+1)');
  verifier((await p.textContent('#h-total')).replace(/\s/g, ' ') === '8h30', 'TOTAL HdV mis à jour');
  await cap('06-carnet-apres-saisie', false);

  console.log('Nouveau vol : pré-remplissage');
  await p.click('#fab');
  verifier(await p.inputValue('#f-dep') === 'LFMD' && await p.textContent('#ac-reg') === 'F-XTST' && await p.inputValue('#f-copi') === 'XYZ', 'pré-rempli : départ, avion, copi du dernier vol');
  await p.click('#cancel');

  console.log('Modification et suppression');
  await nouvelle.click();
  verifier(await p.textContent('#f-title') === 'Modifier le vol', 'le vol s\'ouvre en modification');
  verifier(await p.inputValue('#c-nuit') === '1h15' && await p.textContent('#f-bloc') === '1h15', 'valeurs enregistrées affichées');
  await p.click('#del');
  await p.click('#del-no');
  verifier(await p.isHidden('#del-confirm'), 'suppression annulée');
  await p.click('#del'); await p.click('#del-yes');
  await p.waitForSelector('#v-carnet:not([hidden])');
  verifier(await p.locator('.flight').count() === 8, 'vol supprimé après confirmation');

  console.log('Totaux');
  await p.click('.tabs button[data-v="totaux"]');
  verifier((await p.textContent('#t-e')).includes('BOMBING'), 'totaux par étiquette');
  await cap('07-totaux');

  console.log('Sauvegarde puis restauration');
  await p.click('.tabs button[data-v="plus"]');
  await p.click('#pl-save');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sv-dl')]);
  const fichierSauvegarde = join(CAPT, 'sauvegarde-test.json');
  await dl.saveAs(fichierSauvegarde);
  const s = JSON.parse(readFileSync(fichierSauvegarde, 'utf8'));
  verifier(s.vols.length === 8 && s.avions.length === 7, 'sauvegarde complète (vols et avions)');
  await p.click('#ou-x');
  await p.setInputFiles('#file-restore', fichierSauvegarde);
  await p.click('#rs-ok');
  await p.click('.tabs button[data-v="carnet"]');
  verifier(await p.locator('.flight').count() === 8, 'restauration identique');

  console.log('PDF');
  await p.click('.tabs button[data-v="plus"]');
  await p.click('#pl-pdf');
  await p.click('#xp-go');
  await p.waitForSelector('#xp-fin:not([hidden])');
  const [pdf] = await Promise.all([p.waitForEvent('download'), p.click('#xp-dl')]);
  verifier((await pdf.suggestedFilename()).endsWith('.pdf'), 'PDF créé et téléchargé');
  await p.click('#ou-x');

  console.log('Hors ligne');
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 });
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]', { timeout: 10000 });
  verifier(await p.locator('.flight').count() === 8, 'l\'app s\'ouvre sans réseau, avec les vols');
  await ctx.setOffline(false);

  verifier(erreurs.length === 0, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nParcours réussi.');
} catch (e) {
  console.error(e.message);
  await cap('zz-echec').catch(() => {});
  if (erreurs.length) console.error('Erreurs page :', erreurs);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
