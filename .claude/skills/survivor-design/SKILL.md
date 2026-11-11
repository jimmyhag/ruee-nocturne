---
name: survivor-design
description: Design et équilibrage d'un survivor (type Vampire Survivors / Megabonk) — courbes de spawn, XP, économie des choix, synergies, évolutions, méta-progression. À lire avant toute tâche de contenu, de balance.ts ou de phase 3/4.
---

# Design survivor — formules et principes

Toutes les constantes vont dans `src/sim/balance.ts`, jamais en dur ailleurs. Chaque valeur a un commentaire d'une ligne disant **pourquoi**.

## 1. Courbe de difficulté
Le joueur doit sentir trois états successifs par run : **fragile** (0–3 min), **puissant** (3–12 min), **dépassé** (12–20 min). La courbe de spawn suit une puissance douce, pas une exponentielle.

```ts
// ennemis/s en régime continu
spawnRate(t) = clamp(1.2 + 0.05·t + 0.05·max(0, t−120), 1.2, 20)
// multiplicateur de PV ennemis
hpScale(t)   = 1 + t/90            // ×2 à 1:30, ×14 à 20:00
// dégâts ennemis
dmgScale(t)  = 1 + t/300           // ×5 à 20:00
// vitesse
spdScale(t)  = 1 + min(t/600, 0.35)
```
- Vague d'encerclement chaque 60 s : `26 + 2·floor(t/30)` ennemis en anneau à 19 u.
- Boss à 300, 600, 900 s ; Faucheur à 1200 s.
- **Compensation d'ennui** : si aucun `hit` reçu ni donné pendant 4 s, spawn ×2 pendant 6 s.
- Plafond d'entités vivantes : 520 (perf). Au-delà, le spawner **remplace** les ennemis les plus éloignés (téléportation hors écran), il n'ajoute pas.

## 2. XP et niveaux
```ts
needFor(lv) = floor(5 + 4·lv + 0.6·lv²)   // lv1→10, lv5→40, lv10→105, lv20→325
```
- Premier niveau < 20 s de jeu. Niveau 10 vers 5 min, niveau 25 vers 15 min pour un joueur moyen.
- Gemmes : 1 (Spectre, Dard), 4 (Brute), 10 (élite), 40 (boss). Fusion automatique quand > 900 gemmes au sol (la plus proche absorbe).
- Aimant au kill de boss : toutes les gemmes au sol volent vers le joueur (récompense + nettoyage).

## 3. L'économie des choix (le cœur du genre)
Chaque montée de niveau propose **3 cartes** (4 avec la chance), tirées ainsi (phase 12 : lignes de stats) :
1. Pool = armes non maxées (nouvelles armes incluses tant que les **emplacements** le permettent : 1 au départ, jusqu'à 4) + tomes non maxés (2 au départ, jusqu'à 4). Le kit de départ du personnage ne compte pas contre le plafond.
2. Chaque carte porte **1 à 3 lignes de stats** tirées dans la famille de l'arme ou du tome (`WEAPON_LINES`, `TOMES` dans `balance.ts`) : 1 ligne 67 %, 2 lignes 25 % (rare, cadre bleu), 3 lignes 8 % (épique, cadre or) ; chaque point de chance ajoute 2 pts vers 2 lignes et 1 pt vers 3. Les lignes « rares » (+1 projectile, +1 lame, +1 cible, +1 perforation) pèsent 1 contre 3 pour les lignes en pourcentage ; une ligne plafonnée n'est plus tirée.
3. Pondération des cartes : arme/tome **déjà possédé** ×1,6 (favorise la cohérence), item jamais vu ×1,3 (découverte).
4. Garantie : au moins 1 carte d'arme si le joueur a < 2 armes **et un emplacement libre** ; jamais 3 tomes.
5. Pool vide → soin complet.

