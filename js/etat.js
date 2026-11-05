// État de l'app en mémoire + enregistrement dans IndexedDB.
// Les 4000+ vols sont gardés en mémoire (quelques Mo) : recherche et totaux restent rapides.

import * as db from './db.js';
import { comparerRecentDabord, horodater, COMPTEURS_DEFAUT, nomPersonne, migrerAvionsV04 } from './modele.js';
import { definirTerrainsPerso } from './terrains.js';
import { REGLES_DEFAUT, missionsConnues } from './missions.js';

export const etat = {
  vols: [],            // du plus récent au plus ancien
  avions: new Map(),   // id -> avion
  personnes: [],
  reglages: {},
  ecouteurs: new Set(),
};

export const ETIQUETTES_DEFAUT = ['BOMBING', 'TRANSPORT', 'TAILWHEEL'];

export function reglage(cle) {
  const defauts = {
    compteurs: COMPTEURS_DEFAUT, regles: REGLES_DEFAUT, etiquettes: ETIQUETTES_DEFAUT,
    missionsAjoutees: [], titulaire: '', derniereSauvegarde: null, reference: null, terrainsPerso: {}, missionsMasquees: [],
  };
  return etat.reglages[cle] ?? defauts[cle];
}

export async function charger() {
  const [vols, avions, personnes, reglages] = await Promise.all([
    db.tout('vols'), db.tout('avions'), db.tout('personnes'), db.lireReglages()]);
  etat.vols = vols.sort(comparerRecentDabord);
  etat.avions = new Map(avions.map(a => [a.id, a]));
  etat.personnes = personnes;
  etat.reglages = reglages;
  definirTerrainsPerso(reglage('terrainsPerso'));
  await migrer();
}

// Mises à jour des données enregistrées par une version précédente (une seule fois, rien n'est perdu)
async function migrer() {
  if (!etat.reglages.migrationV04) {
    const modifies = migrerAvionsV04([...etat.avions.values()]);
    if (modifies.length) await db.enregistrer({ avions: modifies });
    etat.reglages.migrationV04 = new Date().toISOString();
    await db.ecrireReglage('migrationV04', etat.reglages.migrationV04);
  }
}

// Terrain ajouté à la main par le pilote (enregistré dans ses données, pas dans le code)
export async function enregistrerTerrainPerso(code, t) {
  const liste = { ...reglage('terrainsPerso'), [code.toUpperCase()]: t };
  definirTerrainsPerso(liste);
  await enregistrerReglage('terrainsPerso', liste);
}

export function prevenir() { for (const f of etat.ecouteurs) f(); }
export const surChangement = f => etat.ecouteurs.add(f);

export async function enregistrerReglage(cle, valeur) {
  etat.reglages[cle] = valeur;
  await db.ecrireReglage(cle, valeur);
  prevenir();
}

export async function enregistrerVol(vol) {
  horodater(vol);
  if (!vol.ordre) vol.ordre = Date.now();
  await db.enregistrer({ vols: [vol] });
  const i = etat.vols.findIndex(v => v.id === vol.id);
  if (i >= 0) etat.vols[i] = vol; else etat.vols.push(vol);
  etat.vols.sort(comparerRecentDabord);
  // nouvelles étiquettes
  const et = reglage('etiquettes');
  const nouvelles = (vol.etiquettes || []).filter(t => !et.includes(t));
  if (nouvelles.length) await enregistrerReglage('etiquettes', [...et, ...nouvelles]);
  prevenir();
}

export async function supprimerVol(id) {
  await db.supprimer('vols', id);
  etat.vols = etat.vols.filter(v => v.id !== id);
  prevenir();
}

export async function enregistrerAvion(a) {
  horodater(a);
  await db.enregistrer({ avions: [a] });
  etat.avions.set(a.id, a);
  prevenir();
}

export async function enregistrerPersonne(p) {
  horodater(p);
  await db.enregistrer({ personnes: [p] });
  const i = etat.personnes.findIndex(x => x.id === p.id);
  if (i >= 0) etat.personnes[i] = p; else etat.personnes.unshift(p);
  prevenir();
}

export async function supprimerPersonne(id) {
  await db.supprimer('personnes', id);
  etat.personnes = etat.personnes.filter(p => p.id !== id);
  prevenir();
}

// Import FlyLog : tout est écrit en une seule transaction
export async function enregistrerImport(r) {
  await db.enregistrer({ vols: r.aCreer, avions: r.avions, personnes: r.personnes });
  for (const a of r.avions) etat.avions.set(a.id, a);
  etat.personnes.push(...r.personnes);
  etat.vols.push(...r.aCreer);
  etat.vols.sort(comparerRecentDabord);
  const et = reglage('etiquettes');
  const nouvelles = r.etiquettes.filter(t => !et.includes(t));
  if (nouvelles.length) await enregistrerReglage('etiquettes', [...et, ...nouvelles]);
  prevenir();
}

export async function contenuComplet() {
  const [vols, avions, personnes, suppressions, reglages] = await Promise.all(
    ['vols', 'avions', 'personnes', 'suppressions', 'reglages'].map(m => db.tout(m)));
  return { vols, avions, personnes, suppressions, reglages };
}

export async function restaurer(donnees) {
  await db.remplacerTout(donnees);
  await charger();
  prevenir();
}

export const avionDe = vol => etat.avions.get(vol.avionId) || null;
export const listeMissions = () => missionsConnues(etat.vols, reglage('missionsAjoutees'), reglage('missionsMasquees'));
export const trouverPersonne = nom => etat.personnes.find(p => nomPersonne(p).toUpperCase() === String(nom).toUpperCase());
