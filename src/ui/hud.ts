import {
  ARENA,
  BOSSTOTEM,
  DIFFICULTY,
  ENEMIES,
  ITEM_KEYS,
  ITEM_RARITY,
  LEVEL_MAX,
  MAPCHEST,
  POWER,
  POWER_KEYS,
  REVEAL,
  SHRINE,
  SPELL_KEYS,
  STAGE,
} from '../sim/balance';
import { PAL } from '../render/palette';
import { canGainItem, maxCopies } from '../sim/items';
import { mapChestPrice } from '../sim/poi';
import { enemyIntensity, type Intensity } from '../sim/spawner';
import { stageLeft, totemLocked } from '../sim/stages';
import { heartShielded } from '../sim/final';
import { spellCooldown } from '../sim/spells';
import { Role } from '../sim/types';
import type { BoonKey, Card, ItemKey, TomeKey, WeaponKey } from '../sim/types';
import { cardSynergy } from '../sim/synergies';
import { TOME_LOOK, WEAPONS } from '../sim/weapons/defs';
import { BOON_ICON, ITEM_ICON, POWER_ICON, SPELL_ICON, TOME_ICON, WEAPON_ICON } from './icons';
import { boonNow, multQuant, multText } from './stats';

const PAL_POWER = PAL.power;
import type { World } from '../sim/world';
import { fmtTime, onLangChange, t, fmtNum } from '../i18n';
import {
  BOON_GLYPH,
  ITEM_GLYPH,
  RARITY_COLOR,
  cardLines,
  cardText,
  cardTitle,
  enemyName,
  itemName,
  rarityName,
  spellName,
  synergyName,
  synergyText,
  tomeName,
  weaponName,
} from './cards';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type FlashKind = 'hurt' | 'gold' | 'skull'; // phase 48 : crâne de difficulté activé
export type BannerTone = 'reward' | 'danger' | 'info';

/** HUD en DOM : toute écriture passe par un cache pour ne toucher le DOM que si la valeur change. */
/** Phase 37 : textes de la puce d'objectif, par sorte (1 totem, 2 boss, 3 portail, 4 fermé). */
const GOAL_KEYS = ['', 'goal.totem', 'goal.boss', 'goal.portal', '', 'goal.nextBoss'];

export class Hud {
  private cache: Record<string, string | number | boolean | undefined> = {};
  /** Noms de boss précalculés dans la langue courante : aucune chaîne construite par frame. */
  private bossNames: string[] = [];
  private heartName = '';
  private foes: Intensity = { hp: 1, dmg: 1, spd: 1, rate: 1 }; // phase 53 : rempli par enemyIntensity, jamais réalloué
  private els = {
    diffLbl: $('diffLbl'),
    foesLbl: $('foesLbl'),
    foesTxt: $('foesTxt'),
    bossXLbl: $('bossXLbl'),
    xpfill: $('xpfill'),
    xpsweep: $('xpsweep'),
    hpfill: $('hpfill'),
    hpghost: $('hpghost'),
    hptxt: $('hptxt'),
    lvl: $('lvl'),
    time: $('time'),
    kills: $('kills'),
    killsBox: $('killsBox'),
    goldN: $('goldN'),
    goldBox: $('goldBox'),
    bossbar: $('bossbar'),
    bossname: $('bossname'),
    bossfill: $('bossfill'),
    kit: $('kit'),
    gear: $('gear'),
    timeBox: $('timeBox'),
    stageLbl: $('stageLbl'),
    beatLbl: $('beatLbl'), // lot L4 : « À battre : 5:00 · 412 » sous le chrono du défi d'un ami
    goalChip: $('goalChip'),
    goalArrow: $('goalArrow'),
    goalText: $('goalText'),
    goalDist: $('goalDist'),
    merchantChip: $('merchantChip'),
    merchantArrow: $('merchantArrow'),
    merchantDist: $('merchantDist'),
    poiChip: $('poiChip'),
    poiText: $('poiText'),
    poiNote: $('poiNote'),
    poiFill: $('poiFill'),
    spellbar: $('spellbar'),
    spellSec: $('spellSec'),
    spellKey: $('spellKey'),
    spellGlyph: $('spellGlyph'),
    spellName: $('spellName'),
    btnSpell: $('btnSpell'),
    btnSlide: $('btnSlide'),
    slideKey: $('slideKey'),
    flash: $('flash'),
    banner: $('banner'),
    perf: $('perf'),
    powers: $('powers'),
  };
  /** Phase 35 : une pastille par bonus à durée (index Pw ; l'Aimant, instantané, n'en a pas). */
  private pw: { box: HTMLElement; bar: HTMLElement }[] = [];
  private pwOn = new Uint8Array(POWER_KEYS.length);
  private pwW = new Int16Array(POWER_KEYS.length).fill(-1);
  private spellGlyphChar = '✦'; // icône du sort de la classe (remplacée par les secondes pendant la recharge)
  private bannerT = 0;
  private lastKillTens = 0;
  private killPopT = 0;
  private goldPopT = 0;
  private lastXp = 0;
  private lastSweep = 0;
  private flashT = 0; // flash d'écran ponctuel (doré) en cours
  private flashKind: FlashKind = 'hurt';
  /** Atténuation des flashs (mode « réduction des effets ») : 1 = plein, 0,4 = atténué. */
  flashMul = 1;

