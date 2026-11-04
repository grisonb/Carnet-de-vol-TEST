// Petits drapeaux nationaux dessinés par l'app (SVG), sans emoji ni image externe.
// Dessins simplifiés, lisibles à 20 × 14 px. Pays inconnu : drapeau gris neutre.

const W = 30, H = 20;
const rect = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;

// Bandes verticales ('v') ou horizontales ('h'), avec poids facultatifs
function bandes(sens, couleurs, poids) {
  const p = poids || couleurs.map(() => 1);
  const total = p.reduce((a, b) => a + b, 0);
  let pos = 0, s = '';
  couleurs.forEach((c, i) => {
    const t = (sens === 'v' ? W : H) * p[i] / total;
    s += sens === 'v' ? rect(pos, 0, t + 0.05, H, c) : rect(0, pos, W, t + 0.05, c);
    pos += t;
  });
  return s;
}
// Croix nordique (décalée vers la hampe) ou centrée ; interieur = seconde croix plus fine
function croix(fond, c1, c2, centree) {
  const x = centree ? W / 2 : 11, e1 = centree ? 4 : 5, e2 = 2.5;
  let s = rect(0, 0, W, H, fond) + rect(x - e1 / 2, 0, e1, H, c1) + rect(0, H / 2 - e1 / 2, W, e1, c1);
  if (c2) s += rect(x - e2 / 2, 0, e2, H, c2) + rect(0, H / 2 - e2 / 2, W, e2, c2);
  return s;
}
const disque = (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`;
const triangle = (pts, c) => `<polygon points="${pts}" fill="${c}"/>`;

const FR = bandes('v', ['#002395', '#fff', '#ED2939']);

const D = {
  FR, RE: FR, YT: FR, GP: FR, MQ: FR, GF: FR, PM: FR, BL: FR, MF: FR, NC: FR, PF: FR, WF: FR, TF: FR,
  DE: bandes('h', ['#000', '#DD0000', '#FFCE00']),
  BE: bandes('v', ['#000', '#FDDA24', '#EF3340']),
  IT: bandes('v', ['#009246', '#fff', '#CE2B37']),
  IE: bandes('v', ['#169B62', '#fff', '#FF883E']),
  NL: bandes('h', ['#AE1C28', '#fff', '#21468B']),
  LU: bandes('h', ['#ED2939', '#fff', '#00A1DE']),
  AT: bandes('h', ['#ED2939', '#fff', '#ED2939']),
  ES: bandes('h', ['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1]),
  PT: bandes('v', ['#006600', '#FF0000'], [2, 3]) + disque(12, 10, 3.5, '#FFCC00'),
  CH: rect(0, 0, W, H, '#DA291C') + rect(13, 4, 4, 12, '#fff') + rect(9, 8, 12, 4, '#fff'),
  DK: croix('#C8102E', '#fff'),
  SE: croix('#006AA7', '#FECC00'),
  NO: croix('#BA0C2F', '#fff', '#00205B'),
  FI: croix('#fff', '#002F6C'),
  IS: croix('#02529C', '#fff', '#DC1E35'),
  GB: rect(0, 0, W, H, '#012169') + '<path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/>'
    + '<path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.5"/>'
    + rect(12, 0, 6, H, '#fff') + rect(0, 7, W, 6, '#fff') + rect(13.25, 0, 3.5, H, '#C8102E') + rect(0, 8.25, W, 3.5, '#C8102E'),
  PL: bandes('h', ['#fff', '#DC143C']),
  CZ: bandes('h', ['#fff', '#D7141A']) + triangle('0,0 15,10 0,20', '#11457E'),
  SK: bandes('h', ['#fff', '#0B4EA2', '#EE1C25']),
  HU: bandes('h', ['#CE2939', '#fff', '#477050']),
  RO: bandes('v', ['#002B7F', '#FCD116', '#CE1126']),
  BG: bandes('h', ['#fff', '#00966E', '#D62612']),
  GR: bandes('h', ['#0D5EAF', '#fff', '#0D5EAF', '#fff', '#0D5EAF', '#fff', '#0D5EAF', '#fff', '#0D5EAF'])
    + rect(0, 0, 11.1, 11.1, '#0D5EAF') + rect(4.45, 0, 2.2, 11.1, '#fff') + rect(0, 4.45, 11.1, 2.2, '#fff'),
  HR: bandes('h', ['#FF0000', '#fff', '#171796']) + rect(12, 5, 6, 7, '#FF0000'),
  SI: bandes('h', ['#fff', '#0000FF', '#FF0000']),
  RS: bandes('h', ['#C6363C', '#0C4076', '#fff']),
  BA: rect(0, 0, W, H, '#002395') + triangle('8,0 22,0 22,20', '#FECB00'),
  ME: rect(0, 0, W, H, '#D3AE3B') + rect(1.5, 1.5, 27, 17, '#C40308'),
  MK: rect(0, 0, W, H, '#D20000') + disque(15, 10, 4, '#FFE600'),
  AL: rect(0, 0, W, H, '#E41E20') + disque(15, 10, 5, '#000'),
  XK: rect(0, 0, W, H, '#244AA5') + disque(15, 11, 4, '#D0A650'),
  EE: bandes('h', ['#0072CE', '#000', '#fff']),
  LV: bandes('h', ['#9E3039', '#fff', '#9E3039'], [2, 1, 2]),
  LT: bandes('h', ['#FDB913', '#006A44', '#C1272D']),
  UA: bandes('h', ['#0057B7', '#FFD700']),
  BY: bandes('h', ['#C8313E', '#4AA657'], [2, 1]),
  RU: bandes('h', ['#fff', '#0039A6', '#D52B1E']),
  MD: bandes('v', ['#003DA5', '#FFD200', '#CC092F']),
  TR: rect(0, 0, W, H, '#E30A17') + disque(12, 10, 5, '#fff') + disque(13.3, 10, 4, '#E30A17') + disque(19, 10, 1.6, '#fff'),
  CY: rect(0, 0, W, H, '#fff') + disque(15, 9, 4, '#D57800'),
  MT: bandes('v', ['#fff', '#CF142B']),
  MC: bandes('h', ['#CE1126', '#fff']), ID: bandes('h', ['#CE1126', '#fff']),
  AD: bandes('v', ['#10069F', '#FEDD00', '#D50032']),
  LI: bandes('h', ['#002B7F', '#CE1126']),
  SM: bandes('h', ['#fff', '#5EB6E4']), VA: bandes('v', ['#FFE000', '#fff']),
  MA: rect(0, 0, W, H, '#C1272D') + disque(15, 10, 3, '#006233'),
  DZ: bandes('v', ['#006233', '#fff']) + disque(15, 10, 5, '#D21034') + disque(16.5, 10, 4.2, '#fff'),
  TN: rect(0, 0, W, H, '#E70013') + disque(15, 10, 5, '#fff') + disque(15.6, 10, 3, '#E70013'),
  LY: bandes('h', ['#E70013', '#000', '#239E46'], [1, 2, 1]),
  EG: bandes('h', ['#CE1126', '#fff', '#000']),
  ET: bandes('h', ['#078930', '#FCDD09', '#DA121A']) + disque(15, 10, 4, '#0F47AF'),
  DJ: bandes('h', ['#6AB2E7', '#12AD2B']) + triangle('0,0 14,10 0,20', '#fff'),
  KE: bandes('h', ['#000', '#fff', '#BB0000', '#fff', '#006600'], [6, 1, 6, 1, 6]),
  TZ: rect(0, 0, W, H, '#1EB53A') + triangle('30,0 30,20 0,20', '#00A3DD')
    + '<path d="M0 20L30 0" stroke="#FCD116" stroke-width="7"/><path d="M0 20L30 0" stroke="#000" stroke-width="4.5"/>',
  UG: bandes('h', ['#000', '#FCDC04', '#D90000', '#000', '#FCDC04', '#D90000']),
  RW: bandes('h', ['#00A1DE', '#FAD201', '#20603D'], [2, 1, 1]),
  SN: bandes('v', ['#00853F', '#FDEF42', '#E31B23']), ML: bandes('v', ['#14B53A', '#FCD116', '#CE1126']),
  GN: bandes('v', ['#CE1126', '#FCD116', '#009460']), CI: bandes('v', ['#F77F00', '#fff', '#009E60']),
  NE: bandes('h', ['#E05206', '#fff', '#0DB02B']) + disque(15, 10, 2.2, '#E05206'),
  TD: bandes('v', ['#002664', '#FECB00', '#C60C30']), CM: bandes('v', ['#007A5E', '#CE1126', '#FCD116']),
  GA: bandes('h', ['#009E60', '#FCD116', '#3A75C4']), NG: bandes('v', ['#008751', '#fff', '#008751']),
  GH: bandes('h', ['#CE1126', '#FCD116', '#006B3F']), BF: bandes('h', ['#EF2B2D', '#009E49']),
  BJ: bandes('h', ['#FCD116', '#E8112D']) + rect(0, 0, 12, H, '#008751'),
  TG: bandes('h', ['#006A4E', '#FFCE00', '#006A4E', '#FFCE00', '#006A4E']) + rect(0, 0, 12, 12, '#D21034'),
  CG: rect(0, 0, W, H, '#009543') + triangle('30,0 30,20 0,20', '#DC241F') + '<path d="M0 20L30 0" stroke="#FBDE4A" stroke-width="6"/>',
  CD: rect(0, 0, W, H, '#007FFF') + '<path d="M0 20L30 0" stroke="#F7D618" stroke-width="7"/><path d="M0 20L30 0" stroke="#CE1021" stroke-width="4"/>',
  MG: bandes('h', ['#FC3D32', '#007E3A']) + rect(0, 0, 10, H, '#fff'),
  MU: bandes('h', ['#EA2839', '#1A206D', '#FFD500', '#00A551']),
  KM: bandes('h', ['#FFC61E', '#fff', '#CE1126', '#3A75C4']) + triangle('0,0 13,10 0,20', '#3D8E33'),
  SC: rect(0, 0, W, H, '#003F87') + triangle('0,20 12,0 30,0 30,6', '#FCD856') + triangle('0,20 30,6 30,14', '#D62828') + triangle('0,20 30,14 30,20', '#007A3D'),
  ZA: bandes('h', ['#E03C31', '#fff', '#007749', '#fff', '#001489'], [6, 1, 6, 1, 6]) + triangle('0,0 12,10 0,20', '#000'),
  MR: rect(0, 0, W, H, '#00A95C') + disque(15, 10, 4, '#FFD700'),
  SD: bandes('h', ['#D21034', '#fff', '#000']) + triangle('0,0 11,10 0,20', '#007229'),
  AM: bandes('h', ['#D90012', '#0033A0', '#F2A800']),
  GE: rect(0, 0, W, H, '#fff') + rect(13, 0, 4, H, '#FF0000') + rect(0, 8, W, 4, '#FF0000'),
  AZ: bandes('h', ['#0092BC', '#E4002B', '#00AF66']),
  IL: rect(0, 0, W, H, '#fff') + rect(0, 2, W, 3, '#0038B8') + rect(0, 15, W, 3, '#0038B8'),
  JO: bandes('h', ['#000', '#fff', '#007A3D']) + triangle('0,0 14,10 0,20', '#CE1126'),
  LB: bandes('h', ['#ED1C24', '#fff', '#ED1C24'], [1, 2, 1]) + disque(15, 10, 3, '#00A651'),
  SA: rect(0, 0, W, H, '#006C35'), QA: rect(0, 0, W, H, '#8A1538') + rect(0, 0, 9, H, '#fff'),
  AE: bandes('h', ['#00732F', '#fff', '#000']) + rect(0, 0, 8, H, '#FF0000'),
  IN: bandes('h', ['#FF9933', '#fff', '#138808']) + disque(15, 10, 2.5, '#000080'),
  JP: rect(0, 0, W, H, '#fff') + disque(15, 10, 6, '#BC002D'),
  CN: rect(0, 0, W, H, '#DE2910') + disque(6, 5, 2.5, '#FFDE00'),
  US: bandes('h', Array.from({ length: 13 }, (_, i) => (i % 2 ? '#fff' : '#B22234'))) + rect(0, 0, 13, 10.8, '#3C3B6E'),
  CA: bandes('v', ['#FF0000', '#fff', '#FF0000'], [1, 2, 1]) + rect(12, 6, 6, 8, '#FF0000'),
  BR: rect(0, 0, W, H, '#009C3B') + triangle('15,2 28,10 15,18 2,10', '#FFDF00') + disque(15, 10, 4.5, '#002776'),
  AU: rect(0, 0, W, H, '#012169') + disque(8, 15, 2, '#fff') + disque(23, 10, 1.3, '#fff'),
  NZ: rect(0, 0, W, H, '#012169') + disque(22, 8, 1.3, '#C8102E') + disque(24, 13, 1.3, '#C8102E'),
  MX: bandes('v', ['#006847', '#fff', '#CE1126']) + disque(15, 10, 2.5, '#8C5A2B'),
  AR: bandes('h', ['#74ACDF', '#fff', '#74ACDF']) + disque(15, 10, 2, '#F6B40E'),
};

const NEUTRE = rect(0, 0, W, H, '#C9D1D9');
const cache = new Map();

// Code pays ISO (2 lettres) -> SVG inline. nomPays sert d'étiquette d'accessibilité.
export function drapeau(pays, nomPays = '') {
  const cle = pays || '';
  if (!cache.has(cle)) {
    const corps = D[cle] || NEUTRE;
    cache.set(cle, `<svg class="flag" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${nomPays || cle || 'pays inconnu'}">${corps}</svg>`);
  }
  return cache.get(cle);
}

export const paysDessines = () => Object.keys(D);
