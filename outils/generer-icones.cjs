// Génère les icônes PNG de l'app avec Chromium (Playwright). Usage : node outils/generer-icones.cjs
const { chromium } = require('../node_modules/playwright');
const AVION = 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z';
const svg = (rayon, echelle) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" rx="${rayon}" fill="#1f4e79"/>
  <g transform="translate(50 47) scale(${echelle}) translate(-12 -12.5)"><path d="${AVION}" fill="#fff"/></g>
  <rect x="${50 - 14 * echelle / 2.6}" y="${47 + 12 * echelle}" width="${28 * echelle / 2.6}" height="${2.2 * echelle / 2.6}" rx="1" fill="#f2b300"/></svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [nom, taille, rayon, echelle] of [['icone-192', 192, 22, 2.6], ['icone-512', 512, 22, 2.6], ['icone-maskable-512', 512, 0, 1.9]]) {
    await p.setViewportSize({ width: taille, height: taille });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(rayon, echelle)}</body></html>`);
    await p.screenshot({ path: `icones/${nom}.png`, omitBackground: true });
  }
  await b.close();
})();