  constructor() {
    for (let k = 0; k < POWER_KEYS.length; k++) {
      const box = document.createElement('div');
      box.className = 'pw';
      box.dataset.k = POWER_KEYS[k];
      box.style.setProperty('--pc', '#' + PAL_POWER[k].toString(16).padStart(6, '0'));
      box.innerHTML = POWER_ICON[POWER_KEYS[k]];
      const bar = document.createElement('i');
      box.appendChild(bar);
      box.hidden = true;
      this.els.powers.appendChild(box);
      this.pw.push({ box, bar });
    }
    this.relabel();
    onLangChange(() => this.relabel());
  }
  /** Recalcule les libellés qui dépendent de la langue (changement à chaud depuis les réglages). */
  relabel(): void {
    this.bossNames = ENEMIES.map((_, i) => enemyName(i).toUpperCase());
    this.heartName = t('boss.heart').toUpperCase(); // 1.68.0 : le boss final
    delete this.cache.bossname;
    delete this.cache.bossKey; // phase 48 : la barre (« nom +n ») et la pastille « Boss +n » se réécrivent
    delete this.cache.bossX;
    delete this.cache.foes; // phase 53 : « Ennemis ×… » suit la langue
  }

  reset(): void {
    this.cache = {};
    this.lastKillTens = 0;
    this.killPopT = 0;
    this.goldPopT = 0;
    this.lastXp = 0;
    this.lastSweep = 0;
    this.flashT = 0;
    this.els.killsBox.classList.remove('pop');
    for (let k = 0; k < this.pw.length; k++) {
      this.pw[k].box.hidden = true;
      this.pwOn[k] = 0;
      this.pwW[k] = -1;
    }
    this.els.goldBox.classList.remove('pop');
  }
  /**
   * Lot L4 : rappel discret du score à battre sous le chrono ('' : aucun). Écrit au départ de la partie (et au changement
   * de langue), jamais par image.
   */
  setBeat(text: string): void {
    this.els.beatLbl.hidden = text === '';
    this.els.beatLbl.textContent = text;
  }
  private text(k: keyof typeof this.els, v: string): void {
    if (this.cache[k] !== v) {
      this.cache[k] = v;
      this.els[k].textContent = v;
    }
  }
  /**
   * Phase 37 : puce d'objectif du monde, sous le chrono. Totem à activer ou portail ouvert : flèche et distance ;
   * boss appelé : « Tue le boss » ; chrono écoulé sans passage : le message d'alerte. Chaînes construites au changement.
   */
  /** Partie guidée : le totem n'est pas encore un objectif (le guide le montre à son étape, ou à 8:00). */
  goalHold = false;
  private goal(w: World): void {
    const T = w.totem,
      P = w.player;
    // 0 rien, 1 totem, 2 boss, 3 portail, 5 monde infini : prochaine vague de boss (phase 39) ; 4 (totem fermé) n'existe
    // plus depuis la 1.45.2 : le totem reste actif après la fin du chrono
    const kind = w.endless ? 5 : w.portal.open ? 3 : T.state === 0 ? (this.goalHold ? 0 : 1) : T.state === 1 ? 2 : 0;
    if (this.cache.goal !== kind) {
      this.cache.goal = kind;
      this.cache.gDeg = this.cache.gDist = undefined;
      const el = this.els.goalChip;
      el.hidden = kind === 0;
      el.className = 'goal g' + kind;
      this.els.goalText.textContent = kind === 0 || kind === 5 ? '' : t(GOAL_KEYS[kind]);
      this.els.goalArrow.hidden = kind !== 1 && kind !== 3;
      this.els.goalDist.hidden = kind !== 1 && kind !== 3;
    }
    if (kind === 5) {
      const s = Math.max(0, Math.ceil(w.nextEndlessBoss - w.endlessT));
      if (this.cache.gNext !== s) {
        this.cache.gNext = s;
        this.els.goalText.textContent = t('goal.nextBoss', { time: fmtTime(s) });
      }
      return;
    }
    if (kind !== 1 && kind !== 3) return;
    const dx = T.x - P.x,
      dz = T.z - P.z,
      deg = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI / 5) * 5,
      d = Math.round(Math.sqrt(dx * dx + dz * dz));
    if (this.cache.gDeg !== deg) {
      this.cache.gDeg = deg;
      this.els.goalArrow.style.transform = `rotate(${deg}deg)`;
    }
    if (this.cache.gDist !== d) {
      this.cache.gDist = d;
      this.els.goalDist.textContent = d + ' m';
    }
  }
  private width(k: keyof typeof this.els, f: number): void {
    const v = Math.round(Math.max(0, Math.min(1, f)) * 200) / 2 + '%';
    if (this.cache[k] !== v) {
      this.cache[k] = v;
      this.els[k].style.width = v;
    }
  }

  update(w: World, hurtT: number, now: number, dt: number): void {
    const P = w.player;
    this.width('xpfill', P.xp / P.need);
    // éclat blanc qui balaie la barre à un gain notable (≥ 5 % du niveau), au plus toutes les 300 ms
    const xpRatio = P.xp / P.need;
    if (xpRatio - this.lastXp >= 0.05 && now - this.lastSweep > 0.3) {
      this.lastSweep = now;
      this.xpSweep();
    }
    if (xpRatio < this.lastXp || now - this.lastSweep > 0.3) this.lastXp = xpRatio;
    this.width('hpfill', P.hp / P.maxHp);
    // phase 17 : le marchand est là, flèche vers l'échoppe (l'écran regarde vers −z : « haut » = −z) et distance
    const M = w.merchant;
    const showM = M.active && !M.inside;
    if (this.cache.mOn !== showM) {
      this.cache.mOn = showM;
      this.els.merchantChip.hidden = !showM;
    }
    if (showM) {
      const dx = M.x - P.x,
        dz = M.z - P.z,
        deg = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI / 5) * 5;
      if (this.cache.mDeg !== deg) {
        this.cache.mDeg = deg;
        this.els.merchantArrow.style.transform = `rotate(${deg}deg)`;
      }
      // la chaîne n'est construite que si la distance ou les secondes changent (zéro allocation par frame)
      const md = Math.round(Math.sqrt(dx * dx + dz * dz)),
        ms = Math.ceil(M.until - w.stageT); // phase 37 : le marchand suit le chrono du monde
      if (this.cache.mDist !== md || this.cache.mSecs !== ms) {
        this.cache.mDist = md;
        this.cache.mSecs = ms;
        this.text('merchantDist', `${md} m · ${ms} s`);
      }
    }
    // phase 18 : coffre de carte ou sanctuaire tout proche : prix (ou pourquoi on ne peut pas) et jauge d'ouverture
    let kind = 0, // 0 rien, 1 coffre, 2 sanctuaire, 3 piste chronométrée, 4 totem du boss
      fill = 0,
      best = 36; // 6 u²
    for (let i = 0; i < w.mapChests.length; i++) {
      const c = w.mapChests[i];
      if (c.open) continue;
      const d2 = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
      if (d2 < best) {
        best = d2;
        kind = 1;
        fill = c.hold / MAPCHEST.hold;
      }
    }
    const sr2 = (SHRINE.r + 2) ** 2;
    for (let i = 0; i < w.shrines.length; i++) {
      const s = w.shrines[i];
      if (s.used) continue;
      const d2 = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
      if (d2 < sr2 && (kind === 0 || d2 < best)) {
        best = d2;
        kind = 2;
        fill = s.charge / SHRINE.charge;
      }
    }
    // 1.45.2 : totem du boss pas encore activé, tout proche : jauge d'activation, comme un sanctuaire
    const T = w.totem;
    // partie guidée (décision 15) : verrouillé avant son tour, pas de jauge (elle contredirait « Pas encore »)
    if (!w.endless && T.state === 0 && !totemLocked(w)) {
      const d2 = (T.x - P.x) ** 2 + (T.z - P.z) ** 2;
      if (d2 < (STAGE.totemR + 2) ** 2 && (kind === 0 || d2 < best)) {
        kind = 4;
        fill = T.charge / STAGE.totemCharge;
      }
    }
    // phase 48 : crâne de difficulté tout proche : ce qu'il fera, et sa jauge
    const kr2 = (DIFFICULTY.skullR + 2) ** 2;
    for (let i = 0; i < w.skulls.length; i++) {
      const s = w.skulls[i];
      if (s.on) continue;
      const d2 = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
      if (d2 < kr2 && (kind === 0 || d2 < best)) {
        best = d2;
        kind = 5;
        fill = s.charge / DIFFICULTY.skullCharge;
      }
    }
    // phase 48 : totem de boss tout proche (tant qu'il sert : pas une fois le portail ouvert)
    if (!w.endless && T.state !== 2) {
      const br2 = (BOSSTOTEM.r + 2) ** 2;
      for (let i = 0; i < w.bossTotems.length; i++) {
        const b = w.bossTotems[i];
        if (b.on) continue;
        const d2 = (b.x - P.x) ** 2 + (b.z - P.z) ** 2;
        if (d2 < br2 && (kind === 0 || d2 < best)) {
          best = d2;
          kind = 6;
          fill = b.charge / BOSSTOTEM.charge;
        }
      }
    }
    // phase 28 : piste chronométrée en cours (prioritaire) : secondes restantes et jauge du temps
    let raceT = -1;
    for (let i = 0; i < w.races.length; i++)
      if (w.races[i].state === 1) {
        raceT = w.races[i].t;
        fill = Math.max(0, w.races[i].t / w.races[i].time);
        kind = 3;
      }
    if (this.cache.poiOn !== kind) {
      this.els.poiChip.hidden = kind === 0;
      this.els.poiChip.classList.toggle('shrine', kind === 2);
      this.els.poiChip.classList.toggle('race', kind === 3);
      this.els.poiChip.classList.toggle('totem', kind === 4);
      this.els.poiChip.classList.toggle('skull', kind === 5);
      this.els.poiChip.classList.toggle('bosstotem', kind === 6);
      this.els.poiNote.hidden = kind !== 4; // 1.66.0 (décision 18) : la règle du totem, sur sa propre ligne
      if (kind !== 1) this.els.poiChip.classList.remove('poor'); // « pas assez d'or » ne vaut que pour un coffre
    }
    if (kind === 3) {
      const tenths = Math.max(0, Math.ceil(raceT * 10));
      if (this.cache.poiKey !== -100 - tenths) {
        this.cache.poiKey = -100 - tenths;
        this.els.poiText.textContent = t('race.left', { s: fmtNum(tenths / 10) });
      }
    }
    if (kind === 1) {
      // l'état (prix, pas assez d'or, aucun objet possible) ne change que rarement : la chaîne n'est reconstruite qu'à ce moment
      const price = mapChestPrice(w),
        full = !canGainItem(w), // aucun objet possible (tous bannis) : le coffre donne un bonus (phase 18)
        poor = w.gold < price,
        key = price * 4 + (full ? 1 : 0) + (poor ? 2 : 0);
      if (this.cache.poiKey !== key || this.cache.poiOn !== kind) {
        this.cache.poiKey = key;
        const g = t('gold', { n: price });
        this.els.poiText.textContent = poor
          ? t('mapchest.poor', { gold: g })
          : full
            ? t('mapchest.boon', { gold: g })
            : t('mapchest.price', { gold: g });
        this.els.poiChip.classList.toggle('poor', poor);
      }
    } else if ((kind === 2 || kind === 4) && this.cache.poiOn !== kind) {
      this.cache.poiKey = -1;
      this.els.poiText.textContent = t(kind === 2 ? 'shrine.title' : 'totem.title');
      if (kind === 4) this.els.poiNote.textContent = t('totem.note');
      this.els.poiChip.classList.remove('poor');
    }
    // difficulté de la partie (phase 48) : sous la barre de PV, dès qu'elle dépasse 100 %
    const diff = Math.round(P.difficulty * 100);
    if (kind === 5 && (this.cache.poiOn !== kind || this.cache.poiKey !== diff)) {
      this.cache.poiKey = diff;
      this.els.poiText.textContent = t('skull.chip', {
        from: diff, // phase 50 : 0 % = difficulté normale
        to: diff + Math.round(DIFFICULTY.skullStep * 100),
      });
      this.els.poiChip.classList.remove('poor');
    }
    if (kind === 6 && this.cache.poiOn !== kind) {
      this.cache.poiKey = -2;
      this.els.poiText.textContent = t('bosstotem.chip');
      this.els.poiChip.classList.remove('poor');
    }
    // boss en plus par vague dans ce monde (totems de boss activés) ; 1.68.0 : pas dans l'Arène (ceux du monde 3
    // valent pour le monde infini qui la suit, pas pour le boss final)
    const bossX = w.stage === ARENA ? 0 : w.bossExtra;
    if (this.cache.bossX !== bossX) {
      this.cache.bossX = bossX;
      this.els.bossXLbl.hidden = bossX === 0;
      this.els.bossXLbl.textContent = t('hud.bossExtra', { n: w.bossExtra });
    }
    if (this.cache.diff !== diff) {
      this.cache.diff = diff;
      this.els.diffLbl.hidden = false; // phase 50 : affichée dès 0 %, elle monte sans plafond
      this.els.diffLbl.textContent = t('hud.difficulty', { n: diff });
    }
    // phase 53 (demande de Jimmy) : intensité des monstres, « Ennemis ×2,4 » = leurs PV par rapport au début de partie.
    // Le texte n'est refait que quand la valeur affichée change (multQuant) : aucune chaîne construite par image,
    // même en prolongation où les PV montent de plusieurs dixièmes par image
    const foes = multQuant(enemyIntensity(w, this.foes).hp);
    if (this.cache.foes !== foes) {
      this.cache.foes = foes;
      const x = multText(foes);
      this.els.foesLbl.hidden = false;
      this.els.foesTxt.textContent = x;
      this.els.foesLbl.setAttribute('aria-label', t('hud.enemies', { x })); // sur téléphone le mot est masqué
    }
    this.cache.poiOn = kind;
    if (kind !== 0) this.width('poiFill', fill);
    // fantôme de PV : rattrape en 400 ms (transition CSS) → lisibilité de la quantité perdue
    this.width('hpghost', P.hp / P.maxHp);
    const hpShown = Math.ceil(Math.max(0, P.hp));
    if (this.cache.hpShown !== hpShown || this.cache.hpMax !== P.maxHp) {
      this.cache.hpShown = hpShown;
      this.cache.hpMax = P.maxHp;
      this.els.hptxt.textContent = hpShown + ' / ' + P.maxHp; // construite seulement quand les PV affichés changent
    }
    this.text('lvl', String(P.level));
    // phase 37 : « Monde 2 », chrono qui descend ; après 0:00, le dépassement en rouge (+0:45)
    const arena = w.stage === ARENA && !w.endless;
    const stageKey = w.endless ? -1 : w.dailyEnd > 0 ? -2 : w.stage;
    if (this.cache.stage !== stageKey) {
      this.cache.stage = stageKey;
      // phase 39 : monde infini ; lot L3 : défi du jour (son chrono de 5:00 descend) ; 1.68.0 : l'Arène, sans chrono
      this.els.stageLbl.textContent = w.endless
        ? t('hud.endless')
        : w.dailyEnd > 0
          ? t('hud.daily')
          : arena
            ? t('hud.arena')
            : t('hud.stage', { n: w.stage + 1 });
    }
    const over = !w.endless && w.overT > 0;
    if (this.cache.over !== over) {
      this.cache.over = over;
      this.els.timeBox.classList.toggle('over', over);
    }
    // phase 39 : en monde infini, le temps tenu compte vers le haut ; défi v2 : après les 5:00 du défi, le temps total
    // (c'est le score du jour), plus le compte à rebours
    const secs = w.endless
      ? Math.floor(w.dailyEnd > 0 ? w.t : w.endlessT)
      : arena
        ? Math.floor(w.arenaT) // l'Arène : le temps passé face au boss final compte vers le haut
        : over
          ? Math.floor(w.overT)
          : Math.ceil(stageLeft(w));
    if (this.cache.secs !== secs) {
      this.cache.secs = secs;
      this.els.time.textContent = over ? '+' + fmtTime(secs) : fmtTime(secs);
    }
    this.goal(w);
    this.text('kills', String(w.kills));
    // or de la partie : la chaîne n'est construite que quand le montant affiché change ; petit « pop » à chaque gain
    const gold = Math.floor(w.gold);
    if (this.cache.gold !== gold) {
      const gained = typeof this.cache.gold === 'number' && gold > this.cache.gold;
      this.cache.gold = gold;
      this.els.goldN.textContent = String(gold);
      if (gained) {
        this.goldPopT = 0.12;
        this.els.goldBox.classList.add('pop');
      }
    } else if (this.goldPopT > 0) {
      this.goldPopT -= dt;
      if (this.goldPopT <= 0) this.els.goldBox.classList.remove('pop');
    }
    const tens = Math.floor(w.kills / 10);
    if (tens !== this.lastKillTens) {
      this.lastKillTens = tens;
      this.killPopT = 0.15;
      this.els.killsBox.classList.add('pop');
    } else if (this.killPopT > 0) {
      this.killPopT -= dt;
      if (this.killPopT <= 0) this.els.killsBox.classList.remove('pop');
    }
    const bossOn = w.bossIndex >= 0 && w.enemies[w.bossIndex].alive;
    if (this.cache.boss !== bossOn) {
      this.cache.boss = bossOn;
      this.els.bossbar.hidden = !bossOn;
    }
    if (bossOn) {
      const b = w.enemies[w.bossIndex];
      this.width('bossfill', b.hp / b.max);
      // phase 48 : plusieurs boss à la fois (totems de boss, boss de survie encore en vie) : la barre en suit un et dit
      // combien il en reste d'autres. 1.68.0 : le Cœur de la Nuit, ses trois seuils marqués, gris tant qu'il est
      // invulnérable (« · invulnérable » : pause d'un changement de phase, sceaux debout)
      const heart = b.role === Role.Heart,
        shield = heart && heartShielded(w);
      const others = heart ? 0 : (w.endless ? w.endlessAlive : w.survivalAlive + w.totemAlive) - 1;
      const key = heart ? (shield ? -2 : -1) : b.type * 16 + Math.max(0, others);
      if (this.cache.bossKey !== key) {
        this.cache.bossKey = key;
        this.els.bossbar.classList.toggle('final', heart);
        this.els.bossbar.classList.toggle('shield', shield);
        this.els.bossname.textContent = heart
          ? shield
            ? t('boss.shielded', { name: this.heartName })
            : this.heartName
          : others > 0
            ? t('boss.more', { name: this.bossNames[b.type], n: others })
            : this.bossNames[b.type];
      }
    }
    // phase 35 : bonus actifs, pastille visible et barre de durée (écrite par pas de 2 %)
    for (let k = 1; k < this.pw.length; k++) {
      const left = w.powerT[k];
      const on = left > 0 ? 1 : 0;
      if (on !== this.pwOn[k]) {
        this.pwOn[k] = on;
        this.pw[k].box.hidden = !on;
      }
      if (!on) continue;
      const pct = Math.round((left / POWER.dur[k]) * 50) * 2;
      if (pct !== this.pwW[k]) {
        this.pwW[k] = pct;
        this.pw[k].bar.style.width = pct + '%';
      }
    }
    const cd = P.spellCd > 0 ? 1 - P.spellCd / spellCooldown(w) : 1; // phase 19 : sort de classe
    const cdv = cd.toFixed(2);
    if (this.cache.cd !== cdv) {
      this.cache.cd = cdv;
      this.els.btnSpell.style.setProperty('--cd', cdv);
      this.els.spellbar.style.width = cd * 100 + '%';
    }
    // phase 22 : secondes restantes (texte changé au plus une fois par seconde)
    const sec = P.spellCd > 0 ? Math.ceil(P.spellCd) : 0;
    if (this.cache.sec !== sec) {
      this.cache.sec = sec;
      if (sec > 0) this.els.spellGlyph.textContent = String(sec);
      else this.els.spellGlyph.innerHTML = this.spellGlyphChar; // icône du sort (au plus une fois par seconde)
      this.els.spellSec.textContent = sec > 0 ? `${sec} s` : '';
      this.els.btnSpell.classList.toggle('cooling', sec > 0);
    }
    // flash d'écran : rouge tant que le joueur est touché, sinon flash ponctuel (doré) en fondu
    let op = 0;
    if (hurtT > 0) {
      op = 0.55 * this.flashMul;
      this.setFlashKind('hurt');
    } else if (this.flashT > 0) {
      this.flashT -= dt;
      op = Math.max(0, this.flashT / 0.35) * 0.5 * this.flashMul;
      this.setFlashKind(this.flashKind);
    }
    const opv = Math.round(op * 20) / 20;
    if (this.cache.fl !== opv) {
      this.cache.fl = opv;
      this.els.flash.style.opacity = String(opv);
    }
  }
  private setFlashKind(k: FlashKind): void {
    if (this.cache.flk !== k) {
      this.cache.flk = k;
      this.els.flash.classList.toggle('gold', k === 'gold');
      this.els.flash.classList.toggle('skull', k === 'skull');
    }
  }
  /** Phase 35 : la pastille du bonus ramassé saute (relancée même si l'effet était déjà actif). */
  powerFlash(k: number): void {
    const b = this.pw[k]?.box;
    if (!b || k === 0) return;
    b.classList.remove('pop');
    void b.offsetWidth; // relance l'animation CSS
    b.classList.add('pop');
  }
  /** Flash d'écran ponctuel (boss vaincu : doré). */
  flash(kind: FlashKind): void {
    this.flashKind = kind;
    this.flashT = 0.35;
  }

  xpSweep(): void {
    const s = this.els.xpsweep;
    s.classList.remove('go');
    void s.offsetWidth;
    s.classList.add('go');
  }

  kit(w: World): void {
    // phase 19 : bouton et touche du sort au nom du sort de la classe
    const sk = SPELL_KEYS[w.spell];
    this.spellGlyphChar = SPELL_ICON[sk];
    this.els.spellGlyph.innerHTML = SPELL_ICON[sk];
    this.cache.sec = -1; // affichage des secondes à refaire avec le nouveau symbole
    this.els.spellName.textContent = spellName(sk).toUpperCase();
    this.els.spellKey.textContent = spellName(sk);
    this.els.btnSpell.setAttribute('aria-label', spellName(sk));
    // lot L2 : bouton GLISSE et sa touche masqués tant que la glisse n'est pas dévoilée (la sim la refuse)
    const slide = w.reveal >= REVEAL.slide;
    this.els.btnSlide.hidden = !slide;
    this.els.slideKey.hidden = !slide;
    const parts: string[] = [];
    // phase 38 : armes et objets dans la barre d'équipement en bas de l'écran ; en haut, les tomes et les synergies
    fitGear(this.els.gear, w);
    for (const k in w.tomes)
      parts.push(
        `<span style="color:var(--muted)">${TOME_ICON[k as TomeKey]}${tomeName(k as TomeKey)} ${w.tomes[k as TomeKey]}</span>`,
      );
    for (let i = 0; i < w.syn.length; i++)
      if (w.syn[i]) parts.push(`<span class="syn" title="${synergyText(i)}">✦ ${synergyName(i)}</span>`);
    this.els.kit.innerHTML = parts.join('');
  }

  /** Une bannière est affichée (phase 51 : une annonce secondaire attend son tour au lieu de l'écraser). */
  get bannerOn(): boolean {
    return this.els.banner.classList.contains('on');
  }
  /**
   * Bannière ; `tone` : sa couleur dit le sens (interface Nocturne, décision 16 : lanterne récompense, nuée danger, lune
   * information) ; `sub` : seconde ligne plus petite sous le titre (lot L2 : « Nouveau ! » puis le système et quoi faire).
   */
  banner(txt: string, tone: BannerTone = 'reward', sub = '', ms = 1800): void {
    const b = this.els.banner;
    b.classList.toggle('danger', tone === 'danger');
    b.classList.toggle('info', tone === 'info');
    if (sub) {
      const kick = document.createElement('span');
      kick.className = 'kick';
      kick.textContent = txt;
      const line = document.createElement('small');
      line.textContent = sub;
      b.replaceChildren(kick, line);
    } else b.textContent = txt;
    b.classList.toggle('two', sub !== '');
    b.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = window.setTimeout(() => b.classList.remove('on'), ms);
  }

  perf(lines: string): void {
    this.els.perf.textContent = lines;
  }
  showPerf(on: boolean): void {
    this.els.perf.hidden = !on;
  }
}

