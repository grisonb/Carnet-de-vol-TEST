// « Carte du vol » : trace ADS-B (archives adsb.lol récupérées chaque nuit par le VPS), affichage seulement.
// - Une seule demande réseau à la fois, discrète ; jamais de message d'erreur intrusif.
// - La trace découpée aux heures bloc est rangée sur le téléphone : ensuite, elle s'affiche sans réseau.
// - Fond OpenStreetMap avec du réseau ; sans réseau, fond neutre avec la trace et les terrains.
// - Bibliothèque Leaflet incluse dans l'app (vendor/leaflet), chargée seulement à la première carte.
// - v0.15 : positions des feux reçues de NPF-Q400 (vol.feuxPositions) : flamme rouge + commune, avec ou sans trace
//   ADS-B (utile à La Réunion), sans réseau aussi. Elles ne modifient jamais les heures.
// - v0.31 (R72) : plein écran : appui long (0,6 s) sur une flamme = la déplacer au doigt, puis « Déplacer le feu ici ? » ;
//   toucher une flamme = bulle « Supprimer ce feu ». Commune recalculée (géocodage inverse IGN Géoplateforme, gratuit,
//   sans clé ; hors ligne : au retour du réseau). Ni heures, ni compteurs, ni mission ne changent. Le vol est marqué
//   `feuxRetouches` : un nouvel envoi NPF-Q400 du même vol ne remet pas les positions sans qu'on le demande.
// - v0.31 (R73) : fond Plan (OpenStreetMap) ou Photo (photos aériennes IGN, ORTHOIMAGERY.ORTHOPHOTOS), en ligne
//   seulement ; jamais gardées dans le cache hors ligne (le service worker ne garde que les fichiers de l'app).

import { $, esc, toast, ouvrirOutil, fermerOutil } from './commun.js';
import { etat, reglage, enregistrerReglage, enregistrerAvions, lireTrace, ecrireTrace, avionDe, enregistrerVol, enConsultation, ecrireReglageDiscret } from '../etat.js';
import { terrain } from '../terrains.js';
import { aujourdhui, dateFr } from '../temps.js';
import { etatCarte, decouper, signatureTrace, codeAvion, volsRecents, joursTrace, SOURCE } from '../traces.js';

// Adresse du serveur (déjà publique dans les apps NPF-Q400). Les tests la remplacent par un faux serveur local.
const SERVEUR = () => globalThis.CARNET_SERVEUR_TRACES || 'https://vps-3c305ff2.vps.ovh.net/carnet-traces/';
const TUILES = () => globalThis.CARNET_TUILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// v0.31 : services publics de l'IGN (Géoplateforme, gratuits, sans clé) ; les tests les remplacent par un faux serveur
const TUILES_PHOTO = () => globalThis.CARNET_TUILES_PHOTO || 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
  + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}&FORMAT=image/jpeg';
const GEOCODAGE = () => globalThis.CARNET_GEOCODAGE || 'https://data.geopf.fr/geocodage/';
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

// ---------- v0.31 (R73) : fond Plan / Photo ----------
const fondVoulu = () => (reglage('carteFond') === 'photo' ? 'photo' : 'plan');
const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const ATTR_IGN = '© <a href="https://www.ign.fr/" target="_blank" rel="noopener">IGN</a>';
const MSG_PHOTO = 'Photo aérienne disponible en ligne seulement';
function poserFond(L, carte, conteneur) {
  if (carte._fond) { carte.removeLayer(carte._fond); carte._fond = null; }
  const avecFond = enLigne(), photo = fondVoulu() === 'photo';
  conteneur.classList.toggle('sans-fond', !avecFond);
  if (avecFond) {
    carte._fond = photo
      ? L.tileLayer(TUILES_PHOTO(), { maxZoom: 19, attribution: ATTR_IGN, className: 'fond-photo' })
      : L.tileLayer(TUILES(), { maxZoom: 18, attribution: ATTR_OSM, className: 'fond-plan' });
    carte._fond.addTo(carte);
  }
  if (conteneur.id === 'carte-grande') {
    $('#cp-msg').textContent = photo && !avecFond ? MSG_PHOTO : '';
    for (const b of document.querySelectorAll('#cp-fond button')) b.setAttribute('aria-pressed', String(b.dataset.fond === fondVoulu()));
  }
}

