# L4 — Carte de résultat, défi lancé à un pote, classement entre amis

**Statut : 🟢 Implémenté**

Session du 17 novembre 2026, avec Jimmy. Sparring mené **en délégation** : Jimmy a demandé
de tout réaliser sans lui redemander de confirmation. Chaque question a été tranchée par
la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur n'importe
laquelle.

## Contexte

Lot L4 de `docs/specs/swarmageddon-mobile.md` (décision 4), indicateur visé : nouveaux
joueurs. Sans budget de pub, seule une mécanique sociale intégrée au jeu fait venir des
joueurs. Le lot L3 a rendu le défi du jour court (5 min, même graine, même kit) : c'est
la partie qu'on peut comparer et partager.

Ce qui existe : défi du jour (`src/meta/daily.ts`, L3), classement en ligne de la
semaine pour les joueurs connectés avec un pseudo (`src/meta/board.ts`,
`src/platform/account.ts`, `scores/{uid}`, `weeks/{semaine}/scores/{uid}`, règles dans
`firestore.rules`), écran de classement (`src/ui/board.ts`), écran de fin (`#over`).

À ne pas casser : règle 8 (sans compte et sans accord, aucune requête ; un lien de défi
ouvert sans compte n'émet aucune requête), règle 11 (le partage passe par
`src/platform/` avec un repli), la progression des joueurs.

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Carte de résultat | Après un défi du jour (écran de fin) : bouton « Partager ». Le texte, sans spoiler (ni arme, ni objet, ni carte) : `Swarmageddon · Défi du 17 nov.` / `⏱ 5:00 ✅  💀 412` (ou `⏱ 3:41 ❌`) / `🔥 Série : 4 jours` (si série ≥ 2) / `Bats-moi : <lien de défi>`. Langue du joueur | Façon Wordle : un résultat qu'on comprend en un coup d'œil |
| 2 | Partage | `src/platform/share.ts` : `navigator.share({ text })` quand il existe (Android, iPhone) ; sinon copie dans le presse-papiers (`navigator.clipboard.writeText`) et message « Copié ! » ; si les deux manquent, le texte s'affiche sélectionné dans une zone de texte | Règle 11 : API du navigateur avec repli |
| 3 | Lien de défi | `https://ruee-nocturne.web.app/?defi=AAAA-MM-JJ&t=<secondes>&k=<kills>` (+ `&n=<pseudo>` si le joueur a un pseudo, + `&u=<uid>` s'il est connecté avec un pseudo). Origine prise de `location.origin` (la preview marche aussi). Rien d'autre dans le lien | Le minimum pour rejouer la même partie et voir le score à battre |
| 4 | Ouvrir un lien de défi | Le jeu s'ouvre au menu sur une feuille « Défi de {pseudo ou "un ami"} : {temps} · {kills} kills — à toi ! » avec « Relever le défi ». Si la date est **aujourd'hui** : c'est le défi du jour (compte pour la série, les missions et le classement du jour). Si la date est **passée** : même graine et mêmes règles, mais la partie ne compte ni pour la série ni pour le classement du jour (elle compte pour l'or et les missions comme une partie). Paramètres invalides : ignorés, menu normal | Le pote joue exactement la même partie |
| 5 | Score à battre | Pendant la partie : rappel discret sous le chrono (« À battre : 5:00 · 412 ») ; à la fin : « Défi battu ! » ou « Raté de {écart} » | Le duel se lit sans quitter l'écran |
| 6 | Amis | Ouvrir un lien qui porte `u` ajoute cet ami à `Meta.friends` (identifiant et pseudo, 50 au plus, sans doublon ; jamais soi-même). Un ami se retire depuis le classement. `friends` est une clé de progression synchronisée (`firestore.rules` : liste bornée) | Pas de recherche de joueurs ni de demande d'ami : le lien suffit |
| 7 | Classement du défi entre amis | Joueurs **connectés avec un pseudo** : leur résultat du défi du jour est publié dans `days/{AAAA-MM-JJ}/scores/{uid}` (`name`, `time`, `kills`, `at` ; le meilleur du jour, ne peut que monter), comme les scores de la semaine. L'écran de classement gagne un onglet « Défi du jour · Amis » : toi et tes amis (requête par identifiants, 30 au plus par requête), triés par temps puis kills. Sans compte : l'onglet invite à se connecter, aucune requête | Décision 4 de la spec cadre ; même modèle que le classement de la semaine (décision de Jimmy, phase 38) |
| 8 | Règles Firestore | `days/{jour}/scores/{uid}` : jour au format `AAAA-MM-JJ`, lecture pour les joueurs connectés (100 au plus par requête), écriture de son seul document, clés fermées et bornées (`time` ≤ 300, `kills` ≤ 20000), valeurs qui ne peuvent que monter | Les règles bornent ce qu'un client peut écrire |
| 9 | Règle 8 | Complétée (`AGENTS.md`, `PRIVACY.md`, À propos) : le résultat du défi du jour d'un joueur connecté avec un pseudo est publié comme ses scores de la semaine ; un lien de défi ne contient que la date, le temps, les kills, et, si l'expéditeur l'a choisi en étant connecté, son pseudo et son identifiant de compte | La décision écrite là où la règle vit |
| 10 | Joueurs existants | `friends` absent → liste vide. Rien d'autre ne change | Exigence de Jimmy |

## Scénarios

# language: fr
Fonctionnalité: Carte de résultat, défi lancé à un pote, classement entre amis

  Scénario: La carte de résultat ne dévoile rien de la partie
    Soit un défi du jour terminé en 5:00 avec 412 kills et une série de 4
    Quand le joueur partage son résultat
    Alors le texte contient la date, le temps, les kills, la série et un lien de défi
    Et il ne contient aucune arme, aucun objet, aucun personnage

  Scénario: Sans partage natif le résultat est copié
    Soit un navigateur sans partage natif
    Quand le joueur partage son résultat
    Alors le texte est copié et « Copié ! » s'affiche

  Scénario: Un défi lancé à un pote ouvre la même partie
    Soit un joueur qui envoie son défi à un ami
    Quand l'ami ouvre le lien
    Alors il joue la même graine
    Et voit le score à battre

  Scénario: Un défi d'un jour passé ne compte pas pour la série
    Soit un lien de défi daté d'hier
    Quand l'ami le joue
    Alors sa série et son classement du jour ne changent pas

  Scénario: Un lien invalide ouvre le menu normal
    Soit un lien avec une date ou un score illisible
    Quand il est ouvert
    Alors le menu s'affiche sans feuille de défi et sans erreur

  Scénario: Ouvrir un lien sans compte n'émet aucune requête
    Soit un joueur sans compte qui n'a pas accepté la mesure
    Quand il ouvre un lien de défi et joue la partie
    Alors aucune requête ne part vers Google ou Firebase

  Scénario: Un lien d'un ami connecté l'ajoute aux amis
    Soit un lien de défi qui porte un identifiant et un pseudo
    Quand le joueur l'ouvre
    Alors cet ami apparaît dans sa liste d'amis une seule fois

  Scénario: Le classement du jour montre toi et tes amis
    Soit un joueur connecté avec un pseudo et deux amis qui ont joué le défi du jour
    Quand il ouvre l'onglet « Défi du jour · Amis »
    Alors il voit trois lignes triées par temps puis par kills

  Scénario: Partager se fait au clavier comme au doigt
    Soit l'écran de fin d'un défi du jour
    Alors le bouton « Partager » répond au toucher et à la touche Entrée

## UI & Layout Contract

- **Kit** : écrans et composants suivent le kit « Nocturne » (`docs/specs/ui-nocturne.md`, maquette `docs/design/menus/`) : couleurs, polices Barlow, un seul bouton plein, filets sans carte, barre d'onglets.
  Le lot est développé en parallèle de l'interface Nocturne : il s'écrit avec les composants existants, et passe au kit au moment de sa fusion après Nocturne (le texte et la structure des écrans ne changent pas).

- **Référence visuelle** : aucune ; boutons et feuilles existants.
- **Arbre de composants** :

  | Composant | Couche | Statut |
  | --------- | ------ | ------ |
  | Bouton « Partager » (écran de fin du défi) | `#over`, `src/main.ts` | créé |
  | Partage natif / copie | `src/platform/share.ts` | créé : aucune API de partage n'existe encore |
  | Texte de la carte et lien | `src/meta/share-card.ts` (pur) | créé |
  | Feuille « Défi de {pseudo} » | `index.html`, `src/main.ts` | créée |
  | Rappel « À battre » sous le chrono | `src/ui/hud.ts` | modifié |
  | Onglet « Défi du jour · Amis » | `src/ui/board.ts` | modifié |
  | Lecture/écriture `days/` | `src/platform/account.ts`, `src/meta/board.ts` | modifié |

- **États** : partage annulé par le joueur : rien ; hors ligne : la carte se partage
  (texte) ; onglet amis hors ligne : « Classement indisponible hors ligne » ; aucun ami :
  « Partage ton défi pour inviter des amis » ; sans compte : invitation à se connecter.
- **Focus** : la feuille de défi s'ouvre sur « Relever le défi » ; Échap la ferme.
- **Libellés** (FR / EN) :
  - « Partager » / “Share” ; « Copié ! » / “Copied!”
  - « Défi du {date} » / “Challenge of {date}” ; « Série : {n} jours » / “Streak: {n} days” ; « Bats-moi : » / “Beat me:”
  - « Défi de {nom} » / “{name}'s challenge” ; « un ami » / “a friend” ; « à toi ! » / “your turn!” ; « Relever le défi » / “Take the challenge”
  - « À battre : {temps} · {kills} » / “To beat: {time} · {kills}”
  - « Défi battu ! » / “Challenge beaten!” ; « Raté de {écart} » / “Missed by {gap}”
  - « Défi du jour · Amis » / “Daily · Friends” ; « Partage ton défi pour inviter des amis » / “Share your challenge to invite friends” ; « Connecte-toi pour voir tes amis » / “Sign in to see your friends” ; « Retirer » / “Remove”

## Livraison

Version **1.62.0** ; `CHANGELOG.md` pour les joueurs ; `PRIVACY.md`, À propos ;
`docs/GATES.md` (Lot L4).

## Hors périmètre

- Une image générée pour la carte (texte seulement) ; un aperçu riche du lien
  (balises Open Graph par défi).
- Recherche de joueurs, demandes d'ami, messagerie.
- Classement mondial du défi du jour (seulement les amis).

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Mécanique sociale intégrée au jeu (viralité organique) | discovered | discovered |
| Lien profond (deep link) et paramètres d'URL validés | — | discovered |
