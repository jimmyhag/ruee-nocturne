# Ruée Nocturne — Plan de conception et d'exécution

> Survivor 3D (famille Vampire Survivors / Megabonk), jouable sur téléphone et PC, livré en PWA installable.
> Ce document est la source de vérité du projet. Claude Code l'exécute phase par phase, chaque phase ayant une porte de validation mesurable.
> Le nom « Ruée Nocturne » est un nom de code : renommable sans impact technique.

---

## 1. Vision

**Pitch** : la nuit tombe sur une clairière. Tes armes tirent toutes seules. Toi, tu bouges, tu sautes par-dessus la horde, tu dashes, et tu choisis tes améliorations. Tiens 20 minutes.

**Promesse au joueur**
- Comprendre en 10 secondes, maîtriser en 10 heures.
- Chaque run est différent (armes, synergies, évolutions).
- Chaque mort fait progresser (méta-déblocages).
- Relancer prend moins de 2 secondes.

**Ce qui nous distingue d'un clone 2D**
- La **verticalité** : le saut traverse la horde, les ennemis volants obligent à gérer deux plans.
- La **mobilité** : dash invincible, saut, momentum. Le joueur est acteur, pas spectateur.
- Un rendu **low-poly stylisé** : peu coûteux en assets, très identifiable, pardonnant sur mobile. Depuis la phase 14 : **nuit bleue profonde, lanternes chaudes** ; la phase 15 passe au **toon à contours noirs et formes arrondies** (décision de Jimmy, 4 nov. 2026 : « trop cubique »).

**Plateformes** : Chrome/Edge/Firefox desktop, Chrome Android, Safari iOS (PWA). Cible de performance : 60 fps sur un Android milieu de gamme de 2021 (type Pixel 4a / Galaxy A52).

**Hors périmètre V1** : multijoueur, serveur de jeu, achats, classement en ligne, store natif (Capacitor envisageable en V2). Les **comptes** (Google, e-mail / mot de passe) sont entrés en phase 13 à la demande de Jimmy : facultatifs, ils ne servent qu'à retrouver sa progression.

---

## 2. La boucle addictive (design, pas décoration)

Un survivor fonctionne par empilement de boucles emboîtées. Chacune doit exister et être lisible.

### 2.1 Boucle seconde (0–3 s) — « ça tape »
- Les armes tirent, les ennemis flashent blanc, reculent, explosent en particules, les gemmes d'XP volent vers le joueur.
- **Feedback obligatoire pour chaque coup** : flash + recul + son + chiffre de dégâts. Pas d'exception.
- Le joueur a toujours un choix de mouvement intéressant : contourner, sauter, dasher.

### 2.2 Boucle minute (30–90 s) — « je monte »
- Barre d'XP toujours visible, lisible, qui se remplit vite au début (premier niveau en < 20 s).
- Montée de niveau = pause + 3 choix + reprise immédiate. Le choix doit être **un vrai dilemme** (jamais 3 cartes de stats pures).
- Vague d'encerclement chaque minute : un pic de tension lisible (bannière, son, changement de densité).

### 2.3 Boucle run (15–20 min) — « ma build prend forme »
- Arc fixe : boss à 5:00, 10:00, 15:00 ; **Faucheur** à 20:00 (fin de run forcée, mort héroïque ou victoire si tué).
- Les armes **évoluent** (arme niveau max + passif associé → arme évoluée, visuellement spectaculaire). C'est le moment « wow » qui fait rester.
- Coffres lâchés par les élites : 1, 3 ou 5 améliorations d'un coup (récompense variable, jackpot rare).

### 2.4 Boucle méta (heures) — « encore une »
- Écran de mort = **progression visible** : or gagné, déblocages en cours avec barres, « il te manquait 42 s pour… ».
- Boutique permanente (or), **par personnage** depuis la phase 8 : +PV, +dégâts, +vitesse, +chance, +or, aimant, cadence, réanimation. 8 paliers par ligne, coûts croissants (200 → 1 255 or) ; un run sans palier tient ≈ 6 min, un personnage complet ≈ 15 min.
- Déblocages par **succès** : « survis 10 min » → nouveau personnage ; « tue 100 Dards » → nouvelle arme dans le pool. Chaque succès montre son avancement en temps réel.
- 3 personnages V1 aux stats et arme de départ différentes.
- Défi quotidien : seed fixe partagée, classement local (pas de serveur en V1).

