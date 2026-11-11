// Écran Carnet (accueil) : TOTAL HdV, 3/7/30 jours, recherche, liste des vols par mois.
// La liste s'affiche par paquets de 40 cartes au fil du défilement (fluide avec 4000+ vols).
// v0.13 : la liste garde sa place quand on ouvre / referme un vol ; « Voir dans le carnet » sur un résultat de
// recherche ouvre la liste complète SUR ce vol (fenêtre qui commence à ce vol : les vols plus récents se chargent
// quand on remonte) ; bouton « ↑ Dernier vol » pour revenir en haut en un geste.

import { $, esc, codeAvecDrapeau } from './commun.js';
import { etat, avionDe, reglage, enregistrerReglage } from '../etat.js';
import { activerGlisser } from './glisser.js';
import { demanderSuppression, initSuppression } from './suppression.js';
import { BANDE_GENERAL, choixParType, valeurBande, basculerChoix, deplacerChoix } from '../bande.js';
import { hm, heureH, dateFr, aujourdhui, MOIS, arriveeLendemain, dateValide } from '../temps.js';
import { heuresLocales } from '../fuseaux.js';
import { fuseau } from '../terrains.js';
import { FONCTIONS, COMPTEURS, identiteAvion } from '../modele.js';
import { pastilleFeu, pastillesRegles, texteMissions, normaliser } from '../missions.js';
import { heuresDerniersJours, totalHdV, calculerTotaux } from '../totaux.js';
import { lireDate, filtreDate } from '../recherche.js';

const PAQUET = 40;
let resultats = [];
let debut = 0;        // premier vol affiché (> 0 quand la liste est ouverte sur un vol plus ancien)
let affiches = 0;     // fin (exclue) des vols affichés
let moisCourant = '';
let place = null;     // place dans la liste : { id du premier vol visible, sa position à l'écran, défilement }
let enRecherche = false;
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

// Date affichée : date locale du départ en mode LOC (gardée par vol : la période la relit pour chaque vol)
const datesAffichees = new WeakMap();
export function dateAffichee(v) {
  let d = datesAffichees.get(v);
  if (d === undefined) {
    d = v.mode !== 'utc' && v.hDep ? heuresLocales(v.date, v.hDep, v.hArr || v.hDep, fuseau(v.dep), fuseau(v.arr)).dateLocDep : v.date;
    datesAffichees.set(v, d);
  }
  return d;
}

