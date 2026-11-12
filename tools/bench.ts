// Bench : 400 ennemis forcés, 600 steps. Échoue si p95 > 6 ms, max > 20 ms ou tas +2 Mo.
import { It, STEP } from '../src/sim/balance';
import { gainItem } from '../src/sim/items';
import { startRun, step } from '../src/sim/step';
import { spawnEnemy } from '../src/sim/spawner';
import { World } from '../src/sim/world';
import { refreshStats } from '../src/sim/weapons/defs';
import { snapshotWorld } from '../src/sim/snapshot';

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
  if (w.enemyCount < 380) for (let k = w.enemyCount; k < 400; k++) spawnEnemy(w, MIX[k % MIX.length], k, 8 + (k % 13));
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
// pas (pause, fermeture, toutes les 20 s de jeu), mais il ne doit pas faire sauter une image sur téléphone
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
const ok = +p(0.95) <= 6 && maxMs <= 20 && heapMb <= 2 && snapMs <= 6 && snapLen <= 600_000; // max : une désoptimisation V8 après une carte se voit ici (phase 12)
console.log(ok ? 'BENCH OK' : 'BENCH ÉCHEC (p95 ≤ 6 ms, max ≤ 20 ms, tas ≤ +2 Mo, instantané ≤ 6 ms et 600 Ko)');
process.exit(ok ? 0 : 1);
