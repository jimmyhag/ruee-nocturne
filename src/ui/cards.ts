// Libellés du contenu (armes, passifs, évolutions, ennemis, personnages, boutique, succès) : la sim ne porte que
// des clés (PLAN.md §4.2), les textes vivent ici, dans les deux langues. Aucun DOM : testable sous Vitest.
import type { Achievement } from '../meta/achievements';
import { CHARACTERS, ENEMIES, EVOLVE, SHOP } from '../sim/balance';
import type { Card, CharacterKey, PassiveKey, WeaponKey } from '../sim/types';
import { EVOLUTIONS, WEAPONS } from '../sim/weapons/defs';
import { fmtNum, fmtTime, t } from '../i18n';

export const weaponName = (k: WeaponKey): string => t(`weapon.${k}.name`);
export const passiveName = (k: PassiveKey): string => t(`passive.${k}.name`);
export const passiveText = (k: PassiveKey): string => t(`passive.${k}.text`);
/** Nom de l'évolution d'une arme, ou « Évolution » si elle n'en a pas. */
export const evolutionName = (k: WeaponKey): string => (EVOLUTIONS[k] ? t(`evo.${k}.name`) : t('card.evolution'));
export const characterName = (k: CharacterKey): string => t(`char.${k}.name`);
export const characterText = (k: CharacterKey): string => t(`char.${k}.text`);
/** Passif signature du personnage (phase 6) : nom et règle ; chaîne vide pour l'Éclaireuse. */
export const characterTrait = (k: CharacterKey): string => (k === 'eclaireuse' ? '' : t(`char.${k}.trait`));
/** Nom d'un ennemi par son type (index dans ENEMIES). */
export const enemyName = (type: number): string => t(`enemy.${ENEMIES[type].key}`);
export const shopName = (i: number): string => t(`shop.${SHOP.lines[i].key}.name`);
export const shopText = (i: number): string => t(`shop.${SHOP.lines[i].key}.text`);
export const achName = (a: Achievement): string => t(`ach.${a.id}.name`);
/** Le texte « Vaincs 2 000 ennemis » prend l'objectif en paramètre quand il est grand (format du nombre). */
export const achText = (a: Achievement): string => t(`ach.${a.id}.text`, { n: a.goal });
export const achUnlock = (a: Achievement): string => t(`ach.${a.id}.unlock`);

/** Description d'une arme à un niveau donné : gabarit paramétré par ses stats (pluriels compris). */
export function weaponText(k: WeaponKey, lv: number): string {
  const s = WEAPONS[k].stats(lv);
  switch (k) {
    case 'orbe':
      return t('weapon.orbe.text', { n: s.n, dmg: s.dmg, pierce: s.pierce > 1 ? t('weapon.orbe.pierce') : '' });
    case 'aura':
      return t('weapon.aura.text', { r: +s.r.toFixed(1), dmg: s.dmg });
    case 'lames':
      return t('weapon.lames.text', { n: s.n, dmg: s.dmg });
    case 'foudre':
      return t('weapon.foudre.text', { n: s.chain + 1, dmg: s.dmg });
    case 'boomerang':
      return t('weapon.boomerang.text', { n: s.n, range: s.range, dmg: s.dmg });
    case 'mines':
      return t('weapon.mines.text', {
        n: s.n,
        dmg: s.dmg,
        r: +s.r.toFixed(1),
        chain: s.chain ? t('weapon.mines.chain') : '',
      });
  }
}

/** Description d'une évolution (valeurs lues dans balance.ts, jamais recopiées). */
export function evolutionText(k: WeaponKey): string {
  switch (k) {
    case 'orbe':
      return t('evo.orbe.text', { n: EVOLVE.nova.n });
    case 'aura':
      return t('evo.aura.text', {
        rMul: EVOLVE.soleil.rMul,
        dmgMul: EVOLVE.soleil.dmgMul,
        heal: EVOLVE.soleil.healPerKill,
      });
    case 'lames':
      return t('evo.lames.text', { mul: EVOLVE.tempete.spdMul });
    case 'foudre':
      return t('evo.foudre.text', { div: EVOLVE.orage.cdDiv, plus: EVOLVE.orage.chainPlus });
    default:
      return '';
  }
}

export function cardTitle(c: Card): string {
  if (c.kind === 'w') return weaponName(c.key as WeaponKey);
  if (c.kind === 's') return passiveName(c.key as PassiveKey);
  if (c.kind === 'e') return evolutionName(c.key as WeaponKey);
  return t('card.heal');
}
export function cardText(c: Card): string {
  if (c.kind === 'w') return weaponText(c.key as WeaponKey, c.lv);
  if (c.kind === 's') return passiveText(c.key as PassiveKey);
  if (c.kind === 'e') return evolutionText(c.key as WeaponKey);
  return t('card.healText');
}

/** Valeur d'un succès (temps ou compteur) dans la langue courante. */
export const achValue = (a: Achievement, v: number): string => (a.time ? fmtTime(v) : fmtNum(v));

/** Personnage par clé (cartes du menu). */
export const characterDef = (k: CharacterKey) => CHARACTERS.find((c) => c.key === k);
