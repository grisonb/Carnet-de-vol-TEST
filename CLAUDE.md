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
- Une version = une livraison poussée. Le numéro est écrit à UN SEUL endroit : `js/numero-version.js`.
  Le service worker le lit avec `importScripts` pour nommer son cache ; l'app le lit via `js/version.js`
  (accueil « vX.Y » en haut à gauche, écran Plus). Changer ce numéro change le cache : le téléphone récupère
  la version. **Le service worker doit rester un script CLASSIQUE (jamais `import`/`export`, jamais
  `type: 'module'`)** : sinon les téléphones déjà installés ne peuvent plus se mettre à jour (bug de la v0.2).
  Ajouter une entrée dans `JOURNAL.md`.
- Textes de l'app en français. Durées affichées « 1h18 », totaux « 5 702h48 ».
- v0.1 : AUCUN serveur ni appel réseau en dehors du chargement de l'app depuis GitHub Pages.

## Traces ADS-B (VPS)

Serveur : `https://vps-3c305ff2.vps.ovh.net/carnet-traces/` (index.json + traces/<code>/<jour>.json), mot de passe
de l'utilisateur « carnet » (jamais dans le dépôt). Installation, script et retour arrière : dossier privé
`../donnees-privees/vps-carnet-traces/`. Toute modification du VPS : montrer d'abord, attendre l'OK tapé.
Les codes ADS-B et immatriculations réels ne sont JAMAIS dans le dépôt (servis par le VPS derrière le mot de passe).
IndexedDB v2 : magasin `traces` (hors sauvegarde). Le mot de passe (`cartesMotDePasse`) est exclu de la sauvegarde.

## Copie automatique sur le NAS (v0.10)

`js/copieur.js` (logique : regroupement 5 s, une seule copie en attente, essais espacés, textes) et `js/ui/nas.js`
(envoi gzip + SHA-256 vers `<adresse>/carnet.php?action=envoyer|test|liste|lire&v=2`, en-tête `X-Carnet-Cle`, écrans Plus).
Protocole 2 (v0.12) : le serveur web du Synology remplace toute réponse 4xx/5xx par sa page (sans CORS, illisible) ;
avec `&v=2` le NAS répond aux erreurs en 200 + `{"erreur","code"}` (`erreurDansReponse`). Le PHP web du NAS n'a pas
zlib : l'app envoie `&vols=N`, le NAS vérifie la copie par son empreinte. Garder la compatibilité avec les vrais codes HTTP.
L'adresse du NAS et son mot de passe sont TAPÉS sur le téléphone (réglages `nasAdresse`, `nasMotDePasse`, `nasAuto`,
`nasEtat`, écrits avec `ecrireReglageDiscret` pour ne pas relancer une copie) : jamais dans le dépôt, exclus de la
sauvegarde (`REGLAGES_PRIVES`). Script PHP, installation (tâche DSM root) et guide : dossier privé
`../donnees-privees/nas-carnet-sauvegarde/` (jamais dans le dépôt). Ne jamais toucher au NAS soi-même.

## Vols envoyés par NPF-Q400 (v0.15)

