// Synchro du carnet par le NAS (carnet.php v5) : Plus › Synchro du carnet, bandeaux du Carnet, conflits, doublons.
// v0.23 : le téléphone envoie, le PC consulte. v0.24 : DEUX SENS : le téléphone (« reference ») et le PC (« modification »)
// envoient ET reçoivent. Un élément changé des deux côtés n'est jamais écrasé : conflit, le pilote choisit.
// Logique pure dans ../synchro.js ; réseau par requete() de nas.js (même adresse, même mot de passe, protocole 2).
// Les photos d'avion ne voyagent pas encore (v0.25). Les copies du carnet sur le NAS partent du téléphone seulement.

import { $, esc, toast, ouvrirOutil, fermerOutil } from './commun.js';
import { etat, reglage, ecrireReglageDiscret, contenuComplet, restaurer, charger, prevenir, enConsultation, supprimerVol, avionDe } from '../etat.js';
import * as db from '../db.js';
import { requete, configNas, nasRefuse, noterRefus, ecranNas } from './nas.js';
import { creerCopieur } from '../copieur.js';
import { cleVolOuvert } from './saisie.js';
import { nouvelId, cleDoublon } from '../modele.js';
import { hm, dateFr } from '../temps.js';
import { elementsDuCarnet, preparerEnvoi, majCarte, carteDepuisNas, trierRecus, lots, resumeSynchro, REGLAGES_PARTAGES,
  PAR_ENVOI, PAR_PAGE, PERIODE_CONSULTATION, cleElement, empreinteTexte, analyserRecus, compterSuppressions, SUPPRESSIONS_A_CONFIRMER,
  nomAppareil, differences, doublons, texteRafraichir, duNom, ceNom, ceNomMin as ceNomMinDe, leNom, estIPad } from '../synchro.js';

const nombre = n => n.toLocaleString('fr-FR');
const enLigne = () => navigator.onLine !== false;
const pluriel = (n, s = 's') => (n > 1 ? s : '');
export const roleSynchro = () => reglage('synchroRole');
const deuxSens = () => ['reference', 'modification'].includes(roleSynchro());
export const etatSynchro = () => reglage('synchroEtat') || {};
const resumeEtat = () => {
  const e = etatSynchro();
  return { ...e, conflits: (e.conflits || []).length, aConfirmer: e.aConfirmer || 0 };
};
export const resumeSynchroActuel = () => resumeSynchro(roleSynchro(), resumeEtat(), Date.now(), enLigne());
async function noter(changements) {
  await ecrireReglageDiscret('synchroEtat', { ...etatSynchro(), ...changements });
  document.dispatchEvent(new CustomEvent('synchro-etat'));
}
// Sorte d'appareil : téléphone (référence), sinon iPad ou PC (v0.25 : l'iPad est un 3e appareil, en modification)
const typeAppareil = () => (roleSynchro() === 'reference' ? 'téléphone' : estIPad(navigator.userAgent, navigator.maxTouchPoints) ? 'iPad' : 'PC');
function appareil() {
  let a = reglage('synchroAppareil');
  if (!a) { a = { 'téléphone': 'tel-', iPad: 'ipad-', PC: 'pc-' }[typeAppareil()] + Math.random().toString(36).slice(2, 8); ecrireReglageDiscret('synchroAppareil', a); }
  return a;
}
// Nom de cet appareil, pour les boutons « Garder la version du PC / de l'iPad / du téléphone »
const nomIci = () => typeAppareil();
const ceNomMin = () => ceNomMinDe(nomIci());

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

// ---------- Le carnet de cet appareil, élément par élément ----------
async function locauxActuels() {
  const contenu = await contenuComplet();
  const m = new Map();
  for (const e of elementsDuCarnet(contenu)) m.set(cleElement(e.magasin, e.id), { ...e, h: empreinteTexte(JSON.stringify(e.donnees)) });
  return { m, vols: contenu.vols.length };
}
// Écrit des éléments sur cet appareil (donnees null : supprimé). Les photos d'avion d'ici sont gardées.
async function ecrireIci(liste) {
  const recus = liste.map(x => ({ magasin: x.magasin, id: x.id, supprime: x.donnees === null, donnees: x.donnees }));
  const { mettre, enlever } = trierRecus(recus);
  mettre.avions = mettre.avions.map(a => { const ici = etat.avions.get(a.id); return ici && ici.photo && !a.photo ? { ...a, photo: ici.photo } : a; });
  await db.appliquerSynchro({ mettre, enlever });
}
// « Annuler la dernière synchro » : ce que la synchro a remplacé ici, gardé 30 jours (20 synchros au plus)
async function garderHistorique(remplaces) {
  if (!remplaces.length) return;
  const limite = new Date(Date.now() - 30 * 864e5).toISOString();
  const h = (reglage('synchroHistorique') || []).filter(x => x.le >= limite);
  h.push({ le: new Date().toISOString(), elements: remplaces });
  await ecrireReglageDiscret('synchroHistorique', h.slice(-20));
}

