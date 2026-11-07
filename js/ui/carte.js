// « Carte du vol » : trace ADS-B (archives adsb.lol récupérées chaque nuit par le VPS), affichage seulement.
// - Une seule demande réseau à la fois, discrète ; jamais de message d'erreur intrusif.
// - La trace découpée aux heures bloc est rangée sur le téléphone : ensuite, elle s'affiche sans réseau.
// - Fond OpenStreetMap avec du réseau ; sans réseau, fond neutre avec la trace et les terrains.
// - Bibliothèque Leaflet incluse dans l'app (vendor/leaflet), chargée seulement à la première carte.
// - v0.15 : positions des feux reçues de NPF-Q400 (vol.feuxPositions) : flamme rouge + commune, avec ou sans trace
//   ADS-B (utile à La Réunion), sans réseau aussi. Elles ne modifient jamais les heures.

import { $, esc, toast, ouvrirOutil, fermerOutil } from './commun.js';
import { etat, reglage, enregistrerReglage, enregistrerAvions, lireTrace, ecrireTrace, avionDe } from '../etat.js';
import { terrain } from '../terrains.js';
import { aujourdhui, dateFr } from '../temps.js';
import { etatCarte, decouper, signatureTrace, codeAvion, volsRecents, joursTrace, SOURCE } from '../traces.js';

// Adresse du serveur (déjà publique dans les apps NPF-Q400). Les tests la remplacent par un faux serveur local.
const SERVEUR = () => globalThis.CARNET_SERVEUR_TRACES || 'https://vps-3c305ff2.vps.ovh.net/carnet-traces/';
const TUILES = () => globalThis.CARNET_TUILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const UTILISATEUR = 'carnet';
const motDePasse = () => reglage('cartesMotDePasse') || '';
const enLigne = () => navigator.onLine !== false;

// ---------- Réseau : une seule demande à la fois ----------
let chaine = Promise.resolve();
const enFile = fn => (chaine = chaine.then(fn, fn));

// { statut: 'ok', json } | { statut: 'refuse' } | { statut: 'reseau' }
async function demander(chemin, mdp = motDePasse()) {
  if (!enLigne()) return { statut: 'reseau' };
  try {
    const r = await fetch(SERVEUR() + chemin, {
      headers: { Authorization: 'Basic ' + btoa(`${UTILISATEUR}:${mdp}`) }, cache: 'no-store',
    });
    if (r.status === 401) return { statut: 'refuse' };
    if (!r.ok) return { statut: r.status === 404 ? 'absent' : 'reseau' };
    return { statut: 'ok', json: await r.json() };
  } catch { return { statut: 'reseau' }; }
}

// ---------- Index du serveur (jours lus, traces disponibles, codes ADS-B) ----------
let index = null, indexLu = 0;
async function indexStocke() {
  if (!index) { const r = await lireTrace('__index__'); if (r) { index = r.index; indexLu = 0; } }
  return index;
}
async function obtenirIndex(forcer = false) {
  await indexStocke();
  if (!motDePasse() || (!forcer && index && Date.now() - indexLu < 30 * 60000)) return index;
  const r = await demander('index.json');
  if (r.statut === 'ok') {
    index = r.json; indexLu = Date.now();
    await ecrireTrace({ id: '__index__', index, majLe: new Date().toISOString() });
    await remplirCodes(index);
  }
  return index;
}

// Codes ADS-B reçus du serveur -> fiche avion (seulement si le champ est vide et pas modifié à la main)
async function remplirCodes(ix) {
  const modifies = [];
  for (const a of etat.avions.values()) {
    if (a.sim || a.hexAdsb || a.hexAdsbManuel) continue;
    const h = ix && ix.avions && ix.avions[a.immat];
    if (h && /^[0-9a-f]{6}$/i.test(h)) modifies.push({ ...a, hexAdsb: h.toLowerCase() });
  }
  if (modifies.length) await enregistrerAvions(modifies);
}

// ---------- Trace d'un vol ----------
async function etatDuVol(vol) {
  const stockee = vol && vol.id ? await lireTrace(vol.id) : null;
  const e = etatCarte({ vol, avion: avionDe(vol || {}), motDePasse: motDePasse(), index, stockee, aujourdhui: aujourdhui() });
  return { ...e, stockee };
}

