// Missions, feux, pastilles et texte « Remarque du carnet ».

// Remarque FlyLog -> lignes de mission : partie après « • », séparée par « + »
export function lignesDepuisRemarque(remarque) {
  if (!remarque) return [];
  const partie = String(remarque).split('•').pop();
  return partie.split(/\s+\+\s+/).map(t => t.trim()).filter(Boolean);
}

// Numéro d'un feu dans une ligne (« FEU n°52 RODEZ », « FEU (n°46) … », « FEU VILLAGE n°20 »)
export function numeroFeu(ligne) {
  const m = String(ligne || '').match(/\bFEU\b[^+]*?n°\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

export const estLigneFeu = ligne => /\bFEU\b/i.test(ligne || '');

// Plus grand numéro de feu déjà écrit dans le carnet (on peut exclure un vol, celui qu'on modifie).
// v0.36 (R88) : pour un VRAI vol, les vols de simulation sont ignorés (v0.35) ; pour un vol de SIMULATION
// (avecSimulation = true), on compte les vrais vols ET les vols de simulation : les n° continuent d'une simulation à l'autre.
export function plusGrandFeu(vols, exclureId = null, avecSimulation = false) {
  let max = 0;
  for (const v of vols) {
    if (v.id === exclureId || (v.simulation === true && !avecSimulation)) continue; // v0.35 (R85) / v0.36 (R88)
    // lignes de mission, et aussi les remarques (au cas où un feu y serait écrit)
    for (const l of [...(v.missions || []), ...String(v.remarques || '').split(/\s+\+\s+|•/)]) {
      const n = numeroFeu(l);
      if (n !== null && n > max) max = n;
    }
  }
  return max;
}

// Route avec tirets s'il y a des escales (ex. LFTW-LFTH-LFMD), sinon vide
export function texteRoute(vol) {
  const esc = (vol.escales || []).map(e => e.code || e.nom).filter(Boolean);
  if (!esc.length) return '';
  return [vol.dep, ...esc, vol.arr].filter(Boolean).join('-');
}

export const texteMissions = vol => (vol.missions || []).map(t => t.trim()).filter(Boolean).join(' + ');

// Texte de la colonne Remarques du PDF : route • missions, puis remarques libres
export function remarqueCarnet(vol) {
  const debut = [texteRoute(vol), texteMissions(vol)].filter(Boolean).join(' • ');
  return [debut, (vol.remarques || '').trim()].filter(Boolean).join(' • ');
}

// Règles par défaut : « si une ligne de mission commence par X → pastille Y »
export const REGLES_DEFAUT = [
  { debut: 'ENT.', pastille: 'Entraînement' },
  { debut: 'GAAR', pastille: 'GAAR' },
];

// Pastilles d'un vol issues des règles (FEU est traité à part, automatiquement)
export function pastillesRegles(vol, regles) {
  const out = [];
  for (const l of vol.missions || []) {
    const t = l.trim().toUpperCase();
    for (const r of regles) {
      const d = (r.debut || '').trim().toUpperCase();
      if (d && t.startsWith(d) && !out.includes(r.pastille)) out.push(r.pastille);
    }
  }
  return out;
}

// Pastille feu : { texte, plein } ou null. Plein = nouveau feu sur ce vol ; contour = feu repris.
export function pastilleFeu(vol) {
  if (vol.feux > 0) {
    const n = (vol.missions || []).map(numeroFeu).find(x => x !== null);
    return { texte: n ? `Feu n°${n}` : 'Feu', plein: true };
  }
  if ((vol.missions || []).some(estLigneFeu)) return { texte: 'Feu', plein: false };
  return null;
}

// Gestion du compteur Feux dans la saisie.
// lignes : [{ t, nouveauFeu: numéro | null }]. base = plus grand n° hors de ce vol.
export function ajouterFeu(lignes, base, texteTape) {
  const dejaNouveaux = lignes.filter(l => l.nouveauFeu).map(l => l.nouveauFeu);
  const n = Math.max(base, ...dejaNouveaux, 0) + 1;
  const t = texteTape && texteTape.trim() ? `FEU n°${n} ${texteTape.trim().toUpperCase()}` : `FEU n°${n} `;
  return { lignes: [...lignes, { t, nouveauFeu: n }], numero: n };
}

// « − » : enlève la ligne du dernier feu ajouté
export function enleverFeu(lignes) {
  const nums = lignes.filter(l => l.nouveauFeu).map(l => l.nouveauFeu);
  if (!nums.length) return lignes;
  const dernier = Math.max(...nums);
  const i = lignes.findIndex(l => l.nouveauFeu === dernier);
  return lignes.filter((_, j) => j !== i);
}

// Lignes de saisie d'un vol existant : les « feux » premiers feux numérotés sont ses nouveaux feux
export function lignesPourSaisie(vol) {
  let reste = vol.feux || 0;
  return (vol.missions || []).map(t => {
    const n = numeroFeu(t);
    if (reste > 0 && estLigneFeu(t)) { reste--; return { t, nouveauFeu: n || -1 }; }
    return { t, nouveauFeu: null };
  });
}

// Missions proposées : toutes les lignes déjà écrites, de la plus récente à la plus ancienne,
// plus les missions ajoutées à la main, SAUF les suggestions masquées par le pilote
// (le texte des vols n'est jamais modifié : on cache seulement la suggestion).
export function missionsConnues(volsRecentsDabord, ajoutees = [], masquees = []) {
  const vues = new Set(masquees.map(cleSuggestion)), out = [];
  const ajouter = t => {
    const k = cleSuggestion(t);
    if (k && !vues.has(k)) { vues.add(k); out.push(t.trim()); }
  };
  ajoutees.forEach(ajouter);
  for (const v of volsRecentsDabord) (v.missions || []).forEach(ajouter);
  return out;
}

// Suggestions masquées (réglage « missionsMasquees ») : comparaison sans tenir compte des majuscules
export const cleSuggestion = t => String(t || '').trim().toUpperCase();
export const estMasquee = (masquees, t) => (masquees || []).some(m => cleSuggestion(m) === cleSuggestion(t));
export function masquerSuggestion(masquees, t) {
  return estMasquee(masquees, t) ? [...masquees] : [...(masquees || []), String(t).trim()];
}
export function remettreSuggestion(masquees, t) {
  return (masquees || []).filter(m => cleSuggestion(m) !== cleSuggestion(t));
}

// Recherche « tolérante » : majuscules, sans accents ni ponctuation
export const normaliser = t => String(t || '').toUpperCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