// ---------- Deux sens : recevoir, puis envoyer ----------
async function cycleDeuxSens(progres) {
  let e = etatSynchro();
  if (!e.deuxSensDepuis) await noter({ deuxSensDepuis: new Date().toISOString() });
  let carte = e.carte;
  if (!carte) {
    // Première fois (ou après un arrêt) : on part de ce que le NAS a déjà, pour ne renvoyer que ce qui diffère
    const tous = [];
    const r = await recevoirDepuis(0, async el => { tous.push(...el); });
    if (r.statut !== 'ok') return r;
    carte = carteDepuisNas(tous);
    await noter({ carte, rev: r.rev });
  }
  // 1. Recevoir ce que l'autre appareil a changé
  let { m: locaux } = await locauxActuels();
  let conflits = new Map((etatSynchro().conflits || []).map(c => [c.cle, c]));
  let recus = 0, appliques = 0;
  const remplaces = [];
  const ouvert = cleVolOuvert();
  const r1 = await recevoirDepuis(etatSynchro().rev || 0, async (elements, jusqua) => {
    if (elements.length) ({ m: locaux } = await locauxActuels()); // relu juste avant : rien de saisi entre-temps n'est écrasé
    const a = analyserRecus(elements, locaux, carte, ouvert);
    for (const x of a.appliquer) remplaces.push({ magasin: x.magasin, id: x.id, avant: locaux.get(cleElement(x.magasin, x.id))?.donnees ?? null });
    if (a.appliquer.length) await ecrireIci(a.appliquer);
    for (const x of a.appliquer) {
      const cle = cleElement(x.magasin, x.id);
      if (x.donnees === null) locaux.delete(cle); else locaux.set(cle, { magasin: x.magasin, id: x.id, donnees: x.donnees, h: empreinteTexte(JSON.stringify(x.donnees)) });
    }
    for (const c of a.conflits) conflits.set(c.cle, c);
    // un élément reçu à l'identique de la version d'ici règle un ancien conflit
    for (const k of [...conflits.keys()]) if (a.carte[k] && locaux.get(k)?.h === a.carte[k][1]) conflits.delete(k);
    carte = a.carte;
    recus += elements.length; appliques += a.appliquer.length;
    await noter({ carte, rev: jusqua, conflits: [...conflits.values()] });
    progres('recu', recus);
  });
  if (r1.statut !== 'ok') return r1;
  await garderHistorique(remplaces);
  if (appliques) { await charger(); prevenir(); ({ m: locaux } = await locauxActuels()); }
  // 2. Envoyer ce qui a changé ici (sauf les conflits ; plus de 20 suppressions : seulement après confirmation)
  const contenu = await contenuComplet();
  const p = preparerEnvoi(elementsDuCarnet(contenu), carte, new Set(conflits.keys()));
  let mods = p.modifications;
  const suppressions = compterSuppressions(mods);
  let aConfirmer = 0;
  if (suppressions > SUPPRESSIONS_A_CONFIRMER && !etatSynchro().suppressionsConfirmees) { aConfirmer = suppressions; mods = mods.filter(x => !x.supprime); }
  let faites = 0, restent = mods.length;
  progres('envoi', 0, mods.length);
  for (const lot of lots(mods, PAR_ENVOI)) {
    const r = await demander('synchro-envoyer', { corps: { appareil: appareil(), modifications: lot } });
    if (r.statut !== 'ok') { await noter({ carte, attente: restent + aConfirmer }); return r; }
    carte = majCarte(carte, p.empreintes, r.j);
    // Conflit au NAS : l'autre appareil vient de changer cet élément ; il arrivera à la prochaine réception
    restent -= (r.j.acceptees || []).length + (r.j.deja || []).length;
    faites += lot.length;
    await noter({ carte });
    progres('envoi', faites, mods.length);
  }
  await noter({ carte, attente: Math.max(0, restent), aConfirmer, suppressionsConfirmees: false, conflits: [...conflits.values()] });
  return { statut: 'ok', envoyees: faites - Math.max(0, restent), recus: appliques, vols: contenu.vols.length, conflits: conflits.size, aConfirmer };
}

// ---------- Consultation (PC qui ne modifie rien) : recevoir et ranger ----------
async function cycleConsultation(progres) {
  let recus = 0, change = false, carte = etatSynchro().carte || {};
  const r = await recevoirDepuis(etatSynchro().rev || 0, async (elements, jusqua) => {
    await ecrireIci(elements.map(x => ({ magasin: x.magasin, id: x.id, donnees: x.supprime ? null : x.donnees })));
    carte = { ...carte, ...carteDepuisNas(elements) }; // gardée pour un passage en modification
    recus += elements.length;
    change = change || elements.length > 0;
    await noter({ rev: jusqua, carte });
    progres('recu', recus);
  });
  if (r.statut !== 'ok') return r;
  if (change) { await charger(); prevenir(); }
  return { statut: 'ok', recus, vols: etat.vols.length };
}

// Une seule opération à la fois sur l'état de la synchro (synchro, choix d'un conflit, annulation, remise…) : sinon une
// synchro en cours pourrait réécrire un choix fait pendant qu'elle tournait.
let file = Promise.resolve();
function exclusif(f) { const r = file.then(f, f); file = r.catch(() => {}); return r; }

let enCours = null;
export async function synchroniser(progres = () => {}) {
  if (enCours) return enCours;
  enCours = exclusif(async () => {
    const role = roleSynchro();
    if (!role || !configNas().configuree) return { statut: 'pasConfiguree' };
    if (nasRefuse()) return { statut: 'refuse' };
    if (!enLigne()) {
      // Hors ligne : on compte ce qui attend (visible dans Plus et en haut du Carnet)
      if (deuxSens() && etatSynchro().carte) {
        const p = preparerEnvoi(elementsDuCarnet(await contenuComplet()), etatSynchro().carte, new Set((etatSynchro().conflits || []).map(c => c.cle)));
        await noter({ statut: 'horsLigne', attente: p.modifications.length });
      } else await noter({ statut: 'horsLigne' });
      return { statut: 'horsLigne' };
    }
    let r;
    try { r = deuxSens() ? await cycleDeuxSens(progres) : await cycleConsultation(progres); } catch { r = { statut: 'injoignable' }; }
    if (r.statut === 'refuse') await noterRefus();
    if (r.statut === 'ok') await noter({ statut: 'ok', derniere: new Date().toISOString(), vols: r.vols });
    else await noter({ statut: r.statut });
    return r;
  });
  try { return await enCours; } finally { enCours = null; }
}

