// v0.27 : R64 (rien du vol précédent ne reste dans le formulaire) et R63 (approches par terrain intermédiaire).
// Téléphone (Chromium 390 px), PC (Chromium 1280 px) et iPad (WebKit 1080 px) autour d'un FAUX NAS v5 local (vols NPF-Q400
// en attente + synchro). Vols et avions INVENTÉS ; toute adresse non locale est BLOQUÉE.
// Captures : tests/navigateur/captures/v027-*.png (non commitées). Usage : node tests/navigateur/v027.mjs
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveur, playwright, verifier, RACINE } from './outils.mjs';

const CAPT = join(RACINE, 'tests/navigateur/captures');
mkdirSync(CAPT, { recursive: true });
const H = '2026-11-09T18:00:00Z';
const npf = (id, depart, arrivee, remarques = '') => ({ format: 'carnet-vol-npf', version: 2, id, exporteLe: H, date: '2026-11-09', blocDepart: depart, blocArrivee: arrivee,
  immat: 'F-XZZA', depart: 'LFMN', arrivee: 'LFMN', remarques });
const nas = { mdp: 'mot-de-passe-essai-27', rev: 0, el: new Map(), npf: [npf('npf-r64-1', '10:00', '11:30'), npf('npf-r64-2', '13:00', '14:00'), npf('npf-r64-3', '15:00', '15:40')] };
const srv = await serveur();
const faux = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), action = u.searchParams.get('action');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Carnet-Cle, X-Carnet-Empreinte', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const morceaux = [];
  req.on('data', m => morceaux.push(m));
  req.on('end', () => {
    const json = (o, code = 200) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(code === 200 ? o : { ...o, code })); };
    if (req.headers['x-carnet-cle'] !== nas.mdp) return json({ erreur: 'mot-de-passe' }, 401);
    if (action === 'test') return json({ ok: true, copies: 0, cle: 'carnet', version: 5 });
    if (action === 'envoyer') return json({ ok: true, id: 'x', vols: 1, taille: 1, verification: 'empreinte' });
    if (action === 'vols-liste') return json({ vols: nas.npf });
    if (action === 'vol-retirer') { nas.npf = nas.npf.filter(v => v.id !== u.searchParams.get('id')); return json({ ok: true, retire: true }); }
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
      const acceptees = [], deja = [], conflits = [];
      for (const m of b.modifications) {
        const cle = `${m.magasin}/${m.id}`, a = nas.el.get(cle), revA = a ? a.rev : 0, donnees = m.supprime ? null : m.donnees;
        if (a && !!a.supprime === !!m.supprime && JSON.stringify(a.donnees) === JSON.stringify(donnees)) { deja.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        if (m.base !== revA) { conflits.push({ magasin: m.magasin, id: m.id, rev: revA }); continue; }
        nas.rev++; nas.el.set(cle, { rev: nas.rev, supprime: !!m.supprime, donnees, appareil: b.appareil, le: H });
        acceptees.push({ magasin: m.magasin, id: m.id, rev: nas.rev });
      }
      return json({ ok: true, rev: nas.rev, acceptees, deja, conflits });
    }
    return json({ erreur: 'action' }, 400);
  });
});
await new Promise(ok => faux.listen(0, '127.0.0.1', ok));
const ADRESSE = `http://127.0.0.1:${faux.address().port}/carnet-api/`;
const AVION = { id: 'a1', immat: 'F-XZZA', typeOACI: 'DH8D', modele: 'Dash 8 Q400', constructeur: 'ESSAI', nom: 'M91', indicatif: '', equipage: 'MP', moteurs: 'ME',
  moteur: 'T', surface: 'L', train: 'tricycle', etiquettes: [], sim: false, photo: null, remarques: '', creeLe: H, modifieLe: H };

