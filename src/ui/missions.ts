// Lot L3 : bloc « Missions du jour » du menu (trois lignes avec filet de progression, « Fait » quand c'est rempli) et texte
// d'une mission, repris par l'écran de fin. DOM natif, sans interaction (sauf le repli natif de <details>).
import { t } from '../i18n';
import { missionGold } from '../meta/missions';
import type { Mission } from '../meta/missions';
import type { Meta } from '../meta/save';
import type { CharacterKey, WeaponKey } from '../sim/types';
import { characterName, weaponName } from './cards';
import { esc } from './meta-ui';

/** « Élimine 500 ennemis en une partie », « Joue une partie avec la Sorcière »… */
export function missionText(ms: Mission): string {
  if (ms.k === 'char') return t('mission.char', { char: characterName(ms.p as CharacterKey) });
  if (ms.k === 'weapon') return t('mission.weapon', { weapon: weaponName(ms.p as WeaponKey) });
  return t(`mission.${ms.k}`, { n: ms.goal });
}

/**
 * Missions du jour : une ligne par mission au style du prochain objectif de l'accueil (interface Nocturne) : texte et
 * avancement en lanterne, filet de 2 px, or de la mission ; « Fait » quand c'est rempli. Note « terminées » à la fin.
 */
export function renderMissions(list: HTMLElement, count: HTMLElement, done: HTMLElement, m: Meta): void {
  const ms = m.missions.list;
  const n = ms.filter((x) => x.done).length;
  count.textContent = `${n}/${ms.length}`;
  done.hidden = ms.length === 0 || n < ms.length;
  list.innerHTML = ms
    .map((x) => {
      const p = Math.min(1, x.prog / x.goal);
      const state = x.done ? esc(t('mission.done')) : `${x.prog}/${x.goal}`;
      return `<div class="mission${x.done ? ' done' : ''}" data-k="${x.k}"><div class="gt"><span>${esc(missionText(x))}</span><span>${state}</span></div><span class="prog"><i style="width:${(p * 100).toFixed(0)}%"></i></span><div class="rw"><i class="coin" aria-hidden="true"></i>+${esc(t('gold', { n: missionGold(x) }))}</div></div>`;
    })
    .join('');
}
