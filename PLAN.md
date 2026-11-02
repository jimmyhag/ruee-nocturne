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
- Un rendu **low-poly pixelisé** (PS1/N64) : peu coûteux en assets, très identifiable, pardonnant sur mobile.

**Plateformes** : Chrome/Edge/Firefox desktop, Chrome Android, Safari iOS (PWA). Cible de performance : 60 fps sur un Android milieu de gamme de 2021 (type Pixel 4a / Galaxy A52).

**Hors périmètre V1** : multijoueur, serveur, achats, comptes en ligne, store natif (Capacitor envisageable en V2).

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
- Boutique permanente (or) : +PV, +dégâts, +vitesse, +chance, +or, aimant, réanimation. Paliers avec coûts croissants.
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

### 3.1 Armes (6) et évolutions (4)
| Arme | Comportement | Niv. max | Évolution (arme max + passif) |
|---|---|---|---|
| Orbe filante | Projectile auto-visé, +tirs, +perçage | 5 | + Gants lourds → **Nova** : salve circulaire |
| Halo brûlant | Aura de dégâts périodiques | 5 | + Cœur de pierre → **Soleil noir** : aura + soin par kill |
| Lames orbitales | Lames tournantes, recul fort | 5 | + Semelles de vent → **Tempête** : rayon et vitesse ×2 |
| Foudre en chaîne | Frappe N ennemis en chaîne | 5 | + Sablier fêlé → **Orage** : frappe continue |
| Boomerang | Aller-retour en ligne, traverse | 5 | — |
| Mines | Posées sur le passage, explosent au contact | 5 | — |

Maximum 4 armes + 4 passifs par run (forcer les choix).

### 3.2 Passifs (8)
Semelles de vent (vitesse), Cœur de pierre (PV max), Sève vive (régén), Aimant (collecte), Gants lourds (dégâts), Sablier fêlé (recharge), Trèfle (chance : qualité des coffres et des choix), Bourse (or ×).

### 3.3 Ennemis (6) et boss (3)
| Type | Rôle | Télégraphe |
|---|---|---|
| Spectre | Masse de base, lent | — |
| Dard | Rapide, fragile, vient en nuées | Sifflement |
| Brute | Tank, pousse | Pas lourds |
| Volant | Ignore le sol, oblige à sauter ou anticiper | Ombre au sol |
| Cracheur | Reste à distance, projectile lent et esquivable | Ligne de visée 0,6 s |
| Élite | Variante dorée de n'importe quel type, ×6 PV, lâche un coffre | Aura dorée |
| **Gardien** (5:00) | Boss charge en ligne | Recul + rugissement |
| **Essaim-mère** (10:00) | Boss qui pond des Dards | Pulsation |
| **Colosse** (15:00) | Boss zones au sol | Cercles rouges 1 s |
| **Faucheur** (20:00) | Fin de run, quasi-invincible | Musique coupée |

### 3.4 Terrain
- 1 carte V1 : clairière infinie procédurale (arbres, rochers, lanternes) avec **zones** : clairière ouverte, bois dense (couloirs), lac (ralentit). Les obstacles créent des décisions de trajectoire.
- Cycle de lumière lié au temps de run : crépuscule → nuit → aube (lisibilité du temps restant sans regarder le chrono).

### 3.5 Personnages (3)
| Nom | Spécificité | Arme de départ | Déblocage |
|---|---|---|---|
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
| Résolution interne | 0,5–0,7 × DPR, upscale pixelisé | 1 × |
| Poids initial (gz) | ≤ 1,5 Mo | idem |
| Temps jusqu'au menu | ≤ 2 s en 4G | ≤ 1 s |

Un onglet **perf** (touche F3) affiche frame time, draw calls, nombre d'entités. Toute PR qui dégrade le budget est refusée.

### 4.4 Rendu
- Un `InstancedMesh` par type d'ennemi, par type de projectile, pour les gemmes, les particules, les traînées. `count` dynamique, matrices et couleurs en `DynamicDrawUsage`.
- **Attention version Three** : `setColorAt` alloue le tampon selon `count` au moment de l'appel. Toujours allouer les couleurs avec `count = capacité` puis remettre `count = 0`.
- Lumière : hémisphérique + directionnelle, **pas d'ombres projetées** (blob shadows en disque). Brouillard pour cacher le spawn.
- Matériaux : `MeshLambertMaterial` / `MeshToonMaterial`. Pas de PBR.
- Post-traitement : aucun sur mobile. Optionnel desktop : bloom léger, vignette.
- Caméra : vue 3/4 haute, suit le joueur avec amorti, légère avance dans la direction du mouvement, recul au boss.

### 4.5 Entrées
- Clavier (ZQSD/WASD/flèches, Espace, Maj), **manette** (Gamepad API, deadzone 0,2), tactile (joystick flottant sous le pouce gauche, boutons droite, rebinding gauche/droite).
- Un seul `InputState` normalisé par frame : `{move: vec2, jump, dash, pause}`.

### 4.6 Audio
- Web Audio API. Pas de bibliothèque. Un `AudioBus` avec 3 canaux (musique, SFX, UI), limiteur simple, **pool de voix** (max 24 SFX simultanés, les tirs les moins récents coupés).
- SFX en montée de hauteur sur les combos (ramassage, kills en rafale).
- Musique : 3 couches (nappe, rythme, intensité) mixées selon la densité d'ennemis. Formats : `.ogg` + `.m4a` (Safari).
- Sources CC0 (Kenney, freesound filtré CC0) ou synthèse procédurale. Liste des crédits dans `CREDITS.md`.

### 4.7 Sauvegarde
- Méta en IndexedDB (`idb-keyval`), versionnée avec migrations. Export/import JSON depuis les réglages.
- Jamais de sauvegarde de run en cours en V1 (une partie se termine).

### 4.8 PWA
- `display: fullscreen`, orientation libre, icônes maskable, écran de démarrage, mise à jour avec bannière « Nouvelle version — Recharger ».
- Tout l'app shell et les assets précachés. Jouable hors-ligne au second lancement.
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

### V2 (hors périmètre, à ne pas commencer)
Deuxième carte, Capacitor pour les stores, classement en ligne, mode coop local, skins.

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
