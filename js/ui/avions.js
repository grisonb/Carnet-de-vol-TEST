// Avions : recherche rapide dans la saisie, « Tous mes avions », « Ajouter un avion », fiche avion.

import { $, esc, segs, choisir, toast, PLUS, CRAYON, CROIX } from './commun.js';
import { etat, enregistrerAvion, reglage } from '../etat.js';
import { avionVide, formaterImmat, texteColonneAvion, etiquettesParDefaut, etiquettesPourTrain, classerParTypeEtImmat, comparerImmat, typeDeLAvion } from '../modele.js';
import { TYPES, indexTypes, caracteristiquesDuType, MOTEUR, SURFACE } from '../types-avion.js';
import { normaliser } from '../missions.js';
import { hm, dateFr } from '../temps.js';
import { calculerTotaux } from '../totaux.js';
import { ouvrirRecherchePhoto, initPhotoWeb, htmlCredit } from './photo-web.js';
import { ouvrirCadrage, afficherPhotoCadree, suivreBandeau } from './cadrage.js';

export const SIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
export const SIMI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v12H3zm2 2v8h14V6zm3 12h8v2H8zM10 8l5 2-5 2z"/></svg>';

let types = indexTypes(TYPES);
export function definirTypes(liste) { types = indexTypes(liste); }
export const typesConnus = () => types;

let onChoix = () => {};          // avion choisi pour le vol en cours
let onModifie = () => {};        // fiche d'un avion modifiée
let avionCourant = () => null;   // id de l'avion du vol en cours
let stats = null;                // heures et vols par avion (calculés à l'ouverture de la liste)

export const photo = a => (a && a.photo ? `<img src="${a.photo}" alt="">` : (a && a.sim ? SIMI : SIL));

export function categorie(a) {
  if (!a) return '';
  if (a.sim) return 'Simulateur' + (a.fstd ? ' ' + a.fstd : '');
  const p = [a.equipage === 'MP' ? 'Multipilote' : a.equipage === 'SP' ? 'Monopilote' : 'Équipage à préciser',
    a.moteurs === 'ME' ? 'Multimoteur' : 'Monomoteur'];
  if (a.moteur) p.push(MOTEUR[a.moteur]);
  if (a.surface && a.surface !== 'L') p.push(SURFACE[a.surface]);
  if (a.train === 'classique') p.push('Train classique');
  return p.join(' · ');
}

function pastilles(a) {
  const t = [];
  if (a.sim) t.push('SIM');
  else if (a.equipage === 'MP') t.push('MP');
  else if (a.equipage === 'SP') t.push(a.moteurs === 'ME' ? 'ME' : 'SE');
  if (a.surface === 'A') t.push('AMPHIBIE');
  if (a.surface === 'H') t.push('HYDRAVION');
  for (const x of a.etiquettes || []) if (!t.includes(x)) t.push(x);
  return t.map(x => `<span>${esc(x)}</span>`).join('');
}

const meule = a => normaliser([a.immat, a.indicatif, a.nom, a.typeOACI, a.constructeur, a.modele, a.sim ? 'SIMULATEUR' : ''].join(' '));

function calculerStats() {
  const t = calculerTotaux(etat.vols, etat.avions);
  stats = t.parAvion;
}

export function itemAvion(a, crayon = false) {
  const s = (stats && stats[a.id]) || { minutes: 0, vols: 0 };
  const nm = a.nom && a.nom.toUpperCase() !== a.immat.toUpperCase() ? a.nom : '';
  const carte = `<button type="button" class="acitem" data-ac="${esc(a.id)}" aria-current="${a.id === avionCourant()}"><div class="acph">${photo(a)}</div><div><div class="t1">${esc(a.immat)}${nm ? `<span class="nm">${esc(nm)}</span>` : ''}</div><div class="t2">${a.sim ? 'Simulateur' : esc(a.modele || a.typeOACI)}</div><div class="tg">${pastilles(a)}</div></div><div class="hrs">${hm(s.minutes)}<small>${s.vols} vol${s.vols > 1 ? 's' : ''}</small></div></button>`;
  return crayon ? `<div class="acwrap">${carte}<button type="button" class="penbtn" data-ed="${esc(a.id)}" aria-label="Modifier la fiche de ${esc(a.immat)}">${CRAYON}</button></div>` : carte;
}

