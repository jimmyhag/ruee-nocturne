// Bench : 400 ennemis forcés, 600 steps. Échoue si p95 > 6 ms, max > 20 ms ou tas +2 Mo.
import { It, STEP, WEAPON_LINES } from '../src/sim/balance';
import { gainItem } from '../src/sim/items';
import { startRun, step } from '../src/sim/step';
import { spawnEnemy } from '../src/sim/spawner';
import { corrupt } from '../src/sim/corrupt';
import { World } from '../src/sim/world';
import { refreshStats } from '../src/sim/weapons/defs';
import { snapshotWorld } from '../src/sim/snapshot';
import { hitEnemy } from '../src/sim/combat';
import { heartOf, summonHeart } from '../src/sim/final';
import { enterArena, nextStage } from '../src/sim/stages';
import { Role } from '../src/sim/types';

const w = new World(1);
startRun(w);
w.t = w.stageT = w.diffT = 400; // mi-partie : armes dangereuses, ennemis costauds (phase 37 : la difficulté suit diffT)
w.weapons = { orbe: 5, aura: 3, boomerang: 3, mines: 3 }; // 4 armes (max) dont les deux de phase 3
// cas le plus chargé : Orbe à +5 projectiles et +3 perforations, tome Projectiles à +3 (8 tirs transperçants par salve)
w.wmods.orbe[2] = 5;
w.wmods.orbe[4] = 3;
w.player.projAdd = 3;
refreshStats(w);
// masse + Volants + Cracheurs : types 0,1,2 puis 4 et 5 (le modulo 5 ignore le Gardien, type 3)
const MIX = [0, 1, 2, 4, 5, 9, 10]; // masse + Volants + Cracheurs + Archers et Sorciers (phase 16 ; le Gardien, type 3, est exclu) ; hissé hors de la fenêtre de mesure du tas
for (let i = 0; i < 390; i++) spawnEnemy(w, MIX[i % MIX.length], (i / 390) * Math.PI * 2, 6 + (i % 17));
// 1.67.0 (docs/specs/corrompus.md) : un monstre sur trois corrompu, comme en fin de prolongation (Scission, Ruée,
// flaques de feu, bombes, éventails, volées, pluies de feu) ; leurs compétences prennent le pool de tirs, sans allocation
for (let i = 0; i < w.enemyCount; i++) if (i % 3 === 0) corrupt(w, w.enemies[i]);
// phase 43 (relecture perf) : six boss enragés en phase 2 (deux de chaque), pour que le bench couvre leurs attaques
// (Traque et Éclats depuis la phase 45, double onde, salve, croix, onde de choc) : tirs pris dans le pool, aucune allocation attendue
for (let i = 0; i < 6; i++) {
  const e = w.enemies[spawnEnemy(w, [3, 6, 7][i % 3], (i / 6) * Math.PI * 2, 9)];
  e.max = 1e12;
  e.hp = e.max * 0.4;
  e.enraged = true;
}
const inp = { mx: 0.7, mz: 0.3, jump: false, spell: false, pick: 0 };
w.player.maxHp = 1e9; // invincible : on mesure le coût du step, pas la survie
// phase 31 (relecture perf) : objets de soin et de dégâts actifs, PV sous le maximum (vol de vie, Couronne, Second souffle)
for (const it of [It.Croc, It.Calice, It.Mousse, It.Souffle, It.Gant, It.Couronne]) gainItem(w, it);
// phase 47 B (relecture perf) : brûlure sur critique, tir doublé, bonus sur cible ralentie
for (const it of [It.Dent, It.Miroir, It.Glace, It.Trophee, It.Bandage]) gainItem(w, it);
w.player.crit = 0.3;
const HP = 3e8; // 30 % des PV max : Couronne et Second souffle jouent, le vol de vie trouve de la place
const gc = (globalThis as any).gc as (() => void) | undefined;
// chauffe
w.player.hp = HP;
for (let i = 0; i < 120; i++) {
  w.player.hp = HP;
  step(w, inp, STEP);
}
gc?.();
const heap0 = process.memoryUsage().heapUsed;
const times: number[] = [];
for (let i = 0; i < 600; i++) {
  inp.mx = Math.cos(i / 60);
  inp.mz = Math.sin(i / 60);
  inp.spell = i % 45 === 0; // phase 19 : le sort de classe est lancé régulièrement (Bond de l'Éclaireuse)
  w.player.hp = HP;
  const t0 = performance.now();
  step(w, inp, STEP);
  times.push(performance.now() - t0);
  if (w.enemyCount < 380)
    for (let k = w.enemyCount; k < 400; k++) {
      const j = spawnEnemy(w, MIX[k % MIX.length], k, 8 + (k % 13));
      if (j >= 0 && k % 3 === 0) corrupt(w, w.enemies[j]);
    }
}
gc?.();
const heap1 = process.memoryUsage().heapUsed;
times.sort((a, b) => a - b);
const p = (q: number) => times[Math.floor(q * times.length)].toFixed(3);
const heapMb = (heap1 - heap0) / 1048576;
console.log(
  `steps 600 · ennemis ~${w.enemyCount} · p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · max ${times[times.length - 1].toFixed(3)} ms · tas ${heapMb >= 0 ? '+' : ''}${heapMb.toFixed(2)} Mo`,
);
// phase 49 : partie gardée sur l'appareil. Un instantané (instantané + texte) à 400 ennemis : hors de la boucle de
// pas (pause, fermeture, choix de cartes, marchand), mais il ne doit pas faire sauter une image sur téléphone
const snapTimes: number[] = [];
let snapLen = 0;
for (let i = 0; i < 20; i++) {
  const t0 = performance.now();
  snapLen = JSON.stringify(snapshotWorld(w)).length;
  snapTimes.push(performance.now() - t0);
}
snapTimes.sort((a, b) => a - b);
const snapMs = snapTimes[snapTimes.length >> 1];
console.log(`instantané de partie : p50 ${snapMs.toFixed(2)} ms · ${(snapLen / 1024).toFixed(0)} Ko`);
const maxMs = times[times.length - 1];
// 1.68.0 (docs/specs/boss-final.md) : l'Arène du boss final, éclipse puis fureur (doubles qui partent et reviennent,
// cercle de flammes qui se resserre, Jugement), 60 corrompus et les mêmes armes : aucune allocation par pas attendue
const a = new World(2);
a.weapons = { orbe: 5, aura: 3, boomerang: 3, mines: 3 };
refreshStats(a);
a.player.maxHp = 1e9;
nextStage(a);
nextStage(a);
enterArena(a);
summonHeart(a);
/** Le boss final passe à la phase suivante (seuil atteint, sceaux brisés en phase 2), pause retirée. */
const nextPhase = (): void => {
  const p0 = a.finalPhase;
  for (let k = 0; k < 4 && a.finalPhase === p0; k++) {
    a.finalPause = 0;
    const h = heartOf(a)!;
    if (a.finalPhase === 2) {
      for (let i = 0; i < a.enemyCount; i++) if (a.enemies[i].role === Role.Seal) hitEnemy(a, i, 1e12, 0, 0, 0);
    } else hitEnemy(a, a.enemies.indexOf(h), 1e12, 0, 0, 0);
    step(a, inp, STEP);
  }
  a.finalPause = 0;
};
for (let i = 0; i < 60; i++) {
  const j = spawnEnemy(a, MIX[i % MIX.length], (i / 60) * Math.PI * 2, 6);
  if (j >= 0 && i % 2 === 0) corrupt(a, a.enemies[j]);
}
const arenaTimes: number[] = [];
const runArena = (n: number) => {
  for (let i = 0; i < n; i++) {
    inp.mx = Math.cos(i / 50);
    inp.mz = Math.sin(i / 50);
    a.player.hp = HP;
    const h = heartOf(a);
    if (h && a.finalPhase === 4) h.hp = h.max; // il ne tombe pas pendant la mesure
    if (a.finalPhase === 2)
      for (let k = 0; k < a.enemyCount; k++) if (a.enemies[k].role === Role.Seal) a.enemies[k].hp = a.enemies[k].max; // les sceaux tiennent
    const t0 = performance.now();
    step(a, inp, STEP);
    arenaTimes.push(performance.now() - t0);
  }
};
nextPhase(); // les sceaux : stèles, renforts corrompus (le premier groupe tout de suite), boss invulnérable
a.addT = 0;
runArena(120); // chauffe
arenaTimes.length = 0;
gc?.();
const aHeap0 = process.memoryUsage().heapUsed;
runArena(300); // les sceaux et leurs renforts
nextPhase();
runArena(300); // l'éclipse
nextPhase();
runArena(300); // la fureur
gc?.();
const aHeapMb = (process.memoryUsage().heapUsed - aHeap0) / 1048576;
arenaTimes.sort((x, y) => x - y);
const aP95 = arenaTimes[Math.floor(0.95 * arenaTimes.length)],
  aMax = arenaTimes[arenaTimes.length - 1];
