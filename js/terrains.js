// Table mondiale des terrains OACI (générée par outils/generer-terrains.py à partir de sources publiques),
// plus les terrains ajoutés à la main par le pilote (enregistrés dans SES données, pas dans le code).
// Fichier : {"z": [fuseaux], "t": {code: [lat, lon, nom, pays ISO, n° de fuseau]}}
// (l'ancien format {code: [lat, lon, nom, pays, fuseau]} est aussi accepté).

let TABLE = {}, FUSEAUX = [], PERSO = {};

export async function chargerTerrains(url = 'ressources/terrains.json') {
  const r = await fetch(url);
  definirTerrains(await r.json());
  return TABLE;
}

export function definirTerrains(donnees) {
  if (donnees && donnees.t && donnees.z) { TABLE = donnees.t; FUSEAUX = donnees.z; }
  else { TABLE = donnees || {}; FUSEAUX = null; }
}

// Terrains du pilote : { CODE: { nom, lat, lon, tz, pays } }
export function definirTerrainsPerso(liste) { PERSO = liste || {}; }
export const terrainsPerso = () => PERSO;

export const nombreTerrains = () => Object.keys(TABLE).length;

export function terrain(code) {
  const c = String(code || '').toUpperCase();
  const p = PERSO[c];
  if (p) return { code: c, lat: p.lat ?? null, lon: p.lon ?? null, nom: p.nom || c, pays: p.pays || '', tz: p.tz || 'UTC', perso: true };
  const t = TABLE[c];
  if (!t) return null;
  const tz = FUSEAUX ? FUSEAUX[t[4]] : t[4];
  return { code: c, lat: t[0], lon: t[1], nom: t[2], pays: t[3], tz: tz || 'UTC' };
}

// Fuseau d'un terrain ; inconnu -> fuseau du téléphone
export function fuseau(code) {
  const t = terrain(code);
  return t ? t.tz : Intl.DateTimeFormat().resolvedOptions().timeZone;
}
