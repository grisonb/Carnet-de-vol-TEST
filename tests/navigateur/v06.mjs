// v0.6 dans Chromium, écran 390 px tactile (vols INVENTÉS) : bande d'heures + fenêtre de choix, liste
// « Libellés missions », suppression d'un vol par glissé (confirmation, totaux recalculés, Annuler identique),
// compteurs seulement pour le DH8D. Captures : tests/navigateur/captures/v06-*.png (non commitées).
// Usage : node tests/navigateur/v06.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

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
const cdp = await ctx.newCDPSession(p);
const cap = n => p.screenshot({ path: join(CAPT, `v06-${n}.png`) });

async function glisser(loc, dx, dy = 0, etapes = 10) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const x0 = b.x + b.width * 0.7, y0 = b.y + Math.min(b.height / 2, 40);
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= etapes; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + dx * i / etapes, y0 + dy * i / etapes) });
    await p.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(300);
}
const bande = () => p.$$eval('#h-strip div', l => l.map(d => [d.querySelector('span')?.textContent, d.querySelector('b')?.textContent]));
const totaux = async () => { await p.click('.tabs button[data-v="totaux"]'); const r = Object.fromEntries(await p.$$eval('#t-h .tline', l => l.map(x => [x.querySelector('span').textContent, x.querySelector('b').textContent]))); await p.click('.tabs button[data-v="carnet"]'); return r; };
const lireVol = id => p.evaluate(async id => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol', 1); r.onsuccess = () => ok(r.result); });
  const v = await new Promise(ok => { const q = db.transaction('vols').objectStore('vols').get(id); q.onsuccess = () => ok(q.result); });
  db.close(); return v ? JSON.stringify(v) : null;
}, id);

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v06.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  await p.click('.tabs button[data-v="carnet"]');

  console.log('Bande d\'heures');
  let b = await bande();
  verifier(JSON.stringify(b.map(x => x[0])) === '["CdB","Copi","DC","Instructeur","IFR","Nuit"]', 'par défaut : CdB, Copi, DC, Instructeur, IFR, Nuit');
  const T = await totaux();
  const correspond = { CdB: 'Commandant de bord', Copi: 'Copilote', DC: 'Double commande', Instructeur: 'Instructeur', IFR: 'IFR', Nuit: 'Nuit' };
  verifier(b.every(([lib, val]) => T[correspond[lib]] === val), 'valeurs = écran Totaux au chiffre près ' + JSON.stringify(b));
  await cap('01-accueil-bande');
  await p.click('#h-strip');
  verifier(await p.isVisible('#hs-modal') && await p.locator('#hs-gen button').count() === 10, 'toucher la bande : fenêtre « Heures affichées en haut » (10 choix généraux)');
  const types = await p.$$eval('#hs-typ button', l => l.map(x => x.textContent));
  verifier(types.includes('DH8D total') && types.includes('DH8D CdB') && types.includes('DH8D Copi') && types.includes('DR40') && !types.includes('SIMULATEURS'),
    'par type : un bouton par type, DH8D total / CdB / Copi ' + JSON.stringify(types));
  await p.locator('#hs-modal .mbox').screenshot({ path: join(CAPT, 'v06-02-choix-heures.png') });
  for (const c of ['tempsCdB', 'tempsCopi', 'tempsDC', 'tempsInst', 'tempsIFR', 'tempsNuit']) await p.click(`[data-hs="${c}"]`);
  verifier((await p.textContent('#h-strip')).includes('Touche ici pour choisir des heures à afficher'), 'rien de coché : « Touche ici pour choisir… »');
  for (const c of ['tempsNuit', 'typeCdB:DH8D', 'vols', 'atterrissages']) await p.click(`[data-hs="${c}"]`);
  await p.click('#hs-x');
  b = await bande();
  verifier(JSON.stringify(b.map(x => x[0])) === '["Nuit","DH8D CdB","Vols","Atterrissages"]', 'ordre d\'affichage = ordre coché');
  verifier(b[2][1] === T['Vols'] && b[3][1] === T['Atterrissages'], 'Vols et Atterrissages = Totaux');
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  verifier(JSON.stringify((await bande()).map(x => x[0])) === '["Nuit","DH8D CdB","Vols","Atterrissages"]', 'choix mémorisé après redémarrage');

  console.log('Supprimer un vol par glissé');
  const carte = p.locator('.flrow', { hasText: 'Dash 8 Q400' }).first();
  const id = await carte.locator('.flight').getAttribute('data-id');
  const avant = await lireVol(id);
  const totalAvant = await p.textContent('#h-total');
  const bandeAvant = JSON.stringify(await bande());
  const nbAvant = await p.locator('.flrow').count();
  await glisser(carte.locator('.flight'), -170);
  verifier(await p.isVisible('.flrow.ouvert .swdel'), 'glissé à gauche : « Supprimer » apparaît');
  await cap('03-carte-glissee');
  await p.tap('.flrow.ouvert .swdel');
  verifier(await p.isVisible('#fd-modal') && (await p.textContent('#fd-txt')).includes('→'), 'confirmation « Supprimer ce vol ? » avec date, trajet, durée');
  await p.locator('#fd-modal .mbox').screenshot({ path: join(CAPT, 'v06-04-confirmation.png') });
  await p.click('#fd-no');
  verifier(await p.locator('.flrow').count() === nbAvant && await lireVol(id) === avant, '« Non, garder » : rien ne change');
  await glisser(carte.locator('.flight'), -170);
  await p.tap('.flrow.ouvert .swdel');
  await p.click('#fd-yes');
  await p.waitForTimeout(200);
  verifier(await p.locator('.flrow').count() === nbAvant - 1 && await lireVol(id) === null, '« Oui, supprimer » : le vol disparaît');
  verifier(await p.textContent('#h-total') !== totalAvant, `TOTAL HdV recalculé (${totalAvant} -> ${await p.textContent('#h-total')})`);
  verifier(JSON.stringify(await bande()) !== bandeAvant, 'bande d\'heures recalculée ' + JSON.stringify(await bande()));
  const T2 = await totaux();
  verifier(T2['Vols'] !== T['Vols'] && T2['Temps bloc (total)'] !== T['Temps bloc (total)'], 'écran Totaux recalculé');
  const msg = await p.textContent('#toast');
  verifier(msg.includes('Vol supprimé') && msg.includes('Annuler'), `message « ${msg} »`);
  await p.tap('#toast .tbtn');
  await p.waitForTimeout(200);
  verifier(await lireVol(id) === avant && await p.locator('.flrow').count() === nbAvant && await p.textContent('#h-total') === totalAvant
    && JSON.stringify(await bande()) === bandeAvant, '« Annuler » : le vol revient exactement à l\'identique, totaux compris');

  console.log('Toucher et défilement');
  await p.tap(`.flight[data-id="${id}"]`);
  verifier(await p.isVisible('#v-saisie') && await p.textContent('#f-title') === 'Modifier le vol', 'toucher simple : le vol s\'ouvre');
  console.log('Supprimer depuis l\'écran du vol (même fonction)');
  await p.click('#del'); await p.click('#del-yes');
  await p.waitForTimeout(200);
  verifier((await p.textContent('#toast')).includes('Vol supprimé') && await lireVol(id) === null, 'bouton « Supprimer ce vol » : même suppression, avec Annuler');
  await p.tap('#toast .tbtn'); await p.waitForTimeout(200);
  verifier(await lireVol(id) === avant, 'Annuler : vol remis');
  const y0 = await p.evaluate(() => scrollY);
  await glisser(p.locator('.flrow .flight').nth(1), 0, -300, 12);
  verifier(await p.evaluate(() => scrollY) > y0 + 100 && await p.locator('.flrow.ouvert').count() === 0 && await p.isVisible('#v-carnet'), 'glissé vertical : la liste défile normalement');
  await p.evaluate(() => scrollTo(0, 0));

  console.log('Compteurs et libellés dans la saisie');
  await p.click('#fab');
  await p.click('#ac-cur'); await p.fill('#ac-q', 'xaaa'); await p.click('#ac-res .acitem');
  verifier(await p.isHidden('#feu-row') && await p.isHidden('#ctr-zone') && await p.locator('#ctrs .step').count() === 0, 'DR400 : aucun compteur');
  await p.locator('.c-mi').screenshot({ path: join(CAPT, 'v06-05-mission-non-dh8d.png') });
  await p.click('#ac-cur'); await p.fill('#ac-q', 'xzzb'); await p.click('#ac-res .acitem');
  verifier(await p.isVisible('#feu-row') && (await p.textContent('#fire-next')).includes('n°8'), 'DH8D : Feux (prochain : n°8 = plus grand n° importé + 1) et compteurs');
  await p.locator('.c-mi').screenshot({ path: join(CAPT, 'v06-06-mission-dh8d.png') });
  const liens = await p.$$eval('.mi-links .linkbtn', l => l.map(x => x.textContent));
  verifier(JSON.stringify(liens) === '["Libellés missions ›","Règles des pastilles ›"]', '« Libellés missions › » au-dessus de « Règles des pastilles › »');
  await p.click('#mlm-open');
  const libs = () => p.$$eval('#mlm-list .swfront', l => l.map(x => x.textContent));
  const tous = await libs();
  verifier(tous.length >= 3 && tous.includes('ENT. TEST'), `liste de tous les libellés (${tous.length})`);
  await p.fill('#mlm-q', 'ent');
  verifier((await libs()).every(x => x.toUpperCase().includes('ENT')), 'recherche dans les libellés');
  await p.fill('#mlm-q', '');
  const ligne = p.locator('#mlm-list .swfront', { hasText: 'ENT. TEST' });
  await glisser(ligne, -160);
  await p.locator('#ml-modal .mbox').screenshot({ path: join(CAPT, 'v06-07-libelles-glisse.png') });
  await p.tap('#mlm-list .swrow.ouvert .swdel');
  verifier(!(await libs()).includes('ENT. TEST') && (await p.textContent('#toast')).includes('« ENT. TEST » supprimée des suggestions'), 'Supprimer : le libellé disparaît, message avec Annuler');
  await p.tap('#toast .tbtn'); await p.waitForTimeout(150);
  verifier((await libs()).includes('ENT. TEST'), 'Annuler : le libellé revient');
  await glisser(ligne, -160); await p.tap('#mlm-list .swrow.ouvert .swdel');
  await p.click('#mlm-x');
  await p.fill('#m-q', 'ent');
  verifier(!(await p.$$eval('#m-res .swfront', l => l.map(x => x.textContent))).includes('ENT. TEST'), 'supprimé de la liste : plus proposé en suggestion');
  await p.click('#rules-open2');
  await p.click('[data-remettre="ENT. TEST"]');
  await p.click('#rm-x');
  await p.fill('#m-q', 'ent t');
  verifier((await p.$$eval('#m-res .swfront', l => l.map(x => x.textContent))).includes('ENT. TEST'), 'remis depuis les « Suggestions masquées » : de nouveau proposé');

  verifier(erreurs.length === 0, 'aucune erreur JavaScript ' + erreurs.join(' | '));
  console.log('\nv0.6 : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
