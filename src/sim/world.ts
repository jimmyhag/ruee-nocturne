import { BOON_KEYS, CAPS, CHARACTERS, CRIT, MAX_PASSIVES, MAX_WEAPONS, PLAYER, SPAWN, SPELL, ITEM_KEYS, SYNERGIES, ITEM, TOMES, TOME_KEYS, TRAIT, XP, WEAPON_LINES, LEVEL_MAX, TREE_CELL, WORLD_HALF, ZONES, HAZARDS, FLOW, MAP, DISCOVER, METEOR, It, RUN_REROLL, LAMES, POWER } from './balance';
import { buildMap, buildZones, cellKey, segDist } from './map';
import { FlowField } from './flow';
import { TERRAIN_N, buildTerrain, heightAt, settlePlaces, slopeMul } from './terrain';
import type { Kicker, Piste, Plateau, Ramp } from './terrain';
import type { Race } from './poi';
import { buildPOI } from './poi';
import type { MapChest, Shrine } from './poi';
import { makeMerchant } from './merchant';
import type { MerchantState } from './merchant';
import { WEAPONS, WEAPON_KEYS, applyTomeLine, lineIndex, refreshStats } from './weapons/defs';
import { SpatialGrid } from './grid';
import { Rng } from './rng';
import { Ev, Mode, ProjKind, ShotKind, Spell, Trait, HurtSrc, HitSrc } from './types';
import type {
  Card,
  Chest,
  Enemy,
  GameEvent,
  Gem,
  Input,
  Power,
  TomeKey,
  Player,
  Projectile,
  Shot,
  WeaponKey,
  WorldOptions,
} from './types';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

/** Obstacle long (phase 16) : segment épaissi. kind 0 = muret, 1 = tronc couché, 2 = clôture (phase 27) ; tous se sautent (h). */
export interface Wall {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  r: number;
  h: number;
  kind: number;
}

export class World {
  seed: number;
  rng: Rng;
  t = 0;
  mode: Mode = Mode.Play;
  kills = 0;
  gold = 0;
  pending = 0; // montées de niveau (ou cartes de coffre) en attente
  player: Player;

  enemies: Enemy[] = [];
  enemyCount = 0;
  projs: Projectile[] = [];
  projCount = 0;
  shots: Shot[] = [];
  shotCount = 0;
  gems: Gem[] = [];
  gemCount = 0;
  chests: Chest[] = [];
  chestCount = 0;
  /** phase 35 : bonus au sol, durées d'effet restantes (index Pw) et prochain bonus de carte (w.t) */
  powers: Power[] = [];
  powerCount = 0;
  readonly powerT = new Float64Array(POWER.weights.length);
  powerNext = POWER.mapFirst;
  powersDropped = 0;
  powersTaken = 0;

  events: GameEvent[] = [];
  eventCount = 0;

  grid = new SpatialGrid(CAPS.enemies);

  // spawner
  spawnAcc = 0;
  nextWave = SPAWN.wavePeriod;
  nextElite = SPAWN.eliteAfter;
  bossCount = 0;
  bossIndex = -1; // index de l'ennemi boss vivant, -1 sinon
  /**
   * Phase 37 : monde en cours (0 à STAGE.count − 1), son chrono (stageT), le temps de difficulté (diffT = stageT + offset
   * du monde, lu par le spawner) et la prolongation (overT, s après la fin du chrono). `t` reste le temps total.
   */
  stage = 0;
  stageT = 0;
  diffT = 0;
  overT = 0;
  startSeed = 0; // graine de carte du premier monde (celle des suivants en dérive)
  /** Totem du monde : 0 prêt, 1 boss appelé, 2 boss vaincu à temps (portail ouvert), 3 fermé (chrono écoulé). */
  totem = { x: 0, z: 0, charge: 0, state: 0 };
  portal = { open: false, charge: 0 };
  // phase 39 : monde infini (après la victoire, au choix du joueur)
  endless = false;
  endlessT = 0; // s passées dans le monde infini
  endlessDiff0 = 0; // phase 43 : diffT à l'entrée en monde infini (il avance ensuite à ENDLESS.diffRate)
  endlessWave = 0; // vagues de boss déjà sorties
  nextEndlessBoss = 0; // endlessT de la prochaine vague
  endlessAlive = 0; // boss du monde infini en vie (la barre passe au suivant)
  goldBonusT = 0; // temps déjà payé par le bonus d'or de fin (victoire puis mort en monde infini : une seule fois)
  stageWarned = false; // rappel « 1:00 » envoyé
  // phase 42 : boss de survie (STAGE.survival) ; le boss du totem est suivi par son id (stable au swap-remove du pool)
  survivalNext = 0; // indice du prochain boss de survie du monde
  survivalWarned = false; // préavis du prochain envoyé
  survivalAlive = 0; // boss de survie en vie (la barre passe au suivant)
  totemBossId = -1; // id de l'ennemi boss du totem, -1 sinon
  timeUp = false; // fin du chrono annoncée
  // multiplicateurs de prolongation, recalculés à chaque pas (1 tant que le chrono tourne)
  overRate = 1;
  overHp = 1;
  overDmg = 1;
  overSpd = 1;
  nextId = 1;
  lastAction = 0; // dernier coup donné ou reçu
  nextEruption = HAZARDS.eruption.after; // phase 11 : prochaine éruption (temps de jeu)
  lastHurt: HurtSrc = HurtSrc.Contact; // dernière source de dégâts (cause de mort dans la CLI)
  boredomUntil = 0;

