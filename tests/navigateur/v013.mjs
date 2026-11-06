// v0.13 dans Chromium, écran 390 px (600 vols INVENTÉS, un par jour) : la liste du Carnet garde sa place quand on
// ouvre / referme un vol (bouton Annuler, flèche retour, autre onglet) ; « Voir dans le carnet » sur un résultat de
// recherche (terrain ou date) ouvre la liste complète sur ce vol, avec les vols voisins ; « ↑ Dernier vol » et l'onglet
// Carnet ramènent en haut. Captures : tests/navigateur/captures/v013-*.png (non commitées). Usage : node tests/navigateur/v013.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const N = 600, SPECIAL = 400; // le vol n°400 (date 2025-02-04) est le seul à partir de LFKJ
const jour = i => new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10);
const lignes = [];
for (let i = 0; i < N; i++) {
  lignes.push({ DATE: jour(i), DEPARTURE_AIRPORT: i === SPECIAL ? 'LFKJ' : 'LFMN', ARRIVAL_AIRPORT: 'LFMD', AIRCRAFT_TYPE: 'DR40',
    AIRCRAFT_REGISTRATION: 'FXZZA', DURATION_BLOCK: '1:00', LDGS_DAY: '1', TIME_BLOCK_START: '10:00', TIME_BLOCK_END: '11:00',
    DURATION_PIC: '1:00', NAME_PIC: 'SELF', NAME_COPILOT: 'ZZZ', REMARKS: 'ESSAI ' + i, FEU: '0', LARGAGES_CDB_DASH: '0', TAGS: '' });
}
const fichier = join(CAPT, 'flylog-v013.csv');
writeFileSync(fichier, fauxFlyLog(lignes));
const dateFr = iso => iso.split('-').reverse().join('/');