// Ordre : dernier vol le plus récent d'abord
function avionsTries() {
  if (!stats) calculerStats();
  return [...etat.avions.values()].sort((x, y) =>
    ((stats[y.id] && stats[y.id].dernier) || y.creeLe || '').localeCompare((stats[x.id] && stats[x.id].dernier) || x.creeLe || ''));
}

// ---------- Recherche rapide (saisie) ----------
export function rechercheRapide() {
  const q = normaliser($('#ac-q').value), r = $('#ac-res');
  if (!q) { r.hidden = true; r.innerHTML = ''; return; }
  // Types dans l'ordre du dernier vol (comme avant) ; dans un même type, par immatriculation (R52)
  const m = classerParTypeEtImmat(avionsTries().filter(a => meule(a).includes(q)));
  r.innerHTML = m.slice(0, 6).map(itemAvion).join('')
    + (m.length > 6 ? `<button type="button" class="linkbtn" data-all="1">${m.length - 6} autre${m.length > 7 ? 's' : ''} : voir la liste complète ›</button>` : '')
    + (m.length ? '' : '<p class="hint">Aucun avion trouvé. <button type="button" class="linkbtn" data-new="1">+ Ajouter un avion</button></p>');
  r.hidden = false;
}

// ---------- Tous mes avions ----------
function rendreFlotte() {
  const q = normaliser($('#fl-q').value);
  const m = avionsTries().filter(a => !q || meule(a).includes(q));
  const g = {};
  for (const a of m) { const k = typeDeLAvion(a); (g[k] = g[k] || []).push(a); }
  const cles = Object.keys(g).sort((x, y) => (x === 'SIMULATEURS' ? 1 : y === 'SIMULATEURS' ? -1 : x.localeCompare(y)));
  $('#fl-n').textContent = `${m.length} avion${m.length > 1 ? 's' : ''}` + (q ? ` trouvé${m.length > 1 ? 's' : ''}` : ` · ${cles.length} type${cles.length > 1 ? 's' : ''}`);
  const min = a => (stats[a.id] && stats[a.id].minutes) || 0;
  $('#fl-list').innerHTML = cles.map(k => {
    const L = g[k].sort(comparerImmat); // R52 : par immatriculation dans chaque type
    const tot = L.reduce((s, a) => s + min(a), 0);
    return `<div class="grp"><span>${esc(k)}</span><span>${hm(tot)}</span></div><div class="flist">${L.map(a => itemAvion(a, true)).join('')}</div>`;
  }).join('') || '<p class="hint">Aucun avion. Touche + pour en ajouter un.</p>';
}

export function ouvrirFlotte(q = '') {
  calculerStats();
  $('#fl-q').value = q;
  rendreFlotte();
  $('#fleet').hidden = false; $('#sfab').hidden = false; menuPlus(false);
  $('#fleet').scrollTop = 0;
}
function fermerFlotte() { $('#fleet').hidden = true; $('#sfab').hidden = true; menuPlus(false); }

function menuPlus(o) {
  $('#sf-menu').hidden = !o; $('#sf-veil').hidden = !o;
  $('#sf-main').innerHTML = o ? CROIX : PLUS;
  $('#sf-main').setAttribute('aria-expanded', String(o));
}

// ---------- Ajouter un avion ----------
export function ouvrirAjout(v = '') {
  $('#a1-reg').value = v; verifierAjout();
  $('#add1').hidden = false;
  setTimeout(() => $('#a1-reg').focus(), 50);
}
const parImmat = r => [...etat.avions.values()].find(a => a.immat === r);
function verifierAjout() {
  const r = formaterImmat($('#a1-reg').value), a = parImmat(r);
  $('#a1-go').disabled = r.length < 3;
  $('#a1-msg').textContent = a ? `${r} est déjà dans ta liste (${a.modele || a.typeOACI}) : Continuer ouvre sa fiche.` : r.length >= 3 ? 'Nouvel avion : ' + r : '';
}

// ---------- Fiche avion ----------
let FI = null; // brouillon de la fiche
let fiAvion = null; // avion existant ou null
let fiOrigine = 'saisie'; // 'saisie' (bouton i), 'flotte' (crayon de Tous mes avions), 'nouveau'

