// Synchro du carnet par le NAS (v0.23, R50 étape 3) : Plus › Synchro du carnet, envoi discret du téléphone, réception
// sur le PC (consultation : rien ne se modifie sur le PC). Logique pure dans ../synchro.js ; réseau par requete() de
// nas.js (même adresse, même mot de passe, protocole 2). Les photos d'avion ne voyagent pas encore.

import { $, toast, ouvrirOutil, fermerOutil } from './commun.js';
import { etat, reglage, ecrireReglageDiscret, contenuComplet, restaurer, charger, prevenir, enConsultation } from '../etat.js';
import * as db from '../db.js';
import { requete, configNas, nasRefuse, noterRefus, ecranNas } from './nas.js';
import { creerCopieur } from '../copieur.js';
import { elementsDuCarnet, preparerEnvoi, majCarte, forcer, carteDepuisNas, trierRecus, lots, resumeSynchro, REGLAGES_PARTAGES,
  PAR_ENVOI, PAR_PAGE, PERIODE_CONSULTATION } from '../synchro.js';

const nombre = n => n.toLocaleString('fr-FR');
const enLigne = () => navigator.onLine !== false;
export const roleSynchro = () => reglage('synchroRole');
export const etatSynchro = () => reglage('synchroEtat') || {};
export const resumeSynchroActuel = () => resumeSynchro(roleSynchro(), etatSynchro(), Date.now(), enLigne());
async function noter(changements) {
  await ecrireReglageDiscret('synchroEtat', { ...etatSynchro(), ...changements });
  document.dispatchEvent(new CustomEvent('synchro-etat'));
}
function appareil() {
  let a = reglage('synchroAppareil');
  if (!a) { a = (roleSynchro() === 'consultation' ? 'pc-' : 'tel-') + Math.random().toString(36).slice(2, 8); ecrireReglageDiscret('synchroAppareil', a); }
  return a;
}

// ---------- Réseau ----------
async function demander(action, { corps = null, extra = '' } = {}) {
  const r = await requete(action, { corps: corps && JSON.stringify(corps), entetes: corps ? { 'Content-Type': 'application/json' } : {}, extra, delai: 120000 });
  if (r.statut !== 'ok') return r.erreur === 'action' ? { statut: 'nas-ancien' } : r;
  try { return { statut: 'ok', j: await r.reponse.json() }; } catch { return { statut: 'injoignable' }; }
}
// Tout ce que le NAS a depuis le numéro « depuis », page par page (surPage(elements, jusqua) après chaque page)
async function recevoirDepuis(depuis, surPage) {
  let rev = depuis;
  for (;;) {
    const r = await demander('synchro-recevoir', { extra: `&depuis=${rev}&limite=${PAR_PAGE}` });
    if (r.statut !== 'ok') return r;
    await surPage(r.j.elements || [], r.j.jusqua);
    rev = r.j.jusqua;
    if (!r.j.suite) return { statut: 'ok', rev };
  }
}

// ---------- Téléphone : envoyer ce qui a changé ----------
async function envoyer(progres = () => {}) {
  let carte = etatSynchro().carte;
  if (!carte) {
    // Première fois (ou après un arrêt) : on part de ce que le NAS a déjà, pour ne renvoyer que ce qui diffère
    const tous = [];
    const r = await recevoirDepuis(0, async el => { tous.push(...el); });
    if (r.statut !== 'ok') return r;
    carte = carteDepuisNas(tous);
    await noter({ carte });
  }
  const contenu = await contenuComplet();
  const { modifications, empreintes, tropGros } = preparerEnvoi(elementsDuCarnet(contenu), carte);
  let faites = 0, rev = etatSynchro().rev || 0;
  progres(0, modifications.length);
  for (const lot of lots(modifications, PAR_ENVOI)) {
    const r = await demander('synchro-envoyer', { corps: { appareil: appareil(), modifications: lot } });
    if (r.statut !== 'ok') { await noter({ carte }); return r; }
    carte = majCarte(carte, empreintes, r.j);
    rev = r.j.rev;
    // Changé sur le NAS sans passer par ce téléphone : en sens unique, le téléphone fait foi
    if (r.j.conflits && r.j.conflits.length) {
      const r2 = await demander('synchro-envoyer', { corps: { appareil: appareil(), modifications: forcer(lot, r.j.conflits) } });
      if (r2.statut === 'ok') { carte = majCarte(carte, empreintes, r2.j); rev = r2.j.rev; }
    }
    faites += lot.length;
    await noter({ carte, rev });
    progres(faites, modifications.length);
  }
  return { statut: 'ok', envoyees: modifications.length, tropGros: tropGros.length, vols: contenu.vols.length };
}