Format commun « carnet-vol-npf » versions 1 et 2 (défini avec la session NPF-Q400 TEST : ne pas le changer seul ;
v2 = avion par `nomAvion` « M73 », escales = passages ordonnés { oaci, nom, lat, lon, atterrissages ISO UTC },
`copilote` trigramme). NAS : carnet.php version 4, actions `vol-depot`, `vols-liste`, `vol-retirer` (dossier privé
`vols-npf/`). Logique : `js/npf.js` (validation, avion par immatriculation / nom, escales jour / nuit, copilote,
brouillon, lignes « FEU n°NN », différences ; la table des terrains est passée en paramètre) ; écrans :
`js/ui/npf.js` (bandeau `#npf-bandeau`, liste, Ignorer, mise à jour) et `ouvrirSaisie(vol, { npf })` (brouillon,
zone `#npf-zone`). Un vol enregistré garde `npfId`, `npfExporteLe` et `feuxPositions` (Carte du vol : flammes).
Une escale peut n'avoir qu'un `nom` (pélicandrome sans code OACI) et sa position `lat` / `lon` ; `arriveePosition`
(v0.17) = position GPS d'une arrivée sans code : dernier atterrissage et nuit calculés à cette position tant qu'aucun
terrain connu n'est tapé (`F.arrPos`), gardée avec le vol pour la Carte du vol ; jamais de personne
créée sans accord pour un copilote NPF inconnu.
Jamais d'enregistrement automatique ; jamais de message d'erreur intrusif.

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
  - `terrains.js` table mondiale OACI `ressources/terrains.json` ({z: fuseaux, t: {code: [lat, lon, nom, pays,
    n° de fuseau]}}), générée par `outils/generer-terrains.py` depuis OurAirports (domaine public) et
    mwgg/Airports (MIT) ; + terrains ajoutés à la main par le pilote (réglage `terrainsPerso`, jamais dans le code) ;
  - `drapeaux.js` drapeaux SVG dessinés par l'app ; `types-avion.js` table des types OACI (+ `typesAffiches` pour Plus) ;
  - `modele.js` structure vol / avion / personne, colonnes EASA (SE / ME / multipilote), fonctions ;
  - `missions.js` lignes de mission, numéros de feu, pastilles par règles, « Remarque du carnet » ;
  - `flylog.js` import FlyLog (anti-doublon par quantités) ; `totaux.js` ; `controle.js` ;
  - `pdf.js` carnet EASA (jsPDF, `vendor/jspdf.umd.min.js`, MIT ; cases centrées, tailles `TAILLES` / `MINI` : ne pas
    changer colonnes, largeurs ni `LIGNES_PAR_PAGE`) ; `sauvegarde.js` sauvegarde JSON + tableur CSV
    (`sansPhotos` pour la copie NAS, `garderPhotos` à la restauration depuis le NAS) ;
  - `csv.js` ; `db.js` IndexedDB ; `etat.js` données en mémoire + enregistrement ; `version.js` ;
  - `bande.js` bande d'heures de l'accueil (choix et valeurs, à partir de `calculerTotaux`) ;
  - `traces.js` traces ADS-B : découpe aux heures bloc, cas et textes de la « Carte du vol » (affichage seulement).
