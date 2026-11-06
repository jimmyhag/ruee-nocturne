// Sorts de classe (phase 19) : un par personnage, chacun observable sur un monde calme (armes retirées, aucun spawn).
import { describe, expect, it } from 'vitest';
import { BOON, BOSS_TYPE, CHARACTERS, ITEM, It, PLAYER, SPELL, SPELL_KEYS, STEP, TOMES, TOME_CAPS } from './balance';
import { killEnemy } from './combat';
import { applyBoon } from './poi';
import { gainItem } from './items';
import { spellCooldown } from './spells';
import { spawnEnemy } from './spawner';
import { step } from './step';
import { Ev, HitSrc, ProjKind, Spell } from './types';
import type { CharacterKey, Input } from './types';
import { applyTomeLine, lineIndex } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const cast: Input = { ...still, spell: true };
/** Monde calme : PV infinis, pas de montée de niveau, pas d'arme ni d'ennemi, aucun spawn. */
const make = (character: CharacterKey, seed = 1, keepWeapons = false) => {
  const w = new World(seed, { character });
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  if (!keepWeapons) w.weapons = {};
  w.enemyCount = 0;
  w.nextElite = w.nextWave = w.nextBoss = 1e9;
  w.spawnAcc = -1e9;
  return w;
};
/** Ennemi de type `type` posé en (x, z) relatif au joueur. */
const put = (w: World, type: number, x: number, z: number) => {
  const i = spawnEnemy(w, type, 0, 30);
  const e = w.enemies[i];
  e.x = e.px = w.player.x + x;
  e.z = e.pz = w.player.z + z;
  e.hp = e.max = 1e6;
  return e;
};
const run = (w: World, frames: number, input: Input = still, events?: Ev[]) => {
  for (let f = 0; f < frames; f++) {
    step(w, f === 0 ? input : still, STEP);
    if (events) for (let k = 0; k < w.eventCount; k++) events.push(w.events[k].type);
  }
};
const spellHits = (w: World) => {
  let n = 0;
  for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit && w.events[k].x2 === HitSrc.Spell) n++;
  return n;
};

describe('sorts : un par classe', () => {
  it('neuf sorts distincts, un par personnage, et leurs constantes existent', () => {
    expect(new Set(CHARACTERS.map((c) => c.spell)).size).toBe(9);
    expect(SPELL_KEYS).toHaveLength(9);
    for (const k of SPELL_KEYS) expect(SPELL[k].cd, k).toBeGreaterThan(0);
    expect(new World(1).spell).toBe(Spell.Bond); // l'Éclaireuse, référence
  });
  it('un sort ne se relance pas avant sa recharge ; il émet Ev.Spell au lancement', () => {
    const w = make('eclaireuse');
    const ev: Ev[] = [];
    run(w, 1, cast, ev);
    expect(ev).toContain(Ev.Spell);
    expect(w.player.spellCd).toBeCloseTo(SPELL.bond.cd - STEP, 6);
    expect(w.sstate.casts).toBe(1);
    run(w, 30, cast); // relancé trop tôt : rien
    expect(w.sstate.casts).toBe(1);
    run(w, Math.ceil(SPELL.bond.cd / STEP));
    run(w, 1, cast);
    expect(w.sstate.casts).toBe(2);
  });
});

