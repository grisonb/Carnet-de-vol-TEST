// Import d'un export FlyLog : 46 colonnes standard + FEU, LARGAGES_CDB_DASH,
// LARGAGES_INSTRUCTION_CDB_DASH (décodées) + DECODAGE (note, ignorée).
// Les heures FlyLog sont en UTC ; les vols importés s'affichent en LOC.

import { lireCSVObjets } from './csv.js';
import { lireDuree, lireHeure, dateValide } from './temps.js';
import { volVide, avionVide, personneVide, horodater, formaterImmat, cleDoublon, nomPersonne,
  etiquettesParDefaut, completerNomIndicatif } from './modele.js';
import { lignesDepuisRemarque } from './missions.js';
import { indexTypes, caracteristiquesDuType } from './types-avion.js';

export const COLONNES_OBLIGATOIRES = ['DATE', 'DEPARTURE_AIRPORT', 'ARRIVAL_AIRPORT', 'AIRCRAFT_TYPE',
  'AIRCRAFT_REGISTRATION', 'DURATION_BLOCK', 'TIME_BLOCK_START', 'TIME_BLOCK_END', 'DURATION_PIC',
  'DURATION_SIC', 'DURATION_MULTI_PILOT', 'LDGS_DAY', 'LDGS_NIGHT', 'NAME_PIC', 'ROUTE'];

const DUREES = {
  DURATION_BLOCK: 'tempsTotal', DURATION_PIC: 'tempsCdB', DURATION_PICUS: 'tempsPICUS', DURATION_SIC: 'tempsCopi',
  DURATION_DUAL: 'tempsDC', DURATION_INSTRUCTOR: 'tempsInst', DURATION_EXAMINER: 'tempsExam',
  DURATION_NIGHT: 'tempsNuit', DURATION_IFR: 'tempsIFR', DURATION_XC: 'tempsXC', DURATION_SIMULATOR: 'simTemps',
};
const ENTIERS = { LDGS_DAY: 'attJour', LDGS_NIGHT: 'attNuit', TAKEOFFS_DAY: 'decJour', TAKEOFFS_NIGHT: 'decNuit',
  APPROACH_NR: 'approches', FEU: 'feux' };
const COMPTEURS_FLYLOG = { LARGAGES_CDB_DASH: 'largCdbDash', LARGAGES_INSTRUCTION_CDB_DASH: 'largInstrCdbDash' };
const NOMS = { NAME_COPILOT: 'nomCopi', NAME_STUDENT: 'nomEleve', NAME_INSTRUCTOR: 'nomInstructeur', NAME_EXAMINER: 'nomExaminateur' };

const texte = v => String(v ?? '').trim();

// Une ligne -> { vol, immat, type, sim, erreurs }
export function convertirLigne(l, numero) {
  const v = volVide();
  const erreurs = [];
  const err = m => erreurs.push(`Ligne ${numero} : ${m}`);

  v.date = texte(l.DATE);
  if (!dateValide(v.date)) err(`date invalide « ${v.date} »`);
  v.dep = texte(l.DEPARTURE_AIRPORT).toUpperCase();
  v.arr = texte(l.ARRIVAL_AIRPORT).toUpperCase();
  v.route = texte(l.ROUTE);
  const pts = v.route.split('|').map(s => s.trim().toUpperCase());
  v.escales = pts.length > 2 ? pts.slice(1, -1).filter(Boolean).map(code => ({ code, attJour: 0, attNuit: 0 })) : [];

  for (const [col, cle] of Object.entries(DUREES)) {
    const d = lireDuree(l[col]);
    if (Number.isNaN(d)) err(`durée invalide ${col} « ${l[col]} »`);
    else v[cle] = d || 0;
  }
  const mp = lireDuree(l.DURATION_MULTI_PILOT);
  if (Number.isNaN(mp)) err(`durée invalide DURATION_MULTI_PILOT « ${l.DURATION_MULTI_PILOT} »`);
  else v.tempsMP = mp; // vide -> null : déduit de la fiche avion

  const entier = (col, defaut = 0) => {
    const s = texte(l[col]);
    if (s === '') return defaut;
    if (!/^\d+$/.test(s)) { err(`nombre invalide ${col} « ${s} »`); return defaut; }
    return Number(s);
  };
  for (const [col, cle] of Object.entries(ENTIERS)) v[cle] = entier(col);
  for (const [col, cle] of Object.entries(COMPTEURS_FLYLOG)) v.compteurs[cle] = entier(col);

  // Heures bloc UTC. Anciens vols : 00:00 au départ et rien à l'arrivée = heures inconnues.
  const hd = texte(l.TIME_BLOCK_START), ha = texte(l.TIME_BLOCK_END);
  if (!(hd === '00:00' && ha === '')) {
    v.hDep = hd ? lireHeure(hd) : null;
    v.hArr = ha ? lireHeure(ha) : null;
    if (hd && !v.hDep) err(`heure de départ invalide « ${hd} »`);
    if (ha && !v.hArr) err(`heure d'arrivée invalide « ${ha} »`);
  }
  v.mode = 'loc';
  v.regleIFR = v.tempsTotal > 0 && v.tempsIFR >= v.tempsTotal;
  v.approcheType = texte(l.APPROACH_TYPE);
  v.simType = texte(l.SIMULATOR_TYPE);
  v.missions = lignesDepuisRemarque(texte(l.REMARKS));
  v.notePerso = texte(l.PERSONAL_NOTE);
  v.indicatif = texte(l.FLIGHT_NUMBER).toUpperCase();
  v.etiquettes = texte(l.TAGS) ? texte(l.TAGS).split(/[,;|]/).map(t => t.trim().toUpperCase()).filter(Boolean) : [];

  v.nomCdB = texte(l.NAME_PIC) || '';
  for (const [col, cle] of Object.entries(NOMS)) v[cle] = texte(l[col]);
  v.fonction = v.tempsInst ? 'inst' : v.tempsCdB ? 'cdb' : v.tempsCopi ? 'copi' : v.tempsDC ? 'dc'
    : (v.nomCdB === 'SELF' ? 'cdb' : 'copi');

  v.source = 'flylog';
  v.ordre = numero;
  const immatBrute = texte(l.AIRCRAFT_REGISTRATION);
  const type = texte(l.AIRCRAFT_TYPE).toUpperCase();
  return { vol: v, immat: formaterImmat(immatBrute), type, sim: type === 'SIM' || v.simTemps > 0, erreurs };
}