function ligneType() {
  const tl = $('#fi-tl');
  if (FI.sim) { tl.textContent = ''; return; }
  const o = $('#fi-oaci').value.toUpperCase().trim(), t = types.get(o);
  if (!o || o.length < 4 && !t) { tl.className = 'typeline'; tl.textContent = o ? '' : 'Tape le code OACI du type (4 lettres max)'; return; }
  if (!t) { tl.className = 'typeline bad'; tl.textContent = 'Type inconnu : complète le modèle et les cases ci-dessous'; return; }
  tl.className = 'typeline';
  tl.textContent = `${t.constructeur} • ${o} • ${t.modele}`;
  if (FI._o !== o) {
    FI._o = o;
    const c = caracteristiquesDuType(t);
    $('#fi-mod').value = c.modele;
    Object.assign(FI, { constructeur: c.constructeur, equipage: c.equipage, moteurs: c.moteurs, moteur: c.moteur, surface: c.surface, train: c.train });
    // nouvel avion : étiquettes par défaut du type (DH8D : BOMBING + TRANSPORT ; train classique : TAILWHEEL)
    if (!fiAvion) FI.etiquettes = [...new Set([...FI.etiquettes.filter(t => !['BOMBING', 'TRANSPORT', 'TAILWHEEL'].includes(t)),
      ...etiquettesParDefaut({ typeOACI: o, train: c.train })])];
    else FI.etiquettes = etiquettesPourTrain(FI.etiquettes, c.train);
    boutonsFiche(); rendreEtiquettesFiche();
  }
}

function boutonsFiche() {
  choisir('#fi-pil', FI.equipage === 'SP' ? 0 : FI.equipage === 'MP' ? 1 : -1);
  choisir('#fi-eng', FI.moteurs === 'SE' ? 0 : FI.moteurs === 'ME' ? 1 : -1);
  choisir('#fi-mot', 'PTJ'.indexOf(FI.moteur ?? 'x'));
  choisir('#fi-surf', 'LAH'.indexOf(FI.surface ?? 'x'));
  choisir('#fi-tw', FI.train === 'classique' ? 1 : 0);
  choisir('#fi-fstd', ['FFS', 'FTD', 'FNPT II'].indexOf(FI.fstd));
  $('#fi-eng-z').hidden = FI.equipage !== 'SP';
  $('#fi-col').textContent = !FI.equipage ? 'Choisis monopilote ou multipilote.'
    : FI.equipage === 'SP' && !FI.moteurs ? 'Carnet EASA : colonne Mono-pilote : choisis SE ou ME'
      : texteColonneAvion({ equipage: FI.equipage, moteurs: FI.moteurs });
}

function genreFiche() {
  const sim = FI.sim;
  choisir('#fi-kind', sim ? 1 : 0);
  $('#fi-reg-l').firstChild.textContent = sim ? 'Nom du simulateur ' : 'Immatriculation ';
  $('#fi-reg').placeholder = sim ? 'ex. DHC8-400' : 'F-ABCD';
  $('#fi-oaci-f').hidden = sim; $('#fi-fstd-f').hidden = !sim; $('#fi-easa').hidden = sim;
  $('#fi-tl').hidden = sim; $('#fi-ind-z').hidden = sim; $('#fi-tgsec').hidden = sim; $('#fi-hex-z').hidden = sim;
  if (!FI.photo) $('#fi-img').innerHTML = sim ? SIMI : SIL;
  $('#fi-web').hidden = sim;
  $('#fi-rc').hidden = !FI.photo;
  ligneType();
}

// Bloc « Étiquettes » de la fiche : toutes les étiquettes existantes, à cocher pour cet avion
function rendreEtiquettesFiche() {
  const toutes = [...new Set([...reglage('etiquettes'), ...FI.etiquettes])];
  $('#fi-tgs').innerHTML = toutes.map(t => `<button type="button" class="tgchip" data-ft="${esc(t)}" aria-pressed="${FI.etiquettes.includes(t)}">${esc(t)}</button>`).join('')
    || '<p class="hint">Aucune étiquette pour l\'instant (crée-les depuis la saisie d\'un vol).</p>';
  $('#fi-tgsec').classList.toggle('vide', !FI.etiquettes.length);
}

// Lecture seule (bouton « i ») ou modification (crayon, nouvel avion)
function modeFiche(lecture) {
  $('#fiche').classList.toggle('ro', lecture);
  $('#fi-ed').hidden = !lecture; $('#fi-save').hidden = lecture;
  for (const el of document.querySelectorAll('#fiche input')) el.readOnly = lecture;
}

