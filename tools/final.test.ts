// Le Cœur de la Nuit (docs/specs/boss-final.md, décision 13) : le boss final se règle par la simulation (règle 13). La
// mesure elle-même (profils maxé et nu, 4 graines × 200, bot moyen, `--endless` : plusieurs heures de calcul sur quatre
// cœurs) est dans docs/GATES.md ; elle ne tient pas dans les tests unitaires. Ici : les seuils de la spec, jugés sur les
// chiffres recopiés de la mesure des réglages actuels (empreinte de FINAL).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BOSS, CORRUPT, FINAL, HAZARDS } from '../src/sim/balance';
import { FINAL_TARGETS } from './targets';

/**
 * Mesure regroupée (graines 42 à 45, 200 parties chacune) : `npm run sim -- --profile maxed --endless --runs 200 --seed
 * <g> --out …`, lue par `node tools/sim-pool.mjs`, sur les parties qui atteignent l'Arène. Changer un réglage de FINAL
 * (ou de BOSS, HAZARDS.charge, CORRUPT) sans refaire la mesure fait échouer le test ; après une nouvelle mesure, recopier les chiffres et la nouvelle empreinte.
 */
// 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 12 amendée) : FINAL.hp ×8,5 → ×16, la rafale entière partant
// maintenant sur le boss seul (vaincu 66,2 % à ×8,5) ; mesure refaite, 4 graines × 200
const MEASURED_FOR = 'de32a84e73b3fd1a'; // FINAL, BOSS, HAZARDS.charge et CORRUPT de la mesure
const MEASURED = {
  arena: 133, // parties maxées qui atteignent l'Arène, sur 800
  winPct: 46.6, // % de celles-là qui battent le boss final
  fightP50: 172, // s, de son apparition à la fin du combat (victoire ou mort) : 2:52
  deathPhasePct: [27.5, 30.4, 11.6, 30.4], // % des morts dans l'Arène, par phase
  judgePct: 5.8, // % des morts dans l'Arène dues au Jugement
};

describe('le boss final : réglage par la simulation (décision 13)', () => {
  it('The final boss is hard without being a wall', () => {
    // le boss final reprend les attaques des boss (BOSS : salve, cercles, recul de la charge), la charge des Brutes élites
    // (HAZARDS.charge, son modèle) et les corrompus (CORRUPT : renforts des sceaux) : en changer un force la mesure
    const tuning = createHash('sha256')
      .update(JSON.stringify({ FINAL, BOSS, charge: HAZARDS.charge, CORRUPT }))
      .digest('hex')
      .slice(0, 16);
    expect(tuning, 'réglages du boss final changés : refaire la mesure (docs/GATES.md) et recopier MEASURED').toBe(
      MEASURED_FOR,
    );
    const s = {
      final: {
        winPct: MEASURED.winPct,
        fightP50: MEASURED.fightP50,
        deathPhaseMax: Math.max(...MEASURED.deathPhasePct),
        judgePct: MEASURED.judgePct,
      },
    };
    // les cibles de la CLI (tools/targets.ts) : 40 à 60 % de victoires, combat p50 2 à 4 min, aucune phase au-delà de
    // 50 % des morts, Jugement au plus 25 %
    for (const t of FINAL_TARGETS) {
      const v = t.get(s);
      expect(v, t.name).toBeGreaterThanOrEqual(t.min);
      expect(v, t.name).toBeLessThanOrEqual(t.max);
    }
    expect(MEASURED.arena, 'assez de parties dans l’Arène pour juger').toBeGreaterThanOrEqual(100);
  });
});
