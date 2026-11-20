import { slopeAlong } from '../../src/sim/terrain';

/** Phase 27 : variante du bot qui glisse dans les descentes (mesure, pas la référence d'équilibrage). */
const BOT_SLIDE = typeof process !== 'undefined' && process.env?.BOT_SLIDE === '1';
// phase 37 : chrono du monde (s) auquel le bot va activer le totem ; BOT_FARM=1 : il reste après le boss au lieu de prendre
// le portail (mesure de la prolongation). 1.66.0 (décision 18 de docs/specs/tutoriel.md) : la mort du boss fait tomber le
// chrono à 0, le temps qui reste est perdu ; le bot attend donc 7:30 (2:30 au chrono), pour que le boss tombe vers 8:30
// (combat ≈ 40 s, marche comprise), avant la fin. Mesuré (maxé, 4 graines × 200) : 8:30 le noie dans la horde (monde 2
// 66,9 % contre 73,5 % à 6:00, kills à 10 min et morts en prolongation hors cible) ; 7:30 coûte 4,4 points de monde 2
const BOT_TOTEM_AT = Number((typeof process !== 'undefined' && process.env?.BOT_TOTEM_AT) || 450);
// 1.67.0 (docs/specs/corrompus.md, relecture) : BOT_FARM=60, il reste 60 s en prolongation puis prend le portail (le
// joueur qui farme les corrompus avant de passer : mesure de la boule de neige) ; BOT_FARM=1, il reste jusqu'à la mort
const BOT_FARM_ENV = Number((typeof process !== 'undefined' && process.env?.BOT_FARM) || 0);
const BOT_FARM = BOT_FARM_ENV === 1;
const BOT_FARM_FOR = BOT_FARM_ENV > 1 ? BOT_FARM_ENV : 0;
import type { BoonKey, Card, Input, ItemKey, TomeKey, WeaponKey } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { Role, ShotKind, Spell } from '../../src/sim/types';
import { Rng } from '../../src/sim/rng';
import {
  ARENA,
  BOSSTOTEM,
  DIFFICULTY,
  FINAL,
  ENEMIES,
  HAZARDS,
  MAPCHEST,
  MERCHANT,
  SHRINE,
  STAGE,
  STEP,
  TOMES,
  VOLANT_TYPE,
  WEAPON_LINES,
} from '../../src/sim/balance';
import { canGainItem, stackEff } from '../../src/sim/items';
import { chargeOf, isCharger } from '../../src/sim/hazards';
import { MERCHANT_LEAVE, canAffordAny } from '../../src/sim/merchant';
import { cardSynergy } from '../../src/sim/synergies';

const POWER_SEEK2 = 16 * 16; // phase 35 : rayon (u²) où le bot va chercher un bonus au sol

/**
 * Le boss final (docs/specs/boss-final.md, décision 12) : ce que fait un joueur moyen dans l'Arène, ajouté à l'entrée
 * (`out`, déjà écrite par la fuite et les esquives). Sceaux : le plus proche d'abord. Éclipse : il se tient à portée du
 * vrai boss (ses armes visent le plus proche), loin des doubles. Cercle de flammes : il s'écarte du bord. Jugement : il
 * court à la zone sûre et y reste, rien d'autre ne compte. Renvoie vrai si l'entrée est imposée (Jugement).
 */
const ARENA_AVOID = 3; // u entre le héros et le corps du boss final (ou d'un double) en deçà desquels il s'écarte
/**
 * Un joueur ne marche pas dans le boss : à moins de ARENA_AVOID u de son corps (ou d'un double), il s'en écarte. Et il
 * lit le couloir rouge de sa charge : dans le couloir, il en sort par le côté le plus proche.
 */
