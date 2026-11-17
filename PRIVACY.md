# Politique de confidentialité

**Swarmageddon se joue sans compte, et dans ce cas, sauf si tu acceptes la mesure anonyme de fréquentation, aucune donnée ne quitte ton appareil.** Depuis la version 1.8.0, tu peux créer un compte facultatif pour retrouver ta progression sur un autre appareil. Depuis la version 1.33.0, un compte permet aussi de figurer au **classement en ligne**, sous un pseudo que tu choisis. Depuis la version 1.57.0, le jeu te demande une fois, après ta première partie, si tu acceptes une **mesure anonyme de fréquentation** ; sans ton accord, rien ne part.

## Sans compte : ce que le jeu enregistre, et où

- Ta progression (record, or, boutique, succès, personnages, tenues, emplacements, Bibliothèque, meilleurs temps du défi du jour) et tes réglages (son, vibrations, taille du HUD, gaucher, langue, rendu) sont enregistrés **uniquement sur ton appareil**, dans le stockage du navigateur (IndexedDB, avec un repli localStorage).
- Tu peux voir exactement ce qui est enregistré avec **Réglages → Exporter la sauvegarde** : c'est un fichier JSON lisible. **Tout effacer** supprime ces données ; désinstaller l'app ou vider les données du site aussi.
- Le jeu ne lit rien d'autre sur ton appareil : ni contacts, ni position, ni photos, ni presse-papiers.
- Aucune requête ne part vers un service de compte tant que tu n'ouvres pas le panneau Compte, ni vers la mesure de fréquentation tant que tu ne l'as pas acceptée (des tests automatisés le vérifient à chaque version).

## Avec un compte (facultatif)

Le panneau **Compte** du menu propose une connexion avec Google ou avec une adresse e-mail et un mot de passe. Ces comptes sont gérés par **Firebase Authentication** (Google) ; la progression est stockée dans **Cloud Firestore** (Google), dans la région `europe-west1`, dans un document propre à ton compte que toi seul peux lire et modifier (règles de sécurité publiées avec le jeu : `firestore.rules`).

Ce qui est enregistré avec un compte :

