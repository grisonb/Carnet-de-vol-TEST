// Écran de saisie / modification d'un vol (comme la maquette, de haut en bas).

import { $, $$, esc, segs, choisir, toast, toastAction, codeAvecDrapeau, PLUS, MOINS, CROIX } from './commun.js';
import { etat, reglage, enregistrerReglage, enregistrerVol, supprimerVol, enregistrerPersonne, supprimerPersonne,
  listeMissions, trouverPersonne, enregistrerAvion } from '../etat.js';
import { ouvrirAjoutTerrain } from './terrain-perso.js';
import { volVide, FONCTIONS, TEMPS_FONCTION, COMPTEURS, colonnesAvion, personneVide, nomPersonne, ligneAvion,
  etiquettesDeLAvion, etiquettesPourAvion, basculerEtiquette, fonctionsPossibles, champPersonneVisible, compteursAffiches } from '../modele.js';
import { supprimerVolAvecAnnuler } from './suppression.js';
import { afficherCarteVol } from './carte.js';
import { hm, lireDuree, lireHeure, minutesDuJour, ajouterJours, dateValide, aujourdhui, dateFr, heureH } from '../temps.js';
import { versLocal, versUTC } from '../fuseaux.js';
import { terrain, fuseau } from '../terrains.js';
import { drapeau } from '../drapeaux.js';
import { minutesDeNuit, estNuit } from '../nuit.js';
import { plusGrandFeu, ajouterFeu, enleverFeu, lignesPourSaisie, estLigneFeu, normaliser, estMasquee,
  masquerSuggestion, remettreSuggestion } from '../missions.js';
import { activerGlisser } from './glisser.js';
import { initAvions } from './avions.js';
import { ouvrirRegles } from './regles.js';
import { brouillonNpf } from '../npf.js';
import { ignorerVolNpf, volNpfEnregistre } from './npf.js';

let F = null;          // brouillon du vol en cours
let quitter = () => {};

// ---------- Terrains ----------
const nomTerrain = c => (c.length < 4 ? '' : (terrain(c)?.nom || 'Terrain inconnu : vérifie le code'));
function noms() {
  for (const [i, n] of [['#f-dep', '#n-dep'], ['#f-arr', '#n-arr']]) {
    const c = $(i).value.toUpperCase();
    const inconnu = c.length === 4 && !terrain(c);
    $(n).textContent = nomTerrain(c);
    $(n).classList.toggle('bad', inconnu);
    $(`[data-ajt="${i}"]`).hidden = !inconnu;
  }
}
function champOACI(sel, suivant) {
  const el = $(sel);
  el.addEventListener('input', () => {
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (el.value.length === 4 && suivant) $(suivant).focus();
  });
  el.addEventListener('focus', () => el.select());
}

// ---------- Heures « 0942 » -> 09h42 ----------
const heureValide = s => /^([01]\d|2[0-3])h[0-5]\d$/.test($(s).value);
const heureDe = s => (heureValide(s) ? $(s).value.replace('h', ':') : null);
function champHeure(sel, suivant) {
  const el = $(sel);
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '').slice(0, 4);
    el.value = d.length > 2 ? d.slice(0, 2) + 'h' + d.slice(2) : d;
    el.classList.toggle('bad', d.length === 4 && !heureValide(sel));
    if (d.length === 4 && heureValide(sel)) { if (suivant) $(suivant).focus(); else el.blur(); }
  });
  el.addEventListener('focus', () => el.select());
}

// Instants UTC du vol à partir des champs (null si heures incomplètes)
function instants() {
  const date = $('#f-date').value, dep = $('#f-dep').value, arr = $('#f-arr').value;
  const t0 = heureDe('#f-t0'), t1 = heureDe('#f-t1');
  if (!dateValide(date) || !t0 || !t1) return null;
  let a, b;
  if (F.mode === 'loc') { a = versUTC(date, t0, fuseau(dep)); b = versUTC(date, t1, fuseau(arr)); }
  else { a = { date, heure: t0 }; b = { date, heure: t1 }; }
  const ms = x => Date.parse(`${x.date}T${x.heure}:00Z`);
  let ma = ms(a), mb = ms(b);
  while (mb <= ma) mb += 864e5; // arrivée le lendemain
  if (mb - ma > 864e5) mb -= 864e5;
  return { ma, mb, dateUTC: a.date, hDep: a.heure, hArr: new Date(mb).toISOString().slice(11, 16) };
}

// Points du trajet (départ, escales, arrivée) connus dans la table
function points() {
  const codes = [$('#f-dep').value, ...F.escales.map(e => e.code), $('#f-arr').value];
  const p = codes.map(terrain);
  return p.every(t => t && t.lat != null && t.lon != null) ? p : null; // terrain sans coordonnées : nuit à la main
}

// ---------- Recalculs automatiques (toujours modifiables ensuite) ----------
function sortie(k) { const el = $('#s-' + k); if (el) el.textContent = F.s[k]; }

function recalculer() {
  const i = instants();
  const bloc = i ? Math.round((i.mb - i.ma) / 60000) : (F.heuresInconnues ? F.vol.tempsTotal || F.vol.simTemps || 0 : 0);
  F.bloc = bloc;
  $('#f-bloc').textContent = hm(bloc);
  $('#f-j1').hidden = !(i && i.ma && new Date(i.mb).toISOString().slice(0, 10) > i.dateUTC && minutesDuJour(heureDe('#f-t1')) < minutesDuJour(heureDe('#f-t0')));
  const sj = F.escales.reduce((s, e) => s + e.attJour, 0), sn = F.escales.reduce((s, e) => s + e.attNuit, 0);
  const p = points();
  let nuitFinale = false;
  if (i && p) {
    $('#c-nuit').value = hm(minutesDeNuit(i.ma, bloc, p));
    const fin = p[p.length - 1];
    nuitFinale = estNuit(i.mb, fin.lat, fin.lon);
  } else if (i) $('#c-nuit').value = hm(0);
  F.s.attJour = sj + (nuitFinale ? 0 : 1);
  F.s.attNuit = sn + (nuitFinale ? 1 : 0);
  sortie('attJour'); sortie('attNuit');
  if (F.ifr) $('#c-ifr').value = hm(bloc);
  $('#c-col').value = hm(colonneAuto());
  $('#c-fn').value = hm(avion()?.sim ? 0 : bloc);
  recap(); apercu();
}

const avion = () => etat.avions.get(F.avionId) || null;

// Valeur automatique de la colonne avion pour le total courant
function colonneAuto() {
  const a = avion();
  if (!a) return 0;
  if (a.sim) return F.bloc;
  const c = colonnesAvion({ tempsTotal: F.bloc, tempsMP: null, tempsSE: null, tempsME: null }, a);
  return c.mp || c.se || c.me;
}

// ---------- Escales ----------
let vmEdit = -1, VM = { attJour: 1, attNuit: 0 };
function rendreEscales() {
  $('#via-list').innerHTML = F.escales.map((v, i) =>
    `<button type="button" class="viachip" data-vi="${i}">${drapeau(terrain(v.code)?.pays)}<b>${esc(v.code)}</b> ${esc(terrain(v.code)?.nom || '')} · ${v.attJour + v.attNuit} att.</button>`).join('');
}
function nomVM() {
  const c = $('#vm-icao').value.toUpperCase();
  $('#vm-name').textContent = c.length < 4 ? 'Tape les 4 lettres du code' : (terrain(c)?.nom || 'Terrain inconnu : vérifie le code');
  $('#vm-name').classList.toggle('bad', c.length === 4 && !terrain(c));
  $('#vm-ajt').hidden = !(c.length === 4 && !terrain(c));
}
function ouvrirEscale(i) {
  vmEdit = i;
  const v = i >= 0 ? F.escales[i] : { code: '', attJour: 1, attNuit: 0 };
  VM = { attJour: v.attJour, attNuit: v.attNuit };
  $('#vm-icao').value = v.code; $('#vm-attJour').textContent = VM.attJour; $('#vm-attNuit').textContent = VM.attNuit;
  nomVM();
  $('#vm-ok').textContent = i >= 0 ? 'Valider' : 'Ajouter';
  $('#vm-del').hidden = i < 0;
  $('#via-modal').hidden = false;
  setTimeout(() => $('#vm-icao').focus(), 50);
}

// ---------- Avion ----------
function afficherLigneAvion(a) {
  const l = ligneAvion(a);
  $('#ac-reg').textContent = l.debut; $('#ac-type').textContent = l.modele; $('#ac-sub').textContent = l.fin;
  $('#ac-cur').setAttribute('aria-label', `Avion : ${[l.debut, l.modele, l.fin].filter(Boolean).join(' ')}. Toucher pour changer d'avion`);
}
function ouvrirChoixAvion(o) {
  $('#ac-sz').hidden = !o; $('#ac-cur').setAttribute('aria-expanded', String(o));
  if (!o) { $('#ac-q').value = ''; $('#ac-res').hidden = true; }
}
// changement = l'utilisateur vient de choisir un autre avion (sinon : ouverture d'un vol)
function choisirAvion(a, changement = true) {
  if (!a) return;
  const autre = F.avionId !== a.id;
  F.avionId = a.id;
  afficherLigneAvion(a);
  if (changement && (autre || !F.vol)) F.etiquettes = etiquettesPourAvion(F.etiquettes, a);
  ouvrirChoixAvion(false);
  appliquerEquipage();
  rendreEtiquettes();
  rendreCompteurs();
  if (!F.charge) { $('#c-col').value = hm(colonneAuto()); $('#c-fn').value = hm(a.sim ? 0 : F.bloc); }
  recap();
}
// Fiche de l'avion courant modifiée (nom, étiquettes, monopilote…) : on remet la saisie à jour
function avionModifie(a) {
  if (!F || F.avionId !== a.id) return;
  afficherLigneAvion(a);
  F.etiquettes = F.etiquettes.filter(t => etiquettesProposees().includes(t));
  appliquerEquipage(); rendreEtiquettes(); rendreCompteurs(); recap();
}

// ---------- Étiquettes ----------
// Étiquettes proposées : celles cochées dans la fiche de l'avion (+ celles déjà sur ce vol, pour ne rien perdre)
function etiquettesProposees() {
  const a = avion();
  const t = etiquettesDeLAvion(a);
  if (F.vol && F.vol.avionId === F.avionId) for (const x of F.vol.etiquettes || []) if (!t.includes(x)) t.push(x);
  return t;
}
function rendreEtiquettes() {
  $('#tg-val').innerHTML = etiquettesProposees().map(t =>
    `<button type="button" class="tgchip" data-tg3="${esc(t)}" aria-pressed="${F.etiquettes.includes(t)}">${esc(t)}</button>`).join('');
}