// Personne d'après un nom FlyLog : 3 lettres = trigramme, sinon nom
function personneDepuisNom(n) {
  const p = personneVide();
  if (/^[A-Z]{3}$/.test(n)) p.tri = n; else p.nom = n;
  return p;
}

// Analyse complète avant enregistrement.
// existant : { vols, avions, personnes, etiquettes } déjà dans l'app.
// Anti-doublon : un vol est écarté s'il existe déjà (même clé). Les vols identiques présents
// plusieurs fois DANS le fichier sont tous gardés (on compte les quantités, clé par clé).
export function analyserFlyLog(contenu, existant = {}, types = indexTypes(), maintenant = new Date().toISOString()) {
  const { entetes, lignes } = lireCSVObjets(contenu);
  const manquantes = COLONNES_OBLIGATOIRES.filter(c => !entetes.includes(c));
  if (manquantes.length) {
    return { ok: false, message: `Ce fichier n'est pas un export FlyLog (colonnes manquantes : ${manquantes.join(', ')}).` };
  }
  const avions = new Map((existant.avions || []).map(a => [a.immat, a]));
  const avionsNouveaux = [];
  const parId = new Map((existant.avions || []).map(a => [a.id, a]));
  const deja = new Map();
  for (const v of existant.vols || []) {
    const k = cleDoublon(v, parId.get(v.avionId)?.immat || '');
    deja.set(k, (deja.get(k) || 0) + 1);
  }
  const personnes = new Map((existant.personnes || []).map(p => [nomPersonne(p).toUpperCase(), p]));
  const personnesNouvelles = [];
  const etiquettes = new Set(existant.etiquettes || []);
  const etiquettesNouvelles = [];
  const aCreer = [], doublons = [], erreurs = [], typesInconnus = new Set();

  lignes.forEach((l, i) => {
    const r = convertirLigne(l, i + 2);
    if (r.erreurs.length) { erreurs.push(...r.erreurs); return; }
    const k = cleDoublon(r.vol, r.immat);
    const n = deja.get(k) || 0;
    if (n > 0) { deja.set(k, n - 1); doublons.push(r.vol); return; }

    let avion = avions.get(r.immat);
    if (!avion) {
      avion = avionVide();
      avion.immat = r.immat;
      if (r.sim) {
        avion.sim = true;
        avion.modele = 'Simulateur ' + r.immat;
        avion.fstd = null;
      } else {
        const t = types.get(r.type);
        if (t) Object.assign(avion, caracteristiquesDuType(t));
        else { avion.typeOACI = r.type; avion.modele = r.type; typesInconnus.add(r.type); }
        avion.etiquettes = etiquettesParDefaut(avion);
      }
      horodater(avion, maintenant);
      avions.set(r.immat, avion);
      avionsNouveaux.push(avion);
    }
    r.vol.avionId = avion.id;
    if (avionsNouveaux.includes(avion)) completerNomIndicatif(avion, r.vol.indicatif); // seulement les avions créés par cet import

    for (const cle of ['nomCdB', ...Object.values(NOMS)]) {
      const nom = r.vol[cle];
      if (!nom || nom === 'SELF') continue;
      if (!personnes.has(nom.toUpperCase())) {
        const p = horodater(personneDepuisNom(nom), maintenant);
        personnes.set(nom.toUpperCase(), p);
        personnesNouvelles.push(p);
      }
    }
    for (const t of r.vol.etiquettes) {
      if (!etiquettes.has(t)) { etiquettes.add(t); etiquettesNouvelles.push(t); }
    }
    horodater(r.vol, maintenant);
    aCreer.push(r.vol);
  });

  return {
    ok: true, lues: lignes.length, aCreer, doublons, erreurs,
    avions: avionsNouveaux, personnes: personnesNouvelles, etiquettes: etiquettesNouvelles,
    typesInconnus: [...typesInconnus],
  };
}
