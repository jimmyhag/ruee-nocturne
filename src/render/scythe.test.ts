// 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 8) : le modèle procédural de la faux.
import { describe, expect, it } from 'vitest';
import { scytheGeometry } from './scythe';

describe('la vraie faux', () => {
  it('one light model with its outline, coloured per vertex, ready for a single instanced family', () => {
    const g = scytheGeometry();
    const pos = g.getAttribute('position');
    expect(g.getAttribute('color').count).toBe(pos.count);
    expect(g.getAttribute('normal').count).toBe(pos.count);
    const tris = (g.index ? g.index.count : pos.count) / 3;
    expect(tris).toBeLessThan(600); // budget d'un objet nombreux (three-rendering)
    g.computeBoundingBox();
    const b = g.boundingBox!;
    // en unités de portée : du héros (z ≈ 0) au bout de la lame (≈ 1), la lame courbée vers +x (sens du balayage)
    expect(b.min.z).toBeGreaterThan(-0.1);
    expect(b.max.z).toBeLessThan(1.25);
    expect(b.max.x).toBeGreaterThan(0.55);
    expect(b.max.y - b.min.y).toBeLessThan(0.2); // à plat, vue d'en haut
  });
});