/**
 * Lot L2 : dans `root`, masque ce qui porte `data-reveal="n"` tant que moins de n étapes sont dévoilées (aide, légende
 * de la carte) : ne pas montrer ce qui n'existe pas encore.
 */
export function showRevealed(root: HTMLElement, reveal: number): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-reveal]')) el.hidden = reveal < Number(el.dataset.reveal);
}

/**
 * Barre d'équipement (phase 38) : armes (icône + niveau), un séparateur, objets (icône sur pastille de rareté, « ×n »
 * à partir de deux exemplaires). `hide` : nombre des plus anciens objets regroupés en « +n ». Reconstruite au changement
 * d'équipement seulement (kit), jamais par image.
 */
/** Objets encore portés, dans l'ordre d'obtention : une Plume de phénix consommée n'y est plus (tableau réutilisé). */
const held: number[] = [];
function heldItems(w: World): number[] {
  held.length = 0;
  for (const i of w.itemOrder) if (w.items[i] > w.itemUsed[i]) held.push(i);
  return held;
}
export function gearHtml(w: World, hide = 0): string {
  let s = '';
  for (const k in w.weapons) {
    const lv = w.weapons[k as WeaponKey]!,
      max = lv >= LEVEL_MAX.weapon, // phase 43 : niveau plafonné, marqué
      name = max
        ? t('gear.max', { name: `${weaponName(k as WeaponKey)} ${lv}` })
        : `${weaponName(k as WeaponKey)} ${lv}`;
    const tier = w.wtier[k as WeaponKey]; // lot L5 : liseré à la couleur du palier visuel (index.html, .gw.tier1..3)
    s += `<span class="gi gw${tier > 0 ? ` tier${tier}` : ''}" title="${name}" aria-label="${name}">${WEAPON_ICON[k as WeaponKey]}<b${max ? ' class="max"' : ''}>${lv}</b></span>`;
  }
  const order = heldItems(w);
  if (order.length === 0) return s;
  s += '<i class="gsep"></i>';
  if (hide > 0) s += `<span class="gi gmore">+${hide}</span>`;
  for (let k = hide; k < order.length; k++) {
    const i = order[k],
      key = ITEM_KEYS[i],
      n = w.items[i] - w.itemUsed[i], // ce qu'il reste : un exemplaire consommé ne s'affiche plus
      max = w.items[i] >= maxCopies(i), // phase 43 : exemplaires plafonnés par la rareté (consommés compris)
      base = itemName(key) + (n > 1 ? ` ×${n}` : ''),
      name = max ? t('gear.max', { name: base }) : base;
    s += `<span class="gi git" title="${name}" aria-label="${name}" style="--r:${RARITY_COLOR[ITEM_RARITY[i]]}">${ITEM_ICON[key]}${n > 1 || max ? `<b${max ? ' class="max"' : ''}>×${n}</b>` : ''}</span>`;
  }
  return s;
}

