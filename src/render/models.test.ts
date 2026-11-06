// Phase 20 : le manifeste des modèles (src/render/models.json, produit par npm run assets) couvre le jeu ; phase 24 :
// héros Quaternius, un fichier par personnage (phase 25 : versions HD texturées).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../sim/balance';
import { BUDGET, ENEMY_LODS, ENEMY_MODELS, HERO_CLIPS, HEROES, PROPS } from '../../tools/assets/config';
import { ENEMIES } from '../sim/balance';
import { ENEMY_LOOKS } from './enemyModels';
import { CLIP_NAMES, HERO_LOOKS } from './heroes';
import MANIFEST from './models.json';

const DIR = path.resolve(import.meta.dirname, '../../public/models');

describe('modèles (phases 20, 21, 24)', () => {
  it('chaque personnage a son propre modèle de héros, construit au budget de triangles', () => {
    const files = new Set<string>();
    for (const c of CHARACTERS) {
      const look = HERO_LOOKS[c.key];
      expect(look, c.key).toBeDefined();
      const hero = MANIFEST.heroes[look.model];
      expect(hero, `${c.key} → ${look.model}`).toBeDefined();
      expect(hero.tris, c.key).toBeLessThanOrEqual(HEROES[c.key].tris * 1.15);
      files.add(hero.file);
    }
    expect(files.size).toBe(CHARACTERS.length); // neuf silhouettes distinctes
    // aucun personnage identique à un autre (tenue, coiffure, teinte, objets)
    const looks = Object.values(HEROES).map((h) =>
      JSON.stringify([h.sex, h.outfit, h.hood, h.hair, h.hairColor, h.outfitTint, h.props.map((p) => p.file)]),
    );
    expect(new Set(looks).size).toBe(CHARACTERS.length);
  });
  it('chaque héros porte toutes les animations jouées par le rendu, dans l’ordre de HeroAnim', () => {
    expect(CLIP_NAMES).toEqual(HERO_CLIPS.map((c) => c.to));
    for (const [key, h] of Object.entries(MANIFEST.heroes)) {
      for (const a of CLIP_NAMES) expect(h.anims, `${key} : ${a}`).toContain(a);
      expect(h.anims.length, key).toBe(HERO_CLIPS.length); // rien de plus : le poids est dans les animations
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
    total += props + MANIFEST.enemies.bytes;
    expect(total).toBeLessThanOrEqual(BUDGET.totalBytes);
  });
  it('tous les objets sont dans props.glb, sous leur plafond de triangles', () => {
    for (const [key, p] of Object.entries(PROPS)) {
      const t = (MANIFEST.props.nodes as Record<string, number>)[key];
      expect(t, key).toBeGreaterThan(0);
      expect(t, key).toBeLessThanOrEqual(p.tris);
    }
  });
  it("phase 21 : chaque type d'ennemi a un squelette (le Volant : le crâne), avec ses clips", () => {
    expect(ENEMY_LOOKS.length).toBe(ENEMIES.length);
    ENEMY_LOOKS.forEach((look, t) => {
      if (!look) {
        expect(ENEMIES[t].key).toBe('volant');
        expect((MANIFEST.props.nodes as Record<string, number>).skull).toBeGreaterThan(0);
        return;
      }
      const m = (MANIFEST.enemies.models as Record<string, { anims: string[] }>)[look.model];
      expect(m, `${ENEMIES[t].key} → ${look.model}`).toBeDefined();
      for (const [clip] of look.clips) expect(m.anims, `${ENEMIES[t].key} : ${clip}`).toContain(clip);
      const parts = [...ENEMY_MODELS[look.model].keep, ...ENEMY_MODELS[look.model].weapons.map(([f]) => f)];
      for (const s of look.show) expect(parts, `${ENEMIES[t].key} : ${s}`).toContain(s);
      expect(!!look.boss, ENEMIES[t].key).toBe(ENEMIES[t].boss);
    });
  });
  it('phase 21 : niveaux de détail des squelettes tenus, enemies.glb dans son budget', () => {
    for (const [key, m] of Object.entries(
      MANIFEST.enemies.models as Record<string, { tris: Record<string, number> }>,
    )) {
      expect(m.tris.mid, key).toBeLessThan(m.tris.hi);
      expect(m.tris.lo, key).toBeLessThan(m.tris.mid);
      expect(m.tris.mid, key).toBeLessThanOrEqual(ENEMY_LODS.mid * 1.6); // accessoires et armes compris
      expect(m.tris.lo, key).toBeLessThanOrEqual(ENEMY_LODS.lo * 1.6);
    }
    const bytes = fs.statSync(path.join(DIR, MANIFEST.enemies.file)).size;
    expect(bytes).toBe(MANIFEST.enemies.bytes);
    expect(bytes).toBeLessThanOrEqual(BUDGET.enemyBytes);
  });
  it('les crédits CC0 sont portés par le manifeste et CREDITS.md', () => {
    expect(MANIFEST.source).toMatch(/KayKit.*Kay Lousberg.*CC0/);
    expect(MANIFEST.source).toMatch(/Quaternius.*CC0/);
    const credits = fs.readFileSync(path.resolve(import.meta.dirname, '../../CREDITS.md'), 'utf8');
    expect(credits).toMatch(/KayKit/);
    expect(credits).toMatch(/Kay Lousberg/);
    expect(credits).toMatch(/Quaternius/);
  });
});
