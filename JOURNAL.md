# Journal des versions

## v0.5 — 05/11/2026

Remarque R16 : supprimer une suggestion de mission par glissé à gauche.

**Ce qui change**
- Bloc Mission de la saisie : glisser une suggestion vers la gauche la décale et fait apparaître un bouton rouge
  « Supprimer » à droite (moins loin ou vers la droite : elle revient ; une seule ouverte à la fois). Un toucher
  simple choisit toujours la suggestion ; un glissé ne la choisit jamais ; le défilement vertical reste normal.
- « Supprimer » : la suggestion disparaît et le message « « … » supprimée des suggestions — Annuler » reste
  4 secondes. Seule la suggestion est retirée : le texte des vols enregistrés ne change jamais.
- Liste des suggestions masquées enregistrée dans les données du pilote (réglage `missionsMasquees`, comprise
  dans la sauvegarde de secours et sa restauration) : elles ne reviennent ni après redémarrage ni après recalcul.
  Retapée avec « + », une mission redevient une suggestion.
- Plus › Pastilles des missions : liste « Suggestions masquées » avec un bouton « Remettre ».

**Tests**
- 49 tests unitaires (dont 4 nouveaux sur les suggestions masquées).
- Nouveau test `tests/navigateur/v05.mjs` (Chromium, 390 px, glissés tactiles simulés) avec captures.
- Tous les tests existants réussis ; contrôle avec le vrai fichier FlyLog (local) : totaux identiques.

## v0.4 — 05/11/2026

D'après la nouvelle maquette validée (v19) et les remarques P1 à P6 et R1 à R15.

