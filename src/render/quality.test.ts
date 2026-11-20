// 1.69.2 (docs/specs/rendu-allege.md) : l'automate du rendu « auto ». Chaque test porte le nom (anglais) d'un scénario
// de la spec ; les fenêtres de mesure durent 2 s, l'horloge `t` avance donc de 2 s par fenêtre.
import { describe, expect, it } from 'vitest';
import {
  AUTO_QUALITY,
  type AutoQuality,
  QUALITY_STEPS,
  QualityChange,
  nearestCut,
  newAutoQuality,
  windowP95,
  qualityIdle,
  qualityNewRun,
  qualityWindow,
} from './quality';

const WINDOW = 2;
const SLOW = 40; // ms entre deux images : au-delà du seuil
const CALM = 16; // 60 images par seconde
const GPU_JS = 6; // JS d'une image quand c'est la carte graphique qui traîne
const CPU_JS = 36; // JS d'une image quand c'est lui qui traîne

/** Joue `n` fenêtres identiques à partir de `clock.t` ; rend les changements dans l'ordre. */
function windows(q: AutoQuality, clock: { t: number }, n: number, gap: number, js: number): QualityChange[] {
  const out: QualityChange[] = [];
  for (let i = 0; i < n; i++) {
    clock.t += WINDOW;
    out.push(qualityWindow(q, gap, js, clock.t));
  }
  return out;
}