Le texte d'une carte dit **chaque ligne concrètement** (« +7 % dégâts », « +1 projectile ») ; une nouvelle arme ou un nouveau tome montre d'abord sa règle. La montée est **longue** : 100 améliorations par arme ou tome, jamais atteintes en 20 min (courbe d'XP aplatie : ≈ 35 cartes à 10 min, une toutes les ~15 s) ; le niveau 5 d'avant (≈ ×3 de DPS) se retrouve vers 10–12 améliorations. Les ennemis montent un peu moins vite qu'avant (`hpScale` t/190, `dmgScale` t/500) : la puissance arrive par petites touches.

## 4. Armes : grammaire de design
Chaque arme répond à : **portée** (contact / courte / longue), **ciblage** (auto / direction / zone / aléatoire), **rythme** (continu / salve / lent et fort). Deux armes ne doivent jamais partager les trois.

| Arme | Portée | Ciblage | Rythme | Fantasme | Lignes (step) |
|---|---|---|---|---|---|
| Orbe | longue | auto plus proche | salve | sniper | dégâts +10 %, recharge −5 %, +1 projectile (max +5), vitesse +8 %, +1 perforation (max +3) |
| Halo | contact | zone autour | continu | tank | dégâts +10 %, rayon +6 %, période −5 % |
| Lames | courte | orbite | continu | derviche | dégâts +10 %, +1 lame (max +8), rayon +4 %, rotation +6 % |
| Foudre | longue | aléatoire + chaîne | lent fort | mage | dégâts +10 %, recharge −5 %, +1 cible (max +10) |
| Boomerang | longue | direction regard | salve | contrôle de ligne | dégâts +10 %, recharge −5 %, portée +6 %, +1 boomerang (max +3), vitesse +6 % |
| Mines | contact | là où je passe | pose | piégeur / kiting | dégâts +10 %, recharge −5 %, rayon +5 %, +1 mine (max +12), chaîne (unique) |

Les lignes en % se cumulent (`base × (1 + step)^n`), les lignes entières s'ajoutent ; les baisses en % sont plafonnées (15 lignes de recharge : ×0,46). Une ligne rare apporte un **changement qualitatif** (un projectile de plus se voit), les lignes en % font grimper lentement.

## 5. Tomes (phase 12, à la place des passifs et des évolutions)
Neuf tomes au tirage (huit de la phase 12 et le Sang ; trois autres écrits mais en réserve, voir plus bas), 4 emplacements, chaque carte tire 1 à 3 lignes dans sa famille, effets additifs sur la base du joueur :
- **Dégâts** : dégâts +8 %, dégâts aux élites et boss +8 %, recul +10 %.
- **Cadence** : recharge −4 % (plancher 25 %), durée des projectiles +6 %.
- **Projectiles** : +1 projectile pour toutes les armes (rare, max 3), taille +6 %, vitesse des projectiles +6 %.
- **Vitalité** : +12 PV max, régénération +0,4/s, dégâts subis −3 % (plafond −36 %).
- **Mouvement** : course +5 %, recharge du sort de classe −6 % (plancher 40 %), puissance du sort +8 % (phase 19).
- **Sorts de classe** (phase 19) : un par personnage, sur le bouton de l'ancien dash. Un sort donne une identité, pas la victoire : il doit servir au moins une fois par minute chez le bot et faire au plus 30 % des kills (l'arme reste la source principale). Tous les dangers restent esquivables sans sort d'esquive (saut, pas de côté). Le bot lance chaque type de sort à son moment (esquive : ennemis au contact ou charge ; zone : ≥ 3 ennemis dans le rayon ; lancer : ≥ 4 ennemis à portée, visée vers la masse).
- **Savoir** : XP +6 %, collecte +8 %.
- **Chance** : chance +0,5 (lignes rares, 4e carte, coffres), or des coffres +20 %.
- **Or** : or +8 %, +1 or par élite vaincue.
- **Sang** (phase 47) : vol de vie +2 % (0,6 PV/s de réserve par ligne), réserve de soin +0,6 PV/s (ligne à prérequis : `needs: 'heal'`), dégâts +6 % sous 50 % de PV.
- **Givre** (phase 47, en réserve) : 6 % de chance de ralentir à chaque coup d'arme (pas les boss), dégâts +10 % aux ennemis ralentis ou étourdis, durée des ralentissements +15 %.
- **Bastion** (phase 47, en réserve) : riposte au contact (×1 par ligne), garde −5 % de dégâts de contact (plafond −30 %), revanche +8 % de dégâts 3 s après un coup reçu.
- **Défi** (phase 47, en réserve) : apparitions +5 %, XP et or des élites +8 %, élites +8 % plus fréquentes. Un pari, pas un bonus gratuit : à mesurer par ablation.

