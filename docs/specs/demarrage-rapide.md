# Un premier lancement rapide sur un téléphone modeste

**Statut : 🟡 Prêt pour le dev**

Session du 21 novembre 2026. Pas de nouvelle version de jeu : correctif de performance, noté sous « Technique ».

## Contexte

- La porte Lighthouse (performance ≥ 85, médiane de 3 runs, mobile simulé avec un processeur ralenti ×4, Chrome en
  `en-US`) échoue sur une PR sur deux depuis la 1.61.0. Exemple, PR #55 : runs 56 / 70 / 100. Le LCP est à environ
  3,7 s, et le TBT médian varie de 77 ms à 826 ms (le pire run : 3,9 s).
- Sur un profil vierge (le cas de Lighthouse, et celui d'un nouveau joueur), l'élément LCP est le texte de l'aide
  « Comment jouer », que `main.ts` (171 ko gzip) ouvre au premier lancement (`src/main.ts`, vers la ligne 3947). Le
  premier écran d'un nouveau joueur attend donc l'exécution du gros script.
- Les longues tâches du démarrage (évaluation de `main.ts`, import et construction de la scène, compilation des
  shaders) tombent dans la fenêtre que Lighthouse mesure. Sur un téléphone d'entrée de gamme, ce sont des secondes de
  menu qui ne répond pas.
- Spec précédente : `docs/specs/accueil-rapide.md` (accueil traduit avant le premier affichage).

À ne pas casser : la partie guidée du nouveau joueur (l'aide du premier lancement, son bouton Jouer et la touche
Entrée), le lien de défi (`#defi=`), la règle 8, le temps entre « Jouer » et la partie (la scène doit être prête quand
le joueur la demande, ou se charger avec « Chargement… » comme aujourd'hui), le service worker.

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | L'aide du premier lancement | Le **premier écran** d'un nouveau joueur (l'aide « Comment jouer », ou l'accueil) est décidé et affiché **par le script en ligne**, avant le script principal, à partir des mêmes informations (sauvegarde locale, lien de défi dans l'adresse). `main.ts` reprend ensuite la main sans rien redessiner | Le LCP ne doit plus attendre le gros script |
| 2 | Les longues tâches | Le travail du démarrage qui n'est pas nécessaire au premier écran est découpé ou repoussé, pour qu'aucune tâche ne dépasse environ 50 ms sur un téléphone moyen pendant les premières secondes. Pistes à mesurer : évaluation de `main.ts`, import de la scène, construction du décor, compilation des shaders | Le TBT |
| 3 | La cible | En local (`npm run lh`, en-US, profil vierge) : performance ≥ 90 sur chaque run, LCP ≤ 2,5 s, TBT ≤ 200 ms. Les chiffres avant / après vont dans la PR et `docs/GATES.md` | Une marge réelle au-dessus de la porte |
| 4 | La porte | Inchangée : seuil, nombre de runs, langue, throttling | On corrige le jeu, pas la mesure |
| 5 | Le temps jusqu'à la partie | « Jouer » au premier lancement ne doit pas lancer la partie plus tard qu'aujourd'hui sur un même appareil (mesuré par l'e2e de la partie guidée et le smoke) | Ne pas déplacer le coût sur le joueur |

## Hors périmètre

La taille totale du code ; les autres écrans ; le changement de la mesure Lighthouse.

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Un premier lancement rapide sur un téléphone modeste

  Scénario: Un nouveau joueur voit l'aide avant la fin du script principal
    Soit un navigateur sans sauvegarde
    Quand la page se charge et que le script principal n'a pas encore fini
    Alors l'aide « Comment jouer » est visible et traduite

  Scénario: Un joueur qui revient voit l'accueil, pas l'aide
    Soit une sauvegarde où l'aide a déjà été vue
    Quand la page se charge
    Alors l'accueil s'affiche, sans l'aide

  Scénario: Un lien de défi ne montre pas l'aide d'abord
    Soit un navigateur sans sauvegarde qui ouvre un lien de défi
    Quand la page se charge
    Alors l'aide du premier lancement ne s'affiche pas

  Scénario: Le démarrage tient sa cible Lighthouse
    Soit le build de production servi en local
    Quand Lighthouse le mesure trois fois en mobile, en anglais, sur un profil vierge
    Alors chaque run a une performance d'au moins 90
```

## Vérification attendue

- e2e PC et mobile pour les trois premiers scénarios (script principal retenu, comme `e2e/accueil-rapide.spec.ts`),
  et la partie guidée existante (`e2e/tutoriel.spec.ts`) inchangée et verte.
- Le scénario 4 par `npm run lh`, chiffres dans la PR ; puis la porte Lighthouse de la CI sur la PR.
- Relecture `perf-reviewer` (démarrage et boucle).
