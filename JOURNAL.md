# Journal des versions

## v0.9 — 05/11/2026

Cinq remarques faites sur le téléphone (R25 à R29), maquette v24.

**Ce qui change**
- R25 : tous les boutons × (fermer une fiche, une liste, la carte en plein écran, enlever une ligne de mission ou
  une règle, menu + de Mes avions ouvert) : rond plein rouge, croix blanche en gras dessinée par l'app (SVG),
  même taille qu'avant (≥ 40 px), lisible en mode sombre.
- R26 : menu Plus par sections (Sauvegarde, Exporter, Mes réglages, Import FlyLog, Téléphone), chaque entrée avec une
  icône dans un carré de la couleur du bloc, titre en gras, sous-titre dessous, chevron ›. En haut, un encart
  « sauvegarde » (jaune s'il n'y en a jamais eu ou plus de 7 jours, avec un bouton « Sauvegarder » ; sinon
  « Sauvegardé le JJ/MM » avec une coche verte) qui remplace l'ancien bandeau. Nouvelles entrées « Heures affichées
  en haut », « Libellés missions » et « Stockage » ; « Cartes de vol » indique l'avancement du rattrapage.
  Version en bas ; plus de mot « OUTILS ».
- R27 : flèche / geste retour d'Android : ferme la fenêtre ouverte, la carte plein écran, la fiche du vol, revient au
  Carnet depuis Totaux ou Plus ; sur l'accueil, l'app se ferme. Fiche d'un vol modifiée et non enregistrée :
  « Abandonner la saisie ? ». Une entrée d'historique par niveau ouvert (js/ui/retour.js) ; fermer par × retire la
  sienne (pas de double appui).
- R28 : plus de sélection de texte, de loupe, de menu « copier » ni de surlignage bleu à l'appui long, sauf dans les
  champs de saisie (copier-coller possible).