### Ajouter un tome : la dilution (phase 47)
Les tomes ne se valent pas : sur 200 parties du kit complet, « monde 2 atteint » vaut 85 % avec Projectiles et 62 % sans, 80/73 % pour Vitalité, 80/75 % pour Savoir ; les autres sont neutres. Quatre emplacements pour huit tomes : Projectiles est pris dans 68 % des parties. Avec douze tomes : 51 %, et « monde 2 atteint » tombe de 74–78 % à 52–59 %, victoire de 21 à 9–13 % — même en renforçant les nouveaux tomes de 50 %, même avec un bot qui préfère les tomes de combat. Le recul de Projectiles explique environ 5 de ces 16 points ; le reste baisse avec ou sans lui et n'est pas expliqué. Un tome de plus coûte donc aux autres, quelle que soit sa force.
- Mesurer un tome **seul** (`--no-tome a,b,c`) puis tous ensemble (`--held-tomes`), sur au moins deux graines (`--seed 42`, `43`) : à 100 parties, deux graines du même réglage s'écartent de 10 points.
- Lire « monde 2 atteint avec / sans le tome » dans le JSON (`tomes` par partie), pas seulement la médiane.
- Un tome en réserve (`TOME_HELD`) est défini, testé, traduit, mais ni tiré ni listé à la Bibliothèque.
- Le bot choisit un **nouveau** tome par famille (`COMBAT_TOMES`, `BOT_TUNE.tomePrior`) : un emplacement est rare, un joueur lit la carte. `--tome-prior 0` rend l'ancien bot ; sur l'ancien contenu les deux donnent les mêmes résultats (75 % et 21 % contre 78 % et 21 %).

### Vol de vie et soin (phase 47)
Tout soin « par coup » passe par la réserve de soin par seconde (`healCap` dans `src/sim/items.ts`) : Croc, Couronne, vol de vie du héros (tome Sang, sanctuaire du sang). Les dégâts montent en multiplicatif, le soin non : un vol de vie sans plafond en PV/s rend le héros immortel en fin de partie. Une nouvelle source de vol de vie ajoute à `Player.steal` et, si besoin, à la réserve ; elle ne soigne jamais directement.

### Sanctuaires (phase 47)
Dix-huit bonus, un par stat du héros (`BOON`), quatre proposés par sanctuaire. Règles : un bonus = une stat, la même valeur qu'une ligne de tome ou un peu plus (le sanctuaire coûte 4 s immobile dans la horde) ; un bonus plafonné n'est plus proposé (`boonCapped`) ; la carte dit « actuel → nouveau » (`boonNow`, calculé par `boonApply` sur une copie du héros) ; toute stat ajoutée au héros a sa ligne dans la fiche de stats (`STAT_ROWS`, test).
Plus d'évolutions (décision de Jimmy, 4 nov. 2026) : la récompense de run est une arme à 25+ améliorations (succès « Érudit ») et les cartes épiques (succès « Triple ligne »).

