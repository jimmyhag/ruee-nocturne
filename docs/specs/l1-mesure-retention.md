# L1 — Mesure de la rétention

**Statut : 🟡 Prêt pour le dev**

Session du 17 novembre 2026, avec Jimmy. Sparring mené **en délégation** : Jimmy a demandé
de tout réaliser sans lui redemander de confirmation (« fais tout ce que je t'ai envoyé
dans le prompt, sans me demander de conf »). Chaque question ci-dessous a été posée et
tranchée par la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir
sur n'importe laquelle, la spec dit quoi changer.

## Contexte

Lot L1 de `docs/specs/swarmageddon-mobile.md` (décision 5) : en PWA, aucun store ne
mesure la rétention, et la règle 8 de `AGENTS.md` interdit toute donnée qui quitte
l'appareil sans compte. Sans mesure, on ne sait pas si le jeu retient (cible 35/15/5 à
D1/D7/D30), ni quel lot améliore quoi.

Ce qui existe :

- `src/platform/account.ts` : seul import de `firebase`, chargé à la demande ;
  `loadConfig()` y lit la configuration web (`VITE_FIREBASE_CONFIG` en dev,
  `/__/firebase/init.json` sur Hosting, copie dans `localStorage` `ruee-firebase-config`).
- `firestore.rules` : `saves/{uid}`, `scores/{uid}`, `weeks/{semaine}/scores/{uid}`, tout
  le reste refusé ; déployées par `.github/workflows/deploy.yml` (job `rules`, sur `main`).
- `e2e/account.spec.ts` : un joueur sans compte n'émet aucune requête vers Firebase.
- `src/meta/sync.ts` : `DEVICE_KEYS`, ce qui ne quitte jamais l'appareil.
- Réglages (`#settings` dans `index.html`, `src/main.ts`) : interrupteurs vibrations,
  effets réduits, etc.

