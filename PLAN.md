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
- Coffres lâchés par les élites : un **objet passif** au choix parmi 3 (deux pour un coffre de boss), §3.6. Un marchand passe quatre fois par run et vend d'autres objets contre l'or de la partie ; les synergies tome + arme donnent un objectif de build (phase 17).

### 2.4 Boucle méta (heures) — « encore une »
- Écran de mort = **progression visible** : or gagné, déblocages en cours avec barres, « il te manquait 42 s pour… ».
- Pas de stats permanentes achetées (phase 17 : la boutique par personnage de la phase 8 est retirée, l'or dépensé rendu). L'or sert aux **emplacements** d'armes et de tomes (communs à tous les personnages), aux personnages et aux tenues ; la puissance d'un run se construit **pendant** le run (cartes, objets, marchand, synergies). Dépenser au marchand ou garder pour la méta : un choix à chaque visite.
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
Dégâts (dégâts, élites et boss, recul, dégâts critiques) · Cadence (recharge, durée des projectiles, recharge du sort) · Projectiles (+1 projectile pour toutes les armes, taille, vitesse) · Vitalité (PV max, régénération, dégâts subis, PV par kill) · Mouvement (course, recharge et puissance du sort, saut) · Savoir (XP, collecte, soin à chaque niveau) · Chance (lignes rares, coffres, 4e carte, critique global) · Or (or, or par élite, prix du marchand). Une carte de tome tire elle aussi 1 à 3 lignes dans sa famille (`TOMES` dans `balance.ts`), jusqu'à 100 par tome.

**Phase 23 (demande de Jimmy)** : une carte ne tire **jamais deux fois la même ligne** ; chaque arme et chaque tome a au moins 3 lignes (armes 5 ou 6). Toutes les armes ont une ligne de **coup critique** (+5 %, ×2 dégâts, chiffre doré « 37! »), le Halo une ligne de ralentissement, la Foudre une ligne d'étourdissement (pas les boss). Constantes : `CRIT` dans `balance.ts`.

### 3.3 Ennemis (8) et boss (3)
| Type | Rôle | Télégraphe |
|---|---|---|
| Spectre | Masse de base, lent | — |
| Dard | Rapide, fragile, vient en nuées | Sifflement |
| Brute | Tank, pousse ; **l'élite charge** en ligne (7 u à 16 u/s, phase 11) : on la traverse en dash ou on s'écarte | Couloir rouge au sol 0,6 s |
| Volant | Ignore le sol, oblige à sauter ou anticiper | Ombre au sol |
| Cracheur | Reste à distance (dès 3:00, phase 16), projectile lent au sol, se saute ou s'évite | Ligne de visée 0,6 s |
| **Archer** (phase 16, dès 1:30) | Garde 10–13 u, flèche rapide en ligne droite arrêtée par les obstacles ; l'élite tire une volée de trois | Ligne de visée fine 0,5 s, direction figée : un pas de côté, un dash ou un muret |
| **Sorcier** (phase 16, dès 4:00) | Garde 12–15 u, boule de feu en cloche qui retombe là où était le joueur (passe au-dessus des murs) | Cercle rouge qui se remplit pendant le vol (1,1 s) |
| Élite | Variante dorée d'un type de masse ou de l'Archer, ×6 PV, lâche un coffre | Aura dorée |
| **Gardien** (5:00) | Boss charge en ligne ; **onde de choc** toutes les 6 s (3 s en phase 2) qui s'étend à 9 u/s jusqu'à 14 u : se saute (phase 11) | Recul + rugissement ; anneau rouge qui grandit |
| **Essaim-mère** (10:00) | Boss qui pond des Dards | Pulsation |
| **Colosse** (15:00) | Boss zones au sol | Cercles rouges 1 s |
| **Faucheur** (20:00) | Fin de run, quasi-invincible | Musique coupée |
| **Éruptions** (dès 2:30, phase 11) | Le sol : une fissure suit le joueur (7 u/s, plus vite qu'il ne marche) pendant 0,8 s puis un pic blesse et projette qui est **au sol** ; toutes les 9 s, 4 s à 15:00 | Cercle rouge qui se remplit, sous les pieds |

### 3.4 Terrain
- 1 carte V1, **construite** (phase 16) : la seed `MAP.seed` pose un lieu par secteur de 34 u, la clairière de départ (30 u) restant ouverte : **ruines** (murets de pierre en L, en U, en croix ou en enceinte brisée, toujours avec des brèches de 4 u), **cercles de pierres** (6 à 8 menhirs autour d'une lanterne), **troncs couchés** (2 ou 3, parallèles), **bosquets** (bois dense), **lacs** (ralentissent), clairières vides. Arbres et rochers épars autour, espacés d'au moins 3 u.
- **Toujours un accès aux ennemis** : deux obstacles d'ouvrages différents laissent 3 u de passage (une Brute élite fait 2,5 u), chaque ouvrage a des brèches, et un test vérifie que toute case libre est atteignable par une Brute élite (carte du jeu et 24 seeds). Les marcheurs suivent un **champ de flux** autour du joueur (cases de 1 u, recalcul toutes les 0,2 s) : ils trouvent la brèche au lieu de buter ; un marcheur qui n'avance plus suit le flux case par case 0,6 s. Les boss passent à travers les ouvrages.
- **Des obstacles utiles** : murets et troncs se franchissent **d'un saut** (le joueur s'échappe, les marcheurs font le tour) ; murets, menhirs, arbres et rochers **arrêtent les flèches et les crachats** (se mettre à couvert). Les plateaux de la phase 11 sont retirés (demande de Jimmy : les ennemis ne doivent jamais être tenus à distance).
- **Relief (phase 18)** : collines douces (70 collines gaussiennes, sommets de 4 à 6 u, pente ≤ 0,35 partout : jamais de marche ni de falaise, le champ de flux et la connexité ne changent pas). La clairière de départ, les fonds de lacs (cuvettes) et les lieux construits sont à plat. Monter ralentit et descendre accélère (vitesse × 0,75–1,15 selon la pente), pour le joueur comme pour les ennemis au sol. Dans la sim, `y` reste une hauteur au-dessus du sol local (saut, contact, murets) ; le rendu pose tout sur le sol dessiné (maillage 64 × 64, ombrage cuit : creux bleutés, sommets clairs). Constantes : `TERRAIN`, `SLOPE` ; code : `src/sim/terrain.ts`, `src/render/terrain.ts`.
- Cycle de lumière lié au temps de run : crépuscule → nuit → aube (lisibilité du temps restant sans regarder le chrono).

### 3.5 Personnages (9, phase 6 ; 3 en V1)
Un personnage = une arme de départ + un passif signature (une règle de jeu, pas un pourcentage) + une condition de déblocage qui est un objectif en soi. « Différents, pas meilleurs » : chaque personnage à ± 3 min de l'Éclaireuse sur 100 runs du bot. Détail et décisions : `docs/PHASE6-PERSONNAGES.md`.

Phase 19 : chaque personnage a aussi un **sort de classe** sur le bouton de l'ancien dash (Maj, bouton à l'écran, B/RB/RT à la manette), constantes dans `SPELL` (`src/sim/balance.ts`), code dans `src/sim/spells.ts`. Le tome Mouvement en réduit la recharge (−8 % par ligne depuis la phase 22) et en augmente la puissance (+8 % de dégâts, +4 % de rayon et de durée par ligne) ; la Cape rend invulnérable 0,4 s après chaque sort.

**Phase 22 (demande de Jimmy) : le sort est un temps fort.** Recharges ×2,5 et sorts ≈ 30 % plus forts ; la recharge se gagne. Sources : Rune de rappel −30 %, Collier d'os (0,1 s rendue par kill, réserve d'1 s, 4 s par boss), sanctuaire de l'arcane −12 %, tome Mouvement −8 % par ligne, Cape −25 %. Plancher : 35 % de la recharge de base, toutes sources cumulées. Le bouton affiche les secondes restantes.

