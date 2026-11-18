// Lot L3 (docs/specs/l3-defi-serie-missions.md) : défi du jour court et série de jours. Un test par scénario de la spec
// (titre en anglais) pour le défi et la série, plus la fusion du nuage et les règles Firestore.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, DAILY, MISSIONS, OUTFIT, REVEAL, SLOTS_START, STAGE, STEP, STREAK } from '../sim/balance';
import { TOTEM_HIDDEN } from '../sim/poi';
import { snapshotWorld } from '../sim/snapshot';
import { adoptDaily, stageLeft } from '../sim/stages';
import { restoreWorld } from '../sim/snapshot';
import { startRun, step } from '../sim/step';
import { Ev, Mode } from '../sim/types';
import type { Input } from '../sim/types';
import { World } from '../sim/world';
import { unlockedWeapons } from './achievements';
import {
  dailyRuns,
  dailySeed,
  mergeStreak,
  normalizeStreak,
  recordDaily,
  recordStreak,
  settleStreak,
  streakNow,
  streakPreview,
} from './daily';
import { bannedItems } from './library';
import { drawMissions } from './missions';
import { DEFAULT_META, normalizeMeta } from './save';
import type { Meta } from './save';
import { worldOptions } from './shop';
import { progressOf, withProgress } from './sync';

const fresh = () => normalizeMeta(DEFAULT_META);
const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
/** Joueur ancien, riche, qui a tout débloqué ou presque : son défi doit être celui d'un nouveau joueur. */
function veteran(): Meta {
  return normalizeMeta({
    version: 5,
    runs: 40,
    gold: 9000,
    character: 'sorciere',
    achievements: ['survie3', 'survie10', 'kills500', 'boss1', 'survie15'],
    bought: ['veilleuse'],
    slots: { weapons: 4, passives: 4, rerolls: 3 },
    unlocks: ['w:boomerang', 'w:faux', 'i:phenix', 'i:sablier'],
    reveal: REVEAL.max,
  });
}
/** Méta avec une série déjà comptée. */
function withStreak(last: string, count: number, jokerWeek = '', jokerDay = ''): Meta {
  const m = fresh();
  m.streak = { last, count, best: count, jokerWeek, jokerDay };
  return m;
}