describe('les neuf sorts', () => {
  it('Bond (Éclaireuse) : élan invulnérable puis 6 orbes de sort en étoile', () => {
    const w = make('eclaireuse');
    run(w, 1, { ...cast, mx: 1 });
    expect(w.player.dashT).toBeGreaterThan(0);
    expect(w.player.invul).toBeGreaterThan(0);
    run(w, Math.ceil(PLAYER.dashTime / STEP) + 2);
    let orbs = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === ProjKind.Orbe && w.projs[i].armed) orbs++;
    expect(orbs).toBe(SPELL.bond.orbs);
    expect(w.player.x).toBeGreaterThan(1); // il a bondi
  });
  it('Tourbillon (Bûcheron) : frappe tout autour pendant la durée et divise les dégâts subis par deux', () => {
    const w = make('bucheron');
    const e = put(w, 0, 2, 0);
    let hits = 0;
    step(w, cast, STEP);
    expect(w.player.dmgTaken).toBe(SPELL.tourbillon.dmgTaken);
    for (let f = 0; f < Math.ceil(SPELL.tourbillon.dur / STEP); f++) {
      e.x = w.player.x + 2; // on le garde à portée malgré le recul
      e.z = w.player.z;
      step(w, still, STEP);
      hits += spellHits(w);
    }
    expect(hits).toBeGreaterThanOrEqual(Math.floor(SPELL.tourbillon.dur / SPELL.tourbillon.period) - 1);
    run(w, 3);
    expect(w.player.dmgTaken).toBe(1);
  });
  it('Clignement (Sorcière) : 6 u en terrain libre, éclairs sur les ennemis proches du point de départ', () => {
    const w = make('sorciere');
    // terrain libre devant (x croissant) ?
    let free = true;
    for (let s = 0.5; s <= SPELL.clignement.dist; s += 0.5) if (w.blocksShot(s, 0, PLAYER.radius)) free = false;
    expect(free).toBe(true);
    for (let k = 0; k < 3; k++) put(w, 0, -1.5, k - 1);
    const ev: Ev[] = [];
    run(w, 2, { ...cast, mx: 1 }, ev);
    expect(w.player.x).toBeGreaterThan(SPELL.clignement.dist - 0.6);
    expect(ev.filter((t) => t === Ev.Bolt).length).toBe(3);
    expect(w.player.invul).toBeGreaterThan(0);
  });
  it('Clignement : s’arrête avant un muret, jamais dedans', () => {
    const w = make('sorciere');
    const s = w.walls.find((m) => Math.hypot(m.x2 - m.x1, m.z2 - m.z1) > 4)!;
    // on se place à 3 u du milieu du muret, face à lui
    const mx = (s.x1 + s.x2) / 2,
      mz = (s.z1 + s.z2) / 2;
    const nx = -(s.z2 - s.z1),
      nz = s.x2 - s.x1,
      l = Math.hypot(nx, nz);
    w.player.x = w.player.px = mx + (nx / l) * 3;
    w.player.z = w.player.pz = mz + (nz / l) * 3;
    run(w, 2, { ...cast, mx: -nx / l, mz: -nz / l });
    expect(w.blocksShot(w.player.x, w.player.z, PLAYER.radius)).toBe(false);
    expect(Math.hypot(w.player.x - mx, w.player.z - mz)).toBeLessThan(3);
  });
  it('Éclat (Veilleuse) : étourdit les ennemis autour, ralentit seulement un boss', () => {
    const w = make('veilleuse');
    const e = put(w, 0, 3, 0);
    const b = put(w, BOSS_TYPE, -3, 0);
    run(w, 2, cast);
    expect(e.stun).toBeGreaterThan(SPELL.eclat.stun - 0.1);
    expect(b.stun).toBe(0);
    expect(b.slowT).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(e.max);
  });
  it('Collet (Braconnier) : un ennemi pris dans le filet ne bouge plus ; un boss y est seulement ralenti', () => {
    const w = make('braconnier');
    const r = SPELL.collet.range;
    const e = put(w, 0, r, 0.5); // dans le filet lancé vers +x
    const b = put(w, BOSS_TYPE, r - 0.5, -2.6);
    run(w, 1, { ...cast, mx: 1 });
    w.player.dirX = 0; // on ne bouge plus
    run(w, 10);
    expect(b.stun).toBe(0); // le boss avance, ralenti (il finit par sortir du filet)
    expect(b.slowT).toBeGreaterThan(0);
    const x0 = e.x,
      z0 = e.z;
    run(w, Math.floor(SPELL.collet.dur / STEP) - 30);
    expect(Math.hypot(e.x - x0, e.z - z0)).toBeLessThan(0.05);
    run(w, 60); // le filet est retombé : il repart
    const x1 = e.x;
    run(w, 30);
    expect(Math.abs(e.x - x1)).toBeGreaterThan(0.3);
  });
  it('Pétard (Sapeur) : explosion autour de lui, il s’envole, et l’atterrissage pose une mine', () => {
    const w = make('sapeur', 1, true);
    const e = put(w, 0, 2, 0);
    let mines0 = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === ProjKind.Mine) mines0++;
    run(w, 10, cast);
    expect(w.player.y).toBeGreaterThan(PLAYER.airborneSafeY);
    expect(e.hp).toBeLessThan(e.max);
    e.x = e.px = w.player.x + 40; // loin : la mine posée à l'atterrissage ne s'amorce pas
    run(w, 90);
    expect(w.player.onGround).toBe(true);
    let mines = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === ProjKind.Mine) mines++;
    expect(mines).toBeGreaterThan(mines0);
  });
  it('Comète (Feu follet) : élan deux fois plus long que le Bond, recharge courte', () => {
    const w = make('feufollet');
    expect(w.player.dashTime).toBeCloseTo(SPELL.comete.time, 6);
    expect(spellCooldown(w)).toBeCloseTo(SPELL.comete.cd, 6);
    run(w, 1, { ...cast, mx: 1 });
    expect(w.player.dashT).toBeGreaterThan(PLAYER.dashTime);
  });
  it('Voile (Revenante) : invulnérable et plus rapide pendant 1,5 s, ralentit ce qu’elle frôle', () => {
    const a = make('revenante'),
      b = make('revenante');
    const e = put(a, 0, 0.8, 0);
    run(a, 1, { ...cast, mx: 1 });
    expect(a.player.invul).toBeGreaterThan(SPELL.voile.dur - 0.1);
    for (let f = 0; f < 60; f++) {
      step(a, { ...still, mx: 1 }, STEP);
      step(b, { ...still, mx: 1 }, STEP);
    }
    expect(a.player.x).toBeGreaterThan(b.player.x * 1.2);
    expect(e.slowT).toBeGreaterThan(0);
  });
  it('Bourse (Colporteur) : explose devant lui, plus fort avec l’or gardé', () => {
    const dealt = (gold: number) => {
      const w = make('colporteur');
      w.gold = gold;
      const e = put(w, 0, SPELL.bourse.range, 0);
      run(w, 2, { ...cast, mx: 1 });
      return e.max - e.hp;
    };
    const poor = dealt(0),
      rich = dealt(10000);
    expect(poor).toBeGreaterThan(0);
    expect(rich / poor).toBeCloseTo((SPELL.bourse.dmg + SPELL.bourse.maxBonus) / SPELL.bourse.dmg, 1);
  });
});

