# Une sauvegarde qui ne recule jamais

**Statut : 🟢 Implémenté**

Session du 21 novembre 2026. Version visée : **1.69.3**.

Constat du développeur de la 1.69.1, en cherchant pourquoi un test e2e échouait en CI (`e2e/stages.spec.ts`,
« The totem boss's death drops the clock to 0 ») : un réglage changé juste avant un rechargement est parfois perdu.
Règle de Jimmy : « les joueurs existants ne perdent jamais leur progression ».

## Contexte

- `saveMeta` (`src/meta/save.ts`) écrit `localStorage` tout de suite (synchrone) et IndexedDB **sans attendre**
  (`set(KEY, m)`).
- `loadMeta` lit **IndexedDB d'abord** et ne prend `localStorage` que si IndexedDB est vide.
- Si la page se ferme ou se recharge avant la fin de l'écriture IndexedDB, le jeu recharge l'ancienne méta. Ce qui est
  perdu peut être un réglage, mais aussi l'or, les déblocages ou les records d'une partie qui vient de finir, si le
  joueur ferme l'appli juste après l'écran de fin.
- Mesure du développeur : sur le build de `main` (aed970f), un rechargement sur 5 qui suit immédiatement un
  `setMeta` revient avec l'ancienne langue, alors que `localStorage` contient la nouvelle.
- La sauvegarde de partie en cours (`src/meta/run-save.ts`) lit déjà `localStorage` d'abord : elle n'est pas touchée.

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Quelle copie croire | Chaque sauvegarde porte un **numéro de révision** croissant. Au chargement, le jeu lit les deux copies et garde **la plus récente**. À égalité, ou si aucune n'a de numéro, il garde IndexedDB, comme aujourd'hui | La copie la plus récente est celle que le joueur a vue |
| 2 | Anciennes sauvegardes | Une méta sans numéro (toutes les sauvegardes actuelles) se lit comme aujourd'hui. Elle reçoit son numéro à la prochaine sauvegarde. Aucune migration destructive, aucune remise à zéro | Règle de Jimmy |
| 3 | Le numéro et le compte | Le numéro reste sur l'appareil. Il ne fait pas partie de `PROGRESS_KEYS`, n'est pas envoyé à Firestore et ne change pas la règle de fusion du compte (`src/meta/sync.ts`) | Règle 8 ; le compte a sa propre règle |
| 4 | Réparer la copie en retard | Quand la copie retenue est celle de `localStorage`, elle est réécrite dans IndexedDB | Les deux copies se rejoignent |
| 5 | Stockage bloqué | Si l'un des deux stockages est indisponible, l'autre suffit, comme aujourd'hui | Navigation privée, quota |
| 6 | Version | 1.69.3, livrée après la 1.69.2 | Correctif |

## Hors périmètre

La sauvegarde de partie en cours ; la synchronisation du compte ; l'export et l'import, qui gardent leur format (le
numéro peut y figurer ou non : un import le remplace par un numéro neuf).

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Une sauvegarde qui ne recule jamais

  Scénario: Une sauvegarde interrompue n'efface pas la dernière progression
    Soit une méta sauvegardée, puis une seconde sauvegarde dont l'écriture IndexedDB n'a pas abouti
    Quand le jeu se recharge
    Alors il charge la seconde sauvegarde

  Scénario: Un réglage changé juste avant un rechargement est gardé
    Soit le jeu en français
    Quand le joueur passe en anglais et que la page se recharge aussitôt
    Alors le jeu est en anglais, à chaque essai

  Scénario: Une ancienne sauvegarde se charge comme avant
    Soit une méta sans numéro de révision dans IndexedDB et dans localStorage
    Quand le jeu se charge
    Alors la progression est intacte
    Et la prochaine sauvegarde porte un numéro

  Scénario: Le numéro de révision ne quitte pas l'appareil
    Soit un joueur connecté
    Quand sa progression est synchronisée
    Alors le document envoyé ne contient pas le numéro de révision
```

## Vérification attendue

- Vitest pour la lecture des deux copies (chaque scénario, plus le stockage bloqué).
- Tests Vitest en plus des scénarios (`src/meta/save.test.ts`), et la décision que chacun couvre :
  - « On a tie, IndexedDB is kept » : décision 1 (égalité) ;
  - « A more recent IndexedDB copy wins over localStorage » : décision 1 (la plus récente, même dans IndexedDB) ;
  - « An import replaces the revision number with a fresh one » : hors périmètre, l'import reçoit un numéro neuf ;
  - « A blocked localStorage leaves IndexedDB enough » et « An unavailable IndexedDB leaves localStorage enough » :
    décision 5 ;
  - « An old save in localStorage alone loads as before » : décision 2 ;
  - « Two tabs never let an older copy win » et « Two tabs with a full localStorage keep the latest IndexedDB copy » :
    décisions 1 et 4 (un numéro au-dessus de celui de la copie localStorage, relu à chaque sauvegarde ; la réparation
    n'écrase pas une écriture plus récente).
- e2e « The revision number does not leave the device » (`e2e/sauvegarde.spec.ts`) : décision 3, pour un joueur connecté
  (compte factice).
- e2e PC et mobile : un rechargement immédiat après un changement de langue, répété au moins 10 fois.
- `e2e/stages.spec.ts` reste tel quel : il doit passer sans être modifié.
