// v0.23 (R50 étape 3) dans Chromium : DEUX appareils (téléphone 390 px, PC 1280 px, chacun sa base) et un FAUX NAS
// local qui suit les règles de carnet.php v5 (numéros, version de départ, conflits, suppressions, pages).
// 1 200 vols INVENTÉS ; toute adresse non locale est BLOQUÉE.
// Vérifie : le téléphone envoie tout (par paquets), le PC reçoit tout (par pages) et a les mêmes totaux ; le PC ne
// modifie rien (boutons cachés, saisie inactive, écriture refusée), n'envoie jamais rien ; modifications du téléphone
// (saisie, suppression, réglage du carnet) reçues par le PC ; hors ligne puis retour du réseau ; réactivation sans
// tout renvoyer ; NAS encore en version 4 ; photos et mot de passe jamais envoyés.
// Captures : tests/navigateur/captures/v023-*.png (non commitées). Usage : node tests/navigateur/v023.mjs
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { volsPDF } from '../outils/vols-pdf.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const MDP = 'mot-de-passe-essai-23';
const srv = await serveur();
// ---------- Faux NAS (carnet.php v5) ----------
const nas = { rev: 0, el: new Map(), mode: 'v5', envois: [], copies: 0 };
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    if (req.headers['x-carnet-cle'] !== MDP) return json({ erreur: 'mot-de-passe' }, 401);
    if (nas.mode === 'v4' && action.startsWith('synchro')) return json({ erreur: 'action' }, 400);
    if (action === 'test') return json({ ok: true, copies: nas.copies, derniere: null, cle: 'carnet', version: 5 });
    if (action === 'envoyer') { nas.copies++; return json({ ok: true, id: 'x', vols: 1, taille: 1, verification: 'empreinte' }); }
    if (action === 'vols-liste') return json({ vols: [] });
    if (action === 'synchro-etat') return json({ ok: true, rev: nas.rev, nombres: {} });
    if (action === 'synchro-recevoir') {
      const depuis = Number(u.searchParams.get('depuis')), limite = Number(u.searchParams.get('limite'));
      const tous = [...nas.el.entries()].filter(([, e]) => e.rev > depuis).sort((a, b) => a[1].rev - b[1].rev);
      const page = tous.slice(0, limite).map(([cle, e]) => ({ magasin: cle.split('/')[0], id: cle.slice(cle.indexOf('/') + 1), ...e }));
      const suite = tous.length > limite;
      return json({ ok: true, rev: nas.rev, elements: page, suite, jusqua: suite ? page.at(-1).rev : nas.rev });
    }
    if (action === 'synchro-envoyer') {
      const b = JSON.parse(Buffer.concat(morceaux).toString());
      nas.envois.push({ appareil: b.appareil, n: b.modifications.length, texte: JSON.stringify(b) });
      const acceptees = [], deja = [], conflits = [];
      for (const m of b.modifications) {
        const cle = `${m.magasin}/${m.id}`, a = nas.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : m.donnees;
        if (a && !!a.supprime === !!m.supprime && JSON.stringify(a.donnees) === JSON.stringify(donnees)) { deja.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        if (m.base !== revA) { conflits.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        nas.rev++; nas.el.set(cle, { rev: nas.rev, supprime: !!m.supprime, donnees, appareil: b.appareil });
        acceptees.push({ magasin: m.magasin, id: m.id, rev: nas.rev });
      }
      return json({ ok: true, rev: nas.rev, acceptees, deja, conflits });
    }
    return json({ erreur: 'action' }, 400);
  });
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const ADRESSE = `http://127.0.0.1:${faux.address().port}/carnet-api/`;
const vivants = magasin => [...nas.el.entries()].filter(([k, e]) => k.startsWith(magasin + '/') && !e.supprime);

