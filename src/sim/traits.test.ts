// Passifs signature des personnages (phase 6) : chaque règle est observable sur un monde minimal, et l'Éclaireuse
// (référence d'équilibrage) ne change pas.
import { describe, expect, it } from 'vitest';
import { CHARACTERS, ITEM, PLAYER, STEP, TRAIT } from './balance';
import { hitEnemy } from './combat';
import { chestOffers } from './items';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, ProjKind, Trait } from './types';
import type { CharacterKey, Input } from './types';
import { World } from './world';
import { refreshStats } from './weapons/defs';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };
const make = (character: CharacterKey, seed = 1) => {
  const w = new World(seed, { character });
  startRun(w);
  w.player.maxHp = w.player.hp = 1e9; // on observe les règles, pas la survie
  return w;
};
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};
const projs = (w: World, kind: ProjKind) => {
  let n = 0;
  for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === kind) n++;
  return n;
};

describe('roster', () => {
  it('neuf personnages, un passif chacun sauf l’Éclaireuse, une seule voie de déblocage (succès ou or)', () => {
    expect(CHARACTERS).toHaveLength(9);
    expect(CHARACTERS[0].key).toBe('eclaireuse');
    expect(CHARACTERS[0].trait).toBe(Trait.None);
    for (const c of CHARACTERS.slice(1)) expect(c.trait, c.key).not.toBe(Trait.None);
    for (const c of CHARACTERS) expect(c.unlock === '' || c.price === 0, c.key).toBe(true);
    const weapons = new Set(CHARACTERS.map((c) => c.weapon));
    expect(weapons.size).toBe(6); // une arme de départ de chaque sorte
  });
  it('l’Éclaireuse est inchangée : même monde que sans option', () => {
    const a = new World(3),
      b = new World(3, { character: 'eclaireuse' });
    startRun(a);
    startRun(b);
    for (let f = 0; f < 600; f++) {
      step(a, still, STEP);
      step(b, still, STEP);
    }
    expect(b.player.x).toBe(a.player.x);
    expect(b.kills).toBe(a.kills);
    expect(b.trait).toBe(Trait.None);
    expect(a.distance).toBe(b.distance);
  });
});