  // armes et tomes (phase 12) : niveau = nombre d'améliorations ; lignes prises par stat dans wmods / tmods
  weapons: Partial<Record<WeaponKey, number>> = { orbe: 1 };
  tomes: Partial<Record<TomeKey, number>> = {};
  wmods: Record<WeaponKey, Int16Array>;
  tmods: Partial<Record<TomeKey, Int16Array>> = {}; // remplis pour toutes les clés au constructeur
  wstats: Record<WeaponKey, Record<string, number>>; // stats courantes (refreshStats), lues par la sim et le rendu
  triples = 0; // cartes à 3 lignes prises (succès « Triple ligne »)
  weaponLvBest = 1; // meilleur niveau d'arme du run (succès « Érudit »)
  unlocked: Set<WeaponKey> | null = null; // null = toutes les armes proposables
  // emplacements (phase 10) : plafond d'armes et de tomes piochables ; le kit de départ du personnage ne compte pas
  maxWeapons = MAX_WEAPONS;
  maxTomes = MAX_PASSIVES;
  bladeRangeMul = 1; // Bûcheron : lames à portée +20 %
  wstate = {
    orbeT: 0.4,
    auraT: 0,
    auraPulse: 0,
    foudreT: 1.5,
    bladeT: LAMES.first, // phase 32 : prochain coup des Lames
    boomT: 0.8,
    mineT: 0,
    mineDist: 0,
    fireDist: 0,
    // phase 28
    fauxT: 0.5,
    lanceT: 1,
    lanceSalvo: 0, // numéro de la dernière salve de lances
    metT: 1.5,
    metN: 0, // météores annoncés en attente d'impact
    metX: new Float64Array(METEOR.max),
    metZ: new Float64Array(METEOR.max),
    metLeft: new Float64Array(METEOR.max),
  };
  trait: Trait = Trait.None; // passif signature du personnage (phase 6)
  spell: Spell = Spell.Bond; // sort de classe (phase 19)
  // état des sorts qui durent (phase 19) : centre du Collet, impulsions, salve du Bond en attente, lancers et kills (CLI)
  sstate = { x: 0, z: 0, tick: 0, pending: false, bondPending: false, casts: 0, kills: 0 };
  // compteurs de défis (phase 6) : distance parcourue, plus longue période sans dégât
  distance = 0;
  hurtAt = 0;
  noHitBest = 0;
  cards: Card[] = [];

