// Totaux : accueil (TOTAL HdV, 3/7/30 jours), écran Totaux, Contrôle import.

import { colonnesAvion, COMPTEURS, estSimulation } from './modele.js';
import { ajouterJours } from './temps.js';

export const RUBRIQUES = [
  { cle: 'vols', titre: 'Vols', genre: 'nombre', groupe: 'heures' },
  { cle: 'sessionsSim', titre: 'dont simulateur', genre: 'nombre', groupe: 'heures' },
  { cle: 'atterrissages', titre: 'Atterrissages', genre: 'nombre', groupe: 'heures' },
  { cle: 'tempsTotal', titre: 'Temps bloc (total)', genre: 'duree', groupe: 'heures' },
  { cle: 'simTemps', titre: 'Simulateur', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsCdB', titre: 'Commandant de bord', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsCopi', titre: 'Copilote', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsDC', titre: 'Double commande', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsInst', titre: 'Instructeur', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsNuit', titre: 'Nuit', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsIFR', titre: 'IFR', genre: 'duree', groupe: 'heures' },
  { cle: 'tempsXC', titre: 'Cross-country', genre: 'duree', groupe: 'heures' },
  { cle: 'mp', titre: 'Multipilote', genre: 'duree', groupe: 'heures' },
  { cle: 'se', titre: 'Monopilote SE', genre: 'duree', groupe: 'heures' },
  { cle: 'me', titre: 'Monopilote ME', genre: 'duree', groupe: 'heures' },
  { cle: 'piston', titre: 'Piston', genre: 'duree', groupe: 'categories' },
  { cle: 'turbo', titre: 'Turbopropulseur', genre: 'duree', groupe: 'categories' },
  { cle: 'reacteur', titre: 'Réacteur', genre: 'duree', groupe: 'categories' },
  { cle: 'multiTurbine', titre: 'Multimoteur turbine', genre: 'duree', groupe: 'categories' },
  { cle: 'amphibie', titre: 'Amphibie', genre: 'duree', groupe: 'categories' },
  { cle: 'hydravion', titre: 'Hydravion', genre: 'duree', groupe: 'categories' },
  { cle: 'trainClassique', titre: 'Train classique', genre: 'duree', groupe: 'categories' },
  { cle: 'feux', titre: 'Feux', genre: 'nombre', groupe: 'metier' },
  ...COMPTEURS.map(c => ({ cle: c.cle, titre: c.nom, genre: 'nombre', groupe: 'metier' })),
];

const SOMMES = ['tempsTotal', 'simTemps', 'tempsCdB', 'tempsCopi', 'tempsDC', 'tempsInst', 'tempsNuit',
  'tempsIFR', 'tempsXC', 'feux'];

export function totauxVides() {
  const t = Object.fromEntries(RUBRIQUES.map(r => [r.cle, 0]));
  t.parEtiquette = {}; t.parAvion = {}; t.parType = {}; t.parTypeCdB = {}; t.parTypeCopi = {};
  return t;
}

// avions : Map id -> avion
export function ajouterVol(t, v, avions) {
  const a = avions.get(v.avionId);
  t.vols++;
  if ((a && a.sim) || v.simTemps > 0) t.sessionsSim++;
  for (const k of SOMMES) t[k] += v[k] || 0;
  for (const c of COMPTEURS) t[c.cle] += (v.compteurs && v.compteurs[c.cle]) || 0;
  t.atterrissages += (v.attJour || 0) + (v.attNuit || 0);
  const col = colonnesAvion(v, a);
  t.se += col.se; t.me += col.me; t.mp += col.mp;
  const total = v.tempsTotal || 0;
  if (a && !a.sim) {
    if (a.moteur === 'P') t.piston += total;
    if (a.moteur === 'T') t.turbo += total;
    if (a.moteur === 'J') t.reacteur += total;
    if (a.moteurs === 'ME' && (a.moteur === 'T' || a.moteur === 'J')) t.multiTurbine += total;
    if (a.surface === 'A') t.amphibie += total;
    if (a.surface === 'H') t.hydravion += total;
    if (a.train === 'classique') t.trainClassique += total;
  }
  const temps = total || v.simTemps || 0;
  for (const e of v.etiquettes || []) t.parEtiquette[e] = (t.parEtiquette[e] || 0) + temps;
  if (a) {
    const pa = t.parAvion[a.id] || (t.parAvion[a.id] = { minutes: 0, vols: 0, dernier: '' });
    pa.minutes += temps; pa.vols++;
    if (v.date > pa.dernier) pa.dernier = v.date;
    const ty = a.sim ? 'SIMULATEURS' : (a.typeOACI || '?');
    t.parType[ty] = (t.parType[ty] || 0) + temps;
    t.parTypeCdB[ty] = (t.parTypeCdB[ty] || 0) + (v.tempsCdB || 0);
    t.parTypeCopi[ty] = (t.parTypeCopi[ty] || 0) + (v.tempsCopi || 0);
  }
  return t;
}

export function calculerTotaux(vols, avions) {
  const t = totauxVides();
  for (const v of vols) if (!estSimulation(v)) ajouterVol(t, v, avions); // v0.35 (R85) : simulation jamais comptée
  return t;
}

// Heures de vol (bloc) des n derniers jours, aujourd'hui inclus (comme « socle hdv »)
export function heuresDerniersJours(vols, n, aujourdhui) {
  const debut = ajouterJours(aujourdhui, -(n - 1));
  let m = 0;
  for (const v of vols) if (!estSimulation(v) && v.date >= debut && v.date <= aujourdhui) m += v.tempsTotal || 0;
  return m;
}

export const totalHdV = vols => vols.reduce((s, v) => s + (estSimulation(v) ? 0 : v.tempsTotal || 0), 0);

// Période : { genre: 'tout' } | { genre: 'annee', annee } | { genre: '12m' } | { genre: 'dates', du, au }
export function bornesPeriode(p, aujourdhui) {
  if (!p || p.genre === 'tout') return { du: null, au: null };
  if (p.genre === 'annee') return { du: `${p.annee}-01-01`, au: `${p.annee}-12-31` };
  if (p.genre === '12m') {
    const [y, m, j] = aujourdhui.split('-');
    return { du: ajouterJours(`${Number(y) - 1}-${m}-${j}`, 1), au: aujourdhui };
  }
  return { du: p.du || null, au: p.au || null };
}

export function filtrerPeriode(vols, p, aujourdhui) {
  const { du, au } = bornesPeriode(p, aujourdhui);
  return vols.filter(v => (!du || v.date >= du) && (!au || v.date <= au));
}
