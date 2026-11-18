// Écran Classement (phase 38) : rendu DOM natif à partir d'un état. Ne connaît ni Firebase ni la sauvegarde : main.ts
// charge les lignes (src/platform/account.ts, joueurs connectés seulement), tient l'état et appelle renderBoard.
// Lot L4 : onglet « Défi du jour · Amis » (toi et tes amis, src/meta/friends.ts), visible même sans compte (il invite
// alors à se connecter, sans aucune requête).
import { BOARD_VIEWS, stageOfBest, timeOfBest } from '../meta/board';
import type { BoardRow, BoardView, FriendRow, ScoreDoc } from '../meta/board';
import { fmtNum, fmtTime, t } from '../i18n';
import { CHARACTERS } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import { characterName } from './cards';

/**
 * out : pas connecté (aucun chargement de Firebase) ; nopseudo : connecté sans pseudo ; unavailable : comptes absents ;
 * offline : hors ligne (lot L4, onglet amis).
 */
export type BoardStatus = 'out' | 'nopseudo' | 'loading' | 'ready' | 'error' | 'unavailable' | 'offline';
export interface BoardState {
  status: BoardStatus;
  view: BoardView;
  week: boolean; // « cette semaine » au lieu de « tous les temps »
  friends: boolean; // lot L4 : onglet « Défi du jour · Amis »
  uid: string;
  rows: BoardRow[];
  mine: ScoreDoc | null;
  friendRows: FriendRow[]; // lot L4 : toi et tes amis (src/meta/board.ts, friendRows)
}
export function initialBoardState(): BoardState {
  return { status: 'out', view: 'best', week: false, friends: false, uid: '', rows: [], mine: null, friendRows: [] };
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
  const live = s.status === 'ready' || s.status === 'loading' || s.status === 'error' || s.status === 'offline';
  $('boardInvite').hidden = s.status !== 'out' && s.status !== 'unavailable';
  $('boardInviteText').textContent = t(
    s.status === 'unavailable' ? 'board.unavailable' : s.friends ? 'board.friends.signIn' : 'board.signIn',
  );
  $('boardAccountBtn').hidden = s.status === 'unavailable';
  $('boardPseudo').hidden = s.status !== 'nopseudo';
  $('boardLive').hidden = !live;
  $('boardScope').hidden = s.status === 'unavailable';
  $('boardTabs').hidden = s.status === 'unavailable';
  // onglet « Amis » : le défi du jour n'a qu'une période (aujourd'hui) ; son titre remplace le choix de période
  $('boardPeriod').hidden = s.friends;
  $('boardFriendsLbl').hidden = !s.friends;
  $('boardFriends').setAttribute('aria-pressed', String(s.friends));
  for (const b of $('boardTabs').querySelectorAll<HTMLButtonElement>('[data-view]')) {
    const on = !s.friends && b.dataset.view === s.view;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', String(on));
  }
  $('boardAll').classList.toggle('selected', !s.friends && !s.week);
  $('boardWeek').classList.toggle('selected', !s.friends && s.week);
  $('boardFriends').classList.toggle('selected', s.friends);
  $('boardAll').setAttribute('aria-pressed', String(!s.friends && !s.week));
  $('boardWeek').setAttribute('aria-pressed', String(!s.friends && s.week));
  const msg = $('boardMsg');
  msg.textContent =
    s.status === 'loading'
      ? t('board.loading')
      : s.status === 'error'
        ? t('board.error')
        : s.status === 'offline'
          ? t('board.offline')
          : s.status === 'ready' && !s.friends && s.rows.length === 0
            ? t(s.week ? 'board.emptyWeek' : 'board.empty')
            : '';
  msg.classList.toggle('error', s.status === 'error' || s.status === 'offline');
  const list = $('boardList');
  if (s.status !== 'ready') {
    list.innerHTML = '';
    $('boardMine').textContent = '';
    return;
  }
  if (s.friends) {
    renderFriends(s.friendRows);
    return;
  }
  let mineShown = false;
  list.innerHTML = s.rows
    .map((r, i) => {
      const me = r.uid === s.uid;
      if (me) mineShown = true;
      const who = isChar(r.char) ? characterName(r.char) : '';
      // interface Nocturne : avatar du héros joué ; le podium en grands chiffres
      const av = isChar(r.char)
        ? `<span class="avatar"><img src="/ui/avatar-${r.char}.webp" alt="" /></span>`
        : '<span class="avatar"></span>';
      return (
        `<li class="brow${i < 3 ? ' top' : ''}${me ? ' me' : ''}"><b class="rank">${i + 1}</b>` +
        `<span class="who">${av}<span class="name">${esc(r.name)}</span><small>${esc(who)}</small></span>` +
        `<span class="val">${esc(boardValue(s.view, r.value))}</span></li>`
      );
    })
    .join('');
  // hors du top : ton meilleur score rappelé sous la liste
  const mine = s.mine;
  $('boardMine').textContent =
    !mineShown && mine ? t('board.mine', { value: boardValue(s.view, mine[s.view]) }) : !mine ? t('board.none') : '';
}

/**
 * Lot L4 : toi et tes amis au défi du jour (temps · kills), ceux qui n'ont pas encore joué à la fin ; chaque ami a son
 * lien « Retirer » (`data-remove` : identifiant, cible de 44 px). Pseudos échappés : ils viennent du nuage ou d'un lien.
 * Au kit Nocturne : les lignes de Classement.dc.html, le podium (3 premiers qui ont joué) en grands chiffres.
 */
function renderFriends(rows: readonly FriendRow[]): void {
  let rank = 0;
  $('boardList').innerHTML = rows
    .map((r) => {
      const val = r.played ? `${fmtTime(r.time)} · ${fmtNum(r.kills)}` : t('board.friends.notYet');
      const remove = r.me
        ? ''
        : `<button class="btn-link fremove" data-remove="${esc(r.uid)}" aria-label="${esc(
            t('board.friends.removeAria', { name: r.name }),
          )}">${esc(t('board.friends.remove'))}</button>`;
      const n = r.played ? ++rank : 0;
      return (
        `<li class="brow friend${n > 0 && n <= 3 ? ' top' : ''}${r.me ? ' me' : ''}${r.played ? '' : ' idle'}">` +
        `<b class="rank">${n > 0 ? n : '–'}</b>` +
        `<span class="who"><span class="avatar" aria-hidden="true">${esc(Array.from(r.name)[0] ?? '')}</span>` +
        `<span class="name">${esc(r.name)}</span></span>` +
        `<span class="val">${esc(val)}</span>${remove}</li>`
      );
    })
    .join('');
  // aucun ami : l'invitation à partager son défi
  $('boardMine').textContent = rows.some((r) => !r.me) ? '' : t('board.friends.invite');
}

/** Vue suivante d'un clic sur un onglet (clé `data-view`), ou celle d'avant si la clé est inconnue. */
export function viewOf(key: string | undefined, prev: BoardView): BoardView {
  return (BOARD_VIEWS as readonly string[]).includes(key ?? '') ? (key as BoardView) : prev;
}
