// v0.12 dans Chromium, écran 390 px (vols INVENTÉS) : copie sur un FAUX NAS local qui imite le serveur web du
// Synology : toute réponse d'erreur (4xx/5xx) y est remplacée par une page HTML SANS en-têtes CORS (illisible pour
// l'app). Protocole 2 : l'app demande « &v=2 », le NAS répond alors aux erreurs avec le code 200 et
// {"erreur", "code"} ; l'app envoie aussi « &vols=N » (utile quand le PHP du NAS n'a pas zlib).
// Toute adresse non locale est BLOQUÉE (jamais le vrai NAS ni le vrai VPS). Usage : node tests/navigateur/v012.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { VERSION } from '../../js/version.js';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP_NAS = 'mot-de-passe-essai-nas';

// ---------- Faux NAS « Synology » ----------
// protocole : 2 = carnet.php v2 (comprend &v=2) ; 1 = ancien carnet.php (vrais codes HTTP, donc page HTML du Synology)
// zlib : false = le PHP du NAS ne sait pas décompresser (le nombre de vols vient de &vols=N)
const nas = { protocole: 2, zlib: false, panne: false, copies: [], requetes: [] };
const srv = await serveur();
const PAGE_SYNOLOGY = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p class="text">Désolé, la page que vous recherchez est introuvable.</p></body></html>';
const fauxNas = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  nas.requetes.push(u.search);
  const v2 = nas.protocole === 2 && u.searchParams.get('v') === '2';
  const json = (code, d) => {
    if (code >= 400 && v2) { d = { ...d, code }; code = 200; }
    if (code >= 400) { res.writeHead(code, { 'Content-Type': 'text/html' }); return res.end(PAGE_SYNOLOGY); } // comme le Synology
    res.writeHead(code, { ...cors, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(d));
  };
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    if (req.headers.origin !== srv.origine) return json(403, { erreur: 'origine' });
    if (req.headers['x-carnet-cle'] !== MDP_NAS) return json(401, { erreur: 'mot-de-passe' });
    const corps = Buffer.concat(morceaux);
    if (action === 'test') return json(200, { ok: true, copies: nas.copies.length, derniere: null });
    if (action === 'liste') return json(200, { copies: nas.copies.map(c => ({ id: c.id, date: c.date, vols: c.vols, taille: c.corps.length })).reverse() });
    if (action === 'lire') {
      const c = nas.copies.find(x => x.id === u.searchParams.get('id'));
      if (!c) return json(404, { erreur: 'introuvable' });
      res.writeHead(200, { ...cors, 'Content-Type': 'application/gzip' }); return res.end(c.corps);
    }
    if (action === 'envoyer') {
      if (nas.panne) return json(500, { erreur: 'stockage' });
      if (createHash('sha256').update(corps).digest('hex') !== req.headers['x-carnet-empreinte']) return json(400, { erreur: 'copie-abimee', detail: 'empreinte' });
      let vols;
      if (nas.zlib) vols = JSON.parse(gunzipSync(corps).toString()).vols.length;
      else {
        if (!/^\d+$/.test(u.searchParams.get('vols') || '')) return json(400, { erreur: 'copie-abimee', detail: 'vols' });
        vols = Number(u.searchParams.get('vols'));
      }
      const date = new Date(Date.now() + nas.copies.length * 60000).toISOString();
      nas.copies.push({ id: `20261106-1200${String(nas.copies.length).padStart(2, '0')}-${vols}`, date, vols, corps });
      return json(200, { ok: true, vols, taille: corps.length, verification: nas.zlib ? 'complete' : 'empreinte' });
    }
    json(400, { erreur: 'action' });
  });
});
await new Promise(ok => fauxNas.listen(0, '127.0.0.1', ok));
const ADRESSE_NAS = `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`;

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const bloquees = [];
await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; if (h === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control/.test(m.text())) erreurs.push(m.text()); });
const fini = sel => p.waitForFunction(s => !/en cours/i.test(document.querySelector(s).textContent) && document.querySelector(s).textContent.trim() !== '', sel, { timeout: 30000 });
const tester = async () => { await p.click('#nas-test'); await fini('#nas-res'); return p.textContent('#nas-res'); };
const copier = async () => { await p.click('#nas-go'); await fini('#nas-go-res'); return p.textContent('#nas-go-res'); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v012.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  const volsDepart = VOLS_INVENTES.length;

  console.log('Erreurs lisibles malgré le serveur web du Synology (protocole 2)');
  await p.click('#pl-nas');
  await p.fill('#nas-adr', ADRESSE_NAS); await p.fill('#nas-mdp', 'mauvais');
  verifier(await tester() === 'Mot de passe refusé.', 'mauvais mot de passe : « Mot de passe refusé. » (et plus « NAS injoignable »)');
  verifier(nas.requetes.at(-1).includes('action=test') && nas.requetes.at(-1).includes('v=2'), 'l\'app demande le protocole 2 (&v=2)');
  await p.fill('#nas-mdp', MDP_NAS);
  verifier(await tester() === 'OK : le NAS répond (0 copie gardée).', 'bon mot de passe : « OK : le NAS répond »');

  console.log('Copie avec un PHP sans zlib');
  nas.panne = true; // pour que l'enregistrement ne déclenche pas une copie avant « Copier maintenant »
  await p.click('#nas-ok'); await p.waitForTimeout(2500);
  nas.panne = false;
  const t = await copier();
  verifier(/^Copie faite : .* vols/.test(t) && nas.copies.length === 1, `« Copier maintenant » : ${t}`);
  verifier(nas.copies[0].vols === volsDepart && nas.requetes.some(q => q.includes('action=envoyer') && q.includes(`vols=${volsDepart}`)),
    `l'app annonce le nombre de vols (&vols=${volsDepart}) : copie rangée avec ${nas.copies[0].vols} vols`);
  await p.screenshot({ path: join(CAPT, 'v012-01-copie-faite.png') });

  console.log('Erreurs à l\'envoi');
  nas.panne = true;
  const t2 = await copier();
  verifier(t2.startsWith('Le NAS répond, mais le dossier des copies est inaccessible.'), 'erreur 500 du NAS : message clair (pas « injoignable »)');
  await p.waitForFunction(() => /erreur sur le NAS/.test(document.getElementById('nas-etat').textContent), null, { timeout: 5000 });
  verifier(true, 'état : « En attente (erreur sur le NAS) »');
  nas.panne = false;
  await p.fill('#nas-mdp', 'change-sur-le-nas'); await p.click('#nas-ok'); await p.waitForTimeout(500);
  const t3 = await copier();
  verifier(t3.startsWith('Mot de passe refusé.'), 'mot de passe changé sur le NAS : « Mot de passe refusé. » à l\'envoi');
  await p.fill('#nas-mdp', MDP_NAS); await p.click('#nas-ok'); await p.waitForTimeout(500);
  verifier(/^Copie faite/.test(await copier()), 'mot de passe corrigé : la copie repart');

  console.log('Restaurer depuis le NAS');
  await p.click('#nas-rest');
  await p.waitForSelector('#rn-l [data-id]');
  verifier((await p.$$('#rn-l [data-id]')).length === nas.copies.length, `liste : ${nas.copies.length} versions`);
  nas.copies.splice(0, nas.copies.length - 1); // une version a disparu du NAS entre-temps
  const ids = await p.$$eval('#rn-l [data-id]', l => l.map(b => b.dataset.id));
  await p.click(`#rn-l [data-id="${ids.at(-1)}"]`);
  await p.click('#rn-ok');
  await p.waitForFunction(() => document.getElementById('rn-res').textContent !== 'Téléchargement de la copie…', null, { timeout: 10000 });
  verifier(await p.textContent('#rn-res') === 'Cette copie n\'est plus sur le NAS.', 'version disparue du NAS : « Cette copie n\'est plus sur le NAS. »');
  verifier(!(await p.isDisabled('#rn-ok')), '  rien n\'est remplacé, on peut réessayer');

  await p.click('.pver').catch(() => {});
  verifier((await p.textContent('.pver')).includes('v' + VERSION), 'version de l\'app : v' + VERSION);
  console.log('Ancien carnet.php (avant protocole 2) : l\'app v0.12 marche quand même');
  nas.protocole = 1; nas.zlib = true;
  await p.click('#ou-x').catch(() => {});
  await p.click('#pl-nas');
  verifier(await tester() === 'OK : le NAS répond (1 copie gardée).', 'Tester : OK');
  verifier(/^Copie faite/.test(await copier()), 'copie acceptée par l\'ancien script');
  await p.fill('#nas-mdp', 'mauvais'); await p.click('#nas-ok'); await p.waitForTimeout(500);
  verifier((await copier()).startsWith('NAS injoignable'), 'erreur cachée par la page du Synology : « NAS injoignable » (d\'où le protocole 2)');

  verifier(!bloquees.length, 'aucune adresse extérieure appelée' + (bloquees.length ? ' : ' + bloquees.join(', ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.12 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v012-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