// v0.26 (R62) : envoi dès l'enregistrement (regroupé sur 0,3 s seulement), nouvel essai si pas de réseau, à l'ouverture…
const envoyeur = creerCopieur({
  regroupement: 300,
  envoyer: () => synchroniser(),
  pret: () => deuxSens() && configNas().configuree && !nasRefuse(),
  enLigne,
  // Pas de réseau : synchroniser() ne contacte pas le NAS mais compte ce qui attend (« N en attente », Plus et Carnet)
  surEtat: ev => { if (ev.statut === 'horsLigne') synchroniser(); else if (ev.statut === 'injoignable') noter({ statut: ev.statut }); },
});
export function synchroModifiee() {
  if (!deuxSens()) return;
  envoyeur.modification();
  compterAttente(); // « N en attente d'envoi » s'affiche tout de suite, jusqu'à ce que ce soit parti
}

// ---------- R62 : ce qui attend, compté à partir du carnet en mémoire (sans attendre la base) ----------
function attenteEnMemoire() {
  const e = etatSynchro();
  if (!e.carte) return null;
  const contenu = { vols: etat.vols, avions: [...etat.avions.values()], personnes: etat.personnes,
    reglages: Object.entries(etat.reglages).map(([cle, valeur]) => ({ cle, valeur })) };
  const p = preparerEnvoi(elementsDuCarnet(contenu), e.carte, new Set((e.conflits || []).map(c => c.cle)));
  // plus de 20 suppressions : elles attendent la confirmation, elles ne partent pas toutes seules
  const mods = compterSuppressions(p.modifications) > SUPPRESSIONS_A_CONFIRMER && !e.suppressionsConfirmees ? p.modifications.filter(m => !m.supprime) : p.modifications;
  return mods;
}
function compterAttente() {
  const m = attenteEnMemoire();
  if (m && m.length !== (etatSynchro().attente || 0)) noter({ attente: m.length });
}
// App mise en arrière-plan ou fermée : dernier envoi immédiat de ce qui attend. La demande est faite pour survivre à la
// fermeture (keepalive). Si elle n'arrive pas, rien n'est perdu : tout repart à la prochaine ouverture (le NAS répond
// « déjà là » pour ce qui était quand même arrivé).
export function dernierEnvoi() {
  if (!deuxSens() || !configNas().configuree || nasRefuse() || !enLigne()) return false;
  const mods = attenteEnMemoire();
  if (!mods || !mods.length) return false;
  const corps = JSON.stringify({ appareil: appareil(), modifications: mods });
  if (corps.length > 60000) return false; // trop gros pour une demande qui survit à la fermeture : à la réouverture
  requete('synchro-envoyer', { corps, entetes: { 'Content-Type': 'application/json' }, keepalive: true, delai: 20000 });
  return true;
}

// ---------- R61 : bouton « Rafraîchir » du Carnet ----------
async function rafraichir() {
  const b = $('#rafraichir');
  if (b.classList.contains('tourne')) return;
  b.classList.add('tourne'); b.setAttribute('aria-busy', 'true');
  let r;
  try { r = roleSynchro() && configNas().configuree ? await synchroniser() : { statut: 'pasConfiguree' }; } finally { b.classList.remove('tourne'); b.removeAttribute('aria-busy'); }
  toast(texteRafraichir(r, resumeEtat()), r.statut === 'ok' ? 1600 : 3200);
}

let minuterie = null;
export function initSynchro() {
  document.body.classList.toggle('consultation', enConsultation());
  document.addEventListener('consultation-refus', () => toast('Consultation : les modifications se font sur le téléphone.', 2600));
  const regarder = () => { if (roleSynchro() && document.visibilityState !== 'hidden' && !nasRefuse()) synchroniser(); };
  if (deuxSens()) { envoyeur.restaurerAttente(true); envoyeur.reprendre(1500); } // ouverture : recevoir et envoyer (ce qui n'était pas parti aussi)
  // R62 : app en arrière-plan ou fermée -> dernier envoi de ce qui attend
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') dernierEnvoi(); });
  addEventListener('pagehide', () => dernierEnvoi());
  $('#rafraichir').addEventListener('click', rafraichir);
  if (roleSynchro() === 'consultation') setTimeout(regarder, 2500);
  addEventListener('online', () => setTimeout(regarder, 1500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(regarder, 1000); });
  clearInterval(minuterie);
  minuterie = setInterval(regarder, PERIODE_CONSULTATION); // toutes les 2 min, app ouverte
  document.addEventListener('synchro-etat', majBandeaux);
  setInterval(majBandeaux, 60000);
  $('#sync-bandeau').addEventListener('click', ecranSynchro);
  $('#conflit-bandeau').addEventListener('click', ecranConflits);
  $('#doublon-bandeau').addEventListener('click', ecranDoublons);
  $('#suppr-bandeau').addEventListener('click', ecranSuppressions);
  majBandeaux();
}

