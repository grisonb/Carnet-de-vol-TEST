// v0.14 dans Chromium, écran 390 px (vols et avions INVENTÉS) : copie sur un FAUX NAS local sans les photos d'avion
// (R35), sauvegarde de secours avec les photos, restauration depuis le NAS qui garde les photos du téléphone ; PDF EASA
// créé depuis l'app (R36 / R37) ; touche Entrée de la recherche qui ferme le clavier (R39).
// Toute adresse non locale est BLOQUÉE (jamais le vrai NAS ni le vrai VPS). Usage : node tests/navigateur/v014.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP_NAS = 'mot-de-passe-essai-nas';
// Petite photo inventée (un carré gris, PNG valide)
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNoaGjAihgGqwQAJ9wf4Q8ZbEYAAAAASUVORK5CYII=';

const nas = { copies: [] };
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = d => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  const m = []; req.on('data', x => m.push(x));
  req.on('end', () => {
    if (req.headers['x-carnet-cle'] !== MDP_NAS) return json({ erreur: 'mot-de-passe', code: 401 });
    const corps = Buffer.concat(m);
    if (action === 'test') return json({ ok: true, copies: nas.copies.length });
    if (action === 'envoyer') {
      const d = JSON.parse(gunzipSync(corps).toString());
      nas.copies.push({ id: `20261106-12000${nas.copies.length}-${d.vols.length}`, date: new Date().toISOString(), vols: d.vols.length, corps, d });
      return json({ ok: true, vols: d.vols.length, taille: corps.length });
    }
    if (action === 'liste') return json({ copies: nas.copies.map(c => ({ id: c.id, date: c.date, vols: c.vols, taille: c.corps.length })).reverse() });
    if (action === 'lire') {
      const c = nas.copies.find(x => x.id === u.searchParams.get('id'));
      if (!c) return json({ erreur: 'introuvable', code: 404 });
      res.writeHead(200, { ...cors, 'Content-Type': 'application/gzip' }); return res.end(c.corps);
    }
    json({ erreur: 'action', code: 400 });
  });
});
await new Promise(ok => fauxNas.listen(0, '127.0.0.1', ok));
const ADRESSE_NAS = `http://127.0.0.1:${fauxNas.address().port}/carnet-api/`;

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
const bloquees = [];
await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; if (h === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) erreurs.push(m.text()); });
const base = (code, arg) => p.evaluate(async ([code, arg]) => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const r = await new Function('db', 'arg', `return (async () => { ${code} })()`)(db, arg); db.close(); return r;
}, [code, arg]);
const avionsBase = () => base("return await new Promise(ok => { const r = db.transaction('avions').objectStore('avions').getAll(); r.onsuccess = () => ok(r.result); });");

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v014.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  // Une photo sur chaque avion (comme prises sur le téléphone)
  await base("const t = db.transaction('avions', 'readwrite'); const s = t.objectStore('avions'); const r = s.getAll(); r.onsuccess = () => { for (const a of r.result) s.put({ ...a, photo: arg }); }; await new Promise(ok => { t.oncomplete = ok; });", PHOTO);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  const avions = await avionsBase();
  verifier(avions.length > 1 && avions.every(a => a.photo === PHOTO), `${avions.length} avions avec une photo sur le téléphone`);

  console.log('Copie NAS sans les photos (R35)');
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas');
  verifier((await p.textContent('#ou-c .hint')).includes('sans les photos d\'avion'), 'l\'écran dit que la copie ne contient pas les photos');
  await p.fill('#nas-adr', ADRESSE_NAS); await p.fill('#nas-mdp', MDP_NAS); await p.click('#nas-ok');
  for (let i = 0; i < 40 && !nas.copies.length; i++) await p.waitForTimeout(250);
  verifier(nas.copies.length === 1, 'copie partie sur le NAS');
  const c = nas.copies[0].d;
  verifier(c.avions.length === avions.length && c.avions.every(a => !('photo' in a)) && c.sansPhotos === true, 'aucune photo dans la copie NAS');
  verifier(c.vols.length === VOLS_INVENTES.length && c.personnes.length > 0 && c.reglages.length > 0, `  vols, personnes et réglages bien présents (${c.reglages.map(r => r.cle).join(', ')})`);
  verifier(!JSON.stringify(c).includes(MDP_NAS), '  le mot de passe du NAS n\'est jamais dans la copie');
  await p.click('#ou-x');

  console.log('Sauvegarde de secours manuelle : avec les photos');
  await p.click('#pl-save');
  verifier((await p.textContent('#ou-c .hint')).includes('photos comprises'), 'l\'écran dit « photos comprises »');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sv-dl')]);
  const sauv = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  verifier(sauv.avions.every(a => a.photo === PHOTO) && !sauv.sansPhotos, 'la sauvegarde de secours contient les photos');
  const tailleSauv = readFileSync(await dl.path()).length, tailleNas = Buffer.byteLength(gunzipSync(nas.copies[0].corps));
  verifier(tailleNas < tailleSauv, `copie NAS plus légère (${tailleNas} o contre ${tailleSauv} o, avant compression)`);
  await p.click('#ou-x');

  console.log('Restaurer depuis le NAS : les photos du téléphone sont gardées');
  await p.click('#pl-nas-rest'); await p.waitForSelector('#rn-l .nasv');
  await p.click('#rn-l .nasv');
  verifier((await p.textContent('#rn-photos')) === 'Les photos d\'avion du téléphone sont gardées.', 'confirmation : « Les photos d\'avion du téléphone sont gardées. »');
  await p.screenshot({ path: join(CAPT, 'v014-01-restaurer-confirmation.png') });
  await p.click('#rn-ok'); await p.waitForSelector('#outil', { state: 'hidden' });
  const apres = await avionsBase();
  verifier(apres.length === avions.length && apres.every(a => a.photo === PHOTO), 'après restauration : chaque avion a toujours sa photo');

  console.log('Recherche : la touche Entrée ferme le clavier (R39)');
  await p.click('.tabs button[data-v="carnet"]');
  await p.click('#q-open');
  verifier(await p.evaluate(() => document.activeElement.id) === 'q', 'loupe : le champ de recherche a le clavier');
  await p.keyboard.type('LFMN'); await p.waitForTimeout(400);
  const n = (await p.$$('#list .flight')).length;
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  verifier(await p.evaluate(() => document.activeElement.id) !== 'q', 'Entrée : le champ perd le focus (le clavier se ferme)');
  verifier(await p.inputValue('#q') === 'LFMN' && await p.isVisible('#q') && (await p.$$('#list .flight')).length === n && n > 0,
    `le texte et les ${n} résultats restent affichés`);
  await p.screenshot({ path: join(CAPT, 'v014-02-recherche-apres-entree.png') });

  console.log('PDF EASA depuis l\'app');
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-pdf');
  await p.click('#xp-go'); await p.waitForSelector('#xp-fin:not([hidden])', { timeout: 30000 });
  const [pdf] = await Promise.all([p.waitForEvent('download'), p.click('#xp-dl')]);
  const octets = readFileSync(await pdf.path());
  verifier(octets.subarray(0, 5).toString() === '%PDF-' && (await p.textContent('#xp-prog')).startsWith('1 page'), 'PDF créé : ' + await p.textContent('#xp-prog'));

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + bloquees.join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.14 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v014-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
