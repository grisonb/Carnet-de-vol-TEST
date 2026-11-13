// v0.38 : R93 recadrer la photo d'un avion (fenêtre au chargement, glisser, pincer, molette, curseur, Valider / Annuler,
// cadrage gardé après réouverture, « Recadrer » rouvre le cadrage précédent) ; R94-R99 cartes des vols de l'accueil
// (pastille du temps blanche à contour 4 px de la couleur du vol, même taille ; remarque en noir avec barre de couleur ;
// « lrg » rouge / orange / jaune ; « N att » noir ; « N att nuit » comme « Nuit » ; « N appr » bleu IFR juste après « IFR »).
// Téléphone (Chromium 390 px clair / sombre, 360 px), PC (Chromium 1280 px), iPad (WebKit). Vols, avions et image INVENTÉS
// (la photo est dessinée par le test). Captures : tests/navigateur/captures/v038-*.png (non commitées).
// Usage : node tests/navigateur/v038.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-13T08:00:00Z';
const AVIONS = [{ id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H }];
const vol = (id, jour, champs) => ({ id, date: `2026-11-${jour}`, hDep: '10:00', hArr: '11:30', mode: 'utc', dep: 'LFTW', arr: 'LFTW', escales: [], avionId: 'a1',
  tempsTotal: 90, tempsMP: null, tempsSE: null, tempsME: null, tempsCdB: 90, fonction: 'cdb', nomCdB: 'SELF', nomCopi: 'ZZX', missions: [], remarques: '', feux: 0,
  compteurs: {}, etiquettes: [], attJour: 2, attNuit: 0, approches: 0, tempsIFR: 0, tempsNuit: 0, simTemps: 0, source: 'saisie', ordre: Date.parse(`2026-11-${jour}T10:00Z`),
  creeLe: H, modifieLe: H, ...champs });
const VOLS = [
  vol('v-feu', '12', { missions: ['FEU n°60 ESSAI'], feux: 1, compteurs: { largCdbDash: 3 } }),
  vol('v-gaar', '11', { missions: ['GAAR ESSAI'] }),
  vol('v-ent', '10', { missions: ['ENT. OPS'], compteurs: { largCdbDash: 2 } }),
  vol('v-ifr', '09', { missions: ['TRANSPORT ESSAI'], tempsIFR: 80, approches: 3, attJour: 1, attNuit: 1, tempsNuit: 40 }),
  vol('v-ord', '08', { missions: ['VOL LOCAL ESSAI'], compteurs: { largCdbDash: 1 } }),
  vol('v-nuit', '07', { missions: ['VOL LOCAL ESSAI'], attJour: 0, attNuit: 2 }), // seulement de nuit, sans heures de nuit
];
const COUL = { clair: { feu: 'rgb(211, 47, 47)', gaar: 'rgb(216, 27, 96)', ent: 'rgb(200, 101, 15)', ifr: 'rgb(31, 78, 121)', sable: 'rgb(138, 106, 46)', fond: 'rgb(255, 255, 255)', ink: 'rgb(19, 32, 46)' },
  sombre: { feu: 'rgb(255, 107, 107)', gaar: 'rgb(240, 98, 146)', ent: 'rgb(232, 145, 63)', ifr: 'rgb(110, 168, 224)', sable: 'rgb(212, 185, 138)', fond: 'rgb(23, 34, 46)', ink: 'rgb(231, 237, 243)' } };
const VOL_COULEUR = { 'v-feu': 'feu', 'v-gaar': 'gaar', 'v-ent': 'ent', 'v-ifr': 'ifr', 'v-ord': 'sable', 'v-nuit': 'sable' };