console.log(
  `Arène (boss final, phases 2–${a.finalPhase}, 900 pas) : p50 ${arenaTimes[arenaTimes.length >> 1].toFixed(3)} ms · p95 ${aP95.toFixed(3)} ms · max ${aMax.toFixed(3)} ms · tas ${aHeapMb >= 0 ? '+' : ''}${aHeapMb.toFixed(2)} Mo`,
);
// 1.69.0 (docs/specs/rafales-faux-guidage.md, relecture perf) : les rafales et les trois faux. Orbe, Lance, Fouet et
// Faux, chaque ligne « +1 » au plafond et le tome Projectiles à +3 : rafales de 9 orbes, 8 lances, 4 claques, 3 faux,
// cibles choisies tir par tir parmi 400 ennemis (burstTarget) ; mêmes budgets, aucune allocation attendue
const r = new World(3);
startRun(r);
r.t = r.stageT = r.diffT = 400;
r.weapons = { orbe: 8, lance: 8, fouet: 8, faux: 8 };
for (const k of ['orbe', 'lance', 'fouet', 'faux'] as const) {
  const lines = WEAPON_LINES[k];
  for (let j = 0; j < lines.length; j++) if (lines[j].stat === 'n') r.wmods[k][j] = lines[j].max ?? 0;
}
r.player.projAdd = 3;
refreshStats(r);
r.player.maxHp = 1e9;
for (let i = 0; i < 400; i++) spawnEnemy(r, MIX[i % MIX.length], (i / 400) * Math.PI * 2, 3 + (i % 17));
const burstTimes: number[] = [];
const runBurst = (n: number, keep: boolean) => {
  for (let i = 0; i < n; i++) {
    inp.mx = Math.cos(i / 60);
    inp.mz = Math.sin(i / 60);
    r.player.hp = HP;
    const t0 = performance.now();
    step(r, inp, STEP);
    if (keep) burstTimes.push(performance.now() - t0);
    if (r.enemyCount < 380)
      for (let k = r.enemyCount; k < 400; k++) spawnEnemy(r, MIX[k % MIX.length], k, 4 + (k % 13));
  }
};
runBurst(120, false); // chauffe
gc?.();
const bHeap0 = process.memoryUsage().heapUsed;
runBurst(600, true);
gc?.();
const bHeapMb = (process.memoryUsage().heapUsed - bHeap0) / 1048576;
burstTimes.sort((x, y) => x - y);
const bP95 = burstTimes[Math.floor(0.95 * burstTimes.length)],
  bMax = burstTimes[burstTimes.length - 1];