// mode : 'lecture' ou 'modif' ; origine : 'saisie', 'flotte' ou 'nouveau'
export function ouvrirFiche(a, init = {}, mode = 'modif', origine = a ? 'saisie' : 'nouveau') {
  fiAvion = a || null; fiOrigine = origine;
  const b = a ? { ...a } : Object.assign(avionVide(), init);
  FI = { sim: !!b.sim, equipage: b.equipage, moteurs: b.moteurs, moteur: b.moteur, surface: b.surface || 'L',
    train: b.train || 'tricycle', photo: b.photo, photoCredit: b.photo ? (b.photoCredit || null) : null, photoCadre: b.photo ? (b.photoCadre || null) : null,
    fstd: b.fstd, constructeur: b.constructeur, _o: b.typeOACI,
    etiquettes: [...(b.etiquettes || [])] };
  $('#fi-reg').value = b.immat; $('#fi-oaci').value = b.sim ? '' : (b.typeOACI || '');
  $('#fi-mod').value = b.modele || ''; $('#fi-ind').value = b.indicatif || ''; $('#fi-nm').value = b.nom || '';
  $('#fi-hex').value = (b.hexAdsb || '').toUpperCase();
  $('#fi-rem').value = b.remarques || '';
  rendreEtiquettesFiche();
  if (b.photo) afficherPhotoFiche(`Photo de ${b.immat}`); else $('#fi-img').innerHTML = b.sim ? SIMI : SIL;
  afficherCredit();
  if (!stats) calculerStats();
  const s = a && stats[a.id];
  $('#fi-stat').textContent = s && s.vols ? `${hm(s.minutes)} sur cet ${a.sim ? 'simulateur' : 'avion'} · ${s.vols} vol${s.vols > 1 ? 's' : ''} · dernier vol ${dateFr(s.dernier)}` : '';
  $('#fi-err').textContent = '';
  boutonsFiche(); genreFiche();
  $('#fiche').hidden = false; $('#fiche').scrollTop = 0;
  modeFiche(mode === 'lecture' && !!a);
  if (!a && !b.immat) setTimeout(() => $('#fi-reg').focus(), 50);
}
// v0.38 (R93) : photo du bandeau avec son cadrage (sans cadrage : centrée, comme avant) ; « Recadrer » s'il y a une photo
function afficherPhotoFiche(alt = '') {
  afficherPhotoCadree($('#fi-img'), document.querySelector('#fiche .fphoto'), FI.photo, FI.photoCadre, alt);
  $('#fi-rc').hidden = !FI.photo;
}
async function recadrer() {
  if (!FI || !FI.photo) return;
  const b = document.querySelector('#fiche .fphoto');
  const c = await ouvrirCadrage(FI.photo, FI.photoCadre, b.clientWidth / b.clientHeight);
  if (!c) return; // Annuler : rien ne change
  FI.photoCadre = c;
  afficherPhotoFiche();
}
// v0.21 : crédit d'une photo trouvée sur Internet, sous la photo (rien pour une photo prise au téléphone)
function afficherCredit() {
  const c = FI.photo ? FI.photoCredit : null;
  $('#fi-credit').hidden = !c;
  $('#fi-credit').innerHTML = htmlCredit(c);
}
function fermerFiche() { $('#fiche').hidden = true; $('#fi-save').hidden = true; }

// Photo réduite à 1280 px environ avant stockage
export async function reduirePhoto(fichier, max = 1280) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

