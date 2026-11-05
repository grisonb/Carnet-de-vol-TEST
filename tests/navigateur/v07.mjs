// v0.7 dans Chromium, écran 390 px (vols INVENTÉS) : bande d'heures juste sous le TOTAL HdV, ordre réglable
// avec ↑ ↓ (mémorisé, sauvegarde / restauration), Feux et Largages CdB Dash = écran Totaux.
// Captures : tests/navigateur/captures/v07-*.png (non commitées). Usage : node tests/navigateur/v07.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

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
const bande = () => p.$$eval('#h-strip div', l => l.map(d => d.querySelector('span')?.textContent));
const valeurs = () => p.$$eval('#h-strip div', l => Object.fromEntries(l.map(d => [d.querySelector('span')?.textContent, d.querySelector('b')?.textContent])));
const ordre = () => p.$$eval('#hs-ordre .prow', l => l.map(x => x.querySelector('.pname').textContent));
const fleches = () => p.$$eval('#hs-ordre .prow', l => l.map(x => [...x.querySelectorAll('.arrows button')].map(b => b.disabled ? '-' : '+').join('')));

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v07.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  await p.click('.tabs button[data-v="carnet"]');

  console.log('Position de la bande');
  const y = async s => (await p.locator(s).boundingBox()).y;
  verifier(await y('#h-total') < await y('#h-strip') && await y('#h-strip') < await y('#h-quick'), 'bande juste sous le TOTAL HdV, au-dessus de 3 / 7 / 30 jours');
  await p.screenshot({ path: join(CAPT, 'v07-01-accueil.png') });

  console.log('Ordre d\'affichage');
  await p.click('#h-strip');
  verifier((await p.textContent('#hs-modal .hint')).includes('Range-les avec les flèches ↑ ↓'), 'texte d\'aide');
  verifier(JSON.stringify(await ordre()) === '["CdB","Copi","DC","Instructeur","IFR","Nuit"]', 'section « Ordre d\'affichage » : les valeurs cochées, une par ligne');
  const f0 = await fleches();
  verifier(f0[0] === '-+' && f0[f0.length - 1] === '+-' && f0.slice(1, -1).every(x => x === '++'), '↑ désactivée en première ligne, ↓ en dernière');
  verifier((await p.$$eval('#hs-ordre .prow b', l => l.map(x => x.textContent))).every(Boolean), 'valeur affichée à droite de chaque ligne');
  await p.click('#hs-ordre [data-hsmv="0"][data-d="1"]');
  verifier(JSON.stringify(await ordre()) === '["Copi","CdB","DC","Instructeur","IFR","Nuit"]', '↓ : CdB descend d\'une ligne');
  await p.click('#hs-ordre [data-hsmv="5"][data-d="-1"]');
  verifier(JSON.stringify(await ordre()) === '["Copi","CdB","DC","Instructeur","Nuit","IFR"]', '↑ : Nuit monte d\'une ligne');
  await p.click('[data-hs="feux"]'); await p.click('[data-hs="largCdbDash"]');
  verifier(JSON.stringify((await ordre()).slice(-2)) === '["Feux","Largages CdB Dash"]', 'nouvelles valeurs cochées ajoutées à la fin');
  await p.locator('#hs-modal .mbox').screenshot({ path: join(CAPT, 'v07-02-fenetre-choix.png') });
  await p.click('#hs-x');
  const attendu = '["Copi","CdB","DC","Instructeur","Nuit","IFR","Feux","Largages CdB Dash"]';
  verifier(JSON.stringify(await bande()) === attendu, 'la bande suit cet ordre');
  await p.screenshot({ path: join(CAPT, 'v07-03-accueil-reordonne.png') });

  console.log('Feux et Largages CdB Dash = écran Totaux');
  const v = await valeurs();
  await p.click('.tabs button[data-v="totaux"]');
  const T = Object.fromEntries(await p.$$eval('#t-m .tline', l => l.map(x => [x.querySelector('span').textContent, x.querySelector('b').textContent])));
  await p.click('.tabs button[data-v="carnet"]');
  verifier(v['Feux'] === T['Feux'] && v['Largages CdB Dash'] === T['Largages CdB Dash'] && /^\d+$/.test(v['Feux']),
    `Feux ${v['Feux']} et Largages CdB Dash ${v['Largages CdB Dash']} : nombres identiques à l'écran Totaux`);

  console.log('Mémorisé, sauvegarde et restauration');
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  verifier(JSON.stringify(await bande()) === attendu, 'ordre conservé après redémarrage');
  await p.click('.tabs button[data-v="plus"]');
  await p.click('#pl-save');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sv-dl')]);
  const fichier = join(CAPT, 'sauvegarde-v07.json');
  await dl.saveAs(fichier);
  verifier(JSON.stringify(JSON.parse(readFileSync(fichier, 'utf8')).reglages.find(r => r.cle === 'bandeHeures').valeur) ===
    '["tempsCopi","tempsCdB","tempsDC","tempsInst","tempsNuit","tempsIFR","feux","largCdbDash"]', 'la sauvegarde contient l\'ordre');
  await p.click('#ou-x');
  await p.click('.tabs button[data-v="carnet"]');
  await p.click('#h-strip'); await p.click('#hs-ordre [data-hsmv="0"][data-d="1"]'); await p.click('#hs-x');
  verifier(JSON.stringify(await bande()) !== attendu, 'ordre modifié après la sauvegarde');
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-restore', fichier);
  await p.click('#rs-ok');
  await p.click('.tabs button[data-v="carnet"]');
  verifier(JSON.stringify(await bande()) === attendu, 'restauration : l\'ordre sauvegardé revient');

  verifier(erreurs.length === 0, 'aucune erreur JavaScript ' + erreurs.join(' | '));
  console.log('\nv0.7 : tout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
