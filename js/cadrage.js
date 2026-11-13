// v0.38 (R93) : cadrage de la photo d'un avion dans le bandeau de sa fiche (logique sans écran, testée sous Node).
// Un cadrage = { cx, cy, z } : centre de la partie visible, en fraction de la photo (0 à 1), et zoom (1 = la photo
// remplit juste le bandeau, comme l'affichage « centré » d'avant ; jamais moins : jamais de bande vide).
// Il ne dépend pas de la largeur de l'écran : le même cadrage sert sur le téléphone, le PC et l'iPad.

export const ZOOM_MAX = 4;
const borne = (x, min, max) => Math.min(max, Math.max(min, x));

// Place une photo de iw × ih dans une boîte de W × H : taille affichée (w, h), position (left, top) et cadrage
// corrigé (centre ramené pour que la photo couvre toujours toute la boîte).
export function placement(iw, ih, W, H, cadre) {
  const z = borne(Number(cadre && cadre.z) || 1, 1, ZOOM_MAX);
  const s = Math.max(W / iw, H / ih) * z; // échelle : « remplir » × zoom
  const w = iw * s, h = ih * s;
  const demiW = W / (2 * s), demiH = H / (2 * s); // moitié de la partie visible, en pixels de la photo
  const cxp = borne((cadre && Number.isFinite(cadre.cx) ? cadre.cx : 0.5) * iw, demiW, iw - demiW);
  const cyp = borne((cadre && Number.isFinite(cadre.cy) ? cadre.cy : 0.5) * ih, demiH, ih - demiH);
  return { w, h, s, left: W / 2 - cxp * s, top: H / 2 - cyp * s, cadre: { cx: cxp / iw, cy: cyp / ih, z } };
}

// Glisser de (dx, dy) pixels d'écran : la photo suit le doigt (le centre visible part dans l'autre sens)
export function deplacer(cadre, dx, dy, iw, ih, W, H) {
  const p = placement(iw, ih, W, H, cadre);
  return placement(iw, ih, W, H, { ...p.cadre, cx: p.cadre.cx - dx / p.s / iw, cy: p.cadre.cy - dy / p.s / ih }).cadre;
}

// Zoomer d'un facteur k (pincer, molette, curseur), autour du centre visible
export function zoomer(cadre, k, iw, ih, W, H) {
  const p = placement(iw, ih, W, H, cadre);
  return placement(iw, ih, W, H, { ...p.cadre, z: borne(p.cadre.z * k, 1, ZOOM_MAX) }).cadre;
}

// Cadrage gardé avec l'avion : nombres arrondis (petit, lisible), ou null s'il est illisible
export function cadrageValide(c) {
  if (!c || ![c.cx, c.cy, c.z].every(Number.isFinite)) return null;
  const r = x => Math.round(x * 10000) / 10000;
  return { cx: r(borne(c.cx, 0, 1)), cy: r(borne(c.cy, 0, 1)), z: r(borne(c.z, 1, ZOOM_MAX)) };
}
