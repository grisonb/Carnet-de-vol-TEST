// v0.22 (R51) dans Chromium, écran 390 px : Plus › Copie sur le NAS › Changer le mot de passe. FAUX NAS local qui imite
// carnet.php version 5 (mot de passe personnalisable, ancienne clé gardée pour NPF-Q400, essais limités, protocole 2) ;
// mots de passe et vols INVENTÉS ; toute adresse non locale est BLOQUÉE.
// Vérifie : erreurs avant tout envoi, changement réussi (le NAS ne reçoit que le nouveau dans le corps), copie avec le
// nouveau, autre appareil resté sur l'ancien (Tester le dit, plus AUCUN appel automatique ensuite), « trop d'essais »,
// NAS pas encore en version 5, réponse perdue en route (le changement est retrouvé), iPad toujours accepté.
// Captures : tests/navigateur/captures/v022-*.png (non commitées). Usage : node tests/navigateur/v022.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { fauxFlyLog, VOLS_INVENTES } from '../outils/faux-flylog.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const ORIGINE_MDP = 'origine-essai-0001';
const NOUVEAU = 'Nouveau-Essai-2026!';
const srv = await serveur();
// Faux carnet.php v5 : mot de passe du carnet + clé NPF (= mot de passe d'origine) ; modes : 'v5', 'v4', 'bloque', 'perdue'
const nas = { carnet: ORIGINE_MDP, npf: ORIGINE_MDP, mode: 'v5', requetes: [], corpsChangement: [], copies: 0 };
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const corps = Buffer.concat(morceaux), cle = req.headers['x-carnet-cle'] || '';
    nas.requetes.push({ action, cle });
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    if (nas.mode === 'bloque') return json({ erreur: 'trop-d-essais', attente: 840 }, 429);
    const estCarnet = cle === nas.carnet, estNpf = !estCarnet && cle === nas.npf && ['test', 'vol-depot'].includes(action);
    if (!estCarnet && !estNpf) return json({ erreur: 'mot-de-passe' }, 401);
    if (action === 'test') return json({ ok: true, copies: nas.copies, derniere: null, ...(nas.mode === 'v4' ? {} : { cle: estCarnet ? 'carnet' : 'npf', version: 5 }) });
    if (action === 'changer-mot-de-passe') {
      if (nas.mode === 'v4') return json({ erreur: 'action' }, 400);
      const n = JSON.parse(corps.toString()).nouveau;
      nas.corpsChangement.push(corps.toString());
      if (!/^[\x21-\x7e]{12,200}$/.test(n)) return json({ erreur: 'mot-de-passe-invalide', detail: 'caracteres' }, 400);
      nas.carnet = n;
      if (nas.mode === 'perdue') { nas.mode = 'v5'; return req.socket.destroy(); } // changement fait, réponse perdue
      return json({ ok: true, changeLe: '2026-11-08T12:00:00+01:00' });
    }
    if (action === 'envoyer') { nas.copies++; return json({ ok: true, id: '20261108-120000-' + VOLS_INVENTES.length, vols: VOLS_INVENTES.length, taille: corps.length, verification: 'empreinte' }); }
    if (action === 'vol-depot') return json({ ok: true, id: 'npf-essai', remplace: false });
    if (action === 'vols-liste') return json({ vols: [] });
    if (action === 'liste') return json({ copies: [] });
    return json({ erreur: 'action' }, 400);
  });
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const ADRESSE = `http://127.0.0.1:${faux.address().port}/carnet-api/`;

const { chromium } = playwright();
const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const bloquees = [];
await ctx.route('**/*', r => { if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
const p = await ctx.newPage();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control/.test(m.text())) erreurs.push(m.text()); });
const attendre = ms => p.waitForTimeout(ms);
const fini = sel => p.waitForFunction(s => !/en cours/i.test(document.querySelector(s).textContent) && document.querySelector(s).textContent.trim() !== '', sel, { timeout: 30000 });
const tester = async () => { await p.click('#nas-test'); await fini('#nas-res'); return p.textContent('#nas-res'); };
const copier = async () => { await p.click('#nas-go'); await fini('#nas-go-res'); return p.textContent('#nas-go-res'); };
const reglage = cle => p.evaluate(async c => {
  const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
  const v = await new Promise(ok => { const r = db.transaction('reglages').objectStore('reglages').get(c); r.onsuccess = () => ok(r.result); }); db.close(); return v && v.valeur;
}, cle);
const changer = async (n1, n2 = n1) => {
  await p.fill('#cm-n1', n1); await p.fill('#cm-n2', n2); await p.click('#cm-ok');
  await fini('#cm-res'); return p.textContent('#cm-res');
};
const ouvrirChangement = async () => { await p.click('#nas-chg'); await p.waitForSelector('#cm-ok'); };

try {
  await p.goto(srv.url);
  await p.waitForSelector('body[data-pret="1"]');
  const f = join(CAPT, 'flylog-v022.csv');
  writeFileSync(f, fauxFlyLog(VOLS_INVENTES));
  await p.click('.tabs button[data-v="plus"]');
  await p.setInputFiles('#file-flylog', f);
  await p.waitForSelector('#im-ok'); await p.click('#im-ok'); await p.waitForSelector('.ctab'); await p.click('#ou-x');

  console.log('Copie sur le NAS configurée avec le mot de passe d\'origine');
  await p.click('#pl-nas');
  await p.fill('#nas-adr', ADRESSE); await p.fill('#nas-mdp', ORIGINE_MDP); await p.click('#nas-ok');
  verifier(await tester() === 'OK : le NAS répond (0 copie gardée).', 'Tester : OK');
  verifier(await p.isVisible('#nas-chg') && await p.textContent('#nas-chg') === 'Changer le mot de passe ›', 'lien « Changer le mot de passe › »');
  await p.screenshot({ path: join(CAPT, 'v022-01-copie-nas.png') });

  console.log('Changer le mot de passe : erreurs avant tout envoi');
  await ouvrirChangement();
  verifier((await p.textContent('#outil')).includes('L\'iPad (NPF-Q400) n\'a rien à changer.'), 'l\'écran dit que l\'iPad n\'a rien à changer');
  verifier(await p.$eval('#cm-ok', e => e.classList.contains('vert')) && await p.$eval('#cm-no', e => e.classList.contains('annuler')), '« Changer » vert, « Annuler » rouge');
  const avant = nas.requetes.length;
  verifier(await changer('court-1') === 'Au moins 12 caractères (7 pour l\'instant).', 'trop court : refusé');
  verifier(await changer('mot-de-passe-éssai') === 'Lettres sans accent, chiffres et signes seulement (pas d\'espace, pas d\'accent).', 'accent : refusé');
  verifier(await changer(NOUVEAU, NOUVEAU + 'x') === 'Les deux mots de passe tapés ne sont pas identiques.', 'deux saisies différentes : refusé');
  verifier(nas.requetes.length === avant, 'aucune demande au NAS pour une saisie refusée par l\'app');
  verifier(await changer(ORIGINE_MDP, ORIGINE_MDP) === 'C\'est déjà le mot de passe actuel.', 'identique à l\'actuel : refusé');
  await p.click('#cm-voir');
  verifier(await p.getAttribute('#cm-n1', 'type') === 'text', '« Afficher » montre ce qui est tapé');
  await p.click('#cm-voir');
  await p.fill('#cm-n1', NOUVEAU); await p.fill('#cm-n2', NOUVEAU);
  await p.screenshot({ path: join(CAPT, 'v022-02-changer.png') });

  console.log('Changement réussi');
  verifier(await changer(NOUVEAU) === 'Mot de passe changé : il est gardé sur ce téléphone. Sur un autre appareil, tape-le dans « Mot de passe du NAS ». L\'iPad n\'a rien à changer.',
    'mot de passe changé (message)');
  const dem = nas.requetes.filter(r => r.action === 'changer-mot-de-passe').at(-1);
  verifier(dem.cle === ORIGINE_MDP && nas.corpsChangement.at(-1) === JSON.stringify({ nouveau: NOUVEAU }), 'le NAS reçoit l\'ancien (en-tête) et le nouveau (corps) seulement');
  verifier(await reglage('nasMotDePasse') === NOUVEAU && nas.carnet === NOUVEAU, 'l\'app garde le nouveau mot de passe');
  verifier(await p.inputValue('#cm-n1') === '' && await p.inputValue('#cm-n2') === '', 'les cases sont vidées');
  await p.screenshot({ path: join(CAPT, 'v022-03-change.png') });
  await p.click('#cm-no'); await p.waitForSelector('#nas-go');
  verifier(await copier() === `Copie faite : ${VOLS_INVENTES.length} vols, ${(await p.textContent('#nas-go-res')).split(', ')[1]}`, 'Copier maintenant : OK avec le nouveau mot de passe');
  verifier(/^OK : le NAS répond \(\d+ copies? gardées?\)\.$/.test(await tester()), 'Tester : OK');

  console.log('Autre appareil resté sur l\'ancien mot de passe');
  await p.fill('#nas-mdp', ORIGINE_MDP);
  verifier(await tester() === 'Ce mot de passe n\'est plus que la clé de NPF-Q400 (iPad) : tape le mot de passe actuel du carnet.', 'Tester avec l\'ancien : « n\'est plus que la clé de NPF-Q400 »');
  await p.click('#nas-ok'); await attendre(300);
  const res = await copier();
  verifier(res === 'Mot de passe refusé.', `Copier maintenant avec l'ancien : « ${res} »`);
  await p.click('#ou-x'); await attendre(300);
  verifier(await p.textContent('#pl-nas-s') === 'Mot de passe refusé : à corriger', 'Plus : « Mot de passe refusé : à corriger »');
  const n = nas.requetes.length;
  await p.evaluate(() => { dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(2500);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]'); await attendre(4500);
  verifier(nas.requetes.length === n, `mot de passe refusé : plus AUCUN appel automatique (retour du réseau, retour dans l'app, réouverture) : ${nas.requetes.length - n}`);
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas');
  await p.fill('#nas-mdp', NOUVEAU); await p.click('#nas-ok'); await attendre(300);
  verifier(/^OK : le NAS répond/.test(await tester()), 'nouveau mot de passe retapé : OK');

  console.log('iPad (NPF-Q400) avec la clé d\'origine');
  const ipad = await fetch(`${ADRESSE}carnet.php?action=vol-depot&v=2`, { method: 'POST', headers: { 'X-Carnet-Cle': ORIGINE_MDP }, body: '{}' }).then(r => r.json());
  verifier(ipad.ok === true, 'dépôt d\'un vol avec la clé d\'origine : accepté (rien à changer sur l\'iPad)');

  console.log('Trop d\'essais, NAS pas encore en version 5, réponse perdue');
  nas.mode = 'bloque';
  verifier(await tester() === 'Trop d\'essais de mot de passe : réessaie dans 14 min.', 'trop d\'essais : « réessaie dans 14 min »');
  await ouvrirChangement();
  verifier(await changer('Encore-Un-Essai-3') === 'Trop d\'essais de mot de passe : réessaie dans 14 min.', '  aussi dans « Changer le mot de passe »');
  await p.screenshot({ path: join(CAPT, 'v022-04-trop-essais.png') });
  nas.mode = 'v4';
  verifier(await changer('Encore-Un-Essai-3') === 'Ton NAS n\'a pas encore la mise à jour (carnet.php version 5) : installe-la d\'abord (guide, « Mise à jour v5 »).', 'NAS en version 4 : « installe d\'abord la mise à jour »');
  verifier(await reglage('nasMotDePasse') === NOUVEAU && nas.carnet === NOUVEAU, '  rien n\'a changé');
  nas.mode = 'perdue';
  const perdue = await changer('Reponse-Perdue-44');
  verifier(perdue.startsWith('Mot de passe changé'), `réponse perdue en route : l'app vérifie avec le nouveau et le garde${perdue.startsWith('Mot') ? '' : ' : ' + perdue + ' ' + JSON.stringify(nas.requetes.slice(-3))}`);
  verifier(await reglage('nasMotDePasse') === 'Reponse-Perdue-44' && nas.carnet === 'Reponse-Perdue-44', '  app et NAS d\'accord');
  nas.carnet = 'change-ailleurs-77';
  verifier(await changer('Encore-Un-Essai-5') === 'Le mot de passe actuel enregistré dans l\'app est refusé par le NAS : corrige-le d\'abord (Copie sur le NAS › Mot de passe du NAS).',
    'mot de passe actuel vraiment faux : « refusé, corrige-le d\'abord »');
  verifier(await reglage('nasMotDePasse') === 'Reponse-Perdue-44', '  rien n\'a changé dans l\'app');
  await p.click('#cm-no');
  verifier(await p.isVisible('#nas-adr'), '« Annuler » : retour à Copie sur le NAS');
  verifier(!JSON.stringify(await p.evaluate(() => localStorage)).includes('Reponse-Perdue'), 'mot de passe jamais dans le stockage du navigateur hors du carnet');

  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.22 réussie.');
} catch (e) {
  console.error(e.message);
  await p.screenshot({ path: join(CAPT, 'v022-erreur.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); faux.close();
}
