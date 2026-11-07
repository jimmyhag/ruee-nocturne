// Mouvements à l'écran (phase 29) : sur une piste à bosses, la glisse reste en pose de glisse ; la réception n'est
// jouée qu'après un vrai vol à l'arrêt ; pas d'aller-retour course/repos ; inclinaison bornée.
import { describe, expect, it } from 'vitest';
import { Base, MOTION, MotionState, spinEase } from './motion';
import type { MotionInput } from './motion';

const DT = 1 / 60;
const input = (o: Partial<MotionInput> = {}): MotionInput => ({
  onGround: true,
  sliding: false,
  airMom: false,
  slideJump: false,
  height: 0,
  speed: 0,
  face: 0,
  slopeAlong: 0,
  slopeLat: 0,
  ...o,
});

describe('mouvements', () => {
  it('piste à bosses : la glisse reste en pose de glisse, jamais de réception accroupie', () => {
    const m = new MotionState();
    let slide = 0,
      frames = 0,
      lands = 0;
    for (let f = 0; f < 600; f++) {
      const t = f * DT;
      const air = t % 0.5 < 0.1 && t > 0.2; // une bosse toutes les 0,5 s : 0,1 s en l'air, élan de glisse gardé
      const wasAir = m.airT > 0;
      if (wasAir && !air && m.shouldLand(true, 10)) lands++;
      m.update(DT, input({ onGround: !air, sliding: !air, airMom: air, height: air ? 0.4 : 0, speed: 10 }));
      frames++;
      if (m.base === Base.Slide) slide++;
    }
    expect(slide / frames).toBeGreaterThan(0.95);
    expect(lands).toBe(0);
  });
  it('envol en glisse : pose de glisse en l’air ; un long envol passe en pose de vol', () => {
    const m = new MotionState();
    m.update(DT, input({ speed: 10, sliding: true }));
    for (let f = 0; f < 18; f++) m.update(DT, input({ onGround: false, airMom: true, height: 1.5, speed: 10 })); // 0,3 s
    expect(m.base).toBe(Base.Slide);
    for (let f = 0; f < 18; f++) m.update(DT, input({ onGround: false, airMom: true, height: 2.5, speed: 10 }));
    expect(m.base).toBe(Base.Fall);
  });
  it('saut depuis la glisse (1.24.1) : animation normale en l’air, comme si la glissade était annulée', () => {
    const m = new MotionState();
    m.update(DT, input({ speed: 10, sliding: true }));
    expect(m.base).toBe(Base.Slide);
    let slide = 0;
    for (let f = 0; f < 30; f++) {
      m.update(DT, input({ onGround: false, airMom: true, slideJump: true, height: 0.2 + f * 0.04, speed: 10 }));
      if (m.base === Base.Slide) slide++;
    }
    expect(m.base).toBe(Base.Fall);
    expect(slide).toBeLessThanOrEqual(Math.ceil(MOTION.airDelay / DT)); // au plus le court délai avant la pose de vol
    m.update(DT, input({ speed: 6 })); // réception debout, en courant
    m.update(DT, input({ speed: 6 }));
    expect(m.base).toBe(Base.Run);
  });
  it('petit saut de bosse sans élan : la pose de sol est gardée', () => {
    const m = new MotionState();
    for (let f = 0; f < 30; f++) m.update(DT, input({ speed: 6 }));
    expect(m.base).toBe(Base.Run);
    for (let f = 0; f < 6; f++) m.update(DT, input({ onGround: false, height: 0.2, speed: 6 })); // 0,1 s
    expect(m.base).toBe(Base.Run);
  });
  it('grand saut à l’arrêt : chute puis réception ; en courant : pas de réception', () => {
    const m = new MotionState();
    for (let f = 0; f < 45; f++) m.update(DT, input({ onGround: false, height: 1 + f * 0.02 }));
    expect(m.base).toBe(Base.Fall);
    expect(m.shouldLand(false, 0.5)).toBe(true);
    expect(m.shouldLand(false, 6)).toBe(false); // on court : on enchaîne
    expect(m.shouldLand(true, 0.5)).toBe(false); // la glisse continue
    m.update(DT, input({ speed: 6 }));
    expect(m.airT).toBe(0);
    for (let f = 0; f < 3; f++) m.update(DT, input({ speed: 6 }));
    expect(m.base).toBe(Base.Run);
    expect(m.fade).toBe(MOTION.fadeLand);
  });
  it('hystérésis : à vitesse frontière, pas d’aller-retour course/repos', () => {
    const m = new MotionState();
    m.update(DT, input({ speed: 2 }));
    expect(m.base).toBe(Base.Run);
    let flips = 0,
      prev = m.base;
    for (let f = 0; f < 120; f++) {
      m.update(DT, input({ speed: 0.5 + Math.sin(f) * 0.12 })); // oscille entre 0,38 et 0,62
      if (m.base !== prev) flips++;
      prev = m.base;
    }
    expect(flips).toBe(0);
  });
  it('fondus : vif vers la glisse, plus doux pour se relever', () => {
    const m = new MotionState();
    m.update(DT, input({ speed: 8, sliding: true }));
    expect(m.base).toBe(Base.Slide);
    expect(m.fade).toBe(MOTION.fadeSlideIn);
    m.update(DT, input({ speed: 6 }));
    expect(m.base).toBe(Base.Run);
    expect(m.fade).toBe(MOTION.fadeSlideOut);
  });
  it('cadence de course bornée (la foulée ne s’emballe pas)', () => {
    const m = new MotionState();
    m.update(DT, input({ speed: 15 }));
    expect(m.runScale).toBe(MOTION.runMax);
    m.update(DT, input({ speed: 1 }));
    expect(m.runScale).toBe(MOTION.runMin);
  });
  it('inclinaison : dans le virage et le long de la pente en glisse, bornée, nulle à l’arrêt', () => {
    const m = new MotionState();
    let face = 0;
    for (let f = 0; f < 60; f++) {
      face += 3 * DT; // virage à 3 rad/s
      m.update(DT, input({ speed: 6.2, face }));
    }
    expect(m.roll).toBeLessThan(-0.05); // penché vers l'intérieur du virage
    expect(Math.abs(m.roll)).toBeLessThanOrEqual(MOTION.rollMax + 1e-9);
    for (let f = 0; f < 60; f++) m.update(DT, input({ speed: 10, sliding: true, face, slopeAlong: -0.4 }));
    expect(m.pitch).toBeGreaterThan(0.25); // en descente, le corps suit la pente vers l'avant
    for (let f = 0; f < 120; f++) m.update(DT, input({ face }));
    expect(Math.abs(m.pitch)).toBeLessThan(0.01);
    expect(Math.abs(m.roll)).toBeLessThan(0.01);
  });
  it('vrille : rapide puis amortie, un tour complet', () => {
    expect(spinEase(0)).toBe(0);
    expect(spinEase(1)).toBe(1);
    expect(spinEase(0.3)).toBeGreaterThan(0.6);
  });
});
