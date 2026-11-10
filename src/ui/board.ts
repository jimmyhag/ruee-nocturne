// Écran Classement (phase 38) : rendu DOM natif à partir d'un état. Ne connaît ni Firebase ni la sauvegarde : main.ts
// charge les lignes (src/platform/account.ts, joueurs connectés seulement), tient l'état et appelle renderBoard.
import { BOARD_VIEWS, stageOfBest, timeOfBest } from '../meta/board';
import type { BoardRow, BoardView, ScoreDoc } from '../meta/board';
import { fmtNum, fmtTime, t } from '../i18n';
import { CHARACTERS } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import { characterName } from './cards';

/** out : pas connecté (aucun chargement de Firebase) ; nopseudo : connecté sans pseudo ; unavailable : comptes absents. */
export type BoardStatus = 'out' | 'nopseudo' | 'loading' | 'ready' | 'error' | 'unavailable';
export interface BoardState {
  status: BoardStatus;
  view: BoardView;
  week: boolean; // « cette semaine » au lieu de « tous les temps »
  uid: string;
  rows: BoardRow[];
  mine: ScoreDoc | null;
}
export function initialBoardState(): BoardState {
  return { status: 'out', view: 'best', week: false, uid: '', rows: [], mine: null };
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isChar = (k: string): k is CharacterKey => CHARACTERS.some((c) => c.key === k);

/** Valeur affichée d'une vue : « Monde 3 · 24:10 » (ou « 3 mondes · … »), « 27:42 », « 3 412 ». */
export function boardValue(view: BoardView, v: number): string {
  if (view === 'time') return fmtTime(v);
  if (view === 'kills') return fmtNum(v);
  const stage = stageOfBest(v),
    time = fmtTime(timeOfBest(v));
  return stage >= 4 ? t('board.won', { time }) : t('board.stage', { n: stage, time });
}

export function renderBoard(s: BoardState): void {
  const live = s.status === 'ready' || s.status === 'loading' || s.status === 'error';
  $('boardInvite').hidden = s.status !== 'out' && s.status !== 'unavailable';
  $('boardInviteText').textContent = t(s.status === 'unavailable' ? 'board.unavailable' : 'board.signIn');
  $('boardAccountBtn').hidden = s.status === 'unavailable';
  $('boardPseudo').hidden = s.status !== 'nopseudo';
  $('boardLive').hidden = !live;
  for (const b of $('boardTabs').querySelectorAll<HTMLButtonElement>('[data-view]')) {
    const on = b.dataset.view === s.view;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', String(on));
  }
  $('boardAll').classList.toggle('selected', !s.week);
  $('boardWeek').classList.toggle('selected', s.week);
  $('boardAll').setAttribute('aria-pressed', String(!s.week));
  $('boardWeek').setAttribute('aria-pressed', String(s.week));
  const msg = $('boardMsg');
  msg.textContent =
    s.status === 'loading'
      ? t('board.loading')
      : s.status === 'error'
        ? t('board.error')
        : s.status === 'ready' && s.rows.length === 0
          ? t(s.week ? 'board.emptyWeek' : 'board.empty')
          : '';
  msg.classList.toggle('error', s.status === 'error');
  const list = $('boardList');
  if (s.status !== 'ready') {
    list.innerHTML = '';
    $('boardMine').textContent = '';
    return;
  }
  let mineShown = false;
  list.innerHTML = s.rows
    .map((r, i) => {
      const me = r.uid === s.uid;
      if (me) mineShown = true;
      const who = isChar(r.char) ? characterName(r.char) : '';
      return (
        `<li class="brow${me ? ' me' : ''}"><b class="rank">${i + 1}</b>` +
        `<span class="who"><span class="name">${esc(r.name)}</span><small>${esc(who)}</small></span>` +
        `<span class="val">${esc(boardValue(s.view, r.value))}</span></li>`
      );
    })
    .join('');
  // hors du top : ton meilleur score rappelé sous la liste
  const mine = s.mine;
  $('boardMine').textContent =
    !mineShown && mine ? t('board.mine', { value: boardValue(s.view, mine[s.view]) }) : !mine ? t('board.none') : '';
}

/** Vue suivante d'un clic sur un onglet (clé `data-view`), ou celle d'avant si la clé est inconnue. */
export function viewOf(key: string | undefined, prev: BoardView): BoardView {
  return (BOARD_VIEWS as readonly string[]).includes(key ?? '') ? (key as BoardView) : prev;
}