// Télécharge les fichiers du jour (ou des deux jours) et garde la partie entre les heures bloc
async function telechargerTrace(vol) {
  const avion = avionDe(vol), hex = codeAvion(avion, index);
  const dispo = (index.traces && index.traces[hex]) || [];
  const fichiers = [];
  for (const jour of joursTrace(vol).filter(j => dispo.includes(j))) {
    const r = await demander(`traces/${hex}/${jour}.json`);
    if (r.statut === 'ok') fichiers.push({ jour, points: r.json.points });
    else if (r.statut !== 'absent') return null; // réseau / mot de passe : on réessaiera plus tard
  }
  const points = decouper(fichiers, vol);
  const rec = { id: vol.id, sig: signatureTrace(vol, hex), etat: points.length ? 'ok' : 'absente', points, majLe: new Date().toISOString() };
  await ecrireTrace(rec);
  return rec;
}

// Prépare la carte d'un vol (sans jamais bloquer) : renvoie { code, texte, stockee }
export function preparerVol(vol) {
  return enFile(async () => {
    await obtenirIndex();
    let e = await etatDuVol(vol);
    if (e.code === 'aTelecharger' && enLigne()) {
      const rec = await telechargerTrace(vol);
      if (rec) e = await etatDuVol(vol);
    }
    return e;
  });
}

// En arrière-plan à l'ouverture de l'app : vols des 30 derniers jours sans trace
export function lancerArrierePlan() {
  if (!motDePasse() || !enLigne()) return;
  enFile(async () => {
    await obtenirIndex(true);
    for (const v of volsRecents(etat.vols, aujourdhui())) {
      const e = await etatDuVol(v);
      if (e.code === 'aTelecharger') await telechargerTrace(v);
    }
  });
}

// ---------- Dessin (Leaflet) ----------
let leaflet = null;
function chargerLeaflet() {
  if (leaflet) return leaflet;
  leaflet = new Promise((ok, ko) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => ok(window.L);
    s.onerror = () => { leaflet = null; ko(new Error('carte indisponible')); };
    document.head.appendChild(s);
  });
  return leaflet;
}

function terrainsDuVol(vol) {
  const codes = [vol.dep, ...(vol.escales || []).map(e => e.code), vol.arr].filter(Boolean);
  const connus = [...new Set(codes)].map(c => terrain(c)).filter(t => t && t.lat != null);
  // v0.17 : pélicandrome sans code (position envoyée par NPF) et arrivée sans code (arriveePosition)
  const sansCode = (vol.escales || []).filter(e => !terrain(e.code) && typeof e.lat === 'number' && typeof e.lon === 'number')
    .map(e => ({ code: e.nom || e.code || 'Escale', lat: e.lat, lon: e.lon }));
  const p = vol.arriveePosition;
  if (p && typeof p.lat === 'number' && typeof p.lon === 'number' && !terrain(vol.arr)) sansCode.push({ code: vol.arr || 'Arrivée', lat: p.lat, lon: p.lon });
  return [...connus, ...sansCode];
}

// Flamme rouge (dessin de l'app, pas d'image à télécharger)
const FLAMME = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="#d32f2f" stroke="#fff" stroke-width="1.2" d="M12 2c1 3.2-.6 4.9-2 6.6C8.6 10.3 7 12 7 14.8 7 18.2 9.3 21 12 21s5-2.6 5-6c0-2.4-1.2-4.1-2.4-5.4-.2 1.6-.8 2.8-1.8 3.4.3-3.6-.5-7.6-.8-10z"/></svg>';
const feuxDuVol = vol => ((vol && vol.feuxPositions) || []).filter(f => typeof f.lat === 'number' && typeof f.lon === 'number');
// Positions envoyées par NPF-Q400 à montrer même sans trace ADS-B : feux, arrivée sans code, pélicandromes sans code
const positionsNpf = vol => !!vol && (feuxDuVol(vol).length > 0
  || (vol.arriveePosition && typeof vol.arriveePosition.lat === 'number' && !terrain(vol.arr))
  || (vol.escales || []).some(e => !terrain(e.code) && typeof e.lat === 'number'));

