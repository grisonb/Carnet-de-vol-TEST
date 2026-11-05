// v0.9 dans Chromium, écran 390 px (vols INVENTÉS) : boutons × rouges (R25), menu Plus par sections (R26),
// flèche retour Android (R27), pas de sélection à l'appui long (R28), recherche par date (R29).
// La flèche retour est simulée par history.back() (même événement « popstate » que sur le téléphone).
// Captures : tests/navigateur/captures/v09-*.png (non commitées). Usage : node tests/navigateur/v09.mjs
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
  locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });

const visible = s => p.isVisible(s);
const vue = () => p.evaluate(() => ['carnet', 'saisie', 'totaux', 'plus'].find(k => !document.getElementById('v-' + k).hidden));
const pile = () => p.evaluate(async () => (await import('./js/ui/retour.js'))._retour());
const retour = async () => { await p.evaluate(() => history.back()); await p.waitForTimeout(300); };
const onglet = v => p.click(`.tabs button[data-v="${v}"]`);
// Base de données de l'app (ouverte sans numéro de version)
const base = (code, arg) => p.evaluate(async ([code, arg]) => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const f = new Function('db', 'arg', `return (async () => { ${code} })()`);
  const r = await f(db, arg); db.close(); return r;
}, [code, arg]);
const tout = magasin => base(`return await new Promise(ok => { const r = db.transaction('${magasin}').objectStore('${magasin}').getAll(); r.onsuccess = () => ok(r.result); });`);
const ecrire = (magasin, lignes) => base(`const t = db.transaction('${magasin}', 'readwrite'); for (const l of arg) t.objectStore('${magasin}').put(l);
  await new Promise(ok => { t.oncomplete = ok; });`, lignes);