// ---------- Fonction et autre pilote ----------
function choisirFonction(r) {
  F.fonction = r;
  const f = FONCTIONS[r];
  choisir('#f-fn', ['cdb', 'copi', 'dc', 'inst'].indexOf(r));
  $('#f-copi-l').textContent = f.autre;
  $('#f-fn-h').textContent = f.aide;
  $('#p-add').setAttribute('aria-label', 'Ajouter ' + f.ajout);
  $('#f-copi-z').hidden = !champPersonneVisible(avion(), r);
  recap();
}
// Avion monopilote : pas de « Copi. » (CdB, DC, Inst.) et pas de champ de personne en CdB
function appliquerEquipage() {
  const possibles = fonctionsPossibles(avion());
  const copi = $('#f-fn [data-r="copi"]');
  copi.hidden = !possibles.includes('copi');
  $('#f-fn').classList.toggle('fn3', copi.hidden);
  choisirFonction(possibles.includes(F.fonction) ? F.fonction : 'cdb');
}
function rendrePersonnes() {
  const q = normaliser($('#f-copi').value), r = $('#p-res');
  if (!q || etat.personnes.some(p => normaliser(nomPersonne(p)) === q)) { r.hidden = true; return; }
  const m = etat.personnes.filter(p => normaliser(`${p.tri} ${p.prenom} ${p.nom}`).includes(q)).slice(0, 6);
  r.innerHTML = m.map(p => {
    const complet = [p.prenom, p.nom].filter(Boolean).join(' ');
    return `<button type="button" class="pitem" data-p="${esc(nomPersonne(p))}"><b>${esc(nomPersonne(p))}</b><span>${p.tri && complet ? esc(complet) : ''}</span></button>`;
  }).join('') || '<p class="hint">Personne de ce nom. Touche « + » pour l\'ajouter.</p>';
  r.hidden = false;
}
let personneEditee = null;
export function ouvrirPersonne(p = null, titre = null) {
  personneEditee = p;
  $('#pm-t').textContent = titre || (p ? 'Modifier ' + nomPersonne(p) : 'Ajouter ' + FONCTIONS[F?.fonction || 'cdb'].ajout);
  $('#pm-pre').value = p ? p.prenom : ''; $('#pm-nom').value = p ? p.nom : ''; $('#pm-tri').value = p ? p.tri : '';
  if (!p && F && !$('#v-saisie').hidden) {
    const v = $('#f-copi').value.trim();
    if (/^[A-Za-z]{3,4}$/.test(v)) $('#pm-tri').value = v.toUpperCase(); else if (v) $('#pm-nom').value = v;
  }
  $('#pm-ok').textContent = p ? 'Enregistrer' : 'Ajouter';
  $('#pm-del').hidden = !p;
  verifierPersonne();
  $('#p-modal').hidden = false;
  setTimeout(() => $('#pm-pre').focus(), 50);
}
function verifierPersonne() { $('#pm-ok').disabled = !['#pm-pre', '#pm-nom', '#pm-tri'].some(x => $(x).value.trim()); }

// ---------- Missions et feux ----------
function prochainFeu() { return plusGrandFeu(etat.vols, F.vol?.id); }
function nbFeux() { return F.lignes.filter(l => l.nouveauFeu).length; }
function indicationFeu() {
  const n = nbFeux(), base = prochainFeu();
  $('#s-feu').textContent = n;
  const nums = F.lignes.filter(l => l.nouveauFeu > 0).map(l => l.nouveauFeu);
  $('#fire-next').textContent = n ? (nums.length ? `(n°${Math.min(...nums)}${nums.length > 1 ? ' à ' + Math.max(...nums) : ''})` : '')
    : `(prochain : n°${base + 1})`;
}
function rendreLignes() {
  $('#ml').innerHTML = F.lignes.map((m, i) =>
    `<div class="mline${estLigneFeu(m.t) ? ' feu' : ''}"><input data-mi="${i}" value="${esc(m.t)}" aria-label="Mission ${i + 1}"><button type="button" class="x" data-mx="${i}" aria-label="Enlever">${CROIX}</button></div>`).join('');
  indicationFeu(); apercu();
}
function rendreSuggestions() {
  const q = normaliser($('#m-q').value), r = $('#m-res');
  if (!q) { r.hidden = true; return; }
  const brut = $('#m-q').value.trim();
  const masquees = reglage('missionsMasquees');
  const m = [...new Set([...F.lignes.map(l => l.t), ...listeMissions()])]
    .filter(x => normaliser(x).includes(q) && !estMasquee(masquees, x)).slice(0, 7);
  // Chaque suggestion se glisse vers la gauche pour faire apparaître « Supprimer »
  r.innerHTML = m.map(x => `<div class="swrow"><button type="button" class="swdel" data-mdel="${esc(x)}" tabindex="-1">Supprimer</button><button type="button" class="mitem swfront${estLigneFeu(x) ? ' feu' : ''}" data-mv2="${esc(x)}">${esc(x)}</button></div>`).join('')
    + `<button type="button" class="linkbtn" data-mnew="1">+ Nouvelle mission « ${esc(brut.toUpperCase())} »</button>`;
  r.hidden = false;
}
function routeTexte() {
  const pts = [$('#f-dep').value, ...F.escales.map(v => v.code), $('#f-arr').value].filter(Boolean);
  return F.escales.length ? pts.join('-') : '';
}
function apercu() {
  if (!F) return;
  const t = F.lignes.map(m => m.t.trim()).filter(Boolean).join(' + ');
  const r = routeTexte();
  $('#m-prev').innerHTML = t || r ? `Remarque du carnet : <b>${esc([r, t].filter(Boolean).join(' • '))}</b>` : '';
}

// Supprime SEULEMENT la suggestion (les vols enregistrés ne changent pas) ; « Annuler » la remet
async function supprimerSuggestion(t) {
  const rafraichir = () => { if (F && !$('#m-res').hidden) rendreSuggestions(); if (!$('#ml-modal').hidden) rendreLibelles(); };
  await enregistrerReglage('missionsMasquees', masquerSuggestion(reglage('missionsMasquees'), t));
  rafraichir();
  toastAction(`« ${t} » supprimée des suggestions`, 'Annuler', async () => {
    await enregistrerReglage('missionsMasquees', remettreSuggestion(reglage('missionsMasquees'), t));
    rafraichir();
  }, 4000);
}

// « Libellés missions › » : tous les libellés proposés, avec recherche ; glisser à gauche pour supprimer
export function ouvrirLibelles() { $('#mlm-q').value = ''; rendreLibelles(); $('#ml-modal').hidden = false; }
function rendreLibelles() {
  const q = normaliser($('#mlm-q').value);
  const tous = listeMissions();
  const m = tous.filter(x => !q || normaliser(x).includes(q));
  $('#mlm-n').textContent = `${m.length} libellé${m.length > 1 ? 's' : ''}${q ? ` sur ${tous.length}` : ''}`;
  $('#mlm-list').innerHTML = m.map(x => `<div class="swrow"><button type="button" class="swdel" data-mdel="${esc(x)}" tabindex="-1">Supprimer</button><button type="button" class="mitem swfront${estLigneFeu(x) ? ' feu' : ''}" data-ml="${esc(x)}">${esc(x)}</button></div>`).join('')
    || '<p class="hint">Aucun libellé.</p>';
}