// ---------- v0.31 (R72) : commune d'une position (géocodage inverse IGN : parcelle cadastrale la plus proche) ----------
// { statut: 'ok', commune } | { statut: 'reseau' }
export async function communeDe(lat, lon) {
  if (!enLigne()) return { statut: 'reseau' };
  const lire = async index => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`${GEOCODAGE()}reverse?lon=${lon}&lat=${lat}&index=${index}&limit=1`, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return { city: String((j.features && j.features[0] && j.features[0].properties && j.features[0].properties.city) || '').trim() };
    } finally { clearTimeout(t); }
  };
  try {
    let r = await lire('parcel');
    if (!r) return { statut: 'reseau' };
    if (!r.city) r = (await lire('address')) || r; // pas de parcelle tout près : l'adresse la plus proche
    return { statut: 'ok', commune: r.city };
  } catch { return { statut: 'reseau' }; }
}

const arrondi = x => Math.round(x * 1e6) / 1e6;
const nomFeu = f => (f.communeAVenir ? 'Commune : au retour du réseau' : f.commune || f.nom || 'Feu');
const volParId = id => etat.vols.find(v => v.id === id) || null;
const peutModifierFeux = vol => !!vol && !!vol.id && !vol.brouillon && !enConsultation() && !!volParId(vol.id);

// Fenêtre de l'app (jamais celle du navigateur) : renvoie true si on confirme
function confirmerFeu({ titre, texte, oui, danger }) {
  return new Promise(ok => {
    const m = $('#feu-modal'), bOui = $('#feu-oui'), bNon = $('#feu-non');
    $('#feu-t').textContent = titre; $('#feu-txt').textContent = texte;
    bOui.textContent = oui;
    bOui.className = danger ? 'ghost' : 'ghost vert';
    bOui.style.cssText = danger ? 'background:var(--feu);color:#fff;border-color:var(--feu)' : '';
    bNon.textContent = danger ? 'Non, garder' : 'Annuler';
    bNon.className = danger ? 'ghost' : 'ghost annuler';
    const fin = r => { m.hidden = true; bOui.onclick = bNon.onclick = null; ok(r); };
    bOui.onclick = () => fin(true); bNon.onclick = () => fin(false);
    m.hidden = false;
    bNon.focus();
  });
}

// Enregistre le vol avec ses feux changés (heures, compteurs et mission jamais touchés)
async function changerFeux(volId, faire) {
  const v = volParId(volId);
  if (!v) return null;
  const copie = structuredClone(v);
  faire(copie.feuxPositions);
  copie.feuxRetouches = true;
  if (await enregistrerVol(copie) === false) return null;
  return copie;
}

async function deplacerFeu(volId, i, lat, lon) {
  lat = arrondi(lat); lon = arrondi(lon);
  const c = await communeDe(lat, lon);
  const v = await changerFeux(volId, feux => {
    const f = feux[i];
    f.lat = lat; f.lon = lon; f.deplaceLe = new Date().toISOString();
    if (c.statut === 'ok') { f.commune = c.commune; delete f.communeAVenir; } else { f.commune = ''; f.communeAVenir = true; }
  });
  if (v && c.statut !== 'ok') {
    const liste = (reglage('feuxCommunesEnAttente') || []).filter(x => !(x.volId === volId && x.i === i));
    await ecrireReglageDiscret('feuxCommunesEnAttente', [...liste, { volId, i, lat, lon }]);
  }
  toast(v ? (c.statut === 'ok' ? `Feu déplacé${c.commune ? ' · ' + c.commune : ''}` : 'Feu déplacé · commune au retour du réseau') : 'Feu non déplacé', 2500);
  return v;
}

async function supprimerFeu(volId, i) {
  const v = await changerFeux(volId, feux => { feux.splice(i, 1); });
  // positions en attente de commune : les numéros des feux suivants baissent d'un
  const liste = (reglage('feuxCommunesEnAttente') || []).filter(x => !(x.volId === volId && x.i === i))
    .map(x => (x.volId === volId && x.i > i ? { ...x, i: x.i - 1 } : x));
  await ecrireReglageDiscret('feuxCommunesEnAttente', liste);
  toast(v ? 'Feu supprimé' : 'Feu non supprimé', 2500);
  return v;
}

