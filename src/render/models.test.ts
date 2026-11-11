// Phase 20 : le manifeste des modèles (src/render/models.json, produit par npm run assets) couvre le jeu ; phase 24 :
// héros Quaternius, un fichier par personnage (phase 25 : versions HD texturées).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../sim/balance';
import { BUDGET, ENEMY_LODS, ENEMY_MODELS, GROUND, HERO_CLIPS, HEROES, NATURE, PROPS } from '../../tools/assets/config';
import { ENEMIES } from '../sim/balance';
import { ENEMY_LOOKS } from './enemyModels';
import { CLIP_NAMES, HERO_LOOKS } from './heroes';
import MANIFEST from './models.json';
import { modelUrl } from './models';
import { PAL } from './palette';

const DIR = path.resolve(import.meta.dirname, '../../public/models');

describe('modèles (phases 20, 21, 25, 26)', () => {
  it('chaque fichier du manifeste a une URL versionnée par sa taille (sinon le cache garde l’ancien)', () => {
    const files = [
      MANIFEST.props,
      MANIFEST.enemies,
      MANIFEST.nature,
      ...Object.values(MANIFEST.heroes),
      ...Object.entries(MANIFEST.ground).map(([file, bytes]) => ({ file, bytes })),
    ];
    for (const f of files) {
      expect(modelUrl(f.file)).toMatch(new RegExp(`/models/${f.file}\\?v=${f.bytes}$`));
      expect(f.bytes).toBe(fs.statSync(path.join('public/models', f.file)).size);
    }
    expect(() => modelUrl('inconnu.glb')).toThrow();
  });

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
    total += props + MANIFEST.enemies.bytes + MANIFEST.nature.bytes;
    expect(total).toBeLessThanOrEqual(BUDGET.totalBytes);
  });
  it('tous les objets sont dans props.glb, sous leur plafond de triangles', () => {
    for (const [key, p] of Object.entries(PROPS)) {
      const t = (MANIFEST.props.nodes as Record<string, number>)[key];
      expect(t, key).toBeGreaterThan(0);
      expect(t, key).toBeLessThanOrEqual(p.tris);
    }
  });
  it("phases 21 et 46 : chaque type d'ennemi a son modèle animé (le Volant aussi), avec ses clips", () => {
    expect(ENEMY_LOOKS.length).toBe(ENEMIES.length);
    // onze créatures distinctes : plus aucun modèle partagé entre deux types
    expect(new Set(ENEMY_LOOKS.map((l) => l.model)).size).toBe(ENEMIES.length);
    expect(Object.keys(MANIFEST.enemies.models).sort()).toEqual(Object.keys(ENEMY_MODELS).sort());
    ENEMY_LOOKS.forEach((look, t) => {
      expect(!!look.fly, ENEMIES[t].key).toBe(ENEMIES[t].key === 'volant');
      const m = (MANIFEST.enemies.models as Record<string, { anims: string[] }>)[look.model];
      expect(m, `${ENEMIES[t].key} → ${look.model}`).toBeDefined();
      for (const [clip] of look.clips) expect(m.anims, `${ENEMIES[t].key} : ${clip}`).toContain(clip);
      expect(ENEMY_MODELS[look.model], look.model).toBeDefined();
      expect(!!look.boss, ENEMIES[t].key).toBe(ENEMIES[t].boss);
    });
  });
  it('phases 21 et 26 : niveaux de détail des ennemis tenus, enemies.glb dans son budget', () => {
    for (const [key, m] of Object.entries(
      MANIFEST.enemies.models as Record<string, { tris: Record<string, number> }>,
    )) {
      // phase 26 : seuls les niveaux cuits sont construits (hi pour les boss, mid et lo pour la masse)
      if (m.tris.hi && m.tris.mid) expect(m.tris.mid, key).toBeLessThan(m.tris.hi);
      if (m.tris.mid) expect(m.tris.lo, key).toBeLessThan(m.tris.mid);
      // plafond global, ou celui du modèle (la brute) ; la simplification ne dépasse pas sa cible de plus de 15 %
      const cap = (lod: 'hi' | 'mid' | 'lo') => (ENEMY_MODELS[key].tris?.[lod] ?? ENEMY_LODS[lod]) * 1.15;
      if (m.tris.mid) expect(m.tris.mid, key).toBeLessThanOrEqual(cap('mid'));
      if (m.tris.lo) expect(m.tris.lo, key).toBeLessThanOrEqual(cap('lo'));
      if (m.tris.hi) expect(m.tris.hi, key).toBeLessThanOrEqual(cap('hi'));
      for (const lod of ['hi', 'mid', 'lo'] as const)
        expect(ENEMY_MODELS[key].tris?.[lod] ?? 0, key).toBeLessThanOrEqual(ENEMY_LODS[lod] * 1.6);
    }
    const bytes = fs.statSync(path.join(DIR, MANIFEST.enemies.file)).size;
    expect(bytes).toBe(MANIFEST.enemies.bytes);
    expect(bytes).toBeLessThanOrEqual(BUDGET.enemyBytes);
  });
  it('phase 44 : décor stylisé (nature.glb) complet, sous ses plafonds, et textures de sol des trois mondes', () => {
    for (const [key, spec] of Object.entries(NATURE.models)) {
      const t = (MANIFEST.nature.nodes as Record<string, number>)[key];
      expect(t, key).toBeGreaterThan(0);
      expect(t, key).toBeLessThanOrEqual(spec.tris);
    }
    expect(fs.statSync(path.join(DIR, MANIFEST.nature.file)).size).toBe(MANIFEST.nature.bytes);
    expect(MANIFEST.nature.bytes).toBeLessThanOrEqual(BUDGET.natureBytes);
    // chaque monde nomme des modèles qui existent (arbres, buisson, fleurs)
    for (const st of PAL.stages) {
      const keys = [...st.decor.trees.map((t) => t[0]), st.decor.bush[0], ...st.decor.flowers];
      for (const k of keys) expect((MANIFEST.nature.nodes as Record<string, number>)[k], k).toBeGreaterThan(0);
      expect(st.decor.trees.length).toBe(4);
    }
    // deux textures par monde, légères (chargées après le menu, hors précache)
    expect(Object.keys(MANIFEST.ground).length).toBe(GROUND.worlds.length * 2);
    expect(PAL.stages.length).toBe(GROUND.worlds.length);
    for (const [file, bytes] of Object.entries(MANIFEST.ground)) {
      expect(fs.statSync(path.join(DIR, file)).size, file).toBe(bytes);
      expect(bytes, file).toBeLessThanOrEqual(120_000);
    }
  });
  it('les crédits CC0 sont portés par le manifeste et CREDITS.md', () => {
    expect(MANIFEST.source).toMatch(/KayKit.*Kay Lousberg.*CC0/);
    expect(MANIFEST.source).toMatch(/Quaternius.*CC0/);
    expect(MANIFEST.source).toMatch(/Ultimate Monsters.*Quaternius.*CC0/);
    const credits = fs.readFileSync(path.resolve(import.meta.dirname, '../../CREDITS.md'), 'utf8');
    expect(credits).toMatch(/KayKit/);
    expect(credits).toMatch(/Kay Lousberg/);
    expect(credits).toMatch(/Quaternius/);
    expect(MANIFEST.source).toMatch(/Stylized Nature.*CC0/);
    expect(MANIFEST.source).toMatch(/Poly Haven.*CC0/);
    expect(credits).toMatch(/Stylized Nature/);
    expect(credits).toMatch(/Poly Haven/);
    expect(credits).toMatch(/Ultimate Monsters/);
  });
});
