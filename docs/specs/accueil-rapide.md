# L'accueil s'affiche sans attendre, dans toutes les langues

**Statut : 🟢 Implémenté**

Session du 21 novembre 2026. Pas de nouvelle version : correctif livré avec la réparation de la CI (branche
`ci/lenteur`).

## Contexte

- Depuis l'interface Nocturne (1.61.0), la porte Lighthouse (performance ≥ 85, médiane de 3, mobile simulé) échoue
  par intermittence : médianes de 64 à 83 dans 6 jobs sur 43. Le LCP médian est passé de 0,8–1,6 s à environ 3,6 s.
- Cause mesurée : le Chrome de Lighthouse est en `en-US`. Le script inline d'`index.html` pose alors `lang-pending`,
  qui masque tout `#menu` jusqu'à ce que `main.ts` (171 ko gzip) ait traduit la page. L'élément LCP (un `<dd>` du
  panneau d'accueil) attend donc le script principal : 770 ms de délai de rendu observés, 3,7 s en simulé.
- C'est vrai pour les joueurs : tout navigateur qui n'est pas en français voit l'accueil plus tard. Le masquage
  existe pour éviter un menu affiché en français puis retraduit (décalage de mise en page).

À ne pas casser : pas de français affiché puis remplacé, pas de décalage de mise en page (CLS), le choix de langue du
joueur (`settings.lang`) prioritaire sur celle du navigateur, la bascule de langue à chaud, la règle 8 (rien ne sort
de l'appareil).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Comment traduire tôt | Les textes **de l'écran d'accueil** (`#menu`, les nœuds `data-i18n` qu'il contient) sont traduits **avant le premier affichage**, par un petit code chargé avant le script principal, avec seulement les chaînes de ces nœuds. Le reste de la page est traduit comme aujourd'hui par `main.ts` | L'accueil est le seul écran visible au chargement |
| 2 | Le masquage | `lang-pending` ne masque plus l'accueil quand ses textes sont déjà traduits. Le garde-fou de 1,5 s reste pour le cas où le petit code ne s'exécute pas | Plus d'attente du gros script |
| 3 | Une seule source | Les chaînes viennent de `src/i18n/en.json` au build (aucune chaîne recopiée à la main). Un test vérifie que chaque nœud `data-i18n` de l'accueil a sa traduction précoce | Pas de dérive entre les deux |
| 4 | Poids | Le code précoce reste petit (quelques ko gzip au plus) et ne charge ni Three.js ni la simulation | C'est le but |
| 5 | La porte | Inchangée : seuil 85, médiane de 3, mobile simulé, Chrome en `en-US` | On corrige le jeu, pas la mesure |

## Hors périmètre

Les autres écrans ; la taille du script principal ; la mesure Lighthouse elle-même.

## Scénarios

```gherkin
# language: fr
Fonctionnalité: L'accueil s'affiche sans attendre, dans toutes les langues

  Scénario: Un navigateur en anglais voit l'accueil traduit dès le premier affichage
    Soit un navigateur en anglais, sans sauvegarde
    Quand la page d'accueil se charge
    Alors l'accueil est visible avant la fin du script principal
    Et ses textes sont en anglais dès qu'il est visible

  Scénario: Le choix de langue du joueur l'emporte sur le navigateur
    Soit un navigateur en anglais et une sauvegarde réglée en français
    Quand la page d'accueil se charge
    Alors l'accueil est en français dès qu'il est visible

  Scénario: Chaque texte de l'accueil a sa traduction précoce
    Soit les nœuds traduisibles de l'écran d'accueil
    Alors chacun a sa chaîne anglaise dans le code précoce, tirée du fichier de traduction
```

## Vérification attendue

- Vitest pour le scénario 3, e2e PC et mobile (locale `en-US`) pour les scénarios 1 et 2.
- Lighthouse local (`npm run lh`), Chrome en `en-US` : LCP et performance avant / après, dans la PR.
