// CLI d'équilibrage : fait jouer un bot N fois, imprime des percentiles, compare aux cibles.
//   npm run sim -- --runs 200 --bot average --seed 42 [--until 1200] [--out sim/out.json] [--weapons orbe,foudre]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, ENEMIES, MAX_PASSIVES, MAX_WEAPONS, SHOP, SLOTS_START, STEP } from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { HurtSrc, Ev, Mode } from '../src/sim/types';
import type { CharacterKey, Input, WeaponKey } from '../src/sim/types';
import { WEAPON_KEYS } from '../src/sim/weapons/defs';
import { World } from '../src/sim/world';
import { ACHIEVEMENTS } from '../src/meta/achievements';
import { enforceAllowed, makeBot, pickAllowed } from './bots';
import { PROFILES, checkTargets, shopTotalCost } from './targets';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '1');
const RUNS = +(args.get('runs') ?? 50);
const BOT = args.get('bot') ?? 'average';
const SEED = +(args.get('seed') ?? 42);
const UNTIL = +(args.get('until') ?? 1200);
const OUT = args.get('out');
// --weapons orbe,foudre : arme de départ = la première, le bot ne prend jamais une arme hors liste
// --character eclaireuse|bucheron|sorciere : personnage de départ (défaut : Éclaireuse = référence de l'équilibrage)
const CHARACTER = (args.get('character') ?? 'eclaireuse') as CharacterKey;
if (!CHARACTERS.some((c) => c.key === CHARACTER)) {
  console.error(`--character : « ${CHARACTER} » inconnu. Valeurs : ${CHARACTERS.map((c) => c.key).join(', ')}`);
  process.exit(2);
}
// --upgrades 0|max|<n>|hp=8,revive=0,… : paliers de boutique (uniformes, ou par ligne, bornés) ; défaut 0 = run « nu »
const UPGRADES_ARG = args.get('upgrades') ?? '0';
const UPGRADES: number[] = SHOP.lines.map((l) => {
  if (UPGRADES_ARG === 'max') return l.tiers;
  if (UPGRADES_ARG.includes('=')) {
    const m = UPGRADES_ARG.split(',').find((p) => p.trim().startsWith(l.key + '='));
    return m ? Math.max(0, Math.min(l.tiers, +m.split('=')[1] || 0)) : 0;
  }
  return Math.max(0, Math.min(l.tiers, +UPGRADES_ARG || 0));
});
// --slots start|max|w,p : emplacements d'armes et d'améliorations (phase 10) ; défaut start = 1 arme, 2 améliorations
const SLOTS_ARG = args.get('slots') ?? (UPGRADES_ARG === 'max' ? 'max' : 'start');
const SLOT_OPT =
  SLOTS_ARG === 'max'
    ? { weapons: MAX_WEAPONS, passives: MAX_PASSIVES }
    : SLOTS_ARG === 'start'
      ? { ...SLOTS_START }
      : { weapons: +SLOTS_ARG.split(',')[0] || 1, passives: +SLOTS_ARG.split(',')[1] || 2 };
// --profile naked|maxed : jeu de cibles (défaut : naked si --upgrades 0, maxed sinon)
const PROFILE = (args.get('profile') ?? (UPGRADES_ARG === '0' ? 'naked' : 'maxed')) as keyof typeof PROFILES;
if (!PROFILES[PROFILE]) {
  console.error(`--profile : « ${PROFILE} » inconnu. Valeurs : ${Object.keys(PROFILES).join(', ')}`);
  process.exit(2);
}
const WEAPONS_ARG = args.get('weapons');
const WEAPONS: WeaponKey[] | null = WEAPONS_ARG
  ? (WEAPONS_ARG.split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0) as WeaponKey[])
  : null;
if (WEAPONS) {
  const unknown = WEAPONS.filter((k) => !(WEAPON_KEYS as string[]).includes(k));
  if (WEAPONS.length === 0) {
    console.error(`--weapons : liste vide. Clés valides : ${WEAPON_KEYS.join(', ')}`);
    process.exit(2);
  }
  if (unknown.length > 0) {
    const pl = unknown.length > 1 ? 's' : '';
    console.error(
      `--weapons : clé${pl} inconnue${pl} « ${unknown.join(', ')} ». Clés valides : ${WEAPON_KEYS.join(', ')}`,
    );
    process.exit(2);
  }
}
const ALLOWED: ReadonlySet<string> | null = WEAPONS ? new Set(WEAPONS) : null;

