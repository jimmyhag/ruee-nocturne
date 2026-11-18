# Appareils de test (phase 5)

PLAN.md §5 demande des tests sur 4 appareils réels avant la sortie. Voici ce dont on dispose, le protocole à dérouler sur chacun, et les bugs relevés. La porte de phase 5 est **zéro P0** sur les appareils testés.

## Appareils

| #   | Appareil                                                                                         | Système / navigateur                           | Qui                              | Statut                                                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | iPhone de Jimmy (modèle et version iOS à renseigner)                                             | Safari iOS, PWA « Sur l'écran d'accueil »      | Jimmy                            | à tester sur le live (PR #11 mergée sans test, décision de Jimmy)                          |
| 2   | PC de Jimmy, Windows 11                                                                          | Chrome et Edge, clavier ; installation desktop | Jimmy                            | à tester                                                                                   |
| 3   | **Android milieu de gamme 2021** (Pixel 4a / Galaxy A52 : la cible de performance de PLAN.md §1) | Chrome Android                                 | **à trouver** (prêt d'un proche) | non testé : seule l'émulation Playwright (profil iPhone 13 sur Chromium) couvre le tactile |
| 4   | Mac ou iPad                                                                                      | Safari macOS / iPadOS                          | **à trouver**                    | non testé                                                                                  |

Risque assumé (décision du 3 nov. 2026) : la cible Android n'est vérifiée que par émulation et par les mesures Lighthouse mobile (CPU ×4, 4G lente) ; la première remontée d'un joueur Android est à traiter en priorité après la sortie.

## Chantier mobile (17 nov. 2026)

Décision 10 de `docs/specs/swarmageddon-mobile.md` : le jeu a été testé sur de vrais téléphones et il tourne. Ce qui n'a pas été précisé est noté « non renseigné » ; Jimmy complète ce tableau quand il a l'information.

| Appareil                            | Modèle        | Système et navigateur          | Fluidité                      | Chauffe       | Contrôles     | Source              |
| ----------------------------------- | ------------- | ------------------------------ | ----------------------------- | ------------- | ------------- | ------------------- |
| iPhone de Jimmy                     | non renseigné | non renseigné (Safari iOS)     | tourne ; détail non renseigné | non renseigné | non renseigné | Jimmy, 17 nov. 2026 |
| Android d'amis de Jimmy (plusieurs) | non renseigné | non renseigné (Chrome Android) | tourne ; détail non renseigné | non renseigné | non renseigné | Jimmy, 17 nov. 2026 |

**Mesure de référence à demander à un ami sur Android** : ouvrir `https://ruee-nocturne.web.app/?debug=1&stress=400`, lancer une partie, attendre 30 s, puis envoyer une capture du compteur d'images par seconde affiché en haut de l'écran (avec le modèle du téléphone). Elle donne un chiffre de référence à 400 ennemis, la charge du budget de PLAN.md §4.3.

| Date          | Appareil               | Images par seconde à 400 ennemis | Remarques                       |
| ------------- | ---------------------- | -------------------------------- | ------------------------------- |
| non renseigné | Android (ami de Jimmy) | non renseigné                    | mesure demandée le 17 nov. 2026 |

## Protocole par appareil (checklist `pwa-release` §6)

Sur l'URL de preview de la PR, puis sur le live après merge. Cocher, noter la durée ou le chiffre quand il y en a un.

1. **Chargement** : le menu s'affiche en moins de 3 s sur réseau mobile ; les polices (Barlow Condensed des titres, Barlow du texte) sont bien celles du jeu, pas une police système.
2. **Langue** : l'interface suit la langue du système ; Réglages → Langue bascule français / anglais à chaud, y compris en pleine partie (pause → réglages) et à l'écran de mort.
3. **Installation** : Android et desktop : bouton « Installer l'app » au menu, icône sur l'écran d'accueil ; iPhone : Partager → « Sur l'écran d'accueil ». Lancée depuis l'icône : plein écran, pas de barre d'URL, safe areas respectées (encoche, barre du bas).
4. **Hors ligne au 2e lancement** : mode avion, relancer l'app depuis l'icône : le menu et une partie complète fonctionnent.
5. **Mise à jour** : après un nouveau déploiement, rouvrir l'app : bannière « Nouvelle version disponible — Recharger » au menu ; jamais pendant une partie.
6. **Premier « Jouer »** : le bouton passe au plus par « Chargement… » puis la partie démarre (noter la durée ressentie la toute première fois) ; relance depuis l'écran de mort < 2 s.
7. **Tactile** : joystick sous le pouce, SAUT, DASH ; mode gaucher ; taille du HUD « Grand » ; aucun zoom par pincement ou double-tap sur le jeu.
8. **Rotation** portrait ↔ paysage en jeu et au menu : HUD et boutons restent en place, image ni écrasée ni étirée.
9. **Arrière-plan** : mettre l'app en arrière-plan 5 min en pleine partie, revenir : jeu en pause, reprise propre, son et rendu intacts.
10. **Perf** : `?debug=1&stress=400` (ou onglet Perf depuis la pause) : fps et « temps × » après 30 s ; noter aussi pendant le Colosse (15:00).
11. **Sauvegarde** : Exporter (fichier et texte), Tout effacer, Importer : record, or et succès reviennent ; survit à la fermeture de l'app.
12. **Son et vibrations** : premier son après le premier geste (pas de son au chargement), vibration au boss et aux coups.

## Bugs relevés

Sévérité : **P0** bloque le jeu, l'installation ou la sauvegarde ; **P1** gêne nettement (perf, lisibilité, contrôle) ; **P2** cosmétique. Les P0 et P1 sont corrigés dans la branche avant le merge de la PR de phase 5.

| Date        | Appareil        | Sévérité | Description                                                                                                                                                                                | Statut           |
| ----------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 3 nov. 2026 | iPhone de Jimmy | P1       | Les écrans (menu, réglages, boutique, succès) ne défilent pas au doigt : le `touchmove` annulé pour tout le document bloquait aussi les écrans ; les longs panneaux étaient coupés en haut | corrigé (PR #12) |

## Historique des mesures téléphone

- 2 nov. 2026, téléphone de Jimmy (modèle non précisé) : 60 fps à 400 ennemis sur la preview de la PR #3 (phase 1).
- Phases 2 à 4 : mergées sans mesure téléphone (décision de Jimmy) ; à relever sur le live.
