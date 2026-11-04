// Contrôle import : comparaison des totaux de l'app avec des valeurs de référence (FlyLog).
import { RUBRIQUES } from './totaux.js';
import { lireDuree, hmPoints } from './temps.js';

// valeurs : { cle: nombre | "h:mm" } ; une ligne par rubrique (ok = null si pas de référence)
export function comparerReference(totaux, valeurs = {}) {
  return RUBRIQUES.map(r => {
    const brut = valeurs[r.cle];
    const attendu = brut === undefined || brut === null ? null
      : (r.genre === 'duree' ? lireDuree(String(brut)) : Number(brut));
    const obtenu = totaux[r.cle];
    const f = n => (n === null ? null : r.genre === 'duree' ? (hmPoints(n) || '0:00') : String(n));
    return { cle: r.cle, titre: r.titre, groupe: r.groupe, obtenu: f(obtenu), attendu: f(attendu),
      ok: attendu === null ? null : obtenu === attendu };
  });
}
