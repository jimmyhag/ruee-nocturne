# Interface « Nocturne » — toute l'interface du jeu, ajouts des lots compris

**Statut : 🟢 Implémenté**

Session du 17 novembre 2026, avec Jimmy. Jimmy a envoyé deux maquettes : un « kit UI »
cartoon (boutons à contour encre, Lilita One), puis la direction **« Nocturne »**
(canvas « Swarmageddon — Nocturne »), qu'il a retenue : « c'est plus épuré et tout, je veux
ça, et adapte vraiment toute l'interface, dans le jeu entièrement ». Sparring mené **en
délégation** (Jimmy : tout réaliser sans redemander de confirmation) : chaque question est
tranchée par la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir
sur n'importe laquelle.

## Contexte

La maquette est versionnée dans `docs/design/menus/` : un fichier `.dc.html` par écran
(source exacte : positions, couleurs, tailles, icônes SVG en ligne, textes), `README.md`
(écrans et table des images) ; les images d'origine sont dans `assets/ui/`. Les `.dc.html`
ne s'exécutent pas hors de l'éditeur : on les lit, on ne les copie pas (styles en ligne,
positions absolues à 390 × 844).

Le kit « Nocturne » (`Kit-UI.dc.html`) : **nuit** `#0A0F24` (fond), **lune** `#F3ECDD`
(texte, bouton plein), **lanterne** `#F5B94A` (progression, actif), **nuée** `#FF5A6E`
(alerte, pastille) ; texte secondaire lune à 70 %, discret à 55 %, filets à 16 %.
**Barlow Condensed** 700 (titres en capitales espacées), 300 (grands chiffres), 600
espacé 0,2 em (libellés) ; **Barlow** 500 / 600 (texte), jamais sous 10 px. **Un seul
bouton plein par écran** (lune sur nuit, rayon 28 px, halo lanterne) ; action
secondaire : texte lanterne en capitales + flèche ; le reste : lien souligné d'un filet.
Cibles tactiles de 44 px sans cadre. Progression : anneau ou filet de 2 px lanterne.
Pastille nuée : du nouveau. Verrouillé : cadenas et texte atténué (opacité 0,38). Icônes
au trait de 1,7 px, sans fond ; l'onglet courant passe en lanterne. Listes : filets de
1 px, **aucune carte, aucun contour**.

Ce qui existe : l'accueil (`#menu` dans `index.html`, `src/main.ts`, `src/ui/meta-ui.ts`)
avec la scène 3D en direct derrière (`renderIdle`) et une grille de sept boutons
(`#menuBar`) ; les écrans intérieurs en feuilles (`.sheet`) : `#characters`, `#shop`,
`#achievements`, `#library`, `#board`, `#daily`, `#notes`, `#account`, `#settings`,
`#help`, `#consent` (lot L1) ; en partie : `#hud` (`src/ui/hud.ts`), minicarte
(`src/ui/minimap.ts`), commandes tactiles (`#touch`), `#levelup`, `#merchant`, `#pause`
(`src/ui/stats.ts`), `#map`, `#victory`, `#over`, `#banner`, `#update`, `#nogl`. Polices
auto-hébergées aujourd'hui : Lilita One et Rubik (`public/fonts/`). Palette nuit bleue
(phase 14) dans `:root` et `src/render/palette.ts`.

