# Carnet de vol — consignes pour Claude

Carnet de vol électronique (logbook pilote) au format EASA (FCL.050 / AMC1 FCL.050), pour un seul pilote.
PWA pour smartphone Android (Chrome), utilisable d'une main, entièrement hors ligne.
L'utilisateur n'est pas développeur : lui expliquer les choses simplement, en français.

## Règles absolues

- **Dépôt PUBLIC** : il ne contient QUE le code. JAMAIS de vol réel, d'immatriculation des vols du pilote,
  de nom ou trigramme de collègue, de fichier FlyLog, de maquette, de capture d'écran avec des données réelles,
  ni aucune donnée réelle, même dans les tests ou les exemples. Les tests utilisent des vols inventés
  (`tests/outils/faux-flylog.js`). Les tables génériques (types OACI, terrains OACI) sont autorisées.
- Les données privées sont dans `../donnees-privees/` (hors dépôt) : export FlyLog, maquette, remarques,
  valeurs de référence du contrôle import.
- `.gitignore` exclut `*.csv`, `*.xlsx`, `donnees/`, `donnees-privees/`, `maquette*.html`, les captures de tests.
  **Vérifier `git status` avant chaque commit** : aucun fichier de données ne doit être suivi.
- Commit et push **uniquement après « OK push » tapé par l'utilisateur**. Jamais de `--force`.
- Une version = une livraison poussée. Le numéro est écrit à UN SEUL endroit : `js/version.js`. Le service
  worker (`sw.js`, enregistré en module) l'importe pour nommer son cache ; l'accueil (« vX.Y » en haut à
  droite) et l'écran Plus l'affichent. Changer ce numéro change le cache : le téléphone récupère la version.
  Ajouter une entrée dans `JOURNAL.md`.
- Textes de l'app en français. Durées affichées « 1h18 », totaux « 5 702h48 ».
- v0.1 : AUCUN serveur ni appel réseau en dehors du chargement de l'app depuis GitHub Pages.

## Hébergement

GitHub Pages, branche `main`, racine : https://grisonb.github.io/Carnet-de-vol-TEST/
Pas d'étape de compilation : les fichiers du dépôt sont servis tels quels.

## Architecture

- `index.html` : tous les écrans (Carnet, saisie, Totaux, Plus) et fenêtres (avions, fiche, personne,
  étiquette, règles, escale, écran « outil » générique).
- `css/app.css` : styles repris de la maquette validée + compléments ; `css/polices.css` + `polices/` :
  Barlow (licence OFL), embarquée pour le hors ligne.
- `manifest.webmanifest` : id, start_url et scope = `/Carnet-de-vol-TEST/` (le site grisonb.github.io héberge
  d'autres apps, NPF-Q400 et NPF-Q400-TEST : ne jamais élargir la portée ni réutiliser leur id).
- `sw.js` : service worker, portée `/Carnet-de-vol-TEST/`, cache « carnet-de-vol-vX.Y », cache d'abord ; ne lit
  et ne supprime QUE les caches « carnet-de-vol-… » (les caches sont partagés par tout le site). Liste de fichiers à tenir à jour
  (un test vérifie que tous les js/css/polices/icônes y sont).
- `js/` — logique sans interface (testée sous Node) :
  - `temps.js` durées et heures ; `fuseaux.js` UTC <-> heure locale du terrain (Intl) ;
  - `nuit.js` temps de nuit EASA (soleil à plus de 6° sous l'horizon, minute par minute le long de la route) ;
  - `terrains.js` table OACI `ressources/terrains.json` (code -> lat, lon, nom, pays, fuseau),
    générée par `outils/generer-terrains.py` depuis OurAirports (domaine public) et mwgg/Airports (MIT) ;
  - `drapeaux.js` drapeaux SVG dessinés par l'app ; `types-avion.js` table des types OACI ;
  - `modele.js` structure vol / avion / personne, colonnes EASA (SE / ME / multipilote), fonctions ;
  - `missions.js` lignes de mission, numéros de feu, pastilles par règles, « Remarque du carnet » ;
  - `flylog.js` import FlyLog (anti-doublon par quantités) ; `totaux.js` ; `controle.js` ;
  - `pdf.js` carnet EASA (jsPDF, `vendor/jspdf.umd.min.js`, MIT) ; `sauvegarde.js` sauvegarde JSON + tableur CSV ;
  - `csv.js` ; `db.js` IndexedDB ; `etat.js` données en mémoire + enregistrement ; `version.js`.
- `js/ui/` — écrans : `carnet.js` (liste par paquets de 40 au défilement), `saisie.js`, `avions.js`,
  `totaux.js`, `plus.js`, `regles.js`, `commun.js`. `js/app.js` démarre l'app.

### Données (IndexedDB « carnet-de-vol »)

Magasins `vols`, `avions`, `personnes` (clé `id` UUID, `creeLe`, `modifieLe` : prêt pour la copie NAS v0.2),
`suppressions` (traces des suppressions pour la synchro), `reglages` (compteurs, règles de pastilles,
étiquettes, missions ajoutées, titulaire, date de dernière sauvegarde, types modifiés, référence du contrôle).

Un vol stocke les heures bloc en **UTC** (`date` = date UTC du départ, `hDep`, `hArr`) et `mode` ('loc'|'utc')
pour l'affichage. Colonnes avion `tempsSE/ME/MP` : `null` = déduit de la fiche avion ; valeur = saisie.
Monopilote SE/ME = temps total − part multipilote du vol (c'est ainsi que FlyLog compte).

## Tests

- `npm test` : tests unitaires (Node, vols inventés).
- `node tests/navigateur/parcours.mjs` : parcours complet Chromium, émulation Pixel 7.
- `node tests/navigateur/installation.mjs` : manifeste installable, id distinct des autres apps du site,
  service worker limité au Carnet (le serveur de test sert l'app sous /Carnet-de-vol-TEST/).
- `node tests/navigateur/fluidite.mjs` : 4070 vols inventés, processeur ralenti ×6.
- `node outils/controle-import.mjs ../donnees-privees/flylog-decode-v1.csv ../donnees-privees/totaux-flylog-reference.json` :
  contrôle avec le VRAI fichier, en local uniquement (rien n'est écrit dans le dépôt).
- Sur ce PC (WSL, sans sudo), Chromium a besoin de bibliothèques extraites localement :
  `LD_LIBRARY_PATH=<dossier>/usr/lib/x86_64-linux-gnu` (paquets libnss3, libnspr4, libasound2t64
  récupérés avec `apt-get download` puis `dpkg -x`). npm peut être bloqué par le réseau : les paquets
  peuvent être téléchargés avec curl depuis registry.npmjs.org.
