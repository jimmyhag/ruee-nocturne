// Phase 36 : la planche de bruitages et les musiques produites par `npm run audio` (tools/audio/build.ts).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDGET, SOUNDS, TRACKS } from '../../tools/audio/config';
import SFX from './sfx.json';

const AUDIO = path.resolve(import.meta.dirname, '../../public/audio');
const fileOf = (url: string) => path.join(AUDIO, url.split('?')[0]);

describe('manifeste audio (sfx.json)', () => {
  it('chaque son de la config est dans le manifeste, avec toutes ses variantes', () => {
    expect(Object.keys(SFX.sounds).sort()).toEqual(Object.keys(SOUNDS).sort());
    for (const [key, d] of Object.entries(SOUNDS)) {
      expect(SFX.sounds[key as keyof typeof SFX.sounds].length, key).toBe(d.files.length);
    }
  });

  it('segments de durée positive, au plus la longueur max, sans chevauchement, dans la planche', () => {
    const segs = Object.entries(SFX.sounds).flatMap(([key, vs]) => vs.map(([t, d]) => ({ key, t, d })));
    segs.sort((a, b) => a.t - b.t);
    expect(segs[0].t).toBeGreaterThan(0);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      expect(s.d, s.key).toBeGreaterThan(0.02);
      expect(s.d, s.key).toBeLessThanOrEqual(SOUNDS[s.key].max + 0.01);
      if (i > 0) expect(s.t, s.key).toBeGreaterThanOrEqual(segs[i - 1].t + segs[i - 1].d);
    }
  });

  it('les fichiers existent, la version de cache suit la taille, budgets tenus', () => {
    const sfx = fs.statSync(fileOf(SFX.sfx)).size;
    expect(sfx).toBe(SFX.sfxBytes);
    expect(SFX.sfx).toBe(`sfx.mp3?v=${sfx}`);
    expect(sfx).toBeLessThanOrEqual(BUDGET.sfx);
    expect(Object.keys(SFX.tracks).sort()).toEqual(Object.keys(TRACKS).sort());
    for (const [name, tr] of Object.entries(SFX.tracks)) {
      const bytes = fs.statSync(fileOf(tr.file)).size;
      expect(bytes, name).toBe(tr.bytes);
      expect(bytes, name).toBeLessThanOrEqual(BUDGET.track);
      expect(tr.dur, name).toBeGreaterThan(10);
    }
  });
});
