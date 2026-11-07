// Phase 17 : objets passifs, marchand et synergies tome + arme.
import { describe, expect, it } from 'vitest';
import { CHEST, ITEM, ITEM_KEYS, ITEM_RARITY, It, MERCHANT, STEP, SYN, SYNERGIES, Syn } from './balance';
import { dropChest, hitEnemy } from './combat';
import { canGainItem, gainItem, itemCount, itemPrice, merchantOffers, rollItemChoices } from './items';
import { MERCHANT_LEAVE, MERCHANT_REROLL, canAffordAny, rerollCost } from './merchant';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { cardSynergy, synergyCount, updateSynergies } from './synergies';
import { Ev, HitSrc, Mode } from './types';
import type { Card, Input } from './types';
import { refreshStats } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};
const god = (w: World) => {
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
};

describe('objets passifs', () => {
  it('vingt objets (phase 22 : Rune, Collier ; phase 28 : six de plus), chacun avec une rareté', () => {
    expect(ITEM_KEYS.length).toBe(20);
    expect(new Set(ITEM_KEYS).size).toBe(20);
    expect(ITEM_RARITY.length).toBe(20);
  });
  it('les effets immédiats modifient le joueur une seule fois (un objet est unique)', () => {
    const w = new World(1);
    const P = w.player;
    const base = { hp: P.maxHp, speed: P.speed, magnet: P.magnet, cd: P.spellCdMul, luck: P.luck, gold: P.goldMul };
    gainItem(w, It.Coeur);
    gainItem(w, It.Coeur);
    expect(P.maxHp).toBe(base.hp + ITEM.coeur.hp);
    expect(P.speed).toBeCloseTo(base.speed * ITEM.coeur.speedMul, 6);
    gainItem(w, It.Lanterne);
    expect(P.magnet).toBeCloseTo(base.magnet * ITEM.lanterne.magnetMul, 6);
    gainItem(w, It.Cape);
    expect(P.spellCdMul).toBeCloseTo(base.cd * ITEM.cape.cdMul, 6);
    gainItem(w, It.Fer);
    expect(P.luck).toBe(base.luck + ITEM.fer.luck);
    gainItem(w, It.Bourse);
    expect(P.goldMul).toBeCloseTo(base.gold + ITEM.bourse.goldMul, 6);
    gainItem(w, It.Phenix);
    expect(P.revives).toBe(1);
    expect(itemCount(w)).toBe(6);
    expect(w.itemOrder).toEqual([It.Coeur, It.Lanterne, It.Cape, It.Fer, It.Bourse, It.Phenix]);
    expect(canGainItem(w)).toBe(false); // ITEM.max
  });
  it('les effets survivent aux montées de niveau (les tomes s’ajoutent, ne réinitialisent pas)', () => {
    const w = new World(2);
    gainItem(w, It.Oeil);
    const elite = w.player.eliteDmgMul;
    refreshStats(w);
    expect(w.player.eliteDmgMul).toBe(elite);
  });
  it('tirage pondéré : jamais un objet possédé, jamais deux fois le même, la Chance fait monter la rareté', () => {
    const w = new World(3);
    gainItem(w, It.Talisman);
    const out: Card[] = [];
    let rare = 0;
    for (let k = 0; k < 400; k++) {
      rollItemChoices(w, 3, false, out);
      expect(out.length).toBe(3);
      expect(new Set(out.map((c) => c.key)).size).toBe(3);
      for (const c of out) {
        expect(c.kind).toBe('i');
        expect(c.key).not.toBe('talisman');
        if (c.lv >= 1) rare++;
      }
    }
    w.player.luck = 6;
    let lucky = 0;
    for (let k = 0; k < 400; k++) {
      rollItemChoices(w, 3, false, out);
      for (const c of out) if (c.lv >= 1) lucky++;
    }
    expect(lucky).toBeGreaterThan(rare);
  });
  it('coffre plein (6 objets) : un sac d’or à la place du choix', () => {
    const w = new World(4);
    god(w);
    for (let i = 0; i < ITEM.max; i++) gainItem(w, i);
    const g = w.gold;
    dropChest(w, w.player.x, w.player.z + 0.5, false);
    step(w, still, STEP);
    expect(w.mode).toBe(Mode.Play);
    expect(w.gold).toBeGreaterThan(g + ITEM.chestGoldIfFull * 0.9);
  });
  it('Épines : un ennemi au contact reçoit des dégâts ; Talisman : la foudre tous les 25 kills', () => {
    const w = new World(5);
    god(w);
    w.weapons = {};
    refreshStats(w);
    gainItem(w, It.Epines);
    spawnEnemy(w, 2, 0, 0.4);
    let thorns = 0;
    for (let f = 0; f < 60; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Hit && w.events[i].x2 === HitSrc.Thorns) thorns++;
    }
    expect(thorns).toBeGreaterThan(2);
    const t = new World(6);
    god(t);
    t.weapons = {};
    gainItem(t, It.Talisman);
    for (let k = 0; k < 12; k++) spawnEnemy(t, 0, (k / 12) * 6.28, 6);
    let bolts = 0;
    for (let k = 0; k < ITEM.talisman.every; k++) {
      const i = spawnEnemy(t, 0, 0, 3);
      t.clearEvents();
      hitEnemy(t, i, 1e9, 0, t.player.x, t.player.z);
      bolts += count(t, Ev.Bolt);
    }
    expect(bolts).toBe(ITEM.talisman.targets);
  });
  it('Bottes : saut plus haut, l’atterrissage repousse les ennemis proches', () => {
    const w = new World(7);
    god(w);
    w.weapons = {};
    gainItem(w, It.Bottes);
    let peak = 0,
      waves = 0;
    step(w, { ...still, jump: true }, STEP);
    for (let f = 0; f < 120; f++) {
      step(w, still, STEP);
      peak = Math.max(peak, w.player.y);
      waves += count(w, Ev.Shockwave);
    }
    const n = new World(7);
    god(n);
    n.weapons = {};
    let peak0 = 0;
    step(n, { ...still, jump: true }, STEP);
    for (let f = 0; f < 120; f++) {
      step(n, still, STEP);
      peak0 = Math.max(peak0, n.player.y);
    }
    expect(peak).toBeGreaterThan(peak0 * 1.2);
    expect(waves).toBe(1);
  });
});

