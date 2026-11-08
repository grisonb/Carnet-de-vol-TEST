// v0.24 (R50 étape 4) dans Chromium : synchro dans les DEUX sens. Téléphone 390 px et PC 1280 px (chacun sa base) autour
// d'un FAUX NAS local qui suit les règles de carnet.php v5. Vols INVENTÉS ; toute adresse non locale est BLOQUÉE.
// Vérifie : passage du PC de consultation à modification sans rien renvoyer ; ajout / modification / suppression de chaque
// côté ; conflits modification-modification et suppression-modification avec les 3 choix ; doublon ; vols NPF sur le
// téléphone seulement ; hors ligne des deux côtés ; plus de 20 suppressions (remettre / confirmer) ; « Annuler la
// dernière synchro » ; mot de passe refusé (plus d'appel automatique) ; copies NAS du téléphone seulement ; mêmes totaux.
// Captures : tests/navigateur/captures/v024-*.png (non commitées). Usage : node tests/navigateur/v024.mjs
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { volsPDF } from '../outils/vols-pdf.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const srv = await serveur();
// ---------- Faux NAS (carnet.php v5) ----------
const nas = { mdp: 'mot-de-passe-essai-24', rev: 0, el: new Map(), envois: [], requetes: [] };
const NPF = [{ format: 'carnet-vol-npf', version: 2, id: 'npf-essai-24', exporteLe: '2026-11-08T10:00:00Z', date: '2026-11-07', blocDepart: '10:00', blocArrivee: '11:00', immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMD' }];
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    nas.requetes.push({ action, cle: req.headers['x-carnet-cle'] });
    if (req.headers['x-carnet-cle'] !== nas.mdp) return json({ erreur: 'mot-de-passe' }, 401);
    if (action === 'test') return json({ ok: true, copies: 0, derniere: null, cle: 'carnet', version: 5 });
    if (action === 'envoyer') return json({ ok: true, id: 'x', vols: 1, taille: 1, verification: 'empreinte' });
    if (action === 'vols-liste') return json({ vols: NPF });
    if (action === 'vol-retirer') return json({ ok: true, retire: true });
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
      nas.envois.push({ appareil: b.appareil, n: b.modifications.length, suppr: b.modifications.filter(m => m.supprime).length });
      const acceptees = [], deja = [], conflits = [];
      for (const m of b.modifications) {
        const cle = `${m.magasin}/${m.id}`, a = nas.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : m.donnees;
        if (a && !!a.supprime === !!m.supprime && JSON.stringify(a.donnees) === JSON.stringify(donnees)) { deja.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        if (m.base !== revA) { conflits.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        nas.rev++; nas.el.set(cle, { rev: nas.rev, supprime: !!m.supprime, donnees, appareil: b.appareil, le: '2026-11-08T12:00:00+01:00' });
        acceptees.push({ magasin: m.magasin, id: m.id, rev: nas.rev });
      }
      return json({ ok: true, rev: nas.rev, acceptees, deja, conflits });
    }
    return json({ erreur: 'action' }, 400);
  });
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const ADRESSE = `http://127.0.0.1:${faux.address().port}/carnet-api/`;

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
const attendre = (p, ms) => p.waitForTimeout(ms);
const fini = (p, sel) => p.waitForFunction(s => { const e = document.querySelector(s); return e && e.textContent.trim() && !/en cours|Envoi :|Réception :|prêt \?|Récupération/.test(e.textContent); }, sel, { timeout: 60000 });
const sync = p => p.evaluate(async () => (await (await import('./js/ui/synchro.js')).synchroniser()).statut);
const carnet = p => p.evaluate(async () => {
  const e = await import('./js/etat.js'), t = await import('./js/totaux.js');
  return { n: e.etat.vols.length, ids: e.etat.vols.map(v => v.id).sort().join(','), totaux: JSON.stringify(t.calculerTotaux(e.etat.vols, e.etat.avions)) };
});
const volDe = (p, id) => p.evaluate(async id => (await import('./js/etat.js')).etat.vols.find(v => v.id === id) || null, id);
const modifier = (p, id, champs) => p.evaluate(async ([id, champs]) => { const e = await import('./js/etat.js'); return e.enregistrerVol({ ...e.etat.vols.find(v => v.id === id), ...champs }); }, [id, champs]);
const ajouter = (p, vol) => p.evaluate(async v => { const e = await import('./js/etat.js'); return e.enregistrerVol(v); }, vol);
const supprimer = (p, ids) => p.evaluate(async ids => { const e = await import('./js/etat.js'); for (const id of ids) await e.supprimerVol(id); }, ids);
const configurerNas = async p => {
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas');
  await p.fill('#nas-adr', ADRESSE); await p.fill('#nas-mdp', nas.mdp); await p.click('#nas-ok'); await attendre(p, 300); await p.click('#ou-x');
};
const onglet = (p, v) => p.click(`.tabs button[data-v="${v}"]`);
const memes = async (msg) => { const a = await carnet(T), b = await carnet(P); verifier(a.ids === b.ids && a.totaux === b.totaux, `${msg} (${a.n} / ${b.n} vols, mêmes totaux : ${a.totaux === b.totaux})`); };

try {
  console.log('Départ : téléphone (référence) + PC en consultation (comme la v0.23)');
  const { vols, avions } = volsPDF(60);
  await T.evaluate(async ([v, a]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['vols', 'avions'], 'readwrite');
    for (const x of v) t.objectStore('vols').put(x); for (const x of a) t.objectStore('avions').put(x);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [vols, [...avions.values()]]);
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await configurerNas(T);
  await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok'); await fini(T, '#sr-res');
  await T.click('#ou-x');
  await configurerNas(P);
  await P.click('#pl-sync'); await P.click('#sy-cons'); await P.click('#sc-ok'); await fini(P, '#sc-res'); await P.click('#ou-x');
  await memes('PC en consultation : même carnet');

  console.log('Passage du PC : consultation -> modification');
  const envoisAvant = nas.envois.length;
  await P.click('#pl-sync');
  verifier(await P.isVisible('#sy-passer'), '« Passer en modification › »');
  await P.click('#sy-passer');
  verifier((await P.textContent('#outil')).includes('Le carnet n\'est pas renvoyé'), 'explication : le carnet n\'est pas renvoyé');
  await P.screenshot({ path: join(CAPT, 'v024-01-pc-passer.png') });
  await P.click('#sp-ok'); await fini(P, '#sp-res');
  verifier(await P.textContent('#sp-res') === 'Ce PC peut maintenant modifier le carnet. Les deux appareils restent à jour.', 'PC en modification');
  verifier(!(await P.evaluate(() => document.body.classList.contains('consultation'))), 'boutons de modification revenus');
  await P.click('#ou-x');
  verifier(await sync(P) === 'ok' && nas.envois.slice(envoisAvant).every(e => e.n === 0) , 'rien de renvoyé au NAS par le passage');
  await onglet(P, 'carnet');
  verifier(await P.isVisible('#fab'), 'PC : « + Nouveau vol » visible');

  console.log('Ajout / modification / suppression de chaque côté');
  const [v1, v2, v3, v4, v5, v6] = vols.slice(-6).map(v => v.id);
  // PC : modification par la saisie
  await onglet(P, 'carnet');
  await P.click(`#list .flight[data-id="${vols.at(-1).id}"]`).catch(async () => P.click('#list .flight'));
  await P.waitForSelector('#v-saisie:not([hidden])');
  const idSaisi = await P.evaluate(async () => document.getElementById('f-title').textContent);
  await P.fill('#f-rem', 'MODIFIE SUR LE PC'); await P.click('#save'); await P.waitForSelector('#v-carnet:not([hidden])');
  const idPcModifie = await P.evaluate(async () => (await import('./js/etat.js')).etat.vols.find(v => v.remarques === 'MODIFIE SUR LE PC').id);
  await ajouter(P, { ...vols[0], id: 'pc-ajout-1', date: '2026-11-08', remarques: 'AJOUT PC' });
  await ajouter(T, { ...vols[1], id: 'tel-ajout-1', date: '2026-11-08', remarques: 'AJOUT TEL', hDep: '06:00' });
  await supprimer(T, [vols[2].id]);
  await supprimer(P, [vols[3].id]);
  await sync(P); await sync(T); await sync(P);
  verifier((await volDe(T, idPcModifie))?.remarques === 'MODIFIE SUR LE PC' && !!(await volDe(T, 'pc-ajout-1')) && !(await volDe(T, vols[3].id)), 'téléphone : modification, ajout et suppression du PC reçus');
  verifier(!!(await volDe(P, 'tel-ajout-1')) && !(await volDe(P, vols[2].id)), 'PC : ajout et suppression du téléphone reçus');
  verifier(idSaisi === 'Modifier le vol', 'PC : vol ouvert en modification (plus en consultation)');
  await memes('mêmes vols et mêmes totaux');

  console.log('Conflits : 3 vols modifiés des deux côtés + 1 supprimé / modifié');
  await tel.ctx.setOffline(true); await pc.ctx.setOffline(true);
  await modifier(T, v1, { remarques: 'V1 TELEPHONE' }); await modifier(P, v1, { remarques: 'V1 PC' });
  await modifier(T, v2, { remarques: 'V2 TELEPHONE' }); await modifier(P, v2, { remarques: 'V2 PC' });
  await modifier(T, v3, { remarques: 'V3 TELEPHONE' }); await modifier(P, v3, { remarques: 'V3 PC', tempsTotal: 125 });
  await supprimer(T, [v4]); await modifier(P, v4, { remarques: 'V4 PC' });
  await tel.ctx.setOffline(false); await sync(T);
  await pc.ctx.setOffline(false); await sync(P);
  await onglet(P, 'carnet'); await attendre(P, 300);
  verifier(await P.isVisible('#conflit-bandeau') && await P.textContent('#conflit-bandeau') === '4 éléments modifiés sur les deux appareils › Choisir', `bandeau orange : ${await P.textContent('#conflit-bandeau')}`);
  verifier(await P.$eval('#conflit-bandeau', e => getComputedStyle(e).backgroundColor) === 'rgb(168, 67, 0)', '  orange, texte blanc');
  verifier((await volDe(P, v1)).remarques === 'V1 PC' && (await volDe(P, v4)).remarques === 'V4 PC' && (await volDe(T, v1)).remarques === 'V1 TELEPHONE' && !(await volDe(T, v4)),
    'rien n\'est écrasé ni effacé avant le choix (chaque appareil garde sa version)');
  await P.screenshot({ path: join(CAPT, 'v024-02-bandeau-orange.png') });
  await P.click('#conflit-bandeau'); await P.waitForSelector('[data-cf]');
  const ecran = await P.textContent('#outil');
  verifier(ecran.includes('Garder la version du PC') && ecran.includes('Garder la version du téléphone') && ecran.includes('Garder les deux'), 'écran de choix : les 3 boutons');
  verifier(ecran.includes('V1 PC') && ecran.includes('V1 TELEPHONE') && ecran.includes('2h05'), 'écran de choix : versions côte à côte (remarques, temps total)');
  verifier(ecran.includes('Modifié sur ce PC, supprimé sur le téléphone. Rien n\'est effacé avant ton choix.'), 'supprimé d\'un côté, modifié de l\'autre : expliqué');
  await P.screenshot({ path: join(CAPT, 'v024-03-ecran-choix.png') });
  const cliquer = async (titre, choix) => {
    const i = await P.$$eval('[data-cf]', (l, t) => l.findIndex(x => x.textContent.includes(t)), titre);
    if (i < 0) throw new Error('conflit introuvable : ' + titre);
    await P.click(`[data-cf="${i}"] [data-choix="${choix}"]`); await attendre(P, 700);
  };
  const choixPc = 'ici', choixTel = 'autre';
  await cliquer('V1 PC', choixPc);           // garder la version du PC
  await cliquer('V2 PC', choixTel);          // garder la version du téléphone
  await cliquer('V3 PC', 'deux');            // garder les deux
  await cliquer('supprimé sur le téléphone', choixPc); // V4 : garder le vol (version du PC) malgré la suppression sur le téléphone
  await sync(P); await sync(T); await sync(P);
  verifier((await volDe(T, v1)).remarques === 'V1 PC' && (await volDe(P, v1)).remarques === 'V1 PC', '« Garder la version du PC » : partout');
  verifier((await volDe(T, v2)).remarques === 'V2 TELEPHONE' && (await volDe(P, v2)).remarques === 'V2 TELEPHONE', '« Garder la version du téléphone » : partout');
  const deux = await P.evaluate(async () => (await import('./js/etat.js')).etat.vols.filter(v => /^V3 /.test(v.remarques || '')).map(v => v.remarques).sort());
  const deuxTel = await T.evaluate(async () => (await import('./js/etat.js')).etat.vols.filter(v => /^V3 /.test(v.remarques || '')).map(v => v.remarques).sort());
  verifier(JSON.stringify(deux) === '["V3 PC","V3 TELEPHONE"]' && JSON.stringify(deuxTel) === JSON.stringify(deux), '« Garder les deux » : deux vols, sur les deux appareils');
  verifier((await volDe(T, v4))?.remarques === 'V4 PC', 'supprimé sur le téléphone, gardé sur le PC : revenu sur le téléphone');
  const restants = await P.evaluate(async () => JSON.stringify(((await import('./js/etat.js')).etat.reglages.synchroEtat.conflits || []).map(c => [c.cle, c.appareil, c.distant && c.distant.remarques])));
  verifier(!(await P.isVisible('#conflit-bandeau')), 'plus de bandeau orange' + (restants === '[]' ? '' : ' ' + restants));
  await memes('après les choix : mêmes vols et mêmes totaux');

  console.log('Doublon possible');
  await ajouter(T, { ...vols[5], id: 'tel-doublon', date: '2026-11-09', remarques: 'SAISI DEUX FOIS', creeLe: undefined });
  await ajouter(P, { ...vols[5], id: 'pc-doublon', date: '2026-11-09', remarques: 'SAISI DEUX FOIS', creeLe: undefined });
  verifier(!(await T.isVisible('#doublon-bandeau')), '« Garder les deux » (vol V3) : ce choix a voyagé, pas signalé comme doublon sur le téléphone');
  await sync(T); await sync(P); await sync(T);
  await onglet(T, 'carnet'); await attendre(T, 300);
  verifier(await T.isVisible('#doublon-bandeau') && await T.textContent('#doublon-bandeau') === 'Doublon possible › Voir', 'bandeau « Doublon possible › Voir » (téléphone)');
  await T.screenshot({ path: join(CAPT, 'v024-04-bandeau-doublon.png') });
  await T.click('#doublon-bandeau'); await T.waitForSelector('[data-suppr]');
  await T.screenshot({ path: join(CAPT, 'v024-05-ecran-doublon.png') });
  await T.click('[data-suppr="pc-doublon"]'); await attendre(T, 500);
  await sync(T); await sync(P);
  verifier(!(await volDe(P, 'pc-doublon')) && !!(await volDe(P, 'tel-doublon')) && !(await T.isVisible('#doublon-bandeau')), '« Supprimer ce vol » : un seul reste, sur les deux appareils');

  console.log('Vols NPF-Q400 : sur le téléphone seulement');
  const npfPc = P.requetes.filter(a => a === 'vols-liste').length;
  await P.reload(); await P.waitForSelector('body[data-pret="1"]'); await attendre(P, 3000);
  verifier(P.requetes.filter(a => a === 'vols-liste').length === npfPc && !(await P.isVisible('#npf-bandeau')), 'PC en modification : ne regarde pas les vols NPF (pas de bandeau)');
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await T.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 10000 });
  verifier(true, 'téléphone : bandeau « 1 vol à importer depuis NPF-Q400 »');

  console.log('Hors ligne des deux côtés, puis retour');
  await tel.ctx.setOffline(true); await pc.ctx.setOffline(true);
  await ajouter(P, { ...vols[6], id: 'pc-hors-ligne', date: '2026-11-10', remarques: 'PC HORS LIGNE' });
  await ajouter(T, { ...vols[7], id: 'tel-hors-ligne', date: '2026-11-10', remarques: 'TEL HORS LIGNE' });
  await attendre(P, 6500);
  await onglet(P, 'carnet');
  verifier(await P.isVisible('#sync-bandeau') && (await P.textContent('#sync-bandeau')).startsWith('1 en attente d\'envoi (pas de réseau)'), `PC : « ${await P.textContent('#sync-bandeau')} »`);
  await onglet(T, 'plus');
  verifier(await T.textContent('#pl-sync-s') === '1 en attente d\'envoi (pas de réseau)', `téléphone, Plus : « ${await T.textContent('#pl-sync-s')} »`);
  await tel.ctx.setOffline(false); await pc.ctx.setOffline(false);
  await T.evaluate(() => dispatchEvent(new Event('online'))); await P.evaluate(() => dispatchEvent(new Event('online')));
  await attendre(T, 4000); await sync(T); await sync(P); await sync(T);
  verifier(!!(await volDe(T, 'pc-hors-ligne')) && !!(await volDe(P, 'tel-hors-ligne')), 'retour du réseau : rien de perdu, chacun a le vol de l\'autre');
  await memes('mêmes vols et mêmes totaux');

  console.log('Plus de 20 suppressions d\'un coup');
  const vingtEtUn = (await P.evaluate(async () => (await import('./js/etat.js')).etat.vols.slice(0, 21).map(v => v.id)));
  await supprimer(P, vingtEtUn);
  await sync(P);
  await onglet(P, 'carnet'); await attendre(P, 300);
  verifier(await P.textContent('#suppr-bandeau') === '21 suppressions à envoyer › Confirmer' && !!(await volDe(T, vingtEtUn[0])), 'bandeau « 21 suppressions à envoyer › Confirmer » ; rien d\'effacé sur le téléphone');
  await P.click('#suppr-bandeau'); await P.waitForSelector('#su-remettre');
  await P.screenshot({ path: join(CAPT, 'v024-06-suppressions.png') });
  await P.click('#su-remettre'); await attendre(P, 1500);
  verifier(!!(await volDe(P, vingtEtUn[0])) && !!(await volDe(P, vingtEtUn[20])) && (await sync(P)) === 'ok', '« Les remettre » : revenus sur le PC (repris au NAS)');
  await memes('  rien n\'a bougé sur le téléphone');
  const vingtDeux = (await P.evaluate(async () => (await import('./js/etat.js')).etat.vols.slice(0, 22).map(v => v.id)));
  await supprimer(P, vingtDeux); await sync(P);
  await onglet(P, 'carnet'); await attendre(P, 300);
  await P.click('#suppr-bandeau'); await P.click('#su-ok'); await attendre(P, 1500);
  await sync(T);
  verifier(!(await volDe(T, vingtDeux[0])) && !(await volDe(T, vingtDeux[21])), '« Confirmer » : supprimés aussi sur le téléphone');
  await memes('mêmes vols et mêmes totaux');

  console.log('Annuler la dernière synchro (sur le PC)');
  const cible = (await carnet(T)).ids.split(',')[3];
  const avant = (await volDe(P, cible)).remarques;
  await modifier(T, cible, { remarques: 'CHANGE SUR LE TELEPHONE' }); await sync(T); await sync(P);
  verifier((await volDe(P, cible)).remarques === 'CHANGE SUR LE TELEPHONE', 'PC : changement reçu');
  await onglet(P, 'plus'); await P.click('#pl-sync');
  verifier(await P.isVisible('#sy-annuler'), '« Annuler la dernière synchro » proposé');
  await P.screenshot({ path: join(CAPT, 'v024-07-pc-plus-synchro.png') });
  await P.click('#sy-annuler'); await P.click('#an-ok'); await attendre(P, 800);
  verifier((await volDe(P, cible)).remarques === avant, 'PC : version d\'avant remise');
  await sync(P); await sync(T);
  verifier((await volDe(T, cible)).remarques === avant, '  et repartie vers le téléphone');
  await P.click('#ou-x');
  await T.click('#pl-sync'); await T.screenshot({ path: join(CAPT, 'v024-08-tel-plus-synchro.png') }); await T.click('#ou-x');

  console.log('Mot de passe refusé : plus aucun appel automatique');
  nas.mdp = 'change-ailleurs-24';
  await modifier(P, cible, { remarques: 'APRES CHANGEMENT' });
  await attendre(P, 6500);
  await onglet(P, 'plus');
  verifier(await P.textContent('#pl-sync-s') === 'Mot de passe refusé : à corriger', `PC : « ${await P.textContent('#pl-sync-s')} »`);
  const n = nas.requetes.filter(r => r.cle !== 'change-ailleurs-24').length;
  await P.evaluate(() => { dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  await modifier(P, cible, { remarques: 'ENCORE' });
  await attendre(P, 7000);
  verifier(nas.requetes.filter(r => r.cle !== 'change-ailleurs-24').length === n, 'aucun nouvel essai automatique (la maison n\'est pas bloquée)');

  verifier(!P.requetes.includes('envoyer'), 'le PC n\'a jamais envoyé de copie du carnet (le téléphone seulement)');
  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.24 réussie.');
} catch (e) {
  console.error(e.message);
  await T.screenshot({ path: join(CAPT, 'v024-erreur-tel.png') }).catch(() => {});
  await P.screenshot({ path: join(CAPT, 'v024-erreur-pc.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await navigateur.close();
  srv.fermer(); faux.close();
}