  // décor (généré par seed, collisions) et zones
  obstacles: Obstacle[] = [];
  // obstacles[0..treeCount) = arbres, [treeCount..rockEnd) = rochers, [rockEnd..stoneEnd) = menhirs (phase 16),
  // [stoneEnd..) = objets des lieux (phase 27 : tombes, tonneaux, caisses ; leur sorte dans propKinds)
  treeCount = 0;
  rockEnd = 0;
  stoneEnd = 0;
  propKinds = new Uint8Array(0);
  /** Phase 27 : décor sans collision (citrouilles), et centres des cimetières et campements. */
  decor: { k: number; x: number; z: number; ry: number }[] = [];
  yards: Obstacle[] = [];
  camps: Obstacle[] = [];
  walls: Wall[] = []; // phase 16 : murets et troncs couchés ; phase 27 : clôtures (kind 2)
  places: Obstacle[] = []; // phase 16 : emprise des lieux construits (arbres épars exclus)
  stoneCenters: Obstacle[] = []; // phase 16 : centres des cercles de pierres (une lanterne au milieu)
  lakes: Obstacle[] = [];
  woods: Obstacle[] = [];
  /** Relief (phase 27) : plateaux, rampes et combes posés par buildTerrain (lus par les points d'intérêt et la carte). */
  plateaus: Plateau[] = [];
  ramps: Ramp[] = [];
  combes: { pts: number[]; half: number }[] = [];
  /** Phase 28 : grandes pistes, tremplins, pistes chronométrées. */
  pistes: Piste[] = [];
  kickers: Kicker[] = [];
  races: Race[] = [];
  readonly obstacleGrid = new Map<number, number[]>();
  readonly wallGrid = new Map<number, number[]>();
  /** Relief (phase 18) : hauteurs du sol sur une grille de TERRAIN.cell u (src/sim/terrain.ts). */
  readonly height = new Float32Array(TERRAIN_N * TERRAIN_N);
  /** Phase 27 : cases découvertes (DISCOVER.cell u, SEEN_N × SEEN_N), leur nombre, et l'attente avant la prochaine mise à jour. */
  readonly seen = new Uint8Array(SEEN_N * SEEN_N);
  seenCount = 0;
  seenT = 0;
  /** Cases pleines de toute la carte (FLOW.cell), lues par le champ de flux ; solidN cases de côté. */
  readonly solidN = Math.ceil((2 * WORLD_HALF) / FLOW.cell);
  readonly solid = new Uint8Array(this.solidN * this.solidN);
  /** Cases proches d'un obstacle (marge d'un rayon d'ennemi) : hors de ces cases, la collision des ennemis est sautée. */
  readonly near = new Uint8Array(this.solidN * this.solidN);
  readonly flow = new FlowField(); // phase 16 : les ennemis au sol contournent les ouvrages
  shooters = 0; // phase 16 : tireurs vivants (Archer, Cracheur, Sorcier), compté à chaque pas
  // phase 17 : objets passifs (par index de ITEM_KEYS), synergies, marchand. Phase 38 : nombre d'exemplaires (cumul)
  readonly items = new Uint8Array(ITEM_KEYS.length);
  /** Valeur cumulée de chaque objet (stackEff de son compte, 0 sans l'objet) : ce que lit la boucle de jeu. */
  readonly itemEff = new Float64Array(ITEM_KEYS.length);
  /** Objets exclus des tirages (sim d'ablation de la CLI) : jamais proposés, sans effet. */
  readonly itemBan = new Uint8Array(ITEM_KEYS.length);
  itemOrder: number[] = []; // ordre d'obtention (HUD)
  itemPicks = 0; // choix d'objet en attente (coffres)
  eliteChests = 0; // phase 38 : coffres d'élite ramassés (un sur ITEM.eliteItemEvery donne un objet)
  // phase 18 : points d'intérêt (src/sim/poi.ts)
  readonly mapChests: MapChest[] = [];
  readonly shrines: Shrine[] = [];
  mapChestsOpened = 0;
  racesWon = 0; // phase 28 : pistes chronométrées réussies
  slideDist = 0; // phase 28 : u glissés dans la partie
  tricks = 0; // glisses parfaites dans la partie (phase 28 : vrilles, 1.30.1 : glisses au bon moment)
  shieldT = 0; // phase 28 : Bouclier, s avant d'être prêt (0 : prêt)
  hornT = 0; // phase 28 : Corne de guerre, s avant la prochaine onde
  rerolls: number = RUN_REROLL.base; // phase 31 : relances de cartes restantes pour la partie
  healBank = 0; // phase 31 : PV que les objets peuvent encore rendre cette seconde (vol de vie, Calice)
  healT = 0; // s avant la prochaine recharge de la réserve et l'annonce des soins
  healed = 0; // PV rendus par les objets depuis la dernière annonce
  shrinesUsed = 0;
  boonPicks = 0; // choix de bonus de sanctuaire en attente
  readonly boons = new Uint8Array(BOON_KEYS.length); // bonus pris (CLI, HUD)
  readonly syn = new Uint8Array(SYNERGIES.length);
  talismanKills = 0;
  readonly talismanMarks = new Int32Array(ITEM.talisman.targets);
  thornT = 0; // Épines : minuteur du renvoi de dégâts
  merchant: MerchantState = makeMerchant();
  offers: Card[] = []; // offres du marchand (w.cards garde les cartes de niveau et de coffre)
  goldSpent = 0; // or dépensé au marchand (CLI)
  // phase 41 : compteurs de la partie pour les défis par personnage (src/meta/chars.ts)
  readonly srcKills = new Uint32Array(HitSrc.Count); // ennemis tués par source (armes 0..8, feu, sort…)
  airKills = 0; // ennemis tués pendant que le joueur est en l'air
  eliteKills = 0;
  bossKills = 0;

