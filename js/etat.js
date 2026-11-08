// État de l'app en mémoire + enregistrement dans IndexedDB.
// Les 4000+ vols sont gardés en mémoire (quelques Mo) : recherche et totaux restent rapides.

import * as db from './db.js';
import { comparerRecentDabord, horodater, COMPTEURS_DEFAUT, nomPersonne, migrerAvionsV04 } from './modele.js';
import { definirTerrainsPerso } from './terrains.js';
import { BANDE_DEFAUT } from './bande.js';
import { REGLES_DEFAUT, missionsConnues } from './missions.js';
import { REGLAGES_PRIVES } from './sauvegarde.js';
import { REGLAGES_PARTAGES } from './synchro.js';

export const etat = {
  vols: [],            // du plus récent au plus ancien
  avions: new Map(),   // id -> avion
  personnes: [],
  reglages: {},
  ecouteurs: new Set(),
  revision: 0,         // augmente à chaque changement (sert à ne recalculer les totaux que si besoin)
};

export const ETIQUETTES_DEFAUT = ['BOMBING', 'TRANSPORT', 'TAILWHEEL'];

export function reglage(cle) {
  const defauts = {
    compteurs: COMPTEURS_DEFAUT, regles: REGLES_DEFAUT, etiquettes: ETIQUETTES_DEFAUT,
    missionsAjoutees: [], titulaire: '', derniereSauvegarde: null, reference: null, terrainsPerso: {}, missionsMasquees: [], bandeHeures: BANDE_DEFAUT,
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
  etat.revision++;
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
  if (refuseEnConsultation()) return false;
  const liste = { ...reglage('terrainsPerso'), [code.toUpperCase()]: t };
  definirTerrainsPerso(liste);
  await enregistrerReglage('terrainsPerso', liste);
}

// v0.23 : appareil en CONSULTATION (PC qui reçoit le carnet du téléphone) : rien ne se modifie ici.
// Garde-fou au niveau des données (en plus des boutons cachés) : toute écriture du carnet est refusée et signalée.
export const enConsultation = () => etat.reglages.synchroRole === 'consultation';
function refuseEnConsultation() {
  if (!enConsultation()) return false;
  document.dispatchEvent(new CustomEvent('consultation-refus'));
  return true;
}

export function prevenir() { etat.revision++; for (const f of etat.ecouteurs) f(); }
export const surChangement = f => etat.ecouteurs.add(f);

// Réglage propre au téléphone (copie NAS…) : enregistré sans prévenir les écrans (ne déclenche pas de copie)
export async function ecrireReglageDiscret(cle, valeur) {
  etat.reglages[cle] = valeur;
  await db.ecrireReglage(cle, valeur);
}

export async function enregistrerReglage(cle, valeur) {
  if (REGLAGES_PARTAGES.includes(cle) && refuseEnConsultation()) return false; // réglage du carnet
  etat.reglages[cle] = valeur;
  await db.ecrireReglage(cle, valeur);
  prevenir();
}

export async function enregistrerVol(vol) {
  if (refuseEnConsultation()) return false;
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
  if (refuseEnConsultation()) return false;
  await db.supprimer('vols', id);
  etat.vols = etat.vols.filter(v => v.id !== id);
  prevenir();
}

// « Annuler » après une suppression : le vol revient exactement à l'identique (même id, mêmes dates)
export async function restaurerVol(vol) {
  if (refuseEnConsultation()) return false;
  await db.remettre('vols', vol);
  if (!etat.vols.some(v => v.id === vol.id)) etat.vols.push(vol);
  etat.vols.sort(comparerRecentDabord);
  prevenir();
}

export async function enregistrerAvion(a) {
  if (refuseEnConsultation()) return false;
  horodater(a);
  await db.enregistrer({ avions: [a] });
  etat.avions.set(a.id, a);
  prevenir();
}

// Plusieurs avions d'un coup (ex. codes ADS-B reçus du serveur), un seul rafraîchissement
export async function enregistrerAvions(liste) {
  if (!liste.length || enConsultation()) return; // (codes ADS-B reçus : sans message)
  for (const a of liste) horodater(a);
  await db.enregistrer({ avions: liste });
  for (const a of liste) etat.avions.set(a.id, a);
  prevenir();
}

// Traces ADS-B stockées (affichage seulement ; hors sauvegarde)
export const lireTrace = id => db.lire('traces', id);
export const ecrireTrace = rec => db.enregistrer({ traces: [rec] });

export async function enregistrerPersonne(p) {
  if (refuseEnConsultation()) return false;
  horodater(p);
  await db.enregistrer({ personnes: [p] });
  const i = etat.personnes.findIndex(x => x.id === p.id);
  if (i >= 0) etat.personnes[i] = p; else etat.personnes.unshift(p);
  prevenir();
}

export async function supprimerPersonne(id) {
  if (refuseEnConsultation()) return false;
  await db.supprimer('personnes', id);
  etat.personnes = etat.personnes.filter(p => p.id !== id);
  prevenir();
}

// Import FlyLog : tout est écrit en une seule transaction
export async function enregistrerImport(r) {
  if (refuseEnConsultation()) return false;
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
  // Mots de passe, adresse et état de la copie NAS ne sont pas dans la sauvegarde : on garde ceux du téléphone
  const prives = REGLAGES_PRIVES.filter(k => etat.reglages[k] !== undefined).map(k => [k, etat.reglages[k]]);
  await db.remplacerTout({ ...donnees, reglages: (donnees.reglages || []).filter(r => !REGLAGES_PRIVES.includes(r.cle)) });
  for (const [k, v] of prives) await db.ecrireReglage(k, v);
  await charger();
  prevenir();
}

export const avionDe = vol => etat.avions.get(vol.avionId) || null;
export const listeMissions = () => missionsConnues(etat.vols, reglage('missionsAjoutees'), reglage('missionsMasquees'));
export const trouverPersonne = nom => etat.personnes.find(p => nomPersonne(p).toUpperCase() === String(nom).toUpperCase());
