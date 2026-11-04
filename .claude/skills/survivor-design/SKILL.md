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

Le texte d'une carte dit **chaque ligne concrètement** (« +7 % dégâts », « +1 projectile ») ; une nouvelle arme ou un nouveau tome montre d'abord sa règle. La montée est **longue** : 100 améliorations par arme ou tome, jamais atteintes en 20 min (≈ 35 cartes par run) ; le niveau 5 d'avant (≈ ×3 de DPS) se retrouve vers 10–12 améliorations.

## 4. Armes : grammaire de design
Chaque arme répond à : **portée** (contact / courte / longue), **ciblage** (auto / direction / zone / aléatoire), **rythme** (continu / salve / lent et fort). Deux armes ne doivent jamais partager les trois.

| Arme | Portée | Ciblage | Rythme | Fantasme | Lignes (step) |
|---|---|---|---|---|---|
| Orbe | longue | auto plus proche | salve | sniper | dégâts +7 %, recharge −4 %, +1 projectile (max +5), vitesse +8 %, +1 perforation (max +3) |
| Halo | contact | zone autour | continu | tank | dégâts +7 %, rayon +5 %, période −4 % |
| Lames | courte | orbite | continu | derviche | dégâts +7 %, +1 lame (max +8), rayon +4 %, rotation +6 % |
| Foudre | longue | aléatoire + chaîne | lent fort | mage | dégâts +7 %, recharge −4 %, +1 cible (max +10) |
| Boomerang | longue | direction regard | salve | contrôle de ligne | dégâts +7 %, recharge −4 %, portée +6 %, +1 boomerang (max +3), vitesse +6 % |
| Mines | contact | là où je passe | pose | piégeur / kiting | dégâts +7 %, recharge −4 %, rayon +5 %, +1 mine (max +12), chaîne (unique) |

Les lignes en % s'additionnent sur la base (`base × (1 + step · n)`), les lignes entières s'ajoutent ; les baisses en % sont plafonnées (−60 % de recharge au plus). Une ligne rare apporte un **changement qualitatif** (un projectile de plus se voit), les lignes en % font grimper lentement.

## 5. Tomes (phase 12, à la place des passifs et des évolutions)
Huit tomes, 4 emplacements, chaque carte tire 1 à 3 lignes dans sa famille, effets additifs sur la base du joueur :
- **Dégâts** : dégâts +4 %, dégâts aux élites et boss +8 %, recul +10 %.
- **Cadence** : recharge −3 % (plancher 25 %), durée des projectiles +6 %.
- **Projectiles** : +1 projectile pour toutes les armes (rare, max 3), taille +6 %, vitesse des projectiles +6 %.
- **Vitalité** : +8 PV max, régénération +0,25/s, dégâts subis −3 % (plafond −45 %).
- **Mouvement** : course +3 %, recharge du dash −6 % (plancher 40 %), invulnérabilité du dash +0,03 s.
- **Savoir** : XP +6 %, collecte +8 %.
- **Chance** : chance +0,5 (lignes rares, 4e carte, coffres), or des coffres +20 %.
- **Or** : or +8 %, +1 or par élite vaincue.
Plus d'évolutions (décision de Jimmy, 4 nov. 2026) : la récompense de run est une arme à 25+ améliorations (succès « Érudit ») et les cartes épiques (succès « Triple ligne »).

## 6. Ennemis : rôles, pas stats
Un ennemi existe pour poser une **question** au joueur :
- Spectre : « gères-tu la masse ? » — Dard : « peux-tu te retourner vite ? » — Brute : « as-tu du recul / du perçage ? » — Volant : « sautes-tu au bon moment ? » — Cracheur : « bouges-tu quand même ? » — Élite : « vas-tu chercher le coffre dans la masse ? »
- Chaque type a une **silhouette** (forme), une **couleur**, un **son d'approche**, une **vitesse** reconnaissables en 0,2 s.
- Séparation entre ennemis par grille spatiale (cellule 2,5 u), poussée `3.2·(rr−d)/rr`. Pas de pathfinding : steering direct + glissement le long des obstacles.

## 7. Boss : scripts courts
Un boss = 2 attaques télégraphiées + 1 phase à 50 % PV. Durée cible 45–90 s. Récompense : aimant global + soin complet + coffre 3–5 cartes. PV ∝ `hpScale(t) · (1 + 0.8·bossIndex)`.

## 8. Méta-progression (phase 4, refondue en phase 8)
- Or : 1 par kill ×`goldMul`, ×3 élite, ×20 boss, bonus de fin = secondes survécues / 10.
- Emplacements (phase 10) : `SLOTS` dans `balance.ts`, débloqués dans l'ordre par un succès **et** de l'or (300 → 12 000, ≈ 1,5–2 runs d'or au moment où le succès tombe), communs à tous les personnages ; profil nu de la sim = départ (1 arme, 2 améliorations).
- Boutique **par personnage** : 8 lignes, 8 paliers chacune (réanimation : 1), coût `200 · 1.3^palier` (200 → 1 255, ≈ 34 000 or par personnage). Un run « nu » (≈ 6 min, ≈ 600 or) paie **1 à 2 paliers** ; un personnage complet ≈ 30 runs.
- Le joueur nu est en dessous de la courbe (dégâts ×0,95) et le milieu de partie (7:00 → 15:00) est raide : la puissance achetée doit se traduire en **minutes**, pas en falaise. Les paliers sont petits (+3 PV, +2 % dégâts, −1 % recharge…) parce que la survie est très sensible à la puissance (en phase 8, hp +40 / dégâts ×1,2 / recharge ×0,88 faisaient passer de 5 à 16 min).
- Succès visibles avec barre : chaque run doit faire avancer au moins 2 succès (sinon ajuster les seuils).
- Personnages : 3 au départ dont 2 à débloquer ; stats de départ **différentes mais pas meilleures**.
- Défi quotidien : seed = `hash(date UTC)`, même tirage de cartes pour tous ; classement local des 10 meilleurs temps.

## 9. Cibles d'équilibrage mesurées par simulation
Deux profils (phase 8), `npm run sim -- --runs 200 --bot average --upgrades 0|max` (`tools/targets.ts`) :
| Métrique | Nu (`--upgrades 0`) | Maxé (`--upgrades max`) |
|---|---|---|
| Médiane de survie | 4–6 min (1 arme, 2 améliorations) | 13–16 min (4/4) |
| Runs atteignant le Faucheur | ≤ 3 % | 3–12 % |
| Runs morts avant 3 min | ≤ 20 % | < 10 % |
| Runs qui passent 3 min (arme n°2 accessible) | ≥ 40 % | — |
| Or médian par run | ≥ 0,75 premier palier | — |
| Taux de pick par arme | — | 8–35 % |
| Kills à 10 min (médiane) | — | 900–1600 |
| Variance de kills inter-builds | — | < 3× médiane |
| Niveau à 10 min (médiane) | — | 16–20 |

Les neuf personnages restent à ± 3 min de l'Éclaireuse dans chaque profil. `--upgrades hp=8,revive=0` isole une ligne.

Un écart = on ajuste `balance.ts`, on relance, on documente l'avant/après dans la PR. Pas d'ajustement « au ressenti » sans chiffre.

## 10. Anti-patterns à refuser
- Un choix de niveau avec 3 stats passives → viole la garantie.
- Une arme qui gagne sur toutes les autres en sim (> 35 % pick) → la rendre situationnelle, pas la nerfer à l'aveugle.
- Du contenu V2 qui se glisse (2e carte, coop, skins) → non.
- Des constantes en dur hors `balance.ts` → refus en revue.