interface RunResult {
  seed: number;
  time: number;
  kills: number;
  level: number;
  reachedEnd: boolean;
  killsAt10: number;
  levelAt10: number;
  weapons: Record<string, number>;
  tomes: Record<string, number>;
  triples: number; // cartes à 3 lignes prises (phase 12)
  weaponLvBest: number; // meilleur niveau d'arme du run
  weaponLvAt10: number; // meilleur niveau d'arme à 10 min (−1 si mort avant)
  cards: number; // cartes prises
  lines: number; // lignes reçues
  deathBy: string;
  eruptions: number; // phase 11 : éruptions subies (pics sortis sous le joueur)…
  eruptionHits: number; // …et combien l'ont touché (lisibilité du télégraphe pour le bot)
  gold: number; // or du run (phase 8 : économie de la boutique)
  // défis (phase 6)
  noHit: number; // plus longue période sans dégât (s)
  distance: number; // u parcourus
  aliveAtMinute: number[];
}

function runOnce(seed: number): RunResult {
  const w = new World(seed, { character: CHARACTER, upgrades: UPGRADES, slots: SLOT_OPT });
  if (WEAPONS) w.weapons = { [WEAPONS[0]]: 1 };
  startRun(w);
  const bot = makeBot(BOT, seed * 7 + 1);
  const inp: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };
  let frame = 0;
  let killsAt10 = -1,
    levelAt10 = -1,
    weaponLvAt10 = -1,
    cardsTaken = 0,
    linesTaken = 0;
  let lastHurtType = 'inconnu';
  let eruptions = 0,
    eruptionHits = 0;
  // phase 11 : les dangers (éruption, anneau, charge, crachat, zone) sont nommés ; le contact garde l'ennemi le plus proche
  const HURT_NAMES: Record<number, string | undefined> = {
    [HurtSrc.Eruption]: 'éruption',
    [HurtSrc.Ring]: 'anneau',
    [HurtSrc.Charge]: 'charge',
    [HurtSrc.Spit]: 'crachat',
    [HurtSrc.Zone]: 'zone',
    [HurtSrc.Arrow]: 'flèche',
    [HurtSrc.Fire]: 'feu',
  };
  const alive: number[] = [];
  const maxFrames = UNTIL / STEP;
  while (frame < maxFrames) {
    if (w.mode === Mode.LevelUp) {
      inp.pick = pickAllowed(bot, w, w.cards, ALLOWED);
      inp.mx = inp.mz = 0;
      inp.jump = inp.dash = false;
    } else {
      inp.pick = -1;
      bot.decide(w, frame, inp);
      frame++;
    }
    if (inp.pick >= 0 && w.cards[inp.pick]) {
      cardsTaken++;
      linesTaken += w.cards[inp.pick].n;
    }
    step(w, inp, STEP);
    if (inp.pick >= 0) enforceAllowed(w, ALLOWED);
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e.type === Ev.Eruption) eruptions++;
      if (e.type === Ev.PlayerHurt && w.lastHurt === HurtSrc.Eruption) eruptionHits++;
      if (e.type === Ev.PlayerHurt && frame % 15 === 0) {
        // type d'ennemi le plus proche = cause probable
        let bd = 1e9;
        for (let k = 0; k < w.enemyCount; k++) {
          const en = w.enemies[k];
          const d = (en.x - w.player.x) ** 2 + (en.z - w.player.z) ** 2;
          if (d < bd) {
            bd = d;
            lastHurtType = ENEMIES[en.type].key;
          }
        }
      }
    }
    if (w.t >= 600 && killsAt10 < 0) {
      killsAt10 = w.kills;
      levelAt10 = w.player.level;
      weaponLvAt10 = w.weaponLvBest;
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
    tomes: { ...w.tomes } as Record<string, number>,
    triples: w.triples,
    weaponLvBest: w.weaponLvBest,
    weaponLvAt10,
    cards: cardsTaken,
    lines: linesTaken,
    deathBy: w.mode === Mode.Dead ? (HURT_NAMES[w.lastHurt] ?? lastHurtType) : '—',
    eruptions,
    eruptionHits,
    gold: Math.round(w.gold),
    noHit: w.noHitBest,
    distance: w.distance,
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
// taux de pick = part des prises de cartes d'arme (somme 100 %), arme de départ exclue (survivor-design §9)
const charDef = CHARACTERS.find((c) => c.key === CHARACTER) ?? CHARACTERS[0];
const goal = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)?.goal ?? Infinity;
const startWeapon = WEAPONS ? WEAPONS[0] : charDef.weapon;
const picks: Record<string, number> = {};
let totalPicks = 0;
for (const r of results)
  for (const k of Object.keys(r.weapons)) {
    if (k === startWeapon) continue;
    picks[k] = (picks[k] ?? 0) + 1;
    totalPicks++;
  }
