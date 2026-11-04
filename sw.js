// Service worker : met toute l'app en cache pour qu'elle marche sans réseau.
// VERSION doit être identique à js/version.js (un test le vérifie). Changer la version
// change le nom du cache : le téléphone télécharge alors la nouvelle version.
const VERSION = '0.1';
const CACHE = 'carnet-de-vol-v' + VERSION;

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
    .then(cles => Promise.all(cles.filter(k => k.startsWith('carnet-de-vol-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Toujours le cache d'abord : l'app démarre instantanément, avec ou sans réseau.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