// Au retour du réseau (et à l'ouverture de l'app) : communes des feux déplacés hors ligne, sur CET appareil seulement
let communesEnCours = false;
export async function recalculerCommunes() {
  const liste = reglage('feuxCommunesEnAttente') || [];
  if (!liste.length || communesEnCours || !enLigne() || enConsultation()) return;
  communesEnCours = true;
  try {
    const reste = [];
    for (const x of liste) {
      const v = volParId(x.volId), f = v && v.feuxPositions && v.feuxPositions[x.i];
      if (!f || !f.communeAVenir || f.lat !== x.lat || f.lon !== x.lon) continue; // feu changé depuis : rien à faire
      const c = await communeDe(x.lat, x.lon);
      if (c.statut !== 'ok') { reste.push(x); continue; }
      await changerFeux(x.volId, feux => { feux[x.i].commune = c.commune; delete feux[x.i].communeAVenir; });
    }
    await ecrireReglageDiscret('feuxCommunesEnAttente', reste);
  } finally { communesEnCours = false; }
}

// Flamme du plein écran : toucher = bulle (Supprimer ce feu) ; appui long = la déplacer au doigt
function rendreFeuModifiable(L, carte, m, vol, i, conteneur) {
  const el = m.getElement();
  if (!el) return;
  L.DomEvent.disableClickPropagation(el); // la carte ne glisse pas quand on appuie sur une flamme
  el.addEventListener('contextmenu', e => e.preventDefault());
  let minuterie = null, presse = false, actif = false, x0 = 0, y0 = 0, depart = null, decalage = null;
  const finir = () => { clearTimeout(minuterie); minuterie = null; presse = false; };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    presse = true; actif = false; x0 = e.clientX; y0 = e.clientY; depart = m.getLatLng();
    try { el.setPointerCapture(e.pointerId); } catch { /* ancien navigateur */ }
    minuterie = setTimeout(() => {
      minuterie = null; actif = true;
      carte.closePopup();
      el.classList.add('feu-deplace');
      decalage = carte.latLngToContainerPoint(depart).subtract(carte.mouseEventToContainerPoint(e));
      if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* sans vibreur */ }
    }, 600);
  });
  el.addEventListener('pointermove', e => {
    if (!presse) return;
    if (actif) { e.preventDefault(); m.setLatLng(carte.containerPointToLatLng(carte.mouseEventToContainerPoint(e).add(decalage))); return; }
    if (minuterie && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) finir(); // c'était un glissé, pas un appui long
  });
  el.addEventListener('pointercancel', () => { if (actif) { m.setLatLng(depart); el.classList.remove('feu-deplace'); } actif = false; finir(); });
  el.addEventListener('pointerup', async () => {
    const etaitActif = actif, etaitTouche = presse && !!minuterie;
    actif = false; finir();
    if (etaitActif) {
      el.classList.remove('feu-deplace');
      const p = m.getLatLng();
      const ok = await confirmerFeu({ titre: 'Déplacer le feu ici ?', oui: 'Déplacer',
        texte: 'La commune sera recalculée. Les heures, les compteurs et la mission ne changent pas.' });
      if (!ok) { m.setLatLng(depart); return; }
      const v = await deplacerFeu(vol.id, i, p.lat, p.lng);
      if (v) await redessinerPlein(v, conteneur); else m.setLatLng(depart);
    } else if (etaitTouche) ouvrirBulle(L, carte, m, vol, i, conteneur);
  });
}

function ouvrirBulle(L, carte, m, vol, i, conteneur) {
  const v = volParId(vol.id), f = v && v.feuxPositions && v.feuxPositions[i];
  if (!f) return;
  const div = document.createElement('div');
  div.className = 'feu-bulle';
  div.innerHTML = `<b>${esc(nomFeu(f))}</b><p class="hint">Appui long sur la flamme pour la déplacer.</p><button type="button" class="feu-suppr">Supprimer ce feu</button>`;
  div.querySelector('.feu-suppr').addEventListener('click', async () => {
    carte.closePopup();
    const ok = await confirmerFeu({ titre: 'Supprimer ce feu ?', oui: 'Oui, supprimer', danger: true,
      texte: `${nomFeu(f)} : la flamme est retirée de la carte. Les heures, les compteurs (Feux, largages) et la mission ne changent pas.` });
    if (!ok) return;
    const nv = await supprimerFeu(vol.id, i);
    if (nv) await redessinerPlein(nv, conteneur);
  });
  L.DomEvent.disableClickPropagation(div);
  L.popup({ offset: [0, -16], closeButton: true, autoPan: true }).setLatLng(m.getLatLng()).setContent(div).openOn(carte);
}

