// Temps de nuit selon la définition EASA : entre la fin du crépuscule civil du soir et le
// début du crépuscule civil du matin, c'est-à-dire quand le centre du Soleil est à plus de
// 6° sous l'horizon. Calcul minute par minute le long de la route directe.

const RAD = Math.PI / 180;
export const SEUIL_NUIT = -6;

// Hauteur du Soleil (degrés) à un instant (ms UTC) et un lieu. Précision ~0,01°.
export function hauteurSoleil(ms, lat, lon) {
  const n = ms / 86400000 + 2440587.5 - 2451545.0; // jours depuis J2000
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ad = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const tsmg = ((280.46061837 + 360.98564736629 * n) % 360) * RAD;
  const ah = tsmg + lon * RAD - ad;
  const phi = lat * RAD;
  const s = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ah);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

export const estNuit = (ms, lat, lon) => hauteurSoleil(ms, lat, lon) < SEUIL_NUIT;

// Point à la fraction f (0..1) de l'arc de grand cercle entre a et b ({lat, lon})
export function interpoler(a, b, f) {
  const p1 = a.lat * RAD, l1 = a.lon * RAD, p2 = b.lat * RAD, l2 = b.lon * RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

// Minutes de nuit d'un vol : départ à debutMs, durée en minutes, points = terrains dans l'ordre
// (départ, escales, arrivée). Le temps est réparti sur les tronçons selon leur longueur.
export function minutesDeNuit(debutMs, duree, points) {
  if (!duree || !points.length) return 0;
  const legs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const d = Math.hypot(b.lat - a.lat, (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD));
    legs.push({ a, b, d });
    total += d;
  }
  const position = f => {
    if (!legs.length || total === 0) return points[0];
    let reste = f * total;
    for (const l of legs) {
      if (reste <= l.d || l === legs[legs.length - 1]) return interpoler(l.a, l.b, l.d ? Math.min(1, reste / l.d) : 0);
      reste -= l.d;
    }
    return points[points.length - 1];
  };
  let nuit = 0;
  for (let i = 0; i < duree; i++) {
    const p = position((i + 0.5) / duree);
    if (estNuit(debutMs + (i + 0.5) * 60000, p.lat, p.lon)) nuit++;
  }
  return nuit;
}
