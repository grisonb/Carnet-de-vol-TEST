// v0.38 (R93) : fenêtre « Recadrer la photo » (glisser pour déplacer, pincer / molette / curseur pour zoomer) et
// affichage de la photo cadrée dans le bandeau de la fiche avion. Le calcul est dans js/cadrage.js.
// La photo d'origine n'est jamais modifiée : seul le cadrage { cx, cy, z } est gardé avec l'avion.

import { $ } from './commun.js';
import { placement, deplacer, zoomer, cadrageValide, ZOOM_MAX } from '../cadrage.js';

// Place une image dans sa boîte selon le cadrage ; sans cadrage : affichage d'avant (centré, remplit le bandeau)
export function placerPhoto(img, boite, cadre) {
  if (!img) return;
  if (!cadre) { img.removeAttribute('style'); return; }
  const W = boite.clientWidth, H = boite.clientHeight, iw = img.naturalWidth, ih = img.naturalHeight;
  if (!W || !H || !iw || !ih) return; // pas encore affichée ou pas encore chargée : refait plus tard
  const p = placement(iw, ih, W, H, cadre);
  Object.assign(img.style, { position: 'absolute', left: `${p.left}px`, top: `${p.top}px`, width: `${p.w}px`, height: `${p.h}px`,
    maxWidth: 'none', objectFit: 'fill' });
}

// Bandeau de la fiche : la photo (avec son cadrage) suit les changements de taille et le chargement de l'image
let bandeau = null;
export function afficherPhotoCadree(conteneur, boite, src, cadre, alt = '') {
  conteneur.innerHTML = `<img src="${src}" alt="">`;
  const img = conteneur.querySelector('img');
  img.alt = alt;
  bandeau = { img, boite, cadre };
  const placer = () => placerPhoto(img, boite, cadre);
  if (img.complete) placer(); else img.addEventListener('load', placer, { once: true });
}
export function suivreBandeau(boite) {
  if (window.ResizeObserver) new ResizeObserver(() => { if (bandeau && bandeau.boite === boite) placerPhoto(bandeau.img, boite, bandeau.cadre); }).observe(boite);
}

// Fenêtre de recadrage. ratio = largeur / hauteur du bandeau (sur cet appareil). Renvoie le cadrage choisi (Valider)
// ou null (Annuler, flèche retour).
let enCours = null;
export function ouvrirCadrage(src, cadre, ratio) {
  if (enCours) enCours(null);
  const m = $('#rc-modal'), zone = $('#rc-zone'), img = $('#rc-img'), zoom = $('#rc-zoom');
  let c = { cx: 0.5, cy: 0.5, z: 1, ...(cadre || {}) };
  return new Promise(fin => {
    m.hidden = false;
    // Taille du cadre : la largeur disponible, à la proportion exacte du bandeau
    const largeur = Math.min(zone.parentElement.clientWidth - 4, 640); // - 4 : bordure blanche du cadre
    zone.style.width = `${largeur}px`; zone.style.height = `${largeur / ratio}px`; // sans arrondi : exactement la proportion du bandeau
    const dims = () => [img.naturalWidth, img.naturalHeight, zone.clientWidth, zone.clientHeight];
    const rendre = () => {
      const [iw, ih, W, H] = dims();
      if (!iw || !W) return;
      c = placement(iw, ih, W, H, c).cadre;
      placerPhoto(img, zone, c);
      zoom.value = String(c.z);
    };
    zoom.max = String(ZOOM_MAX);
    img.onload = rendre;
    img.src = src;
    if (img.complete) rendre();
    // Doigts / souris : un pointeur = déplacer, deux pointeurs = pincer
    const pts = new Map();
    let ecart = 0;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const bas = e => { try { zone.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) ecart = dist(); e.preventDefault(); };
    const bouge = e => {
      if (!pts.has(e.pointerId)) return;
      const avant = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) c = deplacer(c, e.clientX - avant.x, e.clientY - avant.y, ...dims());
      else if (pts.size === 2) { const d = dist(); if (ecart > 0) c = zoomer(c, d / ecart, ...dims()); ecart = d; }
      rendre(); e.preventDefault();
    };
    const haut = e => { pts.delete(e.pointerId); if (pts.size === 2) ecart = dist(); };
    const molette = e => { c = zoomer(c, Math.exp(-e.deltaY * 0.0015), ...dims()); rendre(); e.preventDefault(); };
    const curseur = () => { c = zoomer(c, Number(zoom.value) / c.z, ...dims()); rendre(); };
    zone.addEventListener('pointerdown', bas); zone.addEventListener('pointermove', bouge);
    zone.addEventListener('pointerup', haut); zone.addEventListener('pointercancel', haut);
    zone.addEventListener('wheel', molette, { passive: false });
    zoom.addEventListener('input', curseur);
    const terminer = res => {
      enCours = null;
      zone.removeEventListener('pointerdown', bas); zone.removeEventListener('pointermove', bouge);
      zone.removeEventListener('pointerup', haut); zone.removeEventListener('pointercancel', haut);
      zone.removeEventListener('wheel', molette); zoom.removeEventListener('input', curseur);
      $('#rc-oui').onclick = null; $('#rc-non').onclick = null; obs.disconnect();
      m.hidden = true;
      fin(res);
    };
    enCours = terminer;
    $('#rc-oui').onclick = () => terminer(cadrageValide(c));
    $('#rc-non').onclick = () => terminer(null);
    // flèche retour (retour.js) ou autre fermeture : comme « Annuler »
    const obs = new MutationObserver(() => { if (m.hidden && enCours === terminer) terminer(null); });
    obs.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  });
}
