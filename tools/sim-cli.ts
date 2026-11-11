// CLI d'équilibrage : fait jouer un bot N fois, imprime des percentiles, compare aux cibles.
//   npm run sim -- --runs 200 --bot average --seed 42 [--until 1200] [--out sim/out.json] [--weapons orbe,foudre]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CHARACTERS,
  STAGE,
  ENDLESS,
  ENEMIES,
  ITEM,
  MAPCHEST,
  ITEM_KEYS,
  MAX_PASSIVES,
  MAX_WEAPONS,
  SLOTS_START,
  STEP,
  SYNERGIES,
  TOME_HELD,
  TOME_POOL,
} from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { HurtSrc, Ev, Mode } from '../src/sim/types';
import type { CharacterKey, Input, WeaponKey } from '../src/sim/types';
import { WEAPON_KEYS } from '../src/sim/weapons/defs';
import { World } from '../src/sim/world';
import { ACHIEVEMENTS } from '../src/meta/achievements';
import { runCharStats } from '../src/meta/chars';
import { DEFAULT_META } from '../src/meta/save';
import { BOT_TUNE, enforceAllowed, makeBot, pickAllowed } from './bots';
import { startEndless } from '../src/sim/stages';
import { ENDLESS_TARGETS, PROFILES, REF_PRICE, checkTargets } from './targets';
import * as BALANCE from '../src/sim/balance';

const args = new Map<string, string>();
// 1.34.1 : une option sans valeur (--endless) n'avale plus l'option suivante
for (let i = 2; i < process.argv.length; i++) {
  const v = process.argv[i + 1];
  const flag = v === undefined || v.startsWith('--');
  args.set(process.argv[i].replace(/^--/, ''), flag ? '1' : v);
  if (!flag) i++;
}
const RUNS = +(args.get('runs') ?? 50);
const BOT = args.get('bot') ?? 'average';
const SEED = +(args.get('seed') ?? 42);
const UNTIL = +(args.get('until') ?? 2400); // phase 37 : trois mondes de 10 min, plus la prolongation
const OUT = args.get('out');
const ENDLESS_ON = args.has('endless'); // phase 39 : continuer en monde infini après la victoire
// --weapons orbe,foudre : arme de départ = la première, le bot ne prend jamais une arme hors liste
// --character eclaireuse|bucheron|sorciere : personnage de départ (défaut : Éclaireuse = référence de l'équilibrage)
const CHARACTER = (args.get('character') ?? 'eclaireuse') as CharacterKey;
const charChal = ACHIEVEMENTS.filter((x) => x.char === CHARACTER); // phase 41
if (!CHARACTERS.some((c) => c.key === CHARACTER)) {
  console.error(`--character : « ${CHARACTER} » inconnu. Valeurs : ${CHARACTERS.map((c) => c.key).join(', ')}`);
  process.exit(2);
}
// --profile naked|maxed : jeu de cibles et emplacements par défaut (phase 17 : la boutique par personnage n'existe plus)
const PROFILE = (args.get('profile') ?? 'naked') as keyof typeof PROFILES;
if (!PROFILES[PROFILE]) {
  console.error(`--profile : « ${PROFILE} » inconnu. Valeurs : ${Object.keys(PROFILES).join(', ')}`);
  process.exit(2);
}
// --slots start|max|w,p : emplacements d'armes et de tomes ; défaut start (nu) ou max (maxé)
const SLOTS_ARG = args.get('slots') ?? (PROFILE === 'maxed' ? 'max' : 'start');
const SLOT_OPT =
  SLOTS_ARG === 'max'
    ? { weapons: MAX_WEAPONS, passives: MAX_PASSIVES }
    : SLOTS_ARG === 'start'
      ? { ...SLOTS_START }
      : { weapons: +SLOTS_ARG.split(',')[0] || 1, passives: +SLOTS_ARG.split(',')[1] || 2 };
