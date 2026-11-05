import { BOON_KEYS, CAPS, CHARACTERS, MAX_PASSIVES, MAX_WEAPONS, PLAYER, SPAWN, ITEM_KEYS, SYNERGIES, ITEM, TOMES, TOME_KEYS, TRAIT, XP, WEAPON_LINES, WEAPON_MAX, TREE_CELL, WORLD_HALF, ZONES, HAZARDS, FLOW, MAP } from './balance';
import { buildMap, buildZones, cellKey, segDist } from './map';
import { FlowField } from './flow';
import { TERRAIN_N, buildTerrain, heightAt, slopeMul } from './terrain';
import { buildPOI } from './poi';
import type { MapChest, Shrine } from './poi';
import { makeMerchant } from './merchant';
import type { MerchantState } from './merchant';
import { WEAPONS, WEAPON_KEYS, applyTomeLine, lineIndex, refreshStats } from './weapons/defs';
import { SpatialGrid } from './grid';
import { Rng } from './rng';
import { Ev, Mode, ProjKind, ShotKind, Trait, HurtSrc } from './types';
import type {
  Card,
  Chest,
  Enemy,
  GameEvent,
  Gem,
  Input,
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

/** Obstacle long (phase 16) : segment épaissi. kind 0 = muret, 1 = tronc couché ; tous deux se sautent (h). */
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

  events: GameEvent[] = [];
  eventCount = 0;

  grid = new SpatialGrid(CAPS.enemies);

  // spawner
  spawnAcc = 0;
  nextWave = SPAWN.wavePeriod;
  nextBoss = SPAWN.bossPeriod;
  nextElite = SPAWN.eliteAfter;
  bossCount = 0;
  bossIndex = -1; // index de l'ennemi boss vivant, -1 sinon
  reaperSpawned = false;
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
  wstate = { orbeT: 0.4, auraT: 0, auraPulse: 0, foudreT: 1.5, bladeA: 0, boomT: 0.8, mineT: 0, mineDist: 0, fireDist: 0 };
  trait: Trait = Trait.None; // passif signature du personnage (phase 6)
  // compteurs de défis (phase 6) : distance parcourue, plus longue période sans dégât
  distance = 0;
  hurtAt = 0;
  noHitBest = 0;
  cards: Card[] = [];

  // décor (généré par seed, collisions) et zones
  obstacles: Obstacle[] = [];
  treeCount = 0; // obstacles[0..treeCount) = arbres, [treeCount..rockEnd) = rochers, [rockEnd..) = menhirs (phase 16)
  rockEnd = 0;
  walls: Wall[] = []; // phase 16 : murets et troncs couchés
  places: Obstacle[] = []; // phase 16 : emprise des lieux construits (arbres épars exclus)
  stoneCenters: Obstacle[] = []; // phase 16 : centres des cercles de pierres (une lanterne au milieu)
  lakes: Obstacle[] = [];
  woods: Obstacle[] = [];
  readonly obstacleGrid = new Map<number, number[]>();
  readonly wallGrid = new Map<number, number[]>();
  /** Relief (phase 18) : hauteurs du sol sur une grille de TERRAIN.cell u (src/sim/terrain.ts). */
  readonly height = new Float32Array(TERRAIN_N * TERRAIN_N);
  /** Cases pleines de toute la carte (FLOW.cell), lues par le champ de flux ; solidN cases de côté. */
  readonly solidN = Math.ceil((2 * WORLD_HALF) / FLOW.cell);
  readonly solid = new Uint8Array(this.solidN * this.solidN);
  /** Cases proches d'un obstacle (marge d'un rayon d'ennemi) : hors de ces cases, la collision des ennemis est sautée. */
  readonly near = new Uint8Array(this.solidN * this.solidN);
  readonly flow = new FlowField(); // phase 16 : les ennemis au sol contournent les ouvrages
  shooters = 0; // phase 16 : tireurs vivants (Archer, Cracheur, Sorcier), compté à chaque pas
  // phase 17 : objets passifs (drapeaux par index de ITEM_KEYS), synergies, marchand
  readonly items = new Uint8Array(ITEM_KEYS.length);
  /** Objets exclus des tirages (sim d'ablation de la CLI) : jamais proposés, sans effet. */
  readonly itemBan = new Uint8Array(ITEM_KEYS.length);
  itemOrder: number[] = []; // ordre d'obtention (HUD)
  itemPicks = 0; // choix d'objet en attente (coffres)
  // phase 18 : points d'intérêt (src/sim/poi.ts)
  readonly mapChests: MapChest[] = [];
  readonly shrines: Shrine[] = [];
  mapChestsOpened = 0;
  shrinesUsed = 0;
  boonPicks = 0; // choix de bonus de sanctuaire en attente
  readonly boons = new Uint8Array(BOON_KEYS.length); // bonus pris (CLI, HUD)
  bossWarned = 0; // échéance du dernier boss annoncé (BOSS_WARN)
  readonly syn = new Uint8Array(SYNERGIES.length);
  talismanKills = 0;
  readonly talismanMarks = new Int32Array(ITEM.talisman.targets);
  thornT = 0; // Épines : minuteur du renvoi de dégâts
  merchant: MerchantState = makeMerchant();
  offers: Card[] = []; // offres du marchand (w.cards garde les cartes de niveau et de coffre)
  goldSpent = 0; // or dépensé au marchand (CLI)

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
    if (ch.trait === Trait.DejaMorte) this.player.revives += TRAIT.dejamorte.revives;
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
    for (let i = 0; i < CAPS.chests; i++) this.chests.push({ alive: false, x: 0, z: 0, age: 0, boss: false });
    for (let i = 0; i < CAPS.events; i++) this.events.push({ type: Ev.Hit, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, v: 0 });
    const r = new Rng(this.seed ^ 0x9e3779b9);
    buildZones(this, r);
    buildMap(this, r);
    buildTerrain(this, r); // après la carte : les lieux construits sont posés à plat
    buildPOI(this, r); // après le relief : coffres et sanctuaires sur les hauteurs
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
    return (this.weapons[k] ?? 0) >= WEAPON_MAX;
  }
}

/** Joueur de départ : constantes PLAYER, puis personnage, puis paliers de boutique (opts). */
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
    dashCdMul: 1,
    dashInvulAdd: 0,
    xpMul: 1,
    chestGoldMul: 1,
    eliteGold: 0,
    revives: 0,
    dashTime: ch.dashTime,
    jumpMul: 1,
    level: 1,
    xp: 0,
    need: XP.needFor(1),
    dirX: 0,
    dirZ: 1,
    dashT: 0,
    dashCd: 0,
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
  'dashCdMul',
  'dashInvulAdd',
  'xpMul',
  'chestGoldMul',
  'eliteGold',
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
    spd: 1,
    dmgMul: 1,
    bob: 0,
    state: 0,
    timer: 0,
    aim: 0,
    tx: 0,
    tz: 0,
    phase2: false,
    detour: 0,
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

export const NO_INPUT: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };
