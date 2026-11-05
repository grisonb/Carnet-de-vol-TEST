// Bande d'heures de l'accueil (sous 3 / 7 / 30 jours) : valeurs choisies par le pilote.
// Les valeurs viennent de calculerTotaux (les mêmes calculs que l'écran Totaux).

import { hm } from './temps.js';

export const BANDE_GENERAL = [
  { cle: 'tempsTotal', lib: 'Temps bloc' },
  { cle: 'simTemps', lib: 'Simulateur' },
  { cle: 'tempsCdB', lib: 'CdB' },
  { cle: 'tempsCopi', lib: 'Copi' },
  { cle: 'tempsDC', lib: 'DC' },
  { cle: 'tempsInst', lib: 'Instructeur' },
  { cle: 'tempsIFR', lib: 'IFR' },
  { cle: 'tempsNuit', lib: 'Nuit' },
  { cle: 'vols', lib: 'Vols', nombre: true },
  { cle: 'atterrissages', lib: 'Atterrissages', nombre: true },
];

export const BANDE_DEFAUT = ['tempsCdB', 'tempsCopi', 'tempsDC', 'tempsInst', 'tempsIFR', 'tempsNuit'];

// Types ayant trois choix (total, CdB, Copi) au lieu d'un seul
export const TYPES_DETAILLES = ['DH8D'];

// Choix « par type d'appareil » : un par type OACI de mes avions (pas les simulateurs), du plus d'heures au moins
export function choixParType(t, avions = []) {
  const types = new Set(Object.keys(t.parType || {}));
  for (const a of avions) if (!a.sim && a.typeOACI) types.add(a.typeOACI);
  types.delete('SIMULATEURS'); types.delete('?');
  const out = [];
  for (const ty of [...types].sort((x, y) => (t.parType[y] || 0) - (t.parType[x] || 0) || x.localeCompare(y))) {
    if (TYPES_DETAILLES.includes(ty)) {
      out.push({ cle: `type:${ty}`, lib: `${ty} total` }, { cle: `typeCdB:${ty}`, lib: `${ty} CdB` }, { cle: `typeCopi:${ty}`, lib: `${ty} Copi` });
    } else out.push({ cle: `type:${ty}`, lib: ty });
  }
  return out;
}

// Valeur d'un choix : { lib, texte } (heures « 2 696h38 », nombres « 4 070 »)
export function valeurBande(cle, t) {
  const g = BANDE_GENERAL.find(x => x.cle === cle);
  if (g) return { lib: g.lib, texte: g.nombre ? (t[cle] || 0).toLocaleString('fr-FR') : hm(t[cle] || 0) };
  const [genre, ty] = cle.split(':');
  if (genre === 'type') return { lib: TYPES_DETAILLES.includes(ty) ? `${ty} total` : ty, texte: hm(t.parType[ty] || 0) };
  if (genre === 'typeCdB') return { lib: `${ty} CdB`, texte: hm(t.parTypeCdB[ty] || 0) };
  if (genre === 'typeCopi') return { lib: `${ty} Copi`, texte: hm(t.parTypeCopi[ty] || 0) };
  return null;
}

// Cocher / décocher : l'ordre d'affichage est l'ordre dans lequel on coche
export function basculerChoix(liste, cle) {
  return liste.includes(cle) ? liste.filter(x => x !== cle) : [...liste, cle];
}
