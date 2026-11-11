# Guide : mettre mes feux dans Google Earth

Le Carnet ne se connecte jamais à ton compte Google. Il fabrique un petit fichier (format KML) avec la position de
tes feux. C'est toi qui l'ajoutes à ton projet Google Earth « Feux ». Google ne propose aucun moyen pour une app
d'écrire directement dans un projet Google Earth (vérifié dans sa documentation, novembre 2026).

## 1. Fabriquer le fichier dans le Carnet

1. Ouvre le vol, puis sa **Carte du vol** en plein écran.
2. Deux possibilités :
   - un seul feu : touche la flamme, puis **Envoyer vers Google Earth** ;
   - tous les feux du vol : bouton **Envoyer les feux de ce vol vers Google Earth**.
3. Le fichier s'appelle par exemple `Feu-12-2026-VILLE-SUR-ESSAI.kml` (un feu) ou `Feux-14-08-2026.kml` (tout le
   vol). Chaque point est nommé comme tes points existants : « Feu n°12 / 2026 / VILLE SUR ESSAI » (sans commune
   connue : « Feu n°12 / 2026 »), avec une icône de flamme et un libellé orange.

## 2. Le mettre sur ton Drive

- **iPad / iPhone** : le menu **Partager** s'ouvre ; choisis **Drive** (ou « Enregistrer dans Fichiers › Drive »).
- **Téléphone Android** : Chrome n'accepte pas de partager ce type de fichier ; il est alors **téléchargé**
  (dossier Téléchargements, un message le dit). Ouvre l'app **Drive** › **+** › **Importer** › choisis le fichier.
- **PC** : le fichier est téléchargé normalement.

## 3. L'ajouter au projet « Feux » (Google Earth sur ordinateur, dans le navigateur)

C'est le chemin décrit par l'aide de Google (« Importer des données dans Google Earth ») :

1. Ouvre **Google Earth** (earth.google.com) en étant connecté à ton compte.
2. Sur l'écran d'accueil, ouvre ton projet **Feux**.
3. En haut à gauche : **Fichier › Importer un fichier dans « Feux »**.
4. Choisis **Importer depuis Drive** (le fichier que tu viens d'y mettre) ou **Importer depuis l'appareil**.
5. Si Google Earth te demande comment importer : **Importer en tant qu'éléments du projet**.

Les points arrivent dans le projet, modifiables comme les autres. Pour seulement en copier certains : sélectionne
le point, **⋮ › Copier l'élément**, puis dans le projet **⋮ › Coller l'élément**.

Remarques :
- Le menu s'appelle « Fichier › Importer un fichier… » (et non « Nouvel élément ») dans la documentation actuelle de
  Google ; les libellés exacts peuvent changer un peu selon la version.
- La documentation décrit cet import sur **ordinateur**. Sur téléphone, l'app Google Earth ne le décrit pas.
- Si tu importes deux fois le même fichier, les points sont en double dans le projet : supprime l'un des deux.