// ---------- PC : recevoir et ranger ----------
async function recevoir(progres = () => {}) {
  let recus = 0, change = false;
  const r = await recevoirDepuis(etatSynchro().rev || 0, async (elements, jusqua) => {
    const { mettre, enlever } = trierRecus(elements);
    // Une photo d'avion déjà sur cet appareil est gardée (les photos ne voyagent pas encore)
    mettre.avions = mettre.avions.map(a => { const ici = etat.avions.get(a.id); return ici && ici.photo && !a.photo ? { ...a, photo: ici.photo } : a; });
    await db.appliquerSynchro({ mettre, enlever });
    recus += elements.length;
    change = change || elements.length > 0;
    await noter({ rev: jusqua });
    progres(recus);
  });
  if (r.statut !== 'ok') return r;
  if (change) { await charger(); prevenir(); }
  return { statut: 'ok', recus, vols: etat.vols.length };
}

let enCours = null;
export async function synchroniser(progres) {
  if (enCours) return enCours;
  enCours = (async () => {
    const role = roleSynchro();
    if (!role || !configNas().configuree) return { statut: 'pasConfiguree' };
    if (nasRefuse()) return { statut: 'refuse' };
    if (!enLigne()) { await noter({ statut: 'horsLigne' }); return { statut: 'horsLigne' }; }
    let r;
    try { r = role === 'reference' ? await envoyer(progres) : await recevoir(progres); } catch { r = { statut: 'injoignable' }; }
    if (r.statut === 'refuse') await noterRefus();
    if (r.statut === 'ok') await noter({ statut: 'ok', derniere: new Date().toISOString(), vols: r.vols, attente: false });
    else await noter({ statut: r.statut });
    return r;
  })();
  try { return await enCours; } finally { enCours = null; }
}

// Téléphone : quelques secondes après chaque modification (regroupées), nouvel essai si pas de réseau, à l'ouverture…
const envoyeur = creerCopieur({
  envoyer: () => synchroniser(),
  pret: () => roleSynchro() === 'reference' && configNas().configuree && !nasRefuse(),
  enLigne,
  surEtat: ev => { if (['attente', 'horsLigne', 'injoignable'].includes(ev.statut)) noter({ attente: true, ...(ev.statut === 'attente' ? {} : { statut: ev.statut }) }); },
});
export function synchroModifiee() {
  if (roleSynchro() === 'reference') envoyeur.modification();
}

let minuterie = null;
export function initSynchro() {
  document.body.classList.toggle('consultation', enConsultation());
  document.addEventListener('consultation-refus', () => toast('Consultation : les modifications se font sur le téléphone.', 2600));
  const consulter = () => { if (roleSynchro() === 'consultation' && document.visibilityState !== 'hidden') synchroniser(); };
  if (roleSynchro() === 'reference') { envoyeur.restaurerAttente(true); envoyeur.reprendre(4000); } // ce qui a changé depuis
  if (roleSynchro() === 'consultation') setTimeout(consulter, 2500);
  addEventListener('online', () => { envoyeur.reprendre(1500); setTimeout(consulter, 1500); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { envoyeur.reprendre(2000); setTimeout(consulter, 1000); } });
  clearInterval(minuterie);
  minuterie = setInterval(consulter, PERIODE_CONSULTATION);
  document.addEventListener('synchro-etat', majBandeau);
  setInterval(majBandeau, 60000);
  majBandeau();
}

// Bandeau du Carnet sur l'appareil qui consulte
function majBandeau() {
  const b = $('#sync-bandeau');
  if (!b) return;
  b.hidden = roleSynchro() !== 'consultation';
  if (!b.hidden) b.textContent = `${resumeSynchroActuel()} · les modifications se font sur le téléphone ›`;
}