- `js/ui/` — écrans : `carnet.js` (liste par paquets de 40 au défilement, loupe ; fenêtre [debut, affiches[ : la liste
  peut s'ouvrir sur un vol ancien et charger les plus récents au-dessus ; place gardée entre les écrans via
  `memoriserPlace` / `restaurerPlace`, `history.scrollRestoration = 'manual'`), `saisie.js`, `avions.js`
  (recherche, Tous mes avions, fiche lecture seule / modification), `terrain-perso.js`, `glisser.js` (glisser
  une ligne vers la gauche -> bouton « Supprimer »), `totaux.js`, `plus.js`,
  `regles.js`, `commun.js`, `carte.js` (Carte du vol : serveur de traces, Leaflet, plein écran, Plus › Cartes de vol),
  `suppression.js` (suppression d'un vol avec confirmation + Annuler, partagée),
  `retour.js` (flèche retour Android : une entrée d'historique par niveau ouvert, fenêtres suivies par leur attribut
  `hidden` ; toute nouvelle fenêtre doit être ajoutée à sa liste COUCHES avec son bouton de fermeture ; v0.18 : chaque
  entrée porte son niveau `{ carnet: n }` et un `history.go()` de l'app est reconnu à son niveau d'arrivée (`cible`),
  même en retard — ne jamais revenir à un simple délai).
- `js/recherche.js` : recherche de vols par date (jour / mois / année, formats français).
- `js/fiches-avions.js` : import de fiches avions (immat -> Nom, Indicatif radio, Modèle ; Plus › Importer des fiches
  avions). Le fichier réel du pilote est dans `../donnees-privees/` (jamais dans le dépôt).
- Saisie : nouveau vol = arrivée du dernier vol -> `arriveeParDefaut` (modele.js : FMEP si départ FMEP, sinon `BASE` LFTW ; suit le
  départ tant que `F.arrAuto`, v0.20) ; bouton « LF » (réglage `prefixeLF`) dans `champOACI`.
- Boutons × : constante `CROIX` (`commun.js`, croix dessinée) dans un bouton `.xbtn` ou `.x` (rond rouge).
- Couleurs (v0.19) : classe `vert` (valider / continuer : bandeau NPF, #save, #ab-no) et `annuler` (tout bouton « Annuler »,
  y compris les nouveaux) ; jetons `--vert-fond`, `--rouge-fond`, texte blanc (contraste > 4,5:1).
- Mot de passe du NAS (v0.22, R51, carnet.php v5) : Plus › Copie sur le NAS › Changer le mot de passe
  (`ecranChangerMotDePasse`, js/ui/nas.js ; règles `problemeNouveauMotDePasse` dans js/copieur.js : 12 caractères,
  ASCII sans espace car il voyage dans l'en-tête X-Carnet-Cle). Après un refus ou une réponse perdue, l'app vérifie
  avec le nouveau (le navigateur peut renvoyer la demande). Mot de passe refusé -> `nasRefuse()` : AUCUN appel
  automatique (copie, vols NPF) tant qu'il n'est pas corrigé (sinon blocage « trop d'essais » de l'adresse, iPad compris).
  L'ancien mot de passe reste la clé de NPF-Q400 (test répond `cle: 'npf'`). 429 -> statut `bloque` (+ `attente`).
- Synchro (v0.23, R50 étape 3, sens unique) : `js/synchro.js` (logique pure : éléments, carte {clé: [rev, empreinte]},
  envoi des seuls changements + suppressions, réception) et `js/ui/synchro.js` (Plus › Synchro du carnet, réseau via
  requete de nas.js : synchro-etat / -recevoir / -envoyer). Rôle par appareil `synchroRole` ('reference' = téléphone qui
  envoie, 'consultation' = PC qui reçoit), `synchroEtat`, `synchroAppareil` : dans REGLAGES_PRIVES (hors sauvegarde).
  Réglages qui voyagent : REGLAGES_PARTAGES. Photos d'avion : jamais envoyées (v0.25). Consultation : `enConsultation()`
  (etat.js) refuse toute écriture du carnet (événement consultation-refus), body.consultation cache les boutons de
  modification, pas de copie NAS ni de vols NPF sur cet appareil ; jamais de copie d'un carnet vide.
- Synchro deux sens (v0.24, R50 étape 4) : rôles 'reference' (téléphone) et 'modification' (PC) envoient ET reçoivent.
  Carte {clé: [rev, empreinte | null (trace de suppression)]} = dernière version commune ; `analyserRecus` : un élément
  reçu ne remplace celui d'ici que s'il n'a pas changé ici depuis (sinon fusion pour REGLAGES_FUSIONNABLES, sinon
  CONFLIT gardé dans synchroEtat.conflits, rien n'est envoyé pour lui avant le choix). Le rev n'avance QUE par la
  réception (jamais par l'envoi). Vol ouvert dans la saisie (`cleVolOuvert`) : jamais changé, conflit. Plus de 20
  suppressions : `aConfirmer` (bandeau), envoi après confirmation. `synchroHistorique` (privé) : « Annuler la dernière
  synchro » (30 j). Opérations sur l'état de la synchro en file (`exclusif`). Vols NPF et copies NAS : téléphone seulement.
  Doublons : `doublons()` parmi les vols créés depuis `deuxSensDepuis` ; `doublonsVus` partagé.
- iPad (v0.25) : 3e appareil, rôle 'modification' comme le PC ; reconnu par `estIPad` (UA iPad, ou Mac tactile :
  iPadOS se présente comme un Mac) -> identifiant 'ipad-…', textes « Cet iPad », « Garder la version de l'iPad »
  (`duNom`, `ceNom`, `leNom` dans synchro.js). Tablette tactile (pointer:coarse, ≥ 700 px) : onglets et « Annuler » ≥ 44 px.
  Barre d'état : padding env(safe-area-inset-top). Carnet d'ici vide : pas de « Confirmer » des suppressions.
  Même origine que NPF-Q400 (grisonb.github.io) : le Carnet ne touche qu'à ses caches (préfixe 'carnet-de-vol-',
  sw.js) et à sa base IndexedDB 'carnet-de-vol' ; aucun localStorage.
- v0.26 : majuscules par défaut (attribut `autocapitalize` : characters pour codes / immatriculations / noms d'avion /
  trigrammes / étiquettes / missions, words pour noms de personnes / terrains / titulaire, sentences pour remarques /
  modèles ; vérifié champ par champ par tests/unitaires/v026.test.js). Bouton `#rafraichir` (haut gauche du Carnet) =
  synchroniser maintenant, `texteRafraichir` (synchro.js). Synchro : envoyeur regroupé sur 0,3 s ; `dernierEnvoi()` à
  visibilitychange hidden / pagehide (requete keepalive, 60 Ko au plus, depuis le carnet en mémoire) ; « N en attente
  d'envoi » (#sync-bandeau.discret) tant que quelque chose n'est pas parti.
- v0.27 : `ouvrirSaisie` remet TOUTES les cases du formulaire à zéro avant de remplir (R64 : Temps IFR / nuit du vol
  précédent repris et enregistrés). R63 : chaque escale a `approches` ; `vol.approches` reste le TOTAL (arrivée +
  escales : PDF, CSV, synchro, sauvegardes inchangés) ; le compteur principal = total − escales (`approchesEscales`).
- v0.28 : carte du Carnet : étiquette `.chip.appr` « N appr. » (total) après l'IFR (R65) ; temps de vol dans une pastille
  `.fl-bloc.t-feu|feu2|mi|ifr|sable` (`couleurTemps` dans js/ui/carnet.js : feu > Entraînement > IFR > sable, mêmes règles
  et mêmes couleurs CSS que les étiquettes) (R66). Plus de bouton flottant : `#fab` = « + » rond vert dans `.tabs`, à droite
  de « Plus » (actif depuis toutes les vues ; saisie modifiée : « Abandonner la saisie ? » puis nouveau vol, `apresAbandon`) (R67).
- v0.31 : R70 étiquette « Entraînement » `.chip.mi.ent` + pastille `.fl-bloc.t-mi` (#f0a050 / #3f1c02 ; sombre #d97b2b / #1f0d00).
  R71 période de la loupe (`#p-du`, `#p-au`, `periodeDe`, `lireJour`, `formaterJour` dans js/ui/carnet.js ; `dateAffichee`
  mémorisée par vol) : seuls #h-total et la bande suivent (`volsDuHaut`), #h-quick masqué, bandeau `#periode-bandeau`.
  R72 flammes (js/ui/carte.js, plein écran seulement, pas en consultation) : appui long 0,6 s = déplacement (pointer
  events), toucher = bulle « Supprimer ce feu », fenêtre `#feu-modal` ; `communeDe` = géocodage inverse IGN
  (`CARNET_GEOCODAGE`, index=parcel puis address) ; hors ligne : `communeAVenir` + réglage privé `feuxCommunesEnAttente`
  (`recalculerCommunes` au retour du réseau) ; vol marqué `feuxRetouches` : la mise à jour NPF garde ses flammes sauf
  `#npf-feux` (« Reprendre… ») ; `enregistrer()` de la saisie reprend `feuxPositions` de la dernière version enregistrée.
  R73 `poserFond` : Plan (OSM) / Photo (`CARNET_TUILES_PHOTO`, WMTS IGN ORTHOIMAGERY.ORTHOPHOTOS, « © IGN »),
  réglage privé `carteFond` ; jamais en cache (le service worker ne garde que les fichiers de l'app). R74 `.viachip` :
  `.vc-nom` (« … ») + `.vc-n` pastilles `.vc-p` (`.zero` en gris).
- v0.30 (R69) : libellés des compteurs de la saisie (`.step>span:first-child`, `.mlbl`) en `--ink`, 600, 17 px ; « (n°…) » (`.step small.hint`) 14 px gris foncé (clair/sombre) ; `.step .ctl` ne rétrécit pas.
- v0.29 (R68) : `couleurTemps` rend `feu` pour TOUT vol feu (plus de pastille `t-feu2` en contour) ; l'étiquette `.chip.feu2` reste en contour.
- Photos d'Internet (v0.21, R34) : `js/photos-web.js` (Commons : catégorie « immat (aircraft) » puis titres ; Planespotters)
  et `js/ui/photo-web.js` (fenêtre #ph-modal). Commons : photo choisie gardée avec `photoCredit` {source, auteur, licence,
  licenceUrl, page, titre}, crédit affiché sous la photo (#fi-credit). Planespotters : AFFICHÉE seulement (ses règles
  interdisent de garder l'image), adresses inchangées, lien vers sa page sans nofollow. Tests : `CARNET_COMMONS`,
  `CARNET_PLANESPOTTERS` (faux serveurs locaux). `photoCredit` suit `photo` (copie NAS, restauration).
- Référence d'interface : maquette v19 (`../donnees-privees/maquette-carnet-v19.html`, contient de vraies données :
  jamais dans le dépôt) et remarques P1-P6, R1-R15.
- `js/app.js` démarre l'app.

### Données (IndexedDB « carnet-de-vol »)

Magasins `vols`, `avions`, `personnes` (clé `id` UUID, `creeLe`, `modifieLe` : prêt pour la copie NAS v0.2),
`suppressions` (traces des suppressions pour la synchro), `reglages` (compteurs, règles de pastilles,
étiquettes, missions ajoutées, titulaire, date de dernière sauvegarde, types modifiés, référence du contrôle).

Un vol stocke les heures bloc en **UTC** (`date` = date UTC du départ, `hDep`, `hArr`) et `mode` ('loc'|'utc')
pour l'affichage. Colonnes avion `tempsSE/ME/MP` : `null` = déduit de la fiche avion ; valeur = saisie.
Monopilote SE/ME = temps total − part multipilote du vol (c'est ainsi que FlyLog compte).
Avion : `nom` (court, affiché en gras dans la saisie), `indicatif` (radio, seulement dans la fiche),
`etiquettes` (proposées dans la saisie ; défaut : DH8D -> BOMBING + TRANSPORT, train classique -> TAILWHEEL).
BOMBING et TRANSPORT s'excluent sur un vol. Suggestions de missions masquées : réglage `missionsMasquees`
(on ne modifie jamais le texte des vols). Compteurs du bloc Mission par type d'avion : `COMPTEURS_PAR_TYPE`
(`modele.js`, DH8D seulement pour l'instant). Bande d'heures : réglage `bandeHeures` (liste ordonnée de clés, rangée avec ↑ ↓ dans la fenêtre de choix). Migrations de données : `etat.js` (`migrer`, une fois, drapeau en réglage).

## Tests

- `npm test` : tests unitaires (Node, vols inventés).
- `node tests/navigateur/parcours.mjs` : parcours complet Chromium, émulation Pixel 7.
- `node tests/navigateur/installation.mjs` : manifeste installable, id distinct des autres apps du site,
  service worker limité au Carnet (le serveur de test sert l'app sous /Carnet-de-vol-TEST/).
- `node tests/navigateur/mise-a-jour.mjs` : mise à jour d'une app installée (v0.1, v0.2, version suivante).
- `node tests/navigateur/v04.mjs` : écrans v0.4 à 390 px (migration v0.3, avion, étiquettes, monopilote,
  fiche lecture seule, terrains) + captures `tests/navigateur/captures/v04-*.png`.
- `node tests/navigateur/v05.mjs` : glisser une suggestion de mission pour la supprimer (glissés tactiles simulés
  par le protocole DevTools), Annuler, suggestions masquées, sauvegarde / restauration.
- `node tests/navigateur/v06.mjs` : bande d'heures, libellés missions, suppression d'un vol par glissé, compteurs DH8D.
- `node tests/navigateur/v07.mjs` : bande d'heures sous le TOTAL, ordre ↑ ↓, Feux / Largages CdB Dash.
- `node tests/navigateur/v08.mjs` : Carte du vol avec FAUX serveur de traces et de tuiles (jamais le vrai VPS).
- `node tests/navigateur/v09.mjs` : boutons × rouges, menu Plus par sections, flèche retour, appui long, recherche par date.
- `node tests/navigateur/v010.mjs` : types d'avion ; copie NAS avec un FAUX NAS local (regroupement, NAS injoignable,
  hors ligne, mot de passe refusé, restauration d'une version).
- `node tests/navigateur/v011.mjs` : carte de vol du Carnet (date, nom / immatriculation, modèle coupé, mission), clair / sombre.
- `node tests/navigateur/v012.mjs` : copie NAS avec un FAUX NAS qui imite le Synology (pages d'erreur sans CORS) :
  protocole 2 (`&v=2`, erreurs lisibles), NAS sans zlib (`&vols=N`), ancien script.
- `node tests/navigateur/v013.mjs` : place gardée dans la liste, « Voir dans le carnet », « ↑ Dernier vol » (600 vols inventés).
- `node tests/navigateur/v014.mjs` : copie NAS sans photos, sauvegarde avec photos, restauration qui garde les photos,
  Entrée de la recherche, PDF depuis l'app. PDF sous Node : `tests/outils/pdf-noeud.js` (enregistreur : chaque case et
  chaque texte, pour vérifier que rien ne déborde) et `tests/outils/vols-pdf.js` (vols inventés difficiles).
- `node tests/navigateur/v015.mjs` : vols NPF-Q400 avec un FAUX NAS v3 (bandeau, liste, brouillon LOC / UTC, minuit UTC,
  avion inconnu, 0 / 1 / 3 feux, Enregistrer -> retrait, Ignorer, mise à jour du même id, carte des feux hors ligne).
- `node tests/navigateur/v016.mjs` : vols NPF au format 2 (avion par nom, deux avions du même nom, escales ordonnées
  jour / nuit, pélicandrome sans code, copilote trouvé / inconnu, ce qui change, format 1 toujours lu).
- `node tests/navigateur/v016b.mjs` : terrains par défaut d'un nouveau vol (-> LFTW), sélection du code au toucher, bouton
  « LF » (2 lettres, hors LF, mémorisé), vol NPF non modifié, Plus › Importer des fiches avions (avions inventés).
- `node tests/navigateur/v017.mjs` : `arriveePosition` (arrivée sans code OACI : jour / nuit, code tapé ensuite, carte).
- `node tests/navigateur/v017b.mjs` : avions d'un même type classés par immatriculation (`classerParTypeEtImmat`, `modele.js`).
- `node tests/navigateur/v018.mjs` : touchers simulés avec history.go() lent (comme le téléphone) : liste des vols NPF.
- `node tests/navigateur/v019.mjs` : couleurs vert / rouge (contraste, même place et même taille, clair / sombre).
- `node tests/navigateur/v020.mjs` : La Réunion (R58 arrivée FMEP, nuit FMEP, saisie FMEP / FMEE avec et sans « LF »).
- `node tests/navigateur/v021.mjs` : photos d'Internet (faux Commons / Planespotters : choix, crédit, jamais gardée pour Planespotters).
- `node tests/navigateur/v022.mjs` : changer le mot de passe du NAS (faux NAS v5 : clé NPF, trop d'essais, NAS v4, réponse perdue).
- `node tests/navigateur/v023.mjs` : synchro téléphone -> PC (deux appareils, faux NAS v5, 1 200 vols, consultation, hors ligne).
- `node tests/navigateur/v025.mjs` : iPad (WebKit, paysage / portrait) 3e appareil : rejoindre, modifier, conflit, hors ligne, carnet effacé.
  WebKit sur ce PC (Ubuntu 26.04) : bibliothèques d'Ubuntu 24.04 décompressées dans ~/.cache/carnet-webkit-libs et
  reliées dans ~/.cache/ms-playwright/webkit-2104/minibrowser-wpe/sys/lib ; le test met PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1.
- `node tests/navigateur/v026.mjs` : majuscules, bouton « Rafraîchir » (3 appareils), envoi dès l'enregistrement et à la fermeture (keepalive), fenêtre photo.
- `node tests/navigateur/v027.mjs` : R64 formulaire propre (2 vols NPF à la suite, Nouveau vol après Enregistrer / Annuler / Ignorer) et R63 approches par terrain intermédiaire (PDF, CSV, sauvegarde, synchro, iPad).
- `node tests/navigateur/v028.mjs` : étiquette « N appr. », pastille du temps (couleurs = étiquettes, route longue sans chevauchement), « + » de la barre du bas (19 px, 360 px, garde d'abandon, Enregistrer non recouvert), téléphone, PC, iPad paysage et portrait.
- `node tests/navigateur/v029.mjs` : pastille du temps pleine (couleur « Feu n°… ») pour tout vol feu, « Feu » repris compris, en clair et en sombre (téléphone, PC, iPad).
- `node tests/navigateur/v030.mjs` : libellés des compteurs (taille, graisse, couleur, contraste clair/sombre), libellé long à 360 px, fenêtre Terrain intermédiaire (téléphone, PC, iPad).
- `node tests/navigateur/v031.mjs` : orange Entraînement (contraste), période de la loupe (totaux du haut, Totaux et PDF inchangés), flammes (appui long, Annuler, commune par FAUX géocodage IGN, hors ligne, suppression, synchro PC, réimport NPF), fond Photo (FAUX IGN, crédit, hors ligne, rien en cache), terrains intermédiaires à 360 px ; iPad WebKit (service worker bloqué pour que Playwright voie les demandes).
- `node tests/navigateur/v024.mjs` : synchro dans les deux sens (passage en modification, conflits et 3 choix, doublon, NPF, hors ligne, >20 suppressions, annuler, mot de passe refusé).
- `node tests/navigateur/fluidite.mjs` : 4070 vols inventés, processeur ralenti ×6.
- `node outils/controle-import.mjs ../donnees-privees/flylog-decode-v1.csv ../donnees-privees/totaux-flylog-reference.json` :
  contrôle avec le VRAI fichier, en local uniquement (rien n'est écrit dans le dépôt).
- Sur ce PC (WSL, sans sudo), Chromium a besoin de bibliothèques extraites localement :
  `LD_LIBRARY_PATH=~/.cache/carnet-chromium-libs/root/usr/lib/x86_64-linux-gnu` (paquets libnss3, libnspr4, libasound2t64
  récupérés avec `apt-get download` puis `dpkg -x`). npm peut être bloqué par le réseau : les paquets
  peuvent être téléchargés avec curl depuis registry.npmjs.org.
