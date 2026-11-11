# Guide : mettre mes feux dans Google Earth

Le Carnet ne se connecte jamais à ton compte Google. Il fabrique un petit fichier (format KML) avec la position de
tes feux. C'est toi qui l'ajoutes à ton projet Google Earth « Feux ». Google ne propose aucun moyen pour une app
d'écrire directement dans un projet Google Earth (vérifié dans sa documentation, novembre 2026).

## 1. Fabriquer le fichier dans le Carnet

1. Ouvre le vol, puis sa **Carte du vol** en plein écran.
2. Deux possibilités :
   - tous les feux du vol : bouton **Google Earth** (icône « partager »), tout en bas de la carte ;
   - un seul feu : touche la flamme, puis **Google Earth** dans la bulle.
3. Le fichier s'appelle par exemple `Feu-12-2026-VILLE-SUR-ESSAI.kml` (un feu) ou `Feux-14-08-2026.kml` (tout le
   vol). Chaque point est nommé comme tes points existants : « Feu n°12 / 2026 / VILLE SUR ESSAI » (sans commune
   connue : « Feu n°12 / 2026 »).
4. Style des points, comme tes feux dans Google Earth : l'épingle avec une flamme de la bibliothèque de Google Earth,
   bleue, taille « Petite » ; libellé jaune, taille « Moyenne ».

## 2. L'envoyer (mail, Gmail, Drive…)

- **iPad / iPhone** : la fenêtre de partage s'ouvre tout de suite : choisis **Mail**, **Gmail** ou **Drive**.
- **Téléphone Android** : Chrome n'accepte pas de partager un fichier .kml (il ne partage que des photos, vidéos, sons,
  PDF et textes). Le fichier est donc **téléchargé**, et un message le dit. Ensuite :
  1. ouvre l'app **Fichiers** (ou la notification du téléchargement) › **Téléchargements** ;
  2. appui long sur le fichier `Feux-….kml` › **Partager** ;
  3. choisis **Gmail** (ou Mail) et envoie-le-toi, ou **Drive** pour l'y enregistrer.
- **PC** : le fichier est téléchargé normalement (dossier Téléchargements).

Le nom et l'extension `.kml` ne changent pas : Google Earth sait l'importer tel quel.

## 3. L'ajouter au projet « Feux » (Google Earth sur ordinateur, dans le navigateur)

C'est le chemin décrit par l'aide de Google (« Importer des données dans Google Earth ») :

1. Sur l'ordinateur, enregistre le fichier reçu par mail (pièce jointe › Télécharger), ou laisse-le sur Drive.
2. Ouvre **Google Earth** (earth.google.com) en étant connecté à ton compte.
3. Sur l'écran d'accueil, ouvre ton projet **Feux**.
4. En haut à gauche : **Fichier › Importer un fichier dans « Feux »**.
5. Choisis **Importer depuis l'appareil** (fichier enregistré depuis le mail) ou **Importer depuis Drive**.
6. Si Google Earth te demande comment importer : **Importer en tant qu'éléments du projet**.

Les points arrivent dans le projet, modifiables comme les autres. Pour seulement en copier certains : sélectionne
le point, **⋮ › Copier l'élément**, puis dans le projet **⋮ › Coller l'élément**.

Remarques :
- Après l'import, vérifie un point : si l'icône, sa taille ou la couleur ne sont pas exactement les tiennes, Google Earth
  te les laisse changer (comme pour un point fait à la main) ; dis-le-moi pour que je corrige le fichier.
- Le menu s'appelle « Fichier › Importer un fichier… » dans la documentation actuelle de Google ; les libellés exacts
  peuvent changer un peu selon la version.
- La documentation décrit cet import sur **ordinateur**. Sur téléphone, l'app Google Earth ne le décrit pas.
- Si tu importes deux fois le même fichier, les points sont en double dans le projet : supprime l'un des deux.