## 6. Ennemis : rôles, pas stats
Un ennemi existe pour poser une **question** au joueur :
- Spectre : « gères-tu la masse ? » — Dard : « peux-tu te retourner vite ? » — Brute : « as-tu du recul / du perçage ? » — Volant : « sautes-tu au bon moment ? » — Cracheur : « bouges-tu quand même ? » — Archer (phase 16) : « lis-tu la ligne de visée, te mets-tu à couvert ? » — Sorcier (phase 16) : « sors-tu du cercle à temps ? » — Élite : « vas-tu chercher le coffre dans la masse ? »
- Tireurs (phase 16) : une bande tirée avant les marcheurs (`SPAWN.shooterShare`, 4 → 18 %), plafonnée à 24 à l'écran ; leurs tirs ne doivent jamais faire plus de 30 % des morts d'un profil (CLI, « cause mort »). Le terrain les contre : les tirs droits s'arrêtent sur les obstacles.
- Chaque type a une **silhouette** (forme), une **couleur**, un **son d'approche**, une **vitesse** reconnaissables en 0,2 s.
- Séparation entre ennemis par grille spatiale (cellule 2,5 u), poussée `3.2·(rr−d)/rr`. Pas de pathfinding : steering direct + glissement le long des obstacles.

## 7. Boss : scripts courts
Un boss = 2 attaques télégraphiées + 1 phase à 50 % PV. Durée cible 45–90 s. Récompense : aimant global + soin complet + coffre de boss (deux objets passifs à choisir, phase 17). PV ∝ `hpScale(t) · (1 + 0.8·bossIndex)`.

Phase 43 (grand rééquilibrage) :
- **Trois attaques par boss.** Gardien : charge (finie par les Éclats depuis la phase 45), onde à sauter, double onde en phase 2. Essaim-mère : ponte (avec des Volants en phase 2), Salve en éventail. Colosse : cercles, croix en phase 2, onde de choc si le joueur est collé à lui.
- **Une attaque nouvelle réutilise un danger existant** (tir Zone, Ring ou Spit du pool) : déjà dessiné, sonorisé, esquivé par le bot. Un télégraphe qui n'est pas un tir ne se voit pas : le rendu ne dessine que les tirs.
- **Rage** (`BOSS.enrage`) : boss du totem et du monde infini seulement, après 90 s. Les boss de survie sont faits pour durer (≈ 110 s contre un kit à deux armes) : pas de rage pour eux.
- **PV par monde** (`BOSS.hpMul`), croissants : le début de partie ne doit pas se durcir. Les kits à plusieurs armes souffrent le plus des PV de boss (dégâts dilués) ; le kit concentré sur une arme, presque pas.
- **Le bot doit savoir esquiver ce qu'un joueur esquive** : avant de régler une attaque, vérifier que le bot la lit (il restait planté dans un éventail de crachats et au centre de la croix : la sim surestimait la difficulté de 10 points de victoire).
- **Une attaque vise le joueur** (phase 45, retour de Jimmy) : le Sillage posait ses cercles derrière la charge du Gardien, là où le joueur n'est jamais. Retiré. Avant d'ajouter une attaque, se demander où est le joueur quand elle tombe.
- **Traque** (`BOSS.hunt`) : salve de cercles sous les pieds du joueur, un sur deux en avance sur sa vitesse, commune aux trois boss. Elle force à changer de direction ; un cercle seul sous les pieds s'esquive en marchant tout droit. Télégraphe ≥ 0,7 s. Elle coûte surtout par l'esquive, pas par le coup : avec des cercles inoffensifs, le bot perd presque autant (il fuit, la horde le prend). Les boss de survie, qui arrivent à 3:00 face à un kit faible et que le joueur ne choisit pas d'affronter, ne l'ont pas (`BOSS.huntSurvival` = 0) : la salve entière y fermait le monde 1 aux personnages fragiles. La difficulté ajoutée va là où le joueur décide de se battre (le totem). Mesurer une attaque de boss sur un personnage fragile et un personnage de mêlée, pas seulement sur l'Éclaireuse : elle seule ne montrait que −2 points de victoire. Et compter le bruit : à 150–200 parties, deux graines du même réglage s'écartent de 5 à 10 points (monde 2 atteint, kit complet : 64 à 79 %) ; un écart plus petit entre deux réglages ne prouve rien.
- **Monde infini** : un boss tué rend `ENDLESS.healFrac` des PV, un seul coffre par vague (un objet).

