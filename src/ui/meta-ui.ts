// Écrans de méta en DOM natif : personnages, boutique, succès, réglages, progression de l'écran de mort.
// Rendus à l'ouverture d'un écran (jamais par frame) : innerHTML est acceptable ici.
import { CHARACTERS, SHOP } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import { ACHIEVEMENTS, closest, progress, unlockedCharacters } from '../meta/achievements';
import type { Achievement } from '../meta/achievements';
import type { Meta } from '../meta/save';
import { shopCost } from '../meta/shop';
import { fmtTime } from './hud';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Cartes de personnages du menu : le choisi est marqué, les verrouillés affichent leur condition. */
export function renderCharacters(container: HTMLElement, m: Meta): void {
  const unlocked = unlockedCharacters(m);
  container.innerHTML = CHARACTERS.map((c) => {
    const open = unlocked.includes(c.key);
    const ach = c.unlock ? ACH_BY_ID.get(c.unlock) : undefined;
    const cond = !open && ach ? `<span class="badge">${esc(ach.text)}</span>` : open ? '' : '';
    const sel = m.character === c.key ? ' selected' : '';
    return `<button class="card char${open ? '' : ' locked'}${sel}" data-char="${c.key}" ${open ? '' : 'aria-disabled="true"'}>
      <div class="top"><span class="glyph" style="background:${open ? 'var(--accent)' : 'var(--ink-3)'}">${open ? '✦' : '🔒'}</span><h3>${esc(c.name)}</h3></div>
      ${cond}<p>${esc(c.text)}</p></button>`;
  }).join('');
}

/** Lignes de la boutique : palier courant, coût du suivant, bouton d'achat (désactivé si l'or manque). */
export function renderShop(container: HTMLElement, m: Meta): void {
  container.innerHTML = SHOP.lines
    .map((l, i) => {
      const tier = m.shop[i] ?? 0;
      const cost = shopCost(i, tier);
      const max = !Number.isFinite(cost);
      const pips = Array.from({ length: l.tiers }, (_, k) => `<i class="${k < tier ? 'on' : ''}"></i>`).join('');
      const btn = max
        ? '<span class="badge">Max</span>'
        : `<button class="ghost buy" data-line="${i}" ${m.gold < cost ? 'disabled' : ''}>${cost} or</button>`;
      return `<div class="shoprow"><div><h3>${esc(l.name)}</h3><p>${esc(l.text)}</p><div class="pips">${pips}</div></div>${btn}</div>`;
    })
    .join('');
}

function bar(a: Achievement, m: Meta): string {
  const p = progress(a, m);
  const v = a.get(m.stats);
  const txt = a.fmt ? `${a.fmt(Math.min(v, a.goal))} / ${a.fmt(a.goal)}` : `${Math.min(v, a.goal)} / ${a.goal}`;
  const done = m.achievements.includes(a.id);
  return `<div class="ach${done ? ' done' : ''}"><div class="achtop"><b>${esc(a.name)}</b><span>${done ? 'Obtenu' : txt}</span></div>
    <p>${esc(a.text)}${a.unlockText ? ` · <em>débloque ${esc(a.unlockText)}</em>` : ''}</p>
    <div class="bar"><i style="width:${(p * 100).toFixed(0)}%"></i></div></div>`;
}

/** Tous les succès, obtenus en bas. */
export function renderAchievements(container: HTMLElement, m: Meta): void {
  const sorted = [...ACHIEVEMENTS].sort(
    (a, b) => Number(m.achievements.includes(a.id)) - Number(m.achievements.includes(b.id)),
  );
  container.innerHTML = sorted.map((a) => bar(a, m)).join('');
}

/** Écran de mort : les n succès les plus proches. */
export function renderProgress(container: HTMLElement, m: Meta, n = 3): void {
  container.innerHTML = closest(m, n)
    .map((a) => bar(a, m))
    .join('');
}

/** Ligne de record du menu. */
export function bestLine(m: Meta): string {
  return m.bestTime > 0
    ? `Record : ${fmtTime(m.bestTime)} · ${m.bestKills} vaincus · ${m.runs} run${m.runs > 1 ? 's' : ''} · ${Math.round(m.gold)} or`
    : "Aucun record pour l'instant";
}

export function characterName(key: CharacterKey): string {
  return CHARACTERS.find((c) => c.key === key)?.name ?? key;
}