describe('défi du jour court (lot L3)', () => {
  it('The daily challenge lasts 5 minutes', () => {
    expect(DAILY.duration).toBe(300);
    const opts = worldOptions(fresh(), ['orbe'], true);
    // le même pour tous : même personnage, même kit (celui d'un nouveau joueur), même graine du jour
    expect(worldOptions(veteran(), unlockedWeapons(veteran()), true)).toEqual(opts);
    expect(opts.character).toBe('eclaireuse');
    expect(opts.slots).toEqual(SLOTS_START);
    expect(opts.unlocked).toEqual(unlockedWeapons(fresh()));
    expect(opts.bannedItems).toEqual(bannedItems(fresh()));
    expect(opts.reveal).toBeUndefined(); // tout dévoilé (lot L2)
    expect(dailySeed('2026-11-18')).toBe(dailySeed('2026-11-18'));
    const seed = 777_001;
    expect(snapshotWorld(new World(seed, opts))).toEqual(
      snapshotWorld(new World(seed, worldOptions(veteran(), ['orbe'], true))),
    );
    // un seul monde : pas de totem (il mène au monde suivant), le chrono affiché est celui du défi
    const w = new World(seed, opts);
    startRun(w);
    expect(w.dailyEnd).toBe(DAILY.duration);
    expect(w.totem.state).toBe(TOTEM_HIDDEN);
    expect(stageLeft(w)).toBe(DAILY.duration);
    expect(w.skulls.length).toBeGreaterThan(0); // le reste est dévoilé
    // vivant à 5:00 : la partie s'arrête sur « Défi réussi ! » (Mode.Won), au monde 1, avec le bonus d'or de fin
    w.player.maxHp = w.player.hp = 1e9;
    w.t = w.stageT = DAILY.duration - 1;
    const gold = w.gold;
    let victory = 0;
    for (let f = 0; f < 2 / STEP && w.mode !== Mode.Won; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Victory) victory++;
    }
    expect(w.mode).toBe(Mode.Won);
    expect(victory).toBe(1);
    // relecture du lot L3 : le pas de la fin ne joue rien d'autre (ni armes, ni monstres, ni marchand)
    expect(w.eventCount).toBe(1);
    expect(w.stage).toBe(0);
    expect(w.stageT).toBeGreaterThanOrEqual(DAILY.duration);
    expect(w.stageT).toBeLessThan(DAILY.duration + 2 * STEP);
    expect(w.gold).toBeGreaterThan(gold);
    const t = w.t;
    step(w, still, STEP); // la partie est finie : plus rien n'avance
    expect(w.t).toBe(t);
    // mort avant : un défi raté (la mort ordinaire)
    const d = new World(seed, opts);
    startRun(d);
    d.t = d.stageT = 120;
    d.player.hp = -1e9;
    d.player.revives = 0;
    step(d, still, STEP);
    expect(d.mode).toBe(Mode.Dead);
  });

  it('a challenge saved before the update resumes as the 5-minute challenge', () => {
    // partie de défi gardée par la 1.58.0 : mêmes options, sans `daily` (l'instantané n'a pas de dailyEnd)
    const { daily: _, ...old } = worldOptions(fresh(), ['orbe'], true);
    const before = new World(777_002, old);
    startRun(before);
    before.t = before.stageT = 120;
    const w = restoreWorld(snapshotWorld(before));
    expect(w.dailyEnd).toBe(0);
    expect(w.totem.state).toBe(0);
    adoptDaily(w);
    expect(w.dailyEnd).toBe(DAILY.duration);
    expect(w.totem.state).toBe(TOTEM_HIDDEN);
    expect(stageLeft(w)).toBe(DAILY.duration - 120);
    adoptDaily(w); // sans effet sur un défi déjà court
    expect(w.dailyEnd).toBe(DAILY.duration);
    w.player.maxHp = w.player.hp = 1e9;
    w.t = w.stageT = DAILY.duration - 0.5;
    for (let f = 0; f < 1 / STEP && w.mode !== Mode.Won; f++) step(w, still, STEP);
    expect(w.mode).toBe(Mode.Won);
    // un totem déjà activé (boss appelé) reste : la partie finit quand même à 5:00 de partie
    const fight = new World(777_003, old);
    fight.totem.state = 1;
    adoptDaily(fight);
    expect(fight.totem.state).toBe(1);
    expect(fight.dailyEnd).toBe(DAILY.duration);
  });

  it('Full runs do not change', () => {
    const m = veteran();
    const opts = worldOptions(m, unlockedWeapons(m));
    expect(opts.daily).toBeUndefined();
    const w = new World(31, opts);
    startRun(w);
    expect(STAGE.count).toBe(3);
    expect(w.dailyEnd).toBe(0);
    expect(w.totem.state).toBe(0); // le totem du passage au monde 2 est là
    expect(stageLeft(w)).toBe(STAGE.dur);
    // 5:00 passe sans rien arrêter
    w.player.maxHp = w.player.hp = 1e9;
    w.t = w.stageT = DAILY.duration - 1;
    for (let f = 0; f < 2 / STEP; f++) step(w, still, STEP);
    expect(w.mode).not.toBe(Mode.Won);
    expect(w.mode).not.toBe(Mode.Dead);
    expect(w.diffT).toBeCloseTo(w.stageT + STAGE.offset[0], 9);
  });

  it('a daily run is ranked by time held, then by enemies slain', () => {
    const m = fresh();
    expect(recordDaily(m, 300, 412, '2026-11-18')).toBe(1);
    expect(recordDaily(m, 300, 500, '2026-11-18')).toBe(1); // même temps, plus de vaincus : devant
    expect(recordDaily(m, 240, 900, '2026-11-18')).toBe(3);
    expect(dailyRuns(m, '2026-11-18')).toEqual([
      { t: 300, k: 500, medal: 0 },
      { t: 300, k: 412, medal: 0 },
      { t: 240, k: 900, medal: 0 },
    ]);
    // sauvegarde d'avant le lot : des temps sans vaincus
    const old = normalizeMeta({ version: 5, daily: { date: '2026-11-18', times: [431, 95] } });
    expect(dailyRuns(old, '2026-11-18')).toEqual([
      { t: 431, k: 0, medal: 0 },
      { t: 95, k: 0, medal: 0 },
    ]);
  });
});

