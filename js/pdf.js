// Export PDF au format du carnet de vol EASA (AMC1 FCL.050), A4 paysage.
// Totaux de page, totaux reportés des pages précédentes, cumuls, case signature.
// Les colonnes métier (feux, largages…) n'y figurent pas.

import { colonnesAvion } from './modele.js';
import { remarqueCarnet } from './missions.js';
import { hmPoints } from './temps.js';

export const LIGNES_PAR_PAGE = 18;
export const COLONNES_TOTAUX = ['se', 'me', 'mp', 'total', 'attJour', 'attNuit', 'approches', 'nuit', 'ifr',
  'cdb', 'copi', 'dc', 'inst', 'sim'];
const NOMBRES = new Set(['attJour', 'attNuit', 'approches']);

export const totauxVides = () => Object.fromEntries(COLONNES_TOTAUX.map(k => [k, 0]));

// Valeurs EASA d'un vol (avion : sa fiche)
export function valeursVol(v, avion) {
  const sim = Boolean(avion && avion.sim) || v.simTemps > 0;
  const c = colonnesAvion(v, avion);
  return {
    se: c.se, me: c.me, mp: c.mp, total: sim ? 0 : (v.tempsTotal || 0),
    attJour: v.attJour || 0, attNuit: v.attNuit || 0, approches: v.approches || 0,
    nuit: v.tempsNuit || 0, ifr: v.tempsIFR || 0,
    cdb: v.tempsCdB || 0, copi: v.tempsCopi || 0, dc: v.tempsDC || 0, inst: v.tempsInst || 0,
    sim: v.simTemps || 0, estSim: sim,
  };
}

function ajouter(t, val) { for (const k of COLONNES_TOTAUX) t[k] += val[k] || 0; return t; }

export function totauxPDF(vols, avions) {
  const t = totauxVides();
  for (const v of vols) ajouter(t, valeursVol(v, avions.get(v.avionId)));
  return t;
}

// Découpe en pages. vols : ordre chronologique ; report : totaux des vols antérieurs à la période.
export function paginer(vols, avions, lignesParPage = LIGNES_PAR_PAGE, report = totauxVides()) {
  const pages = [];
  let cumul = { ...report };
  const debuts = [];
  for (let i = 0; i < vols.length; i += lignesParPage) debuts.push(i);
  if (!debuts.length) debuts.push(0);
  for (const i of debuts) {
    const lot = vols.slice(i, i + lignesParPage);
    const page = totauxPDF(lot, avions);
    const avant = { ...cumul };
    cumul = Object.fromEntries(COLONNES_TOTAUX.map(k => [k, avant[k] + page[k]]));
    pages.push({ numero: pages.length + 1, vols: lot, totalPage: page, report: avant, cumul });
  }
  return pages;
}

// Les polices standard du PDF ne connaissent que l'alphabet latin : on remplace le reste.
export function texteLatin(s) {
  return String(s ?? '')
    .replace(/[•‧∙]/g, '·').replace(/[–—−]/g, '-').replace(/[‘’ʼ]/g, "'").replace(/[“”«»]/g, '"')
    .replace(/…/g, '...').replace(/[  ]/g, ' ')
    .replace(/[^\x00-\xFF]/g, '?');
}

// ---------- Dessin ----------

const dateCourte = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');

// [clé, largeur mm, groupe, sous-titre] ; largeur 0 = le reste (remarques)
const COLS = [
  ['date', 13, 'DATE', 'jj/mm/aa'],
  ['dep', 10, 'DÉPART', 'Lieu'], ['hdep', 9, 'DÉPART', 'Heure'],
  ['arr', 10, 'ARRIVÉE', 'Lieu'], ['harr', 9, 'ARRIVÉE', 'Heure'],
  ['modele', 16, 'AÉRONEF', 'Modèle'], ['immat', 14, 'AÉRONEF', 'Immat.'],
  ['se', 10, 'MONO-PILOTE', 'SE'], ['me', 10, 'MONO-PILOTE', 'ME'],
  ['mp', 10, 'MULTI-', 'PILOTE'],
  ['total', 11, 'DURÉE', 'TOTALE'],
  ['nomcdb', 15, 'NOM DU', 'CdB'],
  ['attJour', 7, 'ATTERR.', 'Jour'], ['attNuit', 7, 'ATTERR.', 'Nuit'],
  ['approches', 7, 'APPR.', 'IFR'],
  ['nuit', 10, 'CONDITIONS', 'Nuit'], ['ifr', 10, 'CONDITIONS', 'IFR'],
  ['cdb', 11, 'TEMPS DE FONCTION', 'CdB'], ['copi', 11, 'TEMPS DE FONCTION', 'Copilote'],
  ['dc', 11, 'TEMPS DE FONCTION', 'Double'], ['inst', 11, 'TEMPS DE FONCTION', 'Instruct.'],
  ['simtype', 12, 'FSTD', 'Type'], ['sim', 10, 'FSTD', 'Durée'],
  ['rem', 0, 'REMARQUES', 'et visas'],
];
const TOTALISEES = new Set(COLONNES_TOTAUX);