const { chromium, webkit } = playwright();
const nav = await chromium.launch(), navSafari = await webkit.launch();
const bloquees = [], erreurs = [];
async function appareil(nom, moteur, options, nasConfig = true) {
  const ctx = await moteur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
  await ctx.route('**/*', r => { if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue(); bloquees.push(r.request().url()); return r.abort(); });
  await ctx.addInitScript(() => { globalThis.CARNET_SERVEUR_TRACES = 'http://127.0.0.1:9/'; globalThis.CARNET_TUILES = 'http://127.0.0.1:9/{z}/{x}/{y}.png'; });
  const p = await ctx.newPage();
  // WebKit sans écran : la vérification du service worker (sw.js) peut échouer quand le serveur de test se ferme ; ce n'est pas une erreur de l'app
  p.on('pageerror', e => { if (!/sw\.js due to access control checks/.test(e.message)) erreurs.push(`${nom} : ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|CORS|Access-Control|access control/i.test(m.text())) erreurs.push(`${nom} : ${m.text()}`); });
  await p.goto(srv.url); await p.waitForSelector('body[data-pret="1"]');
  await p.evaluate(async ([a, url, mdp, nasConfig]) => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction(['avions', 'reglages'], 'readwrite'); t.objectStore('avions').put(a);
    if (nasConfig) { const g = t.objectStore('reglages'); g.put({ cle: 'nasAdresse', valeur: url }); g.put({ cle: 'nasMotDePasse', valeur: mdp }); g.put({ cle: 'nasAuto', valeur: false }); }
    await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, [AVION, ADRESSE, nas.mdp, nasConfig]);
  await p.reload(); await p.waitForSelector('body[data-pret="1"]');
  return { ctx, p };
}
const tel = await appareil('téléphone', nav, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const T = tel.p;
const attendre = (p, ms) => p.waitForTimeout(ms);
const etatFormulaire = p => p.evaluate(() => ({ ifr: document.getElementById('f-ifr').getAttribute('aria-checked'), cIfr: document.getElementById('c-ifr').value,
  cNuit: document.getElementById('c-nuit').value, appr: document.getElementById('s-approches').textContent, rem: document.getElementById('f-rem').value,
  escales: document.querySelectorAll('#via-list .viachip').length }));
const propre = (f, nuit = '0h00') => f.ifr === 'false' && f.cIfr === '0h00' && f.cNuit === nuit && f.appr === '0' && f.rem === '' && f.escales === 0;
const volEnregistre = (p, cond) => p.evaluate(async c => { const e = await import('./js/etat.js'); return e.etat.vols.find(new Function('v', `return ${c}`)) || null; }, cond);
const ouvrirNpf = async id => { await T.waitForSelector('#npf-bandeau:not([hidden])', { timeout: 10000 }); await T.click('#npf-bandeau'); await T.waitForSelector('#npf-l');
  await T.click(`#npf-l [data-npf="${id}"]`); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 300); };
const saisirAMain = async () => {
  await T.click('#f-ifr'); await T.fill('#c-ifr', '1h36'); await T.fill('#c-nuit', '0h20');
  await T.click('[data-s="approches"][data-d="1"]'); await T.click('[data-s="approches"][data-d="1"]');
  await T.fill('#f-rem', 'SAISI A LA MAIN');
};
const nouveauVol = async () => { await T.click('.tabs button[data-v="carnet"]'); await T.click('#fab'); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 200); };

try {
  console.log('R64 : deux vols NPF-Q400 importés à la suite');
  await ouvrirNpf('npf-r64-1');
  await saisirAMain();
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const v1 = await volEnregistre(T, "v.npfId === 'npf-r64-1'");
  verifier(v1 && v1.tempsIFR === 96 && v1.regleIFR && v1.approches === 2, '1er vol enregistré IFR 1h36, 2 approches');
  await ouvrirNpf('npf-r64-2');
  let f = await etatFormulaire(T);
  verifier(propre(f), `2e vol (VFR) : s'ouvre propre (IFR ${f.cIfr}, nuit ${f.cNuit}, approches ${f.appr}, remarque « ${f.rem} »)`);
  await T.screenshot({ path: join(CAPT, 'v027-01-tel-2e-vol-propre.png') });
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const v2 = await volEnregistre(T, "v.npfId === 'npf-r64-2'");
  verifier(v2 && v2.tempsIFR === 0 && !v2.regleIFR && v2.approches === 0 && !v2.remarques && v2.tempsNuit === 0, '2e vol enregistré SANS IFR, sans approche, sans remarque');

  console.log('R64 : Nouveau vol après Enregistrer, après Annuler, après Ignorer');
  await nouveauVol();
  verifier(propre(await etatFormulaire(T)), 'Nouveau vol après un enregistrement : propre');
  await saisirAMain(); await T.click('#cancel'); await T.waitForSelector('#v-carnet:not([hidden])');
  await nouveauVol();
  verifier(propre(await etatFormulaire(T)), 'Nouveau vol après « Annuler » : propre');
  await T.click('#cancel');
  await ouvrirNpf('npf-r64-3');
  await saisirAMain();
  await T.click('#npf-ign'); await T.click('#ni-ok'); await T.waitForSelector('#v-carnet:not([hidden])');
  await nouveauVol();
  verifier(propre(await etatFormulaire(T)), 'Nouveau vol après « Ignorer ce vol » : propre');

  console.log('R63 : vol avec 2 terrains intermédiaires et leurs approches');
  await T.fill('#f-t0', '1000'); await T.fill('#f-t1', '1130');
  const escale = async (code, appr) => {
    await T.click('#via-add'); await T.waitForSelector('#via-modal:not([hidden])'); await attendre(T, 150);
    await T.fill('#vm-icao', code); await T.dispatchEvent('#vm-icao', 'input');
    for (let i = 0; i < appr; i++) await T.click('[data-vm="approches"][data-d="1"]');
    await T.click('#vm-ok');
  };
  await T.click('#via-add'); await T.waitForSelector('#via-modal:not([hidden])'); await attendre(T, 150);
  const compteurs = await T.$$eval('#via-modal .mstep .mlbl', l => l.map(x => x.textContent));
  verifier(JSON.stringify(compteurs) === '["Att. Jour","Att. Nuit","Appr"]', `fenêtre du terrain intermédiaire : ${compteurs.join(' / ')} (même style)`);
  await T.fill('#vm-icao', 'LFTH'); await T.dispatchEvent('#vm-icao', 'input');
  await T.click('[data-vm="approches"][data-d="1"]'); await T.click('[data-vm="approches"][data-d="1"]');
  await T.screenshot({ path: join(CAPT, 'v027-02-tel-terrain-intermediaire.png') });
  await T.click('#vm-ok');
  await escale('LFMD', 1);
  await T.click('[data-s="approches"][data-d="1"]');
  const chips = await T.$$eval('#via-list .viachip', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  verifier(chips[0].endsWith('· 2 appr.') && chips[1].endsWith('· 1 appr.'), `terrains intermédiaires : ${chips.join(' | ')}`);
  verifier(await T.textContent('#s-approches') === '1', 'compteur « Appr » principal = arrivée seulement (1)');
  verifier((await T.textContent('#rec-x')).includes('4 (arrivée 1 + terrains intermédiaires 3)'), 'récapitulatif : total 4');
  await T.screenshot({ path: join(CAPT, 'v027-03-tel-saisie-escales.png'), fullPage: true });
  await T.click('#save'); await T.waitForSelector('#v-carnet:not([hidden])');
  const v3 = await volEnregistre(T, "(v.escales || []).length === 2");
  verifier(v3 && v3.approches === 4 && JSON.stringify(v3.escales.map(e => e.approches)) === '[2,1]', 'enregistré : total 4, terrains intermédiaires 2 et 1');
  const pdfCsv = await T.evaluate(async id => {
    const e = await import('./js/etat.js'), pdf = await import('./js/pdf.js'), s = await import('./js/sauvegarde.js');
    const v = e.etat.vols.find(x => x.id === id), i = s.COLONNES_TABLEUR.findIndex(c => c[0] === 'Approches');
    return { pdf: pdf.valeursVol(v, e.etat.avions.get(v.avionId)).approches, csv: s.texteTableur([v], e.etat.avions).trim().split(/\r?\n/)[1].split(';')[i] };
  }, v3.id);
  verifier(pdfCsv.pdf === 4 && pdfCsv.csv === '4', `PDF ${pdfCsv.pdf}, CSV ${pdfCsv.csv} : le total`);
  await T.click(`#list .flight[data-id="${v3.id}"]`); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 200);
  verifier(await T.textContent('#s-approches') === '1' && (await T.textContent('#via-list')).includes('2 appr.'), 'vol rouvert : arrivée 1, terrains intermédiaires gardés');
  await T.click('#cancel');

  console.log('R63 : ancien vol et ancienne sauvegarde (sans le champ)');
  const ancien = { ...v3, id: 'ancien-r63', approches: 3, escales: [{ code: 'LFTH', attJour: 1, attNuit: 0 }], date: '2026-10-01', creeLe: H, modifieLe: H };
  const restaure = await T.evaluate(async a => {
    const s = await import('./js/sauvegarde.js'), e = await import('./js/etat.js');
    const c = await e.contenuComplet();
    const lu = s.lireSauvegarde(s.texteSauvegarde(s.creerSauvegarde({ ...c, vols: [...c.vols, a] })));
    await e.restaurer(lu.donnees);
    const v = e.etat.vols.find(x => x.id === a.id);
    return { ok: lu.ok, approches: v.approches, n: e.etat.vols.length, r63: e.etat.vols.find(x => (x.escales || []).some(y => y.approches === 2))?.approches };
  }, ancien);
  verifier(restaure.ok && restaure.approches === 3 && restaure.r63 === 4, 'sauvegarde restaurée : ancien vol 3 (inchangé), nouveau vol 4 (gardé)');
  await T.click(`#list .flight[data-id="ancien-r63"]`); await T.waitForSelector('#v-saisie:not([hidden])'); await attendre(T, 200);
  verifier(await T.textContent('#s-approches') === '3' && !(await T.textContent('#via-list')).includes('appr.'), 'ancien vol ouvert : ses 3 approches sur l\'arrivée, terrain intermédiaire à 0');
  await T.click('#cancel');

  console.log('R63 : synchro vers le PC (et retour)');
  await T.click('.tabs button[data-v="plus"]'); await T.click('#pl-sync'); await T.click('#sy-ref'); await T.click('#sr-ok');
  await T.waitForFunction(() => /^Synchronisé/.test(document.getElementById('sr-res').textContent), null, { timeout: 30000 }); await T.click('#ou-x');
  const pc = await appareil('PC', nav, { viewport: { width: 1280, height: 800 } });
  const P = pc.p;
  await P.click('.tabs button[data-v="plus"]'); await P.click('#pl-sync'); await P.click('#sy-mod'); await P.click('#sc-ok');
  await P.waitForFunction(() => /^À jour/.test(document.getElementById('sc-res').textContent), null, { timeout: 30000 }); await P.click('#ou-x');
  const surPc = await volEnregistre(P, `v.id === '${v3.id}'`);
  verifier(surPc && surPc.approches === 4 && JSON.stringify(surPc.escales.map(e => e.approches)) === '[2,1]', 'PC : le vol arrive avec ses approches par terrain intermédiaire');
  await P.click('.tabs button[data-v="carnet"]');
  await P.click(`#list .flight[data-id="${v3.id}"]`); await P.waitForSelector('#v-saisie:not([hidden])'); await attendre(P, 200);
  await P.click('#via-list .viachip'); await P.waitForSelector('#via-modal:not([hidden])');
  verifier(await P.textContent('#vm-approches') === '2', 'PC : terrain intermédiaire rouvert avec ses 2 approches');
  await P.click('[data-vm="approches"][data-d="1"]'); await P.click('#vm-ok');
  await P.click('#save'); await P.waitForSelector('#v-carnet:not([hidden])');
  await P.evaluate(async () => (await import('./js/ui/synchro.js')).synchroniser());
  await T.evaluate(async () => (await import('./js/ui/synchro.js')).synchroniser());
  const retour = await volEnregistre(T, `v.id === '${v3.id}'`);
  verifier(retour.approches === 5 && JSON.stringify(retour.escales.map(e => e.approches)) === '[3,1]', 'modifié sur le PC (3 approches) : le téléphone reçoit total 5, terrains 3 et 1');

  console.log('iPad (WebKit, paysage) : saisie avec terrains intermédiaires');
  const ipad = await appareil('iPad', navSafari, { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' }, false);
  const I = ipad.p;
  await I.evaluate(async v => {
    const db = await new Promise(ok => { const r = indexedDB.open('carnet-de-vol'); r.onsuccess = () => ok(r.result); });
    const t = db.transaction('vols', 'readwrite'); t.objectStore('vols').put(v); await new Promise(ok => { t.oncomplete = ok; }); db.close();
  }, retour);
  await I.reload(); await I.waitForSelector('body[data-pret="1"]');
  await I.click('#list .flight'); await I.waitForSelector('#v-saisie:not([hidden])'); await attendre(I, 300);
  verifier(await I.textContent('#s-approches') === '1', 'iPad : arrivée 1');
  await I.screenshot({ path: join(CAPT, 'v027-04-ipad-saisie-escales.png') });
  await I.click('#via-list .viachip'); await I.waitForSelector('#via-modal:not([hidden])'); await attendre(I, 200);
  await I.screenshot({ path: join(CAPT, 'v027-05-ipad-terrain-intermediaire.png') });

  verifier(bloquees.length === 0, `aucune adresse extérieure appelée (${bloquees.length})`);
  verifier(!erreurs.length, 'aucune erreur JavaScript' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  console.log('\nv0.27 réussie.');
} catch (e) {
  console.error(e.message);
  await T.screenshot({ path: join(CAPT, 'v027-erreur-tel.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await nav.close(); await navSafari.close();
  srv.fermer(); faux.close();
}
