// Monstres corrompus (docs/specs/corrompus.md, décision 9) : les corrompus se règlent par la simulation (règle 13). La
// mesure elle-même (profils nu et maxé, 4 graines × 200, avec et sans corrompus, bot moyen et bot qui reste en
// prolongation : ≈ 2 h de calcul sur quatre cœurs) est dans docs/GATES.md ; elle ne tient pas dans les tests unitaires.
// Ici : les seuils de la spec, jugés sur les chiffres recopiés de la mesure des réglages actuels (empreinte de CORRUPT).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CORRUPT } from '../src/sim/balance';
import { World } from '../src/sim/world';

/**
 * Mesure regroupée (graines 42 à 45, 200 parties chacune) : `npm run sim -- --profile <p> --endless --runs 200 --seed
 * <g> --out …` avec et sans `--no-corrupt` (victoires, % des parties), puis la même chose avec BOT_FARM=1, le bot qui
 * reste en prolongation après le boss du totem (s tenues en prolongation par ceux qui y meurent, médiane ; part des morts
 * en prolongation dues à une compétence corrompue). Lecture : `node tools/sim-pool.mjs`. Changer un réglage de CORRUPT
 * sans refaire la mesure fait échouer le test ; après une nouvelle mesure, recopier les chiffres et la nouvelle empreinte.
 */
const MEASURED_FOR = '12bcad20eb5ac3d1';
const MEASURED = {
  maxed: { winOff: 17.0, winOn: 16.1, overOff: 102.5, overOn: 96.5, skillPct: 28.0 },
  naked: { winOff: 22.5, winOn: 23.0, overOff: 85.6, overOn: 79.0, skillPct: 23.6 },
};

describe('monstres corrompus : réglage par la simulation (décision 9)', () => {
  it('A corrupted monster pays more without snowballing', () => {
    const tuning = createHash('sha256').update(JSON.stringify(CORRUPT)).digest('hex').slice(0, 16);
    expect(tuning, 'réglages des corrompus changés : refaire la mesure (docs/GATES.md) et recopier MEASURED').toBe(
      MEASURED_FOR,
    );
    for (const [profile, m] of Object.entries(MEASURED)) {
      // les victoires ne montent pas de plus de 3 points (anti boule de neige)
      expect(m.winOn - m.winOff, `${profile} : victoires`).toBeLessThanOrEqual(3);
      // plus dangereux, pas un mur : la prolongation tient de 0 à 20 s de moins
      expect(m.overOn - m.overOff, `${profile} : prolongation`).toBeLessThanOrEqual(0);
      expect(m.overOn - m.overOff, `${profile} : prolongation`).toBeGreaterThanOrEqual(-20);
      // les compétences corrompues font au plus 30 % des morts en prolongation
      expect(m.skillPct, `${profile} : morts par une compétence`).toBeLessThanOrEqual(30);
    }
    // la mesure « sans » est bien la partie d'avant le lot : la CLI (`--no-corrupt`) passe l'option au monde
    expect(new World(1, { noCorrupt: true }).noCorrupt).toBe(true);
    expect(new World(1).noCorrupt).toBe(false);
    // décision 6 : un corrompu rapporte plus, mais moins que le double
    expect(CORRUPT.gold).toBeGreaterThan(1);
    expect(CORRUPT.xp).toBeGreaterThan(1);
    expect(CORRUPT.gold).toBeLessThan(2);
    expect(CORRUPT.xp).toBeLessThan(2);
  });
});
