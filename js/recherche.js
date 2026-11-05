// Recherche de vols par date dans la barre du Carnet (R29) : logique sans interface, testée sous Node.
// Toujours jour / mois / année (format français). Année sur 2 chiffres : 20xx (19xx si supérieure à 50).
//   06/05/25, 6/5/2025, 06.05.2025, 06-05-25, 06 05 2025, 060525, 06052025 -> ce jour-là
//   2025-05-06 (format inverse)                                             -> ce jour-là
//   05/2025 -> tout le mois · 06/05 -> le 6 mai de toutes les années · 2025 -> toute l'année
// Ce qui n'est pas une date valide renvoie null : la recherche texte habituelle s'applique.

const SEP = '[\\/.\\- ]+';
const deux = n => String(n).padStart(2, '0');

function annee(a) {
  if (a.length === 4) return Number(a);
  const n = Number(a);
  return n > 50 ? 1900 + n : 2000 + n;
}
function jourValide(j, m, a) {
  if (m < 1 || m > 12 || j < 1 || j > 31) return false;
  if (a === undefined) return j <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}
const anneeValide = a => a >= 1900 && a <= 2099;

// -> { genre: 'jour'|'mois'|'jourMois'|'annee', ... , texte } ou null
export function lireDate(saisie) {
  const t = String(saisie || '').trim();
  if (!t) return null;
  let m;
  const jour = (j, mo, a) => (jourValide(j, mo, a) && anneeValide(a)
    ? { genre: 'jour', date: `${a}-${deux(mo)}-${deux(j)}` } : null);
  // 2025-05-06 (année d'abord)
  if ((m = t.match(new RegExp(`^(\\d{4})${SEP}(\\d{1,2})${SEP}(\\d{1,2})$`)))) return jour(+m[3], +m[2], +m[1]);
  // 06/05/2025, 6/5/25, 06.05.2025, 06-05-25, 06 05 2025
  if ((m = t.match(new RegExp(`^(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{2}|\\d{4})$`)))) return jour(+m[1], +m[2], annee(m[3]));
  // 05/2025 : tout le mois
  if ((m = t.match(new RegExp(`^(\\d{1,2})${SEP}(\\d{4})$`)))) {
    const mo = +m[1], a = +m[2];
    return mo >= 1 && mo <= 12 && anneeValide(a) ? { genre: 'mois', mois: `${a}-${deux(mo)}` } : null;
  }
  // 06/05 : ce jour de toutes les années
  if ((m = t.match(new RegExp(`^(\\d{1,2})${SEP}(\\d{1,2})$`)))) {
    const j = +m[1], mo = +m[2];
    return jourValide(j, mo) ? { genre: 'jourMois', jourMois: `${deux(mo)}-${deux(j)}` } : null;
  }
  // 060525, 06052025 : sans séparateur
  if ((m = t.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/))) return jour(+m[1], +m[2], annee(m[3]));
  // 2025 : toute l'année
  if ((m = t.match(/^(\d{4})$/)) && anneeValide(+m[1])) return { genre: 'annee', annee: m[1] };
  return null;
}

// Fonction de tri : la date (AAAA-MM-JJ) correspond-elle à la recherche ?
export function filtreDate(d) {
  if (!d) return null;
  if (d.genre === 'jour') return iso => iso === d.date;
  if (d.genre === 'mois') return iso => iso.slice(0, 7) === d.mois;
  if (d.genre === 'jourMois') return iso => iso.slice(5, 10) === d.jourMois;
  return iso => iso.slice(0, 4) === d.annee;
}
