// Écran Carnet (accueil) : TOTAL HdV, 3/7/30 jours, recherche, liste des vols par mois.
// La liste s'affiche par paquets de 40 cartes au fil du défilement (fluide avec 4000+ vols).

import { $, esc, codeAvecDrapeau } from './commun.js';
import { etat, avionDe, reglage, enregistrerReglage } from '../etat.js';
import { activerGlisser } from './glisser.js';
import { demanderSuppression, initSuppression } from './suppression.js';
import { BANDE_GENERAL, choixParType, valeurBande, basculerChoix } from '../bande.js';
import { hm, heureH, dateFr, aujourdhui, MOIS, arriveeLendemain } from '../temps.js';
import { heuresLocales } from '../fuseaux.js';
import { fuseau } from '../terrains.js';
import { FONCTIONS, COMPTEURS } from '../modele.js';
import { pastilleFeu, pastillesRegles, texteMissions, normaliser } from '../missions.js';
import { heuresDerniersJours, totalHdV, calculerTotaux } from '../totaux.js';

const PAQUET = 40;
let resultats = [];
let affiches = 0;
let moisCourant = '';
let ouvrirVol = () => {};
const index = new WeakMap();

function texteRecherche(v) {
  let t = index.get(v);
  if (t === undefined) {
    const a = avionDe(v);
    t = normaliser([v.dep, v.arr, ...(v.escales || []).map(e => e.code), a && a.immat, a && a.nom, a && a.modele,
      v.indicatif, ...(v.missions || []), v.remarques, v.nomCdB, v.nomCopi, v.nomEleve, v.nomInstructeur,
      ...(v.etiquettes || [])].filter(Boolean).join(' '));
    index.set(v, t);
  }
  return t;
}

export function ligneHeures(v) {
  if (!v.hDep || !v.hArr) {
    if (v.hDep) return `${heureH(v.hDep)} UTC`;
    return 'Heures non renseignées';
  }
  if (v.mode === 'utc') {
    return `${heureH(v.hDep)} UTC → ${heureH(v.hArr)} UTC${arriveeLendemain(v.hDep, v.hArr) ? ' (J+1)' : ''}`;
  }
  const l = heuresLocales(v.date, v.hDep, v.hArr, fuseau(v.dep), fuseau(v.arr));
  return `${heureH(l.dep)} LOC → ${heureH(l.arr)} LOC${l.jPlus > 0 ? ` (J+${l.jPlus})` : ''}`;
}

// Date affichée : date locale du départ en mode LOC
export function dateAffichee(v) {
  if (v.mode !== 'utc' && v.hDep) return heuresLocales(v.date, v.hDep, v.hArr || v.hDep, fuseau(v.dep), fuseau(v.arr)).dateLocDep;
  return v.date;
}

export function carteVol(v) {
  const a = avionDe(v);
  const esc0 = (v.escales || []).map(e => e.code);
  const taille = esc0.length > 2 ? ' xsmall' : esc0.length > 1 ? ' small' : '';
  const route = esc0.length
    ? `${codeAvecDrapeau(v.dep)} <span class="via">› ${esc0.map(codeAvecDrapeau).join(' › ')} ›</span> ${codeAvecDrapeau(v.arr)}`
    : `${codeAvecDrapeau(v.dep)} → ${codeAvecDrapeau(v.arr)}`;
  const modele = a ? (a.sim ? 'Simulateur' + (a.fstd ? ' ' + a.fstd : '') : (a.modele || a.typeOACI)) : '';
  const nom = a && a.nom && a.nom.toUpperCase() !== a.immat.toUpperCase() ? a.nom : '';
  const ligne = [dateFr(dateAffichee(v)), nom, a && a.immat, modele].filter(Boolean).map(esc).join(' - ');
  const f = FONCTIONS[v.fonction] || FONCTIONS.cdb;
  const autre = v[f.champ];
  // Couleurs : fonction violet, missions orange, IFR bleu, nuit foncé, feu rouge, largages jaune
  const puces = [`<span class="chip fn">${esc(f.puce)}</span>`];
  if (autre && autre !== 'SELF') puces.push(`<span class="chip fn">${esc(f.puceAutre)} ${esc(autre)}</span>`);
  const feu = pastilleFeu(v);
  if (feu) puces.push(`<span class="chip ${feu.plein ? 'feu' : 'feu2'}">${esc(feu.texte)}</span>`);
  for (const p of pastillesRegles(v, reglage('regles'))) puces.push(`<span class="chip mi">${esc(p)}</span>`);
  for (const c of COMPTEURS) {
    const n = v.compteurs && v.compteurs[c.cle];
    if (n) puces.push(`<span class="chip hl">${n} ${esc(c.court)}</span>`);
  }
  const att = (v.attJour || 0) + (v.attNuit || 0);
  if (att) puces.push(`<span class="chip">${att} att.</span>`);
  if (v.tempsIFR) puces.push(`<span class="chip ifr">IFR ${hm(v.tempsIFR)}</span>`);
  if (v.tempsNuit) puces.push(`<span class="chip nuit">Nuit ${hm(v.tempsNuit)}</span>`);
  const mission = texteMissions(v);
  const duree = v.tempsTotal || v.simTemps || 0;
  // la carte se glisse vers la gauche pour faire apparaître « Supprimer » (avec confirmation)
  return `<div class="swrow flrow"><button type="button" class="swdel" data-fdel="${esc(v.id)}" tabindex="-1">Supprimer</button><button type="button" class="flight swfront" data-id="${esc(v.id)}">
    <div class="fl-top"><span class="fl-route${taille}">${route}</span><span class="fl-bloc">${hm(duree)}</span></div>
    <div class="fl-meta">${ligne}</div>
    <div class="fl-meta num">${esc(ligneHeures(v))}</div>
    <div class="chips">${puces.join('')}</div>
    ${mission ? `<div class="fl-rem">${esc(mission)}</div>` : ''}</button></div>`;
}

