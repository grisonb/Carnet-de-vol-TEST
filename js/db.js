// Stockage local IndexedDB (sur le téléphone). Aucun appel réseau.
//
// Magasins :
//   vols, avions, personnes (clé id) ; suppressions { id, magasin, supprimeLe } (pour la synchro NAS v0.2)
//   reglages { cle, valeur } : compteurs, règles de pastilles, étiquettes, missions ajoutées, etc.

const NOM = 'carnet-de-vol';
const VERSION = 1;
export const MAGASINS = { vols: 'id', avions: 'id', personnes: 'id', suppressions: 'id', reglages: 'cle' };

let base = null;

export function ouvrir() {
  if (base) return Promise.resolve(base);
  return new Promise((ok, ko) => {
    const req = indexedDB.open(NOM, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [nom, cle] of Object.entries(MAGASINS)) {
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
  const db = await ouvrir();
  const noms = Object.keys(ecritures).filter(n => ecritures[n] && ecritures[n].length);
  if (!noms.length) return;
  const tx = db.transaction(noms, 'readwrite');
  for (const n of noms) for (const o of ecritures[n]) tx.objectStore(n).put(o);
  return fin(tx);
}

export async function supprimer(magasin, id, maintenant = new Date().toISOString()) {
  const db = await ouvrir();
  const tx = db.transaction([magasin, 'suppressions'], 'readwrite');
  tx.objectStore(magasin).delete(id);
  tx.objectStore('suppressions').put({ id, magasin, supprimeLe: maintenant });
  return fin(tx);
}

// Restauration d'une sauvegarde : tout est remplacé en une seule transaction
export async function remplacerTout(contenu) {
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

export async function lireReglages() {
  const lignes = await tout('reglages');
  return Object.fromEntries(lignes.map(l => [l.cle, l.valeur]));
}

export const ecrireReglage = (cle, valeur) => enregistrer({ reglages: [{ cle, valeur }] });