  constructor(seed: number, opts?: WorldOptions) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.player = makePlayer(opts);
    const ch = CHARACTERS.find((c) => c.key === (opts?.character ?? 'eclaireuse')) ?? CHARACTERS[0];
    this.wmods = {} as Record<WeaponKey, Int16Array>;
    this.wstats = {} as Record<WeaponKey, Record<string, number>>;
    for (const k of WEAPON_KEYS) {
      this.wmods[k] = new Int16Array(WEAPON_LINES[k].length);
      // objets de stats : chaque champ est écrit une fois en flottant puis remis à sa base, pour que V8 leur donne
      // d'emblée une représentation « double » (sinon la première ligne en % change la forme et désoptimise la boucle chaude)
      const st: Record<string, number> = {};
      for (const stat in WEAPONS[k].base) {
        st[stat] = 0.5;
        st[stat] = WEAPONS[k].base[stat];
      }
      this.wstats[k] = st;
    }
    for (const k of TOME_KEYS) this.tmods[k] = new Int16Array(8); // préalloués : aucune allocation ni changement de forme en run
    this.weapons = { [ch.weapon]: 1 };
    if (ch.weapon2) this.weapons[ch.weapon2] = 1;
    this.bladeRangeMul = ch.bladeRangeMul;
    this.trait = ch.trait;
    this.spell = ch.spell;
    if (ch.trait === Trait.DejaMorte) this.player.revives += TRAIT.dejamorte.revives;
    if (ch.trait === Trait.Marchand) {
      // phase 34 : flair du Colporteur (personnage, pas un tome : les emplacements de tomes restent libres)
      this.player.luck += TRAIT.marchand.luck;
      this.player.goldMul += TRAIT.marchand.goldMul;
    }
    // kit de départ : lignes fixes (hors plafond d'emplacements, comme avant)
    if (ch.startLines)
      for (const k in ch.startLines) {
        const wk = k as WeaponKey;
        const names = ch.startLines[wk] ?? [];
        for (const stat of names) this.wmods[wk][lineIndex(WEAPON_LINES[wk], stat)]++;
        this.weapons[wk] = 1 + names.length;
      }
    if (ch.startTomes)
      for (const k in ch.startTomes) {
        const tk = k as TomeKey;
        const names = ch.startTomes[tk] ?? [];
        const mods = this.tmods[tk]!;
        for (const stat of names) {
          const i = lineIndex(TOMES[tk], stat);
          mods[i]++;
          applyTomeLine(this, tk, i);
        }
        this.tomes[tk] = names.length;
      }
    if (opts?.unlocked) this.unlocked = new Set(opts.unlocked);
    if (opts?.bannedItems) for (const k of opts.bannedItems) this.itemBan[ITEM_KEYS.indexOf(k)] = 1; // phase 40
    if (opts?.rerolls !== undefined) this.rerolls = Math.max(0, opts.rerolls | 0);
    if (opts?.slots) {
      this.maxWeapons = Math.max(
        Math.max(1, Math.min(MAX_WEAPONS, opts.slots.weapons | 0)),
        Object.keys(this.weapons).length,
      );
      this.maxTomes = Math.max(
        Math.max(1, Math.min(MAX_PASSIVES, opts.slots.passives | 0)),
        Object.keys(this.tomes).length,
      );
    }
    refreshStats(this);
    for (let i = 0; i < CAPS.enemies; i++) this.enemies.push(makeEnemy());
    for (let i = 0; i < CAPS.projectiles; i++) this.projs.push(makeProj());
    for (let i = 0; i < CAPS.shots; i++) this.shots.push(makeShot());
    for (let i = 0; i < CAPS.gems; i++) this.gems.push(makeGem());
    for (let i = 0; i < CAPS.chests; i++) this.chests.push({ alive: false, x: 0, z: 0, age: 0, boss: false, picks: 0 });
    for (let i = 0; i < CAPS.powers; i++) this.powers.push({ alive: false, x: 0, z: 0, kind: 0, age: 0 });
    for (let i = 0; i < CAPS.events; i++) this.events.push({ type: Ev.Hit, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, v: 0 });
    this.startSeed = seed;
    this.buildMapFor(seed);
  }

  /**
   * Construit la carte de la graine `seed` (phase 37 : aussi au passage d'un monde, dans le même World). Tout l'état de
   * carte est d'abord vidé : la carte obtenue est exactement celle d'un World neuf de même graine (test map/stages).
   */
  buildMapFor(seed: number): void {
    this.seed = seed;
    this.obstacles = [];
    this.treeCount = this.rockEnd = this.stoneEnd = 0;
    this.propKinds = new Uint8Array(0);
    this.decor = [];
    this.yards = [];
    this.camps = [];
    this.walls = [];
    this.places = [];
    this.stoneCenters = [];
    this.lakes = [];
    this.woods = [];
    this.plateaus = [];
    this.ramps = [];
    this.combes = [];
    this.pistes = [];
    this.kickers = [];
    this.races = [];
    this.obstacleGrid.clear();
    this.wallGrid.clear();
    this.height.fill(0);
    this.seen.fill(0);
    this.seenCount = 0;
    this.seenT = 0;
    this.mapChests.length = 0;
    this.shrines.length = 0;
    this.flow.ready = false;
    const r = new Rng(seed ^ 0x9e3779b9);
    buildZones(this, r);
    buildTerrain(this, r); // phase 27 : le relief d'abord (plateaux, rampes, combes)…
    buildMap(this, r); // …puis les lieux construits, seulement sur le plat
    settlePlaces(this); // posés exactement à plat
    buildPOI(this, r); // coffres et sanctuaires (sommets, pieds de rampes, combes), puis le totem du monde
  }

  // ---------- événements ----------
  emit(type: Ev, x = 0, y = 0, z = 0, v = 0, x2 = 0, y2 = 0, z2 = 0): void {
    if (this.eventCount >= CAPS.events) return;
    const e = this.events[this.eventCount++];
    e.type = type;
    e.x = x;
    e.y = y;
    e.z = z;
    e.v = v;
    e.x2 = x2;
    e.y2 = y2;
    e.z2 = z2;
  }
  clearEvents(): void {
    this.eventCount = 0;
  }

  // ---------- pools ----------
  allocEnemy(): Enemy | null {
    if (this.enemyCount >= CAPS.enemies) return null;
    const e = this.enemies[this.enemyCount++];
    e.alive = true;
    e.id = this.nextId++;
    return e;
  }
  /** swap-remove : l'ennemi en fin de pool prend la place i. */
  freeEnemy(i: number): void {
    const last = --this.enemyCount;
    if (this.bossIndex === i) this.bossIndex = -1;
    else if (this.bossIndex === last) this.bossIndex = i;
    if (i !== last) {
      const a = this.enemies[i];
      this.enemies[i] = this.enemies[last];
      this.enemies[last] = a;
    }
    this.enemies[last].alive = false;
  }
  allocProj(): Projectile | null {
    if (this.projCount >= CAPS.projectiles) return null;
    const p = this.projs[this.projCount++];
    p.alive = true;
    return p;
  }
  freeProj(i: number): void {
    const last = --this.projCount;
    if (i !== last) {
      const a = this.projs[i];
      this.projs[i] = this.projs[last];
      this.projs[last] = a;
    }
    this.projs[last].alive = false;
  }
  allocShot(): Shot | null {
    if (this.shotCount >= CAPS.shots) return null;
    const s = this.shots[this.shotCount++];
    s.alive = true;
    return s;
  }
  freeShot(i: number): void {
    const last = --this.shotCount;
    if (i !== last) {
      const a = this.shots[i];
      this.shots[i] = this.shots[last];
      this.shots[last] = a;
    }
    this.shots[last].alive = false;
  }
  allocGem(): Gem | null {
    if (this.gemCount >= CAPS.gems) return null;
    const g = this.gems[this.gemCount++];
    g.alive = true;
    return g;
  }
  freeGem(i: number): void {
    const last = --this.gemCount;
    if (i !== last) {
      const a = this.gems[i];
      this.gems[i] = this.gems[last];
      this.gems[last] = a;
    }
    this.gems[last].alive = false;
  }
  allocChest(): Chest | null {
    if (this.chestCount >= CAPS.chests) return null;
    const c = this.chests[this.chestCount++];
    c.alive = true;
    return c;
  }
  allocPower(): Power | null {
    if (this.powerCount >= CAPS.powers) return null;
    const p = this.powers[this.powerCount++];
    p.alive = true;
    return p;
  }
  freePower(i: number): void {
    const last = --this.powerCount;
    if (i !== last) {
      const a = this.powers[i];
      this.powers[i] = this.powers[last];
      this.powers[last] = a;
    }
    this.powers[last].alive = false;
  }
  freeChest(i: number): void {
    const last = --this.chestCount;
    if (i !== last) {
      const a = this.chests[i];
      this.chests[i] = this.chests[last];
      this.chests[last] = a;
    }
    this.chests[last].alive = false;
  }

  // ---------- relief (phase 18) ----------
  /** Hauteur du sol en (x, z). */
  heightAt(x: number, z: number): number {
    return heightAt(this.height, x, z);
  }
  /** Multiplicateur de vitesse de la pente pour un déplacement (vx, vz) depuis (x, z). */
  slopeMul(x: number, z: number, vx: number, vz: number): number {
    return slopeMul(this.height, x, z, vx, vz);
  }

  // ---------- zones et décor (génération : src/sim/map.ts) ----------
  /** Multiplicateur de vitesse au sol en (x, z) : 0,55 dans un lac, 1 ailleurs. O(nombre de lacs). */
  speedAt(x: number, z: number): number {
    for (let i = 0; i < this.lakes.length; i++) {
      const l = this.lakes[i];
      const dx = x - l.x,
        dz = z - l.z;
      if (dx * dx + dz * dz < l.r * l.r) return ZONES.lakeSpeed;
    }
    return 1;
  }
  /**
   * Repousse (x,z) hors des obstacles proches (cercles puis murets et troncs). Un murets ou un tronc ne bloque pas ce qui
   * passe au-dessus (y ≥ h − MAP.overTol : le joueur en plein saut). Écrit dans out[0], out[1]. Aucune allocation.
   */
  resolveObstacles(x: number, z: number, pad: number, out: Float64Array, y = 0): void {
    const tx = Math.floor(x / TREE_CELL),
      tz = Math.floor(z / TREE_CELL);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const k = cellKey(tx + a, tz + b);
        const arr = this.obstacleGrid.get(k);
        if (arr)
          for (let n = 0; n < arr.length; n++) {
            const o = this.obstacles[arr[n]];
            const dx = x - o.x,
              dz = z - o.z,
              d2 = dx * dx + dz * dz,
              m = o.r + pad;
            if (d2 < m * m && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              x = o.x + (dx / d) * m;
              z = o.z + (dz / d) * m;
            }
          }
        const ws = this.wallGrid.get(k);
        if (ws)
          for (let n = 0; n < ws.length; n++) {
            const s = this.walls[ws[n]];
            if (y >= s.h - MAP.overTol) continue;
            const ux = s.x2 - s.x1,
              uz = s.z2 - s.z1,
              l2 = ux * ux + uz * uz;
            let t = l2 > 1e-9 ? ((x - s.x1) * ux + (z - s.z1) * uz) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = s.x1 + ux * t,
              qz = s.z1 + uz * t,
              dx = x - qx,
              dz = z - qz,
              d2 = dx * dx + dz * dz,
              m = s.r + pad;
            if (d2 < m * m && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              x = qx + (dx / d) * m;
              z = qz + (dz / d) * m;
            }
          }
      }
    }
    out[0] = x;
    out[1] = z;
  }
  /** (x, z) est-il assez près d'un obstacle pour qu'un ennemi puisse le toucher ? Une lecture de tableau. */
  nearObstacle(x: number, z: number): boolean {
    const N = this.solidN,
      i = Math.floor((x + WORLD_HALF) / FLOW.cell),
      j = Math.floor((z + WORLD_HALF) / FLOW.cell);
    return i >= 0 && j >= 0 && i < N && j < N && this.near[j * N + i] === 1;
  }
  /** Un tir droit (flèche, crachat) de rayon r en (x, z) touche-t-il un obstacle ? Grille 3 × 3, aucune allocation. */
  blocksShot(x: number, z: number, r: number): boolean {
    const tx = Math.floor(x / TREE_CELL),
      tz = Math.floor(z / TREE_CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const k = cellKey(tx + a, tz + b);
        const arr = this.obstacleGrid.get(k);
        if (arr)
          for (let n = 0; n < arr.length; n++) {
            const o = this.obstacles[arr[n]];
            const m = o.r + r;
            if ((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) < m * m) return true;
          }
        const ws = this.wallGrid.get(k);
        if (ws)
          for (let n = 0; n < ws.length; n++) {
            const s = this.walls[ws[n]];
            if (segDist(x, z, s.x1, s.z1, s.x2, s.z2) < s.r + r) return true;
          }
      }
    return false;
  }

  weaponLevel(k: WeaponKey): number {
    return this.weapons[k] ?? 0;
  }
  weaponMaxed(k: WeaponKey): boolean {
    return (this.weapons[k] ?? 0) >= LEVEL_MAX.weapon;
  }
}

