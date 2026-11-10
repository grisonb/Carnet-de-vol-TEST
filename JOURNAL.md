# Journal des versions

## v0.27 — 10/11/2026

Remarques R63 et R64. carnet.php v5 et format NPF (carnet-vol-npf v2) inchangés ; NAS et VPS non touchés.

**R64 (bug corrigé) : valeurs reprises d'un vol au suivant**
- Cause : le formulaire de saisie sert à chaque vol ; à l'ouverture d'un nouveau vol ou d'un brouillon NPF-Q400, les
  cases « Temps IFR » (en VFR) et « Temps nuit » (heures pas encore complètes) n'étaient pas remises à zéro : elles
  gardaient la valeur tapée dans le vol précédent, et l'enregistrement la reprenait.
- Correction : à chaque ouverture, toutes les cases repartent de zéro, puis le vol (ou le brouillon) les remplit.
  Les valeurs reprises volontairement du dernier vol enregistré ne changent pas (terrains R46/R58, avion, étiquettes,
  copilote, LOC/UTC).

**R63 : approches par terrain intermédiaire**
- Chaque terrain intermédiaire a son compteur « Appr » (– / +), à côté de ses atterrissages ; il s'affiche sur le terrain
  (« · 2 appr. »). Le compteur « Appr » principal = l'arrivée seulement ; le récapitulatif donne le total.
