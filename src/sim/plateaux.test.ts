// Plateaux (phase 11) : génération, sol local, saut qui monte, bord qui bloque, ennemis au pied.
import { describe, expect, it } from 'vitest';
import { PLATEAUX, PLAYER, STEP, VOLANT_TYPE, ZONES } from './balance';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };
const input = (mx: number, mz: number, jump = false): Input => ({ mx, mz, jump, dash: false, pick: 0 });

/** Téléporte le joueur (sans ennemis ni spawn) à `dist` u à l'ouest du plateau 0, au sol. */
function besidePlateau(w: World, dist: number) {
  const p = w.plateaux[0];
  w.player.x = p.x - p.r - dist;
  w.player.z = p.z;
  w.player.y = 0;
  w.player.onGround = true;
  return p;
}

describe('plateaux', () => {
  it('sont générés par la seed, hors lacs et bois, loin du départ et les uns des autres', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const w = new World(seed);
      expect(w.plateaux.length).toBe(PLATEAUX.n);
      expect(new World(seed).plateaux).toEqual(w.plateaux);
      for (let i = 0; i < w.plateaux.length; i++) {
        const p = w.plateaux[i];
        expect(p.r).toBeGreaterThanOrEqual(PLATEAUX.rMin);
        expect(p.r).toBeLessThanOrEqual(PLATEAUX.rMax);
        expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(PLATEAUX.minFromCenter + p.r);
        for (const l of w.lakes) expect(Math.hypot(p.x - l.x, p.z - l.z)).toBeGreaterThan(l.r + p.r);
        for (const wd of w.woods) expect(Math.hypot(p.x - wd.x, p.z - wd.z)).toBeGreaterThan(wd.r + p.r);
        for (let j = 0; j < i; j++) {
          const q = w.plateaux[j];
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(PLATEAUX.minDist);
        }
        // aucun arbre ni rocher sur le plateau
        for (const o of w.obstacles) expect(Math.hypot(o.x - p.x, o.z - p.z)).toBeGreaterThan(p.r);
      }
      expect(ZONES.lakeSpeed).toBeLessThan(1);
    }
  });
  it('groundAt vaut h sur un plateau et 0 ailleurs', () => {
    const w = new World(3);
    const p = w.plateaux[0];
    expect(w.groundAt(p.x, p.z)).toBe(PLATEAUX.h);
    expect(w.groundAt(p.x + p.r - 0.01, p.z)).toBe(PLATEAUX.h);
    expect(w.groundAt(p.x + p.r + 0.01, p.z)).toBe(0);
    expect(w.groundAt(0, 0)).toBe(0);
  });
  it('le bord bloque un joueur qui marche, un saut le monte, et il retombe en sortant', () => {
    const w = new World(5);
    startRun(w);
    const p = besidePlateau(w, 1);
    // marche vers l'est pendant 1 s : bloqué au pied
    for (let i = 0; i < 60; i++) step(w, input(1, 0), STEP);
    expect(w.player.y).toBe(0);
    expect(w.player.x).toBeLessThan(p.x - p.r);
    expect(w.player.x).toBeGreaterThan(p.x - p.r - 0.5);
    // saute en avançant : atterrit sur le plateau
    w.clearEvents();
    step(w, input(1, 0, true), STEP);
    let landed = false;
    for (let i = 0; i < 90 && !landed; i++) {
      step(w, input(1, 0), STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Land) landed = true;
      w.clearEvents();
    }
    expect(landed).toBe(true);
    expect(w.player.y).toBe(PLATEAUX.h);
    expect(w.player.onGround).toBe(true);
    expect(Math.hypot(w.player.x - p.x, w.player.z - p.z)).toBeLessThan(p.r);
    // continue vers l'est : sort du bord et tombe au sol
    for (let i = 0; i < 180 && w.player.y > 0; i++) step(w, input(1, 0), STEP);
    expect(w.player.y).toBe(0);
    expect(w.player.onGround).toBe(true);
    expect(w.player.x).toBeGreaterThan(p.x + p.r);
  });
  it('le saut du sol monte plus haut que le plateau', () => {
    expect((PLAYER.jumpVel * PLAYER.jumpVel) / (2 * PLAYER.gravity)).toBeGreaterThan(PLATEAUX.h + 0.2);
  });
  it('un marcheur bute au pied et ne blesse pas un joueur perché ; un Volant en plongée le blesse', () => {
    const w = new World(9);
    startRun(w);
    const p = w.plateaux[0];
    w.player.x = p.x;
    w.player.z = p.z;
    w.player.y = PLATEAUX.h;
    w.player.onGround = true;
    const i = spawnEnemy(w, 2, Math.PI / 2, p.r + 1.5); // Brute à l'est, hors du plateau
    const e = w.enemies[i];
    const hp = w.player.hp;
    for (let k = 0; k < 240; k++) step(w, still, STEP);
    expect(e.alive).toBe(true);
    expect(Math.hypot(e.x - p.x, e.z - p.z)).toBeGreaterThanOrEqual(p.r + e.r - 1e-6);
    expect(w.player.hp).toBeCloseTo(hp, 3);
    expect(w.player.y).toBe(PLATEAUX.h);
    // Volant posé en plongée au contact : blesse malgré la hauteur (le joueur n'est pas en l'air par rapport au plateau)
    const v = spawnEnemy(w, VOLANT_TYPE, 0, 0.1);
    w.enemies[v].state = 2;
    w.enemies[v].timer = 1;
    w.clearEvents();
    step(w, still, STEP);
    let hurt = false;
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.PlayerHurt) hurt = true;
    expect(hurt).toBe(true);
  });
});
