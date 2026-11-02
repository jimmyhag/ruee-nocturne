// Bench : 400 ennemis forcés, 600 steps. Échoue si p95 > 6 ms ou tas +2 Mo.
import { STEP } from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { spawnEnemy } from '../src/sim/spawner';
import { World } from '../src/sim/world';

const w = new World(1);
startRun(w);
w.t = 400; // mi-partie : armes dangereuses, ennemis costauds
w.weapons = { orbe: 4, aura: 3, lames: 3, foudre: 2 };
for (let i = 0; i < 390; i++) spawnEnemy(w, i % 3, (i / 390) * Math.PI * 2, 6 + (i % 17));
const inp = { mx: 0.7, mz: 0.3, jump: false, dash: false, pick: 0 };
w.player.maxHp = 1e9; // invincible : on mesure le coût du step, pas la survie
const gc = (globalThis as any).gc as (() => void) | undefined;
// chauffe
w.player.hp = 1e9;
for (let i = 0; i < 120; i++) {
  w.player.hp = 1e9;
  step(w, inp, STEP);
}
gc?.();
const heap0 = process.memoryUsage().heapUsed;
const times: number[] = [];
for (let i = 0; i < 600; i++) {
  inp.mx = Math.cos(i / 60);
  inp.mz = Math.sin(i / 60);
  w.player.hp = 1e9;
  const t0 = performance.now();
  step(w, inp, STEP);
  times.push(performance.now() - t0);
  if (w.enemyCount < 380) for (let k = w.enemyCount; k < 400; k++) spawnEnemy(w, k % 3, k, 8 + (k % 13));
}
gc?.();
const heap1 = process.memoryUsage().heapUsed;
times.sort((a, b) => a - b);
const p = (q: number) => times[Math.floor(q * times.length)].toFixed(3);
const heapMb = (heap1 - heap0) / 1048576;
console.log(
  `steps 600 · ennemis ~${w.enemyCount} · p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · max ${times[times.length - 1].toFixed(3)} ms · tas ${heapMb >= 0 ? '+' : ''}${heapMb.toFixed(2)} Mo`,
);
const ok = +p(0.95) <= 6 && heapMb <= 2;
console.log(ok ? 'BENCH OK' : 'BENCH ÉCHEC (p95 ≤ 6 ms, tas ≤ +2 Mo)');
process.exit(ok ? 0 : 1);
