// v0.25 : l'iPad, 3e appareil du carnet. TROIS appareils autour d'un FAUX NAS local (règles de carnet.php v5) :
// téléphone (Chromium 390 px), PC (Chromium 1280 px) et iPad (WebKit = moteur de Safari, 1080 × 810 paysage puis
// 810 × 1080 portrait, tactile). Vols INVENTÉS ; toute adresse non locale est BLOQUÉE.
// Vérifie : l'iPad rejoint le carnet en modification ; mise en page (pas de défilement de côté, grandes cibles au
// doigt) ; modification sur l'iPad reçue par le téléphone et le PC ; conflit iPad / téléphone ; hors ligne puis retour ;
// carnet de l'iPad effacé (en partie, puis entièrement) : récupéré du NAS sans RIEN envoyer de vide ; pas de vols NPF ni
// de copie NAS depuis l'iPad ; mêmes totaux sur les trois appareils.
// WebKit sur ce PC : bibliothèques locales (voir CLAUDE.md, « WebKit »). Captures : tests/navigateur/captures/v025-*.png
// Usage : node tests/navigateur/v025.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';
import { volsPDF } from '../outils/vols-pdf.js';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const srv = await serveur();
const nas = { mdp: 'mot-de-passe-essai-25', rev: 0, el: new Map(), envois: [], requetes: [] };
const NPF = [{ format: 'carnet-vol-npf', version: 2, id: 'npf-essai-25', exporteLe: '2026-11-08T10:00:00Z', date: '2026-11-07', blocDepart: '10:00', blocArrivee: '11:00', immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMD' }];
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': srv.origine, 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    const corps = Buffer.concat(morceaux).toString();
    nas.requetes.push({ action, appareil: (corps.match(/"appareil":"([^"]+)"/) || [])[1] || '' , ua: req.headers['user-agent'] || '' });
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
      const b = JSON.parse(corps);
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

const { chromium, webkit } = playwright();
const nav = await chromium.launch();
const navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
async function appareil(nom, moteur, options) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => { if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  p.on('pageerror', e => erreurs.push(`${nom} : ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control|network connection was lost/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  p.requetes = [];
  p.on('request', r => { const a = new URL(r.url()).searchParams.get('action'); if (a && r.method() === 'POST') p.requetes.push(a); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } });
const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD });
const T = tel.p, P = pc.p, I = ipad.p;
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
const configurerNas = async p => {
  await p.click('.tabs button[data-v="plus"]'); await p.click('#pl-nas');
  await p.fill('#nas-adr', ADRESSE); await p.fill('#nas-mdp', nas.mdp); await p.click('#nas-ok'); await attendre(p, 300); await p.click('#ou-x');
};
const onglet = (p, v) => p.click(`.tabs button[data-v="${v}"]`);
const memes = async msg => {
  const [a, b, c] = [await carnet(T), await carnet(P), await carnet(I)];
  verifier(a.ids === b.ids && a.ids === c.ids && a.totaux === b.totaux && a.totaux === c.totaux, `${msg} (${a.n} / ${b.n} / ${c.n} vols, mêmes totaux)`);
};
// Mise en page : rien ne dépasse sur le côté ; boutons principaux assez grands pour le doigt (44 px au moins)
const miseEnPage = (sels) => I.evaluate(s => {
  const trop = document.documentElement.scrollWidth > innerWidth + 1;
  const petits = s.filter(x => { const e = document.querySelector(x); if (!e || !e.offsetParent) return false; const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; });
  return { trop, petits };
}, sels);
const envoisIpad = () => nas.envois.filter(e => e.appareil.startsWith('ipad-'));

try {
  console.log('Téléphone (référence) et PC (modification) comme en v0.24');
  const { vols, avions } = volsPDF(40);
  await T.evaluate(async ([v, a]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['vols', 'avions'], 'readwrite');
    for (const x of v) t.objectStore('vols').put(x); for (const x of a) t.objectStore('avions').put(x);
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [vols, [...avions.values()]]);
  await T.reload(); await T.waitForSelector('body[data-pret="1"]');
  await configurerNas(T);
  await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok'); await fini(T, '#sr-res'); await T.click('#ou-x');
  await configurerNas(P);
  await P.click('#pl-sync'); await P.click('#sy-mod'); await P.click('#sc-ok'); await fini(P, '#sc-res'); await P.click('#ou-x');

  console.log('iPad (moteur Safari, 1080 × 810 paysage) : rejoindre le carnet en modification');
  verifier(await I.evaluate(() => navigator.userAgent.includes('iPad')), 'moteur Safari (WebKit), iPad');
  await configurerNas(I);
  await attendre(I, 6000);
  verifier(!I.requetes.includes('envoyer') && !I.requetes.includes('synchro-envoyer'), 'iPad au carnet vide : rien envoyé au NAS (ni copie, ni synchro)');
  await I.click('#pl-sync');
  verifier(await I.textContent('#sy-mod') === 'Cet iPad : recevoir le carnet et le modifier aussi ›', `choix : « ${await I.textContent('#sy-mod')} »`);
  await I.click('#sy-mod');
  await I.click('#sc-ok'); await fini(I, '#sc-res');
  verifier((await I.textContent('#sc-res')).startsWith('À jour : 40 vols.'), `iPad : ${await I.textContent('#sc-res')}`);
  await I.click('#ou-x');
  await memes('les trois appareils ont le même carnet');
  await onglet(I, 'carnet'); await attendre(I, 300);
  let m = await miseEnPage(['#fab', '.tabs button', '#list .flight']);
  verifier(!m.trop && !m.petits.length, `paysage : rien ne dépasse, cibles au doigt ≥ 44 px ${m.petits.join(' ')}`);
  await I.screenshot({ path: join(CAPT, 'v025-01-ipad-paysage-carnet.png') });

  console.log('Modification sur l\'iPad (saisie au doigt) -> téléphone et PC');
  const idIpad = vols.at(-1).id;
  await I.tap(`#list .flight[data-id="${idIpad}"]`).catch(() => I.tap('#list .flight'));
  await I.waitForSelector('#v-saisie:not([hidden])'); await attendre(I, 400);
  const idOuvert = await I.evaluate(async () => { const t = document.getElementById('f-sub').textContent; return t; });
  m = await miseEnPage(['#save', '#cancel', '#f-dep', '#f-arr', '#f-t0', '#f-t1']);
  verifier(!m.trop && !m.petits.length, `saisie (paysage) : rien ne dépasse, cases et boutons ≥ 44 px ${m.petits.join(' ')}`);
  await I.screenshot({ path: join(CAPT, 'v025-02-ipad-paysage-saisie.png') });
  await I.fill('#f-rem', 'MODIFIE SUR L IPAD'); await I.tap('#save'); await I.waitForSelector('#v-carnet:not([hidden])');
  const idModifie = await I.evaluate(async () => (await import('./js/etat.js')).etat.vols.find(v => v.remarques === 'MODIFIE SUR L IPAD').id);
  await sync(I); await sync(T); await sync(P);
  verifier((await volDe(T, idModifie)).remarques === 'MODIFIE SUR L IPAD' && (await volDe(P, idModifie)).remarques === 'MODIFIE SUR L IPAD', `reçu par le téléphone et le PC (${idOuvert.slice(0, 20)}…)`);
  verifier(envoisIpad().length > 0 && envoisIpad().every(e => e.suppr === 0), 'l\'iPad n\'a envoyé que sa modification');

  console.log('Plus › Synchro du carnet (paysage)');
  await onglet(I, 'plus'); await I.click('#pl-sync');
  verifier(await I.textContent('#outil h3') === 'Cet iPad envoie et reçoit le carnet', `titre : ${await I.textContent('#outil h3')}`);
  await I.screenshot({ path: join(CAPT, 'v025-03-ipad-paysage-synchro.png') });
  await I.click('#ou-x');

  console.log('Conflit iPad / téléphone (portrait 810 × 1080)');
  await I.setViewportSize({ width: 810, height: 1080 });
  const vc = vols[5].id;
  await tel.ctx.setOffline(true); await ipad.ctx.setOffline(true);
  await modifier(T, vc, { remarques: 'TELEPHONE' }); await modifier(I, vc, { remarques: 'IPAD' });
  await tel.ctx.setOffline(false); await sync(T);
  await ipad.ctx.setOffline(false); await sync(I);
  await onglet(I, 'carnet'); await attendre(I, 300);
  verifier(await I.isVisible('#conflit-bandeau') && await I.textContent('#conflit-bandeau') === '1 élément modifié sur les deux appareils › Choisir', 'bandeau orange sur l\'iPad');
  verifier((await volDe(I, vc)).remarques === 'IPAD' && (await volDe(T, vc)).remarques === 'TELEPHONE', 'rien n\'est écrasé avant le choix');
  await I.tap('#conflit-bandeau'); await I.waitForSelector('[data-cf]');
  const ecran = await I.textContent('#outil');
  verifier(ecran.includes('Garder la version de l\'iPad') && ecran.includes('Garder la version du téléphone') && ecran.includes('Garder les deux'), 'écran de choix : « de l\'iPad », « du téléphone », « les deux »');
  m = await miseEnPage(['[data-choix="ici"]', '[data-choix="autre"]']);
  verifier(!m.trop && !m.petits.length, 'portrait : écran de choix lisible, boutons ≥ 44 px');
  await I.screenshot({ path: join(CAPT, 'v025-04-ipad-portrait-conflit.png') });
  await I.tap('[data-choix="ici"]'); await attendre(I, 800);
  await sync(I); await sync(T); await sync(P);
  verifier((await volDe(T, vc)).remarques === 'IPAD' && (await volDe(P, vc)).remarques === 'IPAD', '« Garder la version de l\'iPad » : arrivé sur le téléphone et le PC');

  console.log('Portrait : Carnet, saisie, Plus › Synchro');
  await onglet(I, 'carnet'); await attendre(I, 300);
  m = await miseEnPage(['#fab', '.tabs button', '#list .flight']);
  verifier(!m.trop && !m.petits.length, 'portrait : rien ne dépasse, cibles ≥ 44 px');
  await I.screenshot({ path: join(CAPT, 'v025-05-ipad-portrait-carnet.png') });
  await I.tap('#list .flight'); await I.waitForSelector('#v-saisie:not([hidden])'); await attendre(I, 400);
  await I.screenshot({ path: join(CAPT, 'v025-06-ipad-portrait-saisie.png') });
  await I.tap('#cancel'); await I.waitForSelector('#v-carnet:not([hidden])');
  await onglet(I, 'plus'); await I.click('#pl-sync');
  await I.screenshot({ path: join(CAPT, 'v025-07-ipad-portrait-synchro.png') });
  await I.click('#ou-x');

  console.log('iPad hors ligne, puis retour');
  await ipad.ctx.setOffline(true);
  await ajouter(I, { ...vols[6], id: 'ipad-hors-ligne', date: '2026-11-10', remarques: 'IPAD HORS LIGNE', creeLe: undefined });
  await attendre(I, 6500);
  await onglet(I, 'plus');
  verifier(await I.textContent('#pl-sync-s') === '1 en attente d\'envoi (pas de réseau)', `Plus : « ${await I.textContent('#pl-sync-s')} »`);
  await ipad.ctx.setOffline(false);
  await I.evaluate(() => dispatchEvent(new Event('online'))); await attendre(I, 3000);
  await sync(I); await sync(T); await sync(P);
  verifier(!!(await volDe(T, 'ipad-hors-ligne')) && !!(await volDe(P, 'ipad-hors-ligne')), 'retour du réseau : le vol de l\'iPad est arrivé partout');
  await memes('mêmes vols et mêmes totaux');

  console.log('Vols NPF et copies NAS : jamais depuis l\'iPad');
  verifier(!I.requetes.includes('vols-liste') || I.requetes.lastIndexOf('vols-liste') < I.requetes.indexOf('synchro-recevoir'), 'l\'iPad ne regarde pas les vols NPF une fois dans la synchro');
  await I.reload(); await I.waitForSelector('body[data-pret="1"]'); await attendre(I, 3000);
  verifier(!(await I.isVisible('#npf-bandeau')) && !I.requetes.includes('envoyer'), 'pas de bandeau NPF, aucune copie du carnet envoyée');

  console.log('Carnet de l\'iPad effacé EN PARTIE (vols perdus, réglages gardés)');
  const avant = envoisIpad().length;
  await I.evaluate(async () => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction('vols', 'readwrite'); t.objectStore('vols').clear(); await new Promise(ok => { t.oncomplete = ok; }); db.close();
  });
  await I.reload(); await I.waitForSelector('body[data-pret="1"]'); await attendre(I, 6000);
  await sync(I);
  await onglet(I, 'carnet'); await attendre(I, 300);
  verifier(envoisIpad().slice(avant).every(e => e.suppr === 0), 'aucune suppression envoyée');
  verifier(await I.isVisible('#suppr-bandeau') && (await carnet(T)).n === (await carnet(P)).n && (await carnet(T)).n > 40, `bandeau « ${await I.textContent('#suppr-bandeau')} » ; le téléphone et le PC gardent tout`);
  await I.tap('#suppr-bandeau'); await I.waitForSelector('#su-remettre');
  verifier(!(await I.isVisible('#su-ok')) && (await I.textContent('#su-res')).includes('est vide : il a sans doute été effacé'), 'carnet vide : pas de « Confirmer », explication et « Les remettre »');
  await I.screenshot({ path: join(CAPT, 'v025-08-ipad-carnet-efface.png') });
  await I.tap('#su-remettre'); await attendre(I, 2000);
  await memes('« Les remettre » : l\'iPad a de nouveau tout le carnet');

  console.log('Carnet de l\'iPad effacé ENTIÈREMENT (comme Safari qui efface les données du site)');
  await I.evaluate(async () => {
    const e = await import('./js/db.js');
    const db = await e.ouvrir(); db.close();
    await new Promise(ok => { const r = indexedDB.deleteDatabase('carnet-de-vol'); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
  });
  const avant2 = nas.requetes.length;
  await I.reload(); await I.waitForSelector('body[data-pret="1"]'); await attendre(I, 6000);
  verifier((await carnet(I)).n === 0 && nas.requetes.length === avant2, 'iPad vide (adresse et mot de passe du NAS perdus aussi) : il ne contacte même pas le NAS');
  await configurerNas(I); await attendre(I, 6000);
  verifier(!nas.requetes.slice(avant2).some(r => r.action === 'envoyer' || r.action === 'synchro-envoyer'), 'NAS retapé : aucun envoi d\'un carnet vide');
  await I.click('#pl-sync'); await I.click('#sy-mod'); await I.click('#sc-ok'); await fini(I, '#sc-res'); await I.click('#ou-x');
  await sync(I);
  verifier(!nas.requetes.slice(avant2).some(r => r.action === 'envoyer') && envoisIpad().slice(avant).every(e => e.suppr === 0), 'carnet récupéré du NAS, rien de vide renvoyé');
  await memes('les trois appareils ont de nouveau le même carnet');

  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.25 réussie.');
} catch (e) {
  console.error(e.message);
  await I.screenshot({ path: join(CAPT, 'v025-erreur-ipad.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close();
  srv.fermer(); faux.close();
}
