// Vols envoyés par NPF-Q400 TEST (iPad) via le NAS (carnet.php version 3 / 4) : format commun « carnet-vol-npf »
// version 1 (v0.15) et version 2 (v0.16 : avion par son nom « M73 », escales = passages ordonnés avec leurs heures
// d'atterrissage, trigramme du copilote). Logique sans interface (testée sous Node) : validation, avion retrouvé,
// brouillon de vol, escales avec atterrissages de jour / de nuit, copilote, lignes « FEU n°NN COMMUNE », positions des
// feux, différences avec un vol déjà enregistré.
// Rien n'entre dans le carnet ici : le brouillon est ouvert dans la saisie, le pilote relit et appuie sur Enregistrer.

import { ajouterFeu, plusGrandFeu } from './missions.js';
import { minutesDuJour, hm, dateFr } from './temps.js';
import { estNuit } from './nuit.js';

export const FORMAT_NPF = 'carnet-vol-npf';
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const INSTANT = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?Z$/;
const texte = x => (typeof x === 'string' ? x.trim() : '');
const NOM_AVION = /^M\d+$/;

// Champs obligatoires du format (les autres sont facultatifs ; les champs inconnus sont ignorés)
// Version 1 : immat obligatoire. Version 2 : immat OU nomAvion (« M » + chiffres).
export function volNpfValide(n) {
  if (!n || typeof n !== 'object' || n.format !== FORMAT_NPF || (n.version !== 1 && n.version !== 2)) return false;
  if (typeof n.id !== 'string' || n.id.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(n.date || '')) return false;
  if (!HEURE.test(n.blocDepart || '') || !HEURE.test(n.blocArrivee || '')) return false;
  if (n.version === 1) return texte(n.immat) !== '';
  return texte(n.immat) !== '' || NOM_AVION.test(texte(n.nomAvion).toUpperCase());
}

// Immatriculation comparée sans tiret ni majuscules (F-XZZB = FXZZB = f-xzzb)
export const cleImmat = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function avionPourImmat(avions, immat) {
  const k = cleImmat(immat);
  return k ? avions.find(a => a && !a.sim && cleImmat(a.immat) === k) || null : null;
}
// Nom de l'avion comparé sans majuscules ni espaces (« M73 » = « m73 » = « M 73 ») ; tous les avions qui l'ont
export const cleNom = s => String(s || '').toUpperCase().replace(/\s+/g, '');
export function avionsPourNom(avions, nom) {
  const k = cleNom(nom);
  return k ? avions.filter(a => a && !a.sim && cleNom(a.nom) === k) : [];
}
// Avion du vol : l'immatriculation prime ; sinon (format 2) le nom, s'il désigne UN seul avion. Format 1 : comme en v0.15.
// { avion, recherche (texte pré-rempli dans la recherche d'avion si l'avion n'est pas trouvé), plusieurs }
export function avionDuVolNpf(n, avions) {
  const immat = texte(n.immat), nom = texte(n.nomAvion);
  const parImmat = immat ? avionPourImmat(avions, immat) : null;
  if (parImmat) return { avion: parImmat, recherche: '', plusieurs: 0 };
  const parNom = nom && n.version === 2 ? avionsPourNom(avions, nom) : [];
  if (parNom.length === 1) return { avion: parNom[0], recherche: '', plusieurs: 0 };
  return { avion: null, recherche: n.version === 2 ? (nom || immat.toUpperCase()) : immat.toUpperCase(), plusieurs: parNom.length > 1 ? parNom.length : 0 };
}
const codeOACI = c => (/^[A-Z0-9]{4}$/i.test(texte(c)) ? texte(c).toUpperCase() : '');

// Durée bloc en minutes (arrivée le lendemain UTC si elle est avant le départ, ou si NPF le dit)
export function dureeBloc(n) {
  let d = minutesDuJour(n.blocArrivee) - minutesDuJour(n.blocDepart);
  if (d < 0 || (d === 0 && n.blocArriveeJ1 === true)) d += 1440;
  return d;
}

// Feux reçus : heure, position (gardée seulement si elle est valable), commune, nom
const coord = (x, max) => (typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= max ? x : null);
export function feuxNpf(n) {
  return (Array.isArray(n.feux) ? n.feux : []).filter(f => f && typeof f === 'object').map(f => {
    const lat = coord(f.lat, 90), lon = coord(f.lon, 180);
    return { heure: HEURE.test(f.heure || '') ? f.heure : '', lat: lat === null || lon === null ? null : lat,
      lon: lat === null || lon === null ? null : lon, commune: texte(f.commune), nom: texte(f.nom) };
  });
}
// Positions gardées avec le vol (Carte du vol) : seulement celles qui ont une latitude et une longitude
export const positionsFeux = feux => feux.filter(f => f.lat !== null).map(f => ({ ...f }));

