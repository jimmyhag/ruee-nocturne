// Hooks de debug et de test (skill sim-testing §6) : exposés sur `window.__game`
// uniquement en développement ou avec `?debug=1`. Jamais appelés par le jeu lui-même.
import type { GameScene } from './render/scene';
import { CAPS, STEP, WEAPON_MAX } from './sim/balance';
import { dropChest } from './sim/combat';
import { spawnEnemy } from './sim/spawner';
import { EVOLUTIONS } from './sim/weapons/defs';
import { step } from './sim/step';
import { Mode } from './sim/types';
import type { Input, WeaponKey } from './sim/types';
import type { World } from './sim/world';

export interface DebugHost {
  readonly world: World | null;
  readonly app: string;
  readonly scene: GameScene;
  /** Démarre une partie ; `variant` fixe le décalage du rng pour une partie reproductible. */
  start(variant?: number): void;
  /** À appeler après un saut dans la sim : resynchronise le HUD et l'écran de niveau. */
  afterSimJump(): void;
  audioVoices(): number;
}

export function debugEnabled(): boolean {
  return import.meta.env.DEV || location.search.includes('debug');
}

/** Ce que la boucle principale appelle quand les hooks sont installés (null en prod : aucun coût). */
export interface DebugRuntime {
  /** Mode stress : maintient `stressTarget` ennemis vivants, joueur invincible. Appelé une fois par frame en jeu. */
  onFrame(world: World): void;
  /** Facteur appliqué au temps réel de la boucle (captures : 0 fige sim, particules et caméra sans écran de pause). */
  speed: number;
}

export function installDebugHooks(host: DebugHost): DebugRuntime | null {
  if (!debugEnabled()) return null;
  const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };
  const w = () => host.world;
  // ?stress=400 : mesure de fps à N ennemis (porte de phase 1), N borné par la capacité du pool
  const stressParam = new URLSearchParams(location.search).get('stress');
  let stressTarget = stressParam ? Math.min(CAPS.enemies, Math.max(0, +stressParam | 0)) : 0;
  let stressWorld: World | null = null; // monde déjà passé en god mode

  const debug = {
    /** Avance la sim de `seconds` secondes, joueur invincible, cartes prises automatiquement. */
    warp(seconds: number): void {
      const world = w();
      if (!world) return;
      const maxHp = world.player.maxHp;
      world.player.maxHp = world.player.hp = 1e9; // la régén. clampe sur maxHp : il faut lever les deux
      const target = world.t + seconds;
      while (world.t < target && world.mode !== Mode.Dead) step(world, still, STEP);
      world.player.maxHp = maxHp;
      world.player.hp = maxHp;
      host.afterSimJump();
    },
    kill(): void {
      const world = w();
      if (world) world.player.hp = 0;
    },
    give(weapon: WeaponKey, lv = 1): void {
      const world = w();
      if (!world) return;
      world.weapons[weapon] = lv;
      host.afterSimJump();
    },
    spawn(type: number, n = 1, dist = 8): void {
      const world = w();
      if (!world) return;
      for (let i = 0; i < n; i++) spawnEnemy(world, type, (i / n) * Math.PI * 2, dist);
    },
    god(): void {
      const world = w();
      if (!world) return;
      world.player.maxHp = world.player.hp = 1e9;
    },
    /** Force une montée de niveau au prochain step. */
    levelUp(): void {
      const world = w();
      if (world) world.player.xp = world.player.need;
    },
    seed(n: number): void {
      host.start(n);
    },
    /** Arme au niveau max + passif associé + évolution appliquée (captures, tests). */
    evolve(weapon: WeaponKey): void {
      const world = w();
      const ev = EVOLUTIONS[weapon];
      if (!world || !ev) return;
      world.weapons[weapon] = WEAPON_MAX;
      world.passives[ev.passive] = Math.max(1, world.passives[ev.passive] ?? 0);
      world.evolved[weapon] = true;
      host.afterSimJump();
    },
    /** Pose un coffre sous le joueur (boss : 3 à 5 cartes). */
    chest(boss = false): void {
      const world = w();
      if (world) dropChest(world, world.player.x, world.player.z + 0.3, boss);
    },
    /** Pose un ennemi de type `type` à `dist` u avec `hp` PV : la prochaine arme qui le touche le tue (captures de kill). */
    weak(type: number, dist = 2, hp = 1): void {
      const world = w();
      if (!world) return;
      const i = spawnEnemy(world, type, 0, dist);
      if (i >= 0) world.enemies[i].hp = hp;
    },
    /** Rapproche le boss vivant à `dist` u devant le joueur (captures). */
    pullBoss(dist = 6): void {
      const world = w();
      if (!world || world.bossIndex < 0) return;
      const b = world.enemies[world.bossIndex];
      b.x = b.px = world.player.x;
      b.z = b.pz = world.player.z - dist;
    },
    /** Vitesse de la boucle : 1 normal, 0 figé (sim, particules, caméra). */
    speed(s: number): void {
      runtime.speed = Math.max(0, s);
    },
    /** Fixe le nombre d'ennemis à maintenir (0 = arrêt). Équivaut à `?stress=n`. */
    stress(n: number): void {
      stressTarget = Math.min(CAPS.enemies, Math.max(0, n | 0));
      stressWorld = null;
    },
    get stressTarget() {
      return stressTarget;
    },
  };

  const runtime: DebugRuntime = {
    speed: 1,
    onFrame(world) {
      if (stressTarget <= 0) return;
      if (stressWorld !== world) {
        stressWorld = world;
        world.player.maxHp = world.player.hp = 1e9; // on mesure le rendu, pas la survie
      }
      // recomplète par paquets : les armes tuent en continu, l'anneau reste hors écran (14–24 u)
      const missing = stressTarget - world.enemyCount;
      if (missing <= 0) return;
      const n = Math.min(20, missing);
      const base = world.rng.next() * Math.PI * 2;
      for (let i = 0; i < n; i++) spawnEnemy(world, i % 3, base + (i / n) * Math.PI * 2, 14 + (i % 5) * 2.5);
    },
  };

  (window as unknown as { __game: unknown }).__game = {
    get world() {
      return host.world;
    },
    get app() {
      return host.app;
    },
    get renderer() {
      return host.scene.renderer;
    },
    get audioVoices() {
      return host.audioVoices();
    },
    scene: host.scene,
    start: (variant?: number) => host.start(variant),
    debug,
    // raccourcis historiques
    warp: debug.warp,
    kill: debug.kill,
    ready: true,
  };
  return runtime;
}