À ne pas casser : règle 8 (sans compte **et sans accord**, aucune requête), règle 1
(rien dans la boucle chaude), Lighthouse (rien de chargé au premier affichage : pas de
SDK Firebase), la progression des joueurs (rien n'est ajouté à `Meta`).

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Méthode | **Comptage anonyme, uniquement si le joueur accepte** (opt-in). Refus ou absence de réponse : rien ne part. Valable avec ou sans compte, sans lien avec le compte | Recommandation de la spec cadre ; la seule mesure qui couvre les joueurs sans compte sans trahir la règle 8 |
| 2 | Ce qui est compté | Un document par appareil : un **identifiant aléatoire** (`crypto.randomUUID()`, créé à l'accord, jamais dérivé de l'appareil ni du compte), **`c`** le jour de cohorte (jour UTC de l'accord, en jours depuis le 1/1/1970), **`f`** vrai si le joueur avait fini au plus une partie à l'accord (nouveau joueur), **`o`** la liste des jours d'ouverture, en décalage depuis `c` (0 à 30), **`x`** la date d'expiration. **Rien d'autre** : ni version, ni appareil, ni langue, ni score | Le minimum pour D1/D7/D30 ; `f` sépare les nouveaux joueurs des anciens, sinon la cohorte de départ mélange des joueurs de plusieurs semaines |
| 3 | Jour d'installation | On ne le connaît pas pour les joueurs déjà là : la cohorte est le **jour de l'accord**. Les tableaux de lecture se lisent sur `f = vrai` pour la rétention des nouveaux joueurs | Pas d'historique à inventer |
| 4 | Ouverture | Compte comme jour d'ouverture : le lancement de l'app et le retour au premier plan (`visibilitychange` → visible). **Une écriture par jour UTC au plus**, et plus aucune après J30 | Une ouverture suffit pour D1/D7/D30 ; au-delà de J30 la donnée ne sert plus |
| 5 | Hors ligne, échec | Le jour est noté localement ; l'envoi reprend à la prochaine ouverture avec la liste complète. Aucune nouvelle tentative en boucle, aucune erreur visible | Une mesure ne doit jamais gêner le jeu |
| 6 | Stockage | Firestore `retention/{id}`, écrit par **l'API REST de Firestore avec `fetch`** (une requête `PATCH`, clé d'API web dans l'URL), **sans le SDK Firebase** | Le SDK pèse et passerait Lighthouse sous la barre ; `fetch` suffit pour un seul document |
| 7 | Configuration | `loadConfig()` et `FirebaseConfig` quittent `account.ts` pour un nouveau module `src/platform/firebase-config.ts` sans import de `firebase` ; `account.ts` l'importe. Sans configuration (dev sans `.env.local`, `vite preview`) : la mesure ne fait rien | La mesure ne doit pas charger le SDK ; une seule source de configuration |
| 8 | Règles Firestore | `retention/{id}` : `id` de 36 caractères ; création et mise à jour seulement avec les clés `c`, `f`, `o`, `x` (toutes présentes) ; `c` entier à ±2 jours de `request.time` à la création, inchangé ensuite ; `f` booléen ; `o` liste de 31 entrées au plus ; `x` horodatage à moins de 100 jours de `request.time` ; suppression permise ; **aucune lecture** (`get` et `list` refusés) | Personne ne relit les données des autres depuis le jeu ; seul Jimmy lit, avec ses droits d'administrateur |
| 9 | Durée de conservation | `x` = cohorte + 90 jours ; Jimmy active une **règle TTL** Firestore sur le champ `x` de la collection `retention` (console, gratuit, `docs/DEPLOY.md`). Le script de lecture ignore les documents expirés | 90 jours couvrent D30 avec de la marge ; rien ne traîne |
| 10 | Lecture par Jimmy | `npm run retention` (`tools/retention.ts`) : lit `retention` par l'API REST avec un jeton administrateur (`gcloud auth print-access-token`, ou la variable `RETENTION_TOKEN`), puis imprime un tableau par **semaine de cohorte** : nombre de joueurs, D1, D7, D30, séparément pour les nouveaux joueurs (`f`) et pour tous. Le calcul est une fonction pure de `src/meta/retention.ts`, testée par Vitest | Pas de page d'admin à protéger ; un script lancé à la main |
| 11 | Définition de Dn | Dn = part des joueurs de la cohorte **assez vieille** (au moins n jours) qui ont ouvert le jeu **le jour n** exactement. Une cohorte trop jeune affiche « — » | La définition du secteur, celle des repères 35/15/5 |
| 12 | Demande d'accord | Une feuille au menu, **une seule fois**, au retour au menu après la **première partie terminée** (ou au prochain retour au menu pour un joueur qui a déjà joué). Deux boutons : « Oui, compter » et « Non merci ». Ensuite, un interrupteur dans les Réglages, « Mesure anonyme de fréquentation », à tout moment | Demander avant d'avoir joué fait refuser ; ne jamais redemander après un non |
| 13 | Retrait | Passer l'interrupteur à « non » : plus aucun envoi, et une requête `DELETE` du document, puis l'identifiant est oublié. Un nouvel accord crée un nouvel identifiant | Le joueur garde la main sur ce qui le concerne |
| 14 | Stockage local | `localStorage` `ruee-retention` : `{ consent: 'yes' \| 'no' \| null, id, c, f, o, sent }`, hors de `Meta` (rien dans la sauvegarde, l'export ni la synchronisation) | Réglage propre à l'appareil, comme `DEVICE_KEYS` ; aucune règle de `saves/` à toucher |
| 15 | Règle 8 | Complétée (`AGENTS.md`) : sans compte **et sans accord pour la mesure de fréquentation**, aucune requête ; avec l'accord, ce document et rien d'autre. `PRIVACY.md` et la page À propos disent la même chose | La décision de Jimmy, écrite là où la règle vit |
| 16 | Un lot à la fois (règle 9) | Jimmy a demandé tous les lots d'affilée : la règle 9 n'est pas suivie pour L2 à L5. La mesure lira l'effet de l'ensemble, pas de chaque lot | Décision de Jimmy, notée pour la lecture des chiffres |

## Scénarios

# language: fr
Fonctionnalité: Mesure de la rétention

  Scénario: Un joueur qui refuse n'émet aucune requête
    Soit un joueur sans compte qui a répondu « Non merci » à la demande
    Quand il ouvre le jeu, joue une partie, revient au menu et recharge la page
    Alors aucune requête ne part vers Google ou Firebase

  Scénario: Un joueur qui n'a pas encore répondu n'émet aucune requête
    Soit un nouveau joueur qui n'a pas encore vu la demande
    Quand il ouvre le jeu et joue sa première partie
    Alors aucune requête ne part vers Google ou Firebase

  Scénario: La demande apparaît une fois, après la première partie
    Soit un nouveau joueur
    Quand il termine sa première partie et revient au menu
    Alors la demande de mesure s'affiche
    Et après une réponse elle ne s'affiche plus jamais

  Scénario: Un joueur qui accepte envoie un seul document par jour
    Soit un joueur qui a accepté la mesure
    Quand il ouvre le jeu deux fois le même jour
    Alors une seule requête part vers le document retention de son identifiant
    Et elle ne contient que l'identifiant, le jour de cohorte, le drapeau nouveau joueur, les jours d'ouverture et l'expiration

  Scénario: Le jour suivant ajoute un jour d'ouverture
    Soit un joueur qui a accepté hier
    Quand il ouvre le jeu aujourd'hui
    Alors les jours d'ouverture envoyés sont 0 et 1

  Scénario: Après trente jours plus rien ne part
    Soit un joueur dont la cohorte date de 31 jours
    Quand il ouvre le jeu
    Alors aucune requête ne part

  Scénario: Un envoi raté repart à l'ouverture suivante
    Soit un joueur qui a accepté et dont l'envoi d'hier a échoué hors ligne
    Quand il ouvre le jeu aujourd'hui en ligne
    Alors la requête contient les jours d'hier et d'aujourd'hui

  Scénario: Le retrait supprime le document et oublie l'identifiant
    Soit un joueur qui a accepté
    Quand il désactive la mesure dans les Réglages
    Alors une requête de suppression part pour son document
    Et plus aucune requête ne part ensuite

  Scénario: La mesure ne charge jamais le SDK Firebase
    Soit un joueur qui a accepté, sans compte
    Quand il ouvre le jeu
    Alors aucun module Firebase n'est chargé

  Scénario: Sans configuration la mesure ne fait rien
    Soit une version du jeu sans configuration Firebase
    Quand un joueur accepte la mesure
    Alors aucune requête ne part et aucune erreur n'apparaît

  Scénario: Le calcul de D1 D7 D30 ignore les cohortes trop jeunes
    Soit des documents de cohortes d'âges différents
    Quand le tableau de rétention est calculé
    Alors chaque Dn ne compte que les cohortes d'au moins n jours
    Et une cohorte trop jeune affiche un tiret

  Scénario: La demande se joue au clavier comme au doigt
    Soit la demande affichée
    Alors Tab atteint les deux boutons, Entrée valide et Échap vaut « Non merci »
    Et chaque bouton répond au toucher

## UI & Layout Contract

- **Référence visuelle** : aucune ; la feuille reprend les composants existants (`sheet`,
  `btn`) comme la feuille « Nouveautés ». Jimmy la verra sur la preview.
- **Arbre de composants** :

  | Composant | Couche | Statut |
  | --------- | ------ | ------ |
  | Feuille « Aider à améliorer le jeu ? » (`#consent`) | `index.html`, `src/main.ts` | créée : aucune feuille existante ne porte un choix oui/non |
  | Interrupteur « Mesure anonyme de fréquentation » | Réglages (`#settings`) | créé, sur le modèle des interrupteurs existants |
  | Module de mesure | `src/platform/retention.ts` | créé |
  | Configuration Firebase | `src/platform/firebase-config.ts` | créé (extrait de `account.ts`) |
  | Calcul D1/D7/D30 | `src/meta/retention.ts` | créé (pur) |
  | Script de lecture | `tools/retention.ts` | créé |

- **États** : feuille affichée au menu (nominal) ; hors ligne : rien de visible, l'envoi
  attend ; sans configuration : l'interrupteur fonctionne, rien ne part ; refus : rien de
  visible.
- **Focus** : à l'ouverture, sur « Oui, compter » ; Échap = « Non merci » ; à la
  fermeture, retour sur « Jouer ».
- **Libellés** (FR / EN, dans `src/i18n/fr.json` et `en.json`) :
  - Titre : « Aider à améliorer le jeu ? » / “Help improve the game?”
  - Texte : « Avec ton accord, le jeu compte de façon anonyme les jours où tu l'ouvres,
    pendant 30 jours. Rien d'autre : ni compte, ni score, ni appareil. Tu peux changer
    d'avis dans les Réglages. » / “With your consent, the game anonymously counts the days
    you open it, for 30 days. Nothing else: no account, no score, no device. You can
    change your mind in Settings.”
  - Boutons : « Oui, compter » / “Yes, count” ; « Non merci » / “No thanks”
  - Réglage : « Mesure anonyme de fréquentation » / “Anonymous visit count”

## Livraison

- Version **1.57.0** ; `CHANGELOG.md` (Ajouté : la question et le réglage, écrits pour
  les joueurs ; Technique : le document, les règles, le script).
- `PRIVACY.md`, page À propos, `docs/DEPLOY.md` (règle TTL à activer, lecture avec
  `npm run retention`), `docs/GATES.md` (L1).
- `package.json` : script `retention` (`tsx tools/retention.ts`), ajouté avec la spec.

## Hors périmètre

- Toute autre métrique (durée de partie, entonnoir, plantages) : une à la fois, plus tard.
- Une page d'administration dans le jeu.
- L'invitation des premiers joueurs : Jimmy partage le lien lui-même.
- Le lien entre la mesure et le compte : volontairement aucun.

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Rétention D1, D7, D30 et ce que chacun diagnostique | discovered | discovered |
| Mesurer la rétention en respectant la confidentialité | discovered | discovered |
| Consentement explicite (opt-in) et minimisation des données | — | discovered |