// ---------- Bandeaux du Carnet ----------
const immatDe = v => avionDe(v)?.immat || '';
const doublonsActuels = () => (deuxSens() ? doublons(etat.vols, v => cleDoublon(v, immatDe(v)), etatSynchro().deuxSensDepuis, reglage('doublonsVus') || []) : []);
export function majBandeaux() {
  const role = roleSynchro(), e = resumeEtat();
  const sb = $('#sync-bandeau');
  if (!sb) return;
  // v0.26 (R62) : « N en attente d'envoi » reste visible tant que quelque chose n'est pas parti
  const probleme = deuxSens() && (e.attente > 0 || e.statut === 'refuse');
  sb.hidden = !(role === 'consultation' || probleme);
  sb.classList.toggle('discret', deuxSens());
  if (!sb.hidden) sb.textContent = role === 'consultation' ? `${resumeSynchroActuel()} · les modifications se font sur le téléphone ›` : `${resumeSynchroActuel()} ›`;
  const nc = e.conflits;
  $('#conflit-bandeau').hidden = !deuxSens() || !nc;
  $('#conflit-bandeau').textContent = `${nc} élément${pluriel(nc)} modifié${pluriel(nc)} sur les deux appareils › Choisir`;
  const nd = doublonsActuels().length;
  $('#doublon-bandeau').hidden = !nd;
  $('#doublon-bandeau').textContent = nd > 1 ? `${nd} doublons possibles › Voir` : 'Doublon possible › Voir';
  $('#suppr-bandeau').hidden = !deuxSens() || !e.aConfirmer;
  $('#suppr-bandeau').textContent = `${e.aConfirmer} suppressions à envoyer › Confirmer`;
}

// ---------- Plus › Synchro du carnet ----------
const TEXTES = { horsLigne: 'Pas de réseau : la synchro se fera plus tard.', injoignable: 'NAS injoignable : la synchro se fera plus tard.',
  refuse: 'Mot de passe refusé : corrige-le dans Copie sur le NAS.', 'nas-ancien': 'Le NAS n\'a pas encore carnet.php version 5 (guide, « Mise à jour v5 »).',
  pasConfiguree: 'Synchro non configurée.', bloque: 'Trop d\'essais de mot de passe : réessaie plus tard.' };
function texteResultat(r) {
  if (r.statut !== 'ok') return TEXTES[r.statut] || TEXTES.injoignable;
  if (r.envoyees !== undefined) {
    const p = [];
    p.push(r.recus ? `${nombre(r.recus)} reçu${pluriel(r.recus)}` : 'rien de reçu');
    p.push(r.envoyees ? `${nombre(r.envoyees)} envoyé${pluriel(r.envoyees)}` : 'rien à envoyer');
    if (r.conflits) p.push(`${r.conflits} à choisir`);
    if (r.aConfirmer) p.push(`${r.aConfirmer} suppressions à confirmer`);
    return `Synchronisé : ${p.join(', ')} (${nombre(r.vols)} vols).`;
  }
  return `À jour : ${nombre(r.vols)} vols${r.recus ? ` (${nombre(r.recus)} élément${pluriel(r.recus)} reçu${pluriel(r.recus)})` : ''}.`;
}
const texteProgres = p => (etape, n, total) => { p.textContent = etape === 'recu' ? `Réception : ${nombre(n)} éléments` : `Envoi : ${nombre(n)} / ${nombre(total)}`; };
const etatNasSynchro = () => demander('synchro-etat');