// ---------- Compteurs métier ----------
// Compteurs affichés selon le type d'avion (règles dans modele.js : DH8D seulement pour l'instant) ;
// un compteur déjà non nul sur ce vol reste toujours visible (rien n'est perdu)
function rendreCompteurs() {
  const conf = reglage('compteurs');
  const noms = Object.fromEntries(COMPTEURS.map(c => [c.cle, c.nom]));
  const aff = compteursAffiches(avion(), { feux: nbFeux(), compteurs: F.compteurs });
  $('#feu-row').hidden = !aff.feux;
  $('#ctr-zone').hidden = !aff.reglable;
  if (!aff.reglable) { $('#ctr-panel').hidden = true; $('#ctr-open').setAttribute('aria-expanded', 'false'); }
  $('#ctrs').innerHTML = conf.filter(c => (c.on && aff.compteurs.has(c.cle)) || F.compteurs[c.cle]).map(c =>
    `<div class="step"><span>${esc(noms[c.cle])}</span><span class="ctl"><button type="button" data-c="${c.cle}" data-d="-1" aria-label="${esc(noms[c.cle])} moins">${MOINS}</button><output id="c-${c.cle}">${F.compteurs[c.cle] || 0}</output><button type="button" data-c="${c.cle}" data-d="1" aria-label="${esc(noms[c.cle])} plus">${PLUS}</button></span></div>`).join('');
  $('#ctr-panel').innerHTML = '<p class="hint">Allume les compteurs à afficher dans la saisie, et range-les avec les flèches.</p>'
    + conf.map((c, i) => `<div class="prow"><span class="arrows"><button type="button" data-mv="${i}" data-d="-1" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" data-mv="${i}" data-d="1" aria-label="Descendre" ${i < conf.length - 1 ? '' : 'disabled'}>↓</button></span><span class="pname">${esc(noms[c.cle])}</span><button type="button" class="sw" role="switch" aria-checked="${c.on}" data-tg="${i}" aria-label="${esc(noms[c.cle])}"><span></span></button></div>`).join('');
}

// ---------- Temps du carnet (récapitulatif EASA) ----------
function recap() {
  if (!F) return;
  const a = avion(), f = FONCTIONS[F.fonction];
  $('#r-tot').textContent = hm(a && a.sim ? 0 : F.bloc);
  $('#r-col-l').textContent = !a ? 'Colonne avion' : a.sim ? 'Simulateur (FSTD)' : a.equipage === 'SP' ? 'Mono-pilote ' + (a.moteurs === 'ME' ? 'ME' : 'SE') : 'Multi-pilote';
  $('#r-fn-l').textContent = f.libelle;
  const rows = [];
  const n = lireDuree($('#c-nuit').value), i = lireDuree($('#c-ifr').value);
  if (n) rows.push(['Nuit', hm(n)]);
  if (i) rows.push(['IFR', hm(i)]);
  rows.push(['Atterrissages', `${F.s.attJour} jour · ${F.s.attNuit} nuit`]);
  const qui = $('#f-copi').value.trim();
  rows.push(['Nom du CdB', F.fonction === 'cdb' || F.fonction === 'inst' ? 'SELF' : (qui || 'à remplir')]);
  if (F.fonction !== 'copi' && champPersonneVisible(a, F.fonction)) rows.push([f.autre, qui || 'à remplir']);
  if (F.s.approches) rows.push(['Approches', String(F.s.approches)]);
  $('#rec-x').innerHTML = rows.map(r => `<div class="tline"><span>${esc(r[0])}</span><b class="rv">${esc(r[1])}</b></div>`).join('');
}

// ---------- IFR ----------
function choisirIFR(v) {
  F.ifr = v;
  $('#f-ifr').setAttribute('aria-checked', String(v));
  $('#lbl-vfr').classList.toggle('on', !v); $('#lbl-ifr').classList.toggle('on', v);
  if (v) $('#c-ifr').value = hm(F.bloc);
  recap();
}

// ---------- LOC / UTC ----------
function changerMode(m) {
  if (m === F.mode) return;
  const date = $('#f-date').value;
  const conv = (sel, code) => {
    const h = heureDe(sel);
    if (!h || !dateValide(date)) return null;
    const r = m === 'utc' ? versUTC(date, h, fuseau(code)) : versLocal(date, h, fuseau(code));
    $(sel).value = heureH(r.heure);
    return r.date;
  };
  const nd = conv('#f-t0', $('#f-dep').value);
  conv('#f-t1', $('#f-arr').value);
  if (nd) $('#f-date').value = nd;
  F.mode = m;
  choisir('.seg.mini', m === 'loc' ? 0 : 1);
  recalculer();
}

// ---------- Brouillon d'un vol envoyé par NPF-Q400 (v0.15) ----------
// Les champs reçus remplacent ceux du formulaire (heures en UTC, converties ensuite selon le mode d'affichage).
// Un vol déjà enregistré (même id NPF) est mis à jour : ses lignes de mission sont gardées, les feux en plus ajoutés.
function appliquerNpf(n, vol) {
  const b = brouillonNpf(n, { avions: [...etat.avions.values()], vols: vol ? etat.vols.filter(v => v.id !== vol.id) : etat.vols });
  F.npf = { id: b.npf.id, exporteLe: b.npf.exporteLe, feux: b.npf.feux, vol: n, avionInconnu: b.avion ? '' : b.immat };
  F.mode = 'utc';
  $('#f-date').value = b.date; $('#f-t0').value = heureH(b.hDep); $('#f-t1').value = heureH(b.hArr);
  F.heuresInconnues = false;
  if (b.dep || !vol) $('#f-dep').value = b.dep;
  if (b.arr || !vol) $('#f-arr').value = b.arr;
  if (b.escales.length || !vol) F.escales = b.escales;
  F.avionId = b.avion ? b.avion.id : null;
  if (vol) {
    const deja = F.lignes.filter(l => l.nouveauFeu).length;
    let lignes = F.lignes;
    for (const f of b.npf.feuxTous.slice(deja)) lignes = ajouterFeu(lignes, plusGrandFeu(etat.vols, vol.id), f.commune || f.nom).lignes;
    F.lignes = lignes;
  } else F.lignes = b.lignes;
  if (b.remarques) $('#f-rem').value = b.remarques;
  if (b.attJour !== null) F.s.attJour = b.attJour;
  if (b.attNuit !== null) F.s.attNuit = b.attNuit;
  if (b.copilote && F.fonction === 'cdb') $('#f-copi').value = b.copilote;
  $('#f-title').textContent = vol ? 'Mettre à jour le vol' : 'Vol NPF-Q400 à vérifier';
  $('#f-sub').textContent = 'Brouillon : rien n\'est enregistré tant que tu n\'appuies pas sur Enregistrer.';
  $('#save').textContent = vol ? 'Enregistrer la mise à jour' : 'Enregistrer le vol';
  $('#npf-zone').hidden = false;
  $('#npf-txt').textContent = `Vol envoyé par NPF-Q400${b.npf.nbFeux ? ` · ${b.npf.nbFeux} feu${b.npf.nbFeux > 1 ? 'x' : ''}` : ''}`
    + (b.avion ? '' : ` · avion ${b.immat} inconnu : ajoute-le ci-dessous`) + '. Complète ce qui manque (fonction, copilote, atterrissages…).';
  return b;
}

