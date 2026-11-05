// SEUL endroit où est écrit le numéro de version. Il sert à :
//  - la mention « vX.Y » de l'accueil et de l'écran Plus ;
//  - le nom du cache du service worker (sw.js l'importe) : changer de version change le cache
//    et force le téléphone à télécharger la nouvelle version.
export const VERSION = '0.2';