const srv = await serveur();
const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const erreurs = [], bloquees = [];
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return r.continue(); bloquees.push(u.href); return r.abort(); });
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|access control/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([as, vs]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'vols'], 'readwrite'); for (const a of as) t.objectStore('avions').put(a); for (const v of vs) t.objectStore('vols').put(v);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVIONS, VOLS]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const attendre = (p, ms) => p.waitForTimeout(ms);
const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---------- Cartes des vols ----------
const mesurerCartes = p => p.evaluate(ids => {
  const st = e => { if (!e) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return { t: e.textContent, fond: s.backgroundColor, encre: s.color, bord: s.borderTopColor, bordL: s.borderTopWidth, gauche: s.borderLeftColor, w: r.width, h: r.height }; };
  const r = {};
  for (const id of ids) {
    const c = document.querySelector(`.flight[data-id="${id}"]`), chips = [...c.querySelectorAll('.chips .chip')];
    const parTexte = re => st(chips.find(x => re.test(x.textContent)));
    r[id] = { pastille: st(c.querySelector('.fl-bloc')), rem: st(c.querySelector('.fl-rem')), ordre: chips.map(x => x.textContent),
      lrg: parTexte(/ lrg$/), att: parTexte(/^\d+ att$/), attNuit: parTexte(/ att nuit$/), appr: parTexte(/ appr$/), ifr: parTexte(/^IFR /), nuit: parTexte(/^Nuit /),
      feu: st(c.querySelector('.chip.feu')), gaar: st(c.querySelector('.chip.gaar')), ent: st(c.querySelector('.chip.ent')) };
  }
  return r;
}, VOLS.map(v => v.id));
function controlerCartes(nom, theme, m, tailles) {
  const C = COUL[theme];
  for (const [id, k] of Object.entries(VOL_COULEUR)) {
    const pa = m[id].pastille, coul = C[k];
    verifier(pa.fond === C.fond && pa.encre === coul && pa.bord === coul && pa.bordL === '4px' && contraste(pa.encre, pa.fond) >= (k === 'ent' && theme === 'clair' ? 3.9 : 4.5)
      && Math.abs(pa.w - tailles[id].w) < 0.6 && Math.abs(pa.h - tailles[id].h) < 0.6,
      `${nom} ${theme} : ${id} : pastille fond ${pa.fond}, heure et contour 4 px ${coul}, même taille (${Math.round(pa.w)}×${Math.round(pa.h)})`);
    verifier(m[id].rem.encre === C.ink && m[id].rem.gauche === coul, `${nom} ${theme} : ${id} : remarque en noir, barre ${coul}`);
  }
  const blanc2 = (x, coul) => x && x.fond === C.fond && x.encre === coul && x.bord === coul && x.bordL === '2px';
  verifier(blanc2(m['v-feu'].lrg, C.feu) && blanc2(m['v-ent'].lrg, C.ent) && m['v-ord'].lrg.fond === (theme === 'clair' ? 'rgb(255, 243, 204)' : 'rgb(58, 48, 16)'),
    `${nom} ${theme} : « lrg » rouge (feu), orange (entraînement), jaune (autres : ${m['v-ord'].lrg.fond})`);
  verifier(['v-feu', 'v-gaar', 'v-ent', 'v-ifr', 'v-ord'].every(id => blanc2(m[id].att, C.ink)), `${nom} ${theme} : « N att » fond blanc, texte et contour noirs`);
  const ifr = m['v-ifr'];
  verifier(ifr.ordre.join(' | ') === 'CDB | Copi ZZX | 1 att | IFR 1h20 | 3 appr | Nuit 0h40 | 1 att nuit', `${nom} ${theme} : vol IFR : ${ifr.ordre.join(' | ')}`);
  verifier(blanc2(ifr.appr, C.ifr), `${nom} ${theme} : « 3 appr » bleu IFR, contour 2 px`);
  verifier(ifr.attNuit.fond === ifr.nuit.fond && ifr.attNuit.encre === ifr.nuit.encre, `${nom} ${theme} : « 1 att nuit » comme « Nuit 0h40 » (${ifr.attNuit.fond} / ${ifr.attNuit.encre})`);
  verifier(m['v-nuit'].ordre.join(' | ') === 'CDB | Copi ZZX | 2 att nuit' && !m['v-nuit'].att, `${nom} ${theme} : seulement de nuit : « 2 att nuit » seul`);
  verifier(m['v-feu'].feu.fond === 'rgb(211, 47, 47)' && m['v-gaar'].gaar.fond === 'rgb(216, 27, 96)' && m['v-ent'].ent.fond === 'rgb(200, 101, 15)'
    && ifr.ifr.fond === (theme === 'clair' ? 'rgb(230, 238, 247)' : 'rgb(26, 42, 60)'), `${nom} ${theme} : étiquettes Feu, GAAR, Entraînement, IFR inchangées`);
}
// Taille des pastilles avec la feuille de style d'avant (règles v0.38 retirées) : la taille extérieure ne doit pas changer
const taillesAvant = p => p.evaluate(ids => {
  const retirees = [];
  for (const ss of document.styleSheets) {
    let regles; try { regles = ss.cssRules; } catch { continue; }
    for (let i = regles.length - 1; i >= 0; i--) if (/fl-bloc/.test(regles[i].cssText) && /\[class\*="vol-"\]/.test(regles[i].cssText)) { retirees.push([ss, regles[i].cssText, i]); ss.deleteRule(i); }
  }
  const t = Object.fromEntries(ids.map(id => { const r = document.querySelector(`.flight[data-id="${id}"] .fl-bloc`).getBoundingClientRect(); return [id, { w: r.width, h: r.height }]; }));
  for (const [ss, txt, i] of retirees.reverse()) ss.insertRule(txt, i);
  return t;
}, VOLS.map(v => v.id));

