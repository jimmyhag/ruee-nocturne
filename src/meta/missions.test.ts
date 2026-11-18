// Lot L3 (docs/specs/l3-defi-serie-missions.md, décisions 8 à 10) : missions du jour. Un test par scénario de la spec
// (titre en anglais), plus la lecture d'une sauvegarde hostile et la fusion du nuage.
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../sim/balance';
import { unlockedCharacters, unlockedWeapons } from './achievements';
import {
  drawMissions,
  ensureMissions,
  mergeMissions,
  missionGold,
  missionsAfterRun,
  normalizeMissions,
} from './missions';
import type { Mission, RunFacts } from './missions';
import { DEFAULT_META, normalizeMeta } from './save';
import type { Meta } from './save';
import { progressOf, withProgress } from './sync';

const fresh = () => normalizeMeta(DEFAULT_META);
/** Joueur qui possède plusieurs personnages et plusieurs armes. */
function collector(): Meta {
  return normalizeMeta({
    version: 5,
    runs: 30,
    character: 'bucheron',
    achievements: ['survie3', 'survie10', 'kills500'],
    bought: ['veilleuse'],
    unlocks: ['w:boomerang', 'w:faux'],
    slots: { weapons: 2, passives: 2, rerolls: 0 }, // une nouvelle arme peut entrer en partie
    reveal: 4,
  });
}
const run = (o: Partial<RunFacts> = {}): RunFacts => ({
  char: 'eclaireuse',
  weapons: ['orbe'],
  kills: 0,
  elites: 0,
  t: 60,
  chests: 0,
  weaponLv: 1,
  ...o,
});
const kills300 = (): Mission => ({ k: 'kills', p: '', goal: 300, prog: 0, done: false });