describe('série de jours (lot L3)', () => {
  it('The streak grows from one day to the next', () => {
    const m = withStreak('2026-11-17', 2);
    const gold = m.gold;
    const gain = recordStreak(m, '2026-11-18');
    expect(m.streak.count).toBe(3);
    expect(gain).toEqual({ count: 3, gold: 60, outfit: null });
    expect(m.gold).toBe(gold + 60);
    expect(m.goldEarned).toBe(60);
    expect(m.streak.best).toBe(3);
    // le même jour ne compte qu'une fois
    expect(recordStreak(m, '2026-11-18')).toBeNull();
    expect(m.gold).toBe(gold + 60);
    // l'or monte de 40 à 100 (plafond au 7e jour)
    expect(STREAK.gold + STREAK.perDay * 1).toBe(40);
    const first = fresh();
    expect(recordStreak(first, '2026-11-18')?.gold).toBe(40);
    expect(streakNow(first, '2026-11-18')).toBe(1);
    expect(streakNow(first, '2026-11-19')).toBe(1); // encore vivante le lendemain
  });

  it('The streak survives a missed day thanks to the joker', () => {
    // série de 4 comptée le lundi 16 ; rien le mardi 17 ; ouverture le mercredi 18
    const m = withStreak('2026-11-16', 4);
    expect(settleStreak(m, '2026-11-18')).toBe('joker');
    expect(m.streak.count).toBe(4);
    expect(m.streak.jokerWeek).toBe('2026-W47');
    expect(m.streak.jokerDay).toBe('2026-11-17');
    expect(streakNow(m, '2026-11-18')).toBe(4); // le menu montre la série sauvée
    expect(settleStreak(m, '2026-11-18')).toBeNull(); // une seule fois
    expect(recordStreak(m, '2026-11-18')?.count).toBe(5);
    // même chose sans passer par le menu : le défi du jour compte avec le joker
    const n = withStreak('2026-11-16', 4);
    expect(recordStreak(n, '2026-11-18')?.count).toBe(5);
    expect(n.streak.jokerWeek).toBe('2026-W47');
  });

  it('Two missed days reset the streak to one', () => {
    const m = withStreak('2026-11-15', 4); // comptée il y a trois jours
    expect(settleStreak(m, '2026-11-18')).toBe('lost');
    expect(streakNow(m, '2026-11-18')).toBe(0);
    expect(m.streak.jokerWeek).toBe(''); // le joker n'a pas servi
    expect(recordStreak(m, '2026-11-18')?.count).toBe(1);
    expect(m.streak.best).toBe(4);
    // le menu ouvert entre les deux jours manqués : le joker sert pour le premier, pas pour le second
    const n = withStreak('2026-11-16', 4);
    expect(settleStreak(n, '2026-11-18')).toBe('joker'); // mardi 17 pardonné
    expect(settleStreak(n, '2026-11-19')).toBe('lost'); // mercredi 18 manqué aussi
    expect(recordStreak(n, '2026-11-19')?.count).toBe(1);
  });

  it('a challenge held over midnight counts for its day', () => {
    // série comptée le mardi 17 ; défi du mercredi 18 gardé, repris le jeudi 19 après minuit
    const m = withStreak('2026-11-17', 3);
    expect(settleStreak(m, '2026-11-19', '2026-11-18')).toBeNull(); // le menu du jeudi ne règle rien
    expect(m.streak).toMatchObject({ last: '2026-11-17', count: 3, jokerWeek: '' });
    expect(recordStreak(m, '2026-11-18')?.count).toBe(4); // la partie compte pour le mercredi
    expect(streakNow(m, '2026-11-19')).toBe(4);
    // un défi gardé plus ancien ne protège rien
    const n = withStreak('2026-11-15', 3);
    expect(settleStreak(n, '2026-11-19', '2026-11-15')).toBe('lost');
  });

  it('Only one joker per week', () => {
    // joker déjà utilisé cette semaine (pour le lundi 16) ; série comptée le mercredi 18, rien le jeudi 19
    const m = withStreak('2026-11-18', 6, '2026-W47');
    expect(settleStreak(m, '2026-11-20')).toBe('lost');
    expect(recordStreak(m, '2026-11-20')?.count).toBe(1);
    // le samedi 21 est encore en W47 : joker déjà pris
    const n = withStreak('2026-11-20', 3, '2026-W47');
    expect(settleStreak(n, '2026-11-22')).toBe('lost');
    // la semaine suivante, il revient : série comptée le dimanche 22, rien le lundi 23 (W48), ouverture le mardi 24
    const o = withStreak('2026-11-22', 3, '2026-W47');
    expect(settleStreak(o, '2026-11-24')).toBe('joker');
    expect(o.streak.jokerWeek).toBe('2026-W48');
    // relecture du lot L3 : deux jokers ne se chaînent pas d'une semaine à l'autre. Dernier jour le samedi 21 (W47),
    // rien le dimanche 22 ni le lundi 23 (W48) ; menu ouvert le lundi (joker pour le dimanche), puis le mardi
    const p = withStreak('2026-11-21', 5);
    expect(settleStreak(p, '2026-11-23')).toBe('joker');
    expect(p.streak).toMatchObject({ last: '2026-11-22', jokerWeek: '2026-W47', jokerDay: '2026-11-22' });
    expect(settleStreak(p, '2026-11-24')).toBe('lost');
    expect(recordStreak(p, '2026-11-24')?.count).toBe(1);
  });

  it('The seventh day gives an outfit', () => {
    const m = withStreak('2026-11-17', 6);
    m.character = 'sorciere';
    m.achievements.push('kills500'); // la Sorcière est à lui
    m.outfits = ['eclaireuse'];
    const gain = recordStreak(m, '2026-11-18');
    expect(gain).toEqual({ count: 7, gold: 100, outfit: 'sorciere' }); // d'abord le personnage choisi
    expect(m.outfits).toContain('sorciere');
    expect(m.outfit.sorciere).toBe(1);
    // au 14e jour : le personnage choisi l'a déjà, un autre personnage (possédé d'abord)
    m.streak.count = 13;
    m.streak.last = '2026-11-18';
    const next = recordStreak(m, '2026-11-19');
    expect(next?.count).toBe(14);
    expect(next?.outfit).not.toBeNull();
    expect(['sorciere', 'eclaireuse']).not.toContain(next?.outfit);
    // toutes les tenues possédées : leur prix en or
    const rich = withStreak('2026-11-17', 6);
    rich.outfits = CHARACTERS.map((c) => c.key);
    expect(recordStreak(rich, '2026-11-18')).toEqual({ count: 7, gold: 100 + OUTFIT.price, outfit: null });
    // pas de tenue les autres jours
    expect(recordStreak(withStreak('2026-11-17', 5), '2026-11-18')?.outfit).toBeNull();
  });

  it('An existing player keeps everything', () => {
    // sauvegarde de la 1.58.0 : ni série, ni missions, ni vaincus du défi
    const before = {
      version: 5,
      runs: 12,
      gold: 1873.25,
      goldEarned: 6420,
      achievements: ['survie3', 'survie10', 'kills500', 'dards100'],
      bought: ['bucheron'],
      character: 'bucheron',
      outfits: ['eclaireuse'],
      outfit: { eclaireuse: 1 },
      daily: { date: '2026-11-17', times: [301.2, 188.7] },
      reveal: 4,
      seenReveal: 4,
    };
    const m = normalizeMeta(JSON.parse(JSON.stringify(before)));
    expect(m.gold).toBe(1873.25);
    expect(m.goldEarned).toBe(6420);
    expect(m.achievements).toEqual(before.achievements);
    expect(m.outfits).toEqual(['eclaireuse']);
    expect(m.outfit).toEqual({ eclaireuse: 1 });
    expect(m.daily).toEqual({ date: '2026-11-17', times: [301.2, 188.7], kills: [0, 0], medals: [0, 0] }); // défi v2 : sans médaille
    expect(m.streak).toEqual({ last: '', count: 0, best: 0, jokerWeek: '', jokerDay: '' });
    expect(m.missions).toEqual({ date: '', list: [] }); // tirées à la première ouverture
    expect(streakNow(m, '2026-11-18')).toBe(0);
    expect(settleStreak(m, '2026-11-18')).toBeNull();
    // une progression du nuage écrite par un ancien client : la série locale n'est pas perdue
    const local = withStreak('2026-11-18', 3);
    const merged = withProgress(local, JSON.parse(JSON.stringify(before)));
    expect(merged.streak.count).toBe(3);
    expect(merged.gold).toBe(1873.25);
  });

  it('the cloud merge keeps the most recent streak, then the longest', () => {
    const a = normalizeStreak({ last: '2026-11-18', count: 2, best: 9, jokerWeek: '' });
    const b = normalizeStreak({ last: '2026-11-17', count: 5, best: 5, jokerWeek: '2026-W47', jokerDay: '2026-11-17' });
    expect(mergeStreak(a, b)).toEqual({
      last: '2026-11-18',
      count: 2,
      best: 9,
      jokerWeek: '2026-W47',
      jokerDay: '2026-11-17',
    });
    const c = normalizeStreak({ last: '2026-11-18', count: 4, best: 4, jokerWeek: '' });
    expect(mergeStreak(a, c).count).toBe(4);
    // par le nuage : l'autre appareil a joué aujourd'hui, celui-ci hier
    const here = withStreak('2026-11-17', 6);
    const there = withStreak('2026-11-18', 7);
    expect(withProgress(here, progressOf(there)).streak.count).toBe(7);
    expect(withProgress(there, progressOf(here)).streak.count).toBe(7);
    // champs hostiles bornés
    expect(normalizeStreak({ last: 'demain', count: 5, best: -2, jokerWeek: 3, jokerDay: 'hier' })).toEqual({
      last: '',
      count: 0,
      best: 0,
      jokerWeek: '',
      jokerDay: '',
    });
  });

  it('firestore.rules accept the streak and the missions, bounded and optional', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain(`!('streak' in p())`);
    expect(rules).toContain(`!('missions' in p())`);
    expect(rules).toContain(`ms.list.size() <= ${MISSIONS.count}`);
    expect(rules).toContain(`!('kills' in p().daily)`);
    // non-dérive (relecture du lot L3) : les clés de la série dans les règles sont celles de la méta, chacune bornée
    const keys = Object.keys(DEFAULT_META.streak);
    const list = keys.map((k) => `'${k}'`).join(', ');
    expect(rules).toContain(`s.keys().hasOnly([${list}])`);
    expect(rules).toContain(`s.keys().hasAll([${list}])`);
    for (const k of keys) expect(rules, k).toMatch(new RegExp(`s\\.${k} is (string|int)`));
    // une mission a au plus autant de champs que la règle en accepte, et une liste n'a pas plus d'index vérifiés
    const one = drawMissions(fresh(), '2026-11-18')[0];
    expect(rules).toContain(`l[i].size() <= ${Object.keys(one).length}`);
    for (let i = 0; i < MISSIONS.count; i++) expect(rules).toContain(`missionOk(ms.list, ${i})`);
  });
});