// ---------- Recadrage de la photo ----------
// Partie visible (en fraction de la photo) d'une image dans sa boîte : gauche, haut, largeur, hauteur
const visible = (p, boite, img) => p.evaluate(([b, i]) => {
  const B = document.querySelector(b).getBoundingClientRect(), I = document.querySelector(i).getBoundingClientRect(), bord = parseFloat(getComputedStyle(document.querySelector(b)).borderLeftWidth) || 0;
  const W = B.width - 2 * bord, Hh = B.height - 2 * bord, x0 = B.left + bord, y0 = B.top + bord;
  return { x: (x0 - I.left) / I.width, y: (y0 - I.top) / I.height, w: W / I.width, h: Hh / I.height, couvre: I.left <= x0 + 0.5 && I.top <= y0 + 0.5 && I.right >= x0 + W - 0.5 && I.bottom >= y0 + Hh - 0.5 };
}, [boite, img]);
const egal = (a, b, e = 0.006) => ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < e);
async function pincer(p, facteur) {
  // deux doigts (événements pointer) qui s'écartent au centre du cadre
  await p.evaluate(f => {
    const z = document.getElementById('rc-zone'), r = z.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => z.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, bubbles: true, cancelable: true, pointerType: 'touch' }));
    ev('pointerdown', 11, cx - 30); ev('pointerdown', 12, cx + 30);
    for (let k = 1; k <= 10; k++) { const d = 30 * (1 + (f - 1) * k / 10); ev('pointermove', 11, cx - d); ev('pointermove', 12, cx + d); }
    ev('pointerup', 11, cx); ev('pointerup', 12, cx);
  }, facteur);
}

