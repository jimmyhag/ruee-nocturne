import { describe, expect, it } from 'vitest';
import { FEEL, HitStop, tierCelebration } from './feel';

const FRAME = 1 / 60;
/** Simule `seconds` secondes réelles à 60 Hz ; `each` est appelé à chaque frame avant d'avancer. */
function run(h: HitStop, seconds: number, each: (h: HitStop, frame: number) => void): number {
  let game = 0;
  const n = Math.round(seconds / FRAME);
  for (let f = 0; f < n; f++) {
    each(h, f);
    game += h.advance(FRAME);
  }
  return game;
}
const K = FEEL.hitStop.kill;

describe('hit-stop borné', () => {
  it('un kill isolé ralentit 40 ms à 0,15× puis rend la main', () => {
    const h = new HitStop();
    const game = run(h, 1, (h, f) => f === 0 && h.request(K.duration, K.scale));
    const lost = K.duration * (1 - K.scale);
    expect(game).toBeCloseTo(1 - lost, 3);
    expect(h.timeScale).toBe(1);
  });
  it('un kill à chaque frame pendant 5 s laisse le temps de jeu avancer à ≥ 85 % (phase 1 : 15 %)', () => {
    const h = new HitStop();
    const game = run(h, 5, (h) => h.request(K.duration, K.scale));
    expect(game).toBeGreaterThanOrEqual(5 * 0.85);
    expect(game).toBeLessThan(5); // il y a bien eu des hit-stops
  });
  it('le joueur touché à chaque frame (prioritaire) ne fige pas non plus le temps', () => {
    const h = new HitStop();
    const U = FEEL.hitStop.hurt;
    const game = run(h, 5, (h) => h.request(U.duration, U.scale, 1));
    expect(game).toBeGreaterThanOrEqual(5 * 0.8);
  });
  it('un hit-stop prioritaire prolonge un hit-stop en cours sans dépasser la durée max', () => {
    const h = new HitStop();
    h.request(K.duration, K.scale);
    const B = FEEL.hitStop.boss;
    h.advance(FRAME);
    h.request(B.duration, B.scale, 2);
    let real = FRAME;
    while (h.active) {
      h.advance(FRAME);
      real += FRAME;
    }
    expect(real).toBeLessThanOrEqual(FEEL.hitStop.maxDuration + FRAME + 1e-9);
    expect(real).toBeGreaterThan(K.duration);
  });
  it('désactivé (réduction des effets), le temps de jeu suit exactement le temps réel', () => {
    const h = new HitStop();
    h.enabled = false;
    const game = run(h, 2, (h) => h.request(K.duration, K.scale, 2));
    expect(game).toBeCloseTo(2, 6);
  });
  it('un boss (priorité 2) part même pendant le délai, un kill ordinaire non', () => {
    const h = new HitStop();
    h.request(K.duration, K.scale);
    while (h.active) h.advance(FRAME); // fin du hit-stop : délai en cours
    h.request(K.duration, K.scale);
    expect(h.active).toBe(false);
    const B = FEEL.hitStop.boss;
    h.request(B.duration, B.scale, 2);
    expect(h.active).toBe(true);
    expect(h.timeScale).toBe(B.scale);
  });
  it('reset remet l’échelle à 1 et lève le délai', () => {
    const h = new HitStop();
    h.request(K.duration, K.scale);
    h.reset();
    expect(h.timeScale).toBe(1);
    expect(h.active).toBe(false);
    h.request(K.duration, K.scale);
    expect(h.active).toBe(true);
  });
});

// Lot L5 : célébration d'un palier visuel d'arme (docs/specs/l5-paliers-arme.md, décision 5)
describe('palier visuel d’arme : célébration', () => {
  it('With reduced effects the celebration is sober', () => {
    const full = { ...tierCelebration(1, false) };
    expect(full.shake).toBe(FEEL.tier.shake); // tremblement léger (0,3)
    expect(full.hitStop).toBe(0.08); // hit-stop de rendu 80 ms
    expect(full.particles).toBe(true);
    const sober = { ...tierCelebration(1, true) };
    expect(sober.shake).toBe(0); // sans tremblement…
    expect(sober.hitStop).toBe(0); // …ni hit-stop…
    expect(sober.particles).toBe(false); // …ni gerbe : la bannière et le son seulement
    expect(sober.pitch).toBe(full.pitch); // le son joue, plus aigu qu'une montée de niveau
    expect(sober.pitch).toBeGreaterThan(1);
    // et le hit-stop demandé par un palier reste borné par le contrôleur, désactivé en réduction des effets
    const h = new HitStop();
    h.enabled = false;
    h.request(sober.hitStop, FEEL.tier.hitStop.scale, 2);
    expect(h.active).toBe(false);
  });
  it('each tier sounds higher than the previous one', () => {
    const p = [1, 2, 3].map((t) => tierCelebration(t, false).pitch);
    expect(p[0]).toBeLessThan(p[1]);
    expect(p[1]).toBeLessThan(p[2]);
  });
});
