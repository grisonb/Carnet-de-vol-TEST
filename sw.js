// Service worker : met toute l'app en cache pour qu'elle marche sans réseau.
// Le numéro de version vient de js/version.js (seul endroit où il est écrit) : changer la version
// change le nom du cache, le téléphone télécharge alors la nouvelle version.
// Ce service worker est enregistré comme « module » et sa portée est /Carnet-de-vol-TEST/ :
// il ne voit jamais les pages des autres apps de grisonb.github.io et ne touche qu'à SES caches
// (noms commençant par « carnet-de-vol- »).
import { VERSION } from './js/version.js';
const PREFIXE = 'carnet-de-vol-';
const CACHE = PREFIXE + 'v' + VERSION;
const PORTEE = self.registration.scope; // ex. https://grisonb.github.io/Carnet-de-vol-TEST/

const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/polices.css',
  'js/app.js', 'js/csv.js', 'js/controle.js', 'js/db.js', 'js/drapeaux.js', 'js/etat.js', 'js/flylog.js',
  'js/fuseaux.js', 'js/missions.js', 'js/modele.js', 'js/nuit.js', 'js/pdf.js', 'js/sauvegarde.js',
  'js/temps.js', 'js/terrains.js', 'js/totaux.js', 'js/types-avion.js', 'js/version.js',
  'js/ui/avions.js', 'js/ui/carnet.js', 'js/ui/commun.js', 'js/ui/plus.js', 'js/ui/regles.js',
  'js/ui/saisie.js', 'js/ui/totaux.js',
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

self.addEventListener('install', e => {
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
  e.respondWith(caches.open(CACHE)
    .then(c => c.match(e.request, { ignoreSearch: true }))
    .then(r => r || fetch(e.request)));
});
