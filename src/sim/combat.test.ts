// Combat, gemmes, cartes et rng : cas limites non couverts par les runs complets.
import { describe, expect, it } from 'vitest';
import { BOSS_TYPE, CHOICE, ENEMIES, PLAYER, STEP, TOME_KEYS, LEVEL_MAX, XP } from './balance';
import { dropGem, hitEnemy, killEnemy } from './combat';
import { applyCard, rollChoices } from './progression';
import { Rng, hashString } from './rng';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, Mode } from './types';
import type { Card, Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };

describe('combat', () => {
  it('hitEnemy applique dmgMul, flash, recul, et tue à 0 PV', () => {
    const w = new World(1);
    w.player.dmgMul = 2;
    const i = spawnEnemy(w, 0, 0, 5); // Spectre 10 PV
    const e = w.enemies[i];
    expect(hitEnemy(w, i, 3, 2, w.player.x, w.player.z)).toBe(false);
    expect(e.hp).toBeCloseTo(4);
    expect(e.flash).toBeGreaterThan(0);
    expect(Math.hypot(e.kx, e.kz)).toBeCloseTo(2, 5);
    expect(hitEnemy(w, i, 3, 0, 0, 0)).toBe(true);
    expect(e.alive).toBe(false);
    expect(w.kills).toBe(1);
    expect(w.gemCount).toBe(1);
    expect(hitEnemy(w, i, 3, 0, 0, 0)).toBe(false); // déjà mort : ignoré
  });
  it('le boss ne recule pas et sa mort soigne le joueur et aimante toutes les gemmes', () => {
    const w = new World(2);
    for (let k = 0; k < 5; k++) dropGem(w, k * 3, 0, 1);
    const i = spawnEnemy(w, BOSS_TYPE, 0, 10);
    w.totemBossId = w.enemies[i].id; // boss du totem (phase 42 : un boss de survie ne soigne pas)
    hitEnemy(w, i, 1, 10, w.player.x, w.player.z);
    expect(w.enemies[i].kx).toBe(0);
    w.player.hp = 1;
    let bossKill = 0;
    w.clearEvents();
    killEnemy(w, i);
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.BossKill) bossKill++;
    expect(bossKill).toBe(1);
    expect(w.player.hp).toBe(w.player.maxHp);
    for (let g = 0; g < w.gemCount; g++) expect(w.gems[g].mag).toBe(true);
    expect(w.gems[w.gemCount - 1].v).toBe(ENEMIES[BOSS_TYPE].xp);
  });
  it('phase 42 : un boss de survie ne soigne pas et laisse un coffre d’élite', () => {
    const w = new World(2);
    const i = spawnEnemy(w, BOSS_TYPE, 0, 10);
    w.player.hp = 1;
    killEnemy(w, i);
    expect(w.player.hp).toBe(1);
    expect(w.chestCount).toBe(1);
    expect(w.chests[0].boss).toBe(false);
  });
  it('au-delà de gemMergeAbove, les gemmes fusionnent au lieu de s’ajouter', () => {
    const w = new World(3);
    for (let k = 0; k < XP.gemMergeAbove; k++) dropGem(w, k, k, 1);
    expect(w.gemCount).toBe(XP.gemMergeAbove);
    dropGem(w, 0, 0, 7);
    expect(w.gemCount).toBe(XP.gemMergeAbove);
    let total = 0;
    for (let g = 0; g < w.gemCount; g++) total += w.gems[g].v;
    expect(total).toBe(XP.gemMergeAbove + 7);
  });
  it('les gemmes dans le rayon d’aimant volent vers le joueur et donnent de l’XP', () => {
    const w = new World(4);
    w.player.need = 1e9; // pas de montée de niveau (elle remettrait l'XP à zéro)
    dropGem(w, w.player.x + 2, w.player.z, 3);
    let picked = 0;
    for (let f = 0; f < 60 && picked === 0; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Pickup) picked += w.events[k].v;
    }
    expect(picked).toBe(3);
    expect(w.player.xp).toBeGreaterThanOrEqual(3);
  });
  it('le joueur en l’air ou en dash ne prend pas de dégâts de contact', () => {
    const w = new World(5);
    spawnEnemy(w, 0, 0, 0.1);
    step(w, { ...still, jump: true }, STEP);
    while (w.player.y < PLAYER.airborneSafeY) step(w, still, STEP); // montée : encore touchable
    const hp = w.player.hp;
    expect(hp).toBeLessThan(PLAYER.hp); // il a bien pris des dégâts au sol
    let steps = 0;
    let airHp = hp;
    while (w.player.y >= PLAYER.airborneSafeY) {
      step(w, still, STEP);
      steps++;
      if (w.player.y >= PLAYER.airborneSafeY) airHp = w.player.hp; // encore en l’air après ce pas
    }
    expect(steps).toBeGreaterThan(5);
    // en l’air : aucun dégât (le dernier pas retombe sous la hauteur sûre : le contact y redevient possible)
    expect(airHp).toBeCloseTo(hp + w.player.regen * (steps - 1) * STEP, 3);
  });
});

