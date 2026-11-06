// Outils de test du PDF sous Node (aucune donnée réelle) : jsPDF embarqué chargé dans un bac à sable, et un
// « enregistreur » qui note chaque case (rect) et chaque texte dessiné, avec sa taille et sa largeur réelle,
// pour vérifier qu'aucun texte ne sort de sa case et qu'il y est centré.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export function chargerJsPDF() {
  const ctx = { console, atob, btoa, TextEncoder, TextDecoder, setTimeout, Uint8Array, ArrayBuffer };
  ctx.self = ctx; ctx.window = undefined;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../../vendor/jspdf.umd.min.js', import.meta.url), 'utf8'), ctx);
  return ctx.jspdf.jsPDF;
}

// Renvoie { jsPDF (à passer à dessinerPDF), traces: [{ page, type: 'rect'|'texte', … }] }
export function enregistreur(JsPDF) {
  const traces = [];
  function Enregistre(opts) {
    const doc = new JsPDF(opts);
    let page = 1, taille = 16, style = 'normal';
    const { rect, text, addPage, setFontSize, setFont } = doc;
    doc.addPage = (...a) => { page++; return addPage.apply(doc, a); };
    doc.setFontSize = s => { taille = s; return setFontSize.call(doc, s); };
    doc.setFont = (f, st) => { style = st || 'normal'; return setFont.call(doc, f, st); };
    doc.rect = (x, y, l, h, ...a) => { traces.push({ page, type: 'rect', x, y, l, h }); return rect.call(doc, x, y, l, h, ...a); };
    doc.text = (t, x, y, o = {}) => {
      for (const [k, s] of (Array.isArray(t) ? t : [t]).entries()) {
        const yl = y + k * taille * 0.3528 * 1.15;
        traces.push({ page, type: 'texte', texte: s, x, y: yl, align: o.align || 'left', baseline: o.baseline || 'alphabetic',
          taille, style, largeur: doc.getTextWidth(s) });
      }
      return text.call(doc, t, x, y, o);
    };
    return doc;
  }
  return { jsPDF: Enregistre, traces };
}

// Boîte occupée par un texte (mm). Hauteur : majuscules et chiffres (0,72 em au-dessus de la ligne de base, 0,21 em dessous).
export function boite(t) {
  const em = t.taille * 0.3528;
  const g = t.align === 'center' ? t.x - t.largeur / 2 : t.align === 'right' ? t.x - t.largeur : t.x;
  const haut = t.baseline === 'middle' ? t.y - 0.5 * em : t.y - 0.72 * em;
  const bas = t.baseline === 'middle' ? t.y + 0.5 * em : t.y + 0.21 * em;
  return { g, d: g + t.largeur, haut, bas, cx: g + t.largeur / 2, cy: t.baseline === 'middle' ? t.y : t.y - 0.26 * em };
}

// Pour chaque texte placé dans une case : la plus petite case qui contient son point d'ancrage
export function textesDansCases(traces) {
  const cases = traces.filter(t => t.type === 'rect');
  const res = [];
  for (const t of traces.filter(x => x.type === 'texte')) {
    const b = boite(t);
    const dedans = cases.filter(c => c.page === t.page && b.cx >= c.x && b.cx <= c.x + c.l && b.cy >= c.y && b.cy <= c.y + c.h);
    if (!dedans.length) continue; // titre de page, phrase de certification : hors des cases
    const c = dedans.reduce((a, z) => (z.l * z.h < a.l * a.h ? z : a));
    res.push({ t, b, c });
  }
  return res;
}