export function ecranSynchro() {
  if (!configNas().configuree) {
    const o = ouvrirOutil('Synchro du carnet', `<p class="hint" style="font-size:15px">La synchro passe par ton NAS : enregistre d'abord son adresse et son mot de passe.</p>
      <button type="button" class="bigbtn" id="sy-conf">Copie sur le NAS ›</button>`);
    o.querySelector('#sy-conf').addEventListener('click', ecranNas);
    return;
  }
  const role = roleSynchro();
  if (!role) {
    const o = ouvrirOutil('Synchro du carnet', `
      <p class="hint" style="font-size:15px">Le carnet passe par ton NAS. Le <b>téléphone</b> est l'appareil de référence ; le <b>PC</b> et l'<b>iPad</b> peuvent le modifier aussi, ou seulement le consulter.</p>
      <button type="button" class="bigbtn" id="sy-ref">Ce téléphone : envoyer et recevoir le carnet ›</button>
      <button type="button" class="bigbtn second" id="sy-mod">${ceNom(estIPad(navigator.userAgent, navigator.maxTouchPoints) ? 'iPad' : 'PC')} : recevoir le carnet et le modifier aussi ›</button>
      <button type="button" class="bigbtn second" id="sy-cons">Cet appareil consulte seulement ›</button>
      <p class="hint">Les photos d'avion ne voyagent pas encore. Les copies sur le NAS partent du téléphone seulement.</p>`);
    o.querySelector('#sy-ref').addEventListener('click', confirmerReference);
    o.querySelector('#sy-mod').addEventListener('click', () => confirmerRejoindre('modification'));
    o.querySelector('#sy-cons').addEventListener('click', () => confirmerRejoindre('consultation'));
    return;
  }
  const titres = { reference: 'Ce téléphone envoie et reçoit le carnet', modification: `${ceNom(nomIci())} envoie et reçoit le carnet`, consultation: 'Consultation du carnet du téléphone' };
  const h = reglage('synchroHistorique') || [], dernier = h[h.length - 1];
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec"><h3>${titres[role]}</h3>
      <p id="sy-etat" role="status"></p>
      <p class="hint" id="sy-detail"></p>
      <button type="button" class="bigbtn" id="sy-go">Synchroniser maintenant</button>
      <p class="prog" id="sy-res" role="status"></p>
      <button type="button" class="bigbtn second" id="sy-conflits" hidden></button>
      <button type="button" class="bigbtn second" id="sy-suppr" hidden></button>
    </div>
    <p class="hint">${role === 'consultation' ? 'Le carnet se met à jour à l\'ouverture et toutes les 2 minutes. Rien ne peut être modifié ici.'
      : 'À l\'ouverture, quelques secondes après chaque enregistrement, au retour du réseau et toutes les 2 minutes. Pas de réseau ou NAS éteint : rien n\'est perdu, ça part plus tard.'}</p>
    ${role === 'consultation' ? '<button type="button" class="bigbtn second" id="sy-passer">Passer en modification ›</button>' : ''}
    ${role !== 'consultation' && dernier ? `<button type="button" class="linkbtn" id="sy-annuler">Annuler la dernière synchro (${dateFr(dernier.le.slice(0, 10))}, ${dernier.elements.length} élément${pluriel(dernier.elements.length)}) ›</button>` : ''}
    <button type="button" class="linkbtn" id="sy-stop">${role === 'consultation' ? 'Arrêter la consultation' : 'Arrêter la synchro'}</button>`);
  const maj = () => {
    if (!$('#sy-etat')) return;
    const x = resumeEtat();
    $('#sy-etat').textContent = resumeSynchroActuel();
    $('#sy-detail').textContent = x.vols !== undefined ? `${nombre(x.vols)} vols` : '';
    $('#sy-conflits').hidden = !x.conflits;
    $('#sy-conflits').textContent = `Choisir : ${x.conflits} élément${pluriel(x.conflits)} modifié${pluriel(x.conflits)} des deux côtés ›`;
    $('#sy-suppr').hidden = !x.aConfirmer;
    $('#sy-suppr').textContent = `${x.aConfirmer} suppressions à confirmer ›`;
  };
  maj();
  document.addEventListener('synchro-etat', maj);
  o.querySelector('#sy-go').addEventListener('click', async () => {
    const b = o.querySelector('#sy-go'), p = o.querySelector('#sy-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Synchro en cours…';
    const r = await synchroniser(texteProgres(p));
    b.disabled = false;
    p.textContent = texteResultat(r); p.className = r.statut === 'ok' ? 'okc' : 'koc';
  });
  o.querySelector('#sy-conflits').addEventListener('click', ecranConflits);
  o.querySelector('#sy-suppr').addEventListener('click', ecranSuppressions);
  o.querySelector('#sy-passer')?.addEventListener('click', confirmerPassage);
  o.querySelector('#sy-annuler')?.addEventListener('click', confirmerAnnulation);
  o.querySelector('#sy-stop').addEventListener('click', () => confirmerArret(role));
}

function confirmerReference() {
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec resume"><h3>Ce téléphone envoie et reçoit le carnet</h3>
      <p>Son carnet (<b>${nombre(etat.vols.length)} vols</b>) est l'appareil de référence : il part sur le NAS (seulement ce qui diffère de ce que le NAS a déjà), puis tout ce qui change dans un sens ou dans l'autre.</p></div>
    <button type="button" class="bigbtn vert" id="sr-ok">Envoyer le carnet</button>
    <button type="button" class="bigbtn second annuler" id="sr-no">Annuler</button>
    <p class="prog" id="sr-res" role="status"></p>`);
  o.querySelector('#sr-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sr-ok').addEventListener('click', async () => {
    const b = o.querySelector('#sr-ok'), p = o.querySelector('#sr-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Le NAS est-il prêt ?';
    const n = await etatNasSynchro();
    if (n.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[n.statut] || TEXTES.injoignable; return; }
    await ecrireReglageDiscret('synchroRole', 'reference');
    await ecrireReglageDiscret('synchroEtat', { deuxSensDepuis: new Date().toISOString() });
    appareil();
    p.textContent = 'Envoi en cours…';
    const r = await synchroniser(texteProgres(p));
    p.className = r.statut === 'ok' ? 'okc' : 'koc';
    p.textContent = texteResultat(r) + (r.statut === 'ok' ? '' : ' Le téléphone réessaiera tout seul.');
    if (r.statut !== 'ok') envoyeur.modification();
  });
}

// Recevoir tout le carnet du NAS et le ranger ici (vider : le carnet de cet appareil est remplacé)
async function toutRecevoir(vider, progres) {
  if (vider) {
    const reglagesIci = Object.entries(etat.reglages).filter(([k]) => !REGLAGES_PARTAGES.includes(k)).map(([cle, valeur]) => ({ cle, valeur }));
    await restaurer({ vols: [], avions: [], personnes: [], suppressions: [], reglages: reglagesIci });
  }
  let carte = {}, n = 0;
  const r = await recevoirDepuis(0, async elements => {
    await ecrireIci(elements.map(x => ({ magasin: x.magasin, id: x.id, donnees: x.supprime ? null : x.donnees })));
    carte = { ...carte, ...carteDepuisNas(elements) };
    n += elements.length; progres('recu', n);
  });
  if (r.statut !== 'ok') return r;
  await charger(); prevenir();
  return { statut: 'ok', rev: r.rev, carte };
}

