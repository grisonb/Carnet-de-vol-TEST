// Stockage local IndexedDB (sur le téléphone). Aucun appel réseau.
//
// Magasins :
//   vols, avions, personnes (clé id) ; suppressions { id, magasin, supprimeLe } (pour la synchro NAS v0.2)
//   reglages { cle, valeur } : compteurs, règles de pastilles, étiquettes, missions ajoutées, etc.

import { estDemenage } from './demenagement.js';

// v0.39 : app à l'ancienne adresse alors que la nouvelle répond : plus AUCUNE écriture (le carnet vit à la nouvelle adresse)
function verifierEcriture() { if (estDemenage()) throw new Error("Le carnet a changé d'adresse : rien n'est enregistré ici."); }

const NOM = 'carnet-de-vol';
const VERSION = 2; // v0.8 : magasin « traces » ajouté (rien d'autre ne change, les données sont conservées)
export const MAGASINS = { vols: 'id', avions: 'id', personnes: 'id', suppressions: 'id', reglages: 'cle' };
// Traces ADS-B (affichage seulement) : hors sauvegarde de secours, elles se retéléchargent.
// Clé : id du vol ; « __index__ » = dernier index.json reçu du serveur.
export const MAGASINS_CACHE = { traces: 'id' };

let base = null;

export function ouvrir() {
  if (base) return Promise.resolve(base);
  return new Promise((ok, ko) => {
    const req = indexedDB.open(NOM, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [nom, cle] of Object.entries({ ...MAGASINS, ...MAGASINS_CACHE })) {
        if (!db.objectStoreNames.contains(nom)) db.createObjectStore(nom, { keyPath: cle });
      }
    };
    req.onsuccess = () => { base = req.result; ok(base); };
    req.onerror = () => ko(req.error);
  });
}

const fin = tx => new Promise((ok, ko) => {
  tx.oncomplete = () => ok();
  tx.onerror = () => ko(tx.error);
  tx.onabort = () => ko(tx.error || new Error('Enregistrement annulé'));
});

export async function tout(magasin) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const req = db.transaction(magasin).objectStore(magasin).getAll();
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}

// ecritures : { vols: [..], avions: [..], ... } enregistrés en une seule transaction
export async function enregistrer(ecritures) {
  verifierEcriture();
  const db = await ouvrir();
  const noms = Object.keys(ecritures).filter(n => ecritures[n] && ecritures[n].length);
  if (!noms.length) return;
  const tx = db.transaction(noms, 'readwrite');
  for (const n of noms) for (const o of ecritures[n]) tx.objectStore(n).put(o);
  return fin(tx);
}

export async function supprimer(magasin, id, maintenant = new Date().toISOString()) {
  verifierEcriture();
  const db = await ouvrir();
  const tx = db.transaction([magasin, 'suppressions'], 'readwrite');
  tx.objectStore(magasin).delete(id);
  tx.objectStore('suppressions').put({ id, magasin, supprimeLe: maintenant });
  return fin(tx);
}

// Remet un élément supprimé (Annuler) : il revient et sa trace de suppression est effacée
export async function remettre(magasin, objet) {
  verifierEcriture();
  const db = await ouvrir();
  const tx = db.transaction([magasin, 'suppressions'], 'readwrite');
  tx.objectStore(magasin).put(objet);
  tx.objectStore('suppressions').delete(objet.id);
  return fin(tx);
}

// Restauration d'une sauvegarde : tout est remplacé en une seule transaction
export async function remplacerTout(contenu) {
  verifierEcriture();
  const db = await ouvrir();
  const noms = Object.keys(MAGASINS);
  const tx = db.transaction(noms, 'readwrite');
  for (const n of noms) {
    const st = tx.objectStore(n);
    st.clear();
    for (const o of contenu[n] || []) st.put(o);
  }
  return fin(tx);
}

// Synchro (v0.23) : éléments reçus du NAS, écrits en une seule transaction. mettre / enlever : { vols, avions,
// personnes : [objets | ids], reglages : [{ cle, valeur }] | [cles] }. Pas de trace de suppression (appareil qui consulte).
export async function appliquerSynchro({ mettre, enlever }) {
  verifierEcriture();
  const db = await ouvrir();
  const noms = ['vols', 'avions', 'personnes', 'reglages'].filter(n => (mettre[n] && mettre[n].length) || (enlever[n] && enlever[n].length));
  if (!noms.length) return;
  const tx = db.transaction(noms, 'readwrite');
  for (const n of noms) {
    const st = tx.objectStore(n);
    for (const o of mettre[n] || []) st.put(o);
    for (const id of enlever[n] || []) st.delete(id);
  }
  return fin(tx);
}

export async function lire(magasin, id) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const req = db.transaction(magasin).objectStore(magasin).get(id);
    req.onsuccess = () => ok(req.result || null);
    req.onerror = () => ko(req.error);
  });
}

export async function lireReglages() {
  const lignes = await tout('reglages');
  return Object.fromEntries(lignes.map(l => [l.cle, l.valeur]));
}

export const ecrireReglage = (cle, valeur) => enregistrer({ reglages: [{ cle, valeur }] });