// --no-item phenix,talisman : objets jamais obtenus (sim d'ablation de la porte 17)
const NO_ITEM = new Set((args.get('no-item') ?? '').split(',').filter((k) => k.length > 0));
for (const k of NO_ITEM)
  if (!(ITEM_KEYS as readonly string[]).includes(k)) {
    console.error(`--no-item : « ${k} » inconnu. Valeurs : ${ITEM_KEYS.join(', ')}`);
    process.exit(2);
  }
// phase 40 : --items start (défaut du profil nu : sans les 12 objets que la Bibliothèque verrouille pour un nouveau
// joueur) ou all (défaut du profil maxé)
const ITEMS_ARG = args.get('items') ?? (PROFILE === 'maxed' ? 'all' : 'start');
if (ITEMS_ARG !== 'all' && ITEMS_ARG !== 'start') {
  console.error(`--items : « ${ITEMS_ARG} » inconnu. Valeurs : all, start`);
  process.exit(2);
}
const LOCKED_ITEMS =
  ITEMS_ARG === 'start' ? ACHIEVEMENTS.flatMap((a) => (a.unlocks?.item ? [a.unlocks.item] : [])) : [];
// phase 38 : réglage du cumul et des coffres d'élite sans toucher balance.ts (essais d'équilibrage)
if (args.has('elite-every')) ITEM.eliteItemEvery = +args.get('elite-every')!;
if (args.has('stack-full')) ITEM.stackFull = +args.get('stack-full')!;
if (args.has('falloff')) ITEM.stackFalloff = +args.get('falloff')!;
if (args.has('price-growth')) ITEM.priceGrowth = +args.get('price-growth')!;
if (args.has('chest-growth')) MAPCHEST.growth = +args.get('chest-growth')!;
if (args.has('chest-price')) MAPCHEST.price = +args.get('chest-price')!; // prix du premier coffre // 1.33.1 : hausse par coffre acheté
if (args.has('ramp')) {
  // 1.34.1 : échelle de la montée des monstres en monde infini (1 = balance.ts)
  const k = +args.get('ramp')!,
    R = ENDLESS.ramp;
  for (const c of [R.rate, R.hp, R.dmg, R.spd]) for (let i = 0; i < c.length; i++) c[i] *= k;
}
// phase 43 : --set ENDLESS.hpPerWave=0.4,ITEM.stackFull=3,ENDLESS.ramp.hp.0=0.08 : règle n'importe quelle constante
// numérique d'un objet exporté par balance.ts, sans toucher au fichier (un levier à la fois)
if (args.has('set'))
  for (const kv of args.get('set')!.split(',')) {
    const [path, val] = kv.split('=');
    const keys = path.split('.');
    let o: any = BALANCE;
    for (let i = 0; i < keys.length - 1; i++) o = o?.[keys[i]];
    const last = keys[keys.length - 1];
    if (!o || typeof o[last] !== 'number' || !Number.isFinite(+val)) {
      console.error(`--set : « ${kv} » ne désigne pas une constante numérique de balance.ts`);
      process.exit(2);
    }
    o[last] = +val;
  }
if (args.has('tome-prior')) BOT_TUNE.tomePrior = +args.get('tome-prior')!; // phase 47 : 0 = bot d'avant (comparaison)
// phase 47 : --held-tomes remet au tirage les tomes en réserve (TOME_HELD), pour mesurer ce qu'ils coûtent ou rapportent
if (args.has('held-tomes')) TOME_POOL.push(...TOME_HELD);
// phase 47 : --no-tome defi,givre retire des tomes du tirage (ablation : un tome dilue-t-il, aide-t-il, nuit-il ?)
if (args.has('no-tome'))
  for (const k of args.get('no-tome')!.split(',')) {
    const i = TOME_POOL.indexOf(k as (typeof TOME_POOL)[number]);
    if (i < 0) {
      console.error(`--no-tome : « ${k} » n'est pas un tome du tirage`);
      process.exit(2);
    }
    TOME_POOL.splice(i, 1);
  }
