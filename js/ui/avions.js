// Avions : recherche rapide dans la saisie, « Tous mes avions », « Ajouter un avion », fiche avion.

import { $, esc, segs, choisir, toast } from './commun.js';
import { etat, enregistrerAvion } from '../etat.js';
import { avionVide, formaterImmat, texteColonneAvion } from '../modele.js';
import { TYPES, indexTypes, caracteristiquesDuType, MOTEUR, SURFACE } from '../types-avion.js';
import { normaliser } from '../missions.js';
import { hm, dateFr } from '../temps.js';
import { calculerTotaux } from '../totaux.js';

export const SIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
export const SIMI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v12H3zm2 2v8h14V6zm3 12h8v2H8zM10 8l5 2-5 2z"/></svg>';

let types = indexTypes(TYPES);
export function definirTypes(liste) { types = indexTypes(liste); }
export const typesConnus = () => types;

let onChoix = () => {};          // avion choisi pour le vol en cours
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

export function itemAvion(a) {
  const s = (stats && stats[a.id]) || { minutes: 0, vols: 0 };
  const nm = a.nom || a.indicatif;
  return `<button type="button" class="acitem" data-ac="${esc(a.id)}" aria-current="${a.id === avionCourant()}"><div class="acph">${photo(a)}</div><div><div class="t1">${esc(a.immat)}${nm ? `<span class="nm">${esc(nm)}</span>` : ''}</div><div class="t2">${a.sim ? 'Simulateur' : esc(a.modele || a.typeOACI)}</div><div class="tg">${pastilles(a)}</div></div><div class="hrs">${hm(s.minutes)}<small>${s.vols} vol${s.vols > 1 ? 's' : ''}</small></div></button>`;
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
  const m = avionsTries().filter(a => meule(a).includes(q));
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
  for (const a of m) { const k = a.sim ? 'SIMULATEURS' : (a.typeOACI || '?'); (g[k] = g[k] || []).push(a); }
  const cles = Object.keys(g).sort((x, y) => (x === 'SIMULATEURS' ? 1 : y === 'SIMULATEURS' ? -1 : x.localeCompare(y)));
  $('#fl-n').textContent = `${m.length} avion${m.length > 1 ? 's' : ''}` + (q ? ` trouvé${m.length > 1 ? 's' : ''}` : ` · ${cles.length} type${cles.length > 1 ? 's' : ''}`);
  const min = a => (stats[a.id] && stats[a.id].minutes) || 0;
  $('#fl-list').innerHTML = cles.map(k => {
    const L = g[k].sort((x, y) => min(y) - min(x));
    const tot = L.reduce((s, a) => s + min(a), 0);
    return `<div class="grp"><span>${esc(k)}</span><span>${hm(tot)}</span></div><div class="flist">${L.map(itemAvion).join('')}</div>`;
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
  $('#sf-main').textContent = o ? '×' : '+';
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
    boutonsFiche();
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
  $('#fi-tl').hidden = sim; $('#fi-ind-z').hidden = sim;
  if (!FI.photo) $('#fi-img').innerHTML = sim ? SIMI : SIL;
  ligneType();
}

export function ouvrirFiche(a, init = {}) {
  fiAvion = a || null;
  const b = a ? { ...a } : Object.assign(avionVide(), init);
  FI = { sim: !!b.sim, equipage: b.equipage, moteurs: b.moteurs, moteur: b.moteur, surface: b.surface || 'L',
    train: b.train || 'tricycle', photo: b.photo, fstd: b.fstd, constructeur: b.constructeur, _o: b.typeOACI };
  $('#fi-reg').value = b.immat; $('#fi-oaci').value = b.sim ? '' : (b.typeOACI || '');
  $('#fi-mod').value = b.modele || ''; $('#fi-ind').value = b.indicatif || ''; $('#fi-nm').value = b.nom || '';
  $('#fi-tags').value = (b.etiquettes || []).join(', '); $('#fi-rem').value = b.remarques || '';
  $('#fi-img').innerHTML = b.photo ? `<img src="${b.photo}" alt="Photo de ${esc(b.immat)}">` : (b.sim ? SIMI : SIL);
  if (!stats) calculerStats();
  const s = a && stats[a.id];
  $('#fi-stat').textContent = s && s.vols ? `${hm(s.minutes)} sur cet ${a.sim ? 'simulateur' : 'avion'} · ${s.vols} vol${s.vols > 1 ? 's' : ''} · dernier vol ${dateFr(s.dernier)}` : '';
  $('#fi-err').textContent = '';
  boutonsFiche(); genreFiche();
  $('#fiche').hidden = false; $('#fi-save').hidden = false; $('#fiche').scrollTop = 0;
  if (!a && !b.immat) setTimeout(() => $('#fi-reg').focus(), 50);
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
  const etiquettes = $('#fi-tags').value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  if (!FI.sim && FI.train === 'classique' && !etiquettes.includes('TAILWHEEL')) etiquettes.push('TAILWHEEL');
  const o = $('#fi-oaci').value.toUpperCase().trim(), t = types.get(o);
  const a = Object.assign(fiAvion ? { ...fiAvion } : avionVide(), {
    immat, sim: FI.sim, typeOACI: FI.sim ? 'SIM' : o, constructeur: t ? t.constructeur : (FI.constructeur || ''),
    modele: FI.sim ? ($('#fi-mod').value.trim() || immat) : ($('#fi-mod').value.trim() || o),
    indicatif: $('#fi-ind').value.trim().toUpperCase(), nom: $('#fi-nm').value.trim(), etiquettes,
    remarques: $('#fi-rem').value.trim(), photo: FI.photo || null,
    equipage: FI.sim ? null : FI.equipage, moteurs: FI.sim ? null : (FI.equipage === 'MP' ? 'ME' : FI.moteurs),
    moteur: FI.sim ? null : FI.moteur, surface: FI.surface, train: FI.train, fstd: FI.sim ? (FI.fstd || null) : null,
  });
  await enregistrerAvion(a);
  stats = null;
  fermerFiche(); fermerFlotte(); $('#add1').hidden = true;
  $('#ac-q').value = ''; rechercheRapide();
  onChoix(a);
  toast(a.immat + (fiAvion ? ' enregistré' : ' enregistré et choisi pour ce vol'));
}

export function initAvions({ choix, courant }) {
  onChoix = choix; avionCourant = courant;
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
    const b = e.target.closest('[data-ac]');
    if (!b) return;
    const a = etat.avions.get(b.dataset.ac);
    if ($('#v-saisie').hidden) { ouvrirFiche(a); return; } // depuis Plus : on ouvre la fiche
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
  $('#ac-fiche').addEventListener('click', () => { const a = etat.avions.get(avionCourant()); if (a) ouvrirFiche(a); });
  $('#fi-oaci').addEventListener('input', () => { $('#fi-oaci').value = $('#fi-oaci').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); ligneType(); });
  segs('#fi-kind', (b, i) => { FI.sim = i === 1; genreFiche(); });
  segs('#fi-pil', (b, i) => { FI.equipage = i ? 'MP' : 'SP'; if (FI.equipage === 'MP') FI.moteurs = 'ME'; boutonsFiche(); });
  segs('#fi-eng', (b, i) => { FI.moteurs = i ? 'ME' : 'SE'; boutonsFiche(); });
  segs('#fi-mot', (b, i) => { FI.moteur = 'PTJ'[i]; });
  segs('#fi-surf', (b, i) => { FI.surface = 'LAH'[i]; });
  segs('#fi-tw', (b, i) => { FI.train = i ? 'classique' : 'tricycle'; });
  segs('#fi-fstd', (b, i) => { FI.fstd = ['FFS', 'FTD', 'FNPT II'][i]; });
  $('#fi-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      FI.photo = await reduirePhoto(f);
      $('#fi-img').innerHTML = `<img src="${FI.photo}" alt="">`;
    } catch { toast('Photo illisible'); }
    e.target.value = '';
  });
  $('#fi-save').addEventListener('click', enregistrerFiche);
}

export const invaliderStats = () => { stats = null; };
