// v0.33 : R82 style des feux dans le fichier KML (épingle flamme bleue « Petite », libellé jaune « Moyenne »),
// R83 petit bouton « partager + Google Earth » tout en bas de la Carte du vol plein écran et dans la bulle d'une flamme ;
// partage simulé (iPad, Android s'il l'acceptait) ; Android qui refuse les .kml : téléchargement + message.
// Téléphone (Chromium 390 et 360 px, Android), PC (Chromium 1280 px), iPad (WebKit paysage et portrait).
// Vols, feux et communes INVENTÉS ; aucun appel hors de cet ordinateur (ni Google, ni NAS, ni VPS).
// Captures : tests/navigateur/captures/v033-*.png (non commitées). Usage : node tests/navigateur/v033.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-10T18:00:00Z';
const srv = await serveur();

// ---------- Carnet inventé ----------
const AVIONS = [{ id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400 MRE', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP',
  moteurs: 'ME', moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H }];
const vol = (id, date, champs) => ({ id, date, hDep: '10:00', hArr: '11:00', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 60, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 60, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: ['TRANSIT ESSAI'], remarques: '',
  feux: 0, compteurs: {}, etiquettes: [], attJour: 1, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', indicatif: '', regleIFR: false,
  ordre: Date.parse(`${date}T10:00Z`), creeLe: H, modifieLe: H, ...champs });
const VOLS = [
  vol('v-kml', '2026-08-14', { missions: ['FEU n°12 VILLE-SUR-ESSAI', 'FEU n°13 VILLE-ESSAI-B'], feux: 2,
    feuxPositions: [{ heure: '10:20', lat: 43.2512, lon: 2.4467, commune: 'Ville-sur-Essai', nom: '' },
      { heure: '10:40', lat: 43.1187, lon: 2.2051, commune: '', communeNpf: 'VILLE-ESSAI-B', nom: '' }] }),
  vol('v-sans-feu', '2026-08-10', { arr: '', arriveePosition: { lat: 43.3, lon: 2.6, nom: 'POSE ESSAI' } }), // position sans feu : carte sans bouton
];

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
// partage : 'kml' = le navigateur accepte les .kml (iPad) ; 'refuse-kml' = comme Chrome Android (types permis : pas de .kml) ; null = PC
async function appareil(nom, moteur, options, partage) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...options });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return r.continue();
    if (u.hostname === 'tuiles-essai.invalid') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ece8de"/></svg>' });
    bloquees.push(u.href); return r.abort();
  });
  await ctx.addInitScript(p => {
    globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://tuiles-essai.invalid/{z}/{x}/{y}.svg';
    globalThis.__partages = []; globalThis.__modePartage = p;
    for (const cible of [Navigator.prototype, navigator]) {
      try {
        Object.defineProperty(cible, 'canShare', { value: globalThis.__modePartage === null ? undefined : d => {
          const fs = (d && d.files) || [];
          if (!fs.length) return false;
          return globalThis.__modePartage === 'kml' || fs.every(f => !/\.km[lz]$/i.test(f.name)); // Chrome Android : .kml refusé
        }, configurable: true, writable: true });
        Object.defineProperty(cible, 'share', { value: async d => {
          const lire = async f => { try { return await f.text(); } catch { try { return await new Response(f).text(); } catch { return await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsText(f); }); } } };
          for (const f of d.files) globalThis.__partages.push({ nom: f.name, type: f.type, texte: await lire(f).catch(e => 'ILLISIBLE ' + e.name) });
        }, configurable: true, writable: true });
      } catch { /* propriété non modifiable ici : l'autre cible suffit */ }
    }
  }, partage);
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control|restricted network port/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([as, vs]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols'], 'readwrite');
    for (const a of as) t.objectStore('avions').put(a);
    for (const v of vs) t.objectStore('vols').put(v);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVIONS, VOLS]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const ouvrir = async (p, id) => { await p.click('.tabs button[data-v="carnet"]'); await p.click(`#list .flight[data-id="${id}"]`); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(p, 250); };
async function cartePleinEcran(p, id) {
  await ouvrir(p, id);
  await p.waitForSelector('#carte-mini.leaflet-container', { timeout: 15000 });
  await p.click('#carte-mini'); await p.waitForSelector('#carte-grande.leaflet-container'); await attendre(p, 500);
}
const fermer = async p => { await p.click('#cp-x'); await p.click('#cancel'); await p.click('#ab-yes').catch(() => {}); await p.waitForSelector('#v-carnet:not([hidden])'); };

// Place du bouton : tout en bas, sous la carte (ne la recouvre pas), à côté du crédit, au moins 44 px, dans l'écran
const placeBouton = p => p.evaluate(() => {
  const r = s => document.querySelector(s).getBoundingClientRect();
  const b = r('#cp-ge'), c = r('#carte-grande'), s = document.querySelector('#carte-plein .carte-source'), sr = s.getBoundingClientRect(), at = r('#carte-grande .leaflet-control-attribution');
  const sep = (x, y) => x.right <= y.left + 0.5 || y.right <= x.left + 0.5 || x.bottom <= y.top + 0.5 || y.bottom <= x.top + 0.5;
  const txt = document.getElementById('cp-ge').textContent.trim();
  return { h: b.height, w: b.width, sousCarte: b.top >= c.bottom - 0.5, dansEcran: b.bottom <= innerHeight + 0.5 && b.left >= -0.5 && b.right <= innerWidth + 0.5,
    toutEnBas: innerHeight - b.bottom <= 24, creditLibre: sep(b, sr) && sr.width > 40 && s.scrollWidth <= s.clientWidth + 1, attributionDansCarte: at.bottom <= c.bottom + 0.5 && sep(b, at),
    icone: !!document.querySelector('#cp-ge svg.ipart') && !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(txt), texte: txt, debordePage: document.documentElement.scrollWidth > innerWidth };
});
const verifierPlace = (x, qui) => verifier(x.h >= 44 && x.sousCarte && x.dansEcran && x.toutEnBas && x.creditLibre && x.attributionDansCarte && x.icone && x.texte === 'Google Earth' && !x.debordePage,
  `${qui} : bouton « Google Earth » tout en bas (${Math.round(x.h)} px de haut, ${Math.round(x.w)} px de large), sous la carte, crédit et attribution visibles` + (x.h >= 44 && x.sousCarte && x.dansEcran && x.toutEnBas && x.creditLibre && x.attributionDansCarte ? '' : ' ' + JSON.stringify(x)));
