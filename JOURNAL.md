# Journal des versions

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