/** Joueur de départ : constantes PLAYER, puis personnage, puis paliers de boutique (opts). */
/** Cases de découverte par côté (phase 27). */
export const SEEN_N = Math.ceil((2 * WORLD_HALF) / DISCOVER.cell);

/** Révèle les cases à moins de DISCOVER.radius du joueur (toutes les DISCOVER.period s). Aucune allocation. */
export function discover(w: World, dt: number): void {
  w.seenT -= dt;
  if (w.seenT > 0) return;
  w.seenT = DISCOVER.period;
  const C = DISCOVER.cell,
    R = DISCOVER.radius * (w.items[It.Boussole] ? ITEM.boussole.radiusMul ** Math.min(ITEM.boussole.maxStack, w.itemEff[It.Boussole]) : 1), // phase 28 : Boussole (phase 38 : cumul borné à 2)
    P = w.player;
  const i0 = Math.max(0, Math.floor((P.x - R + WORLD_HALF) / C)),
    i1 = Math.min(SEEN_N - 1, Math.floor((P.x + R + WORLD_HALF) / C)),
    j0 = Math.max(0, Math.floor((P.z - R + WORLD_HALF) / C)),
    j1 = Math.min(SEEN_N - 1, Math.floor((P.z + R + WORLD_HALF) / C));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * SEEN_N + i;
      if (w.seen[k]) continue;
      const dx = -WORLD_HALF + (i + 0.5) * C - P.x,
        dz = -WORLD_HALF + (j + 0.5) * C - P.z;
      if (dx * dx + dz * dz <= R * R) {
        w.seen[k] = 1;
        w.seenCount++;
      }
    }
}

