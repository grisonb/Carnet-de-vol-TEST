// v0.19 (R56) dans Chromium, écran 390 px (vols et avions INVENTÉS, faux NAS local) : bandeau NPF, « Enregistrer le vol »
// et « Continuer la saisie » sur fond VERT ; tous les boutons « Annuler » sur fond ROUGE ; texte blanc lisible (contraste
// >= 4,5:1) ; place et taille identiques (mesurées avec et sans la couleur). Clair et sombre.
// Captures : tests/navigateur/captures/v019-*.png (non commitées). Usage : node tests/navigateur/v019.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const NPF = [{ format: 'carnet-vol-npf', version: 2, id: 'npf-c1', exporteLe: H, date: '2026-01-05', blocDepart: '10:00', blocArrivee: '11:00',
  immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMN' }];
const COPIE = { id: '20260105-100000-8', date: '2026-01-05T10:00:00+01:00', vols: 8, taille: 1000 };
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  req.on('data', () => {});
  req.on('end', () => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(a === 'vols-liste' ? { vols: NPF } : a === 'liste' ? { copies: [COPIE] } : { ok: true, vols: 0, taille: 0 })); });
});
await new Promise(ok => fauxNas.listen(0, '127.0.0.1', ok));

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
const VERT = 'rgb(46, 125, 50)', ROUGE = 'rgb(198, 40, 40)', BLANC = 'rgb(255, 255, 255)';
// Couleur, contraste et taille (avec puis sans la classe de couleur : la boîte ne doit pas bouger)
const mesurer = sel => p.$eval(sel, e => {
  const lum = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const s = getComputedStyle(e), boite = () => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); };
  const avec = boite(), fond = s.backgroundColor, texte = s.color;
  const [l1, l2] = [lum(fond), lum(texte)].sort((a, b) => b - a);
  const classes = ['vert', 'annuler'].filter(c => e.classList.contains(c));
  e.classList.remove(...classes); const sans = boite(); e.classList.add(...classes);
  return { fond, texte, contraste: (l1 + 0.05) / (l2 + 0.05), memeTaille: avec === sans, texteBouton: e.textContent.trim(), visible: !!e.offsetParent };
});
const verifierBouton = async (sel, couleur, nom) => {
  const m = await mesurer(sel);
  verifier(m.visible && m.fond === couleur && m.texte === BLANC && m.contraste >= 4.5 && m.memeTaille,
    `${nom} (${sel}) : ${couleur === VERT ? 'vert' : 'rouge'}, texte blanc, contraste ${m.contraste.toFixed(1)}:1, même place et même taille`);
};
const rouges = [];
const annuler = async (sel, nom) => { await verifierBouton(sel, ROUGE, `« Annuler » ${nom}`); rouges.push(sel); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v019.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-no');
  await annuler('#im-no', 'import FlyLog');
  await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  await p.evaluate(async url => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction('reglages', 'readwrite'); const g = t.objectStore('reglages');
    g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: 'x' }); g.put({ cle: 'nasAuto', valeur: false });
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  await p.waitForFunction(() => !document.getElementById('npf-bandeau').hidden, null, { timeout: 10000 });

  for (const theme of ['light', 'dark']) {
    console.log(`Mode ${theme === 'light' ? 'clair' : 'sombre'}`);
    await p.emulateMedia({ colorScheme: theme });
    await verifierBouton('#npf-bandeau', VERT, 'bandeau « 1 vol à importer depuis NPF-Q400 »');
    await p.screenshot({ path: join(CAPT, `v019-01-bandeau-${theme}.png`) });
    await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
    await verifierBouton('#save', VERT, '« Enregistrer le vol »');
    await annuler('#cancel', 'de la saisie');
    await p.screenshot({ path: join(CAPT, `v019-02-saisie-${theme}.png`) });
    await p.fill('#f-rem', 'ESSAI'); await p.goBack(); await p.waitForSelector('#ab-modal:not([hidden])');
    await verifierBouton('#ab-no', VERT, '« Continuer la saisie »');
    await p.screenshot({ path: join(CAPT, `v019-03-abandonner-${theme}.png`) });
    await p.click('#ab-no'); await attendre(300);
    await p.click('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(300);
  }
  await p.emulateMedia({ colorScheme: 'light' });

  console.log('Tous les boutons « Annuler »');
  await p.click('#fab'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#via-add'); await p.waitForSelector('#via-modal:not([hidden])'); await annuler('#vm-cancel', 'terrain intermédiaire');
  await p.screenshot({ path: join(CAPT, 'v019-04-escale.png') });
  await p.click('#vm-cancel');
  await p.fill('#f-dep', 'ZZZZ'); await p.dispatchEvent('#f-dep', 'input'); await p.click('.ajt[data-ajt="#f-dep"]');
  await p.waitForSelector('#ter-modal:not([hidden])'); await annuler('#ter-x', 'ajouter un terrain'); await p.click('#ter-x');
  await p.click('#p-add'); await p.waitForSelector('#p-modal:not([hidden])'); await annuler('#pm-x', 'ajouter une personne'); await p.click('#pm-x');
  await p.click('#tg-add'); await p.waitForSelector('#tg-modal:not([hidden])'); await annuler('#pm2-x', 'ajouter une étiquette'); await p.click('#pm2-x');
  await p.click('#ac-cur'); await p.click('#ac-add'); await p.waitForSelector('#add1:not([hidden])'); await annuler('#a1-x', 'ajouter un avion'); await p.click('#a1-x');
  await p.click('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])');
  await p.click('#npf-bandeau'); await p.click('#npf-l [data-ign]'); await p.waitForSelector('#ni-no');
  await annuler('#ni-no', 'ignorer un vol NPF'); await p.click('#ni-no');
  await p.waitForSelector('#npf-l'); await p.click('#ou-x'); // « Annuler » ramène à la liste : on la ferme
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas-rest'); await p.waitForSelector('#rn-l .nasv'); await p.click('#rn-l .nasv');
  await annuler('#rn-no', 'restaurer depuis le NAS'); await p.click('#rn-no'); await p.click('#ou-x');
  await p.click('#pl-save');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sv-dl')]);
  const sauvegarde = join(CAPT, 'sauvegarde-v019.json'); writeFileSync(sauvegarde, readFileSync(await dl.path()));
  await p.click('#ou-x');
  await p.setInputFiles('#file-restore', sauvegarde); await p.waitForSelector('#rs-no');
  await annuler('#rs-no', 'restaurer une sauvegarde'); await p.click('#rs-no');
  const fiches = join(CAPT, 'fiches-v019.csv'); writeFileSync(fiches, 'F-XZZA,M91,ESSAI 91,Essai\n');
  await p.click('#pl-fiches'); await p.setInputFiles('#fa-fichier', fiches); await p.waitForSelector('#fa-no');
  await annuler('#fa-no', 'importer des fiches avions');
  await p.screenshot({ path: join(CAPT, 'v019-05-fiches.png') });
  await p.click('#fa-no');
  // « Annuler » du message « Vol supprimé » (en bas de l'écran)
  await p.click('.tabs button[data-v="carnet"]');
  await p.click('#list .flight'); await p.waitForSelector('#v-saisie:not([hidden])');
  await p.click('#del');
  await p.click('#del-yes'); await p.waitForSelector('#toast:not([hidden]) .tbtn');
  await annuler('#toast .tbtn', 'du message « Vol supprimé »');
  await p.screenshot({ path: join(CAPT, 'v019-06-message-annuler.png') });
  await p.click('#toast .tbtn');
  // 11 boutons « Annuler » + celui du message « Vol supprimé » (celui de la saisie vérifié en clair et en sombre)
  verifier(new Set(rouges).size === 12, `${new Set(rouges).size} boutons « Annuler » différents vérifiés : ${[...new Set(rouges)].join(' ')}`);

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.19 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v019-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
