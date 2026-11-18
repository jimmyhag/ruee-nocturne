// Accueil « Nocturne » (docs/specs/ui-nocturne.md ; maquettes Main, Menu-Premiere-ouverture, Menu-Reprendre) :
// puce de profil, or, carrousel de héros (portrait, nom, « arme · sort » ou condition, points), prochain objectif,
// onglets atténués à la première ouverture. Rendu au retour au menu et à chaque changement (jamais par frame).
import { CHARACTERS } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import { nextGoal, progress, unlockedCharacters } from '../meta/achievements';
import type { Meta } from '../meta/save';
import { fmtNum, t } from '../i18n';
import { achName, achText, characterName } from './cards';
import { achProgressText, achReward, avatarSrc, bestLine, esc, heroCondition, heroKit, portraitSrc } from './meta-ui';

const $ = (id: string) => document.getElementById(id)!;

/** Onglets fermés tant qu'aucune partie n'est finie (lot L2, `Meta.reveal` = 0 ; décision 10). */
export const LOCKED_TABS = ['shopBtn', 'libBtn', 'boardBtn'] as const;
export const tabsLocked = (m: Meta): boolean => m.reveal === 0;

/** Héros voisin dans le carrousel (`dir` = ±1), en boucle. */
export function stepHero(k: CharacterKey, dir: number): CharacterKey {
  const n = CHARACTERS.length;
  const i = CHARACTERS.findIndex((c) => c.key === k);
  return CHARACTERS[(i + dir + n) % n].key;
}

/** Rend l'accueil pour le héros regardé `view`. Retourne true si ce héros est verrouillé (« Jouer » indisponible). */
export function renderHome(m: Meta, view: CharacterKey): boolean {
  // profil : avatar du héros choisi, record ; le nom vient du compte (src/ui/account.ts)
  ($('profileAvatar') as HTMLImageElement).src = avatarSrc(m.character);
  $('bestLine').textContent = bestLine(m);
  const gold = fmtNum(Math.round(m.gold));
  const g = $('menuGold');
  g.lastElementChild!.textContent = gold;
  g.setAttribute('aria-label', t('menu.goldAria', { n: gold }));
  // carrousel
  const open = unlockedCharacters(m).includes(view);
  const img = $('heroPortrait') as HTMLImageElement;
  const src = portraitSrc(view);
  if (!img.src.endsWith(src)) img.src = src;
  img.alt = open ? characterName(view) : t('char.lockedName', { name: characterName(view) });
  img.classList.toggle('locked', !open);
  $('heroName').textContent = characterName(view);
  const sub = $('heroSub');
  if (open) {
    const k = heroKit(view);
    sub.innerHTML = `<span>${esc(k.weapon)}</span><i class="mid" aria-hidden="true">·</i><span>${esc(k.spell)}</span>`;
  } else sub.innerHTML = `<i class="lockico" aria-hidden="true"></i><span>${esc(heroCondition(view))}</span>`;
  $('heroDots').innerHTML = CHARACTERS.map((c) => `<i${c.key === view ? ' class="on"' : ''}></i>`).join('');
  // prochain objectif (décision 9) ; première ouverture : « Première nuit — Survis 3 minutes » (décision 10)
  const a = nextGoal(m);
  const btn = $('goalBtn');
  btn.hidden = a === null;
  if (a) {
    const first = m.reveal === 0;
    const val = first ? achText(a) : achProgressText(a, m);
    const rew = achReward(a);
    $('goalName').textContent = achName(a);
    $('goalVal').textContent = val;
    ($('goalBar') as HTMLElement).style.width = `${Math.max(2, Math.round(progress(a, m) * 100))}%`;
    $('goalRew').textContent = rew;
    btn.setAttribute(
      'aria-label',
      t(rew ? 'menu.goalAria' : 'menu.goalAriaPlain', { name: achName(a), value: val, reward: rew }),
    );
  }
  // onglets atténués et inactifs à la première ouverture ; ouverts dès la première partie finie
  const locked = tabsLocked(m);
  for (const id of LOCKED_TABS) $(id).setAttribute('aria-disabled', String(locked));
  return !open;
}