function avoidHeart(w: World, out: Input, k0: number): boolean {
  const P = w.player;
  let near = false;
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive || (e.role !== Role.Heart && e.role !== Role.Decoy)) continue;
    const dx = P.x - e.x,
      dz = P.z - e.z,
      dd = Math.sqrt(dx * dx + dz * dz) || 1,
      gap = dd - e.r;
    if (e.state === 1 && isCharger(e)) {
      const along = dx * e.tx + dz * e.tz,
        side = dx * e.tz - dz * e.tx; // signé : de quel côté du couloir
      if (along > 0 && along < FINAL.charge.dist + e.r + 1 && Math.abs(side) < e.r + 1.2) {
        const s = side >= 0 ? 1 : -1;
        out.mx += e.tz * s * 4;
        out.mz += -e.tx * s * 4;
        near = true;
      }
    }
    if (gap >= ARENA_AVOID) continue;
    const k = k0 * (1 + (ARENA_AVOID - gap) / ARENA_AVOID);
    out.mx += (dx / dd) * k;
    out.mz += (dz / dd) * k;
    near = true;
  }
  return near;
}
function arenaMove(w: World, out: Input): boolean {
  const P = w.player;
  if (w.judgeT > 0) {
    const dx = w.judgeX - P.x,
      dz = w.judgeZ - P.z,
      l = Math.sqrt(dx * dx + dz * dz);
    if (l < FINAL.judge.r * 0.45) out.mx = out.mz = 0;
    else {
      out.mx = dx / l;
      out.mz = dz / l;
    }
    avoidHeart(w, out, 1);
    return true;
  }
  let tx = 0,
    tz = 0,
    td = 1e12,
    want = 0; // distance voulue à la cible
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive) continue;
    const goal = w.seals > 0 ? e.role === Role.Seal : e.role === Role.Heart;
    if (!goal) continue;
    const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    if (d < td) {
      td = d;
      tx = e.x - P.x;
      tz = e.z - P.z;
      want = e.role === Role.Seal ? e.r + 1.2 : e.r + 4.5;
    }
  }
  const near = avoidHeart(w, out, 3); // le boss ou un double tout près : il s'en écarte d'abord
  if (td < 1e12) {
    const d = Math.sqrt(td) || 1;
    // trop loin : il y va ; sur un sceau, il y reste (ses armes le brisent) ; près du boss, la fuite décide
    const k = near ? 0.5 : w.seals > 0 ? 2.4 : 1.2;
    if (d > want) {
      out.mx += (tx / d) * k;
      out.mz += (tz / d) * k;
    }
  }
  // le cercle de flammes : on s'en écarte avant de le toucher (il se resserre dans l'éclipse)
  const r = Math.sqrt(P.x * P.x + P.z * P.z),
    edge = w.arenaR - (w.finalPhase >= 3 ? 3 : 2);
  if (r > edge && r > 1e-6) {
    const k = 3 * (1 + (r - edge));
    out.mx -= (P.x / r) * k;
    out.mz -= (P.z / r) * k;
  }
  return false;
}
import { canOpenMapChest } from '../../src/sim/poi';

export interface Bot {
  name: string;
  decide(w: World, frame: number, out: Input): void;
  pick(w: World, cards: Card[]): number;
  /** Échoppe ouverte (Mode.Merchant) : index de l'offre à acheter, ou MERCHANT_LEAVE. */
  shop(w: World): number;
}