// ---------- Ouverture ----------
// opts.npf : vol reçu de NPF-Q400 (format « carnet-vol-npf ») à ouvrir en brouillon ; vol = le vol déjà enregistré
// avec le même id NPF (mise à jour) ou null.
export function ouvrirSaisie(vol, opts = {}) {
  const dernier = etat.vols[0];
  const v = vol ? structuredClone(vol) : volVide();
  F = { vol: vol || null, mode: vol ? (vol.mode || 'loc') : 'loc', escales: (v.escales || []).map(e => ({ ...e })),
    avionId: v.avionId, etiquettes: [...(v.etiquettes || [])], fonction: v.fonction || 'cdb',
    lignes: lignesPourSaisie(v), compteurs: { ...v.compteurs }, s: { approches: v.approches || 0, attJour: v.attJour, attNuit: v.attNuit },
    ifr: !!v.regleIFR, bloc: v.tempsTotal || v.simTemps || 0, heuresInconnues: !!vol && !(vol.hDep && vol.hArr), charge: true, npf: null };
  $('#npf-zone').hidden = true;
  $('#f-err').textContent = '';
  $('#ctr-panel').hidden = true; $('#ctr-open').setAttribute('aria-expanded', 'false');
  $('#p-res').hidden = true; $('#m-res').hidden = true; ouvrirChoixAvion(false);
  $('#m-q').value = '';
  choisir('.seg.mini', F.mode === 'loc' ? 0 : 1);

  if (vol) {
    $('#f-title').textContent = 'Modifier le vol';
    $('#f-sub').textContent = `du ${dateFr(vol.date)} · ${[vol.dep, ...F.escales.map(e => e.code), vol.arr].join(' › ')}`;
    $('#save').textContent = 'Enregistrer les modifications';
    $('#del-zone').hidden = false; $('#del-confirm').hidden = true;
    let date = vol.date, t0 = vol.hDep, t1 = vol.hArr;
    if (F.mode === 'loc' && vol.hDep) {
      const d = versLocal(vol.date, vol.hDep, fuseau(vol.dep)); date = d.date; t0 = d.heure;
      if (vol.hArr) {
        const dArr = minutesDuJour(vol.hArr) < minutesDuJour(vol.hDep) ? ajouterJours(vol.date, 1) : vol.date;
        t1 = versLocal(dArr, vol.hArr, fuseau(vol.arr)).heure;
      }
    }
    $('#f-date').value = date; $('#f-dep').value = vol.dep; $('#f-arr').value = vol.arr;
    $('#f-t0').value = heureH(t0); $('#f-t1').value = heureH(t1);
    $('#f-copi').value = v[FONCTIONS[F.fonction].champ] === 'SELF' ? '' : (v[FONCTIONS[F.fonction].champ] || '');
    $('#f-rem').value = vol.remarques || '';
  } else {
    $('#f-title').textContent = 'Nouveau vol'; $('#f-sub').textContent = '';
    $('#save').textContent = 'Enregistrer le vol';
    $('#del-zone').hidden = true;
    $('#f-date').value = aujourdhui();
    $('#f-dep').value = dernier ? dernier.arr : ''; $('#f-arr').value = dernier ? dernier.arr : '';
    $('#f-t0').value = ''; $('#f-t1').value = '';
    F.avionId = dernier ? dernier.avionId : ([...etat.avions.values()][0]?.id || null);
    F.etiquettes = dernier ? [...(dernier.etiquettes || [])] : [];
    $('#f-copi').value = dernier && dernier.nomCopi && dernier.nomCopi !== 'SELF' ? dernier.nomCopi : '';
    $('#f-rem').value = '';
    F.s = { approches: 0, attJour: 1, attNuit: 0 };
  }
  // Mode d'affichage voulu : celui du vol (mise à jour), sinon celui du dernier vol saisi, sinon LOC
  const modeVoulu = vol ? (vol.mode || 'loc') : (dernier && dernier.mode) || 'loc';
  const brouillon = opts.npf ? appliquerNpf(opts.npf, vol) : null;
  $$('#f-t0, #f-t1').forEach(el => el.classList.remove('bad'));
  const a = avion();
  afficherLigneAvion(a);
  if (a && !vol) F.etiquettes = etiquettesPourAvion(F.etiquettes, a);
  appliquerEquipage();
  noms(); rendreEscales(); rendreEtiquettes(); rendreCompteurs(); rendreLignes();
  for (const k of ['approches', 'attJour', 'attNuit']) sortie(k);
  choisirIFR(F.ifr);
  if (vol && !brouillon) {
    // On montre exactement ce qui est enregistré (aucun recalcul tant qu'on ne touche à rien)
    $('#f-bloc').textContent = hm(F.bloc);
    $('#f-j1').hidden = !(vol.hDep && vol.hArr && minutesDuJour(vol.hArr) < minutesDuJour(vol.hDep));
    $('#c-nuit').value = hm(vol.tempsNuit); $('#c-ifr').value = hm(vol.tempsIFR);
    const c = colonnesAvion(vol, a);
    $('#c-col').value = hm(a && a.sim ? vol.simTemps : (c.mp || c.se || c.me));
    $('#c-fn').value = hm(vol[FONCTIONS[F.fonction].temps]);
  } else recalculer();
  if (brouillon) {
    choisir('.seg.mini', 1);
    if (modeVoulu === 'loc') changerMode('loc');
    if (!a) { ouvrirChoixAvion(true); $('#ac-q').value = brouillon.immat; $('#ac-q').dispatchEvent(new Event('input')); }
  }
  F.charge = false;
  recap(); apercu();
  F.empreinte = empreinte();
  // carte du vol enregistré (sans jamais toucher aux heures) ; brouillon NPF : positions des feux reçues
  afficherCarteVol(brouillon ? { ...(vol || {}), date: brouillon.date, hDep: brouillon.hDep, hArr: brouillon.hArr, dep: brouillon.dep || (vol && vol.dep) || '',
    arr: brouillon.arr || (vol && vol.arr) || '', escales: F.escales, avionId: F.avionId, feuxPositions: brouillon.npf.feux, brouillon: true } : (vol || null));
}