describe('marchand', () => {
  const arrive = (seed: number) => {
    const w = new World(seed);
    god(w);
    w.weapons = {};
    w.t = MERCHANT.times[0] - STEP / 2;
    step(w, still, STEP);
    return w;
  };
  it('apparaît à l’heure prévue, près du joueur, et repart après MERCHANT.stay s', () => {
    const w = arrive(10);
    expect(w.merchant.active).toBe(true);
    expect(count(w, Ev.MerchantArrive)).toBe(1);
    const d = Math.hypot(w.merchant.x - w.player.x, w.merchant.z - w.player.z);
    expect(d).toBeGreaterThan(MERCHANT.distMin - 2);
    expect(d).toBeLessThan(MERCHANT.distMax + 2);
    w.t = w.merchant.until;
    step(w, still, STEP);
    expect(w.merchant.active).toBe(false);
    expect(count(w, Ev.MerchantLeave)).toBe(1);
  });
  it('entrer ouvre l’échoppe (pause), on achète avec l’or du run, on relance, on part', () => {
    const w = arrive(11);
    w.player.x = w.merchant.x;
    w.player.z = w.merchant.z;
    w.gold = 1000;
    step(w, still, STEP);
    expect(w.mode).toBe(Mode.Merchant);
    expect(w.offers.length).toBe(merchantOffers(w));
    const t = w.t;
    step(w, still, STEP);
    expect(w.t).toBe(t); // pause
    const c = w.offers[0];
    expect(c.s0).toBe(itemPrice(w, ITEM_KEYS.indexOf(c.key as never)));
    step(w, { ...still, pick: 0 }, STEP);
    expect(w.gold).toBe(1000 - c.s0);
    expect(w.goldSpent).toBe(c.s0);
    expect(c.s1).toBe(1);
    expect(w.itemOrder.length).toBe(1);
    expect(count(w, Ev.Item)).toBe(1);
    step(w, { ...still, pick: 0 }, STEP); // déjà vendu : rien
    expect(w.itemOrder.length).toBe(1);
    const cost = rerollCost(w);
    const before = w.gold;
    step(w, { ...still, pick: MERCHANT_REROLL }, STEP);
    expect(w.gold).toBe(before - cost);
    expect(rerollCost(w)).toBe(cost + MERCHANT.reroll);
    expect(w.offers.every((o) => o.s1 === 0)).toBe(true);
    step(w, { ...still, pick: MERCHANT_LEAVE }, STEP);
    expect(w.mode).toBe(Mode.Play);
    step(w, still, STEP); // toujours dedans : l'échoppe ne se rouvre pas tant qu'on n'en sort pas
    expect(w.mode).toBe(Mode.Play);
  });
  it('sans or : achat refusé ; les prix montent à chaque visite, la Bourse les baisse', () => {
    const w = arrive(12);
    w.player.x = w.merchant.x;
    w.player.z = w.merchant.z;
    w.gold = 0;
    step(w, still, STEP);
    expect(canAffordAny(w)).toBe(false);
    step(w, { ...still, pick: 0 }, STEP);
    expect(w.itemOrder.length).toBe(0);
    expect(w.mode).toBe(Mode.Merchant);
    const p0 = itemPrice(w, It.Coeur);
    w.merchant.visit = 2;
    expect(itemPrice(w, It.Coeur)).toBe(Math.round(MERCHANT.price[ITEM_RARITY[It.Coeur]] * (1 + 2 * MERCHANT.growth)));
    expect(itemPrice(w, It.Coeur)).toBeGreaterThan(p0);
    gainItem(w, It.Bourse);
    expect(itemPrice(w, It.Coeur)).toBeLessThan(
      Math.round(MERCHANT.price[ITEM_RARITY[It.Coeur]] * (1 + 2 * MERCHANT.growth)),
    );
  });
  it('quatre visites par run au plus', () => {
    const w = new World(13);
    god(w);
    w.weapons = {};
    let visits = 0;
    for (const t of MERCHANT.times) {
      w.t = t - STEP / 2;
      step(w, still, STEP);
      visits += count(w, Ev.MerchantArrive);
      w.t = w.merchant.until;
      step(w, still, STEP);
    }
    w.t = 1190;
    step(w, still, STEP);
    visits += count(w, Ev.MerchantArrive);
    expect(visits).toBe(MERCHANT.times.length);
  });
});

