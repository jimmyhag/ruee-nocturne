// Phase 4 : ce que la méta injecte dans la sim (personnages, boutique, armes débloquées, réanimation).
import { describe, expect, it } from 'vitest';
import { CHARACTERS, PLAYER, REVIVE, SHOP, STEP } from './balance';
import { rollChoices } from './progression';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, Mode } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};
const lineIndex = (key: string) => SHOP.lines.findIndex((l) => l.key === key);

describe('personnages', () => {
  it('sans option, le monde est celui de la phase 3 : Éclaireuse, Orbe, toutes les armes', () => {
    const w = new World(1);
    expect(w.weapons).toEqual({ orbe: 1 });
    expect(w.player.speed).toBeCloseTo(6.2, 6); // la référence de l'équilibrage de phase 3
    expect(w.player.dashTime).toBe(PLAYER.dashTime);
    expect(w.player.maxHp).toBe(PLAYER.hp);
    expect(w.unlocked).toBeNull();
    expect(w.player.revives).toBe(0);
  });
  it('Bûcheron : +30 PV, Lames de départ, portée des lames ×1,2 ; Sorcière : Foudre, −20 % PV', () => {
    const b = new World(1, { character: 'bucheron' });
    expect(b.weapons).toEqual({ lames: 1 });
    expect(b.player.maxHp).toBe(PLAYER.hp + 30);
    expect(b.bladeRangeMul).toBeCloseTo(1.2, 6);
    expect(b.player.speed).toBeCloseTo(PLAYER.speed, 6); // plus lent que l'Éclaireuse
    expect(b.player.dashTime).toBeGreaterThan(PLAYER.dashTime);
    const s = new World(1, { character: 'sorciere' });
    expect(s.weapons).toEqual({ foudre: 1 });
    expect(s.player.maxHp).toBe(Math.round(PLAYER.hp * 0.8));
  });
  it('chaque personnage a un nom, un texte et une arme de départ connue', () => {
    expect(CHARACTERS.map((c) => c.key)).toEqual(['eclaireuse', 'bucheron', 'sorciere']);
    for (const c of CHARACTERS) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.text.length).toBeGreaterThan(5);
    }
    expect(CHARACTERS[0].unlock).toBe('');
  });
});

describe('boutique', () => {
  it('chaque ligne modifie la bonne stat, bornée à son nombre de paliers', () => {
    const up = SHOP.lines.map(() => 0);
    up[lineIndex('hp')] = 3;
    up[lineIndex('dmg')] = 2;
    up[lineIndex('speed')] = 5;
    up[lineIndex('luck')] = 1;
    up[lineIndex('gold')] = 4;
    up[lineIndex('magnet')] = 2;
    up[lineIndex('cd')] = 5;
    up[lineIndex('revive')] = 9; // au-delà du max : borné à 2
    const w = new World(2, { upgrades: up });
    const base = new World(2);
    expect(w.player.maxHp).toBe(base.player.maxHp + 30);
    expect(w.player.dmgMul).toBeCloseTo(1.1, 6);
    expect(w.player.speed).toBeCloseTo(base.player.speed * 1.15, 6);
    expect(w.player.luck).toBe(1);
    expect(w.player.goldMul).toBeCloseTo(1.4, 6);
    expect(w.player.magnet).toBeCloseTo(base.player.magnet * 1.3, 6);
    expect(w.player.cdMul).toBeCloseTo(0.85, 6);
    expect(w.player.revives).toBe(2);
  });
  it('les coûts suivent base · growth^palier', () => {
    const cost = (tier: number) => Math.round(SHOP.base * Math.pow(SHOP.growth, tier));
    expect(cost(0)).toBe(40);
    expect(cost(1)).toBe(64);
    expect(cost(4)).toBe(262);
  });
  it('la réanimation rend 50 % des PV avec 2 s d’invulnérabilité, une fois par palier', () => {
    const up = SHOP.lines.map(() => 0);
    up[lineIndex('revive')] = 1;
    const w = new World(3, { upgrades: up });
    w.weapons = {};
    spawnEnemy(w, 2, 0, 0.5); // Brute sur le joueur
    w.player.hp = 1;
    let revived = 0;
    for (let f = 0; f < 120 && w.mode === Mode.Play; f++) {
      step(w, still, STEP);
      revived += count(w, Ev.Revive);
      if (revived === 1 && f < 118) {
        // juste après : PV à 50 %, invulnérable
        if (w.player.invul > REVIVE.invul - 0.05) expect(w.player.hp).toBeCloseTo(w.player.maxHp * REVIVE.hpFrac, 0);
      }
    }
    expect(revived).toBe(1);
    expect(w.player.revives).toBe(0);
    // sans réanimation restante, la mort suit une fois l'invulnérabilité passée
    for (let f = 0; f < 600 && w.mode === Mode.Play; f++) step(w, still, STEP);
    expect(w.mode).toBe(Mode.Dead);
  });
});

describe('armes débloquées', () => {
  it('une arme verrouillée n’est jamais proposée comme nouvelle arme, mais une arme possédée monte toujours', () => {
    const w = new World(4, { unlocked: ['orbe', 'aura', 'lames', 'foudre'] });
    for (let i = 0; i < 300; i++) {
      rollChoices(w);
      for (const c of w.cards) if (c.kind === 'w' && c.lv === 1) expect(['aura', 'lames', 'foudre']).toContain(c.key);
    }
    const b = new World(5, { character: 'bucheron', unlocked: ['orbe'] }); // Lames possédée mais « verrouillée »
    rollChoices(b);
    expect(b.cards.some((c) => c.kind === 'w' && c.key === 'lames' && c.lv === 2)).toBe(true);
  });
  it('un run complet avec options reste déterministe', () => {
    const opts = { character: 'bucheron' as const, upgrades: [1, 1, 0, 0, 0, 0, 0, 1], unlocked: ['orbe', 'lames', 'foudre'] as const };
    const a = new World(77, { ...opts, unlocked: [...opts.unlocked] });
    const b = new World(77, { ...opts, unlocked: [...opts.unlocked] });
    startRun(a);
    startRun(b);
    for (let f = 0; f < 1200; f++) {
      const inp = { ...still, mx: Math.cos(f / 60), mz: Math.sin(f / 60), pick: 0 };
      step(a, inp, STEP);
      step(b, inp, STEP);
    }
    expect(a.t).toBe(b.t);
    expect(a.kills).toBe(b.kills);
    expect(a.player.hp).toBe(b.player.hp);
    expect(a.rng.state()).toBe(b.rng.state());
  });
});