async function dessiner(conteneur, vol, points, interactif) {
  const L = await chargerLeaflet();
  if (conteneur._carte) { conteneur._carte.remove(); conteneur._carte = null; }
  const carte = L.map(conteneur, {
    zoomControl: interactif, attributionControl: true, dragging: interactif, touchZoom: interactif,
    scrollWheelZoom: interactif, doubleClickZoom: interactif, boxZoom: false, keyboard: interactif, tap: false,
  });
  conteneur._carte = carte;
  carte.attributionControl.setPrefix(false);
  const avecFond = enLigne();
  conteneur.classList.toggle('sans-fond', !avecFond);
  if (avecFond) {
    L.tileLayer(TUILES(), { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(carte);
  }
  const bornes = L.latLngBounds([]);
  if (points.length) bornes.extend(L.polyline(points.map(p => [p[1], p[2]]), { color: '#1f6fd1', weight: interactif ? 4 : 3, opacity: 0.9 }).addTo(carte).getBounds());
  for (const f of feuxDuVol(vol)) {
    const m = L.marker([f.lat, f.lon], { icon: L.divIcon({ className: 'carte-feu', html: FLAMME, iconSize: [24, 24], iconAnchor: [12, 22] }), keyboard: false });
    const nom = f.commune || f.nom || 'Feu';
    m.bindTooltip(nom, { permanent: true, direction: 'right', offset: [8, -10], className: 'carte-feu-nom' }).addTo(carte);
    bornes.extend([f.lat, f.lon]);
  }
  for (const t of terrainsDuVol(vol)) {
    L.circleMarker([t.lat, t.lon], { radius: 5, color: '#13202e', weight: 2, fillColor: '#ffffff', fillOpacity: 1 })
      .bindTooltip(t.code, { permanent: true, direction: 'top', offset: [0, -6], className: 'carte-terrain' }).addTo(carte);
  }
  for (const t of terrainsDuVol(vol)) bornes.extend([t.lat, t.lon]);
  if (bornes.isValid()) carte.fitBounds(bornes, { paddingTopLeft: [28, 48], paddingBottomRight: [110, 24], maxZoom: 12 });
  else carte.setView([46.5, 2.5], 5);
  return carte;
}

// ---------- Bloc « Carte du vol » de la saisie ----------
let volAffiche = null;
export async function afficherCarteVol(vol) {
  volAffiche = vol;
  const mini = $('#carte-mini'), txt = $('#carte-txt');
  mini.hidden = true; txt.textContent = '';
  $('#carte-source').textContent = SOURCE;
  if (!vol) { txt.textContent = (await etatDuVol(null)).texte; return; }
  const feux = positionsNpf(vol) ? [1] : []; // v0.17 : feux, arrivée ou pélicandrome sans code (positions NPF)
  // Brouillon NPF pas encore enregistré : seulement les positions reçues
  if (vol.brouillon && !vol.id) {
    if (!feux.length) { txt.textContent = (await etatDuVol(null)).texte; return; }
    return dessinerFeux(vol, feuxDuVol(vol).length ? 'Positions des feux envoyées par NPF-Q400.' : 'Positions envoyées par NPF-Q400.');
  }
  // Texte immédiat (sans réseau), puis la suite quand la demande au serveur est finie
  let e = await etatDuVol(vol);
  if (volAffiche !== vol) return;
  if (e.code !== 'ok') txt.textContent = e.code === 'aTelecharger' || e.code === 'horsLigne' ? 'Recherche de la trace…' : e.texte;
  const titreNpf = feuxDuVol(vol).length ? 'Positions des feux (NPF-Q400) · ' : 'Positions (NPF-Q400) · ';
  if (e.code !== 'ok' && feux.length) await dessinerFeux(vol, titreNpf + (e.code === 'aTelecharger' ? TEXTE_RESEAU : e.texte));
  if (e.code !== 'ok') e = await preparerVol(vol);
  if (volAffiche !== vol) return;
  if (e.code === 'ok') {
    txt.textContent = '';
    mini.hidden = false;
    try { await dessiner(mini, vol, e.stockee.points, false); } catch { mini.hidden = true; txt.textContent = 'Carte indisponible.'; }
  } else if (feux.length) await dessinerFeux(vol, titreNpf + (e.code === 'aTelecharger' ? TEXTE_RESEAU : e.texte));
  else txt.textContent = e.code === 'aTelecharger' ? TEXTE_RESEAU : e.texte;
}
// Carte avec les seules positions des feux (pas de trace ADS-B)
async function dessinerFeux(vol, texte) {
  const mini = $('#carte-mini'), txt = $('#carte-txt');
  if (volAffiche !== vol) return;
  txt.textContent = texte;
  mini.hidden = false;
  try { await dessiner(mini, vol, [], false); } catch { mini.hidden = true; txt.textContent = 'Carte indisponible.'; }
}
const TEXTE_RESEAU = 'La carte s\'affichera quand le téléphone aura du réseau.';

async function pleinEcran() {
  if (!volAffiche || $('#carte-mini').hidden) return;
  const e = volAffiche.brouillon && !volAffiche.id ? { code: 'brouillon' } : await etatDuVol(volAffiche);
  if (e.code !== 'ok' && !positionsNpf(volAffiche)) return;
  $('#carte-plein').hidden = false;
  $('#cp-t').textContent = `${dateFr(volAffiche.date)} · ${[volAffiche.dep, ...(volAffiche.escales || []).map(x => x.code), volAffiche.arr].filter(Boolean).join(' → ')}`;
  await dessiner($('#carte-grande'), volAffiche, e.code === 'ok' ? e.stockee.points : [], true);
}

// ---------- Plus › Cartes de vol ----------
// Sous-titre de la ligne « Cartes de vol » dans Plus (sans réseau : index déjà rangé sur le téléphone)
export async function resumeCartes() {
  if (!motDePasse()) return 'Mot de passe à saisir · traces ADS-B';
  let ix = null;
  try { ix = await indexStocke(); } catch { /* base indisponible */ }
  const r = ix && ix.rattrapage;
  if (r && r.reste > 0) return `Mot de passe · rattrapage ${r.reste} j restants`;
  if (r) return 'Mot de passe · traces à jour';
  return 'Mot de passe · traces ADS-B';
}

function ecranCartes() {
  const ix = index;
  const avecCode = [...etat.avions.values()].filter(a => !a.sim && codeAvion(a, null)).length;
  const reel = [...etat.avions.values()].filter(a => !a.sim).length;
  const etatServeur = ix ? `Dernière archive lue par le serveur : ${dateFr(ix.derniereArchive)} · `
    + `${Object.keys(ix.traces || {}).length} avion(s) avec des traces`
    + (ix.rattrapage ? ` · rattrapage : ${ix.rattrapage.reste} jour(s) restant(s) sur ${ix.rattrapage.total}` : '') : 'Pas encore de contact avec le serveur.';
  const c = ouvrirOutil('Cartes de vol', `<div class="sec">
      <p class="hint" style="font-size:15px">La carte d'un vol montre sa trace ADS-B (archives adsb.lol, récupérées chaque nuit par ton serveur). Elle sert seulement à voir le vol : elle ne change jamais tes heures.</p>
      <div class="field"><label for="cv-mdp">Mot de passe des cartes</label><input id="cv-mdp" type="password" autocomplete="off" value="${esc(motDePasse())}"></div>
      <div class="row2"><button type="button" class="ghost" id="cv-test">Tester</button><button type="button" class="ghost primary" id="cv-ok">Enregistrer</button></div>
      <p id="cv-res" class="hint" role="status"></p>
      <p class="hint">Gardé seulement sur ce téléphone : il n'est ni dans le tableur CSV, ni dans la sauvegarde de secours (à retaper après une restauration sur un autre téléphone).</p>
    </div>
    <div class="sec"><h3>État</h3>
      <p id="cv-etat">${esc(etatServeur)}</p>
      <p class="hint">Codes ADS-B : ${avecCode} avion(s) sur ${reel} (remplis depuis le serveur, modifiables dans la fiche avion).</p>
      <p class="hint">${esc(SOURCE)} · fond de carte © OpenStreetMap.</p>
    </div>`);
  const tester = async () => {
    const res = c.querySelector('#cv-res');
    res.textContent = 'Test en cours…';
    const r = await demander('index.json', c.querySelector('#cv-mdp').value);
    res.textContent = r.statut === 'ok' ? 'OK : le serveur répond.' : r.statut === 'refuse' ? 'Mot de passe refusé.' : 'Pas de réseau (ou serveur injoignable).';
    res.className = r.statut === 'ok' ? 'okc' : 'koc';
    return r;
  };
  c.querySelector('#cv-test').addEventListener('click', tester);
  c.querySelector('#cv-ok').addEventListener('click', async () => {
    await enregistrerReglage('cartesMotDePasse', c.querySelector('#cv-mdp').value);
    index = null; indexLu = 0;
    toast('Mot de passe enregistré');
    fermerOutil();
    lancerArrierePlan();
  });
}

export function initCarte() {
  $('#carte-mini').addEventListener('click', pleinEcran);
  $('#carte-zone').addEventListener('keydown', e => { if (e.key === 'Enter') pleinEcran(); });
  $('#cp-x').addEventListener('click', () => {
    $('#carte-plein').hidden = true;
    const g = $('#carte-grande');
    if (g._carte) { g._carte.remove(); g._carte = null; }
  });
  $('#pl-cartes').addEventListener('click', ecranCartes);
}

// Pour les tests
export const _interne = { obtenirIndex, remplirCodes };