// ---------- Changements non enregistrés (flèche retour : « Abandonner la saisie ? ») ----------
const CHAMPS = ['#f-date', '#f-dep', '#f-arr', '#f-t0', '#f-t1', '#f-copi', '#f-rem', '#c-ifr', '#c-nuit', '#c-col', '#c-fn'];
function empreinte() {
  return JSON.stringify([CHAMPS.map(c => $(c).value), F.mode, F.escales, F.avionId, F.etiquettes, F.fonction,
    F.lignes.map(l => l.t), F.compteurs, F.s, F.ifr]);
}
export const saisieModifiee = () => !!F && F.empreinte !== undefined && empreinte() !== F.empreinte;
export function abandonnerSaisie() { F = null; quitter(); }

// ---------- Enregistrement ----------
async function enregistrer() {
  const err = m => { $('#f-err').textContent = m; toast(m, 2500); };
  const date = $('#f-date').value, dep = $('#f-dep').value.trim(), arr = $('#f-arr').value.trim();
  if (!dateValide(date)) return err('Choisis la date du vol.');
  if (!dep || !arr) return err('Indique les terrains de départ et d\'arrivée.');
  const a = avion();
  if (!a) return err('Choisis un avion.');
  const t0 = $('#f-t0').value, t1 = $('#f-t1').value;
  const i = instants();
  if ((t0 || t1) && !i) return err('Heures bloc incomplètes : tape 4 chiffres, ex. 0942.');
  if (!i && !F.heuresInconnues) return err('Indique les heures bloc (départ et arrivée).');
  const lire = (sel, nom) => { const d = lireDuree($(sel).value); if (Number.isNaN(d)) throw new Error(`${nom} : format attendu 1h30`); return d || 0; };
  let nuit, ifr, col, fn;
  try {
    nuit = lire('#c-nuit', 'Temps nuit'); ifr = lire('#c-ifr', 'Temps IFR');
    col = lire('#c-col', 'Colonne avion'); fn = lire('#c-fn', 'Temps de fonction');
  } catch (e) { return err(e.message); }

  const v = F.vol ? structuredClone(F.vol) : volVide();
  if (i) { v.date = i.dateUTC; v.hDep = i.hDep; v.hArr = i.hArr; }
  else if (!F.vol || !F.vol.hDep) v.date = date;
  v.mode = F.mode; v.dep = dep; v.arr = arr; v.escales = F.escales.map(e => ({ ...e }));
  // Indicatif radio : celui de la fiche avion (on garde celui déjà enregistré si l'avion n'a pas changé)
  v.indicatif = F.vol && F.vol.avionId === a.id ? (F.vol.indicatif || '') : (a.indicatif || '');
  v.avionId = a.id; v.etiquettes = [...F.etiquettes];
  const total = a.sim ? 0 : F.bloc;
  if (a.sim) { v.tempsTotal = 0; v.simTemps = col || F.bloc; v.tempsSE = v.tempsME = v.tempsMP = null; }
  else {
    v.tempsTotal = total; v.simTemps = 0;
    // Colonne avion : null = déduite de la fiche avion ; une valeur différente = saisie à la main
    if (!F.vol || F.vol.avionId !== a.id) v.tempsSE = v.tempsME = v.tempsMP = null;
    const champ = a.equipage === 'MP' ? 'tempsMP' : a.moteurs === 'ME' ? 'tempsME' : 'tempsSE';
    const cle = { tempsMP: 'mp', tempsME: 'me', tempsSE: 'se' }[champ];
    const auto = colonnesAvion({ ...v, [champ]: null }, a)[cle];
    v[champ] = col === auto ? null : col;
  }
  // Fonction : le temps va dans la colonne de MA fonction
  const f = FONCTIONS[F.fonction];
  const changee = !F.vol || F.vol.fonction !== F.fonction;
  for (const k of TEMPS_FONCTION) if (changee) v[k] = 0;
  v[f.temps] = a.sim ? 0 : fn;
  v.fonction = F.fonction;
  const qui = champPersonneVisible(a, F.fonction) ? $('#f-copi').value.trim() : '';
  if (F.fonction === 'cdb') { v.nomCdB = 'SELF'; v.nomCopi = qui; }
  if (F.fonction === 'copi') { v.nomCdB = qui; }
  if (F.fonction === 'dc') { v.nomInstructeur = qui; v.nomCdB = qui; }
  if (F.fonction === 'inst') { v.nomEleve = qui; v.nomCdB = 'SELF'; }
  v.tempsNuit = nuit; v.tempsIFR = ifr; v.regleIFR = F.ifr;
  v.approches = F.s.approches; v.attJour = F.s.attJour; v.attNuit = F.s.attNuit;
  v.missions = F.lignes.map(l => l.t.trim()).filter(Boolean);
  v.feux = nbFeux();
  v.compteurs = { ...v.compteurs, ...F.compteurs };
  v.remarques = $('#f-rem').value.trim();
  if (!F.vol) v.source = 'saisie';
  // Vol reçu de NPF-Q400 : son id (pas de doublon), la date de l'export et les positions des feux (Carte du vol)
  const npf = F.npf;
  if (npf) { v.npfId = npf.id; v.npfExporteLe = npf.exporteLe; v.feuxPositions = npf.feux.map(f => ({ ...f })); }
  await enregistrerVol(v);
  if (npf) volNpfEnregistre(npf.id);
  // nouvelle personne tapée sans passer par « + » : on l'ajoute à la liste
  if (qui && !trouverPersonne(qui)) {
    const p = personneVide();
    if (/^[A-Z]{3}$/i.test(qui)) p.tri = qui.toUpperCase(); else p.nom = qui;
    await enregistrerPersonne(p);
  }
  toast(npf ? (F.vol ? 'Vol mis à jour' : 'Vol NPF-Q400 enregistré') : F.vol ? 'Vol modifié' : 'Vol enregistré');
  F = null;
  quitter();
}

