# Consignes de la partie guidée lisibles sur les petits téléphones

**Statut : 🟡 Prêt pour le dev**

Session du 20 novembre 2026. Version visée : **1.69.1**.

Jimmy : « j'ai un pote qui l'a essayé sur son téléphone, plus petit que le mien […] il faudrait que les messages du tuto
soient mieux adaptés, parce que dans le format paysage de ce téléphone c'est illisible ».

## Contexte

- La bulle de consigne (`#tuto`, `#tutoCmd`, `#tutoText` dans `index.html`, CSS vers la ligne 1118) est placée à
  `top: 136px` (150 px avec la barre de boss), centrée, jusqu'à `min(92vw, 600px)` de large, en 16 px. Seule une
  règle `max-width: 480px` (portrait) la déplace.
- Capture du sparring en paysage 640×360 (petit Android) : la bulle tombe **au milieu de l'écran**, sur deux lignes, à
  la hauteur du héros ; elle couvre le jeu et passe sous la minicarte. À 568×320 (iPhone SE de première génération),
  elle tombe sur le héros.
- Les autres textes de la partie guidée et des premières fois peuvent souffrir des mêmes hauteurs : la flèche
  (`#tutoArrow`), la fenêtre de première fois (`#info` : portail, temps écoulé, monde infini), la feuille de fin de la
  partie guidée (`#tutoEnd`) et la carte de la première montée de niveau qui explique les raretés (`.lututo`).

À ne pas casser : les grands téléphones, les tablettes et le PC (rien ne bouge au-delà des seuils), la lecture par les
lecteurs d'écran (`role="status"`), la règle 4 (clavier et tactile à parité), les zones sûres (`env(safe-area-inset-*)`).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Petits écrans visés | Paysage de **568×320 à 932×430** (iPhone SE 1 à grands Android) et portrait de **320×568** et plus. En dessous de 320 px de haut en paysage, rien n'est garanti | Les téléphones d'entrée de gamme |
| 2 | La bulle en paysage bas | Quand la hauteur est faible (paysage, hauteur ≤ 500 px) : la bulle remonte **juste sous le chrono**, entre le bloc de gauche du HUD et la minicarte, sans les chevaucher ; police ≥ 14 px ; le texte peut tenir sur deux ou trois lignes dans cette largeur, jamais coupé. Elle ne passe jamais sur le **héros** (centre de l'écran), ni sur la minicarte, ni sur les boutons tactiles | Jimmy : « illisible » |
| 3 | Les fenêtres et feuilles | La fenêtre de première fois, la feuille de fin de la partie guidée et l'explication des raretés tiennent dans l'écran sans que leur bouton sorte de l'écran : leur contenu défile si besoin, le bouton reste visible et touchable | Même retour |
| 4 | La flèche | Elle reste dans l'écran et ne se cache pas sous la bulle | Même retour |
| 5 | Version | 1.69.1, livrée avant le lot A d'objets | Jimmy veut les choses en ligne vite |

## Hors périmètre

Le reste du HUD en dehors de la partie guidée ; un changement des textes eux-mêmes (sauf un raccourci si un texte ne
peut vraiment pas tenir) ; les écrans du menu.

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Consignes lisibles sur les petits téléphones

  Scénario: La consigne ne cache pas le héros sur un petit téléphone en paysage
    Soit la partie guidée sur un écran de 568×320, 640×360 puis 667×375 en paysage
    Quand la consigne la plus longue s'affiche
    Alors la bulle ne recouvre ni le centre de l'écran, ni la minicarte, ni les boutons tactiles
    Et tout son texte est visible

  Scénario: La consigne reste lisible en portrait étroit
    Soit la partie guidée sur un écran de 320×568 en portrait
    Quand la consigne la plus longue s'affiche
    Alors la bulle ne recouvre ni la minicarte ni les boutons tactiles
    Et tout son texte est visible

  Scénario: Les fenêtres de la partie guidée tiennent dans un petit écran
    Soit un écran de 568×320 en paysage
    Quand la fenêtre du portail, l'explication des raretés ou la fin de la partie guidée s'ouvre
    Alors son bouton est dans l'écran et se touche
```
