# Politique de confidentialité

**Ruée Nocturne ne collecte aucune donnée personnelle.** Aucune information ne quitte ton appareil.

## Ce que le jeu enregistre, et où

- Ta progression (record, or, boutique, succès, personnage choisi, meilleurs temps du défi du jour) et tes réglages (son, vibrations, taille du HUD, gaucher, langue) sont enregistrés **uniquement sur ton appareil**, dans le stockage du navigateur (IndexedDB, avec un repli localStorage).
- Tu peux voir exactement ce qui est enregistré avec **Réglages → Exporter la sauvegarde** : c'est un fichier JSON lisible. **Tout effacer** supprime ces données ; désinstaller l'app ou vider les données du site aussi.
- Le jeu ne lit rien d'autre sur ton appareil : ni contacts, ni position, ni photos, ni presse-papiers.

## Ce que le jeu n'envoie pas

- Pas de compte, pas de connexion, pas de classement en ligne (le défi du jour est classé localement).
- Pas de mesure d'audience, pas de traceur, pas de cookie, pas de publicité, pas de SDK tiers.
- Aucun appel réseau pendant une partie. Les seules requêtes sont le téléchargement des fichiers du jeu et de ses mises à jour (le service worker vérifie s'il existe une nouvelle version quand tu ouvres l'app).

## Hébergement

Le site est servi par Firebase Hosting (Google). Comme tout serveur web, il peut tenir des journaux techniques des requêtes (adresse IP, date, fichier demandé) pour son fonctionnement et sa sécurité ; nous n'y ajoutons rien et nous ne les exploitons pas. Voir la [politique de confidentialité de Firebase](https://firebase.google.com/support/privacy).

## Enfants

Le jeu ne demande ni ne traite aucune donnée : il convient à tous les âges sous cet angle. Le contenu est un jeu d'action stylisé (silhouettes low-poly, pas de sang).

## Contact

Questions : ouvre un ticket sur le dépôt GitHub du projet (lien dans la page « À propos » du jeu).

_Dernière mise à jour : novembre 2026._
