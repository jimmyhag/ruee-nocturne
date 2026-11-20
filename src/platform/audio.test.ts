// 1.69.0 (docs/specs/rafales-faux-guidage.md, relecture perf) : un Ev.Shoot par tir de rafale. Une Orbe à 9 projectiles
// ne doit pas jouer 9 sons par salve ni saturer les 24 voix : le son des tirs est fusionné (MIN_GAP), avec les
// bruitages comme avec le repli synthétisé. Contexte audio factice (Vitest tourne sous Node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BURST, STEP } from '../sim/balance';
import { AudioBus } from './audio';

/** Nœud audio factice : tout se connecte, rien ne sonne. */
const node = () => ({
  connect: () => undefined,
  disconnect: () => undefined,
  start: () => undefined,
  stop: () => undefined,
  gain: {
    value: 1,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  },
  frequency: {
    value: 0,
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
  },
  playbackRate: { value: 1 },
  threshold: { value: 0 },
  ratio: { value: 0 },
  type: '',
  buffer: null as unknown,
});
class FakeContext {
  currentTime = 0;
  state = 'running';
  destination = node();
  createGain = node;
  createDynamicsCompressor = node;
  createBiquadFilter = node;
  createOscillator = node;
  createBufferSource = node;
  resume = async () => undefined;
  suspend = async () => undefined;
  decodeAudioData = async () => ({ duration: 60 });
}

let ctx: FakeContext;
beforeEach(() => {
  vi.stubGlobal('window', {
    AudioContext: class extends FakeContext {
      constructor() {
        super();
        ctx = this; // eslint-disable-line @typescript-eslint/no-this-alias
      }
    },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Une salve de l'Orbe à 9 projectiles, un tir tous les BURST.gap.orbe (au pas de simulation), 2 s de jeu. */
function burst(bus: AudioBus): number {
  let most = 0;
  const gapSteps = Math.round(BURST.gap.orbe / STEP);
  for (let f = 0; f < 120; f++) {
    ctx.currentTime = f * STEP;
    if (f % 57 < 9 * gapSteps && (f % 57) % gapSteps === 0) bus.shoot(); // 9 tirs par salve, une salve par 0,95 s
    most = Math.max(most, bus.voiceCount);
  }
  return most;
}

describe('les tirs en rafale ne saturent pas les voix', () => {
  it('a burst of nine shots plays its sound only a few times (synthesised fallback)', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 })); // pas de bruitages : le repli synthétisé
    const bus = new AudioBus();
    bus.init();
    await Promise.resolve();
    const played = vi.spyOn(ctx, 'createOscillator');
    const most = burst(bus);
    // 2 s, 18 tirs : au plus un son par MIN_GAP (0,2 s), et jamais plus de quelques voix à la fois
    expect(played.mock.calls.length).toBeLessThanOrEqual(11);
    expect(played.mock.calls.length).toBeGreaterThan(0); // les tirs s'entendent encore
    expect(most).toBeLessThanOrEqual(2);
    expect(most).toBeLessThan(bus.maxVoices);
  });

  it('a burst of nine shots plays its sound only a few times (recorded sounds)', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const bus = new AudioBus();
    bus.init();
    for (let i = 0; i < 5; i++) await Promise.resolve(); // bruitages « chargés »
    const played = vi.spyOn(ctx, 'createBufferSource');
    burst(bus);
    expect(played.mock.calls.length).toBeLessThanOrEqual(11);
    expect(played.mock.calls.length).toBeGreaterThan(0);
  });
});
