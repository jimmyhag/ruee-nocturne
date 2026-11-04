---
name: game-feel
description: Checklist et recettes de « juice » pour rendre chaque action satisfaisante — impacts, particules, caméra, son, chiffres. À lire avant toute tâche d'effets, de feedback ou de phase 2.
---

# Game feel — rendre chaque coup satisfaisant

Le joueur ne lit pas les stats, il **ressent** les dégâts. Chaque élément ci-dessous est un multiplicateur de satisfaction. La phase 2 n'est validée que lorsque la checklist finale est cochée à 100 %.

## 1. Les 4 feedbacks obligatoires par coup porté
Pour **chaque** `hit` émis par la sim :
1. **Flash** : l'ennemi devient blanc 80–100 ms (couleur d'instance).
2. **Recul** : impulsion opposée à la source, décroissance exponentielle (`k *= 0.004^dt`). Brute ×⅓, boss 0.
3. **Son** : variante aléatoire parmi 3–4 échantillons, hauteur ±8 %, volume selon dégâts.
4. **Chiffre** : monte de 1,8 u/s, scale 1,35 → 1 sur 100 ms, fondu les 250 dernières ms. Doré et plus gros au-dessus d'un seuil (critique / ≥ 40).

## 2. Hit-stop (le secret des jeux « lourds »)
- Sur un **kill** : la sim continue mais le **rendu** interpole à 0,15× pendant 40 ms (boss : 120 ms). Implémenter dans `main.ts` via un facteur `timeScale` appliqué à l'accumulateur de rendu, pas à la sim (déterminisme).
- Sur un coup au **joueur** : 60 ms à 0,3× + flash rouge CSS + shake 0,25.

## 3. Squash & stretch
- Joueur : saut = scale Y 1,08 à l'envol, 0,85 à l'atterrissage avec rebond (ressort amorti 120 ms). Tir = corps scale `(1+r, 1−0,8r, 1+r)` avec `r` de 0,14 → 0 en 140 ms.
- Ennemis : hop sinusoïdal constant (vivant), étirement vers la direction de déplacement 1,1×, flash + scale 1,18 au coup.
- Gemmes : apparition scale 0 → 1,3 → 1 (120 ms), rotation continue.

## 4. Particules (toutes en InstancedMesh, pool unique)
| Événement | Nombre | Vitesse | Couleur | Gravité |
|---|---|---|---|---|
| Hit projectile | 4–6 | 3–4 | couleur du projectile | oui |
| Kill normal | 6–8 | 4–6 | couleur ennemi | oui, rebond au sol 0,3 |
| Kill élite / boss | 40–60 | 6–10 | ennemi + or | oui |
| Pas / atterrissage | 5–6 | 1–2 | poussière | oui |
| Dash | 1 par frame | 0 | crème | non, fondu |
| Tir | 3 | 3 | couleur projectile | non |
| Montée de niveau | 30 en anneau | 5 | cyan | non, montée |

Durée 0,3–0,6 s, scale ∝ vie restante. Cap global 500 ; au-delà, on **remplace la plus ancienne**, on ne saute jamais un effet de kill.

## 5. Traînées
- Projectiles : 4 fantômes aux positions `t − j·28 ms`, scale décroissante, dégradé or → rouge, additif.
- Dash : 6 silhouettes du joueur en fondu (copie de géométrie fusionnée, matériau additif).
- Lames orbitales : ruban (`Line` à 12 points) ou 3 fantômes.

## 6. Caméra
- Shake : amplitude ∝ événement (hit joueur 0,25 ; élite 0,4 ; boss spawn/kill 0,6 ; évolution d'arme 0,5), bruit 2D, décroissance 2/s, **borné** et désactivable (réglage « réduction des effets »).
- Zoom-out progressif de 8 % de 0 à 15 min (le pouvoir se voit).
- Kick : recul de 0,3 u opposé à la cible sur les gros tirs (Nova, Orage).

## 7. Son — règles de mixage
- 3 bus : SFX (−6 dB), UI (−8 dB), musique (−12 dB), limiteur sur le master.
- **Pool de 24 voix**, priorité : joueur touché > level up > boss > kill > hit > ramassage. Les hits au-delà de 12/s sont fusionnés en un seul son plus fort.
- Ramassage : hauteur +1 demi-ton par gemme enchaînée (< 400 ms), reset après 14. C'est le son le plus addictif du genre, le soigner.
- Kill en rafale (≥ 5 en 1 s) : son de « combo » + bref accord.
- Niveau : arpège montant 2 notes, puis « whoosh » à la reprise.
- Musique adaptative : 3 couches (nappe, rythme, intensité) dont le gain suit `min(1, ennemis_visibles / 120)` et saute à 1 pendant un boss. Coupure brutale au Faucheur.

## 8. UI qui réagit
- Barre d'XP : remplissage amorti + éclat blanc qui balaie la barre au gain.
- Barre de PV : perte en rouge immédiat, « fantôme » clair qui rattrape en 400 ms (lisibilité de la quantité perdue).
- Compteur de kills : scale 1,2 → 1 à chaque incrément de dizaine.
- Cartes d'amélioration : entrée en cascade 60 ms, survol = élévation, sélection = flash + son distinct par rareté.
- Bannières (vague, boss, évolution) : grosse typo, 1,8 s, entrée en scale depuis 0,9.

## 9. Lisibilité (le juice ne doit jamais nuire à la lecture)
- Le joueur reste toujours identifiable : halo au sol, couleur unique (orange) qu'aucun ennemi n'utilise.
- Télégraphes avant dégâts : cercle rouge au sol 1 s (Colosse), ligne de visée (Cracheur), ombre (Volant), fissure rouge qui suit le joueur 0,8 s (éruption), anneau rouge fin qui grandit (onde du Gardien), couloir rouge au sol 0,6 s (charge de Brute élite).
- Un danger qui se passe en l'air doit laisser une fenêtre de saut lisible : avec un saut de 0,73 s on est à plus de 0,9 u entre 0,11 et 0,62 s après l'impulsion, donc le télégraphe dure ≥ 0,7 s et le coup tombe à sa fin, pas avant. Un danger à traverser en dash dure moins que l'invulnérabilité du dash (0,32 s) au point de croisement.
- Réglage « réduction des effets » : shake 0, particules ÷2, hit-stop off, flash CSS atténué. Respecte aussi `prefers-reduced-motion`.

## 10. Checklist de validation (à coller dans la PR de phase 2)
- [ ] Flash + recul + son + chiffre sur 100 % des armes (test : chaque arme seule, 30 s)
- [ ] Hit-stop sur kill et sur dégâts joueur, désactivable
- [ ] Squash & stretch joueur (saut, atterrissage, tir)
- [ ] Table de particules implémentée, cap respecté, 0 allocation
- [ ] Traînées projectiles + dash
- [ ] Shake borné, zoom progressif
- [ ] Pool audio 24 voix, combo de ramassage, musique 3 couches
- [ ] Barres XP/PV animées, bannières, cartes en cascade
- [ ] Mode « réduction des effets » complet
- [ ] 3 GIF Playwright : 1 kill d'élite, 1 montée de niveau, 1 boss
- [ ] Budget perf inchangé (chiffres avant/après)