// ---------- Plus › Synchro du carnet ----------
export function ecranSynchro() {
  const c = configNas();
  if (!c.configuree) {
    const o = ouvrirOutil('Synchro du carnet', `<p class="hint" style="font-size:15px">La synchro passe par ton NAS : enregistre d'abord son adresse et son mot de passe.</p>
      <button type="button" class="bigbtn" id="sy-conf">Copie sur le NAS ›</button>`);
    o.querySelector('#sy-conf').addEventListener('click', ecranNas);
    return;
  }
  const role = roleSynchro();
  if (!role) {
    const o = ouvrirOutil('Synchro du carnet', `
      <p class="hint" style="font-size:15px">Le téléphone envoie son carnet au NAS ; le PC le consulte (sans rien modifier). Les modifications se font sur le téléphone.</p>
      <button type="button" class="bigbtn" id="sy-ref">Ce téléphone envoie le carnet ›</button>
      <button type="button" class="bigbtn second" id="sy-cons">Cet appareil consulte le carnet du téléphone ›</button>
      <p class="hint">Les photos d'avion ne voyagent pas encore. Les copies sur le NAS continuent comme avant (depuis le téléphone).</p>`);
    o.querySelector('#sy-ref').addEventListener('click', confirmerReference);
    o.querySelector('#sy-cons').addEventListener('click', confirmerConsultation);
    return;
  }
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec"><h3>${role === 'reference' ? 'Ce téléphone envoie le carnet' : 'Consultation du carnet du téléphone'}</h3>
      <p id="sy-etat" role="status"></p>
      <p class="hint" id="sy-detail"></p>
      <button type="button" class="bigbtn" id="sy-go">${role === 'reference' ? 'Envoyer maintenant' : 'Mettre à jour maintenant'}</button>
      <p class="prog" id="sy-res" role="status"></p>
    </div>
    <p class="hint">${role === 'reference' ? 'Après chaque modification, ce qui a changé part tout seul quelques secondes plus tard (pas de réseau ou NAS éteint : plus tard, rien n\'est perdu).'
      : 'Le carnet se met à jour à l\'ouverture et toutes les 2 minutes. Rien ne peut être modifié ici : les modifications se font sur le téléphone.'}</p>
    <button type="button" class="linkbtn" id="sy-stop">${role === 'reference' ? 'Arrêter l\'envoi' : 'Arrêter la consultation'}</button>`);
  const maj = () => {
    if (!$('#sy-etat')) return;
    $('#sy-etat').textContent = resumeSynchroActuel();
    const x = etatSynchro();
    $('#sy-detail').textContent = x.vols !== undefined ? `${nombre(x.vols)} vols${role === 'reference' ? ` · ${nombre(Object.keys(x.carte || {}).length)} éléments sur le NAS` : ''}` : '';
  };
  maj();
  document.addEventListener('synchro-etat', maj);
  o.querySelector('#sy-go').addEventListener('click', async () => {
    const b = o.querySelector('#sy-go'), p = o.querySelector('#sy-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Synchro en cours…';
    const r = await synchroniser((n, total) => { p.textContent = role === 'reference' ? `Envoi : ${nombre(n)} / ${nombre(total)}` : `Réception : ${nombre(n)} éléments`; });
    b.disabled = false;
    p.textContent = texteResultat(r); p.className = r.statut === 'ok' ? 'okc' : 'koc';
  });
  o.querySelector('#sy-stop').addEventListener('click', () => confirmerArret(role));
}

const TEXTES = { horsLigne: 'Pas de réseau : la synchro se fera plus tard.', injoignable: 'NAS injoignable : la synchro se fera plus tard.',
  refuse: 'Mot de passe refusé : corrige-le dans Copie sur le NAS.', 'nas-ancien': 'Le NAS n\'a pas encore carnet.php version 5 (guide, « Mise à jour v5 »).',
  pasConfiguree: 'Synchro non configurée.', bloque: 'Trop d\'essais de mot de passe : réessaie plus tard.' };
function texteResultat(r) {
  if (r.statut !== 'ok') return TEXTES[r.statut] || TEXTES.injoignable;
  if (r.envoyees !== undefined) return r.envoyees ? `Envoyé : ${nombre(r.envoyees)} modification${r.envoyees > 1 ? 's' : ''}. Le NAS a le carnet à jour (${nombre(r.vols)} vols).`
    : `Rien de nouveau : le NAS a déjà le carnet à jour (${nombre(r.vols)} vols).`;
  return `À jour : ${nombre(r.vols)} vols${r.recus ? ` (${nombre(r.recus)} élément${r.recus > 1 ? 's' : ''} reçu${r.recus > 1 ? 's' : ''})` : ''}.`;
}

// Le NAS connaît-il la synchro (carnet.php v5) ? -> { statut, j: { rev, nombres } }
const etatNas = () => demander('synchro-etat');

function confirmerReference() {
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec resume"><h3>Ce téléphone envoie son carnet</h3>
      <p>Son carnet (<b>${nombre(etat.vols.length)} vols</b>) part sur le NAS ; ensuite, seulement ce qui change.</p></div>
    <p class="hint">À faire sur un seul appareil : celui où tu saisis tes vols.</p>
    <button type="button" class="bigbtn vert" id="sr-ok">Envoyer le carnet</button>
    <button type="button" class="bigbtn second annuler" id="sr-no">Annuler</button>
    <p class="prog" id="sr-res" role="status"></p>`);
  o.querySelector('#sr-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sr-ok').addEventListener('click', async () => {
    const b = o.querySelector('#sr-ok'), p = o.querySelector('#sr-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Le NAS est-il prêt ?';
    const n = await etatNas();
    if (n.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[n.statut] || TEXTES.injoignable; return; }
    await ecrireReglageDiscret('synchroRole', 'reference');
    await ecrireReglageDiscret('synchroEtat', {});
    appareil();
    p.textContent = 'Envoi en cours…';
    const r = await synchroniser((k, total) => { p.textContent = `Envoi : ${nombre(k)} / ${nombre(total)}`; });
    p.className = r.statut === 'ok' ? 'okc' : 'koc';
    p.textContent = texteResultat(r) + (r.statut === 'ok' ? '' : ' Le téléphone réessaiera tout seul.');
    if (r.statut !== 'ok') envoyeur.modification();
    document.dispatchEvent(new CustomEvent('synchro-etat'));
    setTimeout(() => { if (o.isConnected && $('#sr-res')) ecranSynchro(); }, 2500);
  });
}