// Après un changement : même vue (zoom et centre), feux à jour
async function redessinerPlein(vol, conteneur) {
  const c = conteneur._carte, centre = c && c.getCenter(), zoom = c && c.getZoom();
  volAffiche = vol; feuxChanges = true;
  const e = await etatDuVol(vol);
  const carte = await dessiner(conteneur, vol, e.code === 'ok' ? e.stockee.points : [], true);
  if (centre) carte.setView(centre, zoom, { animate: false });
}

async function dessiner(conteneur, vol, points, interactif) {
  const L = await chargerLeaflet();
  if (conteneur._carte) { conteneur._carte.remove(); conteneur._carte = null; }
  const carte = L.map(conteneur, {
    zoomControl: interactif, attributionControl: true, dragging: interactif, touchZoom: interactif,
    scrollWheelZoom: interactif, doubleClickZoom: interactif, boxZoom: false, keyboard: interactif, tap: false,
  });
  conteneur._carte = carte;
  carte.attributionControl.setPrefix(false);
  poserFond(L, carte, conteneur);
  const bornes = L.latLngBounds([]);
  if (points.length) bornes.extend(L.polyline(points.map(p => [p[1], p[2]]), { color: '#1f6fd1', weight: interactif ? 4 : 3, opacity: 0.9 }).addTo(carte).getBounds());
  const modifiable = interactif && peutModifierFeux(vol), flammes = [];
  ((vol && vol.feuxPositions) || []).forEach((f, i) => {
    if (typeof f.lat !== 'number' || typeof f.lon !== 'number') return;
    const m = L.marker([f.lat, f.lon], { icon: L.divIcon({ className: 'carte-feu', html: FLAMME, iconSize: [24, 24], iconAnchor: [12, 22] }), keyboard: false });
    m.bindTooltip(nomFeu(f), { permanent: true, direction: 'right', offset: [8, -10], className: 'carte-feu-nom' }).addTo(carte);
    flammes.push([m, i]);
    bornes.extend([f.lat, f.lon]);
  });
  for (const t of terrainsDuVol(vol)) {
    L.circleMarker([t.lat, t.lon], { radius: 5, color: '#13202e', weight: 2, fillColor: '#ffffff', fillOpacity: 1 })
      .bindTooltip(t.code, { permanent: true, direction: 'top', offset: [0, -6], className: 'carte-terrain' }).addTo(carte);
  }
  for (const t of terrainsDuVol(vol)) bornes.extend([t.lat, t.lon]);
  if (bornes.isValid()) carte.fitBounds(bornes, { paddingTopLeft: [28, 48], paddingBottomRight: [110, 24], maxZoom: 12 });
  else carte.setView([46.5, 2.5], 5);
  // les flammes sont dans la page une fois la carte centrée
  for (const [m, i] of flammes) {
    const el = m.getElement();
    if (!el) continue;
    el.dataset.feu = String(i);
    if (modifiable) rendreFeuModifiable(L, carte, m, vol, i, conteneur);
  }
  return carte;
}

// ---------- Bloc « Carte du vol » de la saisie ----------
let volAffiche = null, feuxChanges = false;
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
  feuxChanges = false;
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
    // feux déplacés ou supprimés : la petite carte de la saisie les montre aussi
    if (feuxChanges && volAffiche && volParId(volAffiche.id)) { feuxChanges = false; afficherCarteVol(volParId(volAffiche.id)); }
  });
  // v0.31 (R73) : Plan / Photo (choix gardé sur cet appareil) ; hors ligne : plan et court message
  $('#cp-fond').addEventListener('click', async e => {
    const b = e.target.closest('[data-fond]');
    if (!b) return;
    await ecrireReglageDiscret('carteFond', b.dataset.fond);
    const g = $('#carte-grande');
    if (g._carte) poserFond(await chargerLeaflet(), g._carte, g);
    const mini = $('#carte-mini');
    if (mini._carte) poserFond(await chargerLeaflet(), mini._carte, mini);
  });
  // v0.31 (R72) : communes des feux déplacés hors ligne, au retour du réseau
  addEventListener('online', () => setTimeout(recalculerCommunes, 1500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(recalculerCommunes, 2500); });
  setTimeout(recalculerCommunes, 3000);
  $('#pl-cartes').addEventListener('click', ecranCartes);
}

// Pour les tests
export const _interne = { obtenirIndex, remplirCodes };