const recharger = async () => { await p.reload(); await p.waitForSelector('body[data-pret="1"]'); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v09.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await onglet('plus');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  await onglet('carnet');
  // Vols inventés à des dates choisies (heures en UTC : la date affichée est la date du vol)
  const avions = await tout('avions');
  const reel = avions.find(a => !a.sim);
  const modele = (await tout('vols'))[0];
  const nouveau = (id, date, rem) => ({ ...modele, id, date, hDep: '10:00', hArr: '11:00', mode: 'utc', dep: 'LFMN', arr: 'LFMD', escales: [],
    avionId: reel.id, tempsTotal: 60, simTemps: 0, remarques: rem, missions: [], source: 'saisie', creeLe: '2026-01-01T00:00:00Z', modifieLe: '2026-01-01T00:00:00Z' });
  await ecrire('vols', [nouveau('t-a', '2025-05-06', 'ESSAI DATE A'), nouveau('t-b', '2024-05-06', 'ESSAI DATE B'),
    nouveau('t-c', '2025-05-20', 'ESSAI DATE C'), nouveau('t-d', '2025-06-06', 'ESSAI DATE D'), nouveau('t-e', '1999-05-06', 'ESSAI DATE E'),
    nouveau('t-f', '2050-02-01', 'ESSAI DATE F')]);
  await recharger();
  const vols = await tout('vols');

  // ---------------- R29 : recherche par date ----------------
  console.log('Recherche par date (R29)');
  verifier(await p.getAttribute('#q', 'placeholder') === 'Rechercher : date, terrain, immat., mission…', 'texte d\'aide de la barre de recherche');
  await p.click('#q-open');
  const chercher = async t => { await p.fill('#q', t); await p.waitForTimeout(350); return p.$$eval('#list .flight', l => l.map(b => b.dataset.id)); };
  const attendus = pred => vols.filter(v => pred(v.date)).map(v => v.id).sort();
  const memes = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const t of ['06/05/25', '06/05/2025', '6/5/25', '6/5/2025', '06.05.2025', '06-05-25', '06 05 2025', '060525', '06052025', '2025-05-06'])
    verifier(memes(await chercher(t), ['t-a']), `« ${t} » -> seulement le vol du 06/05/2025`);
  verifier(memes(await chercher('06/05/99'), ['t-e']), '« 06/05/99 » -> 1999 (année sur 2 chiffres supérieure à 50)');
  verifier(memes(await chercher('01/02/50'), ['t-f']), '« 01/02/50 » -> 2050');
  verifier(memes(await chercher('05/2025'), attendus(d => d.startsWith('2025-05'))), '« 05/2025 » -> tout le mois de mai 2025');
  verifier(memes(await chercher('06/05'), attendus(d => d.slice(5) === '05-06')), '« 06/05 » -> le 6 mai de toutes les années (3 vols)');
  verifier((await chercher('06/05')).length === 3, '  … soit 2025, 2024 et 1999');
  const annee = await chercher('2025');
  verifier(annee.length > 3 && memes(annee, attendus(d => d.startsWith('2025'))), `« 2025 » -> toute l'année (${annee.length} vols)`);
  await p.screenshot({ path: join(CAPT, 'v09-01-recherche-date.png') });
  verifier(memes(await chercher('ESSAI DATE C'), ['t-c']), 'recherche texte inchangée (remarque)');
  verifier((await chercher('LFMN')).length >= 6, 'recherche texte inchangée (terrain)');
  verifier((await chercher(reel.immat)).length > 0, 'recherche texte inchangée (immatriculation)');
  verifier((await chercher('32/01/2025')).length === 0, 'une fausse date ne montre aucun vol (recherche texte)');
  await p.click('#q-open');
  verifier((await p.$$eval('#list .flight', l => l.length)) > 6, 'refermer la loupe remet tous les vols');

  // ---------------- R26 : menu Plus ----------------
  console.log('Menu Plus (R26)');
  await onglet('plus');
  verifier(!(await p.textContent('#v-plus .hero')).toUpperCase().includes('OUTILS'), 'plus de mot « OUTILS » au-dessus de « Plus »');
  verifier(!(await p.$('#rappel')), 'l\'ancien bandeau de rappel a disparu (remplacé par l\'encart)');
  verifier(await p.evaluate(() => !document.getElementById('pl-bk').classList.contains('ok')), 'encart jaune : jamais sauvegardé');
  verifier(await p.textContent('#pl-bk-t') === 'Aucune sauvegarde' && (await p.textContent('#pl-bk-s')) === 'Tes vols ne sont que sur ce téléphone.', '  « Aucune sauvegarde · Tes vols ne sont que sur ce téléphone »');
  verifier(await visible('#pl-bk-go'), '  bouton « Sauvegarder »');
  const groupes = await p.$$eval('#v-plus .pgrp', l => l.map(x => x.textContent));
  verifier(JSON.stringify(groupes) === '["Sauvegarde","Exporter","Mes réglages","Import FlyLog","Téléphone"]', 'sections : ' + groupes.join(', '));
  const lignes = await p.$$eval('#v-plus .pcard', cs => cs.map(c => [...c.querySelectorAll('.prow2 b')].map(b => b.textContent)));
  verifier(JSON.stringify(lignes) === JSON.stringify([['Sauvegarde de secours', 'Restaurer une sauvegarde'],
    ['Carnet officiel (PDF EASA)', 'Tableur (CSV)', 'Titulaire du carnet'],
    ['Mes avions', "Types d'avion", 'Heures affichées en haut', 'Pastilles des missions', 'Libellés missions', 'Personnes', 'Cartes de vol'],
    ['Importer FlyLog', 'Contrôle import'], ['Stockage']]), 'toutes les entrées, rangées dans leur section');
  const forme = await p.$$eval('#v-plus .prow2', l => l.map(r => {
    const b = r.querySelector('.ptx b').getBoundingClientRect(), s = r.querySelector('.ptx small'), sr = s.getBoundingClientRect();
    const ic = r.querySelector('.pi svg'), ch = r.querySelector('.pch');
    return { ok: !!ic && ch.textContent === '›' && sr.top >= b.bottom - 1 && s.scrollWidth <= s.clientWidth + 1 && sr.right <= r.getBoundingClientRect().right,
      fond: getComputedStyle(r.querySelector('.pi')).backgroundColor, t: r.querySelector('b').textContent };
  }));
  verifier(forme.every(x => x.ok), 'chaque ligne : icône dessinée, titre, sous-titre EN DESSOUS (non coupé), chevron ›');
  verifier(new Set(forme.map(x => x.fond)).size >= 5, 'carrés d\'icône de couleurs différentes selon le bloc');
  verifier((await p.textContent('.pver')).includes('v0.9'), 'version de l\'app en bas : ' + (await p.textContent('.pver')));
  verifier((await p.textContent('#pl-cartes-s')).startsWith('Mot de passe à saisir'), 'Cartes de vol : sous-titre « Mot de passe à saisir » (pas encore de mot de passe)');
  await p.screenshot({ path: join(CAPT, 'v09-02-plus-clair.png'), fullPage: true });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: join(CAPT, 'v09-03-plus-sombre.png'), fullPage: true });
  await p.emulateMedia({ colorScheme: 'light' });

  console.log('Chaque entrée ouvre le bon écran (puis flèche retour)');
  const titreOutil = () => p.textContent('#ou-t');
  const entrees = [['#pl-save', 'outil', 'Sauvegarde de secours'], ['#pl-pdf', 'outil', 'Carnet officiel (PDF EASA)'], ['#pl-csv', 'outil', 'Tableur (CSV)'],
    ['#pl-tit', 'outil', 'Titulaire du carnet'], ['#pl-avions', 'fleet'], ['#pl-types', 'outil', "Types d'avion"], ['#pl-heures', 'hs-modal'],
    ['#rules-open', 'rules-modal'], ['#pl-libelles', 'ml-modal'], ['#pl-pers', 'outil', 'Personnes'], ['#pl-cartes', 'outil', 'Cartes de vol'],
    ['#pl-ctrl', 'outil', 'Contrôle import'], ['#pl-stockage', 'outil', 'Stockage']];
  for (const [b, fen, titre] of entrees) {
    await p.click(b);
    await p.waitForSelector('#' + fen, { state: 'visible' });
    if (titre) verifier(await titreOutil() === titre, `${b} -> « ${titre} »`); else verifier(true, `${b} -> #${fen}`);
    await retour();
    verifier(!(await visible('#' + fen)) && await vue() === 'plus', '   retour : fenêtre fermée, toujours dans Plus');
  }
  for (const [b, input] of [['#pl-restore', '#file-restore'], ['#pl-import', '#file-flylog']]) {
    const [choix] = await Promise.all([p.waitForEvent('filechooser'), p.click(b)]);
    verifier(await choix.element().getAttribute('id') === input.slice(1), `${b} -> choix du fichier (${input})`);
  }
  verifier((await p.textContent('#pl-stock-s')).length > 3, 'Stockage : sous-titre « ' + (await p.textContent('#pl-stock-s')) + ' »');

  console.log('Encart sauvegarde : récente, puis plus de 7 jours');
  await p.click('#pl-bk-go');
  verifier(await titreOutil() === 'Sauvegarde de secours', '« Sauvegarder » ouvre la sauvegarde de secours');
  await Promise.all([p.waitForEvent('download'), p.click('#sv-dl')]);
  await p.waitForTimeout(300);
  await p.click('#ou-x');
  const jjmm = await p.evaluate(() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; });
  verifier(await p.evaluate(() => document.getElementById('pl-bk').classList.contains('ok')) && await p.textContent('#pl-bk-t') === `Sauvegardé le ${jjmm}`,
    `encart neutre avec coche verte : « Sauvegardé le ${jjmm} »`);
  verifier(!(await visible('#pl-bk-go')), '  plus de bouton « Sauvegarder »');
  await p.locator('#pl-bk').screenshot({ path: join(CAPT, 'v09-04-encart-ok.png') });
  await ecrire('reglages', [{ cle: 'derniereSauvegarde', valeur: new Date(Date.now() - 10 * 864e5).toISOString() }]);
  await recharger(); await onglet('plus');
  verifier(await p.evaluate(() => !document.getElementById('pl-bk').classList.contains('ok')) && (await p.textContent('#pl-bk-t')) === 'Pas de sauvegarde depuis 10 jours',
    'plus de 7 jours : encart jaune « Pas de sauvegarde depuis 10 jours »');
  await onglet('carnet');

  // ---------------- R25 : boutons × rouges ----------------
  console.log('Boutons × (R25)');
  await onglet('plus'); await p.click('#pl-avions');
  await p.click('#fl-list .acitem');
  await p.waitForSelector('#fiche', { state: 'visible' });
  const x = async s => p.$eval(s, b => { const r = b.getBoundingClientRect(), c = getComputedStyle(b);
    return { fond: c.backgroundColor, rond: c.borderRadius, l: r.width, h: r.height, croix: !!b.querySelector('svg.ix') && getComputedStyle(b.querySelector('svg.ix')).opacity === '1', texte: b.textContent.trim(),
      trait: getComputedStyle(b.querySelector('svg.ix')).stroke }; });
  const xf = await x('#fi-x');
  verifier(xf.fond === 'rgb(198, 40, 40)' && xf.rond === '50%', `fiche avion : rond plein rouge (${xf.fond})`);
  verifier(xf.croix && xf.texte === '' && xf.trait === 'rgb(255, 255, 255)', '  croix blanche dessinée (SVG), pas un caractère');
  verifier(xf.l >= 40 && xf.h >= 40, `  zone de toucher ${xf.l}×${xf.h} px`);
  await p.locator('.fphoto').screenshot({ path: join(CAPT, 'v09-05-x-fiche-avion.png') });
  await retour(); await retour();
  verifier(await vue() === 'plus' && !(await visible('#fleet')), 'retour, retour : fiche puis liste des avions fermées');
  for (const s of ['#fl-x', '#ou-x', '#cp-x'])
    verifier((await x(s)).croix && (await x(s)).fond === 'rgb(198, 40, 40)', `${s} : même × rouge`);
  await p.emulateMedia({ colorScheme: 'dark' });
  verifier((await x('#ou-x')).fond === 'rgb(211, 47, 47)', 'mode sombre : × rouge lisible (' + (await x('#ou-x')).fond + ')');
  await p.emulateMedia({ colorScheme: 'light' });

  // ---------------- R27 : flèche retour ----------------
  console.log('Flèche retour Android (R27)');
  await onglet('carnet');
  verifier((await pile()).poussees === 0, 'accueil du Carnet : aucune entrée d\'historique (retour = l\'app se ferme)');
  await onglet('totaux'); await retour();
  verifier(await vue() === 'carnet', 'Totaux -> retour -> Carnet');
  await onglet('totaux'); await onglet('plus'); await retour();
  verifier(await vue() === 'carnet', 'Totaux puis Plus -> un seul retour -> Carnet');
  await p.click('#h-strip'); verifier(await visible('#hs-modal'), 'choix des heures ouvert');
  await retour(); verifier(!(await visible('#hs-modal')) && await vue() === 'carnet', '  retour -> fenêtre fermée, toujours sur le Carnet');
  verifier((await pile()).poussees === 0, '  plus aucune entrée d\'historique');

  console.log('× puis retour : pas de double appui');
  await onglet('plus'); await p.click('#pl-avions'); await p.click('#fl-x'); await p.waitForTimeout(300);
  verifier((await pile()).poussees === 1, 'liste des avions fermée par × : son entrée d\'historique est retirée');
  await retour();
  verifier(await vue() === 'carnet', '  un seul retour suffit pour revenir au Carnet');
  await p.click('#h-strip'); await p.click('#hs-x'); await p.waitForTimeout(300);
  await onglet('plus'); await retour();
  verifier(await vue() === 'carnet' && (await pile()).poussees === 0, 'choix des heures fermé par son bouton, puis Plus -> retour -> Carnet');

  console.log('Fiche d\'un vol');
  await p.click('.flight[data-id="t-a"]');
  verifier(await vue() === 'saisie', 'fiche du vol ouverte');
  await retour();
  verifier(await vue() === 'carnet' && !(await visible('#ab-modal')), 'sans changement : retour direct à la liste (pas de question)');
  await p.click('#fab');
  await retour();
  verifier(await vue() === 'carnet' && !(await visible('#ab-modal')), 'nouveau vol sans rien taper : retour direct');
  await p.click('.flight[data-id="t-a"]');
  await p.click('#via-add'); verifier(await visible('#via-modal'), 'fenêtre « terrain intermédiaire » ouverte');
  await retour(); verifier(!(await visible('#via-modal')) && await vue() === 'saisie', '  retour -> elle se ferme, la fiche du vol reste');
  await p.evaluate(() => { document.getElementById('carte-plein').hidden = false; });
  await p.waitForTimeout(100);
  await retour();
  verifier(!(await visible('#carte-plein')) && await vue() === 'saisie', 'carte en plein écran -> retour -> fiche du vol');
  await p.fill('#f-rem', 'ESSAI DATE A MODIFIE');
  await retour();
  verifier(await visible('#ab-modal') && await vue() === 'saisie', 'avec un changement : fenêtre « Abandonner la saisie ? »');
  verifier(await p.textContent('#ab-t') === 'Abandonner la saisie ?' && (await p.textContent('#ab-modal .hint')) === 'Ce que tu as tapé pour ce vol ne sera pas enregistré.', '  textes de la fenêtre');
  const ab = await p.$eval('#ab-yes', b => getComputedStyle(b).backgroundColor);
  verifier(await p.textContent('#ab-no') === 'Continuer la saisie' && (await p.textContent('#ab-yes')) === 'Abandonner' && ab === 'rgb(198, 40, 40)', '  boutons « Continuer la saisie » et « Abandonner » (rouge)');
  await p.screenshot({ path: join(CAPT, 'v09-06-abandonner-saisie.png') });
  await p.click('#ab-no');
  verifier(!(await visible('#ab-modal')) && await vue() === 'saisie' && await p.inputValue('#f-rem') === 'ESSAI DATE A MODIFIE', '« Continuer la saisie » : on reste, le texte tapé est là');
  await retour(); verifier(await visible('#ab-modal'), 'retour -> la question revient');
  await retour(); verifier(!(await visible('#ab-modal')) && await vue() === 'saisie', 'retour sur la question = continuer la saisie');
  await retour(); await p.click('#ab-yes'); await p.waitForTimeout(300);
  verifier(await vue() === 'carnet', '« Abandonner » : retour à la liste');
  verifier((await tout('vols')).find(v => v.id === 't-a').remarques === 'ESSAI DATE A', '  le vol n\'a pas été modifié');
  verifier((await pile()).poussees === 0, '  historique propre (aucune entrée fantôme)');
  await p.click('.flight[data-id="t-a"]'); await p.fill('#f-rem', 'ESSAI DATE A BIS'); await p.click('#save'); await p.waitForTimeout(400);
  verifier(await vue() === 'carnet' && (await pile()).poussees === 0, 'vol enregistré : retour à la liste, historique propre');

  console.log('Ligne de mission : × rouge');
  await p.click('.flight[data-id="t-a"]');
  await p.fill('#m-q', 'ESSAI MISSION'); await p.click('#m-add');
  const xm = await x('#ml .x');
  verifier(xm.croix && xm.fond === 'rgb(198, 40, 40)' && xm.l >= 40, `ligne de mission : × rouge dessiné (${xm.l}×${xm.h} px)`);
  await p.locator('.c-mi').screenshot({ path: join(CAPT, 'v09-07-x-mission.png') });
  await p.click('#ml .x');
  verifier(await p.locator('#ml .mline').count() === 0, '  × enlève la ligne');
  await p.click('#cancel'); await p.waitForTimeout(300);

  // ---------------- R28 : appui long ----------------
  console.log('Appui long (R28)');
  const sel = await p.evaluate(() => ({ page: getComputedStyle(document.querySelector('.flight')).userSelect, html: getComputedStyle(document.documentElement).webkitUserSelect,
    champ: getComputedStyle(document.getElementById('q')).userSelect, rem: getComputedStyle(document.getElementById('f-rem')).userSelect,
    surlignage: getComputedStyle(document.documentElement).webkitTapHighlightColor }));
  verifier(sel.page === 'none' && sel.html === 'none', 'texte non sélectionnable hors des champs');
  verifier(sel.champ !== 'none' && sel.rem !== 'none', 'champs de saisie (recherche, remarques) : sélection et copier-coller possibles');
  verifier(sel.surlignage === 'rgba(0, 0, 0, 0)', 'pas de surlignage bleu au toucher');
  const menu = await p.evaluate(() => ['.flight', '#q', '#h-total'].map(s => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector(s).dispatchEvent(e); return e.defaultPrevented; }));
  verifier(menu[0] && !menu[1] && menu[2], 'menu de l\'appui long bloqué sur les vols et les textes, gardé dans les champs');

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.9 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v09-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