- Le vol garde le total (arrivée + terrains intermédiaires) : PDF et CSV le comptent ; vols existants inchangés (leurs
  approches restent sur l'arrivée) ; import NPF-Q400 : 0 sur les terrains intermédiaires (celles déjà saisies sont
  gardées lors d'une mise à jour) ; sauvegarde, restauration, copie NAS et synchro : sans perte ; ancienne sauvegarde
  relue normalement.

**Tests**
- `tests/unitaires/v027.test.js`, `tests/navigateur/v027.mjs` (téléphone, PC, iPad WebKit, faux NAS v5, captures ; le
  test R64 échoue sur la v0.26 et passe en v0.27) ; tous les tests existants ; contrôle FlyLog local.

## v0.26 — 09/11/2026

Remarques R59 à R62. carnet.php v5 inchangé ; NAS et VPS non touchés.

**Ce qui change**
- R60 majuscules par défaut sur les claviers du téléphone et de l'iPad : codes terrains, immatriculations, noms et
  indicatifs d'avion, trigrammes, étiquettes, missions, copilote en MAJUSCULES ; noms et prénoms de personnes, noms de
  terrains, titulaire avec une majuscule à chaque mot ; remarques et modèles avec une majuscule au début.
- R61 bouton « Rafraîchir » en haut à gauche du Carnet (à l'opposé de la loupe, 44 px, icône dessinée) : synchronise
  maintenant ; l'icône tourne pendant la synchro, puis « À jour » ou l'erreur (ex. « Pas de réseau, 2 en attente »).
- R62 une modification part au NAS dès l'enregistrement (au lieu de 5 s plus tard), et un dernier envoi part quand
  l'app passe en arrière-plan ou se ferme (demande qui survit à la fermeture). Sinon, elle repart à la prochaine
  ouverture, comme avant, sans rien perdre. « N en attente d'envoi » reste affiché, discret, en haut du Carnet tant
  que quelque chose n'est pas parti.
- R59 fenêtre « Chercher une photo » : « Toucher pour utiliser » sous les vignettes Commons ; « À voir seulement : ne
  peut pas être gardée » sur la photo Planespotters ; sans photo Commons : message clair + « Prendre une photo » /
  « Choisir dans la galerie ».
- Le numéro de version de l'accueil se met à droite du bouton « Rafraîchir ».

**Tests**
- `tests/unitaires/v026.test.js`, `tests/navigateur/v026.mjs` (téléphone et PC Chromium, iPad WebKit, faux NAS v5, faux
  Commons / Planespotters, captures) ; v0.21 adapté (message « aucune photo » dans l'encadré) ; tous les tests
  existants ; contrôle FlyLog local.

## v0.25 — 08/11/2026

L'iPad devient un 3e appareil du carnet (en modification, comme le PC). carnet.php v5 inchangé ; photos d'avion pas
encore synchronisées.

**Point vérifié avant de coder : NPF-Q400 sur le même iPad (même origine grisonb.github.io)**
- Le Carnet n'efface que ses propres caches (nom commençant par « carnet-de-vol- », sw.js) et ne répond qu'aux
  adresses sous /Carnet-de-vol-TEST/ ; sa base IndexedDB s'appelle « carnet-de-vol » ; il n'utilise pas localStorage.
- NPF-Q400, NPF-Q400-TEST et NPF-Q400-RUN (lus sans rien modifier) n'effacent que leurs caches (préfixes npf-…) et
  leurs bases de cartes (OfflineTilesDB…, OfflineMap_…, npf-q400-run-…) : jamais ce qui est au Carnet, et l'inverse.
- Place prise par le Carnet : ≈ 2 Mo d'app + quelques Mo de données (sans photos), à côté des ≈ 1,5 Go de cartes NPF.

**Ce qui change**
- Plus › Synchro du carnet sur l'iPad : « Cet iPad : recevoir le carnet et le modifier aussi » ; ensuite comme le PC
  (deux sens, conflits « Garder la version de l'iPad / du téléphone / les deux », doublons, « Annuler la dernière
  synchro »). Vols NPF-Q400 et copies NAS : téléphone seulement.
- Mise en page iPad (paysage et portrait) : colonne centrée comme sur le PC, onglets et « Annuler » de la saisie
  agrandis au doigt sur tablette, haut des écrans dégagé de la barre d'état (app sur l'écran d'accueil), nom
  « Carnet vol » sous l'icône. Téléphone et PC inchangés.
- Carnet de l'appareil effacé (Safari peut effacer les données d'un site) : rien de vide n'est envoyé ; si l'état de
  la synchro est resté, l'écran des suppressions ne propose plus « Confirmer » mais « Les remettre » (récupère tout
  depuis le NAS).

**Tests**
- `tests/unitaires/v025.test.js` (trois appareils simulés), `tests/navigateur/v025.mjs` (téléphone et PC Chromium,
  iPad WebKit 1080 × 810 puis 810 × 1080, faux NAS v5 local, captures) ; tous les tests existants ; contrôle FlyLog local.

## v0.24 — 08/11/2026

R50, étape 4 : synchro du carnet dans les DEUX sens (téléphone ↔ PC), par le NAS (carnet.php version 5, inchangé).

**Ce qui change**
- Le téléphone et le PC peuvent tous les deux ajouter, modifier et supprimer vols, avions, personnes, terrains,
  étiquettes et missions ; les deux restent à jour (ouverture, quelques secondes après un enregistrement, retour du
  réseau, toutes les 2 minutes, « Synchroniser maintenant »). Seul ce qui a changé voyage.
- PC en consultation : Plus › Synchro du carnet › « Passer en modification » (expliqué ; le carnet n'est pas renvoyé :
  le PC reprend la dernière version de chaque élément au NAS). Un nouveau PC peut aussi directement « recevoir le carnet
  et le modifier aussi ».
- Conflits : un élément changé des deux côtés (ou supprimé d'un côté, modifié de l'autre) n'est jamais écrasé ni
  effacé ; bandeau orange « N éléments modifiés sur les deux appareils › Choisir », écran côte à côte : « Garder la
  version du PC », « Garder la version du téléphone », « Garder les deux » (vols). Un vol ouvert dans la saisie n'est
  jamais changé sous les yeux du pilote. Étiquettes, missions et terrains perso ajoutés des deux côtés : réunis sans
  rien demander.
- Doublons possibles (même vol saisi deux fois, ou même vol NPF), parmi les vols créés depuis la synchro dans les deux
  sens : bandeau « Doublon possible › Voir » (supprimer l'un, ou garder les deux).
- Vols NPF-Q400 : importés sur le téléphone seulement (le PC ne les propose pas) : un vol NPF ne peut pas être enregistré
  une 2e fois sur l'autre appareil.
- Plus de 20 suppressions d'un coup : rien ne part avant confirmation (bandeau « N suppressions à envoyer › Confirmer » ;
  « Les remettre » les reprend au NAS).
- « Annuler la dernière synchro » (Plus › Synchro du carnet) : ce que la synchro a remplacé est gardé 30 jours.
- Hors ligne / NAS éteint : rien n'est perdu ; « N en attente d'envoi (pas de réseau) » dans Plus et en haut du Carnet.
- Copies automatiques du carnet sur le NAS : du téléphone seulement. Photos d'avion : pas encore synchronisées (v0.25).
- Mot de passe refusé : aucun appel automatique (synchro comprise).

**Tests**
- `tests/unitaires/v024.test.js` (deux appareils simulés, faux NAS en mémoire), `tests/navigateur/v024.mjs` (téléphone
  390 px + PC 1280 px, faux NAS v5 local, captures) ; v0.23 adaptée (le téléphone envoie et reçoit) ; tous les tests
  existants ; contrôle FlyLog local.

## v0.23 — 08/11/2026

R50, étape 3 : synchro du carnet du téléphone vers le PC, par le NAS (carnet.php version 5). Sens unique : le PC
consulte, il ne modifie rien.

**Ce qui change**
- Plus › Synchro du carnet : « Ce téléphone envoie le carnet » (appareil de référence) ou « Cet appareil consulte le
  carnet du téléphone ».
- Téléphone : premier envoi de tout le carnet (par paquets de 500), puis, quelques secondes après chaque
  modification, seulement ce qui a changé (vols, avions, personnes, réglages du carnet ; suppressions comprises). Pas de
  réseau ou NAS éteint : envoi en attente, puis tout seul (ouverture, retour du réseau, retour dans l'app). Les photos
  d'avion restent sur le téléphone (leur crédit voyage). Mot de passe, adresse du NAS et réglages propres au téléphone
  ne voyagent jamais. Réactivation : seul ce qui diffère du NAS est renvoyé.
- PC (consultation) : son carnet est remplacé par celui du téléphone (avertissement avant), puis mis à jour à
  l'ouverture, au retour dans l'app et toutes les 2 min ; bandeau « Consultation · à jour il y a … » en haut du Carnet.
  Rien ne se modifie : pas de « + Nouveau vol », vol ouvert en consultation (sans Enregistrer ni Supprimer, cases
  inactives), entrées de Plus qui modifient cachées, toute écriture refusée avec un message. Le PC n'envoie jamais de
  copie au NAS et ne s'occupe pas des vols NPF.
- Un appareil au carnet vide n'envoie plus jamais de copie sur le NAS (nouvel appareil).
- Guide NAS : nom de la tâche « Carnet NAS mot de passe origine » (DSM refuse l'apostrophe).

**Tests**
- `tests/unitaires/v023.test.js` (faux NAS en mémoire), `tests/navigateur/v023.mjs` (deux appareils : téléphone 390 px
  et PC 1280 px, faux NAS v5 local, 1 200 vols inventés, captures) ; tous les tests existants ; contrôle FlyLog local.

## v0.22 — 08/11/2026

Une remarque : R51, mot de passe du NAS personnalisé (après l'étude R50 + R51 du 08/11). Va avec carnet.php version 5
(préparé à part, installé par le pilote avec la tâche DSM « Carnet NAS installer »).

**Ce qui change**
- Plus › Copie sur le NAS › « Changer le mot de passe › » : nouveau mot de passe tapé deux fois (12 caractères au
  moins, lettres sans accent, chiffres et signes, sans espace, car il voyage dans un en-tête HTTP), « Afficher »,
  « Changer le mot de passe » (vert) / « Annuler » (rouge). Le NAS ne garde que l'empreinte ; l'app garde le nouveau.
- L'iPad (NPF-Q400) n'a rien à changer : l'ancien mot de passe reste sa clé, pour déposer des vols seulement.
  « Tester » avec l'ancien mot de passe le dit.
- Réponse perdue en route (ou demande renvoyée par le navigateur) : l'app vérifie avec le nouveau mot de passe et le
  garde si le changement a été fait.
- Mot de passe refusé : plus aucun appel automatique au NAS (copie, vols NPF) tant qu'il n'est pas corrigé, pour ne
  pas déclencher le blocage des essais (qui bloquerait aussi l'iPad sur le même réseau).
- « Trop d'essais » (NAS v5) : « réessaie dans 14 min » ; NAS encore en version 4 : message « installe d'abord la
  mise à jour ».

**carnet.php version 5** (dossier privé) : empreinte du mot de passe dans `acces/cle-carnet.json` (sinon celui
d'origine), clé NPF séparée, 5 échecs / 15 min par adresse et 30 / h au total, synchro du carnet (pour les prochaines
versions) et photos ; tâche DSM « mot de passe d'origine » en cas d'oubli.

**Tests**
- `tests/unitaires/v022.test.js`, `tests/navigateur/v022.mjs` (faux NAS v5 local, 390 px, captures) ; tous les tests
  existants ; contrôle FlyLog local. carnet.php v5 : tests PHP locaux, contrôle PHP 7.3, installation simulée.

## v0.21 — 08/11/2026

Une remarque : R34, photos d'avions trouvées sur Internet (après l'étude du 08/11 : Commons + lien Planespotters).

**Ce qui change**
- Fiche avion (en modification) : lien « Chercher une photo › » sous la photo (pas pour un simulateur).
- Wikimedia Commons : vignettes des photos libres de l'immatriculation (catégorie « immat (aircraft) », puis titres qui
  la contiennent ; 24 au plus), auteur et licence sous chaque vignette, « À vérifier » si le titre ne cite pas le type.
  Le pilote touche une photo, la voit en grand avec son crédit, puis « Utiliser cette photo » : la version 1280 px est
  téléchargée et réduite comme une photo du téléphone (≈ 100 Ko). Elle n'est gardée qu'à « Enregistrer ».
- Crédit sous la photo de la fiche : « Photo : auteur · licence · Wikimedia Commons » (liens vers la page de la photo et
  la licence). Une photo prise au téléphone n'a pas de crédit.
- Planespotters.net : sa photo est affichée dans la même fenêtre avec le nom du photographe ; elle et le nom mènent à
  sa page. Jamais gardée (ses règles l'interdisent).
- Sauvegarde manuelle : photo + crédit. Copie NAS : toujours sans photo (et sans crédit) ; à la restauration, la photo
  du téléphone et son crédit sont remis ensemble.
- Sans réseau : message ; aucune clé, aucun serveur intermédiaire (ni NAS ni VPS).

**Tests**
- `tests/unitaires/v021.test.js`, `tests/navigateur/v021.mjs` (faux Commons et faux Planespotters locaux, 390 px,
  captures) ; tous les tests existants ; contrôle FlyLog local. Essai réel hors batterie sur une immatriculation publique.

## v0.20 — 08/11/2026

Une remarque : R58, détachement à La Réunion (base FMEP).

**Ce qui change**
- Nouveau vol : si le départ est FMEP, l'arrivée par défaut est FMEP (sinon LFTW, comme avant). Le départ reste
  l'arrivée du dernier vol.
- Pendant la saisie, l'arrivée suit le départ (FMEP -> FMEP, autre -> LFTW) tant que le pilote n'a pas touché lui-même
  à l'arrivée. Un vol déjà enregistré ou un brouillon NPF-Q400 n'est jamais concerné.
- Règle dans `js/modele.js` (`arriveeParDefaut`, `BASE`).

**Contrôles (rien à changer)**
- Terrains de La Réunion : FMEP (Saint-Pierre Pierrefonds) et FMEE (Roland Garros) étaient déjà dans la table
  (coordonnées publiques, fuseau Indian/Reunion = UTC+4) ; ce sont les deux seuls terrains OACI de l'île.
- Nuit EASA à FMEP : fin du crépuscule civil identique à la minute au calcul de la NOAA (20/11/2026 : 15h05 UTC).
- Vol NPF-Q400 format 2 FMEP -> FMEE -> FMEP : terrains et atterrissages jour / nuit lus correctement.
- Bouton « LF » : pour un terrain FM.., un retour arrière libère la case (deux si la case contient un code LF), puis on
  tape les 4 lettres.

**Tests**
- `tests/unitaires/v020.test.js`, `tests/navigateur/v020.mjs` (390 px, captures) ; tous les tests existants ; contrôle
  FlyLog local.

## v0.19 — 08/11/2026

Une remarque : R56, couleurs.

**Ce qui change**
- Fond VERT : le bandeau « N vol(s) à importer depuis NPF-Q400 », « Enregistrer le vol » (et ses variantes
  « Enregistrer les modifications » / « la mise à jour »), « Continuer la saisie » (fenêtre « Abandonner la saisie ? »).
- Fond ROUGE : tous les boutons « Annuler » (12) : saisie d'un vol, terrain intermédiaire, ajouter un terrain, ajouter
  une personne, ajouter une étiquette, ajouter un avion, ignorer un vol NPF, restaurer depuis le NAS, restaurer une
  sauvegarde, import FlyLog, importer des fiches avions, et le « Annuler » du message « Vol supprimé ».
- Texte blanc, mêmes couleurs en clair et en sombre : contraste 5,1:1 (vert #2e7d32) et 5,6:1 (rouge #c62828), au-dessus
  du seuil de 4,5:1. Place, taille, texte et action des boutons inchangés (police inchangée).

**Tests**
- `tests/navigateur/v019.mjs` (390 px, clair / sombre : couleur, contraste, même place et même taille de chaque bouton,
  captures) ; tous les tests existants ; contrôle FlyLog local.

## v0.18 — 07/11/2026

Une remarque : R55, la liste des vols NPF-Q400 se fermait au lieu d'ouvrir le brouillon (premier vrai vol au format 2
reçu le 07/11 avec la v0.17 et le NAS v4).

**Cause**
- La flèche retour Android (v0.9) : quand l'app retire elle-même une entrée d'historique (`history.go`, par exemple au
  démarrage pour effacer celles d'une session précédente, ou après la fermeture d'une fenêtre), elle n'attendait la fin
  de ce recul que 800 ms. Sur le téléphone (démarrage, appareil chargé), il arrive plus tard : l'app le prenait alors
  pour un appui sur retour et fermait la fenêtre du dessus, la liste des vols NPF. Le toucher n'y était pour rien
  (pas de toucher qui traverse, pas de double déclenchement, la liste n'est pas redessinée par la vérification du NAS).

**Ce qui change**
- Chaque entrée d'historique porte son niveau ; un recul de l'app est reconnu au niveau où il arrive, même en retard :
  il ne ferme plus rien. Un vrai retour de l'utilisateur ferme toujours la fenêtre du dessus.
- Un toucher sur un vol ne peut ouvrir qu'un brouillon (protection contre un double déclenchement).
- La liste se ferme par sa croix ou la flèche retour ; elle couvre tout l'écran (aucun toucher ne la ferme).
- Cases terrain (R47, v0.16) : la sélection automatique au toucher n'efface plus des lettres déjà tapées (cas d'une
  fenêtre d'escale qui se donne le focus pendant qu'on tape).

**Tests**
- `tests/navigateur/v018.mjs` : touchers simulés, history.go() rendu lent (1,5 s) comme sur le téléphone ; bandeau puis vol
  du premier coup 10 fois de suite (dont après rechargement avec un historique ancien) ; vérification du NAS pendant le
  toucher ; toucher hors des vols ; croix ; flèche retour. Le même test échoue sur la v0.17. Tous les tests existants.

## v0.17 — 07/11/2026

Vols NPF-Q400 (format « vol NPF » version 2) : nouveau champ facultatif `arriveePosition: { lat, lon }`, envoyé quand
l'arrivée part sans code OACI (position GPS notée au dernier « Bloc arrivée »).

**Ce qui change**
- Arrivée sans code : la case Arrivée reste vide, à compléter ; le dernier atterrissage est classé jour / nuit à cette
  position (et le temps de nuit la prend comme point d'arrivée). Dès qu'un code connu est tapé, le calcul reprend les
  coordonnées du terrain ; code inconnu de la table : la position sert encore. Sans code ni position : comme avant.
- Brouillon NPF dont un terrain manque : les heures restent affichées en UTC (le fuseau local serait inconnu).
- Carte du vol : le point d'arrivée (et un pélicandrome sans code) s'affiche à sa position, même sans trace ADS-B et
  sans réseau ; la position est gardée avec le vol si le code tapé n'est pas un terrain connu.
- NAS : carnet.php v4 révisé : `arriveePosition` vérifiée (lat -90..90, lon -180..180, nombres), refusée si mal formée
  (la première v4 l'acceptait sans la vérifier). À redéposer : carnet.php, SHA256SUMS, tache_dsm_installer.sh.
- R52 : dans « Tous mes avions » et la recherche d'avion de la saisie, les avions d'un même type OACI sont classés par
  ordre alphabétique d'immatriculation (quel que soit le modèle : « … MR » ou « … MRE ») ; l'ordre des types ne change
  pas (Tous mes avions : types par ordre alphabétique, simulateurs à la fin ; recherche : type du dernier vol d'abord).

**Tests**
- `tests/unitaires/v017.test.js` ; `tests/navigateur/v017.mjs` (arrivée avec code, sans code avec position, sans code
  ni position, minuit UTC, carte hors ligne) ; `tests/navigateur/v017b.mjs` (R52, avions inventés) ; test PHP local (127 vérifications) ; tous les tests existants ; FlyLog.

## v0.16 — 07/11/2026

Vols NPF-Q400 au format « vol NPF » version 2 (le premier vrai envoi NPF-Q400 TEST v17.91 → NAS v3 → Carnet v0.15 a
marché le 07/11). Le format version 1 reste lu comme avant.

**Ce qui change**
- Avion retrouvé par son NOM dans la flotte (« M73 » = « m73 », espaces ignorés) ; si l'immatriculation est aussi
  envoyée, elle prime. Aucun ou plusieurs avions de ce nom : la recherche d'avion s'ouvre sur le nom, je choisis (ou
  « + Ajouter un avion »). La liste des vols en attente montre le nom et l'immatriculation trouvée.
- Escales : chaque passage devient un terrain intermédiaire, DANS L'ORDRE, avec Att. Jour / Att. Nuit calculés
  atterrissage par atterrissage (règle de nuit EASA, à la position du terrain, ou à la position envoyée si le code est
  inconnu). Pélicandrome sans code OACI : son nom s'affiche (pastille en pointillés), je complète le code en touchant
  l'escale ; rien ne bloque. Le dernier atterrissage est classé comme avant ; les totaux sont les sommes.
- Copilote : retrouvé par son trigramme dans mes personnes et placé comme Copi ; trigramme inconnu : « + Ajouter ZZZ à
  mes personnes » (fiche pré-remplie) ; aucune personne n'est créée sans mon accord.
- « Ce qui change » (même vol ré-exporté) compte aussi l'avion, les escales et le copilote.
- NAS : carnet.php version 4 (dépôt des formats 1 et 2, vérifications du format 2), préparé dans le dossier privé, à
  installer par la même tâche DSM (guide « Mise à jour v4 »).
- R46 : terrains par défaut d'un NOUVEAU vol : départ = arrivée du dernier vol enregistré, arrivée = LFTW (la base) ;
  premier vol ou dernier vol arrivé à LFTW : LFTW → LFTW. Toujours modifiable ; rien ne change pour un vol NPF-Q400
  importé (ses terrains priment) ni pour un vol existant.
- R47 : toucher une case terrain (départ, arrivée, terrain intermédiaire) sélectionne le code : on tape directement.
- R48 : bouton « LF » entre la date et « LOC » (même style). Activé : les cases terrain gardent « LF » et on ne tape que
  les 2 dernières lettres (passage automatique à la case suivante). Terrain hors LF : effacer le « LF » (retour
  arrière) libère la case, ou désactiver le bouton. Réglage mémorisé (`prefixeLF`).
- R49 : Plus › « Importer des fiches avions » : petit fichier texte « immatriculation, nom, indicatif radio, modèle » ;
  aperçu de ce qui change, puis « Appliquer » ; ne remplit que Nom, Indicatif radio et Modèle des avions trouvés par
  immatriculation (type OACI inchangé), ne crée aucun avion, ne touche à aucun vol ; avion introuvable signalé, ignoré.
  Le fichier du pilote reste privé (jamais dans le dépôt).

**Tests**
- `tests/unitaires/v016.test.js` (avion par nom, deux avions du même nom, escales LFHO ×2 → LFLU → LFHO, nuit,
  pélicandrome sans code, minuit UTC, copilote, ce qui change, format 1) ; `tests/navigateur/v016.mjs` (faux NAS,
  390 px, captures) ; `tests/navigateur/v016b.mjs` (terrains par défaut, sélection au toucher, bouton LF, vol NPF,
  import des fiches avions) ; test PHP local (118 vérifications) ; tous les tests existants ; contrôle FlyLog local.

## v0.15 — 06/11/2026

Une remarque : R33, recevoir les vols exportés depuis NPF-Q400 TEST (iPad), en passant par le NAS.

**Ce qui change**
- NPF-Q400 TEST dépose un vol sur le NAS (format commun « carnet-vol-npf » version 1) ; à l'ouverture de l'app, au
  retour du réseau et au retour dans l'app, si la copie NAS est configurée, le Carnet demande discrètement les vols en
  attente (sans aucun message d'erreur). S'il y en a : bandeau « N vols à importer depuis NPF-Q400 › » en haut du Carnet.
- Liste des vols en attente (date, avion, départ → arrivée, bloc, feux). Un vol s'ouvre en BROUILLON dans la saisie :
  date et heures bloc (envoyées en UTC, affichées selon le mode du dernier vol), avion trouvé par son immatriculation
  (sinon la recherche s'ouvre sur l'immatriculation avec « + Ajouter un avion »), départ / arrivée / escales, une ligne
  « FEU n°NN COMMUNE » par feu (numéros suivants) et le compteur Feux. Rien n'entre dans le carnet sans « Enregistrer ».
- Après Enregistrer, le vol est retiré du NAS (sans réseau : retiré discrètement à la vérification suivante, jamais
  reproposé). « Ignorer ce vol » (avec confirmation) le retire sans l'enregistrer.
- Un vol déjà enregistré (même id NPF) puis ré-exporté : « Ce qui change » puis « Mettre à jour ce vol » (pas de second vol).
- Positions des feux gardées avec le vol (`feuxPositions`) : flamme rouge + commune sur la Carte du vol, même sans
  trace ADS-B et sans réseau. Elles ne modifient jamais les heures. Rien ne change pour un vol saisi à la main.
- NAS : carnet.php version 3 (vol-depot, vols-liste, vol-retirer ; 200 vols au plus, 90 jours), préparé dans le dossier
  privé, à installer par la même tâche DSM (guide « Mise à jour v3 »). Avec l'ancien carnet.php, rien ne s'affiche.

**Tests**
- `tests/unitaires/v015.test.js` (format, avion par immatriculation, minuit UTC, 0 / 1 / 3 feux, mise à jour) ;
  `tests/navigateur/v015.mjs` (faux NAS : bandeau, liste, brouillon, Enregistrer, Ignorer, mise à jour, retrait différé,
  carte des feux hors ligne) ; test PHP local (dossier privé) ; tous les tests existants ; contrôle FlyLog local.

## v0.14 — 06/11/2026

Quatre remarques : R35 (copie NAS sans photos), R36 et R37 (PDF EASA), R39 (clavier de la recherche).

**Ce qui change**
- R35 : la copie automatique sur le NAS (et « Copier maintenant ») ne contient plus les photos d'avion, seulement les
  données. La sauvegarde de secours manuelle garde les photos. Restaurer depuis le NAS garde les photos du téléphone
  (même avion : même identifiant, sinon même immatriculation) ; la confirmation le dit. Le NAS ne change pas.
- R36 : PDF, chaque case est centrée horizontalement et verticalement (titres, sous-titres, saisies, totaux). Remarques :
  centrées si elles tiennent sur une ligne, sinon 2 lignes alignées à gauche (plus lisible pour un texte long).
- R37 : PDF, polices plus grandes sans changer la mise en page (mêmes colonnes, 18 lignes par page) : titres 5,4 → 5,6 pt
  (limite : « APPR. », 7 mm), sous-titres 5,4 → 7 pt (limite : « PILOTE », 10 mm), saisies 6,4 → 8 pt (limites : codes
  OACI larges, date, heures « 10:00 »), remarques 5,6 → 6,6 pt. Un texte trop large pour sa case (modèle, nom long,
  remarque longue) est écrit plus petit, jusqu'à l'ancienne taille, avant d'être coupé par « ... » : rien de ce qui tenait
  avant n'est coupé.
- PDF : la colonne « Modèle » affiche le code type OACI de l'avion (DH8D, DR40, CL2T…) au lieu du nom complet ; un
  avion sans type OACI garde son modèle. L'écran de l'app, le CSV et les fiches avion ne changent pas.
- R39 : recherche du Carnet, la touche loupe / Entrée du clavier ferme le clavier ; le texte et les résultats restent.

**Tests**
- Nouveaux tests unitaires `tests/unitaires/v014.test.js` (copie sans photo, photos gardées, PDF : pages, lignes, aucun
  texte hors de sa case, centrage) avec `tests/outils/pdf-noeud.js` (enregistreur des cases et textes du PDF) et
  `tests/outils/vols-pdf.js` (vols inventés difficiles) ; nouveau test `tests/navigateur/v014.mjs` ; tous les tests
  existants ; contrôle local avec le vrai fichier FlyLog (non commité).

## v0.13 — 06/11/2026

Retrouver un vol et consulter les vols voisins.

**Ce qui change**
- La liste du Carnet garde sa place quand on ouvre un vol puis qu'on revient (Annuler, Enregistrer, flèche retour
  Android, autre onglet). Avant, on revenait toujours en haut, sur le dernier vol.
- Recherche (date, terrain, immatriculation, mission…) : chaque vol trouvé a « Voir dans le carnet › ». La recherche se
  ferme et la liste complète s'ouvre sur ce vol (surligné un instant), avec les vols des jours voisins au-dessus et en
  dessous. En remontant, les vols plus récents se chargent au-dessus sans faire sauter l'écran.
- « ↑ Dernier vol » (en bas à gauche, quand on est loin du haut) ramène en un geste au dernier vol ; toucher l'onglet
  Carnet quand on y est déjà fait la même chose. Un nouveau vol enregistré ramène aussi en haut.

**Tests**
- Nouveau test `tests/navigateur/v013.mjs` (600 vols inventés) ; tous les tests existants, dont la fluidité ;
  contrôle local avec le vrai fichier FlyLog (non commité).

## v0.12 — 06/11/2026

Correction : « Copier maintenant » affichait « NAS injoignable » alors que « Tester » répondait OK.

**Cause**
- Le PHP du site web du NAS n'a pas l'extension zlib : le script du NAS plantait au moment de décompresser la copie.
- Le serveur web du Synology remplace toute réponse d'erreur par sa propre page, sans les en-têtes qui permettent à
  l'app de la lire : l'app ne voyait qu'un échec réseau (« NAS injoignable »), quelle que soit l'erreur.

**Ce qui change**
- L'app demande au NAS le « protocole 2 » (`&v=2`) : les erreurs lui reviennent sous une forme lisible (code 200 et
  `{"erreur", "code"}`), elle affiche donc le vrai motif (mot de passe refusé, erreur sur le NAS, copie trop grosse…).
  Les vrais codes HTTP restent compris (ancien script du NAS, faux NAS des tests).
- L'app annonce le nombre de vols de la copie (`&vols=N`) : le NAS sans zlib range la copie sans la décompresser,
  vérifiée par son empreinte SHA-256.
- Restaurer depuis le NAS : une version disparue affiche « Cette copie n'est plus sur le NAS. ».
- Le script du NAS (dossier privé, hors dépôt) est à mettre à jour par la même tâche DSM (guide).

**Tests**
- Nouveau test `tests/navigateur/v012.mjs` : faux NAS qui imite le serveur web du Synology (pages d'erreur sans CORS),
  PHP sans zlib, mot de passe refusé, erreur 500, version disparue, ancien script ; tous les tests existants.

## v0.11 — 06/11/2026

Une remarque : R32, carte de vol plus lisible dans la liste du Carnet (maquette v25, décrite dans le prompt).

**Ce qui change**
- Ligne sous le trajet : la date en gras, foncée, plus grande (police du trajet) ; le nom de l'avion en gras couleur
  du bloc Avion, puis l'immatriculation en gras foncé (sans nom : l'immatriculation prend la place du nom) ; le modèle
  en petit gris à la fin, coupé par « … ». Plus de tirets entre les éléments.
- La ligne des heures (LOC / UTC) reste en petit gris.
- La mission : en gras, 16 px, couleur du bloc Mission (orange foncé), petit trait vertical orange à gauche.
- Lisible en mode sombre ; rien ne dépasse à 390 px.

**Tests**
- 87 tests unitaires (3 nouveaux) ; nouveau test `tests/navigateur/v011.mjs` (avec nom, sans nom, sans mission,
  mission longue, clair / sombre) ; tous les tests existants (dont la fluidité) ; contrôle local avec le vrai
  fichier FlyLog (non commité).

## v0.10 — 06/11/2026

Deux remarques : R30 (types d'avion) et R31 (copie automatique sur le NAS).

**Ce qui change**
- R30 : Plus › Types d'avion ne montre que les types de mes avions (donc de mes vols), ceux ajoutés ou modifiés à la
  main, et une ligne SIM s'il y a des simulateurs. Les 4 types « exemples » de la table de la v0.1 (A320, AT72, C150,
  DA42) sont retirés ; les vols et les types réglés à la main ne changent pas.
- R31 : copie automatique du carnet sur le NAS. Quelques secondes après la dernière modification (modifications
  rapprochées regroupées), la sauvegarde de secours complète, compressée (gzip) et avec son empreinte SHA-256, part en
  arrière-plan. Pas de réseau, NAS éteint ou erreur : elle attend et repart toute seule (ouverture de l'app, retour du
  réseau, essais espacés jusqu'à 30 min) ; une seule copie en attente (toujours la dernière version). Aucune fenêtre
  ni message d'erreur : l'état se lit dans Plus.
- Plus › Sauvegarde : « Copie sur le NAS » (adresse et mot de passe tapés sur le téléphone, Tester, Copie automatique,
  Copier maintenant) et « Restaurer depuis le NAS » (versions gardées, confirmation, puis restauration comme un
  fichier). L'encart du haut passe au vert « Copié sur le NAS il y a … » quand la copie marche.
- L'adresse du NAS, son mot de passe et l'état de la copie restent sur le téléphone : ni dans le code, ni dans le CSV,
  ni dans la sauvegarde de secours ; conservés lors d'une restauration (`REGLAGES_PRIVES`).
- Côté NAS (dossier privé, installé à la main par une tâche DSM) : petit script PHP, copies rangées hors du dossier web.

**Tests**
- 84 tests unitaires (10 nouveaux : types, regroupement, file d'attente, essais espacés, mot de passe refusé, textes,
  compression, mots de passe absents de la copie et du CSV) ; nouveau test `tests/navigateur/v010.mjs` avec un FAUX
  NAS local (toute adresse non locale bloquée) ; tous les tests existants réussis ; contrôle local avec le vrai
  fichier FlyLog (41 types, taille d'une copie ; non commité).

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