export function makePlayer(opts?: WorldOptions): Player {
  const ch = CHARACTERS.find((c) => c.key === (opts?.character ?? 'eclaireuse')) ?? CHARACTERS[0];
  const maxHp = Math.round((PLAYER.hp + ch.hpAdd) * ch.hpMul); // phase 17 : plus de boutique par personnage
  const p: Player = {
    x: 0,
    z: 0,
    y: 0,
    px: 0,
    pz: 0,
    py: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    onGround: true,
    hp: maxHp,
    maxHp,
    regen: 0,
    speed: PLAYER.speed * ch.speedMul,
    magnet: PLAYER.magnet,
    dmgMul: PLAYER.dmgMul,
    cdMul: 1,
    luck: 0,
    goldMul: 1,
    projAdd: 0,
    sizeMul: 1,
    projSpeedMul: 1,
    projLifeMul: 1,
    eliteDmgMul: 1,
    kbMul: 1,
    armor: 0,
    spellCdMul: 1,
    spellRefund: 1,
    spellPow: 1,
    xpMul: 1,
    chestGoldMul: 1,
    eliteGold: 0,
    crit: 0,
    critMul: CRIT.mul,
    killHeal: 0,
    lvlHeal: 0,
    shopMul: 1,
    revives: 0,
    dashTime: ch.spell === Spell.Bond ? PLAYER.dashTime : ch.spell === Spell.Comete ? SPELL.comete.time : 0,
    jumpMul: 1,
    level: 1,
    xp: 0,
    need: XP.needFor(1),
    dirX: 0,
    dirZ: 1,
    dashT: 0,
    sliding: false,
    slideHeld: false,
    slideCd: 0,
    mvx: 0,
    mvz: 0,
    airMom: false,
    slideJump: false,
    airT: 0,
    slideBuf: 0,
    jumpBuf: 0,
    coyote: 0,
    landGrace: 0,
    landMx: 0,
    landMz: 0,
    elanT: 0,
    gPrev: 0,
    gv: 0,
    spd: 0,
    spellCd: 0,
    spellT: 0,
    dmgTaken: 1,
    invul: 0,
    walk: 0,
    recoil: 0,
  };
  // Représentation V8 : ces champs sont entiers au départ (0 ou 1) et deviennent fractionnaires à la première ligne de tome ;
  // écrire une fois un flottant puis la valeur initiale leur donne d'emblée la forme « double », sinon chaque première
  // ligne d'un nouveau type déprécie la forme de Player et désoptimise stepEnemies/tickShots pendant une dizaine de steps.
  for (const k of DOUBLE_FIELDS) {
    const v = p[k];
    p[k] = 0.5;
    p[k] = v;
  }
  return p;
}
/** Champs numériques de Player qui peuvent devenir fractionnaires en run (tomes, boutique). */
const DOUBLE_FIELDS = [
  'mvx',
  'mvz',
  'airT',
  'slideBuf',
  'jumpBuf',
  'coyote',
  'landGrace',
  'landMx',
  'landMz',
  'elanT',
  'gPrev',
  'gv',
  'spd',
  'slideCd',
  'regen',
  'speed',
  'magnet',
  'dmgMul',
  'cdMul',
  'luck',
  'goldMul',
  'projSpeedMul',
  'projLifeMul',
  'eliteDmgMul',
  'kbMul',
  'armor',
  'sizeMul',
  'spellCdMul',
  'spellRefund',
  'spellPow',
  'dmgTaken',
  'xpMul',
  'chestGoldMul',
  'eliteGold',
  'crit',
  'critMul',
  'killHeal',
  'lvlHeal',
  'shopMul',
  'hp',
  'maxHp',
  'dashTime',
  'jumpMul',
  'xp',
] as const satisfies readonly (keyof Player)[];
function makeEnemy(): Enemy {
  return {
    alive: false,
    id: 0,
    type: 0,
    elite: false,
    r: 0.5,
    x: 0,
    z: 0,
    px: 0,
    pz: 0,
    y: 0,
    hp: 1,
    max: 1,
    kx: 0,
    kz: 0,
    face: 0,
    flash: 0,
    lastBlade: -9,
    lastBoom: -9,
    lastLance: -9,
    lanceBits: 0,
    lastPatins: -9,
    spd: 1,
    dmgMul: 1,
    bob: 0,
    state: 0,
    timer: 0,
    aim: 0,
    tx: 0,
    tz: 0,
    phase2: false,
    t2: 0,
    age: 0,
    enraged: false,
    combo: 0,
    hunt: 0,
    huntT: 0,
    detour: 0,
    stun: 0,
    slowT: 0,
  };
}
function makeProj(): Projectile {
  return {
    alive: false,
    kind: ProjKind.Orbe,
    x: 0,
    y: 0,
    z: 0,
    px: 0,
    pz: 0,
    vx: 0,
    vz: 0,
    life: 0,
    age: 0,
    dmg: 0,
    pierce: 1,
    hit0: -1,
    hit1: -1,
    hit2: -1,
    ret: false,
    r: 0,
    armed: false,
  };
}
function makeShot(): Shot {
  return { alive: false, kind: ShotKind.Spit, r: 0.4, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, dmg: 0, hit: false, ox: 0, oz: 0, t0: 1 };
}
function makeGem(): Gem {
  return { alive: false, x: 0, z: 0, v: 1, mag: false, s: 0, age: 0 };
}

export const NO_INPUT: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