### 2.5 Règles d'or
1. **Relance < 2 s** : écran de mort → bouton Rejouer → en jeu. Pas de chargement.
2. **Jamais de temps mort** : si rien n'arrive pendant 4 s, le spawner compense.
3. **La mort doit paraître juste** : le joueur voit toujours ce qui le tue (télégraphes, couleurs, sons distincts par type d'ennemi).
4. **Le pouvoir doit être ressenti** : à 15 min, l'écran doit être un feu d'artifice, le compteur de kills doit défiler.
5. **Chaque session mobile de 3 min doit être satisfaisante** : pause automatique en arrière-plan, reprise instantanée.

---

## 3. Contenu V1

### 3.1 Armes (6) et lignes de stats (phase 12)
| Arme | Comportement | Lignes possibles |
|---|---|---|
| Orbe filante | Projectile auto-visé | dégâts, recharge, +1 projectile, vitesse, +1 perforation |
| Halo brûlant | Aura de dégâts périodiques | dégâts, rayon, période |
| Lames orbitales | Lames tournantes, recul fort | dégâts, +1 lame, rayon, rotation |
| Foudre en chaîne | Frappe N ennemis en chaîne | dégâts, recharge, +1 cible |
| Boomerang | Aller-retour en ligne, traverse | dégâts, recharge, portée, +1 boomerang, vitesse |
| Mines | Posées sur le passage, explosent au contact | dégâts, recharge, rayon, +1 mine, chaîne |

Chaque arme s'améliore jusqu'à **100 fois** ; chaque carte apporte **1 à 3 lignes** de sa famille (1 ligne 67 %, 2 lignes « rare » 25 %, 3 lignes « épique » 8 %, décalées par la chance), chacune petite (`WEAPON_LINES` dans `balance.ts`). Il n'y a **plus d'évolutions** (décision de Jimmy, 4 nov. 2026) : la puissance vient des lignes, la montée est longue.

Maximum 4 armes + 4 tomes par run (forcer les choix). **Phase 10** : on part avec **1 arme** (celle du personnage) et **2 tomes** ; les emplacements suivants (jusqu'à 4 et 4) se débloquent pour tous les personnages par un succès **et** de l'or (`SLOTS` dans `balance.ts` : 300, 2 000, 4 000, 8 000, 12 000 or) ; le kit de départ d'un personnage ne compte pas contre le plafond.

### 3.2 Tomes (8, phase 12 ; remplacent les passifs)
Dégâts (dégâts, élites et boss, recul) · Cadence (recharge, durée des projectiles) · Projectiles (+1 projectile pour toutes les armes, taille, vitesse) · Vitalité (PV max, régénération, dégâts subis) · Mouvement (course, recharge et invulnérabilité du dash) · Savoir (XP, collecte) · Chance (lignes rares, coffres, 4e carte) · Or (or, or par élite). Une carte de tome tire elle aussi 1 à 3 lignes dans sa famille (`TOMES` dans `balance.ts`), jusqu'à 100 par tome.

### 3.3 Ennemis (6) et boss (3)
| Type | Rôle | Télégraphe |
|---|---|---|
| Spectre | Masse de base, lent | — |
| Dard | Rapide, fragile, vient en nuées | Sifflement |
| Brute | Tank, pousse ; **l'élite charge** en ligne (7 u à 16 u/s, phase 11) : on la traverse en dash ou on s'écarte | Couloir rouge au sol 0,6 s |
| Volant | Ignore le sol, oblige à sauter ou anticiper | Ombre au sol |
| Cracheur | Reste à distance, projectile lent et esquivable | Ligne de visée 0,6 s |
| Élite | Variante dorée de n'importe quel type, ×6 PV, lâche un coffre | Aura dorée |
| **Gardien** (5:00) | Boss charge en ligne ; **onde de choc** toutes les 6 s (3 s en phase 2) qui s'étend à 9 u/s jusqu'à 14 u : se saute (phase 11) | Recul + rugissement ; anneau rouge qui grandit |
| **Essaim-mère** (10:00) | Boss qui pond des Dards | Pulsation |
| **Colosse** (15:00) | Boss zones au sol | Cercles rouges 1 s |
| **Faucheur** (20:00) | Fin de run, quasi-invincible | Musique coupée |
| **Éruptions** (dès 2:30, phase 11) | Le sol : une fissure suit le joueur (7 u/s, plus vite qu'il ne marche) pendant 0,8 s puis un pic blesse et projette qui est **au sol** ; toutes les 9 s, 4 s à 15:00 | Cercle rouge qui se remplit, sous les pieds |

### 3.4 Terrain
- 1 carte V1 : clairière infinie procédurale (arbres, rochers, lanternes) avec **zones** : clairière ouverte, bois dense (couloirs), lac (ralentit). Les obstacles créent des décisions de trajectoire.
- **Plateaux** (phase 11) : 14 disques de roche de 2,5–4 u de rayon et 1,4 u de haut, placés par la seed hors lacs et bois, à 24 u au moins du départ (la clairière de départ reste ouverte). Ils se montent **d'un saut** (1,7 u) : le bord est un mur vu d'en bas, on le passe en l'air et on atterrit dessus, on retombe en sortant. Les marcheurs et les boss butent au pied ; Volants, crachats, cercles du Colosse, onde du Gardien et éruptions atteignent un joueur perché : un répit, pas un abri.
- Cycle de lumière lié au temps de run : crépuscule → nuit → aube (lisibilité du temps restant sans regarder le chrono).

### 3.5 Personnages (9, phase 6 ; 3 en V1)
Un personnage = une arme de départ + un passif signature (une règle de jeu, pas un pourcentage) + une condition de déblocage qui est un objectif en soi. « Différents, pas meilleurs » : chaque personnage à ± 3 min de l'Éclaireuse sur 100 runs du bot. Détail et décisions : `docs/PHASE6-PERSONNAGES.md`.

| Nom | Stats de départ | Arme de départ | Passif signature | Déblocage |
|---|---|---|---|---|
| Éclaireuse | +15 % vitesse, dash plus court | Orbe | aucun (référence d'équilibrage) | Départ |
| Bûcheron | +30 PV, lames à portée +20 % | Lames 2 | Fendeur : les Lames repoussent 50 % plus fort | Survivre 10 min |
| Vieille sorcière | −30 % PV | Foudre | Paratonnerre : la Foudre vise d'abord le plus proche | 500 kills cumulés |
| Veilleuse | +20 PV | Halo | Braise : le Halo grandit de 8 % par minute, max +40 % | 800 or |
| Braconnier | +10 PV | Boomerang 2 | Rapporteur : un boomerang attrapé rend la moitié de sa recharge | 1 200 or |
| Sapeur | −20 % PV, vitesse 0,92 | Mines | Démolisseur : chaque atterrissage pose une mine | Vaincre un boss |
| Feu follet | +30 % vitesse, −50 % PV | Orbe | Traînée : dash 2× plus long qui laisse du feu 1,5 s | Défi « Intouchable » (4 min sans dégât) |
| Revenante | −55 % PV, vitesse 0,9 | Foudre et Halo | Déjà morte : une Réanimation gratuite ; ×2 XP sur les kills en l'air | Vaincre le Faucheur |
| Colporteur | +15 PV, vitesse 1,03, Trèfle 1 et Bourse 1 | Lames 2 | Marchand : les coffres donnent toujours au moins 3 cartes | 2 000 or |

---|---|---|---|
| Éclaireuse | +15 % vitesse, dash plus court | Orbe | Départ |
| Bûcheron | +30 PV, lames à portée +20 % | Lames | Survivre 10 min |
| Vieille sorcière | Foudre dès le départ, −20 % PV | Foudre | 500 kills cumulés |

---

## 4. Architecture technique

### 4.1 Stack
- **Vite + TypeScript strict**, zéro framework UI (HUD en DOM natif, écrans en templates HTML). Pas de React : inutile et coûteux en frames.
- **Three.js** (version épinglée dans `package.json`), rendu via `InstancedMesh` pour tout ce qui se répète.
- **Vitest** pour la simulation (headless, déterministe).
- **Playwright** (Chromium déjà présent) pour captures d'écran et tests de fumée WebGL (`--use-angle=swiftshader`).
- **vite-plugin-pwa** (Workbox) : manifest, service worker, mise à jour « nouvelle version disponible ».
- **ESLint + Prettier**, hooks Git via `simple-git-hooks`.
- **Firebase Hosting** pour le déploiement (déjà utilisé sur Patrimoine Tracker), via GitHub Actions.

### 4.2 Séparation simulation / rendu (non négociable)
```
src/
  sim/        # Logique pure. Aucun import de three ni du DOM. Déterministe.
    world.ts        # état complet du run (joueur, ennemis, projectiles, gemmes, timers)
    step.ts         # step(world, input, dt=1/60) → events[]
    rng.ts          # PRNG seedé (mulberry32)
    weapons/        # une fiche par arme : stats(lv), tick(world, state)
    enemies/        # fiches + IA (steering simple + séparation par grille)
    spawner.ts      # courbes de densité, vagues, boss
    progression.ts  # XP, niveaux, tirage des choix (pondéré par chance)
    balance.ts      # TOUTES les constantes numériques, en un seul fichier
  render/     # Three.js. Lit le world, n'écrit jamais dedans.
    scene.ts, camera.ts, instancing.ts, fx/ (particules, traînées, chiffres), postfx.ts
  ui/         # DOM : HUD, écrans, cartes d'amélioration, boutique
  platform/   # input (clavier, tactile, manette), audio, stockage, pwa, perf
  meta/       # sauvegarde méta (or, déblocages, succès, réglages) — IndexedDB via idb-keyval, fallback localStorage
  main.ts     # boucle : accumulateur à pas fixe pour sim, rendu à chaque frame avec interpolation
tools/
  sim-cli.ts  # lance N runs headless avec un bot, sort des stats (voir skill sim-testing)
```
- **Pas fixe 60 Hz** pour la sim, rendu interpolé. Garantit le même run pour une même seed et un même input : indispensable pour les tests, le défi quotidien et le replay de bugs.
- Les **événements** sortis par `step()` (`hit`, `kill`, `levelup`, `pickup`, `bossSpawn`…) alimentent rendu, audio et HUD. La sim ne connaît ni particules ni sons.

### 4.3 Budgets de performance (mesurés, pas estimés)
| Métrique | Cible mobile milieu de gamme | Cible desktop |
|---|---|---|
| Frame | ≤ 16,6 ms (60 fps) avec 400 ennemis | ≤ 8 ms avec 600 ennemis |
| Draw calls | ≤ 40 | ≤ 80 |
| Triangles | ≤ 150 k | ≤ 500 k |
| Allocation JS / frame | 0 en régime permanent (pools partout) | idem |
| Résolution interne | 1 × DPR (≤ 2) en net, repli automatique ×0,75 puis pixel (≈ 380 px de haut) si p95 > 24 ms | 1 × DPR |
| Poids initial (gz) | ≤ 1,5 Mo | idem |
| Temps jusqu'au menu | ≤ 2 s en 4G | ≤ 1 s |

Un onglet **perf** (touche F3) affiche frame time, draw calls, nombre d'entités. Toute PR qui dégrade le budget est refusée.

### 4.4 Rendu
- Un `InstancedMesh` par type d'ennemi, par type de projectile, pour les gemmes, les particules, les traînées. `count` dynamique, matrices et couleurs en `DynamicDrawUsage`.
- **Attention version Three** : `setColorAt` alloue le tampon selon `count` au moment de l'appel. Toujours allouer les couleurs avec `count = capacité` puis remettre `count = 0`.
- Lumière : hémisphérique + directionnelle, **pas d'ombres projetées** (blob shadows en disque). Brouillard pour cacher le spawn.
- Matériaux : `MeshLambertMaterial` / `MeshToonMaterial`. Pas de PBR. Palette unique (`src/render/palette.ts` = `:root` d'index.html) : nuit bleue `#0f1628` / brouillard `#182341`, texte `#f3ecdc`, accent lanterne `#ffb347`, or `#ffd166`, PV `#ff5d73`, XP `#5fd3ff` (phase 14).
- Post-traitement : aucun sur mobile. Optionnel desktop : bloom léger, vignette.
- Caméra : vue 3/4 haute, suit le joueur avec amorti, légère avance dans la direction du mouvement, recul au boss.

### 4.5 Entrées
- Clavier (ZQSD/WASD/flèches, Espace, Maj), **manette** (Gamepad API, deadzone 0,2), tactile (joystick flottant sous le pouce gauche, boutons droite, rebinding gauche/droite).
- Un seul `InputState` normalisé par frame : `{move: vec2, jump, dash, pause}`.
- **Le saut et le dash servent** (phase 11) : le saut monte sur les plateaux et passe au-dessus des éruptions et de l'onde du Gardien (en l'air ≥ 0,9 u au-dessus du sol local : hors de portée des marcheurs, des crachats et des zones) ; le dash (0,32 s d'invulnérabilité) traverse une charge de Brute élite ou sort d'une éruption. Aucun des deux n'attaque : ce sont des outils de déplacement et d'esquive.

### 4.6 Audio
- Web Audio API. Pas de bibliothèque. Un `AudioBus` avec 3 canaux (musique, SFX, UI), limiteur simple, **pool de voix** (max 24 SFX simultanés, les tirs les moins récents coupés).
- SFX en montée de hauteur sur les combos (ramassage, kills en rafale).
- Musique : 3 couches (nappe, rythme, intensité) mixées selon la densité d'ennemis. Formats : `.ogg` + `.m4a` (Safari).
- Sources CC0 (Kenney, freesound filtré CC0) ou synthèse procédurale. Liste des crédits dans `CREDITS.md`.

### 4.7 Sauvegarde
- Méta en IndexedDB (`idb-keyval`), versionnée avec migrations. Export/import JSON depuis les réglages.
- Jamais de sauvegarde de run en cours en V1 (une partie se termine).
- **Compte facultatif (phase 13)** : Firebase Authentication (Google, e-mail / mot de passe) et Cloud Firestore `saves/{uid}` = `{ v, updatedAt, progress }`. Seule la **progression** est synchronisée (`PROGRESS_KEYS` dans `src/meta/sync.ts` : tout `Meta` sauf son, effets, réglages, `seenReset`) ; le document reçu passe par `normalizeMeta` comme un import JSON. Décision à trois versions (base / local / nuage) : premier login avec deux progressions différentes → le joueur choisit ; nuage changé et local propre → on prend le nuage ; vrai conflit → la plus récente gagne. Firebase n'est chargé (`import()`) qu'à l'ouverture du panneau Compte ou quand une session est connue : sans compte, aucune requête ne part.

### 4.8 PWA
- `display: fullscreen`, orientation libre, icônes maskable, écran de démarrage, mise à jour avec bannière « Nouvelle version — Recharger ».
- Tout l'app shell et les assets précachés. Jouable hors-ligne au second lancement. `navigateFallbackDenylist: [/^\/__\//]` : les URL réservées de Firebase Hosting (`/__/auth/handler`, `/__/firebase/init.json`) ne reçoivent jamais `index.html`.
- Bouton « Installer » dans le menu (`beforeinstallprompt`), aide iOS (Partager → Sur l'écran d'accueil).

---

## 5. Phases et portes de validation

Chaque phase = une branche, une PR, une porte. Claude Code **ne passe pas à la phase suivante tant que la porte n'est pas franchie et consignée dans `docs/GATES.md`**.

### Phase 0 — Fondations (repo, outillage, pipeline)
- Repo GitHub, Vite + TS strict, ESLint/Prettier, Vitest, Playwright, vite-plugin-pwa, hooks Git.
- CI : lint + typecheck + tests + build sur chaque PR. Déploiement Firebase Hosting sur `main`, preview channel sur PR.
- Écran « Hello world » 3D (un cube instancié ×1000 qui tourne) déployé et installable.
- **Porte** : URL publique en ligne, PWA installable sur Android et iOS, Lighthouse PWA = 100, CI verte.

### Phase 1 — Cœur jouable (port du prototype)
- Portage de `prototype/index.html` dans l'architecture sim/render. Joueur, saut, dash, 3 ennemis, 1 arme (Orbe), XP, niveaux, 3 choix, mort, relance.
- Bot de test dans `tools/sim-cli.ts` (stratégie « fuit le centre de masse, prend l'amélioration la plus chère »).
- **Porte** : 60 fps avec 400 ennemis sur le téléphone de Jimmy (onglet perf, capture jointe à la PR) ; `npm run sim -- --runs 100` tourne sans erreur ; couverture sim ≥ 80 %.

### Phase 2 — Game feel
- Application intégrale de la checklist du skill `game-feel` : hit-stop, squash & stretch, particules, traînées, chiffres de dégâts, shake, flash d'écran, sons par couche, musique adaptative.
- **Porte** : checklist cochée à 100 % dans la PR, 3 captures/GIF Playwright, aucune régression de budget perf.

### Phase 3 — Contenu et équilibrage
- 6 armes, 4 évolutions, 8 passifs, 6 ennemis, 3 boss + Faucheur, coffres, zones de terrain, cycle de lumière.
- Équilibrage **piloté par la simulation** (voir skill `sim-testing`) : cibles ci-dessous.
- **Porte** : sur 200 runs du bot « moyen », médiane de survie entre 9 et 13 min, 10 % des runs atteignent le Faucheur, aucune arme avec un taux de pick > 35 % ou < 8 %, aucun build avec une variance de kills > 3× la médiane.

### Phase 4 — Méta et rétention
- Or, boutique, succès avec barres de progression, 3 personnages, écran de mort riche, défi quotidien seedé, réglages (son, vibrations, taille HUD, gaucher, réduction des effets).
- **Porte** : test « nouveau joueur » scripté (Playwright) : 1er déblocage atteint en < 3 runs ; export/import de sauvegarde vérifié ; relance mesurée < 2 s.

### Phase 5 — Finition et sortie
- Localisation FR/EN (fichiers JSON), icônes et captures store, page d'accueil, `CREDITS.md`, politique de confidentialité (aucune donnée collectée).
- Tests sur 4 appareils réels (liste dans `docs/DEVICES.md`), correction des bugs P0/P1.
- **Porte** : zéro P0, Lighthouse perf mobile ≥ 85, tag `v1.0.0`, release GitHub avec notes.

### Phase 6 — Personnages (après la sortie 1.0.0)
- 9 personnages (§3.5) avec passif signature dans la sim (pur, déterministe, une constante par passif dans `balance.ts`), déblocage par succès, achat en or (boutique) ou défi ; trois défis par run (Intouchable : 4 min sans dégât ; Marathon : 4 km ; Métamorphe : 3 évolutions), compteurs dans la méta ; grille de personnages à 9 cartes (défilement à crans sur téléphone), bouton d'achat.
- **Porte** : chaque personnage mesuré sur 100 runs du bot `average` : survie p50 à ± 3 min de l'Éclaireuse, morts avant 3 min ≤ 15 % ; test « nouveau joueur » : un nouveau personnage débloqué en < 5 runs ; les trois défis atteints par le bot `greedy` en 200 runs ; bench, Lighthouse et tests inchangés.

### Phase 7 — Identité visuelle (après la 1.1.0)
- Toujours en low-poly généré par le code (aucun asset), même pipeline, mêmes budgets : un modèle propre à chaque personnage (silhouette, accessoire, palette qui disent le passif ; course, saut, dash animés ; effet visuel par passif), des ennemis lisibles de loin (forme et détail par type, couleurs par sommet, instancing conservé), un monde plus riche (ciel étoilé et lune, lanternes lumineuses, arbres variés, herbe, brume, cycle de lumière contrasté), et des tenues (deux palettes par personnage, la seconde à 400 or).
- **Porte** : draw calls ≤ 40 et triangles ≤ 150 k à 400 ennemis (test e2e stress), bench inchangé, 60 fps sur le téléphone de Jimmy, captures des neuf personnages et de la nuit lues et validées par Jimmy sur la preview ; aucune lisibilité perdue (télégraphes, couleurs par type d'ennemi).

### Phase 8 — Progression (après la 1.2.0)
- Retour de Jimmy : « trop facile de monter sans améliorer le perso », « évolution des perfs par perso séparée ». Le joueur nu passe sous la courbe (dégâts ×0,95) et le milieu de partie (7:00 → 15:00) devient raide pour que chaque palier se traduise en minutes ; la boutique passe par personnage (8 paliers petits et chers, une seule réanimation), l'ancienne boutique globale est reportée sur l'Éclaireuse, l'or reste partagé. Simulation en deux profils (`--upgrades 0|max`), cibles dans `tools/targets.ts` et skill `survivor-design` §9.
- **Porte** : profil nu (Éclaireuse, bot average, 200 runs) : survie p50 5–7 min, fin atteinte ≤ 3 %, morts < 3 min ≤ 15 %, or médian ≥ 2 premiers paliers ; profil maxé : survie p50 13–16 min, fin atteinte 3–12 %, cibles de contenu inchangées ; les neuf personnages à ± 3 min de l'Éclaireuse dans chaque profil ; nouveau joueur : 1er palier dès le 1er run, Veilleuse en < 5 runs (Playwright) ; ressenti des trois premiers runs validé par Jimmy sur la preview.

### Phase 9 — Rendu net (après la 1.3.1)
- Retour de Jimmy : « beaucoup plus clean graphiquement, pas pixelisé ». Rendu net à la résolution de l'écran (DPR ≤ 2, ≤ 1600 px de haut) avec anti-aliasing MSAA, texture de sol lissée, ombres douces sous le joueur, les ennemis et les arbres, particules rondes, brume exponentielle, lumière de contre, vignette CSS, formes plus lisses sur le joueur et les boss. Réglage `auto | net | pixel` ; en auto, repli automatique d'un niveau (net ×0,75 puis pixel) quand le p95 des frames dépasse 24 ms pendant 6 s. Le mode pixel reste disponible et reste le mode des petits appareils.
- **Porte** : draw calls ≤ 40 et triangles ≤ 150 k à 400 ennemis en net (e2e stress) ; repli automatique vérifié par test e2e ; Lighthouse inchangé ; sur le téléphone de Jimmy à `?debug=1&stress=400` : p95 ≤ 16,7 ms en niveau 2, sinon le repli se déclenche en < 10 s et laisse ≥ 30 fps ; captures nettes validées par Jimmy.

### Phase 10 — Progression lente (après la 1.4.0)
- Retour de Jimmy : « progression lente », « reset tout à zéro ». Sauvegarde version 3 : toute sauvegarde antérieure est remise à zéro (réglages conservés, bannière une fois). Emplacements d'armes (1 → 4) et d'améliorations (2 → 4) communs à tous les personnages, débloqués dans l'ordre par succès + or depuis la boutique ; le défi du jour joue au maximum (égalité). Profil nu de la simulation = départ (1 arme, 2 améliorations, 0 palier).
- **Porte** : profil nu : survie p50 4–6 min, ≥ 40 % des runs passent 3 min (l'arme n°2 reste accessible), morts < 3 min ≤ 20 %, or médian ≥ 0,75 premier palier ; profil maxé (4/4, paliers max) inchangé : 13–16 min, fin 3–12 % ; escalier mesuré et consigné (2 armes sans palier, 3/3 avec 4 paliers) ; nouveau joueur : aucune « nouvelle arme » proposée avant l'achat de l'emplacement (Playwright) ; migration v2 → zéro avec réglages gardés (Playwright).

### Phase 11 — Mouvement utile (après la 1.5.0)
- Le saut et le dash servent à se déplacer et à esquiver : plateaux de roche à escalader d'un saut (les ennemis au sol restent au pied, les Volants et les crachats passent), éruptions télégraphiées sous les pieds à sauter, anneau de choc du Gardien à sauter, charge télégraphiée des Brutes élites à traverser en dash.
- **Porte** : cibles des profils nu et maxé inchangées avec les nouveaux dangers ; éruptions ≤ 15 % des causes de mort ; draw calls ≤ 40 ; e2e plateau atteint d'un saut, éruption et anneau esquivés en l'air ; parité clavier/tactile.

### Phase 12 — Lignes de stats (après la 1.6.0)
- Les armes s'améliorent jusqu'à 100 fois par cartes à 1–3 lignes de stats aléatoires (dégâts, recharge, projectiles, vitesse, perforation, rayon…) ; les 8 passifs deviennent 8 tomes (Dégâts, Cadence, Projectiles, Vitalité, Mouvement, Savoir, Chance, Or) qui donnent eux aussi 1–3 lignes ; rareté par nombre de lignes (commune, rare, épique) décalée par la chance ; plus d'évolutions.
- **Porte** : cibles des profils nu et maxé inchangées ; arme principale entre 15 et 30 améliorations à 10 min (la montée est longue) ; lignes par carte ≈ 1,4 ; e2e : nouveau joueur, carte épique lisible desktop et mobile, FR/EN des lignes ; zéro allocation dans le tirage et le recalcul des stats.

### Phase 13 — Comptes (après la 1.7.0)
- Compte facultatif : connexion Google ou e-mail / mot de passe (réinitialisation par e-mail), progression synchronisée sur Firestore (§4.7), panneau Compte au menu (statut, synchronisation, déconnexion, suppression du compte et de ses données), choix local / compte au premier login, règles Firestore versionnées et déployées par la CI. Le jeu reste jouable sans compte ; les réglages ne quittent jamais l'appareil (PRIVACY.md).
- **Porte** : Google et e-mail testés par Jimmy sur iPhone (Safari et app installée) et sur PC ; progression retrouvée sur un second appareil ; choix local / compte vérifié ; suppression vérifiée (document absent dans la console) ; e2e « zéro requête Firebase sans compte » ; chunk principal ≤ +5 ko gz, Lighthouse perf mobile ≥ 85 inchangé ; règles vérifiées au Rules Playground (lecture d'un autre uid refusée).

### Phase 14 — Interface (après la 1.8.0)
- Écran-titre immersif : la clairière 3D plein écran sans voile, le personnage choisi en plan rapproché face caméra (tiers droit sur grand écran, centre sur téléphone), logo posé, Jouer et Défi du jour, barre d'icônes (Personnage, Boutique, Succès, Compte, Réglages) qui ouvrent des feuilles à en-tête commun ; les personnages et l'aide « Comment jouer » (affichée une fois au premier lancement) ont leur feuille ; système CSS commun (feuille, boutons, cartes, pastilles) ; palette nuit bleue partagée avec le rendu (brouillard, lumières).
- **Porte** : captures desktop et iPhone lues (accueil, Personnage, Boutique, Réglages, mort, montée de niveau) ; e2e complets verts avec les feuilles ; Lighthouse accessibilité ≥ 90 et perf inchangée ; budget de rendu en jeu inchangé ; test de Jimmy sur iPhone et PC.

### Phase 15 — Direction artistique toon (après la 1.9.0)
- Rendu toon à contours noirs (`MeshToonMaterial` à 3 tons, contour par coque inversée instanciée : +1 draw call par famille, pas d'`EffectComposer`), modèles arrondis (capsules, têtes sphériques, biseaux, normales lissées), sol en terrain avec herbe en nappes, palette nuit bleue étendue aux ennemis.
- **Porte** : ≤ 40 draw calls, ≤ 150 k tris à 400 ennemis, bench inchangé, captures lues, `perf-reviewer`, test de Jimmy.

### V2 (hors périmètre, à ne pas commencer)
Deuxième carte, Capacitor pour les stores, classement en ligne, mode coop local (les skins passent en phase 7).

---

## 6. Définition de « terminé » (pour toute tâche)
1. Typecheck, lint, tests verts. Couverture sim maintenue.
2. Aucun budget perf dégradé (onglet perf + `npm run bench`).
3. Fonctionne clavier **et** tactile (vérifié en émulation mobile Playwright).
4. Aucune allocation par frame introduite (vérifié au profiler sur 10 s de jeu).
5. Commit atomique, message en français, PR avec capture ou GIF si visuel.
6. `docs/GATES.md` et `CHANGELOG.md` mis à jour si la phase avance.

---

## 7. Références de ton (pas à copier, à comprendre)
- Vampire Survivors : économie des choix, évolutions, écran de mort.
- Megabonk : mobilité 3D, rendu rétro, générosité des effets.
- Risk of Rain 2 : lisibilité des télégraphes en 3D.
- Brotato : runs courts, builds extrêmes, relance instantanée.
- Nuclear Throne : poids des armes, hit-stop, shake.
