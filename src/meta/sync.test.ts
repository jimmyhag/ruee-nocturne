// Synchronisation (phase 13) : frontière progression / appareil, décision à trois versions, documents du nuage. Aucun DOM.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_META, normalizeMeta } from './save';
import type { Meta } from './save';
import {
  DEVICE_KEYS,
  PROGRESS_KEYS,
  decide,
  fromCloudDoc,
  hasProgress,
  progressOf,
  sameProgress,
  summary,
  toCloudDoc,
  withProgress,
} from './sync';
import type { CloudDoc, SyncRecord } from './sync';

const fresh = () => normalizeMeta(DEFAULT_META);
const played = (): Meta =>
  normalizeMeta({
    ...DEFAULT_META,
    runs: 9,
    bestTime: 754,
    gold: 1234.6,
    goldEarned: 5000,
    achievements: ['survie3'],
    muted: true,
    settings: { ...DEFAULT_META.settings, lefty: true, hudScale: 1.2 },
  });
const cloud = (m: Meta, updatedAt: number): CloudDoc => toCloudDoc(m, updatedAt);
const rec = (o: Partial<SyncRecord> = {}): SyncRecord => ({ uid: 'u1', base: 100, dirty: false, changedAt: 0, ...o });

describe('frontière progression / appareil', () => {
  it('PROGRESS_KEYS couvre toute la méta sauf les cinq clés d’appareil', () => {
    const all = Object.keys(DEFAULT_META).sort();
    expect([...PROGRESS_KEYS, ...DEVICE_KEYS].sort()).toEqual(all);
    expect(DEVICE_KEYS).toEqual(['muted', 'reducedFx', 'fxChosen', 'settings', 'seenReset', 'seenHelp']);
  });
  it('progressOf ne transporte ni réglages, ni son, ni effets, ni aide vue', () => {
    const p = progressOf(played()) as unknown as Record<string, unknown>;
    for (const k of DEVICE_KEYS) expect(p).not.toHaveProperty(k);
    expect(p.runs).toBe(9);
    expect(p.gold).toBeCloseTo(1234.6);
  });
  it('le document est sérialisable sans perte (aucun undefined, pas de tableau imbriqué)', () => {
    const doc = toCloudDoc(played(), 1234.9);
    expect(doc.updatedAt).toBe(1234);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    const walk = (v: unknown, path: string): void => {
      expect(v, path).not.toBeUndefined();
      if (Array.isArray(v)) for (const x of v) expect(Array.isArray(x), path).toBe(false);
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}.${k}`);
    };
    walk(doc, 'doc');
  });
  it('withProgress garde les réglages locaux et normalise un document hostile', () => {
    const local = played();
    const m = withProgress(local, {
      runs: -4,
      gold: 'beaucoup',
      achievements: ['survie3', 'inconnu', 42],
      bought: ['sorciere', 'eclaireuse', 'nope'],
      character: 'dragon',
      muted: false,
      settings: { lefty: false, hudScale: 3 },
      seenReset: false,
      extra: { nested: true },
    });
    expect(m.runs).toBe(0);
    expect(m.gold).toBe(0);
    expect(m.achievements).toEqual(['survie3']);
    expect(m.bought).toEqual(['sorciere']);
    expect(m.character).toBe('eclaireuse');
    expect(m.muted).toBe(true); // local
    expect(m.settings.lefty).toBe(true);
    expect(m.settings.hudScale).toBe(1.2);
    expect(m.seenReset).toBe(true);
    expect(m).not.toHaveProperty('extra');
  });
  it('withProgress ne remet pas à zéro une progression sans champ version (elle est v3 par construction)', () => {
    const p = progressOf(played()) as unknown as Record<string, unknown>;
    delete p.version;
    expect(withProgress(fresh(), p).runs).toBe(9);
  });
  it('sameProgress ignore les réglages', () => {
    const a = played();
    const b = normalizeMeta({ ...a, muted: false, settings: DEFAULT_META.settings });
    expect(sameProgress(a, b)).toBe(true);
    expect(sameProgress(a, normalizeMeta({ ...a, gold: 1 }))).toBe(false);
  });
  it('hasProgress : choisir un personnage n’est pas une progression', () => {
    expect(hasProgress(fresh())).toBe(false);
    expect(hasProgress(normalizeMeta({ ...DEFAULT_META, character: 'sorciere' }))).toBe(false);
    expect(hasProgress(normalizeMeta({ ...DEFAULT_META, gold: 5 }))).toBe(true);
    expect(hasProgress(normalizeMeta({ ...DEFAULT_META, slots: { weapons: 2, passives: 2 } }))).toBe(true);
  });
  it('summary arrondit l’or', () => {
    expect(summary(played())).toEqual({ time: 754, gold: 1235, runs: 9 });
  });
});

describe('fromCloudDoc', () => {
  it('accepte un document de la bonne forme et rejette le reste', () => {
    const ok = fromCloudDoc({ v: 1, updatedAt: 12, progress: { runs: 1 } });
    expect(ok).toEqual({ v: 1, updatedAt: 12, progress: { runs: 1 } });
    expect(fromCloudDoc(null)).toBeNull();
    expect(fromCloudDoc({ v: 2, updatedAt: 12, progress: {} })).toBeNull();
    expect(fromCloudDoc({ v: 1, updatedAt: 'hier', progress: {} })).toBeNull();
    expect(fromCloudDoc({ v: 1, updatedAt: NaN, progress: {} })).toBeNull();
    expect(fromCloudDoc({ v: 1, updatedAt: 12, progress: 'x' })).toBeNull();
    expect(fromCloudDoc({ v: 1, updatedAt: 12 })).toBeNull();
  });
});

describe('decide (base / local / nuage)', () => {
  const local = played();
  it('pas de document : push, même avec une méta vierge', () => {
    expect(decide(local, null, null, 'u1')).toBe('push');
    expect(decide(fresh(), null, null, 'u1')).toBe('push');
  });
  it('premier login sans progression locale : pull', () => {
    expect(decide(fresh(), cloud(local, 100), null, 'u1')).toBe('pull');
  });
  it('premier login, même progression : adopt', () => {
    const twin = normalizeMeta({ ...local, muted: false, settings: DEFAULT_META.settings });
    expect(decide(local, cloud(twin, 100), null, 'u1')).toBe('adopt');
  });
  it('premier login, progression locale différente : ask', () => {
    expect(decide(local, cloud(fresh(), 100), null, 'u1')).toBe('ask');
    expect(decide(local, cloud(normalizeMeta({ ...local, gold: 1 }), 100), null, 'u1')).toBe('ask');
  });
  it('un autre compte sur le même appareil compte comme premier login', () => {
    expect(decide(local, cloud(fresh(), 100), rec({ uid: 'u2' }), 'u1')).toBe('ask');
    expect(decide(local, cloud(fresh(), 100), rec({ base: null }), 'u1')).toBe('ask');
  });
  it('nuage inchangé : push si le local a bougé, sinon rien', () => {
    expect(decide(local, cloud(fresh(), 100), rec({ dirty: false }), 'u1')).toBe('none');
    expect(decide(local, cloud(fresh(), 100), rec({ dirty: true, changedAt: 150 }), 'u1')).toBe('push');
  });
  it('nuage changé, local propre : pull', () => {
    expect(decide(local, cloud(fresh(), 200), rec({ dirty: false }), 'u1')).toBe('pull');
  });
  it('vrai conflit : la plus récente gagne', () => {
    expect(decide(local, cloud(fresh(), 200), rec({ dirty: true, changedAt: 150 }), 'u1')).toBe('pull');
    expect(decide(local, cloud(fresh(), 200), rec({ dirty: true, changedAt: 250 }), 'u1')).toBe('push');
  });
});

describe('firestore.rules', () => {
  it('liste exactement les clés de PROGRESS_KEYS (une clé ajoutée à Meta sans règle casserait la synchro)', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    for (const k of PROGRESS_KEYS) expect(rules, k).toContain(`'${k}'`);
    for (const k of DEVICE_KEYS) expect(rules, k).not.toContain(`'${k}'`);
  });
});
