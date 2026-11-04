// Libellés du contenu (armes, tomes, lignes de stats, ennemis, personnages, boutique, succès) : la sim ne porte que
// des clés (PLAN.md §4.2), les textes vivent ici, dans les deux langues. Aucun DOM : testable sous Vitest.
import type { Achievement } from '../meta/achievements';
import { CHARACTERS, ENEMIES, SHOP, TOMES, WEAPON_LINES } from '../sim/balance';
import type { StatLine } from '../sim/balance';
import type { Card, CharacterKey, TomeKey, WeaponKey } from '../sim/types';
import type { World } from '../sim/world';
import { weaponStats } from '../sim/weapons/defs';
import { fmtNum, fmtTime, t } from '../i18n';

export const weaponName = (k: WeaponKey): string => t(`weapon.${k}.name`);
export const tomeName = (k: TomeKey): string => t(`tome.${k}.name`);
export const tomeText = (k: TomeKey): string => t(`tome.${k}.text`);
export const characterName = (k: CharacterKey): string => t(`char.${k}.name`);
export const characterText = (k: CharacterKey): string => t(`char.${k}.text`);
/** Passif signature du personnage (phase 6) : nom et règle ; chaîne vide pour l'Éclaireuse. */
export const characterTrait = (k: CharacterKey): string => (k === 'eclaireuse' ? '' : t(`char.${k}.trait`));
/** Nom d'un ennemi par son type (index dans ENEMIES). */
export const enemyName = (type: number): string => t(`enemy.${ENEMIES[type].key}`);
export const shopName = (i: number): string => t(`shop.${SHOP.lines[i].key}.name`);
/** Texte d'une ligne de boutique, paramétré par sa valeur par palier (balance.ts) : jamais recopié. */
export const shopText = (i: number): string => {
  const l = SHOP.lines[i];
  const pct = l.key === 'dmg' || l.key === 'speed' || l.key === 'gold' || l.key === 'magnet' || l.key === 'cd';
  return t(`shop.${l.key}.text`, { n: pct ? +(l.per * 100).toFixed(1) : l.per, max: +(l.per * l.tiers).toFixed(2) });
};
export const achName = (a: Achievement): string => t(`ach.${a.id}.name`);
/** Le texte « Vaincs 2 000 ennemis » prend l'objectif en paramètre quand il est grand (format du nombre). */
export const achText = (a: Achievement): string => t(`ach.${a.id}.text`, { n: a.goal });
export const achUnlock = (a: Achievement): string => t(`ach.${a.id}.unlock`);

/** Valeur affichée d'une ligne : « +7 % », « −4 % », « +1 », « +8 », « +0,25 ». */
function lineValue(l: StatLine): string {
  if (l.kind === 'pct' || (l.kind === 'add' && Math.abs(l.step) < 1 && l.stat !== 'regen' && l.stat !== 'luck')) {
    const v = Math.round(l.step * 100);
    return `${v > 0 ? '+' : '−'}${Math.abs(v)} %`;
  }
  return `${l.step > 0 ? '+' : '−'}${fmtNum(Math.abs(l.step))}`;
}
/** Texte d'une ligne de stat (arme : `line.w.<stat>`, tome : `line.t.<stat>`), ex. « +7 % dégâts », « +1 projectile ». */
export function lineText(kind: 'w' | 't', l: StatLine): string {
  return t(`line.${kind}.${l.stat}`, { v: lineValue(l) });
}
/** Les lignes d'une carte, dans l'ordre (vide pour un soin). */
export function cardLines(c: Card): string[] {
  const out: string[] = [];
  if (c.kind === 'heal') return out;
  const lines = c.kind === 'w' ? WEAPON_LINES[c.key as WeaponKey] : TOMES[c.key as TomeKey];
  for (const s of [c.s0, c.s1, c.s2]) if (s >= 0) out.push(lineText(c.kind, lines[s]));
  return out;
}
export function cardTitle(c: Card): string {
  if (c.kind === 'w') return weaponName(c.key as WeaponKey);
  if (c.kind === 't') return tomeName(c.key as TomeKey);
  return t('card.heal');
}
/** Corps d'une carte : les lignes séparées par « · » (nouvelle arme ou nouveau tome : sa règle d'abord). */
export function cardText(c: Card): string {
  if (c.kind === 'heal') return t('card.healText');
  const lines = cardLines(c).join(' · ');
  if (c.lv === 1) return `${c.kind === 'w' ? t(`weapon.${c.key}.text`) : tomeText(c.key as TomeKey)} — ${lines}`;
  return lines;
}
/** Nom de la rareté d'une carte (1 ligne : commune, 2 : rare, 3 : épique). */
export const rarityName = (n: number): string => t(`card.rarity.${Math.max(1, Math.min(3, n))}`);

/** Résumé des stats courantes d'une arme possédée (inventaire, écran de mort) : gabarit paramétré par ses stats. */
export function weaponSummary(w: World, k: WeaponKey): string {
  const s = weaponStats(w, k);
  switch (k) {
    case 'orbe':
      return t('weapon.orbe.stats', { n: s.n, dmg: Math.round(s.dmg), pierce: s.pierce });
    case 'aura':
      return t('weapon.aura.stats', { r: +s.r.toFixed(1), dmg: Math.round(s.dmg) });
    case 'lames':
      return t('weapon.lames.stats', { n: s.n, dmg: Math.round(s.dmg) });
    case 'foudre':
      return t('weapon.foudre.stats', { n: s.chain + 1, dmg: Math.round(s.dmg) });
    case 'boomerang':
      return t('weapon.boomerang.stats', { n: s.n, range: Math.round(s.range), dmg: Math.round(s.dmg) });
    case 'mines':
      return t('weapon.mines.stats', { n: s.n, dmg: Math.round(s.dmg), r: +s.r.toFixed(1) });
  }
}

/** Valeur d'un succès (temps ou compteur) dans la langue courante. */
export const achValue = (a: Achievement, v: number): string => (a.time ? fmtTime(v) : fmtNum(v));

/** Personnage par clé (cartes du menu). */
export const characterDef = (k: CharacterKey) => CHARACTERS.find((c) => c.key === k);
