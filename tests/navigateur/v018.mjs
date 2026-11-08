// v0.18 (R55) dans Chromium, écran 390 px, TOUCHERS simulés (écran tactile), vols INVENTÉS, faux NAS local.
// Bug corrigé : un history.go() de l'app qui se termine en retard (téléphone lent, démarrage) était pris pour un appui
// sur retour et fermait la liste des vols NPF. Le test rend history.go() lent (1,5 s) comme sur le téléphone.
// Vérifie : bandeau puis vol du premier coup, 10 fois de suite (dont après un rechargement avec un historique ancien) ;
// une vérification du NAS qui arrive pendant le toucher ; toucher hors des vols ; flèche retour Android.
// Captures : tests/navigateur/captures/v018-*.png (non commitées). Usage : node tests/navigateur/v018.mjs
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-01-01T00:00:00Z';
const VOLS = ['npf-a', 'npf-b'].map((id, i) => ({ format: 'carnet-vol-npf', version: 2, id, exporteLe: H, date: `2026-01-0${5 + i}`,
  blocDepart: '10:00', blocArrivee: '11:00', immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMN' }));
const nas = { listes: 0, lent: 0 };
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  req.on('data', () => {});
  req.on('end', () => setTimeout(() => {
    if (a === 'vols-liste') nas.listes++;
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(a === 'vols-liste' ? { vols: VOLS } : { ok: true }));
  }, a === 'vols-liste' ? nas.lent : 0));
});
await new Promise(ok => fauxNas.listen(0, '127.0.0.1', ok));

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.route('**/*', r => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
await ctx.addInitScript(() => {
  globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png';
  // Téléphone lent : le popstate d'un history.go() arrive 1,5 s plus tard
  const go = history.go.bind(history);
  history.go = n => setTimeout(() => go(n), 1500);
});
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
const etat = () => p.evaluate(() => ({ liste: !document.getElementById('outil').hidden && !!document.getElementById('npf-l'),
  saisie: !document.getElementById('v-saisie').hidden, carnet: !document.getElementById('v-carnet').hidden }));
const bandeauVisible = () => p.waitForFunction(() => !document.getElementById('npf-bandeau').hidden, null, { timeout: 10000 });

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async url => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'reglages'], 'readwrite');
    t.objectStore('avions').put({ id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Essai', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
      moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, creeLe: '2026-01-01', modifieLe: '2026-01-01' });
    const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: 'x' }); g.put({ cle: 'nasAuto', valeur: false });
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`);

  console.log('Bandeau puis vol, au toucher, 10 fois de suite (history.go lent)');
  let reussis = 0;
  for (let i = 1; i <= 10; i++) {
    if (i === 1 || i === 6) {
      // App rouverte avec une entrée d'historique d'une session précédente (comme un téléphone qui recharge l'app)
      await p.evaluate(() => history.pushState({ carnet: 1 }, ''));
      await p.reload(); await p.waitForSelector('body[data-pret="1"]');
      await bandeauVisible();
    }
    await p.tap('#npf-bandeau');
    await p.waitForSelector('#npf-l [data-npf]');
    await attendre(i % 2 ? 300 : 900);
    await p.tap(`#npf-l [data-npf="${i % 2 ? 'npf-a' : 'npf-b'}"]`);
    await attendre(1800);
    const e = await etat();
    if (e.saisie && !e.liste) reussis++;
    else console.log(`  essai ${i} : ${JSON.stringify(e)}`);
    if (e.saisie) { await p.tap('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(1800); }
  }
  verifier(reussis === 10, `brouillon ouvert du premier toucher : ${reussis} / 10`);

  console.log('Vérification du NAS qui arrive pendant le toucher');
  nas.lent = 700;
  await p.tap('#npf-bandeau'); await p.waitForSelector('#npf-l [data-npf]');
  const avant = nas.listes;
  await p.evaluate(() => dispatchEvent(new Event('online'))); // vérification discrète relancée
  await attendre(1400);                                        // elle part…
  await p.tap('#npf-l [data-npf="npf-a"]');                    // … et sa réponse arrive pendant le toucher
  await attendre(1800);
  let e = await etat();
  verifier(nas.listes > avant && e.saisie && !e.liste, 'vérification du NAS pendant le toucher : le brouillon s\'ouvre quand même');
  await p.tap('#cancel'); await p.waitForSelector('#v-carnet:not([hidden])'); await attendre(1800);
  nas.lent = 0;

  console.log('Toucher hors des vols, flèche retour');
  await p.tap('#npf-bandeau'); await p.waitForSelector('#npf-l [data-npf]'); await attendre(300);
  await p.screenshot({ path: join(CAPT, 'v018-01-liste.png') });
  await p.tap('#ou-t');                     // titre de la fenêtre
  await p.touchscreen.tap(195, 800);        // bas de l'écran, sous les vols
  await attendre(1800);
  e = await etat();
  verifier(e.liste, 'toucher le titre ou le bas de la fenêtre : la liste reste ouverte');
  await p.goBack(); await attendre(1800);
  e = await etat();
  verifier(!e.liste && e.carnet, 'flèche retour Android : la liste se ferme, retour au Carnet');
  await p.tap('#npf-bandeau'); await p.waitForSelector('#npf-l [data-npf]'); await attendre(300);
  await p.tap('#ou-x'); await attendre(1800);
  verifier(!(await etat()).liste, 'croix : la liste se ferme');
  await p.tap('#npf-bandeau'); await p.waitForSelector('#npf-l [data-npf]'); await attendre(300);
  await p.tap('#npf-l [data-npf="npf-a"]'); await p.waitForSelector('#v-saisie:not([hidden])'); await attendre(1800);
  await p.goBack(); await attendre(1800);
  e = await etat();
  verifier(!e.saisie && e.carnet, 'flèche retour depuis le brouillon : retour au Carnet (rien enregistré)');
  await p.screenshot({ path: join(CAPT, 'v018-02-retour-carnet.png') });

  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.18 réussie.');
} catch (err) {
  console.error(err.message);
  await p.screenshot({ path: join(CAPT, 'v018-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