// Interface Nocturne : la feuille du défi du jour annonce la série, le joker et la récompense du jour sans rien écrire.
describe('daily sheet: streak, joker and reward preview', () => {
  it('previews the next day of a live streak, then the day already counted, without writing', () => {
    const m = fresh();
    m.streak = normalizeStreak({ last: '2026-11-17', count: 6, best: 6, jokerWeek: '' });
    const before = JSON.stringify(m.streak);
    const p = streakPreview(m, '2026-11-18');
    expect(p).toEqual({
      count: 7,
      done: false,
      gold: STREAK.gold + STREAK.perDay * Math.min(7, STREAK.cap),
      outfitIn: 0,
      joker: true,
    });
    expect(JSON.stringify(m.streak)).toBe(before);
    const gain = recordStreak(m, '2026-11-18')!;
    expect(gain.gold).toBe(p.gold);
    expect(streakPreview(m, '2026-11-18')).toMatchObject({ count: 7, done: true, gold: 0 });
  });
  it('starts again at 1 after a lost streak, and says when the weekly joker is spent', () => {
    const m = fresh();
    m.streak = normalizeStreak({ last: '2026-11-10', count: 4, best: 4, jokerWeek: '2026-W47' });
    expect(streakPreview(m, '2026-11-18')).toMatchObject({ count: 1, outfitIn: STREAK.outfitEvery - 1, joker: false });
  });
});