describe('rendu auto (1.69.2)', () => {
  it('Rendering lightens before lowering the resolution', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    expect(QUALITY_STEPS[0]).toMatchObject({ lite: false, scale: 1 });
    const changes = windows(q, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    expect(changes).toEqual([QualityChange.None, QualityChange.None, QualityChange.Down]);
    expect(q.step).toBe(1);
    expect(QUALITY_STEPS[q.step].lite).toBe(true);
    expect(QUALITY_STEPS[q.step].scale).toBe(1); // la résolution interne ne change pas
  });

  it('Auto setting never pixelates the image', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    const scales: number[] = [];
    const changes: QualityChange[] = [];
    for (let k = 0; k < 20; k++) {
      changes.push(...windows(q, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS));
      scales.push(QUALITY_STEPS[q.step].scale);
    }
    // palier par palier : net allégé, ×0,85, ×0,7, ×0,6, puis plus rien
    expect(scales.slice(0, 5)).toEqual([1, 0.85, 0.7, 0.6, 0.6]);
    expect(q.step).toBe(QUALITY_STEPS.length - 1);
    expect(Math.min(...QUALITY_STEPS.map((s) => s.scale))).toBe(0.6); // plancher lisse : aucun palier n'est le pixel
    // une seule bannière : à la première baisse de résolution
    expect(changes.filter((c) => c === QualityChange.FirstResolutionDrop)).toHaveLength(1);
    expect(changes.filter((c) => c === QualityChange.Down)).toHaveLength(3);
  });

  it('Slow JavaScript does not lower the resolution', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    windows(q, clock, 10 * AUTO_QUALITY.slowWindows, SLOW, CPU_JS);
    expect(q.step).toBe(1); // allégé
    expect(QUALITY_STEPS[q.step].scale).toBe(1); // la résolution interne ne baisse pas
    // le seuil : au-delà de 70 % du p95 des intervalles, c'est le JS
    const r = newAutoQuality();
    r.step = 1;
    windows(r, clock, AUTO_QUALITY.slowWindows, SLOW, SLOW * AUTO_QUALITY.cpuShare + 1);
    expect(r.step).toBe(1);
    windows(r, clock, AUTO_QUALITY.slowWindows, SLOW, SLOW * AUTO_QUALITY.cpuShare - 1);
    expect(r.step).toBe(2);
  });

  it('Rendering climbs back when the horde passes', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    windows(q, clock, 2 * AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    expect(QUALITY_STEPS[q.step].scale).toBe(0.85);
    // 10 s d'images confortables (cinq fenêtres) : un palier plus haut, pas avant
    expect(windows(q, clock, AUTO_QUALITY.calmWindows - 1, CALM, 4)).not.toContain(QualityChange.Up);
    expect(windows(q, clock, 1, CALM, 4)).toEqual([QualityChange.Up]);
    expect(q.step).toBe(1);
    windows(q, clock, AUTO_QUALITY.calmWindows, CALM, 4);
    expect(q.step).toBe(0); // net
    windows(q, clock, 3 * AUTO_QUALITY.calmWindows, CALM, 4);
    expect(q.step).toBe(0);
    // une fenêtre moyenne (entre 18 et 24 ms) remet la série à zéro
    const m = newAutoQuality();
    m.step = 2;
    windows(m, clock, AUTO_QUALITY.calmWindows - 1, CALM, 4);
    windows(m, clock, 1, 20, 4);
    windows(m, clock, AUTO_QUALITY.calmWindows - 1, CALM, 4);
    expect(m.step).toBe(2);
  });

  it('A step that falls right after a climb stays locked', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    windows(q, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    windows(q, clock, AUTO_QUALITY.calmWindows, CALM, 4);
    expect(q.step).toBe(0); // remontée au rendu net
    windows(q, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS); // 6 s plus tard : dans les 20 s
    expect(q.step).toBe(1); // le rendu redescend
    windows(q, clock, 20 * AUTO_QUALITY.calmWindows, CALM, 4);
    expect(q.step).toBe(1); // et ne remonte plus jusqu'à la fin de la partie
    // une nouvelle partie lève le blocage
    qualityNewRun(q);
    windows(q, clock, AUTO_QUALITY.calmWindows, CALM, 4);
    expect(q.step).toBe(0);
    // retomber après 20 s n'est pas un yo-yo : la remontée reste permise
    const r = newAutoQuality();
    windows(r, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    windows(r, clock, AUTO_QUALITY.calmWindows, CALM, 4);
    windows(r, clock, 6, 20, 4); // 12 s ni lentes ni confortables
    windows(r, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS); // 18 s après la remontée : bloqué
    expect(r.floor).toBe(1);
    const s = newAutoQuality();
    windows(s, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    windows(s, clock, AUTO_QUALITY.calmWindows, CALM, 4);
    windows(s, clock, 8, 20, 4); // 16 s, puis 6 s de lenteur : 22 s après la remontée
    windows(s, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    expect(s.step).toBe(1);
    expect(s.floor).toBe(0);
  });

  it('a window out of play restarts the streaks', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    windows(q, clock, AUTO_QUALITY.slowWindows - 1, SLOW, GPU_JS);
    qualityIdle(q);
    windows(q, clock, AUTO_QUALITY.slowWindows - 1, SLOW, GPU_JS);
    expect(q.step).toBe(0);
  });

  it('a new run keeps the step and shows the banner again at its first resolution drop', () => {
    const q = newAutoQuality(),
      clock = { t: 0 };
    windows(q, clock, 2 * AUTO_QUALITY.slowWindows, SLOW, GPU_JS);
    expect(q.resDropped).toBe(true);
    qualityNewRun(q);
    expect(q.step).toBe(2);
    expect(windows(q, clock, AUTO_QUALITY.slowWindows, SLOW, GPU_JS)).toContain(QualityChange.FirstResolutionDrop);
  });

  it('nearestCut keeps the cap nearest values, without allocating', () => {
    const d2 = new Float32Array(64);
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + ((trial * 7) % 64),
        cap = (trial * 5) % 40;
      for (let i = 0; i < n; i++) d2[i] = Math.floor(Math.random() * 30); // des égalités
      const sorted = Array.from(d2.subarray(0, n)).sort((a, b) => a - b);
      const cut = nearestCut(d2, n, cap);
      if (n <= cap) expect(cut).toBe(Infinity);
      else if (cap === 0) expect(cut).toBe(-Infinity);
      else expect(cut).toBe(sorted[cap - 1]);
    }
  });

  it('windowP95 reads only the frames of the window', () => {
    const ring = new Float64Array(120).fill(500), // 24 s d'images à 200 ms avant la fenêtre
      tmp = new Float64Array(120);
    let idx = 250;
    for (let k = 0; k < 10; k++) ring[idx++ % 120] = 40;
    expect(windowP95(ring, idx, 10, tmp)).toBe(40);
    for (let k = 0; k < 120; k++) ring[idx++ % 120] = k; // 0…119 : le p95 de 120 valeurs est la 115e
    expect(windowP95(ring, idx, 500, tmp)).toBe(114);
    expect(windowP95(ring, idx, 1, tmp)).toBe(119);
    expect(windowP95(new Float64Array(4).fill(7), 2, 0, new Float64Array(4))).toBe(7);
  });
});