const { chromium } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
// Premier vol visible : sa date et sa position à l'écran
const visible = () => p.evaluate(() => {
  for (const c of document.querySelectorAll('#list .flight')) {
    const r = c.getBoundingClientRect();
    if (r.bottom > 0) return { id: c.dataset.id, date: c.querySelector('.fl-date').textContent, haut: Math.round(r.top) };
  }
  return null;
});
const defiler = async (n, dy = 900) => { for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await attendre(120); } await attendre(400); };
const boutonHaut = () => p.isVisible('#top-btn');

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', fichier);
  await p.waitForSelector('#im-ok', { timeout: 60000 }); await p.click('#im-ok'); await p.waitForSelector('.ctab', { timeout: 60000 }); await p.click('#ou-x');
  await p.click('.tabs button[data-v="carnet"]');
  await p.waitForSelector('#list .flight');
  const premier = (await visible()).date;
  verifier(premier === dateFr(jour(N - 1)), `en haut : le dernier vol (${premier})`);
  verifier(!(await boutonHaut()), '« ↑ Dernier vol » caché en haut de la liste');

  console.log('La liste garde sa place');
  await p.mouse.move(195, 500);
  await defiler(14);
  const ici = await visible();
  verifier(await p.evaluate(() => window.scrollY) > 5000 && await boutonHaut(), `loin dans la liste (${ici.date}) : « ↑ Dernier vol » apparaît`);
  const fab = await p.$eval('#fab', e => e.getBoundingClientRect().toJSON()), bh = await p.$eval('#top-btn', e => e.getBoundingClientRect().toJSON());
  verifier(bh.right < fab.left && bh.left >= 0 && fab.right <= 390, '« ↑ Dernier vol » à gauche, « + Nouveau vol » à droite, sans se chevaucher');
  await p.screenshot({ path: join(CAPT, 'v013-01-loin-dans-la-liste.png') });
  const cible = await p.evaluate(() => [...document.querySelectorAll('#list .flight')].find(c => c.getBoundingClientRect().top > 200).dataset.id);
  await p.click(`.flight[data-id="${cible}"]`);
  await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#cancel');
  await p.waitForSelector('#v-carnet:not([hidden])');
  const apres = await visible();
  verifier(apres.id === ici.id && Math.abs(apres.haut - ici.haut) <= 2, `vol ouvert puis Annuler : même place (${apres.date})`);
  await p.click(`.flight[data-id="${cible}"]`);
  await p.waitForSelector('#v-saisie:not([hidden])');
  await p.goBack();
  await p.waitForSelector('#v-carnet:not([hidden])');
  const apres2 = await visible();
  verifier(apres2.id === ici.id && Math.abs(apres2.haut - ici.haut) <= 2, 'vol ouvert puis flèche retour Android : même place');
  await p.click('.tabs button[data-v="totaux"]'); await attendre(300);
  await p.click('.tabs button[data-v="carnet"]'); await attendre(300);
  const apres3 = await visible();
  verifier(apres3.id === ici.id && Math.abs(apres3.haut - ici.haut) <= 2, 'onglet Totaux puis Carnet : même place');
  // Une modification pendant qu'on regarde la liste (suppression d'un autre vol par glissé) : la place reste
  await p.click(`.flight[data-id="${cible}"]`); await p.waitForSelector('#v-saisie:not([hidden])');
  const champ = await p.$('#f-rem, textarea');
  if (champ) { await champ.fill('ESSAI MODIFIÉ'); }
  await p.click('.save');
  await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(400);
  const apres4 = await visible();
  verifier(apres4.id === ici.id && Math.abs(apres4.haut - ici.haut) <= 2, 'vol modifié et enregistré : même place');

  console.log('Revenir au dernier vol en un geste');
  await p.click('#top-btn'); await attendre(300);
  verifier((await visible()).date === premier && await p.evaluate(() => window.scrollY) === 0 && !(await boutonHaut()), '« ↑ Dernier vol » : retour en haut, sur le dernier vol');
  await defiler(8);
  await p.click('.tabs button[data-v="carnet"]'); await attendre(300);
  verifier((await visible()).date === premier, 'toucher l\'onglet Carnet quand on y est : retour en haut aussi');

  console.log('Voir dans le carnet (recherche par terrain)');
  await p.click('#q-open'); await p.fill('#q', 'LFKJ'); await attendre(500);
  verifier((await p.$$('#list .flight')).length === 1 && await p.isVisible('.fl-voir'), 'recherche LFKJ : 1 vol, avec « Voir dans le carnet › »');
  const largeur = await p.$eval('.fl-voir', e => e.getBoundingClientRect().right);
  verifier(largeur <= 390, '  rien ne dépasse à 390 px');
  await p.screenshot({ path: join(CAPT, 'v013-02-recherche.png') });
  await p.click('.fl-voir'); await attendre(600);
  const voisin = await p.evaluate(() => {
    const cartes = [...document.querySelectorAll('#list .flight')], i = cartes.findIndex(c => c.classList.contains('fl-vu'));
    const d = c => c && c.querySelector('.fl-date').textContent;
    return { recherche: !document.getElementById('q').hidden, q: document.getElementById('q').value, i, vise: d(cartes[i]), avant: d(cartes[i - 1]), apres: d(cartes[i + 1]),
      haut: i >= 0 ? Math.round(cartes[i].getBoundingClientRect().top) : null, voir: !!document.querySelector('.fl-voir') };
  });
  verifier(!voisin.recherche && voisin.q === '' && !voisin.voir, 'la recherche est fermée, liste complète');
  verifier(voisin.vise === dateFr(jour(SPECIAL)) && voisin.haut > 0 && voisin.haut < 300, `liste ouverte sur le vol trouvé (${voisin.vise}), surligné, en haut de l'écran`);
  verifier(voisin.avant === dateFr(jour(SPECIAL + 1)) && voisin.apres === dateFr(jour(SPECIAL - 1)),
    `vols voisins : ${voisin.avant} au-dessus, ${voisin.apres} en dessous`);
  await p.screenshot({ path: join(CAPT, 'v013-03-voir-dans-le-carnet.png') });
  verifier(await boutonHaut(), '« ↑ Dernier vol » disponible');
  // Remonter vers les vols plus récents : ils se chargent au-dessus sans faire sauter l'écran
  const avantMontee = await p.$eval(`.flight.fl-vu, .flight[data-id]`, () => document.querySelectorAll('#list .flight').length);
  await defiler(12, -900);
  const montee = await p.evaluate(() => ({ n: document.querySelectorAll('#list .flight').length, y: window.scrollY }));
  verifier(montee.n > avantMontee, `en remontant, les vols plus récents se chargent au-dessus (${avantMontee} → ${montee.n} cartes)`);
  if (await p.isVisible('#list-debut')) {
    // Arrivé tout en haut de la fenêtre : la carte regardée ne doit pas bouger quand les vols plus récents s'ajoutent
    const fixe = await p.evaluate(() => {
      window.scrollTo(0, 0);
      const c = document.querySelector('#list .flight');
      return { id: c.dataset.id, haut: Math.round(c.getBoundingClientRect().top), n: document.querySelectorAll('#list .flight').length };
    });
    await attendre(600);
    const fixe2 = await p.evaluate(id => ({ haut: Math.round(document.querySelector(`.flight[data-id="${id}"]`).getBoundingClientRect().top),
      n: document.querySelectorAll('#list .flight').length }), fixe.id);
    verifier(fixe2.n > fixe.n && Math.abs(fixe2.haut - fixe.haut) <= 2, `arrivé en haut : vols plus récents ajoutés au-dessus (${fixe.n} → ${fixe2.n}), l'écran ne saute pas`);
  }
  await p.click('#top-btn'); await attendre(400);
  verifier((await visible()).date === premier, '« ↑ Dernier vol » depuis la liste ouverte sur un vieux vol : retour au dernier vol');
  verifier(await p.isHidden('#list-debut'), '  plus de bouton « Vols plus récents » en haut');

  console.log('Voir dans le carnet (recherche par date)');
  const date = dateFr(jour(123));
  await p.click('#q-open'); await p.fill('#q', date); await attendre(500);
  await p.click('.fl-voir'); await attendre(600);
  const v2 = await p.evaluate(() => { const c = document.querySelector('.flight.fl-vu'); return c && { d: c.querySelector('.fl-date').textContent, h: c.getBoundingClientRect().top }; });
  verifier(v2 && v2.d === date && v2.h > 0 && v2.h < 300, `recherche ${date} puis « Voir dans le carnet » : liste ouverte sur ce jour`);
  await p.click('.flight.fl-vu'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])');
  const v3 = await visible();
  verifier(Math.abs(new Date(v3.date.split('/').reverse().join('-')) - new Date(jour(123))) <= 3 * 864e5, `on peut ouvrir ce vol et revenir au même endroit (${v3.date})`);

  console.log('Mode sombre');
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.click('#q-open'); await p.fill('#q', 'LFKJ'); await attendre(500);
  await p.screenshot({ path: join(CAPT, 'v013-04-recherche-sombre.png') });
  const coul = await p.$eval('.fl-voir', e => getComputedStyle(e).color);
  verifier(coul !== 'rgb(0, 0, 0)', `« Voir dans le carnet » lisible en sombre (${coul})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.13 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v013-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
