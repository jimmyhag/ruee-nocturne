// Phase 20 : le manifeste des modèles KayKit (src/render/models.json, produit par npm run assets) couvre le jeu.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../sim/balance';
import { BUDGET, HERO_ANIMS, PROPS } from '../../tools/assets/config';
import { CLIP_NAMES, HERO_LOOKS } from './heroes';
import MANIFEST from './models.json';

const DIR = path.resolve(import.meta.dirname, '../../public/models');

describe('modèles KayKit (phase 20)', () => {
  it('chaque personnage a un modèle, et ses accessoires existent dans le fichier', () => {
    for (const c of CHARACTERS) {
      const look = HERO_LOOKS[c.key];
      expect(look, c.key).toBeDefined();
      const hero = MANIFEST.heroes[look.model];
      expect(hero, `${c.key} → ${look.model}`).toBeDefined();
      for (const m of look.show) expect(hero.meshes, `${c.key} : ${m}`).toContain(m);
    }
  });
  it('chaque héros porte toutes les animations jouées par le rendu', () => {
    for (const [key, h] of Object.entries(MANIFEST.heroes)) {
      for (const a of CLIP_NAMES) expect(h.anims, `${key} : ${a}`).toContain(a);
      expect(h.anims.length, key).toBe(HERO_ANIMS.length); // rien de plus : le poids est dans les animations
    }
  });
  it('les fichiers référencés existent, à la taille annoncée, dans le budget', () => {
    let total = 0;
    for (const h of Object.values(MANIFEST.heroes)) {
      const bytes = fs.statSync(path.join(DIR, h.file)).size;
      expect(bytes, h.file).toBe(h.bytes);
      expect(bytes, h.file).toBeLessThanOrEqual(BUDGET.heroBytes);
      total += bytes;
    }
    const props = fs.statSync(path.join(DIR, MANIFEST.props.file)).size;
    expect(props).toBe(MANIFEST.props.bytes);
    total += props;
    expect(total).toBeLessThanOrEqual(BUDGET.totalBytes);
  });
  it('tous les objets sont dans props.glb, sous leur plafond de triangles', () => {
    for (const [key, p] of Object.entries(PROPS)) {
      const t = (MANIFEST.props.nodes as Record<string, number>)[key];
      expect(t, key).toBeGreaterThan(0);
      expect(t, key).toBeLessThanOrEqual(p.tris);
    }
  });
  it('le crédit CC0 est porté par le manifeste et CREDITS.md', () => {
    expect(MANIFEST.source).toMatch(/KayKit.*Kay Lousberg.*CC0/);
    const credits = fs.readFileSync(path.resolve(import.meta.dirname, '../../CREDITS.md'), 'utf8');
    expect(credits).toMatch(/KayKit/);
    expect(credits).toMatch(/Kay Lousberg/);
  });
});