## 8. Méta-progression (phase 4, refondue en phases 8, 10 et 17)
- Or : 1 par kill ×`goldMul`, ×3 élite, ×20 boss, bonus de fin = secondes survécues / 10.
- Emplacements (phase 10) : `SLOTS` dans `balance.ts`, débloqués dans l'ordre par un succès **et** de l'or (300 → 12 000, ≈ 1,5–2 runs d'or au moment où le succès tombe), communs à tous les personnages ; profil nu de la sim = départ (1 arme, 2 améliorations).
- **Pas de stats permanentes** (phase 17, demande de Jimmy) : la boutique par personnage de la phase 8 est retirée, son or rendu (`legacyShopSpent` dans `src/meta/save.ts`). La puissance se construit pendant le run.
- **Objets passifs** (`ITEM` dans `balance.ts`, PLAN §3.6) : une règle de jeu chacun, uniques, 6 au plus ; coffres (1 parmi 3) et marchand. Règle de design : un objet change une décision (où se placer, quand sauter, combien dépenser), jamais un « +3 % » ; aucun objet ne doit valoir plus de 2× l'objet moyen en survie (`npm run sim -- --no-item <clé>` pour l'ablation).
- **Marchand** (`MERCHANT`) : quatre visites (2:30, 6:30, 10:30, 14:30), prix par rareté +25 % par visite, payés avec l'or **de la partie** : chaque achat retarde un emplacement ou un personnage. C'est le dilemme qui remplace la boutique.
- **Synergies** (`SYNERGIES`, `SYN`) : une paire tome + arme, active à 3 cartes du tome ; la carte qui en complète une est marquée « Synergie ». Le joueur moyen doit en activer au moins une dans la moitié des runs complets. Leçon de la phase 17 : les lignes d'arme se cumulent en multiplicatif, donc **concentrer** bat **diversifier** ; et les kills plafonnent au spawn (≈ 1 500 à 10 min quelle que soit la build), la survie se joue sur la défense et les boss. Sans boutique, seules les synergies (effets francs + PV max et armure croissants avec leur rang) donnent l'avantage au kit complet. Le profil nu est très sensible aux dégâts de base (×0,95 → ×1,0 : 5:43 → 11:21 avec la courbe d'XP de la phase 17).
- La survie est très sensible à la puissance (en phase 8, hp +40 / dégâts ×1,2 / recharge ×0,88 faisaient passer de 5 à 16 min) : un effet d'objet ou de synergie se règle par petits pas et par la CLI.
- Succès visibles avec barre : chaque run doit faire avancer au moins 2 succès (sinon ajuster les seuils).
- Personnages : 3 au départ dont 2 à débloquer ; stats de départ **différentes mais pas meilleures**.
- Défi quotidien : seed = `hash(date UTC)`, même tirage de cartes pour tous ; classement local des 10 meilleurs temps.

- **Rythme et exploration** (phase 18) : la carte doit toujours offrir un but proche (coffre de carte payant, sanctuaire, signalés par une colonne de lumière). Le prix d'un coffre de carte suit l'or gagné (×(1 + t/250)) et monte à chaque ouverture : l'or a un usage pendant toute la partie, sans que le kit complet ouvre tout sans y penser. Avec 6 objets, un coffre donne un bonus de sanctuaire (aucun cul-de-sac). Avant chaque boss : annonce 15 s avant et spawn à 60 % les 10 dernières secondes (tension → respiration → pic).
- **Difficulté lisse** : la CLI mesure la plus forte chute des vivants en une minute ; une falaise (≥ 25 points) fait quitter. Les rampes de densité commencent en pente douce (terme `t − 480` /360 plutôt qu'un seuil sec à 10:00).

## 8 bis. Bornes de puissance (phase 43)
Les lignes d'arme en pourcentage se multiplient, les monstres montent en ligne droite : sans borne, une bonne build finit toujours par dépasser le jeu (mesuré : le kit à une arme tenait 7:39 en médiane en monde infini, 17:51 pour une partie sur dix).
- **Niveau 40 au plus** pour une arme ou un tome (`LEVEL_MAX`), comme Megabonk. Le kit concentré l'atteint à la fin du monde 3 ; ensuite seuls les autres emplacements progressent : les emplacements débloqués comptent en fin de partie.
- **XP** : terme tardif à partir du niveau 30 (`XP.late`). Sans effet mesurable sur les victoires ; il espace les cartes en monde infini.
- **Objets** : pas de plafond au total (comme Megabonk), mais 5 / 3 / 2 exemplaires au plus par objet commun / rare / épique (`ITEM.maxCopies`), deux exemplaires pleins puis moitié.
- **Marchand** : relance 60 or, ×2 par relance de la visite, +35 % par visite ; prix +35 % par visite, +25 % par objet porté ; deux passages seulement en monde infini.
- **Monde infini** : le temps de difficulté avance à 40 % de sa vitesse (`ENDLESS.diffRate`). À pleine vitesse, avec le plafond, la horde tuait en 3 min quelle que soit la build.
- Leçon : régler un levier à la fois (`npm run sim -- --set BOSS.hpMul.0=1,XP.late=0`). Sur le kit à deux armes, les PV des boss, les nouvelles attaques et l'économie pesaient chacun 4 à 5 points de victoire ; le plafond de niveau et l'XP, zéro.

## 9. Cibles d'équilibrage mesurées par simulation
Deux profils (phase 17), `npm run sim -- --runs 200 --bot average --profile naked|maxed` (`tools/targets.ts`) :
| Métrique | Nu (`--profile naked`) | Maxé (`--profile maxed`) |
|---|---|---|
| Médiane de survie | 4–6 min (1 arme, 2 tomes) | 10–13 min (4/4) ; ≥ nu + 3 min |
| Runs atteignant le Faucheur | ≤ 8 % | 1–12 % |
| Runs morts avant 3 min | ≤ 20 % | < 10 % |
| Runs qui passent 3 min (arme n°2 accessible) | ≥ 40 % | — |
| Or gardé médian par run (après le marchand) | ≥ 0,5 emplacement n°2 (150 or) | — |
| Runs avec au moins une synergie | — | ≥ 50 % |
| Plus forte chute des vivants en 1 min | ≤ 22 points | ≤ 22 points |
| Coffres de carte ouverts par run | ≥ 1 | ≥ 3 |
| Or dépensé en partie / or gagné | — | ≥ 25 % |
| Taux de pick par arme | — | 8–35 % |
| Kills à 10 min (médiane) | — | 900–1600 |
| Variance de kills inter-builds | — | < 3× médiane |
| Niveau à 10 min (médiane) | — | 32–42 (phase 17 : toutes les cartes viennent des niveaux) |
| Arme principale à 10 min | — | niveau 8–30 |

Phase 43 : victoire ≤ 30 % (nu) et 5–28 % (maxé), morts en prolongation ≤ 25 % (maxé). Avec `--endless` (parties gagnées qui continuent, `ENDLESS_TARGETS`) : temps tenu p50 2:30–6 min, p90 ≤ 12 min, 6 vagues passées ≤ 5 %, boss du totem en vie 35–75 s en médiane. Un joueur va environ deux fois plus loin que le bot.

Les neuf personnages restent à ± 3 min de l'Éclaireuse dans chaque profil. `--no-item phenix,talisman` retire des objets des tirages (ablation) ; la CLI imprime aussi objets par run, part de chaque objet, or dépensé au marchand et part de chaque synergie.

Un écart = on ajuste `balance.ts`, on relance, on documente l'avant/après dans la PR. Pas d'ajustement « au ressenti » sans chiffre.

## 10. Anti-patterns à refuser
- Un choix de niveau avec 3 stats passives → viole la garantie.
- Une arme qui gagne sur toutes les autres en sim (> 35 % pick) → la rendre situationnelle, pas la nerfer à l'aveugle.
- Du contenu V2 qui se glisse (2e carte, coop, skins) → non.
- Des constantes en dur hors `balance.ts` → refus en revue.
