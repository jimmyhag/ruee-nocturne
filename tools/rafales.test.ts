// Rafales et vraie faux (docs/specs/rafales-faux-guidage.md, décision 12) : les armes se règlent par la simulation
// (règle 13). La mesure elle-même (profils maxé et nu, 4 graines × 200, bot moyen, `--endless`, avant et après ; défi du
// jour et partie guidée, 2 graines × 200 ; les neuf personnages à 100 parties chacun : plusieurs heures de calcul sur
// quatre cœurs) est dans docs/GATES.md ; elle ne tient pas dans les tests unitaires. Ici : le scénario, jugé sur les
// chiffres recopiés de la mesure des réglages actuels (empreinte des armes touchées).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BOOMERANG, BURST, FAUX, FOUET, LANCE, WEAPON_LINES } from '../src/sim/balance';
import { WEAPONS, WEAPON_KEYS } from '../src/sim/weapons/defs';
import { FINAL_TARGETS, PROFILES } from './targets';

/**
 * Mesure regroupée (graines 42 à 45, 200 parties chacune) : `npm run sim -- --profile <p> --endless --runs 200 --seed <g>
 * --out …`, lue par `node tools/sim-pool.mjs` ; défi du jour et partie guidée : `--daily`, `--tutorial`, graines 42 et 43 ;
 * personnages : `--character <c> --runs 100 --seed 42`, survie p50. « Avant » : la 1.68.0. Changer un réglage des
 * armes touchées sans refaire la mesure fait échouer le test ; après une nouvelle mesure, recopier les chiffres et la
 * nouvelle empreinte.
 */
const MEASURED_FOR = 'f08eb1a66e263e7e'; // BURST, FAUX, FOUET, BOOMERANG, LANCE, bases et lignes des armes touchées (e21a39a)
const MEASURED = {
  // part des parties maxées où chaque arme est prise (hors arme de départ), la moins et la plus prise
  runsWithPct: { min: 21.5, max: 26.3 },
  // cibles des profils (tools/targets.ts), parties regroupées
  maxed: { world2: 79.1, world3: 51.4, win: 17.3, overDeaths: 24.0, before3: 0.6 },
  naked: { world2: 39.5, win: 24.9, before3: 21.6 },
  final: { winPct: 66.2 }, // boss final vaincu, parties maxées qui atteignent l'Arène (133)
  daily: { bronze: 45.3, silver: 35.3, gold: 8.5 },
  tutorial: { reach: 98.0, killed: 93.6 },
  // survie p50 (s) des neuf personnages (ordre de CHARS), 100 parties chacun, graine 42, avant (1.68.0) et après
  chars: {
    before: {
      maxed: [1509, 1295, 530, 1266, 1033, 936, 1037, 1503, 1235],
      naked: [231, 353, 260, 279, 484, 260, 296, 237, 337],
    },
    after: {
      maxed: [1453, 1582, 1008, 1586, 1169, 987, 1172, 1511, 1513],
      naked: [315, 353, 260, 279, 510, 260, 439, 237, 337],
    },
  },
};
const CHARS = [
  'eclaireuse',
  'bucheron',
  'sorciere',
  'veilleuse',
  'braconnier',
  'sapeur',
  'feufollet',
  'revenante',
  'colporteur',
];
/**
 * Cibles existantes hors de leurs bornes après la mesure : les combats contre un boss seul (boss final, boss final du
 * défi, boss de la partie guidée), où la rafale entière part maintenant sur lui au lieu de s'éventailler à côté. Les
 * leviers de la décision 12 (dégâts de base, BURST.gap, faux) ne les ramènent pas sans casser le profil nu (docs/GATES.md) :
 * décision de Jimmy attendue. Le test les épingle : en ramener une dans ses bornes le fait échouer, à mettre à jour.
 */
const OUT_OF_TARGET = ['boss final vaincu 40–60 %', 'argent 10–35 %', 'boss abattu 25–75 %'];

/** Noms des cibles hors bornes pour un résumé partiel : une cible dont le chiffre n'est pas recopié ici est ignorée. */
const outOf = (
  targets: { name: string; min: number; max: number; get: (s: never) => number }[],
  s: unknown,
): string[] =>
  targets
    .filter((t) => {
      let v: number;
      try {
        v = t.get(s as never);
      } catch {
        return false;
      }
      return typeof v === 'number' && (v < t.min || v > t.max);
    })
    .map((t) => t.name);