function confirmerRejoindre(role) {
  const modif = role === 'modification';
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec resume"><h3>${modif ? 'Recevoir le carnet et le modifier aussi' : 'Consulter le carnet du téléphone'}</h3>
      <p>Le carnet de cet appareil${etat.vols.length ? ` (<b>${nombre(etat.vols.length)} vols</b>)` : ''} est <b>remplacé</b> par celui que le téléphone a envoyé au NAS.</p></div>
    <p class="hint">${modif ? 'Ensuite, cet appareil peut ajouter, modifier et supprimer : les deux restent à jour. Les copies sur le NAS continuent de partir du téléphone.'
      : 'Ensuite, rien ne peut être modifié ici : les modifications se font sur le téléphone. Cet appareil n\'envoie plus de copie au NAS.'}</p>
    <button type="button" class="bigbtn vert" id="sc-ok">${modif ? 'Recevoir le carnet' : 'Consulter le carnet du téléphone'}</button>
    <button type="button" class="bigbtn second annuler" id="sc-no">Annuler</button>
    <p class="prog" id="sc-res" role="status"></p>`);
  o.querySelector('#sc-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sc-ok').addEventListener('click', async () => {
    const b = o.querySelector('#sc-ok'), p = o.querySelector('#sc-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Le NAS est-il prêt ?';
    const n = await etatNasSynchro();
    if (n.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[n.statut] || TEXTES.injoignable; return; }
    if (!n.j.rev) { b.disabled = false; p.className = 'koc'; p.textContent = 'Le téléphone n\'a encore rien envoyé : sur le téléphone, Plus › Synchro du carnet › « Ce téléphone : envoyer et recevoir le carnet ».'; return; }
    p.textContent = 'Réception en cours…';
    // Le rôle n'est enregistré qu'une fois le carnet du NAS reçu : aucune synchro ne peut partir avec l'ancien carnet d'ici
    const r = await exclusif(async () => {
      const x = await toutRecevoir(true, texteProgres(p));
      if (x.statut !== 'ok') return x;
      await ecrireReglageDiscret('synchroEtat', { rev: x.rev, carte: x.carte, statut: 'ok', derniere: new Date().toISOString(), vols: etat.vols.length,
        ...(modif ? { deuxSensDepuis: new Date().toISOString() } : {}) });
      await ecrireReglageDiscret('synchroRole', role);
      return x;
    });
    if (r.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[r.statut] || TEXTES.injoignable; return; }
    document.body.classList.toggle('consultation', !modif);
    if (modif) appareil();
    document.dispatchEvent(new CustomEvent('synchro-etat'));
    p.className = 'okc'; p.textContent = `À jour : ${nombre(etat.vols.length)} vols.${modif ? ' Cet appareil peut maintenant modifier le carnet.' : ''}`;
  });
}

// PC en consultation -> modification : rien n'est renvoyé ; il reprend la dernière version de chaque élément au NAS
function confirmerPassage() {
  const o = ouvrirOutil('Synchro du carnet', `
    <div class="sec resume"><h3>Passer en modification</h3>
      <p>${ceNom(estIPad(navigator.userAgent, navigator.maxTouchPoints) ? 'iPad' : 'PC')} pourra ajouter, modifier et supprimer vols, avions, personnes, terrains, étiquettes et missions, comme le téléphone. Tous les appareils restent à jour.</p></div>
    <p class="hint">Le carnet n'est pas renvoyé : cet appareil reprend seulement la dernière version de chaque élément sur le NAS (téléchargement), puis n'envoie que ce que tu changeras. Si le même élément est changé des deux côtés avant la synchro, l'app te demandera lequel garder. Les copies sur le NAS continuent de partir du téléphone.</p>
    <button type="button" class="bigbtn vert" id="sp-ok">Passer en modification</button>
    <button type="button" class="bigbtn second annuler" id="sp-no">Annuler</button>
    <p class="prog" id="sp-res" role="status"></p>`);
  o.querySelector('#sp-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sp-ok').addEventListener('click', async () => {
    const b = o.querySelector('#sp-ok'), p = o.querySelector('#sp-res');
    b.disabled = true; p.className = 'prog'; p.textContent = 'Le NAS est-il prêt ?';
    const n = await etatNasSynchro();
    if (n.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[n.statut] || TEXTES.injoignable; return; }
    const r = await exclusif(async () => {
      const x = await toutRecevoir(false, texteProgres(p));
      if (x.statut !== 'ok') return x;
      await ecrireReglageDiscret('synchroRole', 'modification');
      await ecrireReglageDiscret('synchroEtat', { ...etatSynchro(), rev: x.rev, carte: x.carte, deuxSensDepuis: new Date().toISOString(), statut: 'ok',
        derniere: new Date().toISOString(), vols: etat.vols.length, conflits: [] });
      return x;
    });
    if (r.statut !== 'ok') { b.disabled = false; p.className = 'koc'; p.textContent = TEXTES[r.statut] || TEXTES.injoignable; return; }
    appareil();
    document.body.classList.remove('consultation');
    document.dispatchEvent(new CustomEvent('synchro-etat'));
    prevenir();
    p.className = 'okc'; p.textContent = `${ceNom(nomIci())} peut maintenant modifier le carnet. Tous les appareils restent à jour.`;
    toast('Modification activée');
  });
}

function confirmerArret(role) {
  const o = ouvrirOutil('Synchro du carnet', `<div class="sec resume"><h3>${role === 'consultation' ? 'Arrêter la consultation ?' : 'Arrêter la synchro ?'}</h3>
      <p>${role === 'consultation' ? 'Le carnet reste affiché sur cet appareil mais n\'est plus mis à jour. Sa copie automatique sur le NAS reste arrêtée (pour ne pas mélanger deux carnets).'
        : role === 'modification' ? `Le carnet reste sur ${ceNomMin()} mais n'est plus mis à jour, et ce que tu y changes ne part plus. Sa copie automatique sur le NAS reste arrêtée.`
          : 'Le carnet de ce téléphone ne change pas. L\'autre appareil ne recevra plus les nouveautés.'}</p></div>
    <button type="button" class="bigbtn" id="sa-ok" style="background:var(--feu)">${role === 'consultation' ? 'Arrêter la consultation' : 'Arrêter la synchro'}</button>
    <button type="button" class="bigbtn second annuler" id="sa-no">Annuler</button>`);
  o.querySelector('#sa-no').addEventListener('click', ecranSynchro);
  o.querySelector('#sa-ok').addEventListener('click', async () => {
    if (role !== 'reference') await ecrireReglageDiscret('nasAuto', false);
    await ecrireReglageDiscret('synchroRole', undefined);
    await ecrireReglageDiscret('synchroEtat', {});
    document.body.classList.remove('consultation');
    document.dispatchEvent(new CustomEvent('synchro-etat'));
    toast(role === 'consultation' ? 'Consultation arrêtée' : 'Synchro arrêtée');
    fermerOutil();
  });
}

// ---------- Annuler la dernière synchro ----------
function confirmerAnnulation() {
  const h = reglage('synchroHistorique') || [], d = h[h.length - 1];
  if (!d) return ecranSynchro();
  const par = {};
  for (const x of d.elements) par[x.magasin] = (par[x.magasin] || 0) + 1;
  const noms = { vols: 'vol', avions: 'avion', personnes: 'personne', reglages: 'réglage' };
  const o = ouvrirOutil('Annuler la dernière synchro', `
    <div class="sec resume"><h3>Remettre ce qu'il y avait avant la synchro du ${esc(dateFr(d.le.slice(0, 10)))} à ${esc(d.le.slice(11, 16))} (UTC) ?</h3>
      <p>${Object.entries(par).map(([m, n]) => `${n} ${noms[m] || m}${pluriel(n)}`).join(', ')} reçu${pluriel(d.elements.length)} de l'autre appareil reprennent leur version d'avant (ajoutés : retirés ; supprimés : remis).</p></div>
    <p class="hint">Ces versions repartiront ensuite vers l'autre appareil, comme une modification faite ici.</p>
    <button type="button" class="bigbtn vert" id="an-ok">Annuler la dernière synchro</button>
    <button type="button" class="bigbtn second annuler" id="an-no">Annuler</button>`);
  o.querySelector('#an-no').addEventListener('click', ecranSynchro);
  o.querySelector('#an-ok').addEventListener('click', async () => {
    await exclusif(async () => {
      await ecrireIci(d.elements.map(x => ({ magasin: x.magasin, id: x.id, donnees: x.avant })));
      await ecrireReglageDiscret('synchroHistorique', h.slice(0, -1));
    });
    await charger(); prevenir();
    toast('Dernière synchro annulée');
    ecranSynchro();
  });
}

// ---------- Plus de 20 suppressions : confirmation ----------
function ecranSuppressions() {
  const n = etatSynchro().aConfirmer || 0;
  if (!n) return ecranSynchro();
  const o = ouvrirOutil('Suppressions à confirmer', `
    <div class="sec resume"><h3>${n} éléments supprimés sur ${ceNomMin()}</h3>
      <p>Ils seront supprimés aussi sur l'autre appareil. Rien n'est envoyé avant ton accord (les autres modifications, elles, sont parties).</p></div>
    <button type="button" class="bigbtn" id="su-ok" style="background:var(--feu)">Confirmer : supprimer aussi sur l'autre appareil</button>
    <button type="button" class="bigbtn vert" id="su-remettre">Les remettre sur ${ceNomMin()}</button>
    <button type="button" class="bigbtn second annuler" id="su-no">Annuler</button>
    <p class="prog" id="su-res" role="status"></p>`);
  o.querySelector('#su-no').addEventListener('click', fermerOutil);
  // v0.25 : carnet d'ici VIDE (effacé par Safari, par exemple) : pas de « Confirmer » (tout serait effacé partout)
  if (!etat.vols.length) {
    o.querySelector('#su-ok').hidden = true;
    o.querySelector('#su-res').className = 'koc';
    o.querySelector('#su-res').textContent = `Le carnet de ${ceNomMin()} est vide : il a sans doute été effacé (par Safari, par exemple). « Les remettre » récupère tout depuis le NAS.`;
  }
  o.querySelector('#su-ok').addEventListener('click', async () => {
    await noter({ suppressionsConfirmees: true });
    o.querySelector('#su-res').textContent = 'Envoi…';
    const r = await synchroniser();
    o.querySelector('#su-res').textContent = texteResultat(r);
    if (r.statut === 'ok') { toast('Suppressions envoyées'); fermerOutil(); }
  });
  o.querySelector('#su-remettre').addEventListener('click', async () => {
    // La dernière version de chacun est reprise au NAS
    const p = o.querySelector('#su-res'); p.textContent = 'Récupération sur le NAS…';
    await exclusif(() => remettre(p));
  });
}
async function remettre(p) {
  const { m: locaux } = await locauxActuels();
    const carte = etatSynchro().carte || {}, manquants = new Set(Object.keys(carte).filter(k => carte[k][1] !== null && !locaux.has(k)));
    const remis = [];
    const r = await recevoirDepuis(0, async el => { for (const x of el) if (manquants.has(cleElement(x.magasin, x.id)) && !x.supprime) remis.push(x); });
    if (r.statut !== 'ok') { p.textContent = TEXTES[r.statut] || TEXTES.injoignable; return; }
    await ecrireIci(remis.map(x => ({ magasin: x.magasin, id: x.id, donnees: x.donnees })));
    await noter({ aConfirmer: 0 });
    await charger(); prevenir();
    toast(`${remis.length} élément${pluriel(remis.length)} remis`);
    fermerOutil();
}

// ---------- Conflits : choisir ----------
const titreElement = (magasin, d, id) => {
  if (!d) return id;
  if (magasin === 'vols') return `Vol du ${dateFr(d.date)} · ${[d.dep, d.arr].filter(Boolean).join(' → ')}${d.tempsTotal ? ` · ${hm(d.tempsTotal)}` : ''}`;
  if (magasin === 'avions') return `Avion ${d.immat || ''}`;
  if (magasin === 'personnes') return `Personne ${[d.tri, d.prenom, d.nom].filter(Boolean).join(' ')}`;
  return `Réglage « ${d.cle || id} »`;
};
export async function ecranConflits() {
  const liste = etatSynchro().conflits || [];
  if (!liste.length) { fermerOutil(); majBandeaux(); return; }
  const { m: locaux } = await locauxActuels();
  const ici = nomIci();
  const html = liste.map((c, i) => {
    const l = locaux.get(c.cle)?.donnees ?? null, autre = nomAppareil(c.appareil) === ici ? 'autre appareil' : nomAppareil(c.appareil);
    const titre = titreElement(c.magasin, l || c.distant, c.id);
    const lignes = l && c.distant ? differences(l, c.distant, etat.avions) : [];
    const maj = s => (s === 'iPad' ? s : s.charAt(0).toUpperCase() + s.slice(1)); // « iPad » garde son i minuscule
    const corps = l && c.distant
      ? `<div class="cf-diff"><div class="cf-t"><span></span><b>${esc(maj(ici))}</b><b>${esc(maj(autre))}</b></div>
          ${lignes.map(d => `<div><span>${esc(d.champ)}</span><span>${esc(d.ici)}</span><span>${esc(d.autre)}</span></div>`).join('')}</div>`
      : `<p class="koc">${!l ? `Supprimé sur ${esc(ceNomMinDe(ici))}, modifié sur ${esc(leNom(autre))}.` : `Modifié sur ${esc(ceNomMinDe(ici))}, supprimé sur ${esc(leNom(autre))}.`} Rien n'est effacé avant ton choix.</p>`;
    // Boutons : PC, iPad, téléphone (toujours dans cet ordre), puis « les deux »
    const RANG = { PC: 0, iPad: 1, 'téléphone': 2 };
    const boutons = [['ici', ici], ['autre', autre]].sort((a, b) => (RANG[a[1]] ?? 3) - (RANG[b[1]] ?? 3))
      .map(([choix, nom]) => `<button type="button" class="bigbtn second" data-choix="${choix}">Garder la version ${esc(duNom(nom))}</button>`).join('');
    return `<div class="sec cf" data-cf="${i}"><h3>${esc(titre)}</h3>${corps}
      ${boutons}
      ${c.magasin === 'vols' && l && c.distant ? '<button type="button" class="bigbtn second" data-choix="deux">Garder les deux</button>' : ''}</div>`;
  }).join('');
  const o = ouvrirOutil('Modifié sur les deux appareils', `<p class="hint" style="font-size:15px">Le même élément a été changé sur deux appareils avant la synchro. Choisis la version à garder : les autres appareils la recevront.</p>${html}`);
  o.querySelectorAll('[data-choix]').forEach(b => b.addEventListener('click', async () => {
    const c = liste[Number(b.closest('[data-cf]').dataset.cf)];
    await resoudre(c, b.dataset.choix);
    ecranConflits();
  }));
}
async function resoudre(c, choix) {
  await exclusif(() => resoudreMaintenant(c, choix));
  synchroniser();
}
async function resoudreMaintenant(c, choix) {
  const e = etatSynchro(), carte = { ...(e.carte || {}) };
  const hDistant = c.distant === null ? null : empreinteTexte(JSON.stringify(c.distant));
  // La version du NAS devient la version commune : celle d'ici, si on la garde, repart avec le bon numéro
  carte[c.cle] = [c.rev, hDistant];
  if (choix === 'autre') await ecrireIci([{ magasin: c.magasin, id: c.id, donnees: c.distant }]);
  if (choix === 'deux') {
    const { m } = await locauxActuels();
    const l = m.get(c.cle)?.donnees;
    const copie = { ...l, id: nouvelId(), creeLe: new Date().toISOString(), modifieLe: new Date().toISOString() };
    await ecrireIci([{ magasin: 'vols', id: c.id, donnees: c.distant }, { magasin: 'vols', id: copie.id, donnees: copie }]);
    const vus = reglage('doublonsVus') || [];
    await ecrireReglageDiscret('doublonsVus', [...vus, [c.id, copie.id].sort().join('|')]);
  }
  await noter({ carte, conflits: (e.conflits || []).filter(x => x.cle !== c.cle) });
  await charger(); prevenir();
  toast('Choix enregistré');
}