// Escales. Version 1 : liste de codes OACI (1 atterrissage de jour chacune, comme une escale saisie à la main).
// Version 2 : passages ordonnés { oaci, nom, lat, lon, atterrissages: [ISO UTC] } ; chaque atterrissage est classé
// de jour ou de nuit (règle EASA : soleil à plus de 6° sous l'horizon) à la position du terrain (table OACI), sinon
// à lat / lon. Sans position connue, l'atterrissage est compté de jour et signalé (aVerifier).
// terrain : fonction code -> { lat, lon } | null (la table des terrains de l'app ; injectée pour les tests).
export function escalesNpf(n, terrain = () => null) {
  const liste = Array.isArray(n.escales) ? n.escales : [];
  if (n.version !== 2) return liste.map(codeOACI).filter(Boolean).map(code => ({ code, attJour: 1, attNuit: 0 }));
  return liste.filter(e => e && typeof e === 'object').map(e => {
    const code = codeOACI(e.oaci), t = code ? terrain(code) : null;
    const lat = t && t.lat != null ? t.lat : coord(e.lat, 90), lon = t && t.lon != null ? t.lon : coord(e.lon, 180);
    const position = lat !== null && lon !== null;
    const instants = (Array.isArray(e.atterrissages) ? e.atterrissages : []).map(texte).filter(h => INSTANT.test(h));
    let attJour = 0, attNuit = 0;
    for (const h of instants) {
      if (position && estNuit(Date.parse(h), lat, lon)) attNuit++; else attJour++;
    }
    const x = { code, attJour, attNuit, atterrissages: instants };
    if (texte(e.nom)) x.nom = texte(e.nom);
    if (!t && position) { x.lat = lat; x.lon = lon; }
    if (!position && instants.length) x.aVerifier = true;
    return x;
  }).filter(e => e.attJour + e.attNuit > 0);
}
// Texte d'une escale : code (ou nom du pélicandrome) et ses atterrissages
export const libelleEscale = e => `${e.code || e.nom || 'Terrain à compléter'}${e.attJour + e.attNuit > 1 ? ` ×${e.attJour + e.attNuit}` : ''}${e.attNuit ? ` (${e.attNuit} nuit)` : ''}`;

// Copilote : trigramme (3 lettres) retrouvé dans mes personnes. { tri, personne (ou null) }
export function copiloteNpf(n, personnes = []) {
  const brut = texte(n.copilote);
  if (!brut) return { tri: '', personne: null };
  const tri = brut.toUpperCase();
  if (n.version === 2 && !/^[A-Z]{3}$/.test(tri)) return { tri: '', personne: null };
  const p = personnes.find(x => x && String(x.tri || '').toUpperCase() === tri) || null;
  return { tri, personne: p };
}

// Position de l'arrivée quand elle n'a pas de code OACI (format 2, `arriveePosition: { lat, lon }`), sinon null
export function positionArrivee(n) {
  const p = n && n.arriveePosition;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const lat = coord(p.lat, 90), lon = coord(p.lon, 180);
  return lat === null || lon === null ? null : { lat, lon };
}

// Nombre entier >= 0 si NPF le donne de façon sûre, sinon null
const entier = x => (Number.isInteger(x) && x >= 0 && x < 100 ? x : null);

// Brouillon de vol à partir d'un vol NPF.
// avions, personnes : listes ; vols : le carnet (numéro de feu suivant) ; terrain : table des terrains (escales).
export function brouillonNpf(n, { avions = [], vols = [], personnes = [], terrain = () => null } = {}) {
  const feux = feuxNpf(n);
  let lignes = [];
  const base = plusGrandFeu(vols);
  for (const f of feux) lignes = ajouterFeu(lignes, base, f.commune || f.nom).lignes;
  const att = entier(n.atterrissages), attJour = entier(n.atterrissagesJour), attNuit = entier(n.atterrissagesNuit);
  const av = avionDuVolNpf(n, avions);
  const copi = copiloteNpf(n, personnes);
  return {
    version: n.version,
    npf: { id: n.id, exporteLe: texte(n.exporteLe), feux: positionsFeux(feux), nbFeux: feux.length, feuxTous: feux },
    date: n.date, hDep: n.blocDepart, hArr: n.blocArrivee, bloc: dureeBloc(n),
    dep: codeOACI(n.depart), arr: codeOACI(n.arrivee), escales: escalesNpf(n, terrain), arriveePosition: positionArrivee(n),
    immat: texte(n.immat).toUpperCase(), nomAvion: texte(n.nomAvion).toUpperCase(),
    avion: av.avion, rechercheAvion: av.recherche, avionsMemeNom: av.plusieurs,
    lignes, remarques: texte(n.remarques),
    attJour: attJour ?? att, attNuit,
    copilote: copi.tri, copilotePersonne: copi.personne,
  };
}

