// Lot L3 (docs/specs/l3-defi-serie-missions.md, décision 3) : le défi du jour court se règle par la simulation (règle 13).
// La mesure elle-même (800 défis, 4 graines regroupées) se lit dans docs/GATES.md, lot L3 : elle prend ≈ 14 min et ne
// tient pas dans les tests unitaires. Ici : la cible est celle de la spec, et la CLI mesure bien le défi du jeu (même
// monde que `worldOptions(…, true)`, réussite = vivant à DAILY.duration), parties de la graine 42 rejouées à l'identique.
// Défi v2 (docs/specs/defi-v2.md, décision 9) : médailles par règle du jour ; la mesure (4 graines × 200 défis par règle,
// ≈ 1 h 40 de calcul) est dans docs/GATES.md, ses chiffres sont recopiés ci-dessous et jugés par les cibles du jeu.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DAILY, DAILY_ARMORY, DAILY_RULE_KEYS, DAILY_RULES, NO_RULE, STEP } from '../src/sim/balance';
import type { DailyRuleKey } from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { Mode } from '../src/sim/types';
import type { Input } from '../src/sim/types';
import { World } from '../src/sim/world';
import { DEFAULT_META } from '../src/meta/save';
import { worldOptions } from '../src/meta/shop';
import { makeBot, pickAllowed } from './bots';
import { PROFILES, checkTargets } from './targets';

/**
 * La boucle de tools/sim-cli.ts (`--daily`) pour la partie `run` de la graine `base` (graine du monde base × 1000 + run,
 * bot moyen de graine × 7 + 1) ; sans --rule, la règle de la partie est la `run % 6`-ième.
 */
function dailyRun(base: number, run: number): World {
  const seed = base * 1000 + run;
  const o = worldOptions(DEFAULT_META, undefined, true);
  o.rule = run % DAILY_RULE_KEYS.length;
  const w = new World(seed, o);
  startRun(w);
  const bot = makeBot('average', seed * 7 + 1);
  const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
  let frame = 0;
  while (frame < (DAILY.duration + 1) / STEP) {
    if (w.mode === Mode.LevelUp) {
      inp.pick = pickAllowed(bot, w, w.cards, null);
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
    step(w, inp, STEP);
    if (w.mode === Mode.Dead || w.mode === Mode.Won) break;
  }
  return w;
}

describe('défi du jour court : réglage par la simulation (lot L3)', () => {
  it('The challenge is won about one time in two', () => {
    // la cible de la spec : 35 à 65 % des défis de l'Éclaireuse au kit de départ atteignent 5:00 (bot moyen) ; défi v2 :
    // c'est la médaille de bronze, suivie de l'argent et de l'or
    const daily = PROFILES.daily;
    expect(daily.map((x) => [x.name, x.min, x.max])).toEqual([
      ['bronze 35–65 %', 35, 65],
      ['argent 10–35 %', 10, 35],
      ['or 1–12 %', 1, 12],
      ['morts <3 min ≤ 20 %', 0, 20], // relecture d'équilibrage : écart visible (≈ 21 %), pas encore réglé
      ['chute max ≤ 22 pts/min', 0, 22],
    ]);
    const at = (pct: number) =>
      checkTargets({ bronzePct: pct, silverPct: 20, goldPct: 5, deadBefore3minPct: 0, maxDrop: 0 }, daily)[0].ok;
    expect(at(49.4)).toBe(true); // mesuré au lot L3 : 800 défis, graines 42 à 45
    expect(at(34)).toBe(false);
    expect(at(66)).toBe(false);
    // la CLI joue le défi du jeu : la partie 19 de la graine 42 (règle « Chasse aux élites ») meurt avant 5:00 avec le
    // même nombre de vaincus que dans la mesure (une partie réussie dure 18 000 pas, trop pour ce test sous couverture ;
    // l'arrêt à 5:00 est testé par « The daily challenge lasts 5 minutes », src/meta/daily.test.ts)
    const lost = dailyRun(42, 19);
    expect(DAILY_RULE_KEYS[lost.dailyRule]).toBe('elites');
    expect(lost.mode).toBe(Mode.Dead);
    expect(lost.t).toBeLessThan(DAILY.duration);
    expect(lost.kills).toBe(REPLAY.kills);
  });
});

/** Partie 19 de la graine 42 dans la mesure (`--daily --rule elites --seed 42`, results[19]) : morte à 0:46, 29 vaincus. */
const REPLAY = { kills: 29 };
/**
 * Défi v2 : mesure regroupée par règle, `npm run sim -- --daily --rule <clé> --runs 200 --seed 42…45 --out …` puis
 * `node tools/sim-pool.mjs` (docs/GATES.md, défi v2) : bronze, argent, or en %.
 */
/**
 * Empreinte des réglages mesurés (DAILY, DAILY_RULES, DAILY_ARMORY) : changer un réglage du défi sans refaire la mesure
 * fait échouer le test (relecture de l'inspecteur : les chiffres recopiés ne suivaient pas les réglages). Après une
 * nouvelle mesure, recopier les chiffres ci-dessous et la nouvelle empreinte.
 */
const MEASURED_FOR = '0f8cdc531fb8a4b3';
const MEASURED: Record<DailyRuleKey, [number, number, number]> = {
  swift: [40.8, 19.9, 2.9],
  elites: [39.6, 29.0, 5.5],
  swarm: [47.6, 29.1, 6.5],
  glass: [46.4, 22.4, 2.9],
  giants: [49.6, 17.9, 2.3],
  armory: [46.5, 17.5, 5.6],
};

describe('défi v2 : un défi juste quelle que soit la règle (décision 9)', () => {
  it('The challenge stays fair whatever the rule', () => {
    // la mesure recopiée est celle des réglages actuels
    const tuning = createHash('sha256')
      .update(JSON.stringify({ DAILY, DAILY_RULES, DAILY_ARMORY }))
      .digest('hex')
      .slice(0, 16);
    expect(tuning, 'réglages du défi changés : refaire la mesure (docs/GATES.md) et recopier MEASURED').toBe(
      MEASURED_FOR,
    );
    // chacune des six règles a sa mesure, et chacune est dans les cibles de médailles
    expect(Object.keys(MEASURED).sort()).toEqual([...DAILY_RULE_KEYS].sort());
    const medals = PROFILES.daily.slice(0, 3);
    for (const k of DAILY_RULE_KEYS) {
      const [bronzePct, silverPct, goldPct] = MEASURED[k];
      const checks = checkTargets({ bronzePct, silverPct, goldPct }, medals);
      expect(
        checks.filter((c) => !c.ok).map((c) => c.name),
        k,
      ).toEqual([]);
    }
    // chaque règle passe par un levier existant : aucune n'est la partie sans règle
    for (const k of DAILY_RULE_KEYS) expect(DAILY_RULES[k], k).not.toEqual(NO_RULE);
  });
});
