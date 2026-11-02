// CLI d'équilibrage : fait jouer un bot N fois, imprime des percentiles, compare aux cibles.
//   npm run sim -- --runs 200 --bot average --seed 42 [--until 1200] [--out sim/out.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { STEP, ENEMIES } from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { Ev, Mode } from '../src/sim/types';
import type { Input } from '../src/sim/types';
import { World } from '../src/sim/world';
import { makeBot } from './bots';
import { TARGETS, checkTargets } from './targets';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '1');
const RUNS = +(args.get('runs') ?? 50);
const BOT = args.get('bot') ?? 'average';
const SEED = +(args.get('seed') ?? 42);
const UNTIL = +(args.get('until') ?? 1200);
const OUT = args.get('out');

interface RunResult {
  seed: number;
  time: number;
  kills: number;
  level: number;
  reachedEnd: boolean;
  killsAt10: number;
  levelAt10: number;
  weapons: Record<string, number>;
  passives: Record<string, number>;
  deathBy: string;
  aliveAtMinute: number[];
}

function runOnce(seed: number): RunResult {
  const w = new World(seed);
  startRun(w);
  const bot = makeBot(BOT, seed * 7 + 1);
  const inp: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };
  let frame = 0;
  let killsAt10 = -1,
    levelAt10 = -1;
  let lastHurtType = 'inconnu';
  const alive: number[] = [];
  const maxFrames = UNTIL / STEP;
  while (frame < maxFrames) {
    if (w.mode === Mode.LevelUp) {
      inp.pick = bot.pick(w, w.cards);
      inp.mx = inp.mz = 0;
      inp.jump = inp.dash = false;
    } else {
      inp.pick = -1;
      bot.decide(w, frame, inp);
      frame++;
    }
    step(w, inp, STEP);
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e.type === Ev.PlayerHurt && frame % 15 === 0) {
        // type d'ennemi le plus proche = cause probable
        let bd = 1e9;
        for (let k = 0; k < w.enemyCount; k++) {
          const en = w.enemies[k];
          const d = (en.x - w.player.x) ** 2 + (en.z - w.player.z) ** 2;
          if (d < bd) {
            bd = d;
            lastHurtType = ENEMIES[en.type].name;
          }
        }
      }
    }
    if (w.t >= 600 && killsAt10 < 0) {
      killsAt10 = w.kills;
      levelAt10 = w.player.level;
    }
    if (Math.floor(w.t / 60) >= alive.length) alive.push(1);
    if (w.mode === Mode.Dead) break;
  }
  return {
    seed,
    time: w.t,
    kills: w.kills,
    level: w.player.level,
    reachedEnd: w.mode !== Mode.Dead,
    killsAt10,
    levelAt10,
    weapons: { ...w.weapons } as Record<string, number>,
    passives: { ...w.passives } as Record<string, number>,
    deathBy: w.mode === Mode.Dead ? lastHurtType : '—',
    aliveAtMinute: alive,
  };
}

const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const t0 = Date.now();
const results: RunResult[] = [];
for (let i = 0; i < RUNS; i++) results.push(runOnce(SEED * 1000 + i));
const elapsed = (Date.now() - t0) / 1000;

const times = results.map((r) => r.time);
const picks: Record<string, number> = {};
for (const r of results) for (const k of Object.keys(r.weapons)) picks[k] = (picks[k] ?? 0) + 1;
const deaths: Record<string, number> = {};
for (const r of results) if (!r.reachedEnd) deaths[r.deathBy] = (deaths[r.deathBy] ?? 0) + 1;
const at10 = results.filter((r) => r.killsAt10 >= 0);
const summary = {
  runs: RUNS,
  bot: BOT,
  seed: SEED,
  survival: { p10: pct(times, 10), p50: pct(times, 50), p90: pct(times, 90) },
  reachedEndPct: (100 * results.filter((r) => r.reachedEnd).length) / RUNS,
  deadBefore3minPct: (100 * results.filter((r) => r.time < 180).length) / RUNS,
  killsAt10p50: at10.length
    ? pct(
        at10.map((r) => r.killsAt10),
        50,
      )
    : -1,
  levelAt10p50: at10.length
    ? pct(
        at10.map((r) => r.levelAt10),
        50,
      )
    : -1,
  pickPct: Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, Math.round((100 * v) / RUNS)])),
  deathBy: Object.fromEntries(
    Object.entries(deaths).map(([k, v]) => [
      k,
      Math.round((100 * v) / Math.max(1, RUNS - results.filter((r) => r.reachedEnd).length)),
    ]),
  ),
  aliveCurve: Array.from({ length: Math.ceil(UNTIL / 60) }, (_, m) =>
    Math.round((100 * results.filter((r) => r.time >= (m + 1) * 60).length) / RUNS),
  ),
  runsPerMin: Math.round((RUNS / elapsed) * 60),
};

const lines: string[] = [];
lines.push(`runs ${RUNS} · bot ${BOT} · seed ${SEED} · ${elapsed.toFixed(1)} s (${summary.runsPerMin} runs/min)`);
lines.push(
  `survie      p10 ${mmss(summary.survival.p10)}  p50 ${mmss(summary.survival.p50)}  p90 ${mmss(summary.survival.p90)}  fin atteinte ${summary.reachedEndPct.toFixed(0)} %`,
);
lines.push(
  `morts <3min ${summary.deadBefore3minPct.toFixed(0)} %   niveau@10 p50 ${summary.levelAt10p50}   kills@10 p50 ${summary.killsAt10p50}`,
);
lines.push(
  `picks       ${Object.entries(summary.pickPct)
    .map(([k, v]) => `${k} ${v} %`)
    .join(' · ')}`,
);
lines.push(
  `cause mort  ${Object.entries(summary.deathBy)
    .map(([k, v]) => `${k} ${v} %`)
    .join(' · ')}`,
);
lines.push(`vivants/min ${summary.aliveCurve.join(' ')}`);
const checks = checkTargets(summary, TARGETS);
lines.push(`cibles      ${checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.name} (${c.value})`).join('  ')}`);
console.log(lines.join('\n'));

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ summary, checks, results }, null, 1));
  console.log(`→ ${OUT}`);
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
