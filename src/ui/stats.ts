// Phase 47 (demande de Jimmy) : fiche des stats du héros. Tous les bonus de sanctuaire montent une de ces stats ; pour
// choisir, il faut voir où on en est. Lue par l'écran de pause (toutes les lignes) et par les cartes de sanctuaire
// (« Vol de vie : 2 % → 3 % »). Construite à l'ouverture d'un écran, jamais dans la boucle de jeu.
import { ITEM, It } from '../sim/balance';
import { fmtNum, t } from '../i18n';
import { healCap } from '../sim/items';
import { boonApply } from '../sim/poi';
import type { BoonKey, Player } from '../sim/types';
import type { World } from '../sim/world';

type Group = 'survie' | 'attaque' | 'mouvement' | 'sort' | 'butin';
/** n : entier ; d1 : une décimale ; pct : part → « 12 % » ; mul : multiplicateur → « 108 % » ; x : « ×2,15 ». */
type Fmt = 'n' | 'd1' | 'pct' | 'mul' | 'x';
interface StatRow {
  key: string;
  group: Group;
  fmt: Fmt;
  get: (P: Player, w: World) => number;
}

const GROUPS: Group[] = ['survie', 'attaque', 'mouvement', 'sort', 'butin'];
export const STAT_ROWS: StatRow[] = [
  { key: 'hp', group: 'survie', fmt: 'n', get: (P) => P.maxHp },
  { key: 'regen', group: 'survie', fmt: 'd1', get: (P) => P.regen },
  { key: 'armor', group: 'survie', fmt: 'pct', get: (P) => P.armor },
  // vol de vie : celui du héros (tome Sang, sanctuaires) plus celui des objets
  {
    key: 'steal',
    group: 'survie',
    fmt: 'pct',
    get: (P, w) =>
      P.steal +
      ITEM.croc.steal * w.itemEff[It.Croc] +
      ITEM.couronne.steal * w.itemEff[It.Couronne] +
      ITEM.fiole.steal * w.itemEff[It.Fiole],
  },
  { key: 'healcap', group: 'survie', fmt: 'd1', get: (_P, w) => healCap(w) },
  { key: 'dmg', group: 'attaque', fmt: 'mul', get: (P) => P.dmgMul },
  { key: 'crit', group: 'attaque', fmt: 'pct', get: (P) => P.crit },
  { key: 'critdmg', group: 'attaque', fmt: 'x', get: (P) => P.critMul },
  { key: 'elite', group: 'attaque', fmt: 'mul', get: (P) => P.eliteDmgMul },
  { key: 'cd', group: 'attaque', fmt: 'mul', get: (P) => P.cdMul },
  { key: 'size', group: 'attaque', fmt: 'mul', get: (P) => P.sizeMul },
  { key: 'proj', group: 'attaque', fmt: 'n', get: (P) => P.projAdd },
  { key: 'speed', group: 'mouvement', fmt: 'd1', get: (P) => P.speed },
  { key: 'jump', group: 'mouvement', fmt: 'mul', get: (P) => P.jumpMul },
  { key: 'spell', group: 'sort', fmt: 'mul', get: (P) => P.spellCdMul },
  { key: 'spellpow', group: 'sort', fmt: 'mul', get: (P) => P.spellPow },
  { key: 'luck', group: 'butin', fmt: 'd1', get: (P) => P.luck },
  { key: 'magnet', group: 'butin', fmt: 'd1', get: (P) => P.magnet },
  { key: 'xp', group: 'butin', fmt: 'mul', get: (P) => P.xpMul },
  { key: 'gold', group: 'butin', fmt: 'mul', get: (P) => P.goldMul },
  // phase 48 : difficulté de la partie (crânes, tome de difficulté) : 100 % au départ
  { key: 'difficulty', group: 'butin', fmt: 'pct', get: (P) => P.difficulty }, // phase 50 : 0 % = normal
];
const ROW: Record<string, StatRow> = Object.fromEntries(STAT_ROWS.map((r) => [r.key, r]));

function show(fmt: Fmt, v: number): string {
  switch (fmt) {
    case 'n':
      return fmtNum(Math.round(v));
    case 'd1':
      return fmtNum(Math.round(v * 10) / 10);
    case 'pct':
    case 'mul':
      return `${fmtNum(Math.round(v * 100))} %`;
    case 'x':
      return `×${fmtNum(Math.round(v * 100) / 100)}`;
  }
}

/** Texte d'une stat du héros, par sa clé (« 12 % », « ×2,15 », « 6,4 »). */
export const statValue = (key: string, w: World, P: Player = w.player): string =>
  show(ROW[key].fmt, ROW[key].get(P, w));
export const statName = (key: string): string => t(`stats.${key}`);

/** Carte de sanctuaire : « Vol de vie : 2 % → 3 % ». Le bonus est appliqué à une copie du héros. */
export function boonNow(w: World, key: BoonKey): string {
  const q = { ...w.player };
  boonApply(q, key);
  return t('boon.now', { name: statName(key), a: statValue(key, w), b: statValue(key, w, q) });
}

/** Fiche de stats (écran de pause) : une colonne par famille. */
export function statsHTML(w: World): string {
  return GROUPS.map((g) => {
    const rows = STAT_ROWS.filter((r) => r.group === g)
      .map((r) => `<li><span>${statName(r.key)}</span><b>${statValue(r.key, w)}</b></li>`)
      .join('');
    return `<div class="statgroup g-${g}"><h4>${t(`stats.g.${g}`)}</h4><ul>${rows}</ul></div>`;
  }).join('');
}