describe('les armes restent équilibrées (décision 12)', () => {
  it('The weapons stay balanced', () => {
    const touched = {
      BURST,
      FAUX,
      FOUET,
      BOOMERANG,
      LANCE,
      bases: ['orbe', 'lance', 'boomerang', 'fouet', 'faux'].map((k) => WEAPONS[k as keyof typeof WEAPONS].base),
      lines: [WEAPON_LINES.faux, WEAPON_LINES.fouet],
    };
    const tuning = createHash('sha256').update(JSON.stringify(touched)).digest('hex').slice(0, 16);
    expect(tuning, 'réglages des armes changés : refaire la mesure (docs/GATES.md) et recopier MEASURED').toBe(
      MEASURED_FOR,
    );
    // chaque arme est choisie dans 8 à 35 % des parties (profil maxé, douze armes hors arme de départ)
    expect(WEAPON_KEYS.length).toBe(13);
    expect(MEASURED.runsWithPct.min).toBeGreaterThanOrEqual(8);
    expect(MEASURED.runsWithPct.max).toBeLessThanOrEqual(35);
    // les cibles existantes (tools/targets.ts) : celles des profils tiennent, sauf « morts < 3 min » du profil nu, déjà
    // hors bornes avant le lot (22,3 %) ; les combats contre un boss seul sortent des leurs (OUT_OF_TARGET)
    const maxed = {
      stage2Pct: MEASURED.maxed.world2,
      stage3Pct: MEASURED.maxed.world3,
      reachedEndPct: MEASURED.maxed.win,
      overDeathPct: MEASURED.maxed.overDeaths,
      deadBefore3minPct: MEASURED.maxed.before3,
    };
    const naked = {
      stage2Pct: MEASURED.naked.world2,
      reachedEndPct: MEASURED.naked.win,
      deadBefore3minPct: MEASURED.naked.before3,
    };
    expect(outOf(PROFILES.maxed, maxed), 'maxé').toEqual([]);
    expect(outOf(PROFILES.naked, naked), 'nu').toEqual(['morts <3 min ≤ 20 %']);
    const out = [
      ...outOf(FINAL_TARGETS, { final: { winPct: MEASURED.final.winPct } }),
      ...outOf(PROFILES.daily, {
        bronzePct: MEASURED.daily.bronze,
        silverPct: MEASURED.daily.silver,
        goldPct: MEASURED.daily.gold,
      }),
      ...outOf(PROFILES.tutorial, { tuto: { reachPct: MEASURED.tutorial.reach, killPct: MEASURED.tutorial.killed } }),
    ];
    expect(out, 'cibles hors bornes : décision de Jimmy (docs/GATES.md)').toEqual(OUT_OF_TARGET);
    // les neuf personnages à ± 3 min de l'Éclaireuse, dans chaque profil : déjà loin d'être tenu avant le lot (maxé :
    // sept personnages hors de la fourchette, la Sorcière à −16 min ; nu : le Braconnier à +4:13). Après : aucun
    // personnage n'en sort qui n'en sortait pas avant, et ceux qui en sortent s'en rapprochent
    const outside = (t: number[]) => CHARS.filter((_, i) => i > 0 && Math.abs(t[i] - t[0]) > 180);
    for (const p of ['maxed', 'naked'] as const) {
      const before = MEASURED.chars.before[p],
        after = MEASURED.chars.after[p];
      expect(before.length).toBe(CHARS.length);
      expect(after.length).toBe(CHARS.length);
      for (const c of outside(after)) {
        expect(outside(before), `${p} : ${c}`).toContain(c);
        const i = CHARS.indexOf(c);
        expect(Math.abs(after[i] - after[0]), `${p} : ${c}`).toBeLessThan(Math.abs(before[i] - before[0]));
      }
    }
    expect(outside(MEASURED.chars.after.maxed)).toEqual(['sorciere', 'braconnier', 'sapeur', 'feufollet']);
    expect(outside(MEASURED.chars.after.naked)).toEqual(['braconnier']);
  });
});