function confirmerConsultation() {
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec resume"><h3>Consulter le carnet du téléphone</h3>
      <p>Le carnet de cet appareil${etat.vols.length ? ` (<b>${nombre(etat.vols.length)} vols</b>)` : ''} est <b>remplacé</b> par celui que le téléphone a envoyé au NAS.</p></div>
    <p class="hint">Ensuite, rien ne peut être modifié ici : les modifications se font sur le téléphone. Cet appareil n'envoie plus de copie au NAS.</p>
    <button type="button" class="bigbtn vert" id="sc-ok">Consulter le carnet du téléphone</button>
    <button type="button" class="bigbtn second annuler" id="sc-no">Annuler</button>
    <p class="prog" id="sc-res" role="status"></p>`);
  o.querySelector('#sc-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sc-ok').addEventListener('click', async () => {
    const b = o.querySelector('#sc-ok'), p = o.querySelector('#sc-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Le NAS est-il prêt ?';
    const n = await etatNas();
    if (n.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[n.statut] || TEXTES.injoignable; return; }
    if (!n.j.rev) { b.disabled = false; p.className = 'koc'; p.textContent = 'Le téléphone n\'a encore rien envoyé : sur le téléphone, Plus › Synchro du carnet › « Ce téléphone envoie le carnet ».'; return; }
    // Le carnet de cet appareil est vidé (ses réglages propres sont gardés), puis tout est reçu
    const reglagesIci = Object.entries(etat.reglages).filter(([k]) => !REGLAGES_PARTAGES.includes(k)).map(([cle, valeur]) => ({ cle, valeur }));
    await restaurer({ vols: [], avions: [], personnes: [], suppressions: [], reglages: reglagesIci });
    await ecrireReglageDiscret('synchroRole', 'consultation');
    await ecrireReglageDiscret('synchroEtat', { rev: 0 });
    document.body.classList.add('consultation');
    p.textContent = 'Réception en cours…';
    const r = await synchroniser(k => { p.textContent = `Réception : ${nombre(k)} éléments`; });
    p.className = r.statut === 'ok' ? 'okc' : 'koc';
    p.textContent = texteResultat(r) + (r.statut === 'ok' ? '' : ' Cet appareil réessaiera tout seul.');
    document.dispatchEvent(new CustomEvent('synchro-etat'));
  });
}

function confirmerArret(role) {
  const o = ouvrirOutil('Synchro du carnet', role === 'reference'
    ? `<div class="sec resume"><h3>Arrêter l'envoi ?</h3><p>Le carnet de ce téléphone ne change pas. Les appareils qui consultent ne recevront plus les nouveautés.</p></div>
       <button type="button" class="bigbtn" id="sa-ok" style="background:var(--feu)">Arrêter l'envoi</button>
       <button type="button" class="bigbtn second annuler" id="sa-no">Annuler</button>`
    : `<div class="sec resume"><h3>Arrêter la consultation ?</h3><p>Le carnet reste affiché sur cet appareil mais n'est plus mis à jour. Sa copie automatique sur le NAS reste arrêtée (pour ne pas mélanger deux carnets).</p></div>
       <button type="button" class="bigbtn" id="sa-ok" style="background:var(--feu)">Arrêter la consultation</button>
       <button type="button" class="bigbtn second annuler" id="sa-no">Annuler</button>`);
  o.querySelector('#sa-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sa-ok').addEventListener('click', async () => {
    if (role === 'consultation') await ecrireReglageDiscret('nasAuto', false);
    await ecrireReglageDiscret('synchroRole', undefined);
    await ecrireReglageDiscret('synchroEtat', {});
    document.body.classList.remove('consultation');
    document.dispatchEvent(new CustomEvent('synchro-etat'));
    toast(role === 'reference' ? 'Envoi arrêté' : 'Consultation arrêtée');
    fermerOutil();
  });
}

