// Hooks de debug et de test (skill sim-testing §6) : exposés sur `window.__game`
// uniquement en développement ou avec `?debug=1`. Jamais appelés par le jeu lui-même.
import type { GameScene } from './render/scene';
import { STEP } from './sim/balance';
import { spawnEnemy } from './sim/spawner';
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

export function installDebugHooks(host: DebugHost): void {
  if (!debugEnabled()) return;
  const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };
  const w = () => host.world;

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
}