try {
  console.log('Téléphone 390 px : cartes des vols');
  const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const T = tel.p;
  const tailles = await taillesAvant(T);
  for (const theme of ['clair', 'sombre']) {
    await T.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    controlerCartes('téléphone', theme, await mesurerCartes(T), tailles);
    await T.locator('#list').screenshot({ path: join(CAPT, `v038-0${theme === 'clair' ? 1 : 2}-tel-390-cartes-${theme}.png`) });
  }
  await T.emulateMedia({ colorScheme: 'light' });

  console.log('R93 : recadrer la photo de l\'avion');
  const png = Buffer.from(await T.evaluate(() => {
    // photo INVENTÉE 4:3, petite (260 × 195) : fond bleu, une forme rouge à gauche (le « nez »), jaune à droite (l'« aile »)
    const c = document.createElement('canvas'); c.width = 260; c.height = 195; const g = c.getContext('2d');
    g.fillStyle = '#6aa0d8'; g.fillRect(0, 0, 260, 195); g.fillStyle = '#c62828'; g.fillRect(4, 80, 40, 40); g.fillStyle = '#f2b300'; g.fillRect(216, 70, 40, 60);
    g.fillStyle = '#fff'; g.fillRect(40, 92, 180, 16);
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  await T.click('#ac-fiche'); await T.waitForSelector('#fiche:not([hidden])'); await T.click('#fi-ed');
  verifier(await T.isHidden('#fi-rc'), 'sans photo : pas de bouton « Recadrer »');
  await T.setInputFiles('#fi-file', { name: 'avion-essai.png', mimeType: 'image/png', buffer: png });
  await T.waitForSelector('#rc-modal:not([hidden])'); await attendre(T, 300);
  const fen = await T.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), z = r('#rc-zone'), b = r('#fiche .fphoto');
    return { ratioZone: (z.width - 4) / (z.height - 4), ratioBandeau: b.width / b.height, oui: [r('#rc-oui').height, getComputedStyle(document.getElementById('rc-oui')).backgroundColor],
      non: [r('#rc-non').height, getComputedStyle(document.getElementById('rc-non')).backgroundColor], titre: document.getElementById('rc-t').textContent }; });
  verifier(fen.titre === 'Recadrer la photo' && Math.abs(fen.ratioZone - fen.ratioBandeau) < 0.02, `la fenêtre s'ouvre au chargement ; cadre à la proportion du bandeau (${fen.ratioZone.toFixed(2)} / ${fen.ratioBandeau.toFixed(2)})`);
  verifier(fen.oui[0] >= 44 && fen.non[0] >= 44 && fen.oui[1] === 'rgb(46, 125, 50)' && fen.non[1] === 'rgb(198, 40, 40)', `Annuler rouge, Valider vert, ${Math.round(fen.oui[0])} px`);
  let v = await visible(T, '#rc-zone', '#rc-img');
  verifier(v.couvre && v.w > 0.99, 'zoom minimum : la photo remplit tout le cadre (pas de bande vide)');
  await pincer(T, 2);
  const apresPince = await visible(T, '#rc-zone', '#rc-img');
  verifier(apresPince.w < 0.6 && apresPince.couvre, `pincer : zoom (partie visible ${Math.round(apresPince.w * 100)} % de la largeur)`);
  const z = await T.$eval('#rc-zone', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await T.mouse.move(z.x, z.y); await T.mouse.down(); await T.mouse.move(z.x + 60, z.y, { steps: 6 }); await T.mouse.up();
  const apresGlisse = await visible(T, '#rc-zone', '#rc-img');
  verifier(apresGlisse.x < apresPince.x - 0.05 && apresGlisse.couvre, 'glisser vers la droite : on voit plus à gauche (le nez)');
  await T.mouse.move(z.x, z.y); await T.mouse.wheel(0, 200); await attendre(T, 100);
  const apresMolette = await visible(T, '#rc-zone', '#rc-img');
  verifier(apresMolette.w > apresGlisse.w && apresMolette.couvre, 'molette : dézoom (équivalent souris)');
  for (let k = 0; k < 5; k++) await T.mouse.wheel(0, 2000);
  verifier((await visible(T, '#rc-zone', '#rc-img')).w > 0.99, 'dézoom au maximum : la photo remplit encore tout le cadre');
  await T.fill('#rc-zoom', '1.8'); await T.dispatchEvent('#rc-zoom', 'input');
  await T.mouse.move(z.x, z.y); await T.mouse.down(); await T.mouse.move(z.x + 200, z.y, { steps: 6 }); await T.mouse.up(); // tout à gauche
  const choisi = await visible(T, '#rc-zone', '#rc-img');
  await T.screenshot({ path: join(CAPT, 'v038-03-tel-390-fenetre-recadrage.png') });
  await T.click('#rc-oui'); await T.waitForSelector('#rc-modal', { state: 'hidden' }); await attendre(T, 200);
  const bandeau = await visible(T, '#fiche .fphoto', '#fi-img img');
  verifier(egal(bandeau, choisi) && bandeau.couvre && choisi.x < 0.02, `Valider : le bandeau montre exactement le cadre choisi (gauche ${choisi.x.toFixed(3)}, largeur ${choisi.w.toFixed(3)})`);
  verifier(await T.isVisible('#fi-rc'), '« Recadrer » sur le bandeau (photo présente)');
  const pos = await T.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), b = r('#fiche .fphoto'), rc = r('#fi-rc'), cam = r('#fiche .cam');
    return { basGauche: rc.left - b.left < 20 && b.bottom - rc.bottom < 20, h: rc.height, aCoteCam: Math.abs(rc.bottom - cam.bottom) < 4 }; });
  verifier(pos.basGauche && pos.h >= 44 && pos.aCoteCam, `« Recadrer » en bas à gauche, à la hauteur de l'appareil photo (${Math.round(pos.h)} px)`);
  await T.locator('#fiche .fphoto').screenshot({ path: join(CAPT, 'v038-04-tel-390-bandeau-recadre.png') });
  console.log('Annuler');
  await T.click('#fi-rc'); await T.waitForSelector('#rc-modal:not([hidden])'); await attendre(T, 200);
  verifier(egal(await visible(T, '#rc-zone', '#rc-img'), choisi), '« Recadrer » rouvre avec le cadrage précédent');
  await T.mouse.move(z.x, z.y); await T.mouse.down(); await T.mouse.move(z.x - 150, z.y, { steps: 6 }); await T.mouse.up();
  await T.click('#rc-non'); await T.waitForSelector('#rc-modal', { state: 'hidden' });
  verifier(egal(await visible(T, '#fiche .fphoto', '#fi-img img'), choisi), 'Annuler : le bandeau ne change pas');
  await T.click('#fi-save'); await attendre(T, 300);
  const garde = await T.evaluate(async () => { const a = (await import('./js/etat.js')).etat.avions.get('a1'); return { cadre: a.photoCadre, photo: a.photo && a.photo.slice(0, 23) }; });
  verifier(garde.cadre && garde.cadre.z > 1.7 && garde.photo === 'data:image/jpeg;base64,', `enregistré : photo d'origine (JPEG comme avant) + cadrage ${JSON.stringify(garde.cadre)}`);
  const taillePhoto = await T.evaluate(async () => { const a = (await import('./js/etat.js')).etat.avions.get('a1'); const i = new Image(); i.src = a.photo; await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
  verifier(taillePhoto.join('×') === '260×195', `photo gardée entière (${taillePhoto.join(' × ')} px, pas découpée)`);
  console.log('Fermer et rouvrir l\'app');
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 250);
  await T.click('#ac-fiche'); await T.waitForSelector('#fiche:not([hidden])'); await attendre(T, 300);
  verifier(egal(await visible(T, '#fiche .fphoto', '#fi-img img'), choisi) && await T.isHidden('#fi-rc'), 'après réouverture : même cadrage (lecture seule : pas de « Recadrer »)');
  await T.click('#fi-ed');
  await T.click('#fi-rc'); await T.waitForSelector('#rc-modal:not([hidden])'); await attendre(T, 200);
  verifier(egal(await visible(T, '#rc-zone', '#rc-img'), choisi), '« Recadrer » après réouverture : cadrage précédent');
  await T.goBack().catch(() => {}); await attendre(T, 300);
  verifier(await T.isHidden('#rc-modal') && egal(await visible(T, '#fiche .fphoto', '#fi-img img'), choisi), 'flèche retour : fenêtre fermée, rien ne change');

  console.log('Téléphone 360 px');
  const S = (await appareil('360 px', nav, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).p;
  controlerCartes('360 px', 'clair', await mesurerCartes(S), await taillesAvant(S));

  console.log('PC 1280 px');
  const P = (await appareil('PC', nav, { viewport: { width: 1280, height: 800 } })).p;
  controlerCartes('PC', 'clair', await mesurerCartes(P), await taillesAvant(P));

  console.log('iPad (WebKit)');
  const I = (await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' })).p;
  const tI = await taillesAvant(I);
  for (const theme of ['clair', 'sombre']) {
    await I.emulateMedia({ colorScheme: theme === 'clair' ? 'light' : 'dark' });
    controlerCartes('iPad', theme, await mesurerCartes(I), tI);
  }
  await I.emulateMedia({ colorScheme: 'light' });
  await I.click('#fab'); await I.waitForSelector('#v-saisie:not([hidden])'); await attendre(I, 250);
  await I.click('#ac-fiche'); await I.waitForSelector('#fiche:not([hidden])'); await I.click('#fi-ed');
  await I.setInputFiles('#fi-file', { name: 'avion-essai.png', mimeType: 'image/png', buffer: png });
  await I.waitForSelector('#rc-modal:not([hidden])'); await attendre(I, 300);
  await I.fill('#rc-zoom', '2'); await I.dispatchEvent('#rc-zoom', 'input');
  const choisiI = await visible(I, '#rc-zone', '#rc-img');
  await I.click('#rc-oui'); await attendre(I, 300);
  verifier(egal(await visible(I, '#fiche .fphoto', '#fi-img img'), choisiI), 'iPad : Valider : le bandeau montre le cadre choisi');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + [...new Set(bloquees)].slice(0, 5).join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
  console.log('\nv0.38 réussie.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close(); srv.fermer();
}