// Le vol NPF déjà enregistré dans le carnet (même id NPF), s'il existe
export const volDejaEnregistre = (vols, id) => vols.find(v => v.npfId === id) || null;
// Déjà enregistré ET pas plus récent sur le NAS : on peut le retirer du NAS sans rien demander
export const dejaAJour = (vol, n) => !!vol && (vol.npfExporteLe || '') >= texte(n.exporteLe);

// Ce qui change entre le vol enregistré et le nouvel export NPF (pour « Mettre à jour ce vol »)
const nomAvionAffiche = a => (a ? [a.nom, a.immat].filter(Boolean).join(' ') : '');
export function differencesNpf(vol, b, avionDuVol) {
  const d = [];
  const ajout = (champ, avant, apres) => { if (String(avant ?? '') !== String(apres ?? '')) d.push({ champ, avant: avant || '—', apres: apres || '—' }); };
  ajout('Date', vol.date && dateFr(vol.date), dateFr(b.date));
  ajout('Bloc départ (UTC)', vol.hDep, b.hDep);
  ajout('Bloc arrivée (UTC)', vol.hArr, b.hArr);
  ajout('Temps bloc', hm(vol.tempsTotal || 0), hm(b.bloc));
  // Avion : comparé à l'avion retrouvé ; s'il n'est pas retrouvé, au nom ou à l'immatriculation envoyés
  if (!b.avion || !avionDuVol || b.avion.id !== avionDuVol.id) ajout('Avion', nomAvionAffiche(avionDuVol), b.avion ? nomAvionAffiche(b.avion) : (b.nomAvion || b.immat) + ' (à choisir)');
  if (b.dep) ajout('Départ', vol.dep, b.dep);
  if (b.arr) ajout('Arrivée', vol.arr, b.arr);
  ajout('Escales', (vol.escales || []).map(libelleEscale).join(' → '), b.escales.map(libelleEscale).join(' → '));
  if (b.copilote) ajout('Copilote', vol.nomCopi, b.copilotePersonne ? (b.copilotePersonne.tri || b.copilote) : b.copilote);
  ajout('Feux', String(vol.feux || 0), String(b.npf.nbFeux));
  // v0.31 (R72) : flammes déplacées ou supprimées à la main : gardées, sauf si on demande de reprendre celles de NPF
  if (vol.feuxRetouches) d.push({ champ: 'Positions des feux', avant: `${(vol.feuxPositions || []).length} (déplacées ou supprimées à la main)`,
    apres: `gardées (NPF-Q400 en envoie ${b.npf.feux.length} : tu peux les reprendre dans le brouillon)` });
  else ajout('Positions des feux', String((vol.feuxPositions || []).length), String(b.npf.feux.length));
  if (b.remarques) ajout('Remarques', vol.remarques, b.remarques);
  return d;
}

// Ligne de la liste « Vols NPF-Q400 » : date, avion (nom + immatriculation trouvée), trajet, bloc
export function resumeNpf(n, avions) {
  const av = avionDuVolNpf(n, avions);
  const a = av.avion;
  const nom = texte(n.nomAvion).toUpperCase() || (a && a.nom) || '';
  const immat = (a && a.immat) || texte(n.immat).toUpperCase();
  const esc = n.version === 2 ? escalesNpf(n).map(e => e.code || e.nom || '?') : (Array.isArray(n.escales) ? n.escales.map(codeOACI).filter(Boolean) : []);
  const trajet = [codeOACI(n.depart), ...esc, codeOACI(n.arrivee)].filter(Boolean);
  return {
    date: dateFr(n.date), avion: [nom, immat].filter(Boolean).join(' '),
    trajet: trajet.length ? trajet.join(' → ') : 'Terrains à compléter',
    bloc: `${n.blocDepart} → ${n.blocArrivee} UTC${dureeBloc(n) + minutesDuJour(n.blocDepart) >= 1440 ? ' (J+1)' : ''} · ${hm(dureeBloc(n))}`,
    feux: feuxNpf(n).length, avionConnu: !!a, avionsMemeNom: av.plusieurs,
  };
}
