// Phase 21 : les poids de pose des ennemis somment à 1, bouclent, et ne touchent que leur ligne.
import { describe, expect, it } from 'vitest';
import { writeLoopPose, writeOncePose } from './pose';

const LEN = 1 + 12;
const row = (d: Float32Array, r: number) => Array.from(d.subarray(r * LEN, (r + 1) * LEN));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('poses des ennemis (morphs par instance)', () => {
  it('boucle : deux poses voisines, poids de base nul, somme 1', () => {
    const d = new Float32Array(LEN * 3).fill(9);
    writeLoopPose(d, 1, LEN, 0, 8, 0.25 + 1 / 16); // 2,5 poses sur 8
    const r = row(d, 1);
    expect(r[0]).toBe(0);
    expect(r[1 + 2]).toBeCloseTo(0.5);
    expect(r[1 + 3]).toBeCloseTo(0.5);
    expect(sum(r)).toBeCloseTo(1);
    expect(row(d, 0).every((v) => v === 9)).toBe(true); // les autres lignes ne bougent pas
    expect(row(d, 2).every((v) => v === 9)).toBe(true);
  });
  it('boucle : la dernière pose rejoint la première, les tours négatifs bouclent', () => {
    const d = new Float32Array(LEN);
    writeLoopPose(d, 0, LEN, 0, 8, 7.5 / 8);
    expect(d[1 + 7]).toBeCloseTo(0.5);
    expect(d[1 + 0]).toBeCloseTo(0.5);
    writeLoopPose(d, 0, LEN, 0, 8, -0.125); // = 0,875 tour : pose 7
    expect(d[1 + 7]).toBeCloseTo(1);
    expect(sum(Array.from(d))).toBeCloseTo(1);
  });
  it('boucle décalée : les poses du geste vivent après celles de la marche', () => {
    const d = new Float32Array(LEN);
    writeLoopPose(d, 0, LEN, 6, 4, 0);
    expect(d[1 + 6]).toBeCloseTo(1);
    expect(sum(Array.from(d))).toBeCloseTo(1);
  });
  it('geste joué une fois : borné à la première et à la dernière pose', () => {
    const d = new Float32Array(LEN);
    writeOncePose(d, 0, LEN, 6, 4, -1);
    expect(d[1 + 6]).toBeCloseTo(1);
    writeOncePose(d, 0, LEN, 6, 4, 2);
    expect(d[1 + 9]).toBeCloseTo(1);
    writeOncePose(d, 0, LEN, 6, 4, 0.5); // 1,5 pose sur 0..3
    expect(d[1 + 7]).toBeCloseTo(0.5);
    expect(d[1 + 8]).toBeCloseTo(0.5);
    expect(sum(Array.from(d))).toBeCloseTo(1);
  });
});
