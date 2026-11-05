// Sauvegarde de secours (fichier complet réimportable à l'identique) et export tableur CSV.

import { ecrireCSV } from './csv.js';
import { hmPoints, dateFr } from './temps.js';
import { colonnesAvion, COMPTEURS, FONCTIONS } from './modele.js';
import { remarqueCarnet } from './missions.js';
import { VERSION } from './version.js';

export const FORMAT = 'carnet-de-vol-sauvegarde';

// Réglages jamais copiés dans la sauvegarde (le fichier peut se retrouver sur Drive ou dans un e-mail)
export const REGLAGES_PRIVES = ['cartesMotDePasse'];

// contenu : { vols, avions, personnes, suppressions, reglages: [{cle, valeur}] }
export function creerSauvegarde(contenu, maintenant = new Date().toISOString()) {
  return {
    format: FORMAT, formatVersion: 1, versionApp: VERSION, exporteLe: maintenant,
    nombres: { vols: contenu.vols.length, avions: contenu.avions.length, personnes: contenu.personnes.length },
    vols: contenu.vols, avions: contenu.avions, personnes: contenu.personnes,
    suppressions: contenu.suppressions || [], reglages: (contenu.reglages || []).filter(r => !REGLAGES_PRIVES.includes(r.cle)),
  };
}

export const texteSauvegarde = s => JSON.stringify(s);

export function lireSauvegarde(texte) {
  let d;
  try { d = JSON.parse(texte); } catch { return { ok: false, message: "Ce fichier n'est pas une sauvegarde lisible." }; }
  if (!d || d.format !== FORMAT) return { ok: false, message: "Ce fichier n'est pas une sauvegarde Carnet de vol." };
  if (d.formatVersion > 1) return { ok: false, message: "Sauvegarde faite par une version plus récente de l'app : mets l'app à jour." };
  for (const k of ['vols', 'avions', 'personnes']) {
    if (!Array.isArray(d[k]) || d[k].length !== d.nombres?.[k]) return { ok: false, message: `Sauvegarde incomplète (${k}).` };
    if (d[k].some(o => !o || !o.id)) return { ok: false, message: `Sauvegarde abîmée (${k} sans identifiant).` };
  }
  return { ok: true, donnees: { vols: d.vols, avions: d.avions, personnes: d.personnes,
    suppressions: d.suppressions || [], reglages: d.reglages || [] }, exporteLe: d.exporteLe };
}

export function nomFichier(prefixe, extension, d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${prefixe}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}.${extension}`;
}

// ---------- Tableur ----------

const oui = b => (b ? 'oui' : '');
const D = m => hmPoints(m);

export const COLONNES_TABLEUR = [
  ['Date', v => dateFr(v.date)],
  ['Départ', v => v.dep],
  ['Heure départ bloc (UTC)', v => v.hDep || ''],
  ['Arrivée', v => v.arr],
  ['Heure arrivée bloc (UTC)', v => v.hArr || ''],
  ['Escales', v => (v.escales || []).map(e => e.code).join(' ')],
  ['Heures affichées en', v => (v.mode === 'utc' ? 'UTC' : 'LOC')],
  ['Type OACI', (v, a) => (a ? (a.sim ? 'SIM' : a.typeOACI) : '')],
  ['Modèle', (v, a) => (a ? a.modele : '')],
  ['Immatriculation', (v, a) => (a ? a.immat : '')],
  ['Simulateur', (v, a) => oui(a && a.sim)],
  ['Type FSTD', (v, a) => (a && a.sim ? (a.fstd || '') : '')],
  ['Monopilote SE', (v, a, c) => D(c.se)],
  ['Monopilote ME', (v, a, c) => D(c.me)],
  ['Multipilote', (v, a, c) => D(c.mp)],
  ['Temps total', v => D(v.tempsTotal)],
  ['Nom du CdB', v => v.nomCdB],
  ['Ma fonction', v => FONCTIONS[v.fonction]?.libelle || ''],
  ['Nom copi', v => v.nomCopi],
  ['Nom élève', v => v.nomEleve],
  ['Nom instructeur', v => v.nomInstructeur],
  ['Nom examinateur', v => v.nomExaminateur],
  ['Atterrissages jour', v => v.attJour || 0],
  ['Atterrissages nuit', v => v.attNuit || 0],
  ['Décollages jour', v => v.decJour || ''],
  ['Décollages nuit', v => v.decNuit || ''],
  ['Temps nuit', v => D(v.tempsNuit)],
  ['Temps IFR', v => D(v.tempsIFR)],
  ['Tout le vol en IFR', v => oui(v.regleIFR)],
  ['Approches', v => v.approches || ''],
  ["Type d'approche", v => v.approcheType],
  ['Temps CdB', v => D(v.tempsCdB)],
  ['Temps copilote', v => D(v.tempsCopi)],
  ['Temps double commande', v => D(v.tempsDC)],
  ['Temps instructeur', v => D(v.tempsInst)],
  ['Temps PICUS', v => D(v.tempsPICUS)],
  ['Temps examinateur', v => D(v.tempsExam)],
  ['Temps cross-country', v => D(v.tempsXC)],
  ['Temps simulateur', v => D(v.simTemps)],
  ['Indicatif', v => v.indicatif],
  ['Étiquettes', v => (v.etiquettes || []).join(', ')],
  ['Missions', v => (v.missions || []).join(' + ')],
  ['Feux (nouveaux)', v => v.feux || 0],
  ...COMPTEURS.map(c => [c.nom, v => (v.compteurs && v.compteurs[c.cle]) || 0]),
  ['Remarque du carnet', v => remarqueCarnet(v)],
  ['Remarques et visas', v => v.remarques],
  ['Note personnelle', v => v.notePerso],
  ['Origine', v => (v.source === 'flylog' ? 'FlyLog' : 'Saisie')],
  ['Identifiant', v => v.id],
  ['Modifié le', v => v.modifieLe],
];

// vols : ordre chronologique ; avions : Map id -> avion
export function texteTableur(vols, avions) {
  const lignes = vols.map(v => {
    const a = avions.get(v.avionId);
    const c = colonnesAvion(v, a);
    return COLONNES_TABLEUR.map(([, f]) => f(v, a, c) ?? '');
  });
  return ecrireCSV(COLONNES_TABLEUR.map(([t]) => t), lignes);
}

// Encart « sauvegarde » en haut de Plus : à faire si jamais faite ou plus de 7 jours (date affichée en heure du téléphone)
const jjmm = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
export function etatSauvegarde(derniere, maintenant = Date.now()) {
  const jours = derniere ? Math.floor((maintenant - Date.parse(derniere)) / 864e5) : null;
  if (jours === null) return { ok: false, titre: 'Aucune sauvegarde', texte: 'Tes vols ne sont que sur ce téléphone.' };
  if (jours > 7) return { ok: false, titre: `Pas de sauvegarde depuis ${jours} jours`, texte: 'Tes vols ne sont que sur ce téléphone.' };
  return { ok: true, titre: `Sauvegardé le ${jjmm(new Date(derniere))}`, texte: 'Sauvegarde de secours à jour.' };
}