console.log(
  `rafales et faux (Orbe ${r.wstats.orbe.n}, Lance ${r.wstats.lance.n}, Fouet ${r.wstats.fouet.n}, Faux ${r.wstats.faux.n} ; 600 pas, ~${r.enemyCount} ennemis) : p50 ${burstTimes[burstTimes.length >> 1].toFixed(3)} ms · p95 ${bP95.toFixed(3)} ms · max ${bMax.toFixed(3)} ms · tas ${bHeapMb >= 0 ? '+' : ''}${bHeapMb.toFixed(2)} Mo`,
);
const ok =
  bP95 <= 6 &&
  bMax <= 20 &&
  bHeapMb <= 2 &&
  +p(0.95) <= 6 &&
  maxMs <= 20 &&
  heapMb <= 2 &&
  snapMs <= 6 &&
  snapLen <= 600_000 &&
  aP95 <= 6 &&
  aMax <= 20 &&
  aHeapMb <= 2; // max : une désoptimisation V8 après une carte se voit ici (phase 12)
console.log(ok ? 'BENCH OK' : 'BENCH ÉCHEC (p95 ≤ 6 ms, max ≤ 20 ms, tas ≤ +2 Mo, instantané ≤ 6 ms et 600 Ko)');
process.exit(ok ? 0 : 1);