describe('synergies', () => {
  it('onze synergies (phase 28), paires tome + arme uniques', () => {
    expect(SYNERGIES.length).toBe(11);
    expect(new Set(SYNERGIES.map((s) => s.tome + s.weapon)).size).toBe(11);
  });
  it('s’active à SYN.tome cartes du tome avec l’arme équipée, une seule fois, et modifie l’arme', () => {
    const w = new World(20);
    w.weapons = { foudre: 1 };
    refreshStats(w);
    const chain0 = w.wstats.foudre.chain;
    w.tomes = { cadence: SYN.tome - 1 };
    expect(updateSynergies(w)).toBe(false);
    const card: Card = { kind: 't', key: 'cadence', lv: SYN.tome, n: 1, s0: 0, s1: -1, s2: -1 };
    expect(cardSynergy(w, card)).toBe(Syn.Orage);
    w.tomes = { cadence: SYN.tome };
    const hp0 = w.player.maxHp,
      armor0 = w.player.armor;
    expect(updateSynergies(w)).toBe(true);
    expect(w.player.maxHp).toBe(hp0 + SYN.hp); // 1re synergie : SYN.hp, SYN.armor
    expect(w.player.armor).toBeCloseTo(armor0 + SYN.armor, 6);
    expect(count(w, Ev.Synergy)).toBe(1);
    expect(updateSynergies(w)).toBe(false);
    expect(synergyCount(w)).toBe(1);
    refreshStats(w);
    expect(w.wstats.foudre.chain).toBe(chain0 + SYN.orage.chain);
    expect(cardSynergy(w, card)).toBe(-1); // déjà active
    // une nouvelle arme dont le tome est déjà là complète aussi une synergie
    w.tomes.projectiles = SYN.tome;
    expect(cardSynergy(w, { kind: 'w', key: 'orbe', lv: 1, n: 1, s0: 0, s1: -1, s2: -1 })).toBe(Syn.Essaim);
    // la 2e synergie rapporte deux fois plus
    w.weapons.orbe = 1;
    const hp1 = w.player.maxHp;
    updateSynergies(w);
    expect(w.player.maxHp).toBe(hp1 + 2 * SYN.hp);
  });
  it('Rempart : le contact d’un ennemi dans le Halo fait moins mal', () => {
    const hurt = (rempart: boolean) => {
      const w = new World(21);
      w.weapons = { aura: 1 };
      refreshStats(w);
      w.wstats.aura.dmg = 0;
      if (rempart) w.syn[Syn.Rempart] = 1;
      w.player.maxHp = w.player.hp = 1000;
      w.player.need = 1e9;
      spawnEnemy(w, 2, 0, 0.4);
      for (let f = 0; f < 60; f++) step(w, still, STEP);
      return 1000 - w.player.hp;
    };
    expect(hurt(true)).toBeLessThan(hurt(false) * 0.9);
  });
});