describe('missions du jour (lot L3)', () => {
  it('Three daily missions that make you vary', () => {
    const m = collector();
    expect(unlockedCharacters(m).length).toBeGreaterThan(1);
    expect(unlockedWeapons(m).length).toBeGreaterThan(1);
    for (const date of ['2026-11-18', '2026-11-19', '2026-11-20', '2026-12-31', '2027-01-01']) {
      expect(ensureMissions(m, date)).toBe(true); // nouveau jour : nouveau tirage
      const list = m.missions.list;
      expect(m.missions.date).toBe(date);
      expect(list).toHaveLength(MISSIONS.count);
      const char = list.find((x) => x.k === 'char');
      const weapon = list.find((x) => x.k === 'weapon');
      expect(char, date).toBeDefined();
      expect(weapon, date).toBeDefined();
      expect(char!.p).not.toBe(m.character); // un autre personnage que celui choisi
      expect(unlockedCharacters(m)).toContain(char!.p);
      expect(unlockedWeapons(m)).toContain(weapon!.p); // du contenu possédé
      expect(weapon!.p).not.toBe('lames'); // pas l'arme de départ du Bûcheron
      expect(new Set(list.map((x) => x.k)).size).toBe(MISSIONS.count); // trois modèles différents
      for (const x of list) {
        expect(x.prog).toBe(0);
        expect(x.done).toBe(false);
        expect([60, 80, 100]).toContain(missionGold(x));
      }
    }
    // tirées par la date : le même jour donne les mêmes missions ; un autre jour, d'autres
    expect(drawMissions(m, '2026-11-18')).toEqual(drawMissions(collector(), '2026-11-18'));
    const days = new Set(
      ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map((d) =>
        JSON.stringify(drawMissions(m, d)),
      ),
    );
    expect(days.size).toBeGreaterThan(1);
    // un nouveau joueur n'a qu'un personnage : le modèle est remplacé par des objectifs chiffrés
    const newbie = fresh();
    ensureMissions(newbie, '2026-11-18');
    expect(newbie.missions.list).toHaveLength(MISSIONS.count);
    expect(newbie.missions.list.some((x) => x.k === 'char')).toBe(false);
    // relecture du lot L3 : avec un seul emplacement d'arme, aucune nouvelle arme n'entre en partie : pas de mission d'arme
    expect(newbie.missions.list.some((x) => x.k === 'weapon')).toBe(false);
    const oneSlot = collector();
    oneSlot.slots.weapons = 1;
    expect(drawMissions(oneSlot, '2026-11-18').some((x) => x.k === 'weapon')).toBe(false);
    expect(drawMissions(oneSlot, '2026-11-18').some((x) => x.k === 'char')).toBe(true);
    for (const x of newbie.missions.list) expect(MISSIONS.goals[x.k as keyof typeof MISSIONS.goals]).toContain(x.goal);
    // les objectifs chiffrés ne dépendent pas du contenu possédé (même tirage pour tous)
    const numeric = (list: Mission[]) => list.filter((x) => x.k !== 'char' && x.k !== 'weapon');
    expect(numeric(drawMissions(newbie, '2026-11-18'))[0]).toEqual(numeric(drawMissions(m, '2026-11-18'))[0]);
  });

  it('Missions stay the same all day', () => {
    const m = collector();
    expect(ensureMissions(m, '2026-11-18')).toBe(true);
    const k = m.missions.list.find((x) => x.k !== 'char' && x.k !== 'weapon')!;
    missionsAfterRun(m, run({ kills: 120, elites: 2, t: 150, chests: 1, weaponLv: 6 }), '2026-11-18');
    const before = JSON.stringify(m.missions);
    expect(k.prog).toBeGreaterThan(0);
    // l'appareil rouvre le jeu le même jour (sauvegarde relue) : rien ne change
    const reopened = normalizeMeta(JSON.parse(JSON.stringify(m)));
    expect(ensureMissions(reopened, '2026-11-18')).toBe(false);
    expect(JSON.stringify(reopened.missions)).toBe(before);
    // même si le contenu possédé change dans la journée
    reopened.unlocks.push('w:lance');
    expect(ensureMissions(reopened, '2026-11-18')).toBe(false);
    expect(JSON.stringify(reopened.missions)).toBe(before);
    // le lendemain : nouvelle liste, progression à zéro
    expect(ensureMissions(reopened, '2026-11-19')).toBe(true);
    expect(reopened.missions.list.every((x) => x.prog === 0 && !x.done)).toBe(true);
    // horloge reculée (relecture du lot L3) : pas de nouveau tirage, et une partie « d'hier » ne paie rien
    const drawn = JSON.stringify(reopened.missions);
    expect(ensureMissions(reopened, '2026-11-18')).toBe(false);
    expect(JSON.stringify(reopened.missions)).toBe(drawn);
    const back = fresh();
    back.missions = { date: '2026-11-19', list: [kills300()] };
    const gold = back.gold;
    expect(missionsAfterRun(back, run({ kills: 900 }), '2026-11-18')).toEqual([]);
    expect(back.missions).toEqual({ date: '2026-11-19', list: [kills300()] });
    expect(back.gold).toBe(gold);
  });

  it('A completed mission pays at the end of the run', () => {
    const m = fresh();
    m.missions = { date: '2026-11-18', list: [kills300()] };
    const gold = m.gold;
    const done = missionsAfterRun(m, run({ kills: 312 }), '2026-11-18');
    expect(done).toHaveLength(1);
    expect(m.missions.list[0]).toEqual({ k: 'kills', p: '', goal: 300, prog: 300, done: true });
    expect(m.gold).toBe(gold + MISSIONS.gold.kills[0]);
    expect(m.goldEarned).toBe(MISSIONS.gold.kills[0]);
    // une seule fois : la partie suivante ne repaie pas
    expect(missionsAfterRun(m, run({ kills: 900 }), '2026-11-18')).toEqual([]);
    expect(m.gold).toBe(gold + MISSIONS.gold.kills[0]);
    // « en une partie » : deux parties de 200 ne font pas 300
    const n = fresh();
    n.missions = { date: '2026-11-18', list: [kills300()] };
    missionsAfterRun(n, run({ kills: 200 }), '2026-11-18');
    missionsAfterRun(n, run({ kills: 200 }), '2026-11-18');
    expect(n.missions.list[0].done).toBe(false);
    expect(n.missions.list[0].prog).toBe(200);
    // chaque modèle lit sa statistique de la partie
    const all: Mission[] = [
      { k: 'char', p: 'sorciere', goal: 1, prog: 0, done: false },
      { k: 'weapon', p: 'foudre', goal: 1, prog: 0, done: false },
      { k: 'elites', p: '', goal: 3, prog: 0, done: false },
    ];
    const o = fresh();
    o.missions = { date: '2026-11-18', list: all };
    expect(missionsAfterRun(o, run({ char: 'sorciere', weapons: ['orbe'], elites: 2 }), '2026-11-18')).toHaveLength(1);
    expect(missionsAfterRun(o, run({ weapons: ['orbe', 'foudre'], elites: 3 }), '2026-11-18')).toHaveLength(2);
    const p = fresh();
    p.missions = {
      date: '2026-11-18',
      list: [
        { k: 'survive', p: '', goal: 6, prog: 0, done: false },
        { k: 'chests', p: '', goal: 2, prog: 0, done: false },
        { k: 'level', p: '', goal: 10, prog: 0, done: false },
      ],
    };
    missionsAfterRun(p, run({ t: 359, chests: 1, weaponLv: 9 }), '2026-11-18');
    expect(p.missions.list.map((x) => x.prog)).toEqual([5, 1, 9]);
    missionsAfterRun(p, run({ t: 360, chests: 2, weaponLv: 10 }), '2026-11-18');
    expect(p.missions.list.every((x) => x.done)).toBe(true);
    // une partie finie le lendemain compte pour les missions du nouveau jour
    const q = fresh();
    q.missions = { date: '2026-11-17', list: [kills300()] };
    missionsAfterRun(q, run({ kills: 312 }), '2026-11-18');
    expect(q.missions.date).toBe('2026-11-18');
  });

  it('a hostile save is bounded and the cloud merge keeps the best progress', () => {
    expect(
      normalizeMissions({
        date: '2026-11-18',
        list: [
          { k: 'kills', goal: 300, prog: 9999, done: 'oui' },
          { k: 'char', p: 'inconnu', goal: 1 },
          { k: 'hack', goal: 1 },
          { k: 'weapon', p: 'orbe', goal: -5, prog: 3, done: true },
          { k: 'level', goal: 10 },
        ],
      }),
    ).toEqual({
      date: '2026-11-18',
      list: [
        { k: 'kills', p: '', goal: 300, prog: 300, done: false },
        { k: 'weapon', p: 'orbe', goal: 1, prog: 1, done: true },
        { k: 'level', p: '', goal: 10, prog: 0, done: false },
      ],
    });
    expect(normalizeMissions({ date: 'hier', list: [kills300()] })).toEqual({ date: '', list: [] });
    // le même jour sur deux appareils : la meilleure progression, cochée si elle l'est d'un côté
    const a = fresh(),
      b = fresh();
    a.missions = { date: '2026-11-18', list: [{ ...kills300(), prog: 120 }] };
    b.missions = { date: '2026-11-18', list: [{ ...kills300(), prog: 300, done: true }] };
    expect(withProgress(a, progressOf(b)).missions.list[0]).toEqual({ ...kills300(), prog: 300, done: true });
    // un jour plus récent l'emporte
    b.missions = { date: '2026-11-19', list: [] };
    expect(mergeMissions(a.missions, b.missions).date).toBe('2026-11-19');
    expect(withProgress(b, progressOf(a)).missions.date).toBe('2026-11-19');
  });
});