- l'identifiant du compte et l'adresse e-mail (et, pour Google, l'identifiant Google du compte) ; le mot de passe n'est jamais stocké en clair ni connu du jeu ;
- ta **progression** : record, or, boutique, succès, personnages achetés, tenues, emplacements, compteurs cumulés (vaincus, boss…), personnage choisi, meilleurs temps du défi du jour, pseudo du classement, et depuis la version 1.35.0 ta **Bibliothèque** (armes et objets débloqués, objets retirés du tirage, nombre de parties avec chaque arme, objet, tome et synergie), et depuis la version 1.36.0 tes **défis par personnage** (meilleurs résultats en une partie avec chaque personnage) ; et la date de la dernière synchronisation.

Ce qui n'est **jamais** enregistré en ligne : tes réglages (son, effets, vibrations, HUD, gaucher, langue, rendu), ton nom (seul le pseudo que tu choisis est publié), ta position, le contenu de tes parties.

## Classement en ligne (avec un compte, depuis la version 1.33.0)

- Tu choisis un **pseudo** dans le panneau Compte (le jeu propose le prénom de ton compte Google ; tu peux le changer). Tant que tu n'as pas de pseudo, rien n'est publié.
- À la fin de chaque partie, si tu es connecté, le jeu enregistre tes **meilleurs scores** dans le classement : le monde atteint et le temps de ta meilleure partie, ta plus longue survie, ton plus grand nombre d'ennemis vaincus, le personnage de la dernière partie qui a amélioré un score, et la date. Un document pour « tous les temps », un pour la semaine en cours.
- Ces lignes (pseudo, personnage, scores) sont **visibles par les autres joueurs connectés**, et par eux seuls : sans compte, le classement ne s'affiche pas et aucune requête ne part. Ton adresse e-mail et ton identifiant n'y apparaissent jamais.
- **Suppression** : supprimer ton compte efface aussi tes lignes du classement (tous les temps et semaine en cours) ; les classements des semaines passées ne sont plus affichés dans le jeu.

Fonctionnement : la progression est envoyée après chaque changement et relue au menu ; au premier login sur un appareil qui a déjà une progression différente de celle du compte, le jeu te demande laquelle garder. Hors ligne, tout reste sur l'appareil et repart au retour du réseau.

**Suppression** : « Supprimer mon compte et ses données » dans le panneau Compte efface immédiatement la sauvegarde en ligne et le compte. Ta progression reste sur l'appareil. Se déconnecter ne supprime rien en ligne.

Lors d'une connexion avec Google, le navigateur charge des scripts de Google (`apis.google.com`) le temps de la connexion ; ils sont soumis à la [politique de confidentialité de Google](https://policies.google.com/privacy).

## Mesure anonyme de fréquentation (sur accord, depuis la version 1.57.0)

Pour savoir si le jeu donne envie d'y revenir, il peut compter les jours où il est ouvert. **Seulement si tu l'acceptes** : la question (« Aider à améliorer le jeu ? ») s'affiche une fois, au menu, après ta première partie ; « Non merci », ou ne pas répondre, et rien ne part. Tu peux changer d'avis à tout moment dans **Réglages → Mesure anonyme de fréquentation**. Avec ou sans compte, cette mesure n'a aucun lien avec ton compte.

Si tu acceptes, le jeu écrit dans **Cloud Firestore** (Google, région `europe-west1`) **un seul document**, sans passer par le SDK Firebase ni par un service tiers :

- un **identifiant tiré au hasard** au moment de ton accord, qui ne vient ni de ton appareil ni de ton compte ;
- le **jour de ton accord** ;
- si tu avais fini **au plus une partie** à ce moment-là (nouveau joueur ou non) ;
- les **jours où tu as ouvert le jeu** pendant les 30 jours qui suivent (au plus une écriture par jour, plus rien après le 30e jour) ;
- une **date d'expiration** : 90 jours après ton accord, le document est effacé automatiquement.

Rien d'autre : ni version, ni appareil, ni langue, ni score, ni contenu de partie. Ces documents ne sont lisibles par personne depuis le jeu (règles de sécurité : `firestore.rules`) ; seul l'éditeur du jeu les lit, sous forme de totaux par semaine. Comme pour toute requête web, le serveur de Google voit l'adresse IP de la requête ; elle n'est pas enregistrée dans le document.

**Retrait** : passer l'interrupteur des Réglages sur « non » supprime le document et fait oublier l'identifiant à ton appareil. Un nouvel accord crée un nouvel identifiant. Le choix lui-même reste sur ton appareil (stockage du navigateur), hors de la sauvegarde exportée et de la synchronisation du compte.

## Ce que le jeu n'envoie pas

- Sans compte : pas de classement en ligne (le défi du jour est classé localement), pas de pseudo, pas de contenu partagé.
- Pas de mesure d'audience hors la mesure anonyme de fréquentation que tu as acceptée, pas de traceur, pas de cookie, pas de publicité, pas de SDK tiers hors Firebase (chargé seulement si tu ouvres le panneau Compte ou si tu es connecté).
- Aucun appel réseau pendant une partie. Les seules requêtes sont le téléchargement des fichiers du jeu et de ses mises à jour (le service worker vérifie s'il existe une nouvelle version quand tu ouvres l'app), si tu es connecté, l'envoi de ta progression et de tes scores entre deux parties et la lecture du classement quand tu l'ouvres, et, si tu as accepté la mesure de fréquentation, l'écriture de son document à l'ouverture du jeu (au plus une fois par jour, pendant 30 jours).

## Hébergement

Le site est servi par Firebase Hosting (Google). Comme tout serveur web, il peut tenir des journaux techniques des requêtes (adresse IP, date, fichier demandé) pour son fonctionnement et sa sécurité ; nous n'y ajoutons rien et nous ne les exploitons pas. Voir la [politique de confidentialité de Firebase](https://firebase.google.com/support/privacy).

## Enfants

Un compte n'est pas nécessaire pour jouer. Sans compte, le jeu ne demande ni ne traite aucune donnée, hors la mesure anonyme de fréquentation si elle est acceptée ; avec un compte, seules une adresse e-mail, la progression et, si un pseudo est choisi, les scores du classement sont enregistrés. Le contenu est un jeu d'action stylisé (silhouettes low-poly, pas de sang).

## Contact

Questions ou demande de suppression : ouvre un ticket sur le dépôt GitHub du projet (lien dans la page « À propos » du jeu).

_Dernière mise à jour : novembre 2026 (version 1.57.0)._