// ---------- Doublons possibles ----------
export function ecranDoublons() {
  const paires = doublonsActuels();
  if (!paires.length) { fermerOutil(); majBandeaux(); return; }
  const carte = v => `<div class="dbl"><b>${esc(dateFr(v.date))} · ${esc([v.dep, v.arr].filter(Boolean).join(' → '))}</b>
      <span>${esc(immatDe(v))} · ${esc(hm(v.tempsTotal || v.simTemps || 0))} · ${esc(v.hDep || '')}${v.npfId ? ' · NPF-Q400' : ''}</span>
      ${v.remarques ? `<span>${esc(v.remarques)}</span>` : ''}<span class="hint">Créé le ${esc(dateFr((v.creeLe || '').slice(0, 10)))}</span>
      <button type="button" class="bigbtn second annuler" data-suppr="${esc(v.id)}">Supprimer ce vol</button></div>`;
  const o = ouvrirOutil('Doublons possibles', `<p class="hint" style="font-size:15px">Ces vols se ressemblent (même date, mêmes terrains, même avion, même heure et même durée, ou même vol NPF-Q400) : saisis deux fois ? Supprime celui qui est en trop, ou garde les deux.</p>
    ${paires.map((p, i) => `<div class="sec" data-paire="${i}">${carte(p.a)}${carte(p.b)}<button type="button" class="bigbtn second" data-garder="${i}">Garder les deux</button></div>`).join('')}`);
  o.querySelectorAll('[data-suppr]').forEach(b => b.addEventListener('click', async () => {
    await supprimerVol(b.dataset.suppr);
    toast('Vol supprimé');
    ecranDoublons();
  }));
  o.querySelectorAll('[data-garder]').forEach(b => b.addEventListener('click', async () => {
    const p = paires[Number(b.dataset.garder)];
    await ecrireReglageDiscret('doublonsVus', [...(reglage('doublonsVus') || []), p.cle]);
    majBandeaux();
    ecranDoublons();
  }));
}