async function enregistrerFiche() {
  const err = $('#fi-err');
  const immat = FI.sim ? $('#fi-reg').value.trim() : formaterImmat($('#fi-reg').value);
  if (!immat) { err.textContent = FI.sim ? 'Donne un nom au simulateur.' : "L'immatriculation est obligatoire."; return; }
  if (!FI.sim) {
    if (!FI.equipage) { err.textContent = 'Choisis monopilote ou multipilote.'; return; }
    if (FI.equipage === 'SP' && !FI.moteurs) { err.textContent = 'Monopilote : choisis monomoteur (SE) ou multimoteur (ME).'; return; }
    if (!FI.moteur) { err.textContent = 'Choisis la motorisation.'; return; }
  }
  const doublon = parImmat(immat);
  if (doublon && doublon !== fiAvion) { err.textContent = immat + ' existe déjà.'; return; }
  const etiquettes = FI.sim ? [] : [...FI.etiquettes];
  const hex = $('#fi-hex').value.trim().toLowerCase();
  if (hex && !/^[0-9a-f]{6}$/.test(hex)) { err.textContent = 'Code ADS-B : 6 caractères (chiffres 0-9 et lettres A-F).'; return; }
  const hexManuel = (fiAvion ? (fiAvion.hexAdsb || '') : '') !== hex || !!(fiAvion && fiAvion.hexAdsbManuel);
  const o = $('#fi-oaci').value.toUpperCase().trim(), t = types.get(o);
  const a = Object.assign(fiAvion ? { ...fiAvion } : avionVide(), {
    immat, sim: FI.sim, typeOACI: FI.sim ? 'SIM' : o, constructeur: t ? t.constructeur : (FI.constructeur || ''),
    modele: FI.sim ? ($('#fi-mod').value.trim() || immat) : ($('#fi-mod').value.trim() || o),
    indicatif: $('#fi-ind').value.trim().toUpperCase(), nom: $('#fi-nm').value.trim().toUpperCase(), etiquettes,
    remarques: $('#fi-rem').value.trim(), photo: FI.photo || null, photoCredit: FI.photo ? (FI.photoCredit || null) : null,
    photoCadre: FI.photo ? (FI.photoCadre || null) : null, hexAdsb: FI.sim ? '' : hex, hexAdsbManuel: hexManuel,
    equipage: FI.sim ? null : FI.equipage, moteurs: FI.sim ? null : (FI.equipage === 'MP' ? 'ME' : FI.moteurs),
    moteur: FI.sim ? null : FI.moteur, surface: FI.surface, train: FI.train, fstd: FI.sim ? (FI.fstd || null) : null,
  });
  await enregistrerAvion(a);
  stats = null;
  fermerFiche(); $('#add1').hidden = true;
  if (fiOrigine === 'flotte') {         // crayon de « Tous mes avions » : on revient à la liste
    rendreFlotte(); onModifie(a); toast(a.immat + ' enregistré'); return;
  }
  fermerFlotte();
  $('#ac-q').value = ''; rechercheRapide();
  if (fiAvion) { onModifie(a); toast(a.immat + ' enregistré'); return; }
  if (!$('#v-saisie').hidden) { onChoix(a); toast(a.immat + ' enregistré et choisi pour ce vol'); }
  else toast(a.immat + ' enregistré');
}