// ---------- v0.31 (R71) : période de la loupe ----------
// « JJ/MM/AAAA » (ou JJMMAAAA, J/M/AAAA) -> « AAAA-MM-JJ » ; null si incomplète ou impossible
export function lireJour(t) {
  const s = String(t || '').trim();
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/) || s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return dateValide(iso) ? iso : null;
}
// Chiffres tapés -> « JJ/MM/AAAA » au fil de la frappe
export function formaterJour(t) {
  const s = String(t || '');
  // seulement des chiffres, avec les « / » déjà mis par l'app (JJ/MM/…) ; « 1/2/2025 » tapé à la main reste tel quel
  if (!/^\d{0,2}$|^\d{2}\/?\d{0,2}$|^\d{2}\/\d{2}\/?\d*$|^\d+$/.test(s)) return s;
  const c = s.replace(/\//g, '').slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}` : c.length > 2 ? `${c.slice(0, 2)}/${c.slice(2)}` : c;
}
// Période voulue : null (aucune) | { du, au, texte } | { erreur }
export function periodeDe(duTexte, auTexte, auj = aujourdhui()) {
  const du = lireJour(duTexte), au = lireJour(auTexte);
  if (!du && !au) return null;
  if (du && au && au < du) return { erreur: 'La date « Au » est avant la date « Du » : rien n\'est filtré.' };
  const fin = au || auj;
  return { du: du || '0000-01-01', au: fin,
    texte: du ? `Période : du ${dateFr(du)} au ${dateFr(fin)}${au ? '' : ' (aujourd\'hui)'}` : `Période : jusqu'au ${dateFr(fin)}` };
}
let periode = null;
const dansPeriode = v => { const d = dateAffichee(v) || ''; return d >= periode.du && d <= periode.au; };
function lirePeriode() {
  const p = periodeDe($('#p-du').value, $('#p-au').value);
  periode = p && !p.erreur ? p : null;
  $('#p-err').hidden = !(p && p.erreur);
  $('#p-err').textContent = p && p.erreur ? p.erreur : '';
  $('#periode-bandeau').hidden = !periode;
  $('#pb-txt').textContent = periode ? periode.texte : '';
}
export function effacerPeriode() {
  $('#p-du').value = ''; $('#p-au').value = '';
  lirePeriode();
}

// v0.28 (R66) : couleur de la pastille du temps de vol = couleur de l'étiquette qui donne le type du vol, avec les
// MÊMES règles que les étiquettes de la carte : feu (pastilleFeu), puis Entraînement (règle de
// pastille « Entraînement », par défaut les missions qui commencent par « ENT. »), puis IFR (temps IFR), sinon sable.
export function couleurTemps(feu, regles, v) {
  if (feu) return 'feu'; // v0.29 (R68) : TOUT vol feu (« Feu n°… » plein ou « Feu » en contour) : pastille pleine, couleur « Feu n°… »
  if (regles.some(p => p.toUpperCase() === 'ENTRAÎNEMENT')) return 'mi';
  if (v.tempsIFR) return 'ifr';
  return 'sable';
}

export function carteVol(v, voir = false) {
  const a = avionDe(v);
  const esc0 = (v.escales || []).map(e => e.code || e.nom || '?');
  const taille = esc0.length > 2 ? ' xsmall' : esc0.length > 1 ? ' small' : '';
  const route = esc0.length
    ? `${codeAvecDrapeau(v.dep)} <span class="via">› ${esc0.map(codeAvecDrapeau).join(' › ')} ›</span> ${codeAvecDrapeau(v.arr)}`
    : `${codeAvecDrapeau(v.dep)} → ${codeAvecDrapeau(v.arr)}`;
  const modele = a ? (a.sim ? 'Simulateur' + (a.fstd ? ' ' + a.fstd : '') : (a.modele || a.typeOACI)) : '';
  // Date en gras, nom de l'avion (couleur Avion), immatriculation, modèle en petit gris coupé par « … » (R32)
  const id = identiteAvion(a);
  const ligne = `<b class="fl-date">${esc(dateFr(dateAffichee(v)))}</b>`
    + (id.nom ? `<b class="fl-nm">${esc(id.nom)}</b>` : '') + (id.immat ? `<b class="fl-reg">${esc(id.immat)}</b>` : '')
    + (modele ? `<span class="fl-mod">${esc(modele)}</span>` : '');
  const f = FONCTIONS[v.fonction] || FONCTIONS.cdb;
  const autre = v[f.champ];
  // Couleurs : fonction violet, missions orange, IFR bleu, nuit foncé, feu rouge, largages jaune
  const puces = [`<span class="chip fn">${esc(f.puce)}</span>`];
  if (autre && autre !== 'SELF') puces.push(`<span class="chip fn">${esc(f.puceAutre)} ${esc(autre)}</span>`);
  const feu = pastilleFeu(v);
  if (feu) puces.push(`<span class="chip ${feu.plein ? 'feu' : 'feu2'}">${esc(feu.texte)}</span>`);
  const regles = pastillesRegles(v, reglage('regles'));
  // v0.31 (R70) : l'étiquette « Entraînement » a son orange franc (classe ent), comme la pastille du temps de vol
  for (const p of regles) puces.push(`<span class="chip mi${p.toUpperCase() === 'ENTRAÎNEMENT' ? ' ent' : ''}">${esc(p)}</span>`);
  for (const c of COMPTEURS) {
    const n = v.compteurs && v.compteurs[c.cle];
    if (n) puces.push(`<span class="chip hl">${n} ${esc(c.court)}</span>`);
  }
  const att = (v.attJour || 0) + (v.attNuit || 0);
  if (att) puces.push(`<span class="chip">${att} att.</span>`);
  if (v.tempsIFR) puces.push(`<span class="chip ifr">IFR ${hm(v.tempsIFR)}</span>`);
  // v0.28 (R65) : approches du vol (total : arrivée + terrains intermédiaires), juste après l'IFR
  if (v.approches > 0) puces.push(`<span class="chip appr">${v.approches} appr.</span>`);
  if (v.tempsNuit) puces.push(`<span class="chip nuit">Nuit ${hm(v.tempsNuit)}</span>`);
  const mission = texteMissions(v);
  const duree = v.tempsTotal || v.simTemps || 0;
  // la carte se glisse vers la gauche pour faire apparaître « Supprimer » (avec confirmation)
  return `<div class="swrow flrow"><button type="button" class="swdel" data-fdel="${esc(v.id)}" tabindex="-1">Supprimer</button><button type="button" class="flight swfront" data-id="${esc(v.id)}">
    <div class="fl-top"><span class="fl-route${taille}">${route}</span><span class="fl-bloc t-${couleurTemps(feu, regles, v)}">${hm(duree)}</span></div>
    <div class="fl-id">${ligne}</div>
    <div class="fl-meta num">${esc(ligneHeures(v))}</div>
    <div class="chips">${puces.join('')}</div>
    ${mission ? `<div class="fl-rem">${esc(mission)}</div>` : ''}${voir ? `<span class="fl-voir" data-voir="${esc(v.id)}">Voir dans le carnet ›</span>` : ''}</button></div>`;
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
    html += carteVol(v, enRecherche);
  }
  $('#list').insertAdjacentHTML('beforeend', html);
  affiches = fin;
}