| Sort | Classe | Effet | Recharge |
|---|---|---|---|
| Bond | Éclaireuse | élan invulnérable (0,2 s) puis 7 orbes en étoile | 8 s |
| Tourbillon | Bûcheron | 1,4 s de coups tout autour (r 3), dégâts subis ÷ 2, vitesse ×0,8 | 16 s |
| Clignement | Sorcière | téléportation de 6 u (s'arrête avant un obstacle), éclairs sur 7 ennemis au point de départ | 12 s |
| Éclat | Veilleuse | onde de r 6 : recul, étourdit 1,4 s (boss : ralentis) | 18 s |
| Collet | Braconnier | filet lancé à 7 u (r 3, 3,5 s) qui immobilise (boss : ralentis) | 16 s |
| Pétard | Sapeur | explosion sous ses pieds (r 4,2) qui le projette en l'air ; l'atterrissage pose une mine | 14 s |
| Comète | Feu follet | élan 2× plus long que le Bond, la Traînée y pose du feu | 6 s |
| Voile | Revenante | 1,75 s spectrale : invulnérable, vitesse ×1,3, ralentit ce qu'elle frôle | 18 s |
| Bourse | Colporteur | bourse lancée à 5 u qui explose (r 3,5), +1,3 dégât par 10 or gardés (+78 au plus) | 18 s |

| Nom | Stats de départ | Arme de départ | Passif signature | Déblocage |
|---|---|---|---|---|
| Éclaireuse | +15 % vitesse, sort Bond | Orbe | aucun (référence d'équilibrage) | Départ |
| Bûcheron | +30 PV, lames à portée +20 % | Lames 2 | Fendeur : les Lames repoussent 50 % plus fort | Survivre 10 min |
| Vieille sorcière | −30 % PV | Foudre | Paratonnerre : la Foudre vise d'abord le plus proche | 500 kills cumulés |
| Veilleuse | +20 PV | Halo | Braise : le Halo grandit de 8 % par minute, max +40 % | 800 or |
| Braconnier | +10 PV | Boomerang (1 ligne de dégâts, phase 18) | Rapporteur : un boomerang attrapé rend 30 % de sa recharge (phase 17) | 1 200 or |
| Sapeur | −20 % PV, vitesse 0,92 | Mines | Démolisseur : chaque atterrissage pose une mine | Vaincre un boss |
| Feu follet | +30 % vitesse, −50 % PV | Orbe | Traînée : sa Comète (dash 2× plus long) laisse du feu 1,5 s | Défi « Intouchable » (4 min sans dégât) |
| Revenante | −55 % PV, vitesse 0,9 | Foudre et Halo | Déjà morte : une Réanimation gratuite ; ×2 XP sur les kills en l'air | Vaincre le Faucheur |
| Colporteur | +15 PV, vitesse 1,03, Trèfle 1 et Bourse 1 | Lames 2 | Marchand : les coffres proposent 4 objets au lieu de 3 (phase 17) | 2 000 or |

---|---|---|---|
| Éclaireuse | +15 % vitesse, dash plus court | Orbe | Départ |
| Bûcheron | +30 PV, lames à portée +20 % | Lames | Survivre 10 min |
| Vieille sorcière | Foudre dès le départ, −20 % PV | Foudre | 500 kills cumulés |

### 3.6 Objets passifs, marchand et synergies (phase 17)
Demande de Jimmy : « pas d'amélioration par perso », « un achat de tomes plus complexe et plus stratégique ». Constantes : `ITEM`, `MERCHANT`, `SYN`, `SYNERGIES` dans `balance.ts` ; code : `src/sim/items.ts`, `merchant.ts`, `synergies.ts`.

**Objets passifs** : une règle de jeu chacun, uniques (un exemplaire par run), 6 au plus, icônes sous les armes dans le HUD. Rareté (commun, rare, épique) : poids de tirage 1 / 0,55 / 0,2, décalés par la Chance.

| Objet | Effet | Rareté |
|---|---|---|
| Plume de phénix | une réanimation à 25 % PV | épique |
| Cape de brume | dash 50 % plus long, invulnérabilité du dash +0,2 s | rare |
| Lanterne du veilleur | rayon de collecte ×1,6 | commun |
| Cœur de pierre | +30 PV max, −3 % vitesse | commun |
| Talisman orageux | tous les 25 kills, la foudre frappe les 5 ennemis les plus proches (50 % de leurs PV, 5 % pour un boss) | rare |
| Sablier fêlé | élites et boss ralentis de 20 % | rare |
| Épines | un ennemi au contact reçoit 3× les dégâts qu'il inflige | commun |
| Bottes de saut | saut 15 % plus haut ; l'atterrissage repousse les ennemis proches | commun |
| Œil du chasseur | +25 % de dégâts contre élites et boss | rare |
| Aimant d'âme | chaque gemme ramassée soigne 0,15 PV | commun |
| Fer à cheval | +1 Chance ; le marchand propose un objet de plus | rare |
| Bourse du colporteur | +40 % d'or ramassé, prix du marchand −15 % | commun |
| Rune de rappel (phase 22) | recharge du sort −30 % | rare |
| Collier d'os (phase 22) | chaque kill rend 0,1 s de recharge du sort (réserve d'1 s), un boss 4 s | rare |

**Coffres** : choix d'un objet parmi 3 (4 avec le Colporteur), deux choix pour un coffre de boss ; 6 objets portés ou plus rien à obtenir → un sac d'or.

**Marchand** : une échoppe s'installe à 10–14 u du joueur à 2:30, 6:30, 10:30 et 14:30, hors obstacle, et reste 45 s (flèche au bord de l'écran, distance, secondes restantes). Y entrer met la partie en pause : 3 objets (4 avec le Fer à cheval) à 70 / 140 / 240 or selon la rareté, +25 % par visite ; relancer coûte 40 or, puis 80, 120… ; on paie avec l'or de la partie, ce qui reste est gardé à la fin. Clavier : 1–4 acheter, R relancer, Échap partir ; boutons tactiles équivalents. On n'y rentre de nouveau qu'après en être sorti.

