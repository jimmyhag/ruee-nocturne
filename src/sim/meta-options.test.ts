// Phase 4 : ce que la méta injecte dans la sim (personnages, armes débloquées, emplacements) ; réanimation (phase 17 : objet).
import { describe, expect, it } from 'vitest';
import { CHARACTERS, It, MAX_WEAPONS, PLAYER, REVIVE, STEP } from './balance';
import { gainItem } from './items';
import { rollChoices } from './progression';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, Mode, Spell } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};

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
  it('Bûcheron : +30 PV, Lames de départ (phase 32 : ni lignes ni portée bonus) ; Sorcière : Foudre, −20 % PV', () => {
    const b = new World(1, { character: 'bucheron' });
    expect(b.weapons).toEqual({ lames: 1 });
    expect(b.player.maxHp).toBe(PLAYER.hp + 30);
    expect(b.bladeRangeMul).toBeCloseTo(1, 6);
    expect(b.player.speed).toBeCloseTo(PLAYER.speed * 1.05, 6); // plus lent que l'Éclaireuse
    expect(b.spell).toBe(Spell.Tourbillon); // phase 19 : un sort par classe
    const s = new World(1, { character: 'sorciere' });
    expect(s.weapons).toEqual({ foudre: 1 });
    expect(s.player.maxHp).toBe(Math.round(PLAYER.hp * 0.7));
  });
  it('trois personnages dans l’ordre, le premier disponible au départ (noms et textes : src/ui/cards.test.ts)', () => {
    expect(CHARACTERS.map((c) => c.key).slice(0, 3)).toEqual(['eclaireuse', 'bucheron', 'sorciere']);
    expect(CHARACTERS[0].unlock).toBe('');
  });
});

describe('réanimation (Plume de phénix, phase 17)', () => {
  it('la réanimation rend REVIVE.hpFrac des PV avec REVIVE.invul s d’invulnérabilité, une fois par plume', () => {
    const w = new World(3);
    gainItem(w, It.Phenix);
    expect(w.player.revives).toBe(1);
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
    let seen = false; // Lames niv 1 de départ → niv 2 proposé (sur quelques tirages : une main peut n'avoir que des tomes)
    for (let i = 0; i < 20 && !seen; i++) {
      rollChoices(b);
      seen = b.cards.some((c) => c.kind === 'w' && c.key === 'lames' && c.lv === 2);
    }
    expect(seen).toBe(true);
  });
  it('un run complet avec options reste déterministe', () => {
    const opts = { character: 'bucheron' as const, unlocked: ['orbe', 'lames', 'foudre'] as const };
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

describe('emplacements (phase 10)', () => {
  it('rollChoices ne propose pas de nouvelle arme ni de nouveau tome au-delà des emplacements ; le kit de départ ne compte pas', () => {
    const w = new World(11, { slots: { weapons: 1, passives: 2 } });
    expect(w.maxWeapons).toBe(1);
    expect(w.maxTomes).toBe(2);
    for (let i = 0; i < 40; i++) {
      rollChoices(w);
      for (const c of w.cards) {
        if (c.kind === 'w') expect(c.key, 'seule l’arme de départ peut monter').toBe('orbe');
      }
    }
    // deux tomes pris : plus aucun nouveau tome proposé, mais ceux possédés montent encore
    w.tomes = { degats: 1, mouvement: 1 };
    for (let i = 0; i < 40; i++) {
      rollChoices(w);
      for (const c of w.cards) if (c.kind === 't') expect(['degats', 'mouvement']).toContain(c.key);
    }
    // Revenante : deux armes de départ avec un seul emplacement → les deux montent, pas de troisième
    const r = new World(12, { character: 'revenante', slots: { weapons: 1, passives: 2 } });
    expect(r.maxWeapons).toBe(2);
    for (let i = 0; i < 40; i++) {
      rollChoices(r);
      for (const c of r.cards) if (c.kind === 'w') expect(['foudre', 'aura']).toContain(c.key);
    }
    // sans option : plafonds maximum (tests et défi du jour)
    expect(new World(13).maxWeapons).toBe(MAX_WEAPONS);
    expect(new World(14, { slots: { weapons: 9, passives: 0 } }).maxWeapons).toBe(MAX_WEAPONS);
  });
});