// phase 42 : boss de survie (STAGE.survival) : --no-survival pour comparer, --survival-hp 0.4,0.65 pour régler
if (args.has('no-survival')) STAGE.survival.at.length = 0;
if (args.has('survival-hp')) {
  const v = args.get('survival-hp')!.split(',').map(Number);
  for (let i = 0; i < STAGE.survival.hp.length; i++) STAGE.survival.hp[i] = v[i] ?? STAGE.survival.hp[i];
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
  reachedEnd: boolean; // phase 37 : victoire (boss du monde 3 tué à temps)
  stage: number; // phase 37 : monde atteint (1..3)
  endless: boolean; // phase 39 : la partie a continué en monde infini
  chal: number[]; // phase 41 : valeur de chacun des 3 défis du personnage dans cette partie
  endlessT: number;
  endlessWave: number;
  overT: number; // s de prolongation tenues dans le dernier monde (0 : mort avant la fin du chrono)
  totemAt: number[]; // chrono du monde (s) à l'activation de chaque totem
  bossFight: number[]; // s entre l'appel et la mort de chaque boss de totem
  bossLife: { totem: number[]; survie: number[]; infini: number[] }; // phase 43 : s en vie de chaque boss tué, par sorte
  atWin: { items: number; level: number; weaponLv: number } | null; // phase 43 : état à l'entrée en monde infini
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
  stuck: number; // phase 16 : ennemis au sol immobiles plus de 3 s à moins de 30 u du joueur, hors foule (porte : 0)
  gold: number; // or gardé en fin de run (après les achats au marchand)
  goldSpent: number; // phase 17 : or dépensé au marchand
  items: string[]; // phase 17 : objets obtenus (coffres et marchand), dans l'ordre
  itemN: number; // phase 38 : exemplaires compris
  topStack: number; // phase 38 : plus gros cumul d'un même objet
  bought: number; // dont achetés au marchand
  synergies: string[]; // synergies actives en fin de run
  mapChests: number; // phase 18 : coffres de carte ouverts
  powersDropped: number; // phase 35 : bonus apparus
  powersTaken: number; // phase 35 : bonus ramassés
  shrines: number; // sanctuaires pris
  spellCasts: number; // phase 19 : sorts lancés
  spellKills: number; // kills faits par le sort
  goldEarned: number; // or gagné (gardé + dépensé)
  // défis (phase 6)
  noHit: number; // plus longue période sans dégât (s)
  distance: number; // u parcourus
  aliveAtMinute: number[];
}

