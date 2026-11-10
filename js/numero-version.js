// SEUL endroit où est écrit le numéro de version. Fichier volontairement « simple » (sans import/export)
// pour être lu à la fois par le service worker (importScripts) et par l'app (via js/version.js).
// Il sert à : la mention « vX.Y » de l'accueil et de l'écran Plus, et le nom du cache du service worker
// (changer de version change le cache : le téléphone télécharge alors la nouvelle version).
globalThis.VERSION_CARNET = '0.27';
