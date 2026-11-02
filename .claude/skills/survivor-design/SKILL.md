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
Chaque montée de niveau propose **3 cartes**, tirées ainsi :
1. Pool = armes non maxées (si < 4 armes : nouvelles armes incluses) + passifs non maxés (si < 4 passifs : nouveaux inclus).
2. Pondération : arme/passif **déjà possédé** ×1,6 (favorise la cohérence), composant d'une **évolution en cours** ×2,2, item jamais vu ×1,3 (découverte).
3. Garantie : au moins 1 carte d'arme si le joueur a < 2 armes ; jamais 3 passifs de stats pures.
4. Chance (passif Trèfle) : chaque point ajoute 6 % de proposer 4 cartes, et augmente la qualité des coffres.
5. Pool vide → soin complet ou +25 or.

Le texte d'une carte dit **ce que ça change concrètement** (« 2 tirs, 15 dégâts, transperce »), jamais « +1 niveau ».

## 4. Armes : grammaire de design
Chaque arme répond à : **portée** (contact / courte / longue), **ciblage** (auto / direction / zone / aléatoire), **rythme** (continu / salve / lent et fort). Deux armes ne doivent jamais partager les trois.

| Arme | Portée | Ciblage | Rythme | Fantasme |
|---|---|---|---|---|
| Orbe | longue | auto plus proche | salve | sniper |
| Halo | contact | zone autour | continu | tank |
| Lames | courte | orbite | continu | derviche |
| Foudre | longue | aléatoire + chaîne | lent fort | mage |
| Boomerang | longue | direction regard | salve | contrôle de ligne |
| Mines | contact | là où je passe | pose | piégeur / kiting |

Progression par niveau : une seule stat majeure change par niveau (lisibilité), le niveau 5 apporte un **changement qualitatif** (perçage, rebond, double orbite), pas juste des chiffres.

## 5. Évolutions
- Condition : arme niveau 5 + passif associé niveau ≥ 1 + **ouvrir un coffre**. Le coffre garantit l'évolution si la condition est remplie (pas de frustration).
- L'arme évoluée est **visuellement 3× plus grosse**, a son propre son, et déclenche bannière + shake 0,5.
- Puissance : ≈ ×2,5 par rapport au niveau 5. C'est voulu : c'est la récompense de run.

## 6. Ennemis : rôles, pas stats
Un ennemi existe pour poser une **question** au joueur :
- Spectre : « gères-tu la masse ? » — Dard : « peux-tu te retourner vite ? » — Brute : « as-tu du recul / du perçage ? » — Volant : « sautes-tu au bon moment ? » — Cracheur : « bouges-tu quand même ? » — Élite : « vas-tu chercher le coffre dans la masse ? »
- Chaque type a une **silhouette** (forme), une **couleur**, un **son d'approche**, une **vitesse** reconnaissables en 0,2 s.
- Séparation entre ennemis par grille spatiale (cellule 2,5 u), poussée `3.2·(rr−d)/rr`. Pas de pathfinding : steering direct + glissement le long des obstacles.

## 7. Boss : scripts courts
Un boss = 2 attaques télégraphiées + 1 phase à 50 % PV. Durée cible 45–90 s. Récompense : aimant global + soin complet + coffre 3–5 cartes. PV ∝ `hpScale(t) · (1 + 0.8·bossIndex)`.

## 8. Méta-progression (phase 4)
- Or : 1 par kill ×`goldMul`, ×3 élite, ×20 boss, bonus de fin = secondes survécues / 10.
- Boutique : 8 lignes, 5 paliers chacune, coût `base · 1.6^palier`. Un run moyen doit payer **1 palier** ; jamais plus de 3 runs pour le palier suivant au début.
- Succès visibles avec barre : chaque run doit faire avancer au moins 2 succès (sinon ajuster les seuils).
- Personnages : 3 au départ dont 2 à débloquer ; stats de départ **différentes mais pas meilleures**.
- Défi quotidien : seed = `hash(date UTC)`, même tirage de cartes pour tous ; classement local des 10 meilleurs temps.

## 9. Cibles d'équilibrage mesurées par simulation
Sur `npm run sim -- --runs 200 --bot average` :
| Métrique | Cible |
|---|---|
| Médiane de survie | 9–13 min |
| Runs atteignant le Faucheur | 8–15 % |
| Runs morts avant 3 min | < 10 % |
| Taux de pick par arme | 8–35 % |
| Kills à 10 min (médiane) | 900–1500 |
| Variance de kills inter-builds | < 3× médiane |
| Niveau à 10 min (médiane) | 16–20 |

Un écart = on ajuste `balance.ts`, on relance, on documente l'avant/après dans la PR. Pas d'ajustement « au ressenti » sans chiffre.

## 10. Anti-patterns à refuser
- Un choix de niveau avec 3 stats passives → viole la garantie.
- Une arme qui gagne sur toutes les autres en sim (> 35 % pick) → la rendre situationnelle, pas la nerfer à l'aveugle.
- Du contenu V2 qui se glisse (2e carte, coop, skins) → non.
- Des constantes en dur hors `balance.ts` → refus en revue.
