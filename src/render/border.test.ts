// Bordure de la carte (phase 29) : lisière sur les 4 côtés, hors de la zone jouable, découpée en segments légers.
import { describe, expect, it } from 'vitest';
import { PLAY_LIMIT } from '../sim/balance';
import { BORDER, borderGeometry } from './border';

describe('bordure', () => {
  const geos = borderGeometry(7, () => 0);
  it('découpée en segments de 40 u, chacun léger (frustum : 0 appel loin du bord)', () => {
    expect(geos.length).toBeGreaterThanOrEqual(30);
    expect(geos.length).toBeLessThanOrEqual(48);
    for (const g of geos) {
      const tris = g.getAttribute('position').count / 3;
      expect(tris).toBeLessThan(6000);
      expect(g.boundingSphere!.radius).toBeLessThan(BORDER.seg + BORDER.skirtOut + 40);
    }
  });
  it('rien ne déborde dans la zone jouable, et les 4 côtés sont fermés', () => {
    const sides = [0, 0, 0, 0];
    for (const g of geos) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i += 7) {
        const x = p.getX(i),
          z = p.getZ(i);
        const m = Math.max(Math.abs(x), Math.abs(z));
        expect(m).toBeGreaterThan(PLAY_LIMIT - 0.6); // un rocher peut mordre de quelques cm, jamais plus
        if (z < -PLAY_LIMIT) sides[0]++;
        if (z > PLAY_LIMIT) sides[1]++;
        if (x < -PLAY_LIMIT) sides[2]++;
        if (x > PLAY_LIMIT) sides[3]++;
      }
    }
    for (const n of sides) expect(n).toBeGreaterThan(1000);
  });
  it('le sous-bois couvre les coins (pas de vide en diagonale)', () => {
    const far = PLAY_LIMIT + 40;
    let corner = false;
    for (const g of geos) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getX(i) > far && p.getZ(i) > far) corner = true;
    }
    expect(corner).toBe(true);
  });
});
