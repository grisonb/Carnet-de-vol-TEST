// Service worker : met toute l'app en cache pour qu'elle marche sans réseau.
// Script « classique » (pas un module) : c'est le type d'enregistrement de la v0.1 déjà installée sur les
// téléphones. Un module (v0.2) ne pouvait pas être lu par cet enregistrement : la mise à jour échouait
// en silence et l'app restait bloquée en v0.1.
// Le numéro de version vient de js/numero-version.js (seul endroit où il est écrit) : changer la version
// change le nom du cache et le téléphone télécharge la nouvelle version.
// Portée /Carnet-de-vol-TEST/ : il ne voit jamais les pages des autres apps de grisonb.github.io et ne
// touche qu'à SES caches (noms commençant par « carnet-de-vol- »).
try { importScripts('js/numero-version.js'); } catch (e) { /* lu comme module (enregistrement v0.2) */ }
const VERSION = self.VERSION_CARNET;
const PREFIXE = 'carnet-de-vol-';
const CACHE = PREFIXE + 'v' + VERSION;
const PORTEE = self.registration.scope; // ex. https://grisonb.github.io/Carnet-de-vol-TEST/

const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/polices.css',
  'js/app.js', 'js/csv.js', 'js/controle.js', 'js/db.js', 'js/drapeaux.js', 'js/etat.js', 'js/flylog.js',
  'js/fuseaux.js', 'js/missions.js', 'js/modele.js', 'js/nuit.js', 'js/pdf.js', 'js/sauvegarde.js',
  'js/temps.js', 'js/terrains.js', 'js/totaux.js', 'js/types-avion.js', 'js/version.js', 'js/numero-version.js',
  'js/ui/avions.js', 'js/ui/carnet.js', 'js/ui/commun.js', 'js/ui/plus.js', 'js/ui/regles.js',
  'js/ui/saisie.js', 'js/ui/totaux.js', 'js/ui/terrain-perso.js', 'js/ui/glisser.js', 'js/ui/suppression.js', 'js/bande.js', 'js/traces.js', 'js/ui/carte.js', 'js/recherche.js', 'js/ui/retour.js', 'js/copieur.js', 'js/ui/nas.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/jspdf.umd.min.js', 'ressources/terrains.json',
  'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-maskable-512.png',
  'polices/Barlow-400-latin.woff2', 'polices/Barlow-400-latin-ext.woff2',
  'polices/Barlow-500-latin.woff2', 'polices/Barlow-500-latin-ext.woff2',
  'polices/Barlow-600-latin.woff2', 'polices/Barlow-600-latin-ext.woff2',
  'polices/Barlow-700-latin.woff2', 'polices/Barlow-700-latin-ext.woff2',
  'polices/BarlowSemiCondensed-500-latin.woff2', 'polices/BarlowSemiCondensed-500-latin-ext.woff2',
  'polices/BarlowSemiCondensed-600-latin.woff2', 'polices/BarlowSemiCondensed-600-latin-ext.woff2',
  'polices/BarlowSemiCondensed-700-latin.woff2', 'polices/BarlowSemiCondensed-700-latin-ext.woff2',
];

// Mode « réparation » : si ce fichier est lu comme module (téléphone passé par la v0.2), importScripts
// est interdit et VERSION est inconnue. Il attend que l'app soit fermée (pour ne pas casser une page en
// cours), puis au lancement suivant il sert tout depuis le réseau : la nouvelle app réenregistre ce
// service worker en script classique, qui s'installe normalement et recharge la page.
const REPARATION = !VERSION;

self.addEventListener('install', e => {
  if (REPARATION) return;
  // Nouvelle version active tout de suite (sans attendre que toutes les fenêtres soient fermées)
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k.startsWith(PREFIXE) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Toujours le cache d'abord : l'app démarre instantanément, avec ou sans réseau.
self.addEventListener('fetch', e => {
  // Uniquement les fichiers du Carnet (même origine ET sous /Carnet-de-vol-TEST/), et seulement
  // dans le cache du Carnet : jamais dans les caches des autres apps du même site.
  if (e.request.method !== 'GET' || !e.request.url.startsWith(PORTEE)) return;
  // Réparation : tout vient du réseau, sans le cache HTTP du navigateur (sinon il redonnerait l'ancienne app)
  if (REPARATION) return e.respondWith(fetch(e.request, { cache: 'reload' }));
  e.respondWith(caches.open(CACHE)
    .then(c => c.match(e.request, { ignoreSearch: true }))
    .then(r => r || fetch(e.request)));
});