/**
 * Remplit la barre d'équipement sur `--rows` rangées au plus (CSS : 2 sur PC, 3 au doigt, où la place à côté des
 * boutons est étroite) : au-delà, les plus anciens objets passent dans « +n ».
 */
function fitGear(el: HTMLElement, w: World): void {
  el.innerHTML = gearHtml(w);
  const first = el.firstElementChild as HTMLElement | null;
  if (!first || el.hidden) return; // caché (menu) : mesuré au prochain affichage (fixed : pas d'offsetParent)
  const row = first.offsetHeight + 3,
    rows = Number(getComputedStyle(el).getPropertyValue('--rows')) || 2;
  if (el.scrollHeight <= row * rows + 2) return;
  // estimation en une mesure (pastilles par rangée × rangées, moins le séparateur et la pastille « +n »), puis
  // ajustement fin : en pratique zéro ou une réécriture de plus (relecture perf : plus un reflow par objet masqué)
  const perRow = Math.max(1, Math.floor((el.clientWidth + 3) / (first.offsetWidth + 3)));
  const cells = el.childElementCount - 1; // le séparateur est étroit
  const count = heldItems(w).length;
  let hide = Math.min(count, Math.max(2, cells - perRow * rows + 2));
  el.innerHTML = gearHtml(w, hide);
  while (el.scrollHeight > row * rows + 2 && hide < count) el.innerHTML = gearHtml(w, ++hide);
}