**Ce qui change**
- Accueil plus compact : version en haut à gauche, loupe à droite du TOTAL HdV (la barre de recherche
  s'ouvre en la touchant ; la refermer efface la recherche). Pastilles en couleur : fonction violet,
  missions orange, IFR bleu, nuit foncé, feu rouge, largages jaune.
- Saisie : plus de titre « Vol », date étroite en haut à gauche et LOC / UTC à droite ; une couleur par bloc
  (Vol bleu, Avion vert-bleu, Ma fonction violet, Mission orange, Temps du carnet vert, Remarques gris),
  teintes prévues en mode sombre ; libellé IFR jamais coupé ; signes « + » et « − » dessinés et centrés.
- Bloc Avion : une ligne « NOM modèle IMMAT » (sans nom : « IMMAT modèle »), qui ouvre / ferme la recherche
  (« Tous mes avions › ») ; boutons « i » (fiche en lecture seule, crayon pour modifier) et « + ».
  Champ Indicatif supprimé (l'indicatif radio est dans la fiche). Étiquettes en pastilles : seulement celles
  de l'avion choisi, « + » pour en créer une (ajoutée à l'avion) ; BOMBING et TRANSPORT exclusives ;
  TAILWHEEL cochée d'office pour un train classique.
- Fiche avion : champs « Nom » et « Indicatif radio » séparés ; bloc « Étiquettes » (hors carnet officiel) ;
  BOMBING + TRANSPORT par défaut pour les DH8D seulement ; train classique coche TAILWHEEL, tricycle la décoche.
- Tous mes avions : « + » en haut à droite ; crayon sur chaque carte (fiche en modification).
- Ma fonction : avion monopilote = pas de « Copi. », pas de champ de personne en CdB.
- Terrains : table mondiale des codes OACI à 4 lettres allégée (19 316 terrains, 0,97 Mo, 0,35 Mo
  compressé) ; « Ajouter ce terrain » pour un code inconnu (enregistré dans les données du pilote).
- Migration automatique des données v0.3 (une fois) : chaque avion garde ses étiquettes, Nom et Indicatif
  radio ; les DH8D reçoivent BOMBING + TRANSPORT, les trains classiques TAILWHEEL. Aucun vol modifié.

**Tests**
- 45 tests unitaires (dont 12 nouveaux : ligne avion, étiquettes, monopilote, terrains, migration).
- Nouveau test `tests/navigateur/v04.mjs` (Chromium, 390 px) avec captures ; parcours complet, installation,
  mise à jour (v0.1, v0.2 -> v0.4) et fluidité (4070 vols) : réussis.
- Contrôle avec le vrai fichier FlyLog (local) : tous les totaux toujours identiques.

## v0.3 — 05/11/2026

Correction : un téléphone qui avait la v0.1 restait bloqué en v0.1 (il fallait vider le cache de Chrome).

**Cause** : la v0.2 avait transformé le service worker en « module ». Le téléphone, enregistré en v0.1 avec un
service worker classique, relisait le nouveau fichier comme un script classique : erreur, mise à jour
abandonnée en silence, et l'ancienne app continuait d'être servie depuis son cache.

**Ce qui change**
- Service worker redevenu un script classique ; le numéro de version est dans `js/numero-version.js`
  (seul endroit), lu par le service worker (`importScripts`) et par l'app (`js/version.js`).
- Une nouvelle version prend la main dès qu'elle est téléchargée ; l'app se recharge alors toute seule,
  sauf pendant une saisie (dans ce cas elle s'affiche au lancement suivant).
- Téléphone resté en v0.2 : le service worker se met en mode « réparation » (réseau sans cache) et la
  bonne version s'installe au lancement suivant.

**Tests**
- 33 tests unitaires (dont : service worker lisible en script classique, version à un seul endroit).
- Nouveau test `tests/navigateur/mise-a-jour.mjs` (Chromium, Pixel 7) : v0.1 -> v0.3 et v0.2 -> v0.3 au
  2e lancement ; v0.3 -> version suivante dès le 1er lancement ; un seul cache restant.

## v0.2 — 05/11/2026

Correction de l'installation sur Android quand d'autres apps du même site (grisonb.github.io) sont installées,
et version toujours visible.

**Ce qui change**
- Manifeste : identité (`id`) explicite `/Carnet-de-vol-TEST/`, `start_url` et `scope` limités à
  `/Carnet-de-vol-TEST/`, nom court unique « Carnet vol ».
- Service worker : enregistré avec la portée `/Carnet-de-vol-TEST/` ; il ne répond qu'aux adresses du Carnet,
  ne lit que SON cache (avant : recherche dans tous les caches du site) et ne supprime que les caches
  « carnet-de-vol-… ». Nouveau cache `carnet-de-vol-v0.2`.
- Numéro de version écrit à un seul endroit (`js/version.js`) : le service worker l'importe pour nommer son
  cache, l'accueil et l'écran Plus l'affichent.
- Petite mention grise « v0.2 » en haut à droite de l'accueil, au-dessus de TOTAL HdV.

**Diagnostic (lecture seule des autres apps, rien n'y est modifié)**
- Carnet v0.1 : pas d'id → id = https://grisonb.github.io/Carnet-de-vol-TEST/ (inchangé en v0.2).
- NPF-Q400-TEST et NPF-Q400 : id « ./index.html?prod=1 », qui se calcule depuis la racine du site :
  https://grisonb.github.io/index.html?prod=1 pour LES DEUX (elles se confondent entre elles) ;
  portées /NPF-Q400-TEST/ et /NPF-Q400/. Aucune ne recouvre le Carnet.

**Tests**
- 32 tests unitaires (dont : version à un seul endroit, service worker limité au Carnet, manifeste).
- Nouveau test `tests/navigateur/installation.mjs` (Chromium, Pixel 7) : manifeste valide et installable,
  id calculé du Carnet différent de ceux de NPF-Q400-TEST et NPF-Q400, portée du service worker,
  caches et pages des autres apps intacts.
- Parcours complet Pixel 7 : réussi, avec « v0.2 » visible en haut à droite de l'accueil sans recouvrir
  TOTAL HdV, et dans l'écran Plus.

## v0.1 — 04/11/2026

Première version : PWA Android hors ligne, d'après la maquette validée v13 et les remarques numérotées.

**Ce qui est fait**
- Écran Carnet : TOTAL HdV, 3 / 7 / 30 jours (aujourd'hui inclus), recherche, vols groupés par mois,
  affichage progressif (fluide avec 4000+ vols), cartes avec drapeaux dessinés, heures LOC ou UTC, (J+1),
  pastilles (fonction, autre pilote, feu plein / contour, règles, largages, atterrissages, IFR, nuit).
- Saisie / modification / suppression d'un vol : terrains OACI avec nom et drapeau, escales avec
  atterrissages, LOC / UTC, heures « 0942 », temps de vol par-dessus minuit, VFR / IFR, approches, temps IFR,
  atterrissages, temps de nuit EASA calculé, dernier atterrissage classé jour / nuit ; avion (recherche,
  « Tous mes avions », ajout, fiche avec photo réduite à 1280 px) ; indicatif ; étiquettes ; fonction
  CdB / Copi. / DC / Inst. et autre pilote ; missions avec suggestions, feux numérotés, compteurs métier
  réglables ; « Remarque du carnet » ; récapitulatif « Temps du carnet » ; remarques et visas.
- Pastilles par règles (Plus › Pastilles des missions).
- Import FlyLog avec résumé et refus des doublons ; écran Contrôle import.
- Totaux : rubriques EASA, catégories, mission, étiquettes, types, avions ; période tout / année / 12 mois / dates.
- Exports : PDF carnet EASA (A4 paysage, totaux de page, reports, cumuls, signature), tableur CSV complet,
  sauvegarde de secours réimportable à l'identique ; rappel si pas de sauvegarde depuis 7 jours.
- IndexedDB, stockage persistant demandé et affiché, service worker (hors ligne), manifeste et icônes.

**Tests**
- 31 tests unitaires sur vols inventés : temps total (dont minuit), heures locales, nuit (jour, nuit, à cheval),
  dernier atterrissage jour / nuit, feux +1 / −1 et numérotation, pastilles, import (doublons, 00:00),
  totaux, sauvegarde puis réimport identique, tableur, PDF (totaux de page et reports), version du cache.
- Parcours complet Chromium en émulation Pixel 7 (vols inventés) : réussi.
- Fluidité 4070 vols inventés, processeur ×6 : ouverture 0,9 s, recherche 0,35 s, Totaux 0,25 s.
- Import du vrai fichier FlyLog sur le PC (local, rien dans le dépôt) : tous les totaux de référence identiques.