describe('cartes', () => {
  const card = (c: Partial<Card>): Card => ({ kind: 'w', key: 'orbe', lv: 1, n: 1, s0: 0, s1: -1, s2: -1, ...c });
  it('applyCard : arme (lignes comptées), tome (effet appliqué), soin ; relance un tirage si plusieurs niveaux attendent', () => {
    const w = new World(6);
    w.cards = [
      card({ kind: 'w', key: 'aura', lv: 1, n: 2, s0: 0, s1: 1 }),
      card({ kind: 't', key: 'vitalite', s0: 0 }),
      card({ kind: 'heal', key: '', lv: 0, n: 0, s0: -1 }),
    ];
    w.pending = 2;
    w.mode = Mode.LevelUp;
    applyCard(w, 0);
    expect(w.weapons.aura).toBe(1);
    expect(w.wmods.aura[0]).toBe(1);
    expect(w.wmods.aura[1]).toBe(1);
    expect(w.pending).toBe(1);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(w.cards.length).toBe(3); // retirage
    w.cards = [card({ kind: 't', key: 'vitalite', s0: 0 })];
    applyCard(w, 0);
    expect(w.tomes.vitalite).toBe(1);
    expect(w.player.maxHp).toBe(112);
    expect(w.pending).toBe(0);
    expect(w.mode).toBe(Mode.Play);
    w.player.hp = 1;
    w.cards = [card({ kind: 'heal', key: '', lv: 0, n: 0, s0: -1 })];
    w.pending = 1;
    applyCard(w, 0);
    expect(w.player.hp).toBeCloseTo(1 + w.player.maxHp * CHOICE.healFrac, 9); // phase 43 : soin partiel
    applyCard(w, 9); // index invalide : ignoré
    // une carte à 3 lignes compte pour le succès « Triple ligne », le niveau d'arme pour « Érudit »
    w.cards = [card({ kind: 'w', key: 'orbe', lv: 7, n: 3, s0: 0, s1: 0, s2: 3 })];
    w.pending = 1;
    applyCard(w, 0);
    expect(w.triples).toBe(1);
    expect(w.weaponLvBest).toBe(7);
    expect(w.wmods.orbe[0]).toBe(2);
  });
  it('tout au maximum : une seule carte de soin', () => {
    const w = new World(7);
    w.weapons = { orbe: LEVEL_MAX.weapon, aura: LEVEL_MAX.weapon, lames: LEVEL_MAX.weapon, foudre: LEVEL_MAX.weapon };
    for (const k of TOME_KEYS) w.tomes[k] = LEVEL_MAX.tome;
    rollChoices(w);
    expect(w.cards).toEqual([{ kind: 'heal', key: '', lv: 0, n: 0, s0: -1, s1: -1, s2: -1 }]);
  });
  it('4 armes possédées : plus aucune nouvelle arme proposée', () => {
    const w = new World(8);
    w.weapons = { orbe: 1, aura: 1, lames: 1, foudre: 5 }; // 4 armes possédées
    for (let s = 0; s < 50; s++) {
      rollChoices(w);
      for (const c of w.cards) if (c.kind === 'w') expect(c.lv).toBeGreaterThan(1);
    }
  });
  it('une partie complète relance bien le jeu après la mort (mode Dead figé)', () => {
    const w = new World(9);
    startRun(w);
    w.player.hp = 0;
    step(w, still, STEP);
    expect(w.mode).toBe(Mode.Dead);
    const t = w.t;
    step(w, still, STEP);
    expect(w.t).toBe(t); // plus rien n’avance
  });
});

describe('rng', () => {
  it('mulberry32 : les 5 premières valeurs de la seed 42', () => {
    const r = new Rng(42);
    expect(Array.from({ length: 5 }, () => +r.next().toFixed(8))).toEqual([
      0.60110375, 0.44829056, 0.85246579, 0.66973404, 0.1748139,
    ]);
  });
  it('range et int restent dans leurs bornes ; state avance', () => {
    const r = new Rng(7);
    const s0 = r.state();
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
      const n = r.int(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(r.state()).not.toBe(s0);
  });
  it('hashString : stable, 32 bits, sensible à un caractère', () => {
    expect(hashString('2026-11-02')).toBe(hashString('2026-11-02'));
    expect(hashString('2026-11-02')).not.toBe(hashString('2026-11-03'));
    expect(hashString('')).toBe(2166136261);
  });
});