function runOnce(seed: number): RunResult {
  const w = new World(seed, { character: CHARACTER, slots: SLOT_OPT });
  if (WEAPONS) w.weapons = { [WEAPONS[0]]: 1 };
  // ablation : un objet exclu n'est jamais tiré (coffres et marchand)
  for (const k of NO_ITEM) w.itemBan[ITEM_KEYS.indexOf(k as never)] = 1;
  for (const k of LOCKED_ITEMS) w.itemBan[ITEM_KEYS.indexOf(k)] = 1; // phase 40
  let bought = 0;
  startRun(w);
  const bot = makeBot(BOT, seed * 7 + 1);
  const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
  let frame = 0;
  let killsAt10 = -1,
    levelAt10 = -1,
    weaponLvAt10 = -1,
    cardsTaken = 0,
    linesTaken = 0;
  let lastHurtType = 'inconnu';
  const totemAt: number[] = [],
    bossFight: number[] = [];
  let summonedAt = -1;
  // phase 43 : durée de vie de chaque boss (totem, survie, monde infini) et état du joueur à la victoire
  const bossLife = { totem: [] as number[], survie: [] as number[], infini: [] as number[] };
  const bossBorn = new Map<number, { t: number; kind: 'totem' | 'survie' | 'infini' }>();
  let atWin: RunResult['atWin'] = null;
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
  // phase 16 : ennemis coincés (au sol, hors boss et tireurs, ni au contact) : échantillon toutes les 0,5 s
  const last = new Map<number, { x: number; z: number; still: number; counted: boolean }>();
  let stuck = 0;
  while (frame < maxFrames) {
    if (w.mode === Mode.LevelUp) {
      inp.pick = pickAllowed(bot, w, w.cards, ALLOWED);
      inp.mx = inp.mz = 0;
      inp.jump = inp.spell = false;
    } else if (w.mode === Mode.Merchant) {
      inp.pick = bot.shop(w);
      inp.mx = inp.mz = 0;
      inp.jump = inp.spell = false;
    } else {
      inp.pick = -1;
      bot.decide(w, frame, inp);
      frame++;
    }
    if (w.mode === Mode.Merchant) {
      step(w, inp, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Item && w.events[i].x2 === 1) bought++;
      continue;
    }
    if (inp.pick >= 0 && w.cards[inp.pick]) {
      cardsTaken++;
      linesTaken += w.cards[inp.pick].n;
    }
    step(w, inp, STEP);
    if (inp.pick >= 0) enforceAllowed(w, ALLOWED);
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      if (e.type === Ev.TotemOn) {
        totemAt.push(w.stageT);
        summonedAt = w.t;
      }
      if ((e.type === Ev.PortalOpen || e.type === Ev.Victory) && summonedAt >= 0) {
        bossFight.push(w.t - summonedAt);
        summonedAt = -1;
      }
      if (e.type === Ev.BossSpawn || e.type === Ev.BossKill) {
        // balayage rare (un boss vient d'arriver ou de tomber) : nouveaux boss datés, boss disparus comptés
        for (const [id, b] of bossBorn) {
          let there = false;
          for (let k = 0; k < w.enemyCount; k++) if (w.enemies[k].id === id && w.enemies[k].alive) there = true;
          if (!there) {
            bossLife[b.kind].push(w.t - b.t);
            bossBorn.delete(id);
          }
        }
        for (let k = 0; k < w.enemyCount; k++) {
          const en = w.enemies[k];
          if (en.alive && ENEMIES[en.type].boss && !bossBorn.has(en.id))
            bossBorn.set(en.id, { t: w.t, kind: w.endless ? 'infini' : en.id === w.totemBossId ? 'totem' : 'survie' });
        }
      }
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
    if (frame % 30 === 0 && w.mode === Mode.Play) {
      for (let k = 0; k < w.enemyCount; k++) {
        const en = w.enemies[k];
        const def = ENEMIES[en.type];
        if (!en.alive || def.boss || en.type === 4 || en.type === 5 || en.type === 9 || en.type === 10) continue;
        const d = Math.hypot(en.x - w.player.x, en.z - w.player.z);
        const rec = last.get(en.id) ?? { x: en.x, z: en.z, still: 0, counted: false };
        // candidat seulement s'il est près du joueur et n'a presque pas bougé ; un bouchon dans une brèche (au moins
        // trois voisins collés) n'est pas un ennemi coincé, c'est la foule (compté seulement pour les candidats : O(n))
        let near = d < 30 && d > en.r + 3 && Math.hypot(en.x - rec.x, en.z - rec.z) < 0.25;
        if (near) {
          let crowd = 0;
          for (let q = 0; q < w.enemyCount && crowd < 3; q++) {
            const o = w.enemies[q];
            if (o !== en && o.alive && Math.hypot(o.x - en.x, o.z - en.z) < en.r + o.r + 0.3) crowd++;
          }
          near = crowd < 3;
        }
        rec.still = near ? rec.still + 0.5 : 0;
        if (rec.still >= 3 && !rec.counted) {
          rec.counted = true;
          stuck++;
          if (process.env.STUCK_DEBUG) {
            let crowd = 0;
            for (let q = 0; q < w.enemyCount; q++) {
              const o = w.enemies[q];
              if (o !== en && o.alive && Math.hypot(o.x - en.x, o.z - en.z) < en.r + o.r + 0.3) crowd++;
            }
            console.error(
              `coincé seed=${seed} t=${w.t.toFixed(0)} type=${def.key} d=${d.toFixed(1)} près obstacle=${w.nearObstacle(en.x, en.z)} flux=${w.flow.at(en.x, en.z)} voisins=${crowd} pos=${en.x.toFixed(1)},${en.z.toFixed(1)}`,
            );
          }
        }
        rec.x = en.x;
        rec.z = en.z;
        last.set(en.id, rec);
      }
    }
    // phase 39 : --endless, le bot continue en monde infini après la victoire
    if (w.mode === Mode.Won && ENDLESS_ON) {
      atWin = { items: w.items.reduce((a, n) => a + n, 0), level: w.player.level, weaponLv: w.weaponLvBest };
      startEndless(w);
    }
    if (w.mode === Mode.Dead || w.mode === Mode.Won) break;
  }
  return {
    seed,
    time: w.t,
    kills: w.kills,
    level: w.player.level,
    reachedEnd: w.mode === Mode.Won || w.endless,
    chal: charChal.map((a) => a.get(DEFAULT_META.stats, runCharStats(CHARACTER, w, w.mode === Mode.Won || w.endless))),
    endless: w.endless,
    endlessT: w.endlessT,
    endlessWave: w.endlessWave,
    stage: w.stage + 1,
    overT: w.overT,
    totemAt,
    bossFight,
    bossLife,
    atWin,
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
    stuck,
    gold: Math.round(w.gold),
    goldSpent: Math.round(w.goldSpent),
    items: w.itemOrder.map((i) => ITEM_KEYS[i]),
    itemN: w.items.reduce((a, n) => a + n, 0),
    topStack: w.items.reduce((a, n) => Math.max(a, n), 0),
    bought,
    synergies: SYNERGIES.filter((_, i) => w.syn[i]).map((s) => s.key),
    mapChests: w.mapChestsOpened,
    powersDropped: w.powersDropped,
    powersTaken: w.powersTaken,
    shrines: w.shrinesUsed,
    spellCasts: w.sstate.casts,
    spellKills: w.sstate.kills,
    goldEarned: Math.round(w.gold + w.goldSpent),
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
for (let i = 0; i < RUNS; i++) {
  results.push(runOnce(SEED * 1000 + i));
}
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
  noItem: [...NO_ITEM],
  slots: `${SLOT_OPT.weapons},${SLOT_OPT.passives}`,
  profile: PROFILE,
  survival: {
    p10: pct(times, 10),
    p50: pct(times, 50),
    p90: pct(times, 90),
    mean: times.reduce((a, b) => a + b, 0) / RUNS,
  },
  reachedEndPct: (100 * results.filter((r) => r.reachedEnd).length) / RUNS,
  // phase 37 : mondes atteints, victoires, prolongation, totems
  stage2Pct: (100 * results.filter((r) => r.stage >= 2).length) / RUNS,
  stage3Pct: (100 * results.filter((r) => r.stage >= 3).length) / RUNS,
  overP50: pct(
    results.filter((r) => !r.reachedEnd && r.overT > 0).map((r) => r.overT),
    50,
  ),
  overP90: pct(
    results.filter((r) => !r.reachedEnd && r.overT > 0).map((r) => r.overT),
    90,
  ),
  overDeathPct: (100 * results.filter((r) => !r.reachedEnd && r.overT > 0).length) / RUNS,
  totemP50: pct(
    results.flatMap((r) => r.totemAt),
    50,
  ),
  bossFightP50: pct(
    results.flatMap((r) => r.bossFight),
    50,
  ),
  bossFightP90: pct(
    results.flatMap((r) => r.bossFight),
    90,
  ),
  // phase 43 : monde infini (--endless), sur les parties gagnées qui ont continué
  endless: (() => {
    const inf = results.filter((r) => r.endless);
    const share = (k: number) => (inf.length ? (100 * inf.filter((r) => r.endlessWave >= k).length) / inf.length : 0);
    return {
      n: inf.length,
      p10: pct(
        inf.map((r) => r.endlessT),
        10,
      ),
      p50: pct(
        inf.map((r) => r.endlessT),
        50,
      ),
      p90: pct(
        inf.map((r) => r.endlessT),
        90,
      ),
      wave6Pct: share(6),
      itemsAtWinP50: pct(
        inf.map((r) => r.atWin?.items ?? 0),
        50,
      ),
      itemsEndP50: pct(
        inf.map((r) => r.itemN),
        50,
      ),
      levelAtWinP50: pct(
        inf.map((r) => r.atWin?.level ?? 0),
        50,
      ),
      levelEndP50: pct(
        inf.map((r) => r.level),
        50,
      ),
      weaponLvAtWinP50: pct(
        inf.map((r) => r.atWin?.weaponLv ?? 0),
        50,
      ),
      weaponLvEndP50: pct(
        inf.map((r) => r.weaponLvBest),
        50,
      ),
    };
  })(),
  // phase 43 : durée de vie médiane des boss tués, par sorte
  bossLifeP50: {
    totem: pct(
      results.flatMap((r) => r.bossLife.totem),
      50,
    ),
    survie: pct(
      results.flatMap((r) => r.bossLife.survie),
      50,
    ),
    infini: pct(
      results.flatMap((r) => r.bossLife.infini),
      50,
    ),
  },
  bossWinPct: [0, 1, 2].map((k) =>
    Math.round(
      (100 * results.filter((r) => r.bossFight.length > k).length) /
        Math.max(1, results.filter((r) => r.totemAt.length > k).length),
    ),
  ),
  deadBefore3minPct: (100 * results.filter((r) => r.time < 180).length) / RUNS,
  // économie : or gardé médian par run (après le marchand), or dépensé au marchand
  goldP50: pct(
    results.map((r) => r.gold),
    50,
  ),
  goldSpentP50: pct(
    results.map((r) => r.goldSpent),
    50,
  ),
  // phase 17 : objets par run, part achetée, objets vus sur l'ensemble des runs, synergies
  itemsPerRun: +(results.reduce((a, r) => a + r.itemN, 0) / RUNS).toFixed(2),
  distinctPerRun: +(results.reduce((a, r) => a + r.items.length, 0) / RUNS).toFixed(2),
  topStackP90: pct(
    results.map((r) => r.topStack),
    90,
  ),
  boughtPerRun: +(results.reduce((a, r) => a + r.bought, 0) / RUNS).toFixed(2),
  itemPct: Object.fromEntries(
    ITEM_KEYS.filter((k) => !NO_ITEM.has(k)).map((k) => [
      k,
      Math.round((100 * results.filter((r) => r.items.includes(k)).length) / RUNS),
    ]),
  ),
  synergyRunPct: (100 * results.filter((r) => r.synergies.length > 0).length) / RUNS,
  // phase 18 : points d'intérêt et part de l'or dépensé en partie (coffres de carte + marchand)
  mapChestsPerRun: +(results.reduce((a, r) => a + r.mapChests, 0) / RUNS).toFixed(2),
  // phase 35 : bonus au sol, ramassés par minute de jeu et part ramassée
  powersPerMin: +(
    results.reduce((a, r) => a + r.powersTaken, 0) / Math.max(1, results.reduce((a, r) => a + r.time, 0) / 60)
  ).toFixed(2),
  powersTakenPct: Math.round(
    (100 * results.reduce((a, r) => a + r.powersTaken, 0)) /
      Math.max(
        1,
        results.reduce((a, r) => a + r.powersDropped, 0),
      ),
  ),
  shrinesPerRun: +(results.reduce((a, r) => a + r.shrines, 0) / RUNS).toFixed(2),
  // phase 19 : sort de classe, lancers par minute de jeu et part des kills
  spellPerMin: +(
    (60 * results.reduce((a, r) => a + r.spellCasts, 0)) /
    Math.max(
      1,
      results.reduce((a, r) => a + r.time, 0),
    )
  ).toFixed(2),
  spellKillPct: Math.round(
    (100 * results.reduce((a, r) => a + r.spellKills, 0)) /
      Math.max(
        1,
        results.reduce((a, r) => a + r.kills, 0),
      ),
  ),
  goldSpentPct: Math.round(
    (100 * results.reduce((a, r) => a + r.goldSpent, 0)) /
      Math.max(
        1,
        results.reduce((a, r) => a + r.goldEarned, 0),
      ),
  ),
  synergyPct: Object.fromEntries(
    SYNERGIES.map((s) => [s.key, Math.round((100 * results.filter((r) => r.synergies.includes(s.key)).length) / RUNS)]),
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
  stuckTotal: results.reduce((a, r) => a + r.stuck, 0),
  stuckRuns: results.filter((r) => r.stuck > 0).length,
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
  maxDrop: 0, // phase 18 : plus forte chute des vivants en une minute (points), calculée ci-dessous
};
for (let m = 1; m < summary.aliveCurve.length; m++)
  summary.maxDrop = Math.max(summary.maxDrop, summary.aliveCurve[m - 1] - summary.aliveCurve[m]);

const lines: string[] = [];
lines.push(
  `runs ${RUNS} · bot ${BOT} · seed ${SEED}${CHARACTER !== 'eclaireuse' ? ` · --character ${CHARACTER}` : ''}${WEAPONS ? ` · --weapons ${WEAPONS.join(',')}` : ''} ${NO_ITEM.size ? ` · --no-item ${[...NO_ITEM].join(',')}` : ''} · emplacements ${SLOT_OPT.weapons}/${SLOT_OPT.passives} · objets ${ITEMS_ARG} · profil ${PROFILE} · ${elapsed.toFixed(1)} s (${summary.runsPerMin} runs/min)`,
);
lines.push(
  `survie      p10 ${mmss(summary.survival.p10)}  p50 ${mmss(summary.survival.p50)}  p90 ${mmss(summary.survival.p90)}  fin atteinte ${summary.reachedEndPct.toFixed(0)} %`,
);
lines.push(
  `mondes      monde 2 atteint ${summary.stage2Pct.toFixed(0)} % · monde 3 ${summary.stage3Pct.toFixed(0)} % · victoire ${summary.reachedEndPct.toFixed(0)} % · totem p50 à ${mmss(summary.totemP50)} · boss tués ${summary.bossWinPct.join('/')} % en p50 ${summary.bossFightP50.toFixed(0)} s (p90 ${summary.bossFightP90.toFixed(0)} s) · morts en prolongation ${summary.overDeathPct.toFixed(0)} % après p50 ${summary.overP50.toFixed(0)} s (p90 ${summary.overP90.toFixed(0)} s)`,
);
lines.push(
  `boss        en vie p50 : totem ${summary.bossLifeP50.totem.toFixed(0)} s · survie ${summary.bossLifeP50.survie.toFixed(0)} s · monde infini ${summary.bossLifeP50.infini.toFixed(0)} s`,
);
// phase 41 : défis du personnage, en une partie (part des runs qui les remplissent)
lines.push(
  `défis       ${charChal
    .map(
      (a, i) =>
        `${a.id} ≥${a.goal} : ${Math.round((100 * results.filter((r) => r.chal[i] >= a.goal).length) / results.length)} % (p50 ${pct(
          results.map((r) => r.chal[i]),
          50,
        )}, p90 ${pct(
          results.map((r) => r.chal[i]),
          90,
        )})`,
    )
    .join(' · ')}`,
);
// phase 39 : monde infini (--endless), sur les parties gagnées seulement
if (ENDLESS_ON) {
  const inf = results.filter((r) => r.endless);
  const tq = inf.map((r) => r.endlessT);
  const wq = inf.map((r) => r.endlessWave);
  const waves = [0, 1, 2, 3, 4, 5, 6, 8].map(
    (k) => `≥${k} ${inf.length ? Math.round((100 * inf.filter((r) => r.endlessWave >= k).length) / inf.length) : 0} %`,
  );
  lines.push(
    `infini      ${inf.length} parties · tenu p10 ${mmss(pct(tq, 10))} p50 ${mmss(pct(tq, 50))} p90 ${mmss(pct(tq, 90))} · vagues p50 ${pct(wq, 50)} · ${waves.join(' · ')}`,
  );
  const E = summary.endless;
  const why: Record<string, number> = {};
  for (const r of inf) if (r.deathBy !== '—') why[r.deathBy] = (why[r.deathBy] ?? 0) + 1;
  lines.push(
    `infini mort ${Object.entries(why)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k} ${Math.round((100 * v) / Math.max(1, inf.length))} %`)
      .join(' · ')}`,
  );
  lines.push(
    `infini+     objets p50 ${E.itemsAtWinP50} à la victoire, ${E.itemsEndP50} à la mort · niveau ${E.levelAtWinP50} → ${E.levelEndP50} · arme principale niv ${E.weaponLvAtWinP50} → ${E.weaponLvEndP50}`,
  );
}
lines.push(
  `morts <3min ${summary.deadBefore3minPct.toFixed(0)} %   niveau@10 p50 ${summary.levelAt10p50}   kills@10 p50 ${summary.killsAt10p50}`,
);
lines.push(
  `or          gardé p50 ${summary.goldP50} (×${(summary.goldP50 / REF_PRICE).toFixed(1)} emplacement n°2) · dépensé au marchand p50 ${summary.goldSpentP50}`,
);
lines.push(
  `objets      ${summary.itemsPerRun} par run (${summary.distinctPerRun} différents, plus gros cumul p90 ×${summary.topStackP90}, ${summary.boughtPerRun} achetés) · ${Object.entries(
    summary.itemPct,
  )
    .map(([k, v]) => `${k} ${v} %`)
    .join(' · ')}`,
);
lines.push(
  `synergies   ${summary.synergyRunPct.toFixed(0)} % des runs · ${Object.entries(summary.synergyPct)
    .map(([k, v]) => `${k} ${v} %`)
    .join(' · ')}`,
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
lines.push(
  `coincés     ${summary.stuckTotal} ennemis immobiles > 3 s près du joueur, dans ${summary.stuckRuns} run(s) sur ${RUNS}`,
);
lines.push(`vivants/min ${summary.aliveCurve.join(' ')}  (plus forte chute ${summary.maxDrop} pts en 1 min)`);
lines.push(
  `bonus       ${summary.powersPerMin} ramassés par minute · ${summary.powersTakenPct} % des bonus apparus`,
  `carte       ${summary.mapChestsPerRun} coffres de carte et ${summary.shrinesPerRun} sanctuaires par run · ${summary.goldSpentPct} % de l'or gagné dépensé en partie`,
);
lines.push(`sort        ${summary.spellPerMin} lancers par minute · ${summary.spellKillPct} % des kills`);
// phase 43 : avec --endless, les cibles du monde infini s'ajoutent (s'il y a des parties gagnées à mesurer)
const checks = checkTargets(
  summary,
  ENDLESS_ON && summary.endless.n > 0 ? [...PROFILES[PROFILE], ...ENDLESS_TARGETS] : PROFILES[PROFILE],
);
lines.push(`cibles      ${checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.name} (${c.value})`).join('  ')}`);
if (!checks.every((c) => c.ok)) lines.push('cibles non atteintes : à régler dans balance.ts (survivor-design §9)');
console.log(lines.join('\n'));

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ summary, checks, results }, null, 1));
  console.log(`→ ${OUT}`);
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