/**
 * Cartes de choix (montée de niveau, coffre, marchand). `w` : marque « Synergie » sur une carte qui en complète une ;
 * `shop` : prix et état d'achat (or de la partie, place libre).
 */
export function renderCards(
  container: HTMLElement,
  cards: Card[],
  w?: World,
  shop?: { gold: number; full: boolean },
): void {
  container.classList.toggle('four', cards.length === 4); // phase 47 : deux rangées de deux
  container.innerHTML = cards
    .map((c, i) => {
      let glyph = '+',
        icon = '',
        color = '#7ee0a1',
        badge = `<span class="badge">${t('card.bonus')}</span>`;
      const syn = w ? cardSynergy(w, c) : -1;
      const synBadge =
        syn >= 0 ? `<span class="badge syn">${t('card.synergy', { name: synergyName(syn) })}</span>` : '';
      let price = '',
        off = false;
      if (c.kind === 'i') {
        glyph = ITEM_GLYPH[c.key as ItemKey];
        icon = ITEM_ICON[c.key as ItemKey];
        color = RARITY_COLOR[c.lv];
        // phase 38 : cumul ; phase 43 : « max » quand cet exemplaire est le dernier possible
        const idx = ITEM_KEYS.indexOf(c.key as ItemKey),
          top = c.s2 >= maxCopies(idx),
          n = c.s2 - (w ? w.itemUsed[idx] : 0); // ce qu'on portera : les Plumes de phénix consommées ne comptent plus
        badge = `<span class="badge new item">${top ? t('card.itemMax', { n }) : n > 1 ? t('card.itemStack', { n }) : t('card.item')}</span>`;
        if (shop) {
          const sold = c.s1 === 1;
          off = sold || shop.full || shop.gold < c.s0;
          price = `<span class="badge price${off ? ' off' : ''}">${sold ? t('merchant.sold') : t('gold', { n: c.s0 })}</span>`;
        }
      } else if (c.kind === 'b') {
        glyph = BOON_GLYPH[c.key as BoonKey];
        icon = BOON_ICON[c.key as BoonKey];
        color = '#5fd3ff';
        badge = `<span class="badge new boon">${t('card.boon')}</span>`;
      } else if (c.kind === 'w') {
        const d = WEAPONS[c.key as WeaponKey];
        glyph = d.glyph;
        icon = WEAPON_ICON[c.key as WeaponKey];
        color = d.color;
        badge =
          c.lv === 1
            ? `<span class="badge new weapon">${t('card.newWeapon')}</span>`
            : `<span class="badge">${t('card.level', { n: c.lv })}</span>`;
      } else if (c.kind === 't') {
        const d = TOME_LOOK[c.key as TomeKey];
        glyph = d.glyph;
        icon = TOME_ICON[c.key as TomeKey];
        color = d.color;
        badge =
          c.lv === 1
            ? `<span class="badge new">${t('card.newTome')}</span>`
            : `<span class="badge">${t('card.level', { n: c.lv })}</span>`;
      }
      // rareté = nombre de lignes (objet : sa rareté) ; interface Nocturne : pastille et libellé (commune, rare, épique)
      const tier = c.kind === 'heal' ? 0 : c.kind === 'i' ? c.lv + 1 : Math.min(3, c.n);
      const rarity = tier >= 3 ? ' epic' : tier === 2 ? ' rare' : '';
      const rb = tier > 0 ? `<span class="rar${rarity}">${rarityName(tier)}</span>` : '';
      const lines = cardLines(c);
      const intro =
        c.lv === 1 && c.kind !== 'i' && c.kind !== 'b'
          ? `<p>${c.kind === 'w' ? t(`weapon.${c.key}.text`) : t(`tome.${c.key}.text`)}</p>`
          : '';
      // phase 47 : un bonus de sanctuaire dit où en est la stat (« Vol de vie : 2 % → 3 % »)
      const now = c.kind === 'b' && w ? `<p class="now">${boonNow(w, c.key as BoonKey)}</p>` : '';
      const body =
        c.kind === 'heal' || c.kind === 'i' || c.kind === 'b'
          ? `<p>${cardText(c)}</p>${now}`
          : `${intro}<ul class="lines">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
      // phase 17 : la carte qui complète une synergie dit ce qu'elle débloque
      const synLine = syn >= 0 ? `<p class="synline">✦ ${synergyText(syn)}</p>` : '';
      return `<button class="card${rarity}${off ? ' off' : ''}" data-i="${i}" ${off ? 'aria-disabled="true"' : ''}><div class="top"><span class="glyph" style="color:${color}" aria-label="${glyph}">${icon || glyph}</span><h3>${cardTitle(c)}</h3><kbd>${i + 1}</kbd></div><div class="badges">${badge}${rb}${synBadge}${price}</div>${body}${synLine}</button>`;
    })
    .join('');
}

/** Flash de sélection d'une carte (classe CSS `picked`), avant la fermeture de l'écran. */
export function flashCard(container: HTMLElement, i: number): void {
  const el = container.children[i] as HTMLElement | undefined;
  el?.classList.add('picked');
}
