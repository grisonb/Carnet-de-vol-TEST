// v0.10 dans Chromium, écran 390 px (vols INVENTÉS) : Plus › Types d'avion (R30) ; copie automatique sur un
// FAUX NAS local (R31) : configuration, regroupement des modifications, NAS injoignable, hors ligne, mot de passe
// refusé, copie automatique arrêtée, restauration d'une version. Toute adresse non locale est BLOQUÉE (jamais le vrai
// NAS ni le vrai VPS). Captures : tests/navigateur/captures/v010-*.png (non commitées). Usage : node tests/navigateur/v010.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP_NAS = 'mot-de-passe-essai-nas';
const MDP_CARTES = 'mot-de-passe-essai-cartes';

// ---------- Faux NAS (même protocole que le script du NAS) ----------
const nas = { mode: 'marche', copies: [], envois: 0, n: 0 };
const srv = await serveur();
const fauxNas = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  if (nas.mode === 'eteint') return req.socket.destroy();
  const entetes = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
  const json = (code, d) => { res.writeHead(code, { ...entetes, 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  if (req.headers.origin !== srv.origine) return json(403, { erreur: 'origine' });
  if (req.method === 'OPTIONS') { res.writeHead(204, entetes); return res.end(); }
  if (req.headers['x-carnet-cle'] !== MDP_NAS) return json(401, { erreur: 'mot-de-passe' });
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const corps = Buffer.concat(morceaux);
    if (action === 'test') return json(200, { ok: true, copies: nas.copies.length });
    if (action === 'liste') return json(200, { copies: nas.copies.map(c => ({ id: c.id, date: c.date, vols: c.vols, taille: c.corps.length })).reverse() });
    if (action === 'lire') {
      const c = nas.copies.find(x => x.id === u.searchParams.get('id'));
      if (!c) return json(404, { erreur: 'introuvable' });
      res.writeHead(200, { ...entetes, 'Content-Type': 'application/gzip' }); return res.end(c.corps);
    }
    if (action === 'envoyer') {
      nas.envois++;
      if (createHash('sha256').update(corps).digest('hex') !== req.headers['x-carnet-empreinte']) return json(400, { erreur: 'copie-abimee' });
      let d; try { d = JSON.parse(gunzipSync(corps).toString()); } catch { return json(400, { erreur: 'copie-abimee' }); }
      const date = new Date(Date.now() + nas.copies.length * 60000).toISOString(); // une minute d'écart entre les copies
      nas.copies.push({ id: `c${++nas.n}-${d.vols.length}`, date, vols: d.vols.length, corps, texte: gunzipSync(corps).toString(), d });
      return json(200, { ok: true, vols: d.vols.length, taille: corps.length });
    }
    json(400, { erreur: 'action' });
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

const onglet = v => p.click(`.tabs button[data-v="${v}"]`);
const attendre = ms => p.waitForTimeout(ms);
const sousTitre = () => p.textContent('#pl-nas-s');
const intrusif = () => p.evaluate(() => !!document.querySelector('.modal:not([hidden])') || !document.getElementById('toast').hidden);
const base = (code, arg) => p.evaluate(async ([code, arg]) => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const f = new Function('db', 'arg', `return (async () => { ${code} })()`);
  const r = await f(db, arg); db.close(); return r;
}, [code, arg]);
const nbVols = () => base("return await new Promise(ok => { const r = db.transaction('vols').objectStore('vols').count(); r.onsuccess = () => ok(r.result); });");
const reglage = cle => base("return await new Promise(ok => { const r = db.transaction('reglages').objectStore('reglages').get(arg); r.onsuccess = () => ok(r.result && r.result.valeur); });", cle);
async function attendreCopies(n, max = 15000) {
  const t = Date.now();
  while (nas.copies.length < n && Date.now() - t < max) await attendre(200);
  return nas.copies.length;
}
// Une modification du carnet sans passer par un vol : cocher / décocher une valeur de la bande d'heures
async function modifier() {
  await p.click(await p.isVisible('#v-plus') ? '#pl-heures' : '#h-strip');
  await p.click('#hs-gen [data-hs]'); await p.click('#hs-x');
}

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  // Mot de passe des cartes déjà enregistré sur ce téléphone (pour vérifier qu'il ne part jamais dans la copie)
  await base("const t = db.transaction('reglages', 'readwrite'); t.objectStore('reglages').put({ cle: 'cartesMotDePasse', valeur: arg }); await new Promise(ok => { t.oncomplete = ok; });", MDP_CARTES);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v010.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await onglet('plus');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');
  const volsDepart = await nbVols();

  // ---------------- R30 ----------------
  console.log('Types d\'avion (R30)');
  await p.click('#pl-types');
  const types = await p.$$eval('#ty-l .typerow b', l => l.map(b => b.textContent));
  const avions = await base("return await new Promise(ok => { const r = db.transaction('avions').objectStore('avions').getAll(); r.onsuccess = () => ok(r.result); });");
  const attendus = [...new Set(avions.filter(a => !a.sim).map(a => a.typeOACI))].sort();
  verifier(!types.includes('A320') && !types.includes('AT72') && !types.includes('C150') && !types.includes('DA42'), 'A320, AT72, C150, DA42 n\'apparaissent plus');
  verifier(JSON.stringify(types.filter(t => t !== 'SIM')) === JSON.stringify(attendus), `seulement les types de mes avions : ${attendus.join(', ')}`);
  verifier(types.includes('SIM') === avions.some(a => a.sim), 'ligne SIM pour les simulateurs');
  await p.click('#ty-add');
  await p.fill('#te-code', 'ZZ99'); await p.fill('#te-cons', 'ESSAI'); await p.fill('#te-mod', 'Type ajouté');
  await p.click('#te-ok');
  verifier((await p.$$eval('#ty-l .typerow b', l => l.map(b => b.textContent))).includes('ZZ99'), 'un type ajouté à la main reste dans la liste');
  await p.click('#ou-x');

  // ---------------- R31 : pas configurée ----------------
  console.log('Copie sur le NAS (R31) : pas configurée');
  verifier(await sousTitre() === 'Pas configurée', 'Plus › Copie sur le NAS : « Pas configurée »');
  await modifier(); await attendre(6000);
  verifier(nas.envois === 0, 'pas configurée : aucune copie ne part');
  await p.click('#pl-nas');
  await p.screenshot({ path: join(CAPT, 'v010-01-nas-pas-configuree.png') });
  await p.fill('#nas-adr', ADRESSE_NAS); await p.fill('#nas-mdp', 'mauvais');
  await p.click('#nas-test'); await p.waitForFunction(() => /refusé|OK|injoignable/.test(document.getElementById('nas-res').textContent));
  verifier(await p.textContent('#nas-res') === 'Mot de passe refusé.', 'Tester avec un mauvais mot de passe : « Mot de passe refusé. »');
  nas.mode = 'eteint';
  await p.fill('#nas-mdp', MDP_NAS);
  await p.click('#nas-test'); await p.waitForFunction(() => /refusé|OK|injoignable/.test(document.getElementById('nas-res').textContent));
  verifier((await p.textContent('#nas-res')).startsWith('NAS injoignable'), 'Tester NAS éteint : « NAS injoignable… »');
  nas.mode = 'marche';
  await p.click('#nas-test'); await p.waitForFunction(() => /refusé|OK|injoignable/.test(document.getElementById('nas-res').textContent));
  verifier(await p.textContent('#nas-res') === 'OK : le NAS répond (0 copie gardée).', 'Tester : « OK : le NAS répond »');
  verifier(nas.envois === 0, 'Tester n\'envoie rien');

  console.log('Configuration et première copie');
  await p.click('#nas-ok');
  verifier(await attendreCopies(1) === 1, 'Enregistrer : la première copie part toute seule');
  const c1 = nas.copies[0];
  verifier(c1.d.format === 'carnet-de-vol-sauvegarde' && c1.vols === volsDepart && c1.d.nombres.vols === volsDepart, `copie complète (${volsDepart} vols, même contenu que la sauvegarde de secours)`);
  verifier(c1.d.avions.length === avions.length && c1.d.reglages.some(r => r.cle === 'bandeHeures'), 'avions et réglages compris');
  for (const s of [MDP_NAS, MDP_CARTES, ADRESSE_NAS, 'nasEtat', 'nasMotDePasse'])
    verifier(!c1.texte.includes(s), `la copie ne contient pas « ${s.slice(0, 22)} »`);
  verifier(c1.corps[0] === 0x1f && c1.corps[1] === 0x8b && c1.corps.length < c1.texte.length / 3, `compressée (gzip) : ${c1.corps.length} octets pour ${c1.texte.length}`);
  await attendre(400);
  verifier((await p.textContent('#nas-etat')) === 'Dernière copie : à l\'instant', 'écran : « Dernière copie : à l\'instant »');
  verifier(!(await reglage('nasMotDePasse')) === false && (await reglage('nasMotDePasse')) === MDP_NAS, 'mot de passe gardé sur le téléphone');
  await p.screenshot({ path: join(CAPT, 'v010-02-nas-configuree.png') });
  await p.click('#ou-x');
  verifier(await sousTitre() === 'Dernière copie : à l\'instant', 'Plus : « Dernière copie : à l\'instant »');
  verifier(await p.evaluate(() => document.getElementById('pl-bk').classList.contains('ok')) && (await p.textContent('#pl-bk-t')) === 'Copié sur le NAS à l\'instant',
    'encart vert : « Copié sur le NAS à l\'instant »');
  await p.screenshot({ path: join(CAPT, 'v010-03-plus-nas-ok.png') });

  console.log('Regroupement des modifications');
  const avant = nas.envois;
  await modifier(); await attendre(1500); await modifier(); await attendre(1500); await modifier();
  await attendre(3000);
  verifier(nas.envois === avant, 'rien ne part tant que les modifications s\'enchaînent');
  verifier(await sousTitre() === 'En attente (copie dans quelques secondes)', 'Plus : « En attente (copie dans quelques secondes) »');
  await attendreCopies(2, 6000); await attendre(1500);
  verifier(nas.envois === avant + 1, '3 modifications rapprochées -> UNE copie, quelques secondes après la dernière');

  console.log('NAS injoignable (éteint la nuit)');
  nas.mode = 'eteint';
  await modifier(); await attendre(7000);
  verifier(await sousTitre() === 'En attente (NAS injoignable)', 'Plus : « En attente (NAS injoignable) »');
  verifier(!(await intrusif()), 'aucune fenêtre ni message affiché');
  verifier(await p.evaluate(() => document.getElementById('pl-bk').classList.contains('ok')), 'encart toujours vert (dernière copie de moins d\'un jour)');
  await p.click('#pl-nas');
  await p.screenshot({ path: join(CAPT, 'v010-04-nas-en-attente.png') });
  await p.click('#ou-x');
  await onglet('carnet');
  verifier(!(await intrusif()), 'écran du Carnet libre, rien de bloqué');

  console.log('Hors ligne, puis retour du réseau');
  await ctx.setOffline(true);
  nas.mode = 'marche';
  const n0 = nas.copies.length;
  await modifier(); await attendre(1000); await modifier();
  await attendre(6500);
  await onglet('plus');
  verifier(await sousTitre() === 'En attente (pas de réseau)', 'Plus : « En attente (pas de réseau) »');
  verifier(nas.copies.length === n0, 'hors ligne : rien ne part');
  await ctx.setOffline(false);
  await attendreCopies(n0 + 1, 8000); await attendre(2500);
  verifier(nas.copies.length === n0 + 1, 'retour du réseau : UNE copie part toute seule (la dernière version)');
  verifier(await sousTitre() === 'Dernière copie : à l\'instant', '  puis « Dernière copie : à l\'instant »');

  console.log('Mot de passe refusé');
  await p.click('#pl-nas'); await p.fill('#nas-mdp', 'mauvais'); await p.click('#nas-ok'); await attendre(3000);
  await p.click('#ou-x');
  verifier(await sousTitre() === 'Mot de passe refusé : à corriger', 'Plus : « Mot de passe refusé : à corriger »');
  verifier(!(await intrusif()), '  sans fenêtre ni message');
  const e0 = nas.envois;
  await attendre(4000);
  verifier(nas.envois === e0, '  pas d\'essais répétés avec un mauvais mot de passe');
  await p.click('#pl-nas'); await p.fill('#nas-mdp', MDP_NAS); await p.click('#nas-ok');
  await attendreCopies(n0 + 2, 8000);
  verifier(nas.copies.length === n0 + 2, 'bon mot de passe : la copie repart');
  await p.click('#ou-x');

  console.log('Copie automatique arrêtée, « Copier maintenant »');
  await p.click('#pl-nas'); await p.click('#nas-auto');
  verifier(await p.getAttribute('#nas-auto', 'aria-checked') === 'false', 'interrupteur « Copie automatique » arrêté');
  await p.click('#ou-x');
  const n1 = nas.copies.length;
  await modifier(); await attendre(7000);
  verifier(nas.copies.length === n1, 'copie automatique arrêtée : rien ne part');
  verifier((await sousTitre()).startsWith('Copie automatique arrêtée'), 'Plus : « Copie automatique arrêtée · … »');
  await p.click('#pl-nas'); await p.click('#nas-go');
  await p.waitForFunction(() => /Copie faite|NAS|Enregistre/.test(document.getElementById('nas-go-res').textContent));
  verifier((await p.textContent('#nas-go-res')).startsWith('Copie faite') && nas.copies.length === n1 + 1, '« Copier maintenant » : ' + await p.textContent('#nas-go-res'));
  await p.click('#nas-auto');
  await p.click('#ou-x');

  console.log('Restaurer depuis le NAS');
  // un vol de plus (saisi dans l'app) : la copie suivante en a un de plus que la première
  await onglet('carnet'); await p.click('#fab');
  await p.fill('#f-t0', '1000'); await p.fill('#f-t1', '1100'); await p.click('#save');
  await attendreCopies(n1 + 2, 10000);
  verifier(nas.copies.at(-1).vols === volsDepart + 1, `vol ajouté : nouvelle copie avec ${volsDepart + 1} vols`);
  await onglet('plus'); await p.click('#pl-nas-rest');
  await p.waitForSelector('#rn-l .nasv');
  const lignes = await p.$$eval('#rn-l .nasv', l => l.map(b => b.textContent));
  verifier(lignes.length === nas.copies.length, `liste des versions gardées : ${lignes.length}`);
  verifier(/^\S+ \d{2}\/\d{2}\/\d{4} à \d{2}h\d{2}/.test(lignes[0]) && lignes[0].includes(`${volsDepart + 1} vols`), 'date, heure et nombre de vols : ' + lignes[0]);
  await p.screenshot({ path: join(CAPT, 'v010-05-restaurer-liste.png') });
  await p.click(`#rn-l .nasv[data-id="${c1.id}"]`);
  verifier((await p.textContent('#ou-c h3')) === 'Remplacer tout le carnet par cette version ?', 'confirmation « Remplacer tout le carnet par cette version ? »');
  await p.screenshot({ path: join(CAPT, 'v010-06-restaurer-confirmation.png') });
  await p.click('#rn-no');
  await p.waitForSelector('#rn-l .nasv');
  verifier(await nbVols() === volsDepart + 1, 'Annuler : rien ne change');
  await p.click(`#rn-l .nasv[data-id="${c1.id}"]`); await p.click('#rn-ok');
  await p.waitForSelector('#outil', { state: 'hidden' });
  verifier(await nbVols() === volsDepart, `restauré : le carnet revient à la version choisie (${volsDepart} vols)`);
  verifier(await reglage('nasMotDePasse') === MDP_NAS && await reglage('nasAdresse') === ADRESSE_NAS && await reglage('cartesMotDePasse') === MDP_CARTES,
    'mots de passe et adresse du NAS gardés après la restauration');
  await attendreCopies(nas.copies.length + 1, 10000);
  verifier(nas.copies.at(-1).vols === volsDepart, 'la version restaurée est à son tour copiée sur le NAS');

  verifier(!bloquees.length, 'aucun appel hors de cet ordinateur' + (bloquees.length ? ' : ' + bloquees.join(' ') : ''));
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.10 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v010-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); fauxNas.close();
}