function afficherPaquet() {
  const fin = Math.min(resultats.length, affiches + PAQUET);
  let html = '';
  for (let i = affiches; i < fin; i++) {
    const v = resultats[i];
    const m = (v.date || '').slice(0, 7);
    if (m !== moisCourant) {
      moisCourant = m;
      html += `<h3 class="month lbl">${MOIS[Number(m.slice(5)) - 1] || ''} ${m.slice(0, 4)}</h3>`;
    }
    html += carteVol(v);
  }
  $('#list').insertAdjacentHTML('beforeend', html);
  affiches = fin;
}

// ---------- Bande d'heures (mêmes calculs que l'écran Totaux) ----------
let cacheTotaux = { revision: -1, t: null };
function totauxCarnet() {
  if (cacheTotaux.revision !== etat.revision) cacheTotaux = { revision: etat.revision, t: calculerTotaux(etat.vols, etat.avions) };
  return cacheTotaux.t;
}
// Totaux à jour : bande affichée tout de suite ; sinon calculée juste après l'affichage de la liste
let bandeEnAttente = false;
function rendreBande() {
  if (cacheTotaux.revision === etat.revision) return dessinerBande();
  if (bandeEnAttente) return;
  bandeEnAttente = true;
  setTimeout(() => { bandeEnAttente = false; dessinerBande(); }, 0);
}
function dessinerBande() {
  const t = totauxCarnet();
  const choix = reglage('bandeHeures').map(c => valeurBande(c, t)).filter(Boolean);
  $('#h-strip').innerHTML = choix.length
    ? choix.map(v => `<div><b class="num">${esc(v.texte)}</b><span>${esc(v.lib)}</span></div>`).join('')
    : '<div class="empty">Touche ici pour choisir des heures à afficher</div>';
}
function rendreChoixBande() {
  const t = totauxCarnet(), coches = reglage('bandeHeures');
  const bouton = c => `<button type="button" data-hs="${esc(c.cle)}" aria-pressed="${coches.includes(c.cle)}">${esc(c.lib)}</button>`;
  $('#hs-gen').innerHTML = BANDE_GENERAL.map(bouton).join('');
  $('#hs-typ').innerHTML = choixParType(t, [...etat.avions.values()]).map(bouton).join('') || '<p class="hint">Aucun avion pour l\'instant.</p>';
}

export function rafraichirCarnet() {
  const auj = aujourdhui();
  rendreBande();
  $('#h-total').textContent = hm(totalHdV(etat.vols));
  $('#h-quick').innerHTML = [3, 7, 30].map(n =>
    `<div><span class="lbl">${n} jours</span><b>${hm(heuresDerniersJours(etat.vols, n, auj))}</b></div>`).join('');
  const q = normaliser($('#q').value);
  resultats = q ? etat.vols.filter(v => texteRecherche(v).includes(q)) : etat.vols;
  affiches = 0; moisCourant = '';
  $('#list').innerHTML = resultats.length ? ''
    : `<p class="hint">${etat.vols.length ? 'Aucun vol ne correspond.' : 'Aucun vol pour l\'instant. Touche « + Nouveau vol », ou importe FlyLog depuis l\'écran Plus.'}</p>`;
  afficherPaquet();
  requestAnimationFrame(completer);
}

export function initCarnet(ouvrir) {
  ouvrirVol = ouvrir;
  let attente = null;
  $('#q').addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(rafraichirCarnet, 120); });
  // Loupe : ouvre la recherche ; la refermer efface la recherche
  $('#q-open').addEventListener('click', () => {
    const ouvrir = $('#q').hidden;
    $('#q').hidden = !ouvrir;
    $('#q-open').setAttribute('aria-expanded', String(ouvrir));
    if (ouvrir) $('#q').focus();
    else if ($('#q').value) { $('#q').value = ''; rafraichirCarnet(); }
  });
  activerGlisser($('#list'), { largeur: 110, mode: 'decaler' });
  initSuppression();
  $('#list').addEventListener('click', e => {
    const d = e.target.closest('[data-fdel]');
    if (d) {
      const v = etat.vols.find(x => x.id === d.dataset.fdel);
      d.closest('.swrow').classList.remove('ouvert');
      if (v) demanderSuppression(v, dateFr(dateAffichee(v)));
      return;
    }
    const b = e.target.closest('.flight');
    if (b) ouvrirVol(etat.vols.find(v => v.id === b.dataset.id));
  });
  // Bande d'heures : toucher = choisir les valeurs affichées
  const ouvrirChoix = () => { rendreChoixBande(); $('#hs-modal').hidden = false; };
  $('#h-strip').addEventListener('click', ouvrirChoix);
  $('#h-strip').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirChoix(); } });
  $('#hs-modal').addEventListener('click', async e => {
    const b = e.target.closest('[data-hs]');
    if (!b) return;
    await enregistrerReglage('bandeHeures', basculerChoix(reglage('bandeHeures'), b.dataset.hs));
    dessinerBande();
    rendreChoixBande();
  });
  $('#hs-x').addEventListener('click', () => { $('#hs-modal').hidden = true; });
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) completer(); }, { rootMargin: '800px' })
    .observe($('#list-fin'));
}

// Ajoute des paquets tant que la fin de la liste est proche de l'écran
function completer() {
  if ($('#v-carnet').hidden || affiches >= resultats.length) return;
  if ($('#list-fin').getBoundingClientRect().top < innerHeight + 800) {
    afficherPaquet();
    requestAnimationFrame(completer);
  }
}
