// Table OACI des terrains (générée par outils/generer-terrains.py à partir de sources publiques).
// code -> [lat, lon, nom, pays ISO, fuseau IANA]

let TABLE = {};

export async function chargerTerrains(url = 'ressources/terrains.json') {
  const r = await fetch(url);
  TABLE = await r.json();
  return TABLE;
}

export function definirTerrains(table) { TABLE = table; }

export function terrain(code) {
  const t = TABLE[String(code || '').toUpperCase()];
  return t ? { code: code.toUpperCase(), lat: t[0], lon: t[1], nom: t[2], pays: t[3], tz: t[4] || 'UTC' } : null;
}

// Fuseau d'un terrain ; inconnu -> fuseau du téléphone
export function fuseau(code) {
  const t = terrain(code);
  return t ? t.tz : Intl.DateTimeFormat().resolvedOptions().timeZone;
}