describe('déterminisme (phase 17)', () => {
  it('coffres, marchand et objets : même seed, même run', () => {
    const run = () => {
      const w = new World(99);
      startRun(w);
      w.gold = 500;
      for (let f = 0; f < 60 * 200; f++) {
        const pick = w.mode === Mode.LevelUp ? 0 : w.mode === Mode.Merchant ? (f % 3 === 0 ? MERCHANT_LEAVE : 0) : -1;
        // le bot de test marche vers l'échoppe quand elle est là
        let mx = Math.cos(f / 90),
          mz = Math.sin(f / 90);
        if (w.merchant.active && !w.merchant.inside) {
          const dx = w.merchant.x - w.player.x,
            dz = w.merchant.z - w.player.z,
            l = Math.hypot(dx, dz) || 1;
          mx = dx / l;
          mz = dz / l;
        }
        step(w, { mx, mz, jump: false, spell: false, pick }, STEP);
        if (f === 100) dropChest(w, w.player.x, w.player.z + 0.5, f % 2 === 0);
        if (w.mode === Mode.Dead) break;
      }
      return w;
    };
    const a = run(),
      b = run();
    expect(a.t).toBe(b.t);
    expect(a.kills).toBe(b.kills);
    expect(a.gold).toBe(b.gold);
    expect([...a.itemOrder]).toEqual([...b.itemOrder]);
    expect(a.rng.state()).toBe(b.rng.state());
    expect(a.itemOrder.length).toBeGreaterThanOrEqual(CHEST.bossPicks);
  });
});

describe('objets de la phase 28', () => {
  const arena = () => {
    const w = new World(91);
    w.weapons = {};
    w.enemyCount = 0;
    w.nextWave = 1e9;
    w.player.need = 1e9;
    return w;
  };
  it('Patins de braise : une glissade rapide brûle les ennemis traversés, pas la marche', () => {
    const run = (slide: boolean) => {
      const w = arena();
      gainItem(w, It.Patins);
      w.player.maxHp = w.player.hp = 1e9;
      const i = spawnEnemy(w, 0, 0, 10);
      const e = w.enemies[i];
      e.x = e.px = 3;
      e.z = e.pz = 0;
      e.hp = e.max = 1e6;
      e.spd = 0;
      let patins = 0;
      for (let f = 0; f < 60; f++) {
        step(w, { ...still, mx: 1, slide: slide && f === 2 }, STEP);
        for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit && ((w.events[k].x2 | 0) & 15) === HitSrc.Patins) patins++;
      }
      return patins;
    };
    expect(run(true)).toBeGreaterThanOrEqual(1);
    expect(run(false)).toBe(0);
  });
  it('Bouclier : le premier coup est annulé, le suivant dans les 20 s ne l’est pas', () => {
    const w = arena();
    gainItem(w, It.Bouclier);
    const hp0 = w.player.hp;
    const i = spawnEnemy(w, 0, 0, 10);
    const e = w.enemies[i];
    e.x = e.px = 0.2;
    e.z = e.pz = 0;
    e.hp = e.max = 1e6;
    let blocks = 0;
    step(w, still, STEP);
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.ShieldBlock) blocks++;
    expect(blocks).toBe(1);
    expect(w.player.hp).toBe(hp0);
    for (let f = 0; f < 60; f++) step(w, still, STEP);
    expect(w.player.hp).toBeLessThan(hp0);
  });
  it('Corne de guerre : une onde repousse et étourdit les ennemis proches', () => {
    const w = arena();
    gainItem(w, It.Corne);
    w.player.maxHp = w.player.hp = 1e9;
    const i = spawnEnemy(w, 0, 0, 10);
    const e = w.enemies[i];
    e.x = e.px = 3;
    e.z = e.pz = 0;
    let horns = 0;
    step(w, still, STEP);
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Horn) horns++;
    expect(horns).toBe(1);
    expect(e.stun).toBeGreaterThan(0);
    expect(e.kx).toBeGreaterThan(0);
  });
  it('Boussole : la découverte porte plus loin', () => {
    const a = arena(),
      b = arena();
    gainItem(b, It.Boussole);
    step(a, still, STEP);
    step(b, still, STEP);
    expect(b.seenCount).toBeGreaterThan(a.seenCount * 2.5);
  });
});
