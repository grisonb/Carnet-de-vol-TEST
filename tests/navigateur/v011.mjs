// v0.11 dans Chromium, écran 390 px (avions et vols INVENTÉS) : carte de vol du Carnet plus lisible (R32).
// Date en gras, nom de l'avion en couleur Avion puis immatriculation (ou immatriculation à la place du nom),
// modèle en petit gris coupé par « … », mission en gras couleur Mission avec un trait à gauche.
// Captures : tests/navigateur/captures/v011-*.png (non commitées). Usage : node tests/navigateur/v011.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const { chromium } = playwright();
const srv = await serveur();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const ecrire = (magasin, lignes) => p.evaluate(async ([magasin, lignes]) => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const t = db.transaction(magasin, 'readwrite'); for (const l of lignes) t.objectStore(magasin).put(l);
  await new Promise(ok => { t.oncomplete = ok; }); db.close();
}, [magasin, lignes]);

const avion = (id, immat, nom, modele) => ({ id, immat, nom, modele, typeOACI: 'DH8D', constructeur: 'ESSAI', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, indicatif: '', creeLe: '2026-01-01T00:00:00Z', modifieLe: '2026-01-01T00:00:00Z' });
const vol = (id, date, avionId, missions) => ({ id, date, hDep: '10:00', hArr: '11:30', mode: 'utc', dep: 'LFMN', arr: 'LFMD', escales: [], avionId,
  tempsTotal: 90, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 90, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZZ', missions, remarques: '',
  feux: 0, compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(date),
  creeLe: '2026-01-01T00:00:00Z', modifieLe: '2026-01-01T00:00:00Z' });

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await ecrire('avions', [avion('a1', 'F-XZZA', 'ZX1', 'Dash 8 Q400 version d\'essai avec un nom de modèle très long'),
    avion('a2', 'F-XZZB', '', 'DR400'), avion('a3', 'F-XZZC', 'F-XZZC', 'DR400')]);
  await ecrire('vols', [
    vol('v1', '2025-05-06', 'a1', ['ESSAI MISSION COURTE']),
    vol('v2', '2025-05-05', 'a2', []),
    vol('v3', '2025-05-04', 'a1', ['ESSAI MISSION LONGUE : LIGNE DE MISSION VOLONTAIREMENT TRÈS LONGUE POUR VOIR LE RETOUR À LA LIGNE SANS DÉBORDEMENT', 'SECONDE LIGNE ESSAI']),
    vol('v4', '2025-05-03', 'a3', ['ESSAI'])]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForSelector('.flight[data-id="v4"]');

  const carte = id => p.$eval(`.flight[data-id="${id}"]`, b => {
    const st = s => { const e = b.querySelector(s); if (!e) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return { t: e.textContent, couleur: c.color, gras: Number(c.fontWeight) >= 700, taille: parseFloat(c.fontSize), police: c.fontFamily,
        trait: c.borderLeftWidth + ' ' + c.borderLeftColor, droite: r.right, haut: r.top, coupe: e.scrollWidth > e.clientWidth, ellipse: c.textOverflow }; };
    const r = b.getBoundingClientRect();
    return { id: b.querySelector('.fl-id')?.innerText, date: st('.fl-date'), nm: st('.fl-nm'), reg: st('.fl-reg'), mod: st('.fl-mod'),
      heures: st('.fl-meta'), mission: st('.fl-rem'), route: st('.fl-route'), ligneId: st('.fl-id'), droite: r.right, deborde: b.scrollWidth > b.clientWidth + 1,
      tirets: / - /.test(b.querySelector('.fl-id').textContent) };
  });
  const COUL_AV = 'rgb(0, 121, 107)', COUL_MI = 'rgb(160, 77, 0)', ENCRE = await p.evaluate(() => getComputedStyle(document.body).color);

  console.log('Vol avec nom d\'avion');
  const c1 = await carte('v1');
  verifier(c1.date.t === '06/05/2025' && c1.date.gras && c1.date.taille > 14 && c1.date.couleur === ENCRE, `date en gras, foncée, plus grande (${c1.date.taille} px)`);
  verifier(c1.date.police === c1.route.police, '  même police que le trajet');
  verifier(c1.nm.t === 'ZX1' && c1.nm.gras && c1.nm.couleur === COUL_AV, 'nom de l\'avion en gras, couleur du bloc Avion');
  verifier(c1.reg.t === 'F-XZZA' && c1.reg.gras && c1.reg.couleur === ENCRE, 'immatriculation en gras foncé');
  const ligneId = await p.$eval('.flight[data-id="v1"] .fl-id', e => ({ coupe: e.scrollWidth > e.clientWidth, ellipse: getComputedStyle(e).textOverflow }));
  verifier(c1.mod.taille < 14 && c1.mod.couleur !== ENCRE && ligneId.coupe && ligneId.ellipse === 'ellipsis', 'modèle en petit gris, coupé par « … » à la fin de la ligne');
  verifier(!c1.tirets, 'plus de tirets « - » entre les éléments');
  verifier(c1.date.haut === c1.nm.haut || Math.abs(c1.date.haut - c1.nm.haut) < 6, 'date, nom, immatriculation sur la même ligne');
  verifier(c1.heures.t.includes('UTC') && c1.heures.taille <= 14 && c1.heures.couleur !== ENCRE, 'ligne des heures toujours en petit gris');
  verifier(c1.mission.t === 'ESSAI MISSION COURTE' && c1.mission.gras && c1.mission.taille === 16 && c1.mission.couleur === ENCRE, 'mission en gras, 16 px, en noir (v0.38, R94 ; avant : orange foncé)');
  // v0.38 (R94) : le trait prend la couleur du vol (feu, GAAR, entraînement, IFR ou sable) (avant : orange)
  verifier(c1.mission.trait.startsWith('3px') && /rgb\((211, 47, 47|216, 27, 96|200, 101, 15|31, 78, 121|138, 106, 46)\)/.test(c1.mission.trait), `  petit trait vertical à gauche, couleur du vol (${c1.mission.trait})`);

  console.log('Vol sans nom d\'avion');
  const c2 = await carte('v2');
  verifier(c2.nm.t === 'F-XZZB' && c2.nm.couleur === COUL_AV && c2.reg === null, 'l\'immatriculation prend la place du nom (gras, couleur Avion)');
  const c4 = await carte('v4');
  verifier(c4.nm.t === 'F-XZZC' && c4.reg === null, 'nom identique à l\'immatriculation : affichée une seule fois');

  console.log('Vol sans mission, mission longue');
  verifier(c2.mission === null, 'vol sans mission : pas de ligne mission');
  const c3 = await carte('v3');
  verifier(c3.mission.t.includes('SECONDE LIGNE ESSAI') && c3.mission.droite <= c3.droite, 'mission longue : passe à la ligne, ne dépasse pas');
  for (const [n, c] of [['v1', c1], ['v2', c2], ['v3', c3], ['v4', c4]])
    verifier(!c.deborde && c.droite <= 390 && c.ligneId.droite <= c.droite, `${n} : rien ne dépasse à 390 px`);
  await p.screenshot({ path: join(CAPT, 'v011-01-carnet-clair.png') });

  console.log('Mode sombre');
  await p.emulateMedia({ colorScheme: 'dark' });
  const s1 = await carte('v1');
  const fond = await p.$eval('.flight', b => getComputedStyle(b).backgroundColor);
  verifier(s1.nm.couleur === 'rgb(77, 182, 172)' && s1.mission.couleur === 'rgb(231, 237, 243)', `couleurs claires sur fond sombre (${fond}) ; mission en texte normal (R94)`);
  verifier(s1.date.couleur !== 'rgb(0, 0, 0)' && s1.date.couleur === await p.evaluate(() => getComputedStyle(document.body).color), 'date lisible (encre du mode sombre)');
  await p.screenshot({ path: join(CAPT, 'v011-02-carnet-sombre.png') });

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.11 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v011-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer();
}
