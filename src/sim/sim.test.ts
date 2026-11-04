import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STEP, XP } from './balance';
import { rollChoices } from './progression';
import { Rng } from './rng';
import { startRun, step } from './step';
import { Mode } from './types';
import type { Input } from './types';
import { World } from './world';

function snapshot(w: World): string {
  // état complet pertinent, sans les pools inutilisés
  const en = [];
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    en.push([e.id, e.type, +e.x.toFixed(6), +e.z.toFixed(6), +e.hp.toFixed(4)]);
  }
  const g = [];
  for (let i = 0; i < w.gemCount; i++) g.push([+w.gems[i].x.toFixed(6), +w.gems[i].z.toFixed(6), w.gems[i].v]);
  return JSON.stringify({ t: w.t, k: w.kills, p: w.player, en, g, pc: w.projCount, rng: w.rng.state(), mode: w.mode, cards: w.cards });
}

function scriptedInput(frame: number): Input {
  // tourne en cercle, saute toutes les 3 s, dash toutes les 5 s, prend toujours la carte 1
  const a = frame / 90;
  return { mx: Math.cos(a), mz: Math.sin(a), jump: frame % 180 === 0, dash: frame % 300 === 0, pick: 1 };
}

describe('déterminisme', () => {
  it('deux mondes même seed, 3600 steps, états identiques', () => {
    const a = new World(1234),
      b = new World(1234);
    startRun(a);
    startRun(b);
    for (let f = 0; f < 3600; f++) {
      const inp = scriptedInput(f);
      step(a, inp, STEP);
      step(b, inp, STEP);
    }
    expect(snapshot(a)).toBe(snapshot(b));
    expect(a.t).toBeGreaterThan(30); // la partie a bien avancé malgré les level-ups
  });
  it('seeds différentes ⇒ états différents', () => {
    const a = new World(1),
      b = new World(2);
    startRun(a);
    startRun(b);
    for (let f = 0; f < 600; f++) {
      step(a, scriptedInput(f), STEP);
      step(b, scriptedInput(f), STEP);
    }
    expect(snapshot(a)).not.toBe(snapshot(b));
  });
});

describe('rng', () => {
  it('séquence stable pour une seed', () => {
    const r = new Rng(42);
    const v = Array.from({ length: 5 }, () => +r.next().toFixed(8));
    expect(v).toEqual(v.map((x) => x)); // forme
    const r2 = new Rng(42);
    expect(Array.from({ length: 5 }, () => +r2.next().toFixed(8))).toEqual(v);
    expect(v.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('progression', () => {
  it('courbe needFor', () => {
    // phase 12 : courbe aplatie (≈ 3× plus de cartes) : 5 + 2·lv + 0,15·lv²
    expect(XP.needFor(1)).toBe(7);
    expect(XP.needFor(5)).toBe(18);
    expect(XP.needFor(10)).toBe(40);
    expect(XP.needFor(20)).toBe(105);
  });
  it('tirage : jamais 3 passifs quand on a < 2 armes, 3 cartes distinctes', () => {
    for (let s = 0; s < 300; s++) {
      const w = new World(s);
      rollChoices(w);
      expect(w.cards.length).toBe(3);
      expect(w.cards.some((c) => c.kind === 'w')).toBe(true);
      const keys = new Set(w.cards.map((c) => c.key));
      expect(keys.size).toBe(3);
    }
  });
  it('le joueur monte de niveau et le mode passe en LevelUp puis revient en Play', () => {
    const w = new World(7);
    startRun(w);
    w.player.xp = 100; // force
    step(w, { mx: 0, mz: 0, jump: false, dash: false, pick: -1 }, STEP);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(w.cards.length).toBe(3);
    step(w, { mx: 0, mz: 0, jump: false, dash: false, pick: 0 }, STEP);
    expect([Mode.Play, Mode.LevelUp]).toContain(w.mode);
  });
});

describe('combat', () => {
  it('un bot immobile tue quelques ennemis puis meurt', () => {
    const w = new World(99);
    startRun(w);
    const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };
    for (let f = 0; f < 7200 && w.mode !== Mode.Dead; f++) step(w, still, STEP);
    expect(w.kills).toBeGreaterThan(0);
    expect(w.mode).toBe(Mode.Dead); // immobile, on meurt
    expect(w.t).toBeGreaterThan(5); // mais pas instantanément
  });
  it('le pool d\'ennemis ne dépasse jamais sa capacité et reste cohérent', () => {
    const w = new World(5);
    startRun(w);
    for (let f = 0; f < 3600; f++) {
      step(w, scriptedInput(f), STEP);
      expect(w.enemyCount).toBeLessThanOrEqual(w.enemies.length);
      for (let i = 0; i < w.enemyCount; i++) expect(w.enemies[i].alive).toBe(true);
    }
  });
});

describe('frontière sim/render', () => {
  it('src/sim n\'importe ni three ni le DOM', () => {
    const dir = join(__dirname);
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"]three/);
      expect(src, f).not.toMatch(/from ['"]\.\.?\/.*i18n/); // les textes vivent côté UI (src/ui/cards.ts)
      expect(src, f).not.toMatch(/\b(document|window|navigator|performance)\./);
      expect(src, f).not.toMatch(/Math\.random\(/);
    }
  });
});