**Synergies tome + arme** : actives dès que l'arme est équipée et que le tome a reçu 3 cartes ; bannière et son, icône dans le HUD ; une carte qui en complète une porte le badge « Synergie » et dit ce qu'elle débloque. Chaque synergie ajoute aussi des PV max et de l'armure, d'autant plus qu'elle est la 2e, la 3e… (k-ième : +20·k PV, +3·k % d'armure) : c'est ce qui rend un kit complet (4 armes, 4 tomes, plusieurs paires possibles) plus fort qu'un kit de départ.

| Synergie | Paire | Effet |
|---|---|---|
| Orage | Cadence + Foudre | +4 cibles en chaîne |
| Essaim | Projectiles + Orbe | +1 orbe, +1 perforation (seule paire du kit de départ de l'Éclaireuse : modérée) |
| Brasier | Dégâts + Halo | dégâts du Halo +80 % |
| Tourbillon | Mouvement + Lames | lames 60 % plus rapides, rayon +25 % |
| Charge creuse | Dégâts + Mines | rayon des mines +60 % |
| Ricochet | Chance + Boomerang | +2 boomerangs, portée +30 % |
| Moisson | Savoir + Lames | rayon de collecte +50 % |
| Rempart | Vitalité + Halo | −40 % de dégâts des ennemis dans le Halo |

Décision prise : les synergies sont des bonus de stats ou des règles simples plutôt que de nouveaux comportements d'arme (brûlure, rebond, rotation au dash) : même lisibilité, aucun nouvel objet de pool dans la boucle chaude, réglables par la CLI.

**Points d'intérêt (phase 18)** : posés avec la carte sur les sommets et dans les lieux construits, signalés de loin par une **colonne de lumière** (pas de minicarte, choix de Jimmy).
- **Coffres de carte (20)** : on reste 0,6 s dessus pour l'ouvrir (même règle au clavier et au doigt). Prix en or de la partie : 40, puis +35 % à chaque coffre ouvert ; la puce « Coffre · prix » dit si l'or manque ou si les 6 objets sont portés. Le coffre donne un choix d'objet parmi 3. Les coffres d'élite et de boss restent gratuits.
- **Sanctuaires (10)** : rester 4 s dans le cercle (la jauge redescend dehors, les ennemis continuent d'arriver), puis 1 bonus permanent pour la partie parmi 3 : +12 PV max, +8 % de dégâts, +6 % de vitesse, −6 % de recharge, +25 % de collecte, +20 % d'or, −12 % de recharge du sort (sanctuaire de l'arcane, phase 22). Un usage chacun.
- **Respiration avant un boss** : bannière « … approche » 15 s avant, spawn à 60 % les 10 dernières secondes.

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
  ui/         # DOM : HUD, écrans, cartes d'amélioration, marchand, emplacements
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
| Triangles | ≤ 250 k en rendu net, ≤ 150 k en pixel (phase 21, décision de Jimmy du 5 nov. : ennemis en vrais modèles) | ≤ 500 k |
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
- **Modèles 3D (phase 20)** : héros, armes et décor en modèles **KayKit (CC0, Kay Lousberg)**, produits par `npm run assets` (`tools/assets/` : animations utiles seulement, accessoires choisis, compression meshopt) dans `public/models/` et décrits par `src/render/models.json`. Chargés par `GLTFLoader` et le décodeur meshopt de `three/examples` (aucune dépendance de prod). Héros : parties skinnées fusionnées en une `SkinnedMesh` + coque de contour, `HeroAnimator` piloté par l'état de la sim (lecture seule). Objets : géométries injectées dans les `InstanceWriter` existants (un appel par sorte) ; arbres, lanternes et petits cimetières dessinés à moins de 48 u du joueur. **Le modèle procédural reste le repli** tant que rien n'est chargé ou si le réseau manque. Les ennemis restent procéduraux jusqu'à la phase 21.
- **Ennemis (phase 21)** : squelettes KayKit dans `public/models/enemies.glb`. Corps fusionné et simplifié en trois niveaux par meshopt (boss ≈ 1 800 triangles, masse ≈ 330 en rendu net, ≈ 110 en pixel). Au chargement, les poses (marche ou course, plus un geste) sont **cuites** par skinning CPU en cibles de morph absolues (`src/render/enemyModels.ts`). Chaque instance mélange deux poses voisines via `InstancedMesh.morphTexture` (`src/render/pose.ts`) : un appel par type, aucun mixer par ennemi. Le Volant est un crâne flottant. Les boss ont un contour (`InstancedMesh` jumeau qui partage matrices et poses). Les silhouettes procédurales restent le repli.

### 4.5 Entrées
- Clavier (ZQSD/WASD/flèches, Espace, Maj), **manette** (Gamepad API, deadzone 0,2), tactile (joystick flottant sous le pouce gauche, boutons droite, rebinding gauche/droite).
- Un seul `InputState` normalisé par frame : `{move: vec2, jump, spell, pause}` (phase 19 : le bouton du dash lance le sort de la classe).
- **Le saut et le dash servent** (phase 11) : le saut franchit les murets et les troncs (phase 16 ; il montait sur les plateaux en phase 11) et passe au-dessus des éruptions, de l'onde du Gardien et des crachats (en l'air ≥ 0,9 u : hors de portée des marcheurs, des crachats et des zones ; les flèches, elles, touchent aussi en l'air) ; le dash (0,32 s d'invulnérabilité) traverse une charge de Brute élite ou sort d'une éruption. **Phase 19 :** le dash n'est plus commun ; le bouton lance le **sort de la classe** (§3.5), dont certains esquivent (Bond, Comète, Clignement, Voile, Pétard) et d'autres frappent ou contrôlent. Tous les dangers restent esquivables au saut ou d'un pas de côté.

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
- Tout l'app shell et les assets précachés. Jouable hors-ligne au second lancement. Exception (phase 20) : les modèles `public/models/` ne sont pas précachés (2,6 Mo) ; chaque joueur ne télécharge que son héros et `props.glb`, mis en cache à l'usage (CacheFirst), et le repli procédural couvre le premier lancement hors ligne. `navigateFallbackDenylist: [/^\/__\//]` : les URL réservées de Firebase Hosting (`/__/auth/handler`, `/__/firebase/init.json`) ne reçoivent jamais `index.html`.
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
- Rendu toon à contours noirs (`MeshToonMaterial` à 3 tons, contour par coque inversée instanciée : +1 draw call par famille, pas d'`EffectComposer`), modèles arrondis (boîtes arrondies sur les personnages et les boss, normales lissées ; les ennemis de masse restent en boîtes brutes pour le budget de triangles), sol en terrain avec herbe en nappes, palette nuit bleue étendue aux ennemis.
- **Porte** : ≤ 40 draw calls, ≤ 150 k tris à 400 ennemis, bench inchangé, captures lues, `perf-reviewer`, test de Jimmy.

### Phase 16 — Carte construite et tireurs (après la 1.10.0)
- Demande de Jimmy : une carte propre, des obstacles utiles, jamais d'endroit où les ennemis ne peuvent pas venir, des ennemis qui tirent. Carte en lieux (§3.4), champ de flux, murets franchissables d'un saut, tirs arrêtés par les obstacles, plateaux retirés ; Archer et Sorcier (§3.3), Cracheur dès 3:00, 24 tireurs à l'écran au plus.
- **Porte** : connexité 100 % (carte du jeu et 24 seeds) ; dans 200 runs simulés, aucun ennemi au sol immobile plus de 3 s à moins de 30 u du joueur (hors foule) ; cibles des profils nu et maxé tenues ; aucune source de tir à plus de 30 % des morts ; ≤ 40 appels et ≤ 150 k triangles à 400 ennemis ; bench dans les 10 % ; captures lues ; parité clavier et tactile ; test de Jimmy.

### Phase 17 — Marchand, objets passifs et synergies (après la 1.11.0)
- Retour de Jimmy : plus d'amélioration permanente par personnage, un système de tomes plus stratégique, un marchand qui vend des passifs, des coffres qui donnent des objets. Boutique par personnage retirée (sauvegarde version 4 : l'or des paliers est rendu, `shops` n'est plus écrit) ; 12 objets passifs, coffres → choix d'objets, marchand en partie, 8 synergies tome + arme (§3.6). La feuille « Boutique » devient « Emplacements » (décision prise : garder la feuille et son bouton plutôt que déplacer les emplacements dans la feuille Personnage, moins de changements d'interface pour le même résultat). CLI : profils nu (emplacements de départ) et maxé (tous les emplacements), `--upgrades` retiré, `--no-item` pour l'ablation, mesures d'objets, d'or dépensé et de synergies.
- Équilibrage (décisions prises) : courbe d'XP ×0,45 (les cartes des coffres passent dans les niveaux) ; cibles maxées ramenées de 13–16 à **10–13 min** (fin 1–12 %) et fin du profil nu ≤ 8 % : sans boutique, un kit complet ne gagne plus que par ses synergies, et un kit de départ qui concentre ses lignes sur une arme peut aller loin s'il passe le Gardien. Niveau à 10 min 32–42, arme principale 8–30.
- **Porte** : cibles des profils nu et maxé tenues (maxé ≥ nu + 3 min en médiane) ; ≥ 50 % des runs maxés activent au moins une synergie ; chaque objet obtenu au moins une fois sur 200 runs ; aucun objet à plus de 2× l'effet moyen en survie (ablation) ; migration testée (l'or des paliers rendu exactement, une fois) ; ≤ 40 appels et ≤ 150 k triangles à 400 ennemis ; zéro allocation par frame ; e2e coffre et marchand au clavier et au tactile ; captures lues (coffre, échoppe, marchand, HUD) ; test de Jimmy.

### Phase 18 — Relief, exploration et rythme (après la 1.12.1)
- Retour de Jimmy : difficulté lisse, rendre le jeu addictif (coffres posés sur la carte, marchand), la carte est trop vide : du relief, des montées et des descentes. Relief en collines douces (§3.4), coffres de carte payants et sanctuaires (§3.6), annonce et respiration avant les boss, mesure « plus forte chute des vivants en une minute » dans la CLI.
- **Porte** : pente ≤ 0,35 ; connexité 100 % ; cibles des profils nu et maxé tenues ; plus forte chute des vivants bornée ; coffres de carte ouverts (nu ≥ 1, maxé ≥ 3 par run) ; or dépensé en partie ≥ 25 % de l'or gagné (maxé ; 7 % avant la phase) ; ≤ 40 appels et ≤ 150 k triangles à 400 ennemis ; e2e coffre de carte et sanctuaire au clavier et au doigt ; captures lues ; test de Jimmy.

### Phase 19 — Un sort par classe (après la 1.13.1)
- Retour d'un testeur via Jimmy : « beaucoup trop générique ». Le dash commun est remplacé par un sort propre à chaque classe (§3.5, §4.5), sur le même bouton. Effets, son et retour visuel pour chacun (règle 3), ennemis étourdis ou ralentis lisibles (teinte), bots qui lancent chaque type de sort à son moment, ligne « sort » dans la CLI.
- **Porte** : 9 sorts distincts, chacun testé (Vitest) ; captures des 9 sorts lues (PC et iPhone) ; e2e du sort au clavier et au doigt ; cibles de l'Éclaireuse tenues dans les deux profils ; 9 personnages à ± 3 min ; morts < 3 min ≤ 20 % (nu) ; sort ≥ 0,75 lancer par minute chez le bot et ≤ 30 % des kills ; ≤ 40 appels et ≤ 150 k triangles à 400 ennemis ; zéro allocation par frame ; test de Jimmy et de son testeur.

### Phase 20 — Vraie 3D : héros, armes et décor (après la 1.14.0)
- Demande de Jimmy : une 3D « vraiment propre » pour les personnages, ennemis, armes, projectiles et objets. Décisions (5 nov.) : modèles de **packs CC0**, **Three.js conservé** (sim, tests et PWA intacts), deux phases : **phase 20 = joueur et décor**, phase 21 = ennemis. Seule l'organisation GitHub KayKit est joignable depuis l'environnement de build (kenney.nl, quaternius.com et itch.io bloqués) : tout vient de KayKit (Adventurers, Skeletons, Halloween Bits, Dungeon Remastered), licence CC0 vérifiée.
- **Héros** : 9 personnages sur 6 modèles (§4.4), distingués par accessoires, teinte et échelle ; les 2 tenues décalent la teinte de la texture palette (peau épargnée). Animations : repos, course (vitesse liée au déplacement), saut, réception, coup reçu, mort, une animation par sort (Bond et Comète : esquive ; Tourbillon : moulinet ; Clignement et Éclat : tir de sort ; Collet et Bourse : lancer ; Pétard : bras levés ; Voile : incantation longue).
- **Armes et objets** : épée en orbite (Lames), hache couchée qui tourne (Boomerang), bombe (Mines), coffres d'élite et de carte, sanctuaire à bougies, échoppe habillée de caisses, tonneau et pièces. Orbe, Foudre et Halo restent des effets de lumière.
- **Décor** : sapins et arbres morts, lanternes, petits cimetières (stèle, tombe, citrouille) au pied des arbres. Mêmes positions qu'avant (aucun changement de sim ni de collision) ; murets, menhirs et troncs restent procéduraux.
- Décisions prises : budget de téléchargement relevé de 350 ko à **450 ko par héros** et de 2,5 Mo à **3,2 Mo au total** (mesuré : 370 à 410 ko, 2,6 Mo ; ≈ 390 ko gzip réellement téléchargés par joueur) ; modèles non précachés (cache à l'usage) ; la Revenante prend le Skeleton Rogue (le pack Skeletons sert aussi la phase 21).
- **Porte** : les 9 héros sont des modèles KayKit animés (repos, course, saut, sort, coup reçu, mort) dans leurs 2 tenues, avec repli procédural testé (réseau bloqué) ; armes, coffres, sanctuaires, échoppe et décor en modèles CC0 crédités (CREDITS.md, À propos) ; manifeste testé (Vitest : 9 personnages, fichiers, animations, budget) ; ≤ 40 appels et ≤ 150 k triangles à 400 ennemis ; zéro allocation par frame ; bench inchangé ; captures lues (PC et iPhone) ; test de Jimmy.

### Phase 21 — Ennemis en vrais modèles (après la 1.15.0)
- Suite de la phase 20 : la horde passe en squelettes KayKit (pack Skeletons : Minion, Warrior, Mage, Rogue ; seul pack de monstres joignable).

  | Type | Modèle |
  |---|---|
  | Spectre | Minion qui marche |
  | Dard | petit Rogue qui court, lame |
  | Brute | Warrior casqué à la hache |
  | Volant | crâne flottant (Halloween Bits) |
  | Cracheur | Mage sans chapeau qui crache |
  | Archer | Rogue encapuchonné à l'arbalète, qui vise |
  | Sorcier | Mage au bâton qui lance |
  | Boss | Warrior géant au bouclier (Gardien), Mage géant qui invoque (Essaim-mère), Warrior géant à la hache (Colosse), Rogue géant encapuchonné (Faucheur) |

  Sim inchangée.
- Décisions prises :
  - **budget de triangles mobile relevé à 250 k en rendu net** (choix de Jimmy) ; 150 k en pixel, où les ennemis prennent leur version la plus simple ;
  - animation de masse par **morphs instanciés** plutôt que par textures d'animation maison : three 0.187 les gère nativement (`InstancedMesh.setMorphAt`), donc aucun shader à maintenir ;
  - pas de contour sur les ennemis de masse (budget de triangles ; les os clairs ressortent sur le sol nuit).
- **Porte** : les 11 types d'ennemis sont en modèles CC0 ; la masse marche ou court avec des poses décalées ; Archer, Sorcier et Cracheur ont leur pose de tir, les boss leur frappe ; repli procédural testé ; ≤ 40 appels, ≤ 250 k triangles à 400 ennemis en net et ≤ 150 k en pixel, y compris au point le plus dense ; zéro allocation par frame ; bench inchangé ; captures lues (PC et iPhone) ; fps du téléphone de Jimmy.

### Phase 22 — Sorts rares, recharge à gagner (après la 1.16.0)
- Demande de Jimmy : une recharge du sort beaucoup plus longue, et des objets ou d'autres moyens pour la raccourcir. Recharges ×2,5 (6 à 18 s) et puissance ≈ +30 % (choix de Jimmy) ; Rune de rappel, Collier d'os, sanctuaire de l'arcane, tome Mouvement et Cape renforcés ; plancher à 35 % ; secondes restantes sur le bouton.
- Décision prise : cible de lancers du bot ramenée de 0,75 à 0,3 par minute (nu) et 0,45 (maxé), conséquence directe des recharges ×2,5.
- **Porte** : cibles des profils nu et maxé tenues ; 9 personnages à ± 3 min de l'Éclaireuse ; chaque sort ≤ 30 % des kills ; Rune et Collier ≤ 2× l'effet moyen d'un objet ; réductions et plancher testés (Vitest) ; secondes affichées au clavier et au doigt (e2e, captures lues) ; bench inchangé ; test de Jimmy.

### Phase 23 — Cartes de niveau variées (après la 1.17.0)
- Demande de Jimmy : « +10 % dégâts, +10 % dégâts, +10 % dégâts, ça n'a pas de sens » ; des lignes différentes et plus de stats utiles. Lignes distinctes sur une carte ; coup critique pour les 6 armes, ralentissement (Halo), étourdissement (Foudre) ; 7 nouvelles lignes de tomes (dégâts critiques, recharge du sort, PV par kill, saut, soin à chaque niveau, critique global, prix du marchand).
- **Porte** : aucune carte avec deux fois la même ligne (Vitest, 3 000 tirages ; e2e) ; ≥ 3 lignes partout ; critique visible ; cibles nu et maxé tenues ; 9 personnages à ± 3 min ; captures lues ; test de Jimmy.

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