const bulle = async p => {
  await p.click('#carte-grande .carte-feu[data-feu="0"]'); await p.waitForSelector('#carte-grande .feu-ge'); await attendre(p, 600); // la carte se décale pour montrer la bulle
  return p.evaluate(() => { const b = document.querySelector('#carte-grande .feu-ge'), r = b.getBoundingClientRect();
    return { h: r.height, texte: b.textContent.trim(), icone: !!b.querySelector('svg.ipart'), dansEcran: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; });
};
const lireKml = (p, texte) => p.evaluate(t => {
  const d = new DOMParser().parseFromString(t, 'application/xml'), un = (n, s) => n && n.getElementsByTagName(s)[0];
  const st = un(d, 'Style'), ic = un(st, 'IconStyle'), lb = un(st, 'LabelStyle'), hs = un(ic, 'hotSpot');
  return { valide: !d.querySelector('parsererror') && d.documentElement.localName === 'kml' && d.documentElement.namespaceURI === 'http://www.opengis.net/kml/2.2',
    styleId: st && st.getAttribute('id'), href: un(un(ic, 'Icon'), 'href')?.textContent, echelle: un(ic, 'scale')?.textContent, couleurIcone: un(ic, 'color')?.textContent ?? null,
    hotSpot: hs && [hs.getAttribute('x'), hs.getAttribute('y'), hs.getAttribute('xunits'), hs.getAttribute('yunits')].join(' '),
    couleurLibelle: un(lb, 'color')?.textContent, echelleLibelle: un(lb, 'scale')?.textContent,
    points: [...d.getElementsByTagName('Placemark')].map(pm => ({ nom: un(pm, 'name').textContent, style: un(pm, 'styleUrl').textContent, coord: un(pm, 'coordinates').textContent.trim() })) };
}, texte);

try {
  console.log('Téléphone Android 390 px (Chrome : partage des .kml refusé)');
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_ANDROID }, 'refuse-kml');
  const T = tel.p;
  await cartePleinEcran(T, 'v-sans-feu');
  verifier(await T.isHidden('#cp-ge') && await T.evaluate(() => getComputedStyle(document.getElementById('carte-grande')).bottom) === '34px', 'vol sans feu : pas de bouton, carte inchangée');
  await fermer(T);
  await cartePleinEcran(T, 'v-kml');
  verifier(await T.isVisible('#cp-ge') && await T.isHidden('.cp-outils .cp-ge'), 'l\'ancien gros bouton du haut a disparu');
  verifierPlace(await placeBouton(T), 'téléphone 390 px');
  await T.screenshot({ path: join(CAPT, 'v033-01-tel-390-carte-bouton.png') });
  const avantReseau = bloquees.length;
  const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#cp-ge')]);
  await T.waitForSelector('#toast:not([hidden])');
  const toastTel = await T.textContent('#toast');
  verifier(dl.suggestedFilename() === 'Feux-14-08-2026.kml' && toastTel === 'Fichier téléchargé : ouvre-le dans Téléchargements puis Partager pour l’envoyer par mail',
    `Android : ${dl.suggestedFilename()} téléchargé (extension .kml gardée), message « ${toastTel} »`);
  await T.screenshot({ path: join(CAPT, 'v033-02-tel-390-message-telechargement.png') });
  const texteTel = readFileSync(await dl.path(), 'utf8');
  let k = await lireKml(T, texteTel);
  console.log('R82 : style du fichier KML');
  verifier(k.valide, 'KML valide (XML bien formé, espace de noms KML 2.2)');
  verifier(/^https:\/\/earth\.google\.com\/earth\/rpc\/cc\/icon\?/.test(k.href) && new URL(k.href).searchParams.get('id') === '2124' && new URL(k.href).searchParams.get('color') === '1976d2',
    `icône : épingle flamme de Google Earth (n°2124), bleue #1976D2 (${k.href})`);
  verifier(k.echelle === '0.8' && k.couleurIcone === null && k.hotSpot === '64 128 pixels insetPixels', `taille de l'icône « Petite » (${k.echelle}), pointe de l'épingle sur le feu`);
  verifier(k.couleurLibelle === 'ff2dc0fb' && k.echelleLibelle === '1', `libellé jaune #FBC02D (KML ${k.couleurLibelle}), taille « Moyenne » (${k.echelleLibelle})`);
  verifier(k.points.length === 2 && k.points.every(x => x.style === '#feu') && k.points[0].nom === 'Feu n°12 / 2026 / VILLE SUR ESSAI' && k.points[1].nom === 'Feu n°13 / 2026'
    && k.points[0].coord === '2.4467,43.2512,0', `points : ${k.points.map(x => x.nom).join(' | ')}`);
  verifier(texteTel.includes('&amp;id=2124&amp;scale=4') && !texteTel.includes('&id='), 'adresse de l\'icône correctement écrite en XML (&amp;)');
  console.log('R83 : bulle d\'une flamme');
  const bt = await bulle(T);
  verifier(bt.h >= 44 && bt.texte === 'Google Earth' && bt.icone && bt.dansEcran, `bulle : bouton icône + « Google Earth » (${Math.round(bt.h)} px)`);
  await T.screenshot({ path: join(CAPT, 'v033-03-tel-390-bulle.png') });
  console.log('Android, si Chrome acceptait un jour les .kml : la fenêtre de partage s\'ouvre');
  await T.evaluate(() => { globalThis.__modePartage = 'kml'; });
  await T.click('#carte-grande .feu-ge'); await attendre(T, 400);
  const pT = await T.evaluate(() => globalThis.__partages);
  verifier(pT.length === 1 && pT[0].nom === 'Feu-12-2026-VILLE-SUR-ESSAI.kml' && pT[0].type === 'application/vnd.google-earth.kml+xml' && pT[0].texte.includes('id=2124'),
    `partage (simulé) : ${pT[0] && pT[0].nom}`);
  verifier(bloquees.length === avantReseau, 'aucun appel réseau pour fabriquer et envoyer le fichier (l\'icône n\'est jamais chargée par le Carnet)');
  await fermer(T);

  console.log('Téléphone 360 px');
  const t360 = await appareil('360 px', nav, { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_ANDROID }, 'refuse-kml');
  const S = t360.p;
  await cartePleinEcran(S, 'v-kml');
  verifierPlace(await placeBouton(S), 'téléphone 360 px');
  await S.screenshot({ path: join(CAPT, 'v033-04-tel-360-carte-bouton.png') });
  const bs = await bulle(S);
  verifier(bs.h >= 44 && bs.icone && bs.dansEcran, '360 px : bouton de la bulle dans l\'écran');

  console.log('PC (pas de partage : téléchargement, message habituel)');
  const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } }, null);
  const P = pc.p;
  await cartePleinEcran(P, 'v-kml');
  verifierPlace(await placeBouton(P), 'PC');
  await P.screenshot({ path: join(CAPT, 'v033-05-pc-carte-bouton.png') });
  const [dlP] = await Promise.all([P.waitForEvent('download'), P.click('#cp-ge')]);
  await P.waitForSelector('#toast:not([hidden])');
  verifier(dlP.suggestedFilename() === 'Feux-14-08-2026.kml' && /^Fichier Feux-14-08-2026\.kml enregistré/.test(await P.textContent('#toast')), 'PC : téléchargement, message habituel (pas celui d\'Android)');

  console.log('iPad (WebKit, paysage puis portrait) : fenêtre de partage');
  const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: UA_IPAD }, 'kml');
  const I = ipad.p;
  await cartePleinEcran(I, 'v-kml');
  verifierPlace(await placeBouton(I), 'iPad paysage');
  await I.screenshot({ path: join(CAPT, 'v033-06-ipad-carte-bouton.png') });
  await I.click('#cp-ge'); await attendre(I, 500);
  let pI = await I.evaluate(() => globalThis.__partages);
  verifier(pI.length === 1 && pI[0].nom === 'Feux-14-08-2026.kml' && pI[0].type === 'application/vnd.google-earth.kml+xml', `iPad : fenêtre de partage (simulée) avec ${pI[0] && pI[0].nom}`);
  const bi = await bulle(I);
  verifier(bi.h >= 44 && bi.icone && bi.texte === 'Google Earth', 'iPad : bouton de la bulle');
  await I.screenshot({ path: join(CAPT, 'v033-07-ipad-bulle.png') });
  await I.click('#carte-grande .feu-ge'); await attendre(I, 500);
  pI = await I.evaluate(() => globalThis.__partages);
  // WebKit sans écran ne sait pas toujours relire le fichier partagé : contenu refait avec le même module de l'app
  const texteI = /^ILLISIBLE/.test(pI[1]?.texte || '') ? await I.evaluate(async () => (await import('./js/kml.js')).kmlDuVol((await import('./js/etat.js')).etat.vols.find(v => v.id === 'v-kml'), 0).texte) : pI[1]?.texte;
  k = await lireKml(I, texteI);
  verifier(pI.length === 2 && pI[1].nom === 'Feu-12-2026-VILLE-SUR-ESSAI.kml' && k.valide && k.echelle === '0.8' && k.couleurLibelle === 'ff2dc0fb', 'iPad : un feu partagé, même style');
  const ipadV = await appareil('iPad portrait', navSafari, { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: UA_IPAD }, 'kml');
  await cartePleinEcran(ipadV.p, 'v-kml');
  verifierPlace(await placeBouton(ipadV.p), 'iPad portrait');
  await ipadV.p.screenshot({ path: join(CAPT, 'v033-08-ipad-portrait-carte-bouton.png') });

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.33 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