/** Échoppe (phase 17) : achète l'objet abordable le mieux noté, sinon part. Commun à tous les bots. */
export function shopPick(w: World): number {
  if (!canAffordAny(w)) return MERCHANT_LEAVE;
  let best = MERCHANT_LEAVE,
    bv = -1e9;
  for (let i = 0; i < w.offers.length; i++) {
    const c = w.offers[i];
    if (c.kind !== 'i' || c.s1 === 1 || w.gold < c.s0) continue;
    const v = itemValue(c);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

/** Plancher : tourne en cercle, prend la première carte. */
export const naive: Bot = {
  name: 'naive',
  decide(_w, frame, out) {
    const a = frame / 120;
    out.mx = Math.cos(a);
    out.mz = Math.sin(a);
    out.jump = false;
    out.spell = false;
  },
  pick: () => 0,
  shop: () => MERCHANT_LEAVE,
};

/** Valeur d'un bonus de sanctuaire pour le bot (phase 18). */
const BOON_VALUE: Record<BoonKey, number> = {
  dmg: 16,
  hp: 15,
  cd: 14,
  spell: 12,
  speed: 10,
  magnet: 8,
  gold: 6,
  // phase 47 : un joueur moyen prend d'abord ce qui tue ou ce qui fait tenir
  armor: 13,
  regen: 12,
  steal: 11,
  crit: 11,
  elite: 9,
  size: 9,
  critdmg: 8,
  xp: 8,
  luck: 7,
  spellpow: 5,
  jump: 2,
  // phase 52 : stats des tomes. Un projectile de plus pour toutes les armes passe avant tout ; le reste suit l'ordre
  // des lignes de tome (ce qui tue, ce qui fait tenir, puis le confort et le butin)
  proj: 20,
  lowdmg: 9,
  chilldmg: 7,
  revenge: 7,
  guard: 10,
  killheal: 9,
  lvlheal: 8,
  thorns: 6,
  stealcap: 6,
  slowchance: 6,
  slowdur: 3,
  life: 5,
  pspeed: 4,
  kb: 4,
  chestgold: 4,
  elitegold: 4,
  shop: 4,
  eliteloot: 5,
  eliterate: 4,
  difficulty: 1, // le bot ne monte pas la difficulté de lui-même (--take-defi le fait pour le tome)
};
/** Valeur d'un objet passif pour le bot (phase 17) : ordre de préférence d'un joueur moyen. */
const ITEM_VALUE: Record<ItemKey, number> = {
  phenix: 40,
  talisman: 26,
  coeur: 22,
  oeil: 20,
  sablier: 18,
  cape: 16,
  epines: 15,
  fer: 14,
  lanterne: 13,
  aimant: 12,
  bottes: 10,
  bourse: 9,
  rune: 17, // phase 22
  collier: 15,
  bouclier: 17, // phase 28
  corne: 14,
  echarpe: 8, // le bot de référence ne vrille pas
  patins: 6, // ni ne glisse
  plume: 5,
  boussole: 7,
  croc: 20, // phase 31 : un joueur moyen aime le soin
  calice: 17,
  mousse: 18,
  souffle: 15,
  pierre: 19,
  de: 14,
  gant: 13,
  brume: 18,
  sandales: 11,
  amulette: 12,
  ecorce: 17,
  couronne: 22,
  // phase 47 B : ce qui soigne ou tue d'abord, les objets de confort ensuite
  bandage: 15,
  savon: 4,
  enclume: 6,
  cle: 7,
  encens: 5,
  tirelire: 6,
  fiole: 13,
  miroir: 19,
  glace: 9,
  ailes: 5,
  coquille: 6,
  cloche: 10,
  trophee: 16,
  idole: 14,
  dent: 18,
  grimoire: 12,
  toxine: 14, // phase 50 : contre les boss (combats plus courts)
};

/**
 * Valeur d'une carte d'objet (phase 38) : un doublon vaut ce qu'il ajoute selon la règle de cumul (stackEff), un peu
 * moins qu'un objet neuf de même note (un joueur moyen varie). `s2` : exemplaires après l'avoir pris.
 */
function itemValue(c: Card): number {
  const v = ITEM_VALUE[c.key as ItemKey];
  const n = Math.max(1, c.s2);
  return n === 1 ? v : v * (stackEff(n) - stackEff(n - 1)) * 0.9;
}

/** Valeur d'une ligne de stat pour le bot (phase 12) : gain relatif approximatif, +1 projectile pèse lourd. */
const LINE_VALUE: Record<string, number> = {
  // armes
  dmg: 7,
  cd: 6,
  n: 22,
  speed: 3,
  pierce: 10,
  r: 6,
  period: 6,
  spd: 4,
  chain: 9,
  range: 4,
  crit: 5, // phase 23 (armes et tome Chance)
  slow: 3,
  stun: 4,
  // tomes
  elite: 4,
  kb: 2,
  life: 3,
  proj: 26,
  size: 5,
  pspeed: 3,
  hp: 6,
  regen: 5,
  armor: 6,
  spellcd: 3,
  spellpow: 2,
  xp: 6,
  magnet: 4,
  luck: 4,
  chestgold: 1,
  gold: 2,
  elitegold: 1,
  critdmg: 3, // phase 23
  killheal: 5,
  jump: 1,
  lvlheal: 3,
  shop: 2,
  // phase 47 : Sang, Givre, Bastion, Défi
  steal: 6,
  stealcap: 5,
  lowdmg: 3,
  slowchance: 5,
  chilldmg: 4,
  slowdur: 2,
  thorns: 4,
  guard: 5,
  revenge: 3,
  // le Défi est un pari volontaire : un joueur moyen ne cherche pas « plus de monstres » (mesuré : pris tôt par le bot,
  // monde 2 atteint 40 % contre 64 %)
  difficulty: 0,
  eliteloot: 2,
  eliterate: 1,
};
/**
 * Phase 47 : un emplacement de tome est rare (4 pour 12 tomes) et la carte d'un nouveau tome dit ce qu'il fera toute la
 * partie. Un joueur moyen prend donc d'abord les tomes qui tuent ou font tenir, pas le premier venu ; avant, le bot ne
 * jugeait un nouveau tome que sur les lignes tirées ce jour-là. Bonus par famille, pas réglé tome par tome.
 */
const COMBAT_TOMES: ReadonlySet<TomeKey> = new Set([
  'projectiles',
  'vitalite',
  'degats',
  'cadence',
  'savoir',
  'sang',
  'givre',
  'bastion',
]);
/** Réglages du bot ouverts à la CLI (`--tome-prior 0` : ancien comportement, pour comparer). */
// phase 48 : `skulls` = crânes de difficulté que le bot va activer dans chaque monde (0 : il n'y touche pas, c'est le
// joueur « moyen » des cibles) ; `takeDefi` = il prend le tome de difficulté quand il sort (sinon jamais : un joueur qui
// ne cherche pas la difficulté ne la prend pas par hasard)
// `bossTotems` = totems de boss que le bot va activer dans chaque monde (0 : il n'y touche pas), dès `bossTotemAt` s
// partie guidée (`--tutorial`) : `totemAt` = chrono du monde (s) auquel le bot va au totem (TUTORIAL.forceAt)
export const BOT_TUNE = {
  tomePrior: 8,
  skulls: 0,
  skullEvery: 45,
  takeDefi: false,
  bossTotems: 0,
  bossTotemAt: 30,
  totemAt: BOT_TOTEM_AT,
};
function lineValue(c: Card, s: number): number {
  if (s < 0) return 0;
  const l = c.kind === 'w' ? WEAPON_LINES[c.key as WeaponKey][s] : TOMES[c.key as TomeKey][s];
  const base = LINE_VALUE[l.stat] ?? 3;
  // tome Dégâts / Cadence : s'applique à toutes les armes, vaut plus qu'une ligne d'arme
  return c.kind === 't' && (l.stat === 'dmg' || l.stat === 'cd') ? base * 1.3 : base;
}

/** Valeur d'une carte pour un bot : somme de ses lignes (phase 12) ; nouvelle arme et soin valorisés par règle simple. */
function cardValue(w: World, c: Card): number {
  if (c.kind === 'heal') return w.player.hp / w.player.maxHp < 0.4 ? 100 : 5;
  if (c.kind === 'i') return itemValue(c);
  if (c.kind === 'b') return BOON_VALUE[c.key as BoonKey];
  if (c.kind === 't' && c.key === 'defi') return BOT_TUNE.takeDefi ? 30 : -1000; // phase 48 : tome de difficulté
  let v = lineValue(c, c.s0) + lineValue(c, c.s1) + lineValue(c, c.s2);
  if (c.kind === 'w' && c.lv === 1) v += 18; // une arme de plus : une base entière
  if (c.kind === 't' && c.lv === 1 && COMBAT_TOMES.has(c.key as TomeKey)) v += BOT_TUNE.tomePrior; // phase 47
  // un joueur moyen concentre ses lignes sur son arme principale (les % se cumulent) : bonus croissant avec le niveau
  if (c.kind === 'w' && c.lv > 1) v *= 1 + Math.min(0.6, 0.04 * c.lv);
  if (c.kind === 't' && c.key === 'vitalite' && w.player.hp / w.player.maxHp < 0.4) v += 15;
  if (cardSynergy(w, c) >= 0) v += 25; // phase 17 : on construit sa build vers une synergie
  return v;
}

/** Index de la carte de plus grande valeur parmi celles qui passent le filtre (ou -1 si aucune). */
function bestCard(w: World, cards: Card[], accept: (c: Card) => boolean): number {
  let best = -1,
    bv = -1e9;
  for (let i = 0; i < cards.length; i++) {
    if (!accept(cards[i])) continue;
    const v = cardValue(w, cards[i]);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

/**
 * Choix du bot restreint à une liste d'armes autorisées (option `--weapons` de la CLI).
 * Si le bot prend une carte d'arme hors liste, on la remplace par la meilleure carte
 * autorisée (passif, soin ou arme de la liste) ; si aucune n'est autorisée, carte 0 quand même.
 * `allowed` à null = aucune restriction.
 */
export function pickAllowed(bot: Bot, w: World, cards: Card[], allowed: ReadonlySet<string> | null): number {
  const idx = bot.pick(w, cards);
  if (!allowed) return idx;
  const isAllowed = (c: Card) => c.kind !== 'w' || allowed.has(c.key);
  const chosen = cards[idx];
  if (chosen && isAllowed(chosen)) return idx;
  const alt = bestCard(w, cards, isAllowed);
  return alt >= 0 ? alt : 0;
}

/**
 * Garde-fou de `--weapons` : si le tirage n'offrait que des armes hors liste (garantie « au moins une arme »
 * de la progression), la carte prise est retirée après coup. Le monde reste déterministe : même seed, même retrait.
 */
export function enforceAllowed(w: World, allowed: ReadonlySet<string> | null): void {
  if (!allowed) return;
  for (const k of Object.keys(w.weapons)) if (!allowed.has(k)) delete w.weapons[k as WeaponKey];
}

/** Réglages du bot « average » ; « greedy » n'en est qu'une variante plus gourmande. */
export interface AverageOptions {
  /** Nom affiché dans la CLI. */
  name?: string;
  /** Part d'aléa dans les choix de cartes (0 = pick optimal). */
  randomness?: number;
  /** Rayon (u) dans lequel la gemme la plus proche attire le bot, même en fuite. */
  gemRadius?: number;
  /** Poids de l'attraction vers la gemme pendant une fuite. */
  gemPullFleeing?: number;
  /** Poids de l'attraction vers la gemme hors danger. */
  gemPullFree?: number;
  /** Rayon (u) dans lequel un coffre attire le bot (greedy : de loin). */
  chestRadius?: number;
  /** Rayon (u) dans lequel l'échoppe du marchand attire le bot, s'il peut y acheter (phase 17). */
  merchantRadius?: number;
  /** Rayons (u) dans lesquels un coffre de carte abordable et un sanctuaire attirent le bot (phase 18). */
  mapChestRadius?: number;
  shrineRadius?: number;
}

/**
 * Bot de référence (skill sim-testing §2) : fuit le centre de masse des ennemis dans 8 u,
 * dash quand ≥ 6 ennemis à < 2 u, saute si entouré, pick = meilleur gain de DPS avec 30 % d'aléa.
 */
export function makeAverage(seed: number, opts: AverageOptions = {}): Bot {
  const name = opts.name ?? 'average';
  const randomness = opts.randomness ?? 0.3;
  const gemR2 = (opts.gemRadius ?? 7) ** 2;
  const pullFleeing = opts.gemPullFleeing ?? 0.6;
  const pullFree = opts.gemPullFree ?? 1.2;
  const chestR2 = (opts.chestRadius ?? 10) ** 2;
  const merchantR2 = (opts.merchantRadius ?? 15) ** 2;
  const mapChestR2 = (opts.mapChestRadius ?? 28) ** 2; // la colonne de lumière se voit de loin
  const shrineR2 = (opts.shrineRadius ?? 15) ** 2;
  const r = new Rng(seed);
  let stuck = 0; // frames consécutives où le joueur n'a presque pas avancé malgré l'entrée (muret, tronc, arbre)
  return {
    name,
    decide(w, _frame, out) {
      const P = w.player;
      // bloqué contre un muret ou un tronc (phase 16) → on saute par-dessus, comme un joueur ; contre un arbre, sans effet
      const wanted = Math.sqrt(out.mx * out.mx + out.mz * out.mz);
      const moved = Math.sqrt((P.x - P.px) ** 2 + (P.z - P.pz) ** 2);
      stuck = wanted > 0.5 && P.onGround && moved < P.speed * STEP * 0.3 ? stuck + 1 : 0;
      const blocked = stuck >= 3;
      let cx = 0,
        cz = 0,
        n = 0,
        close = 0,
        near3 = 0, // phase 19 : ennemis dans le rayon des sorts de zone (Tourbillon, Pétard ≈ 3 u ; Éclat 6 u)
        near6 = 0,
        near8 = 0, // et à portée de lancer (Collet, Bourse)
        diving = false;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        if (e.role === Role.Seal) continue; // boss final : un sceau ne blesse pas, on le brise (arenaMove)
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d2 = dx * dx + dz * dz;
        // Volant qui s'apprête à plonger à < 3 u : on saute au bon moment (survivor-design §6)
        if (e.type === VOLANT_TYPE && e.state === 1 && e.timer < 0.2 && d2 < 9) diving = true;
        if (d2 < 64) {
          const danger = ENEMIES[e.type].dmg * (1 + e.r); // le Gardien pèse 10× un Spectre
          const wgt = danger / (d2 + 0.5);
          cx += dx * wgt;
          cz += dz * wgt;
          n++;
          near8++;
          if (d2 < 4) close++;
          if (d2 < 9) near3++;
          if (d2 < 36) near6++;
        }
      }
      // cercles rouges du Colosse : un joueur moyen lit le télégraphe et sort de la zone
      // phase 11 : éruption sous les pieds imminente ou onde de choc qui arrive → saut au bon moment
      let hazard = false;
      let volley = 0; // phase 43 : crachats sur le point de nous toucher (salve en éventail de l'Essaim-mère)
      for (let i = 0; i < w.shotCount; i++) {
        const s = w.shots[i];
        const dx = s.x - P.x,
          dz = s.z - P.z,
          d2 = dx * dx + dz * dz;
        if (s.kind === ShotKind.Eruption) {
          // 1.25.1 : cercle fixe sous les pieds → on en sort en marchant ; encore dedans au dernier moment → saut
          if (d2 < (s.r + 0.6) ** 2) {
            if (s.life < 0.4) hazard = true;
            const wgt = 60 / (d2 + 0.5);
            cx += dx * wgt;
            cz += dz * wgt;
            n++;
          }
          continue;
        }
        if (s.kind === ShotKind.Ring) {
          const gap = Math.sqrt(d2) - s.r; // distance restante avant le passage de l'anneau
          if (gap > -0.6 && gap < HAZARDS.ring.speed * 0.3) hazard = true;
          continue;
        }
        if (s.kind === ShotKind.Spit || s.kind === ShotKind.Arrow) {
          // crachat lent ou flèche (phase 16) qui vient vers nous : on s'écarte de sa trajectoire (un joueur moyen le fait ;
          // la flèche va vite, on la voit de plus loin grâce à la ligne de visée)
          const vx = s.vx,
            vz = s.vz;
          const sp2 = vx * vx + vz * vz;
          if (sp2 < 1e-6 || d2 > (s.kind === ShotKind.Arrow ? 100 : 36)) continue;
          const along = -(dx * vx + dz * vz) / Math.sqrt(sp2); // distance restante le long de la trajectoire
          if (along < 0) continue;
          const px = -vz,
            pz = vx; // perpendiculaire
          const side = (-dx * px - dz * pz) / Math.sqrt(sp2);
          if (Math.abs(side) > 1.4) continue;
          // phase 43 : plusieurs crachats arrivent de front (on ne passe pas entre deux) → on saute la salve, comme un
          // joueur moyen ; un crachat seul s'esquive toujours d'un pas de côté
          if (s.kind === ShotKind.Spit && along < Math.sqrt(sp2) * 0.3) volley++;
          const wgt = 40 / (d2 + 0.5);
          cx -= Math.sign(side || 1) * px * wgt; // fuir = s'éloigner de la ligne (cx/cz est une direction à fuir)
          cz -= Math.sign(side || 1) * pz * wgt;
          n++;
          continue;
        }
        // boule de feu (phase 16) : cercle à fuir ; corrompus : flaque de feu de la Traînée ardente aussi (décision 8)
        if (s.kind !== ShotKind.Zone && s.kind !== ShotKind.Fireball && s.kind !== ShotKind.Flame) continue;
        if (d2 < (s.r + 1.5) ** 2) {
          // phase 43 : encore dans un cercle du Colosse au dernier moment (la croix se referme autour du centre) → saut,
          // comme pour une éruption ; pas la boule de feu du Sorcier (inchangé : elle reste une cause de mort mesurée)
          if (s.kind === ShotKind.Zone && s.life < 0.35 && d2 < (s.r + 0.4) ** 2) hazard = true;
          const wgt = 60 / (d2 + 0.5);
          cx += dx * wgt;
          cz += dz * wgt;
          n++;
        }
      }
      if (volley >= 2) hazard = true;
      // Brute élite qui charge dans notre direction : on la traverse en dash (invulnérable) si elle est proche ; corrompus :
      // la Ruée d'un Dard, même couloir, même esquive (décision 8)
      let charged = false;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        if (!isCharger(e) || e.state !== 1 || e.timer > 0.25) continue;
        const dx = P.x - e.x,
          dz = P.z - e.z;
        const along = dx * e.tx + dz * e.tz; // projection sur la ligne de charge
        const side = Math.abs(dx * e.tz - dz * e.tx);
        if (along > 0 && along < chargeOf(e).dist + 1 && side < e.r + 1) charged = true;
      }
      if (n > 0) {
        const l = Math.sqrt(cx * cx + cz * cz) || 1;
        out.mx = -cx / l;
        out.mz = -cz / l;
        // léger biais tangent pour ne pas foncer dans un mur d'ennemis
        out.mx += (-cz / l) * 0.35;
        out.mz += (cx / l) * 0.35;
      } else {
        // va vers la gemme la plus proche
        let bx = 0,
          bz = 0,
          bd = 1e9;
        for (let i = 0; i < w.gemCount; i++) {
          const g = w.gems[i];
          const d = (g.x - P.x) ** 2 + (g.z - P.z) ** 2;
          if (d < bd) {
            bd = d;
            bx = g.x;
            bz = g.z;
          }
        }
        if (bd < 1e9) {
          const l = Math.sqrt(bd) || 1;
          out.mx = (bx - P.x) / l;
          out.mz = (bz - P.z) / l;
        } else {
          out.mx = 1;
          out.mz = 0;
        }
      }
      // un coffre à portée attire plus qu'une gemme (évolutions, 3–5 cartes)
      let kx = 0,
        kz = 0,
        kd = chestR2;
      for (let i = 0; i < w.chestCount; i++) {
        const c = w.chests[i];
        const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
        if (d < kd) {
          kd = d;
          kx = c.x - P.x;
          kz = c.z - P.z;
        }
      }
      if (kd < chestR2) {
        const l = Math.sqrt(kd) || 1;
        const k = n > 0 ? pullFleeing * 1.5 : pullFree * 1.5;
        out.mx += (kx / l) * k;
        out.mz += (kz / l) * k;
      }
      // phase 35 : bonus au sol à portée, on va le chercher comme un coffre (il ne vient jamais seul)
      let qx = 0,
        qz = 0,
        qd = POWER_SEEK2;
      for (let i = 0; i < w.powerCount; i++) {
        const p = w.powers[i];
        const d = (p.x - P.x) ** 2 + (p.z - P.z) ** 2;
        if (d < qd) {
          qd = d;
          qx = p.x - P.x;
          qz = p.z - P.z;
        }
      }
      if (qd < POWER_SEEK2) {
        const l = Math.sqrt(qd) || 1;
        const k = n > 0 ? pullFleeing * 1.5 : pullFree * 1.5;
        out.mx += (qx / l) * k;
        out.mz += (qz / l) * k;
      }
      // échoppe du marchand à portée, de l'or et une place libre : on y va (pas si on vient d'en sortir)
      const M = w.merchant;
      if (M.active && !M.inside && canGainItem(w) && (M.rolled ? canAffordAny(w) : w.gold >= MERCHANT.price[0])) {
        const mx = M.x - P.x,
          mz = M.z - P.z,
          md = mx * mx + mz * mz;
        if (md < merchantR2) {
          const l = Math.sqrt(md) || 1;
          const k = n > 0 ? pullFleeing * 2 : pullFree * 2;
          out.mx += (mx / l) * k;
          out.mz += (mz / l) * k;
        }
      }
      // phase 18 : coffre de carte abordable à portée → on y va et on reste dessus le temps de l'ouvrir ;
      // sanctuaire à portée → on y va quand ce n'est pas la cohue, on reste dans le cercle tant que personne ne colle
      let stay = false;
      if (canOpenMapChest(w)) {
        let bd = mapChestR2,
          bx = 0,
          bz = 0;
        for (let i = 0; i < w.mapChests.length; i++) {
          const c = w.mapChests[i];
          if (c.open) continue;
          const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
          if (d < bd) {
            bd = d;
            bx = c.x - P.x;
            bz = c.z - P.z;
          }
        }
        if (bd < mapChestR2) {
          if (bd < MAPCHEST.r * MAPCHEST.r * 0.5 && close < 4) stay = true;
          else {
            const l = Math.sqrt(bd) || 1,
              k = n > 0 ? pullFleeing * 2.2 : pullFree * 2.2;
            out.mx += (bx / l) * k;
            out.mz += (bz / l) * k;
          }
        }
      }
      if (!stay && n < 8) {
        let bd = shrineR2,
          bx = 0,
          bz = 0;
        for (let i = 0; i < w.shrines.length; i++) {
          const s = w.shrines[i];
          if (s.used) continue;
          const d = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
          if (d < bd) {
            bd = d;
            bx = s.x - P.x;
            bz = s.z - P.z;
          }
        }
        if (bd < shrineR2) {
          if (bd < (SHRINE.r * 0.6) ** 2 && close < 2) stay = true;
          else {
            const l = Math.sqrt(bd) || 1,
              k = n > 0 ? pullFleeing * 1.6 : pullFree * 1.8;
            out.mx += (bx / l) * k;
            out.mz += (bz / l) * k;
          }
        }
      }
      // phase 48 : un joueur qui ne veut pas de difficulté ne reste pas dans un cercle de crâne ; le bot s'en écarte dès
      // que la jauge monte (mesuré sans cela : 3 parties sur 200 en activaient un par accident en tournant sur place)
      if (BOT_TUNE.skulls === 0)
        for (let i = 0; i < w.skulls.length; i++) {
          const s = w.skulls[i];
          if (s.on || s.charge <= 0) continue;
          const dx = P.x - s.x,
            dz = P.z - s.z,
            l = Math.hypot(dx, dz) || 1;
          out.mx += (dx / l) * pullFree * 4;
          out.mz += (dz / l) * pullFree * 4;
        }
      // phase 48 (--skulls N) : un crâne de difficulté toutes les BOT_TUNE.skullEvery s du monde, le plus proche d'abord
      if (!stay && BOT_TUNE.skulls > 0) {
        let on = 0,
          bd = 1e12,
          bx = 0,
          bz = 0;
        for (let i = 0; i < w.skulls.length; i++) {
          const s = w.skulls[i];
          if (s.on) {
            on++;
            continue;
          }
          const d = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
          if (d < bd) {
            bd = d;
            bx = s.x - P.x;
            bz = s.z - P.z;
          }
        }
        if (on < BOT_TUNE.skulls && bd < 1e12 && w.stageT >= BOT_TUNE.skullEvery * (on + 1)) {
          if (bd < (DIFFICULTY.skullR * 0.6) ** 2 && close < 4) stay = true;
          else {
            const l = Math.sqrt(bd) || 1,
              k = n > 0 ? pullFleeing * 3 : pullFree * 3;
            out.mx += (bx / l) * k;
            out.mz += (bz / l) * k;
          }
        }
      }
      // phase 48 (--boss-totems N) : les totems de boss, tôt dans le monde (ils valent pour les vagues à venir)
      if (!stay && BOT_TUNE.bossTotems > 0 && w.totem.state === 0 && w.stageT >= BOT_TUNE.bossTotemAt) {
        let on = 0,
          bd = 1e12,
          bx = 0,
          bz = 0;
        for (let i = 0; i < w.bossTotems.length; i++) {
          const b = w.bossTotems[i];
          if (b.on) {
            on++;
            continue;
          }
          const d = (b.x - P.x) ** 2 + (b.z - P.z) ** 2;
          if (d < bd) {
            bd = d;
            bx = b.x - P.x;
            bz = b.z - P.z;
          }
        }
        if (on < BOT_TUNE.bossTotems && bd < 1e12) {
          if (bd < (BOSSTOTEM.r * 0.6) ** 2 && close < 4) stay = true;
          else {
            const l = Math.sqrt(bd) || 1,
              k = n > 0 ? pullFleeing * 3 : pullFree * 3;
            out.mx += (bx / l) * k;
            out.mz += (bz / l) * k;
          }
        }
      } else if (BOT_TUNE.bossTotems === 0)
        // comme pour les crânes : le bot « moyen » ne reste pas dans un cercle de totem de boss
        for (let i = 0; i < w.bossTotems.length; i++) {
          const b = w.bossTotems[i];
          if (b.on || b.charge <= 0) continue;
          const dx = P.x - b.x,
            dz = P.z - b.z,
            l = Math.hypot(dx, dz) || 1;
          out.mx += (dx / l) * pullFree * 4;
          out.mz += (dz / l) * pullFree * 4;
        }
      // phase 37 : à l'heure prévue, le totem (on reste dans le cercle tant que personne ne colle), puis le portail
      const T = w.totem;
      const goTotem = T.state === 0 && w.stageT >= BOT_TUNE.totemAt;
      const goPortal = w.portal.open && !BOT_FARM && w.overT >= BOT_FARM_FOR;
      if (goTotem || goPortal) {
        const tx = T.x - P.x,
          tz = T.z - P.z,
          td = tx * tx + tz * tz;
        const inR = (goTotem ? STAGE.totemR : STAGE.portalR) * 0.6;
        if (td < inR * inR && (goPortal || close < 4)) stay = true;
        else {
          const l = Math.sqrt(td) || 1,
            k = n > 0 ? pullFleeing * 3 : pullFree * 3;
          out.mx += (tx / l) * k;
          out.mz += (tz / l) * k;
        }
      }
      if (stay) {
        out.mx = out.mz = 0;
      }
      // boss final : l'Arène a ses propres buts (sceaux, vrai boss, bord, zone sûre du Jugement)
      const judged = w.stage === ARENA && arenaMove(w, out);
      // attiré par la gemme la plus proche dans gemRadius (même en fuyant)
      let gx = 0,
        gz = 0,
        gd = gemR2;
      for (let i = 0; i < w.gemCount; i++) {
        const g = w.gems[i];
        const d = (g.x - P.x) ** 2 + (g.z - P.z) ** 2;
        if (d < gd) {
          gd = d;
          gx = g.x - P.x;
          gz = g.z - P.z;
        }
      }
      if (gd < gemR2 && !stay && !judged) {
        const l = Math.sqrt(gd) || 1;
        const k = n > 0 ? pullFleeing : pullFree;
        out.mx += (gx / l) * k;
        out.mz += (gz / l) * k;
      }
      // borne l'entrée à un vecteur unitaire (la sim normalise de toute façon au-delà de 1)
      const ml = Math.sqrt(out.mx * out.mx + out.mz * out.mz);
      if (ml > 1) {
        out.mx /= ml;
        out.mz /= ml;
      }
      // phase 19 : chaque sort a son moment (un joueur moyen n'attend pas la perfection, mais ne lance pas dans le vide)
      let cast: boolean;
      switch (w.spell) {
        case Spell.Tourbillon:
          cast = near3 >= 2;
          break;
        case Spell.Petard:
          cast = near3 >= 3 || hazard || charged;
          break;
        case Spell.Eclat:
          cast = near6 >= 5 || close >= 3;
          break;
        case Spell.Collet:
        case Spell.Bourse:
          // lancé vers le gros du danger : on vise la masse pour ce pas (la sim lance dans la direction de l'entrée)
          cast = near8 >= 4 && !judged; // pas pendant la course à la zone sûre du Jugement
          if (cast && P.spellCd <= 0) {
            const l = Math.sqrt(cx * cx + cz * cz) || 1;
            out.mx = cx / l;
            out.mz = cz / l;
          }
          break;
        case Spell.Voile:
          cast = close >= 3 || charged || P.hp < P.maxHp * 0.35;
          break;
        default: // Bond, Comète, Clignement : l'esquive de l'ancien dash
          cast = close >= 3 || charged;
      }
      out.spell = cast && P.spellCd <= 0;
      out.jump = (diving || hazard || blocked || close >= 3) && P.onGround && !out.spell;
      // phase 27 : le bot de référence ne glisse pas (la glisse reste un bonus d'adresse) ; avec BOT_SLIDE, il glisse
      // dans les descentes — naïvement, il fonce alors dans la horde (survie maxée 9:50 contre 10:23 sans glisse)
      if (BOT_SLIDE) {
        const mlen = Math.hypot(out.mx, out.mz);
        const along = mlen > 0.5 ? slopeAlong(w.height, P.x, P.z, out.mx, out.mz) : 0;
        out.slide = P.onGround && mlen > 0.5 && (P.sliding ? along > 0.03 : along < -0.08); // appui : lance ou relève
      }
    },
    pick(w, cards) {
      if (r.next() < randomness) return r.int(cards.length);
      return Math.max(
        0,
        bestCard(w, cards, () => true),
      );
    },
    shop: shopPick,
  };
}

/**
 * Plafond : même pilotage qu'« average » mais va chercher gemmes et coffres de plus loin et plus fort,
 * pick optimal sans aléa.
 */
export function makeGreedy(seed: number): Bot {
  return makeAverage(seed, {
    name: 'greedy',
    randomness: 0,
    gemRadius: 14,
    gemPullFleeing: 1.0,
    gemPullFree: 1.6,
    chestRadius: 22,
    merchantRadius: 24,
    mapChestRadius: 30,
    shrineRadius: 24,
  });
}

export function makeBot(name: string, seed: number): Bot {
  if (name === 'naive') return naive;
  if (name === 'greedy') return makeGreedy(seed);
  return makeAverage(seed);
}