function cellule(cle, v, val, avion) {
  const s = val.estSim;
  switch (cle) {
    case 'date': return dateCourte(v.date);
    case 'dep': return s ? '' : v.dep;
    case 'hdep': return s ? '' : (v.hDep || '');
    case 'arr': return s ? '' : v.arr;
    case 'harr': return s ? '' : (v.hArr || '');
    case 'modele': return s || !avion ? '' : (avion.modele || avion.typeOACI);
    case 'immat': return s || !avion ? '' : avion.immat;
    case 'nomcdb': return v.nomCdB || '';
    case 'simtype': return s && avion ? [avion.immat, avion.fstd].filter(Boolean).join(' ') : '';
    case 'rem': return remarqueCarnet(v);
    default:
      if (NOMBRES.has(cle)) return val[cle] ? String(val[cle]) : '';
      return hmPoints(val[cle]);
  }
}

const celluleTotal = (cle, t) => (NOMBRES.has(cle) ? String(t[cle]) : (hmPoints(t[cle]) || '0:00'));

function tronquer(doc, texte, largeur) {
  if (doc.getTextWidth(texte) <= largeur) return texte;
  let s = texte;
  while (s.length > 1 && doc.getTextWidth(s + '...') > largeur) s = s.slice(0, -1);
  return s + '...';
}

// jsPDF : le constructeur (window.jspdf.jsPDF). avions : Map id -> avion.
export async function dessinerPDF(jsPDF, pages, avions, { titulaire = '', periode = '', lignesParPage = LIGNES_PAR_PAGE, pause } = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const marge = 7, largeurPage = 297;
  const cols = COLS.map(c => [...c]);
  cols[cols.length - 1][1] = largeurPage - 2 * marge - COLS.reduce((s, c) => s + c[1], 0);
  const hLigne = 7, hTotal = 5.5;
  const T = s => texteLatin(s);

  for (const p of pages) {
    if (p.numero > 1) doc.addPage();
    let y = marge;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(T('CARNET DE VOL'), marge, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(T(`Titulaire : ${titulaire || '-'}`), marge + 38, y + 4);
    if (periode) doc.text(T(`Période : ${periode}`), marge + 120, y + 4);
    doc.text(T(`Heures en UTC · Page ${p.numero} / ${pages.length}`), largeurPage - marge, y + 4, { align: 'right' });
    y += 7;

    doc.setLineWidth(0.2); doc.setFontSize(5.4); doc.setFont('helvetica', 'bold');
    let x = marge;
    for (let i = 0; i < cols.length;) {
      let j = i, w = 0;
      while (j < cols.length && cols[j][2] === cols[i][2]) { w += cols[j][1]; j++; }
      doc.rect(x, y, w, 5);
      doc.text(T(cols[i][2]), x + w / 2, y + 3.4, { align: 'center', maxWidth: w - 0.6 });
      x += w; i = j;
    }
    y += 5;
    doc.setFont('helvetica', 'normal');
    x = marge;
    for (const c of cols) {
      doc.rect(x, y, c[1], 4);
      doc.text(T(c[3]), x + c[1] / 2, y + 2.9, { align: 'center' });
      x += c[1];
    }
    y += 4;

    for (let r = 0; r < lignesParPage; r++) {
      const v = p.vols[r];
      const avion = v && avions.get(v.avionId);
      const val = v && valeursVol(v, avion);
      x = marge;
      for (const c of cols) {
        doc.rect(x, y, c[1], hLigne);
        if (v) {
          const t = T(cellule(c[0], v, val, avion));
          if (t && c[0] === 'rem') {
            doc.setFontSize(5.6);
            const l = doc.splitTextToSize(t, c[1] - 1.2);
            const l2 = l.length > 2 ? [l[0], tronquer(doc, l.slice(1).join(' '), c[1] - 1.2)] : l;
            doc.text(l2, x + 0.6, y + 2.7);
            doc.setFontSize(6.4);
          } else if (t) {
            doc.setFontSize(6.4);
            const txt = tronquer(doc, t, c[1] - 1);
            if (TOTALISEES.has(c[0])) doc.text(txt, x + c[1] - 0.6, y + 4.4, { align: 'right' });
            else doc.text(txt, x + 0.6, y + 4.4);
          }
        }
        x += c[1];
      }
      y += hLigne;
    }

    const largeurLibelle = cols.slice(0, 7).reduce((s, c) => s + c[1], 0);
    for (const [libelle, t] of [['TOTAL DE CETTE PAGE', p.totalPage], ['TOTAL DES PAGES PRÉCÉDENTES', p.report], ['TOTAL GÉNÉRAL', p.cumul]]) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2);
      doc.rect(marge, y, largeurLibelle, hTotal);
      doc.text(T(libelle), marge + 1, y + 3.7);
      doc.setFont('helvetica', 'normal');
      x = marge + largeurLibelle;
      for (const c of cols.slice(7)) {
        if (TOTALISEES.has(c[0])) {
          doc.rect(x, y, c[1], hTotal);
          doc.text(celluleTotal(c[0], t), x + c[1] - 0.6, y + 3.7, { align: 'right' });
        }
        x += c[1];
      }
      y += hTotal;
    }

    y += 3;
    doc.setFontSize(7.5);
    doc.text(T('Je certifie que les renseignements portés sur cette page sont exacts.'), marge, y + 4);
    doc.text(T('Signature du pilote :'), largeurPage - marge - 92, y + 4);
    doc.rect(largeurPage - marge - 62, y, 62, 13);

    if (pause && p.numero % 10 === 0) await pause();
  }
  return doc;
}
