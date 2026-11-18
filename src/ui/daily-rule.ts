// Défi v2 (docs/specs/defi-v2.md, décisions 2, 4 et 12) : textes de la règle du jour et des médailles. Les chiffres
// d'une règle viennent de DAILY_RULES (réglés par la simulation) : la phrase dit toujours la valeur jouée.
import { DAILY_RULE_KEYS, DAILY_RULES } from '../sim/balance';
import { dailyWeapon } from '../meta/daily';
import { fmtTime, t } from '../i18n';
import { weaponName } from './cards';

const pc = (x: number): number => Math.round(Math.abs(x - 1) * 100);

/** Nom de la règle `rule` (index dans DAILY_RULE_KEYS) ; '' sans règle. */
export function ruleName(rule: number): string {
  const k = DAILY_RULE_KEYS[rule];
  return k ? t(`rule.${k}.name`) : '';
}

/** Phrase de la règle `rule` le jour `day` (Arme imposée : l'arme de ce jour-là) ; '' sans règle. */
export function ruleText(rule: number, day: string): string {
  const k = DAILY_RULE_KEYS[rule];
  if (!k) return '';
  const R = DAILY_RULES[k];
  switch (k) {
    case 'swift':
      return t('rule.swift.text', { n: pc(R.spd) });
    case 'elites':
      return t('rule.elites.text', { n: R.elitePeriod, time: fmtTime(R.eliteFirst) });
    case 'swarm':
      return t('rule.swarm.text', { more: pc(R.rate), hp: pc(R.hp) });
    case 'glass':
      return t('rule.glass.text', { hp: pc(R.heroHp), dmg: pc(R.heroDmg) });
    case 'giants':
      return t('rule.giants.text', { hp: pc(R.hp), less: pc(R.rate) });
    case 'armory':
      return t('rule.armory.text', { weapon: weaponName(dailyWeapon(day)) });
  }
}

/** « Médaille d'argent » (0 : ''). */
export function medalName(medal: number): string {
  return medal >= 1 && medal <= 3 ? t(`medal.full.${medal}`) : '';
}

/** Écran « Défi réussi ! » : ce qui reste à faire pour les médailles suivantes (bronze : deux lignes, argent : une). */
export function medalNext(medal: number): string[] {
  const out: string[] = [];
  if (medal < 2) out.push(t('victory.dailyNext.2'));
  if (medal < 3) out.push(t('victory.dailyNext.3'));
  return out;
}