export function initAvions({ choix, courant, modifie }) {
  onChoix = choix; avionCourant = courant; onModifie = modifie || (() => {});
  $('#ac-q').addEventListener('input', rechercheRapide);
  $('#ac-res').addEventListener('click', e => {
    const b = e.target.closest('[data-ac]');
    if (b) { onChoix(etat.avions.get(b.dataset.ac)); $('#ac-q').value = ''; rechercheRapide(); return; }
    if (e.target.closest('[data-all]')) ouvrirFlotte($('#ac-q').value);
    if (e.target.closest('[data-new]')) ouvrirAjout($('#ac-q').value);
  });
  $('#ac-all').addEventListener('click', () => ouvrirFlotte(''));
  $('#ac-add').addEventListener('click', () => ouvrirAjout($('#ac-q').value));
  $('#fl-x').addEventListener('click', fermerFlotte);
  $('#fl-q').addEventListener('input', rendreFlotte);
  $('#fl-list').addEventListener('click', e => {
    const ed = e.target.closest('[data-ed]');
    if (ed) { calculerStats(); ouvrirFiche(etat.avions.get(ed.dataset.ed), {}, 'modif', 'flotte'); return; }
    const b = e.target.closest('[data-ac]');
    if (!b) return;
    const a = etat.avions.get(b.dataset.ac);
    if ($('#v-saisie').hidden) { ouvrirFiche(a, {}, 'lecture', 'flotte'); return; } // depuis Plus : fiche en lecture
    onChoix(a); $('#ac-q').value = ''; rechercheRapide(); fermerFlotte();
  });
  $('#sf-main').addEventListener('click', () => menuPlus($('#sf-menu').hidden));
  $('#sf-veil').addEventListener('click', () => menuPlus(false));
  $('#sf-ac').addEventListener('click', () => { menuPlus(false); ouvrirAjout(''); });
  $('#sf-sim').addEventListener('click', () => { menuPlus(false); ouvrirFiche(null, { sim: true }); });
  $('#a1-reg').addEventListener('input', verifierAjout);
  $('#a1-reg').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('#a1-go').disabled) $('#a1-go').click(); });
  $('#a1-x').addEventListener('click', () => { $('#add1').hidden = true; });
  $('#a1-go').addEventListener('click', () => {
    const r = formaterImmat($('#a1-reg').value), a = parImmat(r);
    $('#add1').hidden = true;
    ouvrirFiche(a || null, a ? {} : { immat: r });
  });
  $('#fi-x').addEventListener('click', fermerFiche);
  $('#ac-fiche').addEventListener('click', () => { const a = etat.avions.get(avionCourant()); if (a) ouvrirFiche(a, {}, 'lecture', 'saisie'); else toast('Choisis d\'abord un avion'); });
  $('#fi-ed').addEventListener('click', () => modeFiche(false));
  $('#fi-tgs').addEventListener('click', e => {
    const b = e.target.closest('[data-ft]');
    if (!b || $('#fiche').classList.contains('ro')) return;
    const t = b.dataset.ft;
    FI.etiquettes = FI.etiquettes.includes(t) ? FI.etiquettes.filter(x => x !== t) : [...FI.etiquettes, t];
    rendreEtiquettesFiche();
  });
  $('#fi-oaci').addEventListener('input', () => { $('#fi-oaci').value = $('#fi-oaci').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); ligneType(); });
  segs('#fi-kind', (b, i) => { FI.sim = i === 1; genreFiche(); });
  segs('#fi-pil', (b, i) => { FI.equipage = i ? 'MP' : 'SP'; if (FI.equipage === 'MP') FI.moteurs = 'ME'; boutonsFiche(); });
  segs('#fi-eng', (b, i) => { FI.moteurs = i ? 'ME' : 'SE'; boutonsFiche(); });
  segs('#fi-mot', (b, i) => { FI.moteur = 'PTJ'[i]; });
  segs('#fi-surf', (b, i) => { FI.surface = 'LAH'[i]; });
  segs('#fi-tw', (b, i) => { FI.train = i ? 'classique' : 'tricycle'; FI.etiquettes = etiquettesPourTrain(FI.etiquettes, FI.train); rendreEtiquettesFiche(); });
  segs('#fi-fstd', (b, i) => { FI.fstd = ['FFS', 'FTD', 'FNPT II'][i]; });
  $('#fi-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      FI.photo = await reduirePhoto(f);
      FI.photoCredit = null; FI.photoCadre = null; // nouvelle photo : pas encore de cadrage (centrée)
      afficherPhotoFiche();
      afficherCredit();
      recadrer(); // v0.38 (R93) : la fenêtre « Recadrer la photo » s'ouvre tout de suite
    } catch { toast('Photo illisible'); }
    e.target.value = '';
  });
  $('#fi-save').addEventListener('click', enregistrerFiche);
  $('#fi-rc').addEventListener('click', recadrer);
  suivreBandeau(document.querySelector('#fiche .fphoto'));
  // v0.21 (R34) : photo trouvée sur Internet, choisie par le pilote (gardée à « Enregistrer »)
  initPhotoWeb();
  $('#fi-web').addEventListener('click', () => {
    const immat = formaterImmat($('#fi-reg').value);
    if (!immat) { $('#fi-err').textContent = "Donne d'abord l'immatriculation."; return; }
    $('#fi-err').textContent = '';
    ouvrirRecherchePhoto({
      immat, avion: { typeOACI: $('#fi-oaci').value.trim().toUpperCase(), modele: $('#fi-mod').value.trim(), constructeur: FI.constructeur || '' },
      reduirePhoto,
      choisir: (photo, credit) => {
        FI.photo = photo; FI.photoCredit = credit; FI.photoCadre = null;
        afficherPhotoFiche();
        afficherCredit();
        toast('Photo choisie : appuie sur Enregistrer pour la garder', 2600);
        // v0.38 (R93) : photo prise ou choisie dans la galerie (à moi, sans crédit) : recadrage tout de suite, comme l'appareil photo
        if (!credit) recadrer();
      },
    });
  });
}

export const invaliderStats = () => { stats = null; };
