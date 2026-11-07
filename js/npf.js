// Vols envoyés par NPF-Q400 TEST (iPad) via le NAS (carnet.php version 3) : format commun « carnet-vol-npf »
// version 1. Logique sans interface (testée sous Node) : validation, avion retrouvé par son immatriculation,
// brouillon de vol, lignes « FEU n°NN COMMUNE », positions des feux, différences avec un vol déjà enregistré.
// Rien n'entre dans le carnet ici : le brouillon est ouvert dans la saisie, le pilote relit et appuie sur Enregistrer.

import { ajouterFeu, plusGrandFeu } from './missions.js';
import { minutesDuJour, hm, dateFr } from './temps.js';

export const FORMAT_NPF = 'carnet-vol-npf';
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const texte = x => (typeof x === 'string' ? x.trim() : '');

// Champs obligatoires du format (les autres sont facultatifs ; les champs inconnus sont ignorés)
export function volNpfValide(n) {
  return !!n && typeof n === 'object' && n.format === FORMAT_NPF && n.version === 1
    && typeof n.id === 'string' && n.id.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(n.date || '')
    && HEURE.test(n.blocDepart || '') && HEURE.test(n.blocArrivee || '') && texte(n.immat) !== '';
}

// Immatriculation comparée sans tiret ni majuscules (F-XZZB = FXZZB = f-xzzb)
export const cleImmat = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function avionPourImmat(avions, immat) {
  const k = cleImmat(immat);
  return k ? avions.find(a => a && !a.sim && cleImmat(a.immat) === k) || null : null;
}
const codeOACI = c => (/^[A-Z0-9]{4}$/i.test(texte(c)) ? texte(c).toUpperCase() : '');

// Durée bloc en minutes (arrivée le lendemain UTC si elle est avant le départ, ou si NPF le dit)
export function dureeBloc(n) {
  let d = minutesDuJour(n.blocArrivee) - minutesDuJour(n.blocDepart);
  if (d < 0 || (d === 0 && n.blocArriveeJ1 === true)) d += 1440;
  return d;
}

// Feux reçus : heure, position (gardée seulement si elle est valable), commune, nom
export function feuxNpf(n) {
  return (Array.isArray(n.feux) ? n.feux : []).filter(f => f && typeof f === 'object').map(f => {
    const lat = typeof f.lat === 'number' && Number.isFinite(f.lat) && Math.abs(f.lat) <= 90 ? f.lat : null;
    const lon = typeof f.lon === 'number' && Number.isFinite(f.lon) && Math.abs(f.lon) <= 180 ? f.lon : null;
    return { heure: HEURE.test(f.heure || '') ? f.heure : '', lat: lat === null || lon === null ? null : lat,
      lon: lat === null || lon === null ? null : lon, commune: texte(f.commune), nom: texte(f.nom) };
  });
}
// Positions gardées avec le vol (Carte du vol) : seulement celles qui ont une latitude et une longitude
export const positionsFeux = feux => feux.filter(f => f.lat !== null).map(f => ({ ...f }));

// Nombre entier >= 0 si NPF le donne de façon sûre, sinon null
const entier = x => (Number.isInteger(x) && x >= 0 && x < 100 ? x : null);

// Brouillon de vol à partir d'un vol NPF. avions : liste ; vols : le carnet (pour le numéro de feu suivant).
export function brouillonNpf(n, { avions = [], vols = [] } = {}) {
  const feux = feuxNpf(n);
  let lignes = [];
  const base = plusGrandFeu(vols);
  for (const f of feux) lignes = ajouterFeu(lignes, base, f.commune || f.nom).lignes;
  const att = entier(n.atterrissages), attJour = entier(n.atterrissagesJour), attNuit = entier(n.atterrissagesNuit);
  return {
    npf: { id: n.id, exporteLe: texte(n.exporteLe), feux: positionsFeux(feux), nbFeux: feux.length, feuxTous: feux },
    date: n.date, hDep: n.blocDepart, hArr: n.blocArrivee, bloc: dureeBloc(n),
    dep: codeOACI(n.depart), arr: codeOACI(n.arrivee),
    escales: (Array.isArray(n.escales) ? n.escales : []).map(codeOACI).filter(Boolean).map(code => ({ code, attJour: 1, attNuit: 0 })),
    immat: texte(n.immat).toUpperCase(), nomAvion: texte(n.nomAvion), avion: avionPourImmat(avions, n.immat),
    lignes, remarques: texte(n.remarques),
    attJour: attJour ?? att, attNuit, copilote: texte(n.copilote),
  };
}

// Le vol NPF déjà enregistré dans le carnet (même id NPF), s'il existe
export const volDejaEnregistre = (vols, id) => vols.find(v => v.npfId === id) || null;
// Déjà enregistré ET pas plus récent sur le NAS : on peut le retirer du NAS sans rien demander
export const dejaAJour = (vol, n) => !!vol && (vol.npfExporteLe || '') >= texte(n.exporteLe);

// Ce qui change entre le vol enregistré et le nouvel export NPF (pour « Mettre à jour ce vol »)
export function differencesNpf(vol, b, avionDuVol) {
  const d = [];
  const ajout = (champ, avant, apres) => { if (String(avant ?? '') !== String(apres ?? '')) d.push({ champ, avant: avant || '—', apres: apres || '—' }); };
  ajout('Date', vol.date && dateFr(vol.date), dateFr(b.date));
  ajout('Bloc départ (UTC)', vol.hDep, b.hDep);
  ajout('Bloc arrivée (UTC)', vol.hArr, b.hArr);
  ajout('Temps bloc', hm(vol.tempsTotal || 0), hm(b.bloc));
  ajout('Avion', avionDuVol ? avionDuVol.immat : '', b.avion ? b.avion.immat : b.immat);
  if (b.dep) ajout('Départ', vol.dep, b.dep);
  if (b.arr) ajout('Arrivée', vol.arr, b.arr);
  ajout('Escales', (vol.escales || []).map(e => e.code).join(' '), b.escales.map(e => e.code).join(' '));
  ajout('Feux', String(vol.feux || 0), String(b.npf.nbFeux));
  ajout('Positions des feux', String((vol.feuxPositions || []).length), String(b.npf.feux.length));
  if (b.remarques) ajout('Remarques', vol.remarques, b.remarques);
  return d;
}

// Ligne de la liste « Vols NPF-Q400 » : date, avion, trajet, bloc
export function resumeNpf(n, avions) {
  const a = avionPourImmat(avions, n.immat);
  const nom = texte(n.nomAvion) || (a && a.nom) || '';
  const trajet = [codeOACI(n.depart), ...(Array.isArray(n.escales) ? n.escales.map(codeOACI) : []), codeOACI(n.arrivee)].filter(Boolean);
  return {
    date: dateFr(n.date), avion: [nom, texte(n.immat).toUpperCase()].filter(Boolean).join(' '),
    trajet: trajet.length ? trajet.join(' → ') : 'Terrains à compléter',
    bloc: `${n.blocDepart} → ${n.blocArrivee} UTC${dureeBloc(n) + minutesDuJour(n.blocDepart) >= 1440 ? ' (J+1)' : ''} · ${hm(dureeBloc(n))}`,
    feux: feuxNpf(n).length, avionConnu: !!a,
  };
}