const enteteMois = m => `<h3 class="month lbl" data-mois="${m}">${MOIS[Number(m.slice(5)) - 1] || ''} ${m.slice(0, 4)}</h3>`;

// Ajoute AU-DESSUS les vols plus récents (liste ouverte sur un vol ancien), sans faire bouger ce qu'on regarde
function afficherAvant() {
  if (debut <= 0) return;
  const de = Math.max(0, debut - PAQUET);
  let html = '', mois = '';
  for (let i = de; i < debut; i++) {
    const v = resultats[i], m = (v.date || '').slice(0, 7);
    if (m !== mois) { mois = m; html += enteteMois(m); }
    html += carteVol(v, enRecherche);
  }
  const liste = $('#list'), repere = liste.querySelector('.flrow');
  const haut = repere ? repere.getBoundingClientRect().top : 0;
  const tete = liste.firstElementChild;
  if (tete && tete.matches('h3.month') && tete.dataset.mois === mois) tete.remove(); // même mois : un seul titre
  liste.insertAdjacentHTML('afterbegin', html);
  debut = de;
  if (repere) window.scrollBy(0, repere.getBoundingClientRect().top - haut);
  $('#list-debut').hidden = debut <= 0;
}

// Premier vol visible à l'écran (recherche par dichotomie : les cartes sont dans l'ordre)
function lirePlace() {
  const y = window.scrollY;
  if (y < 5) return null;
  const cartes = $('#list').querySelectorAll('.flight');
  let a = 0, b = cartes.length - 1, trouve = -1;
  while (a <= b) {
    const m = (a + b) >> 1;
    if (cartes[m].getBoundingClientRect().bottom > 0) { trouve = m; b = m - 1; } else a = m + 1;
  }
  if (trouve < 0) return { y };
  return { id: cartes[trouve].dataset.id, haut: cartes[trouve].getBoundingClientRect().top, y };
}