describe('passifs', () => {
  it('Sapeur : chaque atterrissage pose une mine (dans la limite du plafond de mines)', () => {
    const w = make('sapeur');
    expect(w.weapons.mines).toBe(1);
    const before = projs(w, ProjKind.Mine);
    step(w, { ...still, jump: true }, STEP);
    let landed = 0;
    for (let f = 0; f < 120 && !landed; f++) {
      step(w, still, STEP);
      landed += count(w, Ev.Land);
    }
    expect(landed).toBe(1);
    expect(projs(w, ProjKind.Mine)).toBe(before + 1);
  });
  it('Feu follet : dash 2× plus long qui laisse des plaques de feu, et elles brûlent', () => {
    const w = make('feufollet');
    expect(w.player.dashTime).toBeCloseTo(PLAYER.dashTime * TRAIT.trainee.dashMul);
    expect(w.player.maxHp).toBe(1e9);
    step(w, { ...still, mx: 1, dash: true }, STEP);
    for (let f = 0; f < 20; f++) step(w, { ...still, mx: 1 }, STEP);
    const fires = projs(w, ProjKind.Fire);
    expect(fires).toBeGreaterThan(2);
    // un ennemi posé sur une plaque prend des dégâts par impulsions
    const fp = w.projs.find((p) => p.kind === ProjKind.Fire)!;
    const i = spawnEnemy(w, 0, 0, 30);
    const e = w.enemies[i];
    e.x = e.px = fp.x;
    e.z = e.pz = fp.z;
    const hp0 = e.hp;
    for (let f = 0; f < 20; f++) step(w, still, STEP);
    expect(e.hp).toBeLessThan(hp0);
  });
  it('Braconnier : un boomerang attrapé au retour rend une part de la recharge', () => {
    const w = make('braconnier');
    spawnEnemy(w, 0, 0, 20); // cible lointaine pour que le lancer parte
    let caught = false;
    for (let f = 0; f < 240 && !caught; f++) {
      const before = projs(w, ProjKind.Boomerang);
      const tBefore = w.wstate.boomT;
      step(w, still, STEP);
      if (before > 0 && projs(w, ProjKind.Boomerang) < before && w.wstate.boomT < tBefore - STEP * 2) caught = true;
    }
    expect(caught).toBe(true);
  });
  it('Veilleuse : le Halo grandit avec le temps, plafonné', () => {
    const w = make('veilleuse');
    const radius = () => {
      for (let f = 0; f < 60; f++) {
        step(w, still, STEP);
        for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.AuraPulse) return w.events[i].v;
      }
      return -1;
    };
    const r0 = radius();
    w.t = 150; // 2:30 → +20 %
    const r1 = radius();
    w.t = 1200; // 20:00 → plafond +40 %
    const r2 = radius();
    expect(r1 / r0).toBeCloseTo(1 + TRAIT.braise.perMin * 2.5, 2);
    expect(r2 / r0).toBeCloseTo(1 + TRAIT.braise.max, 2);
  });
  it('Vieille sorcière : la première cible de la Foudre est l’ennemi le plus proche', () => {
    const w = make('sorciere');
    const near = spawnEnemy(w, 0, 0, 3);
    for (let k = 0; k < 6; k++) spawnEnemy(w, 0, (k / 6) * Math.PI * 2, 11);
    let first = -1;
    for (let f = 0; f < 200 && first < 0; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++)
        if (w.events[i].type === Ev.Bolt) {
          const e = w.events[i];
          first = e.x2 * e.x2 + e.z2 * e.z2 < 20 ? near : -2; // le premier éclair frappe à < 4,5 u
          break;
        }
    }
    expect(first).toBe(near);
  });
  it('Bûcheron : les Lames repoussent 50 % plus fort', () => {
    const kick = (character: CharacterKey) => {
      const w = make(character);
      w.weapons = { lames: 1 };
      w.wmods.lames.fill(0); // même nombre de lames pour les deux (le Bûcheron part avec une lame de plus)
      refreshStats(w);
      const i = spawnEnemy(w, 2, 0, 2.0); // Brute (kbMul 1/3), dans l'anneau des lames
      let kb = 0;
      for (let f = 0; f < 60; f++) {
        step(w, still, STEP);
        const e = w.enemies[i];
        if (e.alive) kb = Math.max(kb, Math.hypot(e.kx, e.kz));
      }
      return kb;
    };
    expect(kick('bucheron')).toBeCloseTo(kick('eclaireuse') * TRAIT.fendeur.kbMul, 1);
  });
  it('Revenante : deux armes, une réanimation gratuite, XP ×2 sur les kills en l’air', () => {
    const w = new World(1, { character: 'revenante' });
    startRun(w);
    expect(w.weapons).toEqual({ foudre: 1, aura: 1 });
    expect(w.player.revives).toBe(TRAIT.dejamorte.revives);
    // XP : un Spectre (1 XP) tué au sol puis en l'air (coup direct, le joueur étant en l'air à cet instant)
    const gemValue = (air: boolean) => {
      const ww = make('revenante');
      ww.player.onGround = !air;
      const i = spawnEnemy(ww, 0, 0, 2);
      hitEnemy(ww, i, 1e9, 0, 0, 0);
      return ww.gems[0].v;
    };
    expect(gemValue(false)).toBe(1);
    expect(gemValue(true)).toBe(TRAIT.dejamorte.airXpMul);
  });
  it('Colporteur : tomes Chance et Or au départ, ses coffres proposent un objet de plus', () => {
    const w = make('colporteur');
    expect(w.tomes).toEqual({ chance: 2, or: 3 });
    expect(w.player.luck).toBe(1);
    expect(w.player.goldMul).toBeCloseTo(1.24);
    expect(chestOffers(w)).toBe(TRAIT.marchand.offers);
    expect(chestOffers(make('eclaireuse'))).toBe(ITEM.offers);
  });
});

describe('compteurs de défis', () => {
  it('distance parcourue et plus longue période sans dégât', () => {
    const w = make('eclaireuse');
    for (let f = 0; f < 60; f++) step(w, { ...still, mx: 1 }, STEP);
    expect(w.distance).toBeGreaterThan(5);
    expect(w.noHitBest).toBeCloseTo(w.t, 1);
    // un Spectre collé au joueur : un coup, la série repart de zéro
    w.player.maxHp = w.player.hp = 100;
    spawnEnemy(w, 0, 0, 0.2);
    for (let f = 0; f < 10; f++) step(w, still, STEP);
    expect(w.hurtAt).toBeGreaterThan(1);
    expect(w.noHitBest).toBeGreaterThan(0.9);
    expect(w.noHitBest).toBeLessThan(w.t);
  });
});