// ---------- Deux appareils ----------
const { chromium } = playwright();
const navigateur = await chromium.launch();
const bloquees = [], erreurs = [];
async function appareil(nom, options) {
  const ctx = await navigateur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => { if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  p.on('pageerror', e => erreurs.push(`${nom} : ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control/.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  p.requetes = [];
  p.on('request', r => { const a = new URL(r.url()).searchParams.get('action'); if (a && r.method() === 'POST') p.requetes.push(a); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const tel = await appareil('téléphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pc = await appareil('PC', { viewport: { width: 1280, height: 800 } });
const T = tel.p, P = pc.p;
const fini = (p, sel) => p.waitForFunction(s => { const e = document.querySelector(s); return e && e.textContent.trim() && !/en cours|Envoi :|Réception :|prêt \?/.test(e.textContent); }, sel, { timeout: 60000 });
const etatPage = p => p.evaluate(async () => {
  const e = await import('./js/etat.js'), t = await import('./js/totaux.js');
  const tot = t.calculerTotaux(e.etat.vols, e.etat.avions);
  return { vols: e.etat.vols.length, avions: e.etat.avions.size, ids: e.etat.vols.map(v => v.id).sort().join(','), totaux: JSON.stringify(tot),
    titulaire: e.etat.reglages.titulaire || '', photo: [...e.etat.avions.values()].some(a => a.photo) };
});
const configurerNas = async p => {
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas');
  await p.fill('#nas-adr', ADRESSE); await p.fill('#nas-mdp', MDP); await p.click('#nas-ok'); await p.waitForTimeout(300); await p.click('#ou-x');
};
const attendre = (p, ms) => p.waitForTimeout(ms);

try {
  console.log('Téléphone : 1 200 vols inventés, une photo d\'avion');
  const { vols, avions } = volsPDF(1200);
  const listeAvions = [...avions.values()];
  listeAvions[0] = { ...listeAvions[0], photo: 'data:image/jpeg;base64,/9j/PHOTO-ESSAI', photoCredit: { source: 'Wikimedia Commons', auteur: 'Jean Essai' } };
  await T.evaluate(async ([v, a]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['vols', 'avions', 'reglages'], 'readwrite');
    for (const x of v) t.objectStore('vols').put(x); for (const x of a) t.objectStore('avions').put(x);
    t.objectStore('reglages').put({ cle: 'titulaire', valeur: 'Pilote Essai' });
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [vols, listeAvions]);
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  const avantTel = await etatPage(T);
  verifier(avantTel.vols === vols.length, `téléphone : ${avantTel.vols} vols`);
  await configurerNas(T);

  console.log('Téléphone : « Ce téléphone envoie le carnet »');
  await T.click('#pl-sync');
  verifier(await T.isVisible('#sy-ref') && await T.isVisible('#sy-cons'), 'deux choix : envoyer / consulter');
  await T.screenshot({ path: join(CAPT, 'v023-01-tel-choix.png') });
  nas.mode = 'v4';
  await T.click('#sy-ref'); await T.click('#sr-ok'); await fini(T, '#sr-res');
  verifier(await T.textContent('#sr-res') === 'Le NAS n\'a pas encore carnet.php version 5 (guide, « Mise à jour v5 »).', 'NAS encore en version 4 : message, rien n\'est activé');
  nas.mode = 'v5';
  await T.click('#sr-ok'); await fini(T, '#sr-res');
  const envoi = await T.textContent('#sr-res');
  const attendu = vols.length + listeAvions.length + 1;
  verifier(envoi === `Envoyé : ${attendu.toLocaleString('fr-FR')} modifications. Le NAS a le carnet à jour (${vols.length.toLocaleString('fr-FR')} vols).`, `premier envoi : ${envoi}`);
  verifier(nas.envois.length === Math.ceil(attendu / 500) && nas.envois.every(e => e.n <= 500 && e.appareil.startsWith('tel-')), `par paquets de 500 au plus : ${nas.envois.map(e => e.n).join(' + ')}`);
  verifier(vivants('vols').length === vols.length && vivants('avions').length === listeAvions.length, 'le NAS a tous les vols et tous les avions');
  const texteEnvoye = nas.envois.map(e => e.texte).join('');
  verifier(!texteEnvoye.includes('PHOTO-ESSAI') && texteEnvoye.includes('Jean Essai'), 'photo d\'avion jamais envoyée (son crédit oui)');
  verifier(!texteEnvoye.includes(MDP) && !texteEnvoye.includes(ADRESSE), 'ni le mot de passe ni l\'adresse du NAS dans ce qui est envoyé');
  await T.screenshot({ path: join(CAPT, 'v023-02-tel-envoye.png') });
  await T.waitForSelector('#sy-etat', { timeout: 10000 });
  verifier((await T.textContent('#sy-etat')).startsWith('Ce téléphone envoie le carnet · à jour'), `état : ${await T.textContent('#sy-etat')}`);
  await T.click('#ou-x');

  console.log('PC : configuration du NAS, puis « consulter le carnet du téléphone »');
  await configurerNas(P);
  await attendre(P, 6500);
  verifier(!P.requetes.includes('envoyer'), 'PC au carnet vide : aucune copie envoyée au NAS');
  await P.click('#pl-sync'); await P.click('#sy-cons');
  verifier((await P.textContent('#outil')).includes('est remplacé par celui que le téléphone a envoyé'), 'avertissement : le carnet du PC sera remplacé');
  await P.click('#sc-ok'); await fini(P, '#sc-res');
  verifier((await P.textContent('#sc-res')).startsWith(`À jour : ${vols.length.toLocaleString('fr-FR')} vols`), `PC : ${await P.textContent('#sc-res')}`);
  await P.screenshot({ path: join(CAPT, 'v023-03-pc-recu.png') });
  await P.click('#ou-x');
  const e1 = await etatPage(T), e2 = await etatPage(P);
  verifier(e2.vols === e1.vols && e2.ids === e1.ids && e2.avions === e1.avions, 'PC : les mêmes vols et avions que le téléphone');
  verifier(e2.totaux === e1.totaux, 'PC : exactement les mêmes totaux');
  verifier(e2.titulaire === 'Pilote Essai' && !e2.photo, 'PC : réglage du carnet reçu (titulaire) ; pas de photo');

  console.log('PC en consultation : rien ne se modifie');
  await P.click('.tabs button[data-v="carnet"]');
  verifier(await P.isVisible('#sync-bandeau') && (await P.textContent('#sync-bandeau')).startsWith('Consultation · à jour'), `bandeau : ${await P.textContent('#sync-bandeau')}`);
  verifier(!(await P.isVisible('#fab')), 'pas de « + Nouveau vol »');
  await P.screenshot({ path: join(CAPT, 'v023-04-pc-carnet.png') });
  await P.click('#list .flight'); await P.waitForSelector('#v-saisie:not([hidden])');
  verifier(await P.textContent('#f-title') === 'Vol (consultation)' && (await P.textContent('#f-sub')).endsWith('se modifie sur le téléphone'), 'vol ouvert : « Vol (consultation) · se modifie sur le téléphone »');
  verifier(!(await P.isVisible('#save')) && !(await P.isVisible('#del-zone')), 'ni « Enregistrer » ni « Supprimer »');
  verifier(await P.$eval('#v-saisie .c-vol', e => getComputedStyle(e).pointerEvents) === 'none', 'cases du vol inactives');
  await P.screenshot({ path: join(CAPT, 'v023-05-pc-vol.png') });
  await P.click('#cancel');
  const refus = await P.evaluate(async () => {
    const e = await import('./js/etat.js');
    const r = await e.enregistrerVol({ ...e.etat.vols[0], remarques: 'ECRIT SUR LE PC' });
    const db = await new Promise(ok => { const q = indexedDB.open('carnet-de-vol'); q.onsuccess = () => ok(q.result); });
    const v = await new Promise(ok => { const q = db.transaction('vols').objectStore('vols').get(e.etat.vols[0].id); q.onsuccess = () => ok(q.result); }); db.close();
    return { r, ecrit: v.remarques === 'ECRIT SUR LE PC', toast: document.getElementById('toast').textContent };
  });
  verifier(refus.r === false && !refus.ecrit && refus.toast === 'Consultation : les modifications se font sur le téléphone.', 'écriture forcée : refusée, rien d\'écrit, message');
  await P.click('.tabs button[data-v="plus"]');
  for (const id of ['#pl-import', '#pl-restore', '#pl-nas-rest', '#pl-pers', '#pl-fiches']) verifier(!(await P.isVisible(id)), `Plus : ${id} caché`);
  await P.screenshot({ path: join(CAPT, 'v023-06-pc-plus.png'), fullPage: true });

  console.log('Téléphone : modification (saisie), suppression, réglage du carnet');
  await T.click('.tabs button[data-v="carnet"]');
  await T.click('#list .flight'); await T.waitForSelector('#v-saisie:not([hidden])');
  const idModifie = await T.evaluate(async () => (await import('./js/etat.js')).etat.vols[0].id);
  await T.fill('#f-rem', 'MODIFIE SUR LE TELEPHONE'); await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const idSupprime = await T.evaluate(async () => { const e = await import('./js/etat.js'); const id = e.etat.vols.at(-1).id; await e.supprimerVol(id); await e.enregistrerReglage('titulaire', 'Pilote Essai Deux'); return id; });
  const n0 = nas.envois.length;
  await attendre(T, 8000);
  verifier(nas.envois.length > n0 && nas.el.get(`vols/${idSupprime}`).supprime && nas.el.get(`vols/${idModifie}`).donnees.remarques === 'MODIFIE SUR LE TELEPHONE',
    `envoyé tout seul quelques secondes après : ${nas.envois.slice(n0).map(e => e.n).join(' + ')} modification(s)`);
  verifier(nas.envois.slice(n0).reduce((s, e) => s + e.n, 0) === 3, '  seulement ce qui a changé (3), pas tout le carnet');

  console.log('PC : reçoit les nouveautés (retour dans l\'app)');
  await P.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  for (let i = 0; i < 60 && (await etatPage(P)).vols !== (await etatPage(T)).vols; i++) await attendre(P, 250);
  const e3 = await etatPage(P), e4 = await etatPage(T);
  verifier(e3.ids === e4.ids && e3.totaux === e4.totaux && e3.titulaire === 'Pilote Essai Deux', 'PC : suppression, modification et réglage reçus ; mêmes totaux'
    + (e3.ids === e4.ids && e3.totaux === e4.totaux && e3.titulaire === 'Pilote Essai Deux' ? '' : ` [ids ${e3.ids === e4.ids} ${e3.vols}/${e4.vols} totaux ${e3.totaux === e4.totaux} titulaire ${e3.titulaire}]`));
  const rem = await P.evaluate(async id => (await import('./js/etat.js')).etat.vols.find(v => v.id === id).remarques, idModifie);
  verifier(rem === 'MODIFIE SUR LE TELEPHONE', '  remarque modifiée reçue');

  console.log('Téléphone hors ligne, puis retour du réseau');
  await tel.ctx.setOffline(true);
  await T.evaluate(async () => { const e = await import('./js/etat.js'); await e.enregistrerVol({ ...e.etat.vols[1], id: 'hors-ligne-1', remarques: 'SAISI HORS LIGNE' }); });
  await attendre(T, 7000);
  verifier(!nas.el.has('vols/hors-ligne-1'), 'pas de réseau : rien ne part');
  await T.click('.tabs button[data-v="plus"]');
  verifier(await T.textContent('#pl-sync-s') === 'Envoi en attente (pas de réseau)', `Plus : ${await T.textContent('#pl-sync-s')}`);
  await T.screenshot({ path: join(CAPT, 'v023-07-tel-attente.png') });
  await tel.ctx.setOffline(false);
  await T.evaluate(() => dispatchEvent(new Event('online')));
  await T.waitForFunction(() => document.getElementById('pl-sync-s').textContent.startsWith('Ce téléphone envoie le carnet · à jour'), null, { timeout: 20000 });
  verifier(nas.el.get('vols/hors-ligne-1')?.donnees.remarques === 'SAISI HORS LIGNE', 'réseau revenu : le vol saisi hors ligne est parti tout seul');
  await P.click('#pl-sync'); await P.click('#sy-go'); await fini(P, '#sy-res');
  verifier((await P.textContent('#sy-res')).startsWith('À jour') && (await etatPage(P)).ids === (await etatPage(T)).ids, 'PC « Mettre à jour maintenant » : le vol est là');
  await P.click('#ou-x');

  console.log('Téléphone : arrêt puis réactivation (rien d\'identique n\'est renvoyé)');
  await T.click('#pl-sync'); await T.click('#sy-stop'); await T.click('#sa-ok');
  verifier(await T.textContent('#pl-sync-s') === 'Arrêtée', 'envoi arrêté');
  const n1 = nas.envois.length;
  await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok'); await fini(T, '#sr-res');
  verifier(await T.textContent('#sr-res') === `Rien de nouveau : le NAS a déjà le carnet à jour (${(await etatPage(T)).vols.toLocaleString('fr-FR')} vols).` && nas.envois.length === n1,
    `réactivation : ${await T.textContent('#sr-res')}`);

  verifier(!P.requetes.some(a => a === 'envoyer' || a === 'synchro-envoyer' || a === 'vol-retirer'), `le PC n'a JAMAIS rien envoyé au NAS (demandes : ${[...new Set(P.requetes)].join(', ')})`);
  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.23 réussie.');
} catch (e) {
  console.error(e.message);
  await T.screenshot({ path: join(CAPT, 'v023-erreur-tel.png') }).catch(() => {});
  await P.screenshot({ path: join(CAPT, 'v023-erreur-pc.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); faux.close();
}