À ne pas casser : la parité clavier / tactile (règle 4), la règle 8 (aucune requête sans
compte ni accord), **zéro allocation par image dans le HUD** (règle 1 : caches, aucune
chaîne recréée si la valeur n'a pas changé), le score Lighthouse de la CI, les budgets de
PLAN.md §4.3, l'i18n (FR et EN), la lisibilité en partie (le HUD se lit d'un coup d'œil
au milieu de 400 ennemis, au soleil sur un téléphone), et la progression des joueurs
(rien n'est retiré).

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Quelle maquette | « Nocturne » (`docs/design/menus/`) ; la maquette cartoon n'est pas retenue | Choix de Jimmy |
| 2 | Périmètre | **Toute l'interface** : accueil (trois états), les dix écrans intérieurs, l'aide, la demande d'accord (L1) **et tout l'écran de jeu** : HUD (vie, XP, chrono, or, kills, difficulté, intensité, objets, bonus, puces d'objectif), barre de boss, bannières, minicarte et grande carte, commandes tactiles, cartes de niveau, coffre, marchand, pause et fiche de stats, victoire, fin de partie, bandeau de mise à jour, écran sans WebGL | « Adapte vraiment toute l'interface, dans le jeu entièrement » |
| 3 | Kit | Les jetons du kit deviennent des variables CSS (`--night`, `--moon`, `--lantern`, `--swarm`, `--moon-70`, `--moon-55`, `--rule`) et des classes réutilisables dans `index.html` (bouton plein, action secondaire, lien filet, anneau, filet de progression, interrupteur, onglets soulignés, ligne de liste, libellé espacé, pastille, verrou). Les composants de la phase 14 (cartes à contour, puces pleines, boutons dorés) disparaissent | Un seul système, partout |
| 4 | Polices | Barlow (400, 500, 600) et Barlow Condensed (300, 500, 600, 700), licence OFL, **auto-hébergées** en WoFF2 (sous-ensemble latin + latin étendu) dans `public/fonts/`, précache du service worker ; Lilita One et Rubik retirées si plus rien ne s'en sert. `CREDITS.md` mis à jour | Pas de requête à Google Fonts (règle 8 et hors ligne) |
| 5 | Navigation | Barre d'onglets du bas de la maquette (Héros, Emplacements, Succès, Bibliothèque, Classement ; icônes au trait, onglet courant en lanterne) sur l'accueil et ces cinq écrans. **Compte** : puce de profil en haut à gauche (avatar, pseudo ou « Invité », record). **Réglages** : icône de curseurs en haut à droite. Écrans intérieurs : flèche retour (44 px) puis grand titre en capitales et sa valeur à droite, comme la maquette | La maquette |
| 6 | Fond et héros de l'accueil | Plus de scène 3D en direct au menu : fond illustré (nuit ; crépuscule avec une partie à reprendre), yeux rouges qui clignent et lucioles en CSS, portrait du héros choisi. Écrans intérieurs : même fond flouté sous un voile. La scène 3D se charge comme aujourd'hui (init différée) mais ne rend rien tant qu'on reste au menu | La maquette ; moins de GPU au menu, premier affichage plus rapide |
| 7 | Images | Portraits (414 × 717), avatars (192), fonds, logo et icônes d'armes de la maquette, convertis en WebP dans `public/ui/` par `npm run ui-images` (portrait ≤ 60 ko, avatar ≤ 15 ko, fond ≤ 120 ko ; total ≤ 900 ko), précache du service worker. Sources dans `assets/ui/`. Les portraits montrent la tenue classique | Poids maîtrisé ; règle « sources dans `assets/` » |
| 8 | Carrousel de héros | Flèches au trait autour du portrait, nom en capitales, « arme · sort », points de pagination (le courant en lanterne, allongé). Héros verrouillé : portrait assombri, condition sous le nom, « JOUER » indisponible. Clavier : ← → changent de héros, Entrée lance | La maquette ; parité clavier |
| 9 | Prochain objectif | Sous le carrousel : nom du succès le plus proche qui débloque quelque chose, progression en lanterne à droite, filet de 2 px, flèche et récompense ; toucher ouvre Succès | La maquette |
| 10 | Première ouverture (lot L2) | Tant que `Meta.reveal` vaut 0 : Emplacements, Bibliothèque et Classement atténués (opacité 0,38, `aria-disabled`) ; toucher : bulle « Se débloque après ta première partie » ; l'objectif montre « Première nuit — Survis 3 minutes ». Ouverts dès `reveal` ≥ 1. Un joueur existant (`reveal` = 4 par la migration de L2) voit tout ouvert | Maquette « Première ouverture » ; rien n'est retiré aux joueurs existants |
| 11 | Partie à reprendre | Fond crépuscule, bouton plein « REPRENDRE » avec « Monde 2 · 7:10 », « Nouvelle partie » en action secondaire (avec la confirmation d'abandon actuelle) | La maquette ; garde la sécurité de la phase 49 |
| 12 | HUD | Mêmes informations et même emplacement qu'aujourd'hui (rien ne disparaît, rien ne bouge de côté), dessinés avec le kit : chiffres en Barlow Condensed 300 / 600, libellés espacés, barres de vie et d'XP en filets épais (vie : lune, perte en nuée ; XP : lanterne), aucune boîte pleine derrière les compteurs, une ombre portée douce pour la lisibilité sur le décor. Mises à jour du texte inchangées dans leur principe (caches, zéro allocation par image) | « Dans le jeu entièrement », sans perdre la lecture rapide ni la perf |
| 13 | Commandes tactiles | Joystick et boutons SAUT / GLISSE / SORT en anneaux au trait lune (1,7 à 2 px), remplissage léger quand appuyés, recharge du sort en anneau lanterne. Tailles et positions inchangées (réglage Gaucher et taille du HUD gardés) | Le kit (anneaux, trait) ; la prise en main ne change pas |
| 14 | Cartes de niveau, coffre, marchand | Plus de cartes à contour : une liste de choix séparés par des filets, nom en capitales, lignes « actuel → nouveau », rareté marquée par une pastille et un libellé (commune : lune 70 %, rare : bleu `#7FB4FF`, épique : lanterne), synergie en lanterne. Le choix au clavier (1–4, flèches) et au doigt reste le même | Le kit : « aucune carte, aucun contour » |
| 15 | Pause, victoire, fin de partie | Grand titre en capitales, chiffres en Condensed 300, un bouton plein (Reprendre / Continuer / Rejouer), le reste en actions secondaires et liens ; la fiche de stats en lignes à filets (groupes en libellés espacés) | Le kit |
| 16 | Bannières | Texte en capitales espacées, filets fins de part et d'autre, sans fond ; couleur selon le sens (lanterne : récompense, nuée : danger, lune : information) | Le kit ; la bannière « Nouveau ! » du lot L2 suit cette règle |
| 17 | Ajouts des lots | **L1** : demande d'accord en écran du kit (titre, trois lignes numérotées comme l'écran Compte, bouton plein « Oui, j'aide », lien « Non merci ») ; l'interrupteur de la mesure dans Réglages, groupe « VIE PRIVÉE ». **L2** : décision 10 et bannière « Nouveau ! ». **L3, L4, L5** : leurs écrans utilisent ce kit (défi du jour avec série et missions, carte de résultat, onglet « AMIS » du classement, paliers d'arme) | « Adapte aussi pour les ajouts que tu as faits » |
| 18 | PC | La colonne des menus garde 390 à 460 px de large, centrée ; le fond couvre l'écran. Le HUD garde sa disposition PC actuelle | Simple ; fidèle à la maquette |
| 19 | Animations | Celles de la maquette (`breathe`, `blink`, `fly`, `soft`), en CSS seulement, coupées par `prefers-reduced-motion` **et** par le réglage « Effets réduits » | Accessibilité |
| 20 | Textes | Ceux de la maquette, en FR et EN (`src/i18n/`) ; les valeurs d'exemple de la maquette (570 or, 6:09, « Jimmy ») sont remplacées par les vraies | La maquette est un exemple rempli |
| 21 | Contraste | Texte lune à 70 % sur nuit ≥ 4,5:1 ; sur le HUD, ombre portée suffisante pour ≥ 4,5:1 sur le décor le plus clair des trois mondes (vérifié sur les captures) | Lisibilité au soleil |

## Scénarios

# language: fr
Fonctionnalité: Interface Nocturne

  Scénario: L'accueil suit la maquette Nocturne
    Soit un joueur qui a déjà joué
    Quand il ouvre le jeu
    Alors il voit la puce de profil, l'or, l'icône des réglages, le logo, le portrait du héros choisi, le prochain objectif, le bouton plein « JOUER » et la barre d'onglets à cinq entrées

  Scénario: La barre d'onglets mène aux cinq écrans
    Soit l'accueil affiché
    Quand le joueur touche chaque onglet tour à tour
    Alors l'écran correspondant s'ouvre avec sa flèche retour, son grand titre et l'onglet courant en lanterne
    Et la flèche retour ramène à l'accueil

  Scénario: Le carrousel change de héros au doigt et au clavier
    Soit l'accueil affiché
    Quand le joueur touche « Héros suivant », puis presse la flèche gauche
    Alors le portrait, le nom et les points de pagination changent puis reviennent au premier héros
    Et un héros verrouillé affiche sa condition et « JOUER » est indisponible

  Scénario: Première ouverture, trois onglets atténués
    Soit un nouveau joueur sans partie finie
    Quand il ouvre le jeu
    Alors Emplacements, Bibliothèque et Classement sont atténués et inactifs
    Et les toucher affiche « Se débloque après ta première partie »
    Et l'objectif montre « Première nuit »

  Scénario: Un joueur existant ne voit aucun onglet verrouillé
    Soit un joueur dont la sauvegarde d'avant la mise à jour compte des parties
    Quand il ouvre le jeu
    Alors aucun onglet n'est atténué et sa progression est intacte

  Scénario: Une partie à reprendre change l'accueil
    Soit une partie interrompue en monde 2 à 7:10
    Quand le joueur ouvre le jeu
    Alors le fond passe au crépuscule et le bouton plein dit « REPRENDRE » avec « Monde 2 · 7:10 »
    Et « Nouvelle partie » demande confirmation avant d'abandonner

  Scénario: Compte et réglages depuis le haut de l'écran
    Soit l'accueil affiché
    Quand le joueur touche la puce de profil
    Alors l'écran Compte s'ouvre
    Quand il revient et touche l'icône des réglages
    Alors l'écran Réglages s'ouvre avec le groupe « Vie privée »

  Scénario: Le HUD de partie suit le kit sans rien perdre
    Soit une partie lancée
    Alors la vie, l'XP, le chrono, l'or, les kills, la difficulté et l'intensité sont affichés aux mêmes places avec les polices et couleurs du kit
    Et le budget d'appels de dessin et le bench restent dans leurs limites

  Scénario: Les cartes de niveau sont une liste à filets
    Soit une montée de niveau
    Alors les choix s'affichent en lignes séparées par des filets, sans carte ni contour, avec leur rareté
    Et le joueur choisit au clavier comme au doigt

  Scénario: Les écrans de fin suivent le kit
    Soit une partie perdue
    Alors l'écran de fin montre le grand titre, les chiffres de la partie et un seul bouton plein « REJOUER »

  Scénario: La demande d'accord suit le kit
    Soit un joueur qui vient de finir sa première partie
    Quand il revient au menu
    Alors l'écran « Aider à améliorer le jeu ? » s'affiche avec « Oui, j'aide » en bouton plein et « Non merci » en lien
    Et le clavier et le doigt y répondent de la même façon

  Scénario: Effets réduits coupe les animations du menu
    Soit le réglage « Effets réduits »
    Quand le joueur ouvre l'accueil
    Alors le portrait, les yeux et les lucioles ne bougent pas

  Scénario: Le menu ne rend plus la scène 3D
    Soit l'accueil affiché
    Alors aucun rendu 3D n'est fait tant que le joueur reste au menu
    Et la partie démarre comme avant quand il touche « JOUER »

  Scénario: Aucune police chargée depuis un autre site
    Soit le jeu ouvert sans compte
    Alors les polices Barlow viennent du site du jeu et aucune requête ne part vers un autre domaine

## UI & Layout Contract

- **Référence visuelle** : `docs/design/menus/` (un `.dc.html` par écran, `README.md`,
  `Kit-UI.dc.html` pour les règles). Écart toléré : quelques pixels ; couleurs, polices,
  graisses, espacements de lettres, filets et disposition sont ceux de la maquette. Les
  écrans de jeu, absents de la maquette, appliquent les règles du kit (décisions 12 à 16).
- **Arbre de composants** :

  | Composant | Couche | Statut |
  | --------- | ------ | ------ |
  | Jetons et classes du kit | `index.html` (`<style>`) | refait |
  | Polices Barlow | `public/fonts/`, `@font-face`, précache | nouveau (Lilita One et Rubik retirées) |
  | Accueil (profil, or, réglages, logo, carrousel, objectif, JOUER / REPRENDRE) | `index.html` `#menu`, `src/main.ts`, `src/ui/meta-ui.ts` | refait |
  | Barre d'onglets | `index.html`, `src/ui/meta-ui.ts` | nouveau (remplace `#menuBar`) |
  | Écrans intérieurs (dix) et aide | feuilles existantes | refaits selon la maquette |
  | Demande d'accord (L1) | `#consent` | refaite |
  | HUD, barre de boss, bannières | `#hud`, `src/ui/hud.ts`, `#banner` | restylés, mêmes places |
  | Minicarte et grande carte | `src/ui/minimap.ts`, `#map` | couleurs et traits du kit |
  | Commandes tactiles | `#touch` | anneaux au trait |
  | Cartes de niveau, coffre, marchand | `#levelup`, `#merchant`, `src/ui/cards.ts` | liste à filets |
  | Pause, fiche de stats, victoire, fin | `#pause`, `src/ui/stats.ts`, `#victory`, `#over` | refaits |
  | Images | `assets/ui/` → `public/ui/*.webp`, script `npm run ui-images` | nouveau |

- **États** : accueil nominal, première ouverture, partie à reprendre ; héros verrouillé ;
  onglet verrouillé ; sans compte (« Invité ») ; hors ligne (classement : message
  existant) ; effets réduits.
- **Focus** : ordre de tabulation haut → bas ; anneau de focus lanterne de 2 px ; Échap
  ferme un écran intérieur ; le focus revient sur l'élément qui l'a ouvert.
- **Libellés** : ceux de la maquette (FR) et leur traduction anglaise ; nouveaux :
  « Se débloque après ta première partie » / “Unlocks after your first run”, « Vie
  privée » / “Privacy”, « Oui, j'aide » / “Yes, I'll help”, « Non merci » / “No thanks”.

## Livraison

Version **1.59.0** (L3, L4, L5 : 1.60.0, 1.61.0, 1.62.0). `CHANGELOG.md` écrit pour les
joueurs (« Nouvelle interface ») ; captures avant / après de chaque écran (PC et mobile),
lues, dans `docs/GATES.md` ; Lighthouse et poids des images et polices ; `perf-reviewer`
(HUD et boucle du menu) ; e2e mis à jour dans le même commit que les `id` qu'ils ciblent.

## Hors périmètre

- Une disposition du HUD différente (seul son dessin change).
- Un portrait par tenue ; une mise en page PC distincte.
- De nouvelles fonctions : seules la jauge du prochain objectif et l'atténuation des
  onglets à la première ouverture s'ajoutent, toutes deux sur la maquette.

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Style | Phase 14 puis 44 C : boutons pleins dorés, cartes à contour, Lilita One | Nocturne : un bouton plein par écran, filets, Barlow |
| Navigation du menu | Grille de 7 boutons | Barre d'onglets (5) + profil + réglages |
| Fond du menu | Scène 3D en direct | Fond illustré, portrait, animations CSS |
| HUD | Boîtes et puces pleines | Chiffres et filets, ombre portée |

## Reste à faire

Rien. Décision 17 : **L3, L4 et L5 faits**. L4 (fusion de `lot/l4-partage`) : « Partager » en action secondaire lanterne juste sous les chiffres de l'écran de fin (visible sans défiler sur iPhone 13 et en 1280 × 720), « Copié ! » à côté, « Défi battu ! » / « Raté de … » en libellé lanterne ; feuille « Défi de {pseudo} » comme la feuille du défi (portrait, jour en libellé, règles en lignes à filets, bouton plein « Relever le défi ») ; « À battre » sous le chrono en libellé lanterne ; onglet « AMIS » dans les onglets du Classement (titre « Défi du jour · Amis » à la place de la période, lignes et podium de Classement.dc.html, initiale du pseudo dans le rond, « Retirer » en lien de 44 px). L5 : filet de palier au-dessus de l'icône d'arme de la barre d'équipement (fusion de `main`). L3 (fusion de `lot/l3-defi-serie`) : flamme et série sur le rail « Défi du jour · 5 min », note du joker sous l'accroche, missions du jour en lignes à filets (repliées sur téléphone, en colonne à droite sur PC), lignes Série, Joker et Récompense dans la feuille du défi, récompenses de l'écran de fin en lignes lanterne, HUD « Défi du jour ». Le reste de la spec est implémenté (commit 6dacd5b et sa suite).