describe('ce qui renforce le sort', () => {
  it('tome Mouvement : recharge −8 % par ligne (plancher 35 %), puissance +8 % par ligne', () => {
    const w = make('veilleuse');
    const cd0 = spellCooldown(w);
    applyTomeLine(w, 'mouvement', lineIndex(TOMES.mouvement, 'spellcd'));
    expect(spellCooldown(w)).toBeCloseTo(cd0 * 0.92, 6);
    for (let k = 0; k < 30; k++) applyTomeLine(w, 'mouvement', lineIndex(TOMES.mouvement, 'spellcd'));
    expect(w.player.spellCdMul).toBe(TOME_CAPS.spellCdMin);
    const hit = (pow: number) => {
      const v = make('veilleuse');
      v.player.spellPow = pow;
      const e = put(v, 0, 3, 0);
      run(v, 2, cast);
      return e.max - e.hp;
    };
    expect(hit(1.8) / hit(1)).toBeCloseTo(1.8, 1);
  });
  it('Cape : invulnérable après chaque sort, recharge −25 %', () => {
    const w = make('braconnier');
    const cd0 = spellCooldown(w);
    gainItem(w, It.Cape);
    expect(spellCooldown(w)).toBeCloseTo(cd0 * ITEM.cape.cdMul, 6);
    run(w, 1, cast);
    expect(w.player.invul).toBeGreaterThan(ITEM.cape.invul - 0.05);
  });
});

describe('phase 22 : sorts rares, recharge à gagner', () => {
  it('recharges de base entre 6 et 18 s (×2,5 de la phase 19)', () => {
    for (const k of SPELL_KEYS) {
      expect(SPELL[k].cd, k).toBeGreaterThanOrEqual(6);
      expect(SPELL[k].cd, k).toBeLessThanOrEqual(18);
    }
    expect(SPELL.bond.cd).toBe(8);
    expect(SPELL.comete.cd).toBe(6);
  });
  it('Rune de rappel −30 %, sanctuaire de l\'arcane −12 %, cumulés avec la Cape et le tome sous le plancher de 35 %', () => {
    const w = make('veilleuse');
    const cd0 = spellCooldown(w);
    gainItem(w, It.Rune);
    expect(spellCooldown(w)).toBeCloseTo(cd0 * ITEM.rune.cdMul, 6);
    applyBoon(w, 'spell');
    expect(spellCooldown(w)).toBeCloseTo(cd0 * ITEM.rune.cdMul * (1 - BOON.spell), 6);
    gainItem(w, It.Cape);
    for (let k = 0; k < 10; k++) applyTomeLine(w, 'mouvement', lineIndex(TOMES.mouvement, 'spellcd'));
    expect(w.player.spellCdMul).toBe(TOME_CAPS.spellCdMin);
    expect(spellCooldown(w)).toBeCloseTo(cd0 * 0.35, 6);
  });
  it('Collier d\'os : un kill rend 0,1 s, un boss 4 s, la réserve plafonne les vagues', () => {
    const w = make('eclaireuse');
    gainItem(w, It.Collier);
    run(w, 1, cast); // lance le Bond : recharge pleine
    const P = w.player;
    const cd = P.spellCd;
    const kill = (type: number, x: number, z: number) => killEnemy(w, w.enemies.indexOf(put(w, type, x, z)));
    kill(0, 6, 0);
    expect(P.spellCd).toBeCloseTo(cd - ITEM.collier.perKill, 6);
    // 50 kills d'un coup : au plus la réserve (1 s) est rendue
    for (let k = 0; k < 50; k++) {
      kill(0, 6 + k * 0.1, 3);
    }
    expect(cd - P.spellCd).toBeLessThanOrEqual(ITEM.collier.bank + 1e-6);
    const before = P.spellCd;
    kill(BOSS_TYPE, 0, 9);
    expect(P.spellCd).toBeCloseTo(Math.max(0, before - ITEM.collier.perBoss), 6);
  });
});
