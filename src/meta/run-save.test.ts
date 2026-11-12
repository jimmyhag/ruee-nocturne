// Phase 49 : partie gardée sur l'appareil (stockage, lecture, format).
import { describe, expect, it } from 'vitest';
import { snapshotWorld, SNAP_FORMAT } from '../sim/snapshot';
import { startRun } from '../sim/step';
import { World } from '../sim/world';
import { clearRun, parseRun, peekRun, RUN_KEY, writeRun, type SavedRun } from './run-save';

class MemStore {
  data = new Map<string, string>();
  quota = Infinity;
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (v.length > this.quota) throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
function sample(): SavedRun {
  const w = new World(5);
  startRun(w);
  return {
    v: 1,
    version: '1.52.0',
    at: 1,
    snap: snapshotWorld(w),
    character: 'eclaireuse',
    outfit: 0,
    daily: false,
    runStats: { dards: 0, elites: 0, bosses: 0 },
    summary: { stage: 1, stageT: 0, t: 0, endless: false, kills: 0 },
  };
}

describe('partie gardée : stockage', () => {
  it('écrit puis relit la même partie', () => {
    const s = new MemStore();
    const run = sample();
    expect(writeRun(run, s)).toBe(true);
    const r = peekRun(s);
    expect(r && 'run' in r && r.run.snap.startSeed).toBe(5);
  });
  it('oubliée après clearRun', () => {
    const s = new MemStore();
    writeRun(sample(), s);
    clearRun(s);
    expect(peekRun(s)).toBeNull();
  });
  it('quota dépassé : rien d’ancien ne reste dans localStorage (le secours est IndexedDB)', () => {
    const s = new MemStore();
    writeRun(sample(), s);
    s.quota = 10;
    expect(writeRun(sample(), s)).toBe(false);
    expect(s.getItem(RUN_KEY)).toBeNull();
  });
  it('stockage absent ou bloqué : pas d’erreur', () => {
    expect(peekRun(null)).toBeNull();
    expect(() => clearRun(null)).not.toThrow();
  });
});

describe('partie gardée : lecture', () => {
  it('texte illisible ou incomplet : ignoré', () => {
    expect(parseRun('{pas du json')).toBeNull();
    expect(parseRun(null)).toBeNull();
    expect(parseRun({ v: 1 })).toBeNull();
    expect(parseRun({ ...sample(), v: 2 })).toBeNull();
  });
  it('format d’instantané d’une autre version : signalé comme périmé', () => {
    const run = sample();
    run.snap.format = SNAP_FORMAT + 1;
    expect(parseRun(JSON.stringify(run))).toEqual({ stale: true });
  });
});