// ---------- Branchements ----------
export function initSaisie({ fermer }) {
  quitter = fermer;
  champOACI('#f-dep', '#f-arr'); champOACI('#f-arr', '#f-t0');
  champHeure('#f-t0', '#f-t1'); champHeure('#f-t1', null);
  for (const s of ['#f-dep', '#f-arr']) $(s).addEventListener('input', () => { noms(); recalculer(); });
  for (const s of ['#f-t0', '#f-t1', '#f-date']) $(s).addEventListener('input', recalculer);
  $('#tz-loc').addEventListener('click', () => changerMode('loc'));
  $('#tz-utc').addEventListener('click', () => changerMode('utc'));
  $('#cancel').addEventListener('click', () => { F = null; quitter(); });
  // Brouillon NPF : « Ignorer ce vol » (confirmation) le retire du NAS sans rien enregistrer
  $('#npf-ign').addEventListener('click', () => {
    if (!F || !F.npf) return;
    ignorerVolNpf(F.npf.vol, fait => { if (fait) { F = null; quitter(); } });
  });

  // − / + (approches, atterrissages)
  $('#v-saisie').addEventListener('click', e => {
    const b = e.target.closest('[data-s]');
    if (b) { const k = b.dataset.s; F.s[k] = Math.max(0, F.s[k] + Number(b.dataset.d)); sortie(k); recap(); }
    const c = e.target.closest('[data-c]');
    if (c) { const k = c.dataset.c; F.compteurs[k] = Math.max(0, (F.compteurs[k] || 0) + Number(c.dataset.d)); $('#c-' + k).textContent = F.compteurs[k]; }
  });
  $('#f-ifr').addEventListener('click', () => choisirIFR(!F.ifr));
  for (const s of ['#c-nuit', '#c-ifr', '#f-copi']) $(s).addEventListener('input', recap);

  // escales
  $('#via-add').addEventListener('click', () => ouvrirEscale(-1));
  $('#via-list').addEventListener('click', e => { const b = e.target.closest('[data-vi]'); if (b) ouvrirEscale(Number(b.dataset.vi)); });
  $('#vm-icao').addEventListener('input', () => { $('#vm-icao').value = $('#vm-icao').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); nomVM(); });
  $('#via-modal').addEventListener('click', e => {
    const b = e.target.closest('[data-vm]');
    if (b) { const k = b.dataset.vm; VM[k] = Math.max(0, VM[k] + Number(b.dataset.d)); $('#vm-' + k).textContent = VM[k]; }
  });
  $('#vm-cancel').addEventListener('click', () => { $('#via-modal').hidden = true; });
  $('#vm-del').addEventListener('click', () => { F.escales.splice(vmEdit, 1); $('#via-modal').hidden = true; rendreEscales(); recalculer(); });
  $('#vm-ok').addEventListener('click', () => {
    const c = $('#vm-icao').value.toUpperCase();
    if (c.length !== 4) { nomVM(); return; }
    const v = { code: c, attJour: VM.attJour, attNuit: VM.attNuit };
    if (vmEdit >= 0) F.escales[vmEdit] = v; else F.escales.push(v);
    $('#via-modal').hidden = true; rendreEscales(); recalculer();
  });

  initAvions({ choix: a => choisirAvion(a), courant: () => F && F.avionId, modifie: a => avionModifie(a) });
  $('#ac-cur').addEventListener('click', () => {
    const o = $('#ac-sz').hidden;
    ouvrirChoixAvion(o);
    if (o) setTimeout(() => $('#ac-q').focus(), 50);
  });

  // terrains absents de la table
  $('#v-saisie').addEventListener('click', e => {
    const b = e.target.closest('[data-ajt]');
    if (b) ouvrirAjoutTerrain($(b.dataset.ajt).value, () => { noms(); recalculer(); });
  });
  $('#vm-ajt').addEventListener('click', () => ouvrirAjoutTerrain($('#vm-icao').value, () => { nomVM(); rendreEscales(); recalculer(); }));

  // étiquettes (pastilles à cocher ; BOMBING et TRANSPORT s'excluent)
  $('#tg-val').addEventListener('click', e => {
    const b = e.target.closest('[data-tg3]');
    if (!b) return;
    F.etiquettes = basculerEtiquette(F.etiquettes, b.dataset.tg3);
    rendreEtiquettes();
  });
  $('#tg-add').addEventListener('click', () => { $('#pm2-v').value = ''; $('#pm2-ok').disabled = true; $('#tg-modal').hidden = false; setTimeout(() => $('#pm2-v').focus(), 50); });
  $('#pm2-v').addEventListener('input', () => { $('#pm2-ok').disabled = !$('#pm2-v').value.trim(); });
  $('#pm2-x').addEventListener('click', () => { $('#tg-modal').hidden = true; });
  // Nouvelle étiquette : ajoutée à la liste générale ET à la fiche de l'avion choisi, puis cochée
  $('#pm2-ok').addEventListener('click', async () => {
    const t = $('#pm2-v').value.trim().toUpperCase();
    const et = reglage('etiquettes');
    if (!et.includes(t)) await enregistrerReglage('etiquettes', [...et, t]);
    const a = F && avion();
    if (a && !(a.etiquettes || []).includes(t)) await enregistrerAvion({ ...a, etiquettes: [...(a.etiquettes || []), t] });
    if (F) { F.etiquettes = basculerEtiquette(F.etiquettes.filter(x => x !== t), t); rendreEtiquettes(); }
    $('#tg-modal').hidden = true;
  });

  // fonction et personnes
  segs('#f-fn', b => choisirFonction(b.dataset.r));
  $('#f-copi').addEventListener('input', rendrePersonnes);
  $('#p-res').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { $('#f-copi').value = b.dataset.p; $('#p-res').hidden = true; recap(); } });
  $('#p-add').addEventListener('click', () => ouvrirPersonne(null));
  for (const x of ['#pm-pre', '#pm-nom', '#pm-tri']) $(x).addEventListener('input', verifierPersonne);
  $('#pm-x').addEventListener('click', () => { $('#p-modal').hidden = true; });
  $('#pm-del').addEventListener('click', async () => {
    if (!personneEditee) return;
    await supprimerPersonne(personneEditee.id);
    $('#p-modal').hidden = true;
    document.dispatchEvent(new CustomEvent('personnes-modifiees'));
  });
  $('#pm-ok').addEventListener('click', async () => {
    const p = personneEditee ? { ...personneEditee } : personneVide();
    p.prenom = $('#pm-pre').value.trim(); p.nom = $('#pm-nom').value.trim(); p.tri = $('#pm-tri').value.trim().toUpperCase();
    await enregistrerPersonne(p);
    $('#p-modal').hidden = true;
    if (F && !$('#v-saisie').hidden && !personneEditee) { $('#f-copi').value = nomPersonne(p); $('#p-res').hidden = true; recap(); }
    document.dispatchEvent(new CustomEvent('personnes-modifiees'));
  });

  // missions
  $('#m-q').addEventListener('input', rendreSuggestions);
  $('#m-q').addEventListener('keydown', e => { if (e.key === 'Enter') $('#m-add').click(); });
  activerGlisser($('#m-res'));
  $('#m-res').addEventListener('click', async e => {
    const d = e.target.closest('[data-mdel]');
    if (d) { await supprimerSuggestion(d.dataset.mdel); return; }
    const b = e.target.closest('[data-mv2]');
    if (b) { F.lignes.push({ t: b.dataset.mv2, nouveauFeu: null }); $('#m-q').value = ''; rendreSuggestions(); rendreLignes(); return; }
    if (e.target.closest('[data-mnew]')) $('#m-add').click();
  });
  $('#m-add').addEventListener('click', async () => {
    const v = $('#m-q').value.trim().toUpperCase();
    if (!v) { $('#m-q').focus(); return; }
    const aj = reglage('missionsAjoutees');
    // retapée à la main : une suggestion masquée redevient une suggestion
    const masq = reglage('missionsMasquees');
    if (estMasquee(masq, v)) await enregistrerReglage('missionsMasquees', remettreSuggestion(masq, v));
    if (!listeMissions().some(x => x.toUpperCase() === v)) await enregistrerReglage('missionsAjoutees', [v, ...aj]);
    F.lignes.push({ t: v, nouveauFeu: null }); $('#m-q').value = ''; rendreSuggestions(); rendreLignes();
  });
  $('#ml').addEventListener('input', e => { const i = e.target.dataset.mi; if (i != null) { F.lignes[i].t = e.target.value; apercu(); e.target.parentElement.classList.toggle('feu', estLigneFeu(e.target.value)); } });
  $('#ml').addEventListener('click', e => {
    const x = e.target.closest('[data-mx]');
    if (x) { F.lignes.splice(Number(x.dataset.mx), 1); rendreLignes(); }
  });
  $('#feu-p').addEventListener('click', () => {
    const q = $('#m-q').value.trim();
    F.lignes = ajouterFeu(F.lignes, prochainFeu(), q).lignes;
    $('#m-q').value = ''; $('#m-res').hidden = true;
    rendreLignes();
    if (!q) { const ins = $$('#ml input'); const el = ins[ins.length - 1]; el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });
  $('#feu-m').addEventListener('click', () => { F.lignes = enleverFeu(F.lignes); rendreLignes(); });

  // compteurs : choix et ordre (réglage gardé pour les prochains vols)
  $('#ctr-open').addEventListener('click', () => { const p = $('#ctr-panel'); p.hidden = !p.hidden; $('#ctr-open').setAttribute('aria-expanded', String(!p.hidden)); });
  $('#ctr-panel').addEventListener('click', async e => {
    const t = e.target.closest('[data-tg]'), m = e.target.closest('[data-mv]');
    const conf = reglage('compteurs').map(c => ({ ...c }));
    if (t) conf[Number(t.dataset.tg)].on = !conf[Number(t.dataset.tg)].on;
    else if (m) { const i = Number(m.dataset.mv), j = i + Number(m.dataset.d); [conf[i], conf[j]] = [conf[j], conf[i]]; }
    else return;
    await enregistrerReglage('compteurs', conf);
    rendreCompteurs();
  });
  $('#rules-open2').addEventListener('click', ouvrirRegles);
  $('#mlm-open').addEventListener('click', ouvrirLibelles);
  $('#mlm-q').addEventListener('input', rendreLibelles);
  $('#mlm-x').addEventListener('click', () => { $('#ml-modal').hidden = true; });
  activerGlisser($('#mlm-list'));
  $('#mlm-list').addEventListener('click', async e => {
    const d = e.target.closest('[data-mdel]');
    if (d) await supprimerSuggestion(d.dataset.mdel);
  });

  // suppression
  $('#del').addEventListener('click', () => { $('#del-confirm').hidden = false; });
  $('#del-no').addEventListener('click', () => { $('#del-confirm').hidden = true; });
  $('#del-yes').addEventListener('click', async () => { const v = F.vol; F = null; quitter(); await supprimerVolAvecAnnuler(v); });
  $('#save').addEventListener('click', () => enregistrer().catch(e => { $('#f-err').textContent = 'Erreur : ' + e.message; }));
}

export const saisieEnCours = () => F !== null;
export { codeAvecDrapeau };
