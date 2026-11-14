// v0.39 : le Carnet change d'adresse : https://grisonb.github.io/Carnet-de-vol-TEST/ -> https://grisonb.github.io/Carnet-de-vol/
// (même site, donc mêmes données sur Chrome). À l'ANCIENNE adresse, dès que la nouvelle répond (un petit fichier de la
// nouvelle adresse lu sans cache), l'app affiche « Le carnet a changé d'adresse » et n'enregistre plus RIEN : aucune
// écriture dans la base (db.js), aucune demande au NAS (copie, synchro, vols NPF : requete de ui/nas.js).
// Tant que la nouvelle adresse ne répond pas (avant le renommage, ou sans réseau), l'app marche normalement.

export const ANCIEN_DOSSIER = '/Carnet-de-vol-TEST/';
export const NOUVEAU_DOSSIER = '/Carnet-de-vol/';

let demenage = false;
export const estDemenage = () => demenage;
export function marquerDemenage() { demenage = true; }

export const aAncienneAdresse = chemin => String(chemin || '').startsWith(ANCIEN_DOSSIER);
export const nouvelleAdresse = origine => origine + NOUVEAU_DOSSIER;

// La nouvelle adresse répond-elle ? (fichier de version lu sans aucun cache ; erreur, 404 ou délai dépassé : non)
export async function nouvelleAdresseRepond(origine, { delai = 5000, lire = fetch } = {}) {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), delai);
  try {
    const r = await lire(`${nouvelleAdresse(origine)}js/numero-version.js?d=${Date.now()}`, { cache: 'no-store', signal: arret.signal });
    if (!r || !r.ok) return false;
    return /VERSION_CARNET\s*=/.test(await r.text());
  } catch { return false; } finally { clearTimeout(minuterie); }
}