// Fait défiler pour que le vol « id » soit à « haut » pixels du haut de l'écran
function placerSur(id, haut) {
  const el = $('#list').querySelector(`.flight[data-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - haut));
  return el;
}

// Remet la liste à la place mémorisée (retour d'un vol, d'un autre onglet)
export function restaurerPlace() {
  if (!place) { window.scrollTo(0, 0); majBoutonHaut(); return; }
  if (!(place.id && placerSur(place.id, place.haut))) {
    while (affiches < resultats.length && document.documentElement.scrollHeight < place.y + innerHeight) afficherPaquet();
    window.scrollTo(0, place.y);
  }
  requestAnimationFrame(completer); requestAnimationFrame(completerAvant);
  majBoutonHaut();
}
// Avant de quitter l'écran Carnet
export function memoriserPlace() { if (!$('#v-carnet').hidden) place = lirePlace(); }
export function oublierPlace() { place = null; }

// Liste complète ouverte sur un vol (depuis un résultat de recherche)
export function voirDansCarnet(id) {
  $('#q').value = ''; $('#q').hidden = true; $('#periode').hidden = true; $('#q-open').setAttribute('aria-expanded', 'false');
  effacerPeriode(); // « Voir dans le carnet » : tout le carnet
  rafraichirCarnet({ versVol: id });
}

// « ↑ Dernier vol » : visible quand on est loin du haut de la liste
let bhEnAttente = false;
function majBoutonHaut() {
  const b = $('#top-btn');
  if (!b) return;
  const montrer = !$('#v-carnet').hidden && (debut > 0 || window.scrollY > innerHeight * 1.5);
  if (b.hidden === montrer) b.hidden = !montrer;
}
export function allerAuDernierVol() {
  place = null;
  if (debut > 0) rafraichirCarnet({ haut: true });
  window.scrollTo(0, 0);
  majBoutonHaut();
}

// ---------- Bande d'heures (mêmes calculs que l'écran Totaux) ----------
// v0.31 (R71) : avec une période, la bande d'heures et le TOTAL du haut ne comptent que ses vols
let cacheTotaux = { cle: '', t: null };
const cleTotaux = () => `${etat.revision}|${periode ? periode.du + '|' + periode.au : ''}`;
const volsDuHaut = () => (periode ? etat.vols.filter(dansPeriode) : etat.vols);
function totauxCarnet() {
  if (cacheTotaux.cle !== cleTotaux()) cacheTotaux = { cle: cleTotaux(), t: calculerTotaux(volsDuHaut(), etat.avions) };
  return cacheTotaux.t;
}
// Totaux à jour : bande affichée tout de suite ; sinon calculée juste après l'affichage de la liste
let bandeEnAttente = false;
function rendreBande() {
  if (cacheTotaux.cle === cleTotaux()) return dessinerBande();
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
  // Ordre d'affichage : une ligne par valeur cochée, flèches ↑ ↓ à gauche, valeur à droite
  const lignes = coches.map(c => ({ c, v: valeurBande(c, t) })).filter(x => x.v);
  $('#hs-ordre').innerHTML = lignes.map(({ c, v }, i) => `<div class="prow"><span class="arrows">`
    + `<button type="button" data-hsmv="${i}" data-d="-1" aria-label="Monter ${esc(v.lib)}" ${i ? '' : 'disabled'}>↑</button>`
    + `<button type="button" data-hsmv="${i}" data-d="1" aria-label="Descendre ${esc(v.lib)}" ${i < lignes.length - 1 ? '' : 'disabled'}>↓</button>`
    + `</span><span class="pname">${esc(v.lib)}</span><b class="num">${esc(v.texte)}</b></div>`).join('')
    || '<p class="hint">Rien de coché pour l\'instant.</p>';
  $('#hs-gen').innerHTML = BANDE_GENERAL.map(bouton).join('');
  $('#hs-typ').innerHTML = choixParType(t, [...etat.avions.values()]).map(bouton).join('') || '<p class="hint">Aucun avion pour l\'instant.</p>';
}

export function ouvrirChoixBande() { rendreChoixBande(); $('#hs-modal').hidden = false; }

// options : haut = repartir du haut (nouvelle recherche…) ; versVol = ouvrir la liste sur ce vol ;
// retour = l'écran réapparaît (place mémorisée) ; sinon (modification pendant qu'on regarde) : on garde la place.
export function rafraichirCarnet({ haut = false, versVol = null, retour = false } = {}) {
  const auj = aujourdhui();
  if (haut) place = null;
  else if (!versVol && !retour && !$('#v-carnet').hidden) place = lirePlace();
  lirePeriode();
  const base = volsDuHaut();
  rendreBande();
  $('#h-total').textContent = hm(totalHdV(base));
  // v0.31 (R71) : 3 / 7 / 30 jours comptent à partir d'aujourd'hui : masqués pendant une période
  $('#h-quick').hidden = !!periode;
  if (!periode) $('#h-quick').innerHTML = [3, 7, 30].map(n =>
    `<div><span class="lbl">${n} jours</span><b>${hm(heuresDerniersJours(etat.vols, n, auj))}</b></div>`).join('');
  // Une date (06/05/25, 05/2025, 2025…) : les vols de cette date (date affichée sur la carte) ; sinon recherche texte
  const brut = $('#q').value, parDate = filtreDate(lireDate(brut)), q = normaliser(brut);
  resultats = parDate ? base.filter(v => parDate(dateAffichee(v) || '')) : q ? base.filter(v => texteRecherche(v).includes(q)) : base;
  enRecherche = !!(parDate || q); // « Voir dans le carnet » : seulement pour une recherche (pas pour une période seule)
  // Fenêtre : commence au vol visé (ou au vol mémorisé) s'il est loin dans la liste, sinon au début
  const cible = versVol || (place && place.id);
  const i = cible ? resultats.findIndex(v => v.id === cible) : -1;
  debut = i >= PAQUET ? i - 2 : 0;
  affiches = debut; moisCourant = '';
  $('#list').innerHTML = resultats.length ? ''
    : `<p class="hint">${etat.vols.length ? (periode ? 'Aucun vol ne correspond sur cette période.' : 'Aucun vol ne correspond.') : 'Aucun vol pour l\'instant. Touche « + Nouveau vol », ou importe FlyLog depuis l\'écran Plus.'}</p>`;
  $('#list-debut').hidden = debut <= 0;
  afficherPaquet();
  if (!$('#v-carnet').hidden) {
    if (versVol) {
      place = null;
      while (affiches < resultats.length && affiches < i + 6) afficherPaquet();
      const el = placerSur(versVol, 76);
      if (el) { el.classList.add('fl-vu'); setTimeout(() => el.classList.remove('fl-vu'), 1800); }
      requestAnimationFrame(completerAvant);
    } else if (!retour) restaurerPlace();
  }
  requestAnimationFrame(completer);
  majBoutonHaut();
}

export function initCarnet(ouvrir) {
  ouvrirVol = ouvrir;
  let attente = null;
  $('#q').addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(() => rafraichirCarnet({ haut: true }), 120); });
  // Touche loupe / Entrée du clavier : ferme le clavier pour laisser voir les résultats (le texte reste) (R39)
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); } });
  // v0.31 (R71) : période (Du / Au) : chiffres mis en forme JJ/MM/AAAA au fil de la frappe
  for (const id of ['#p-du', '#p-au']) {
    $(id).addEventListener('input', e => {
      const f = formaterJour(e.target.value);
      if (f !== e.target.value) e.target.value = f;
      clearTimeout(attente); attente = setTimeout(() => rafraichirCarnet({ haut: true }), 120);
    });
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  }
  $('#pb-x').addEventListener('click', () => { effacerPeriode(); rafraichirCarnet({ haut: true }); });
  // Loupe : ouvre la recherche ; la refermer efface la recherche (la période reste, bandeau avec sa croix)
  $('#q-open').addEventListener('click', () => {
    const ouvrir = $('#q').hidden;
    $('#q').hidden = !ouvrir;
    $('#periode').hidden = !ouvrir;
    $('#q-open').setAttribute('aria-expanded', String(ouvrir));
    if (ouvrir) $('#q').focus();
    else if ($('#q').value) { $('#q').value = ''; rafraichirCarnet({ haut: true }); }
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
    const voir = e.target.closest('[data-voir]');
    if (voir) return voirDansCarnet(voir.dataset.voir);
    const b = e.target.closest('.flight');
    if (b) ouvrirVol(etat.vols.find(v => v.id === b.dataset.id));
  });
  // Bande d'heures : toucher = choisir les valeurs affichées
  const ouvrirChoix = ouvrirChoixBande;
  $('#h-strip').addEventListener('click', ouvrirChoix);
  $('#h-strip').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirChoix(); } });
  $('#hs-modal').addEventListener('click', async e => {
    const m = e.target.closest('[data-hsmv]');
    if (m) {
      const coches = reglage('bandeHeures').filter(c => valeurBande(c, totauxCarnet()));
      await enregistrerReglage('bandeHeures', deplacerChoix(coches, Number(m.dataset.hsmv), Number(m.dataset.d)));
      dessinerBande(); rendreChoixBande();
      return;
    }
    const b = e.target.closest('[data-hs]');
    if (!b) return;
    await enregistrerReglage('bandeHeures', basculerChoix(reglage('bandeHeures'), b.dataset.hs));
    dessinerBande();
    rendreChoixBande();
  });
  $('#hs-x').addEventListener('click', () => { $('#hs-modal').hidden = true; });
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) completer(); }, { rootMargin: '800px' })
    .observe($('#list-fin'));
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) completerAvant(); }, { rootMargin: '600px' })
    .observe($('#list-debut'));
  $('#list-debut').addEventListener('click', afficherAvant);
  $('#top-btn').addEventListener('click', allerAuDernierVol);
  addEventListener('scroll', () => {
    if (bhEnAttente) return;
    bhEnAttente = true;
    requestAnimationFrame(() => { bhEnAttente = false; majBoutonHaut(); });
  }, { passive: true });
}

// Ajoute des vols plus récents tant que le haut de la fenêtre est proche de l'écran
function completerAvant() {
  if ($('#v-carnet').hidden || debut <= 0) return;
  if ($('#list-debut').getBoundingClientRect().bottom > -600) {
    afficherAvant();
    requestAnimationFrame(completerAvant);
  }
}

// Ajoute des paquets tant que la fin de la liste est proche de l'écran
function completer() {
  if ($('#v-carnet').hidden || affiches >= resultats.length) return;
  if ($('#list-fin').getBoundingClientRect().top < innerHeight + 800) {
    afficherPaquet();
    requestAnimationFrame(completer);
  }
}