// variance inter-builds : médiane de kills@10 par arme principale (la plus haute hors départ) ; max / min des groupes ≥ 5 runs
const byBuild: Record<string, number[]> = {};
for (const r of results) {
  if (r.killsAt10 < 0) continue;
  let main: string = startWeapon,
    best = -1;
  for (const [k, lv] of Object.entries(r.weapons)) {
    if (k === startWeapon || lv <= best) continue;
    best = lv;
    main = k;
  }
  (byBuild[main] ??= []).push(r.killsAt10);
}
const buildMedians = Object.fromEntries(
  Object.entries(byBuild)
    .filter(([, v]) => v.length >= 5)
    .map(([k, v]) => [k, pct(v, 50)]),
);
const medianValues = Object.values(buildMedians);
const killsVarianceRatio =
  medianValues.length > 1 ? Math.max(...medianValues) / Math.max(1, Math.min(...medianValues)) : 1;
const deaths: Record<string, number> = {};
for (const r of results) if (!r.reachedEnd) deaths[r.deathBy] = (deaths[r.deathBy] ?? 0) + 1;
const at10 = results.filter((r) => r.killsAt10 >= 0);
const summary = {
  runs: RUNS,
  bot: BOT,
  seed: SEED,
  weapons: WEAPONS,
  character: CHARACTER,
  upgrades: UPGRADES_ARG,
  slots: `${SLOT_OPT.weapons},${SLOT_OPT.passives}`,
  profile: PROFILE,
  survival: { p10: pct(times, 10), p50: pct(times, 50), p90: pct(times, 90) },
  reachedEndPct: (100 * results.filter((r) => r.reachedEnd).length) / RUNS,
  deadBefore3minPct: (100 * results.filter((r) => r.time < 180).length) / RUNS,
  // économie (phase 8) : or médian par run, paliers payés par run au 1er coût, runs pour tout maxer un personnage
  goldP50: pct(
    results.map((r) => r.gold),
    50,
  ),
  firstTierCost: Math.round(SHOP.base),
  runsToMax:
    shopTotalCost() /
    Math.max(
      1,
      pct(
        results.map((r) => r.gold),
        50,
      ),
    ),
  // défis (phase 6) : médianes et part des runs qui les atteignent (Intouchable 3 min, Marathon 2 000 u, Métamorphe 2 évolutions)
  challenges: {
    noHitP50: pct(
      results.map((r) => r.noHit),
      50,
    ),
    intouchablePct: (100 * results.filter((r) => r.noHit >= goal('intouchable')).length) / RUNS,
    distanceP50: pct(
      results.map((r) => r.distance),
      50,
    ),
    marathonPct: (100 * results.filter((r) => r.distance >= goal('marathon')).length) / RUNS,
    eruditPct: (100 * results.filter((r) => r.weaponLvBest >= goal('erudit')).length) / RUNS,
    triple1Pct: (100 * results.filter((r) => r.triples >= goal('triple1')).length) / RUNS,
  },
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
  pickPct: Object.fromEntries(
    Object.entries(picks).map(([k, v]) => [k, Math.round((100 * v) / Math.max(1, totalPicks))]),
  ),
  // phase 12 : lignes par carte, part de cartes épiques, niveau d'arme principale à 10 min
  linesPerCard: +(
    results.reduce((a, r) => a + r.lines, 0) /
    Math.max(
      1,
      results.reduce((a, r) => a + r.cards, 0),
    )
  ).toFixed(2),
  triplePct: Math.round(
    (100 * results.reduce((a, r) => a + r.triples, 0)) /
      Math.max(
        1,
        results.reduce((a, r) => a + r.cards, 0),
      ),
  ),
  weaponLvAt10p50: at10.length
    ? pct(
        at10.map((r) => r.weaponLvAt10),
        50,
      )
    : -1,
  weaponLvBestP50: pct(
    results.map((r) => r.weaponLvBest),
    50,
  ),
  buildMedians,
  killsVarianceRatio,
  eruptionsPerRun: +(results.reduce((a, r) => a + r.eruptions, 0) / RUNS).toFixed(1),
  eruptionHitPct: Math.round(
    (100 * results.reduce((a, r) => a + r.eruptionHits, 0)) /
      Math.max(
        1,
        results.reduce((a, r) => a + r.eruptions, 0),
      ),
  ),
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
lines.push(
  `runs ${RUNS} · bot ${BOT} · seed ${SEED}${CHARACTER !== 'eclaireuse' ? ` · --character ${CHARACTER}` : ''}${WEAPONS ? ` · --weapons ${WEAPONS.join(',')}` : ''} · paliers ${UPGRADES_ARG} · emplacements ${SLOT_OPT.weapons}/${SLOT_OPT.passives} · profil ${PROFILE} · ${elapsed.toFixed(1)} s (${summary.runsPerMin} runs/min)`,
);
lines.push(
  `survie      p10 ${mmss(summary.survival.p10)}  p50 ${mmss(summary.survival.p50)}  p90 ${mmss(summary.survival.p90)}  fin atteinte ${summary.reachedEndPct.toFixed(0)} %`,
);
lines.push(
  `morts <3min ${summary.deadBefore3minPct.toFixed(0)} %   niveau@10 p50 ${summary.levelAt10p50}   kills@10 p50 ${summary.killsAt10p50}`,
);
lines.push(
  `or          p50 ${summary.goldP50} · ${(summary.goldP50 / summary.firstTierCost).toFixed(1)} premier(s) palier(s) par run · ${summary.runsToMax.toFixed(0)} runs pour tout maxer un personnage`,
);
lines.push(
  `défis       sans dégât p50 ${mmss(summary.challenges.noHitP50)} (Intouchable ${summary.challenges.intouchablePct.toFixed(0)} %) · distance p50 ${Math.round(summary.challenges.distanceP50)} u (Marathon ${summary.challenges.marathonPct.toFixed(0)} %) · Érudit ${summary.challenges.eruditPct.toFixed(0)} % · Triple ligne ${summary.challenges.triple1Pct.toFixed(0)} %`,
);
lines.push(
  `picks       ${Object.entries(summary.pickPct)
    .map(([k, v]) => `${k} ${v} %`)
    .join(' · ')}`,
);
lines.push(
  `lignes      ${summary.linesPerCard} par carte · ${summary.triplePct} % de cartes épiques · arme principale niv ${summary.weaponLvAt10p50} à 10 min, ${summary.weaponLvBestP50} en fin de run`,
);
lines.push(
  `kills@10/build ${Object.entries(summary.buildMedians)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ')}  (écart ×${summary.killsVarianceRatio.toFixed(1)})`,
);
lines.push(
  `cause mort  ${Object.entries(summary.deathBy)
    .map(([k, v]) => `${k} ${v} %`)
    .join(' · ')}`,
);
lines.push(
  `éruptions   ${summary.eruptionsPerRun} par run · ${summary.eruptionHitPct} % touchent le bot · ${summary.deathBy['éruption'] ?? 0} % des morts`,
);
lines.push(`vivants/min ${summary.aliveCurve.join(' ')}`);
const checks = checkTargets(summary, PROFILES[PROFILE]);
lines.push(`cibles      ${checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.name} (${c.value})`).join('  ')}`);
if (!checks.every((c) => c.ok)) lines.push('cibles non atteintes : à régler dans balance.ts (survivor-design §9)');
console.log(lines.join('\n'));

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ summary, checks, results }, null, 1));
  console.log(`→ ${OUT}`);
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