- R29 : recherche par date dans la loupe du Carnet (06/05/25, 6/5/2025, 06.05.2025, 06-05-25, 06 05 2025, 060525,
  06052025, 2025-05-06 ; 05/2025 = le mois ; 06/05 = ce jour toutes années ; 2025 = l'année). Sinon, recherche texte
  comme avant (js/recherche.js).

**Tests**
- 74 tests unitaires (6 nouveaux : formats de date, encart sauvegarde) ; nouveau test `tests/navigateur/v09.mjs`
  (flèche retour dans chaque cas, × puis retour, entrées de Plus, recherche par date, captures clair / sombre) ;
  tous les tests existants réussis ; contrôle local avec le vrai fichier FlyLog (non commité).

## v0.8 — 05/11/2026

« Carte du vol » (remarques R22 / R23) : trace ADS-B des archives adsb.lol, récupérées chaque nuit par le VPS
(/carnet-traces/, protégé par mot de passe). Affichage SEULEMENT : la trace ne modifie, ne propose et ne compare
jamais les heures ni les terrains.

**Ce qui change**
- Écran du vol : bloc bleu « Carte du vol » (trace en trait bleu, terrains de départ / escales / arrivée nommés).
  Fond OpenStreetMap avec du réseau (« © OpenStreetMap »), fond neutre sans réseau ; toujours « Données © adsb.lol,
  ODbL ». Toucher la carte : plein écran avec zoom au doigt, × pour fermer.
- Textes selon le cas : disponible demain matin, pas de code ADS-B, pas de trace (avion non capté), La Réunion non
  couverte, pas d'archive avant mars 2023, mot de passe à saisir, simulateur, rattrapage en cours.
- Récupération : à l'ouverture d'un vol, et en arrière-plan au démarrage pour les 30 derniers jours ; une demande à
  la fois, discrète. Seule la partie entre les heures bloc (marge 10 min, vol par-dessus minuit compris) est gardée,
  allégée à 800 points au plus, rangée sur le téléphone (nouveau magasin IndexedDB « traces », base v2) : ensuite
  affichée sans réseau. Recalculée si la date, les heures ou l'avion du vol changent.
- Plus › Cartes de vol : mot de passe (gardé sur le téléphone seulement : ni CSV, ni sauvegarde de secours ; conservé
  lors d'une restauration), bouton « Tester », état du serveur.
- Fiche avion : champ « Code ADS-B », rempli automatiquement depuis la liste du serveur (protégée), modifiable.
- Traces hors sauvegarde de secours (elles se retéléchargent ; la sauvegarde reste légère).
- Bibliothèque de carte Leaflet 1.9.4 (BSD-2) incluse : 162 Ko (≈ 46 Ko compressés), chargée à la première carte.

**Tests**
- 68 tests unitaires (dont 9 nouveaux) ; nouveau test `tests/navigateur/v08.mjs` avec faux serveur de traces et de
  tuiles (le vrai VPS n'est jamais appelé) ; tous les tests existants réussis.
- Contrôle local final (non commité) avec le vrai mot de passe et de vrais vols : traces affichées sur la carte.

## v0.7 — 05/11/2026

Remarque R24 (bande d'heures de l'accueil), maquette v23.

**Ce qui change**
- La bande d'heures est juste sous le TOTAL HdV, au-dessus des cases 3 / 7 / 30 jours.
- Fenêtre « Heures affichées en haut » : section « Ordre d'affichage » en haut (une ligne par valeur cochée,
  flèches ↑ ↓, libellé, valeur) ; ↑ désactivée en première ligne, ↓ en dernière. L'ordre est enregistré
  (réglage `bandeHeures`, compris dans la sauvegarde) ; une valeur nouvellement cochée s'ajoute à la fin.
- Deux nouveaux choix « Général » : Feux et Largages CdB Dash (nombres, mêmes calculs que l'écran Totaux).
- Le choix déjà fait sur le téléphone est conservé (même réglage qu'en v0.6).

**Tests**
- 59 tests unitaires (dont 4 nouveaux) ; nouveau test `tests/navigateur/v07.mjs` (390 px) avec captures ;
  tous les tests existants réussis ; vrai fichier FlyLog (local) : Feux 47, Largages CdB Dash 225, totaux identiques.

## v0.6 — 05/11/2026

Remarques R17 à R21, d'après la maquette v21.

**Ce qui change**
- Accueil : bande d'heures sous 3 / 7 / 30 jours (valeur « 2 695h20 », libellé dessous, défilement horizontal).
  Par défaut CdB, Copi, DC, Instructeur, IFR, Nuit. La toucher ouvre « Heures affichées en haut » : Temps bloc,
  Simulateur, CdB, Copi, DC, Instructeur, IFR, Nuit, Vols, Atterrissages, et un bouton par type d'avion (du plus
  d'heures au moins ; DH8D : total, CdB, Copi). Ordre = ordre coché ; choix enregistré (réglage `bandeHeures`,
  compris dans la sauvegarde). Mêmes calculs que l'écran Totaux.
- Bloc Mission : « Libellés missions › » (au-dessus de « Règles des pastilles › ») : tous les libellés, recherche,
  glissé à gauche pour supprimer avec « Annuler » (même liste « suggestions masquées » qu'en v0.5).
- Carnet : glisser une carte de vol vers la gauche -> « Supprimer » -> confirmation « Supprimer ce vol ? » (date,
  trajet, durée) -> « Vol supprimé — Annuler » 4 s ; « Annuler » remet le vol à l'identique. Même fonction que
  le bouton « Supprimer ce vol » de l'écran du vol. Tous les totaux sont recalculés.
- Compteurs du bloc Mission (Feux, largages, « Choisir et ranger ») seulement pour un DH8D (règles par type
  d'avion dans `modele.js`, `COMPTEURS_PAR_TYPE`) ; un ancien vol avec des compteurs non nuls les garde visibles.
- Prochain n° de feu : cherché aussi dans les remarques des vols (en plus des lignes de mission).
- Le message « Annuler » passe toujours devant les fenêtres.

**Tests**
- 55 tests unitaires (dont 6 nouveaux) ; nouveau test `tests/navigateur/v06.mjs` (390 px, glissés tactiles) avec
  captures ; tous les tests existants réussis ; contrôle avec le vrai fichier FlyLog (local) : totaux identiques,
  bande identique aux valeurs de référence, prochain feu n°52.

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
