// Nouveautés (1.49.0) : la feuille qui liste les versions du jeu. Le contenu vient de `virtual:patch-notes` (le journal
// réduit au build, src/meta/patch-notes.ts) ; ici on ne fait que le rendre. Construit à l'ouverture de la feuille.
import { t } from '../i18n';
import type { NoteKind, PatchNote } from '../meta/patch-notes';

/** Versions montrées d'emblée ; les plus anciennes attendent derrière « Versions plus anciennes ». */
export const NOTES_FIRST = 8;
/** Versions non vues ouvertes d'office (les suivantes gardent leur étiquette « Nouveau », repliées). */
const NOTES_OPEN = 3;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Texte du journal → HTML : tout est échappé, seul le gras `**…**` devient <b>. */
const rich = (s: string): string => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
/** Résumé d'une version repliée : sans gras, une ligne (la feuille coupe ce qui dépasse). */
const plain = (s: string): string => esc(s.replace(/\*\*/g, ''));

const KIND_KEY: Record<NoteKind, string> = { added: 'notes.added', changed: 'notes.changed', fixed: 'notes.fixed' };

/** « 1.48.1 » → nombre comparable ; une chaîne qui n'est pas une version vaut 0 (rien n'a été vu). */
export function versionKey(v: string): number {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? +m[1] * 1e6 + +m[2] * 1e3 + +m[3] : 0;
}
/**
 * Faut-il signaler des nouveautés au menu ? Oui si la version courante n'a pas été vue, sauf pour un joueur qui n'a
 * encore jamais joué : tout est nouveau pour lui, on ne l'envoie pas lire un journal.
 */
export function hasUnseenNotes(seen: string, current: string, runs: number): boolean {
  return versionKey(seen) < versionKey(current) && (seen !== '' || runs > 0);
}

function noteHtml(n: PatchNote, open: boolean, fresh: boolean): string {
  let body = '';
  for (const s of n.sections) {
    body += `<h3 class="pn-k ${s.kind}">${esc(t(KIND_KEY[s.kind]))}</h3><ul>`;
    for (const it of s.items) {
      body += `<li>${rich(it.text)}`;
      if (it.sub) body += `<ul>${it.sub.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>`;
      body += '</li>';
    }
    body += '</ul>';
  }
  const tag = fresh ? ` <span class="badge new">${esc(t('notes.new'))}</span>` : '';
  return (
    `<details class="pn"${open ? ' open' : ''} data-v="${esc(n.version)}">` +
    `<summary><span class="pn-h"><b>${esc(n.version)}</b>${tag}<span class="pn-d">${esc(n.date)}</span></span>` +
    `<span class="pn-l">${plain(n.lead)}</span></summary>${body}</details>`
  );
}

/**
 * HTML de la liste. `seen` : dernière version vue sur cet appareil ('' = jamais) : les versions plus récentes sont
 * marquées « Nouveau » (les NOTES_OPEN premières ouvertes) ; sinon seule la dernière est ouverte. `all` : montrer aussi
 * les anciennes. `shown` : nombre de versions rendues.
 */
export function notesHtml(notes: PatchNote[], seen: string, all: boolean): { html: string; shown: number } {
  const since = versionKey(seen);
  let html = '';
  let shown = 0;
  for (let i = 0; i < notes.length; i++) {
    const fresh = since > 0 && versionKey(notes[i].version) > since;
    if (!all && i >= NOTES_FIRST && !fresh) break; // tout ce qui est nouveau depuis la dernière visite reste visible
    html += noteHtml(notes[i], i === 0 || (fresh && i < NOTES_OPEN), fresh);
    shown++;
  }
  return { html, shown };
}

/** Remplit la feuille et le bouton « Versions plus anciennes ». */
export function renderNotes(
  list: HTMLElement,
  more: HTMLElement,
  notes: PatchNote[],
  seen: string,
  all: boolean,
): void {
  const r = notesHtml(notes, seen, all);
  list.innerHTML = r.html;
  more.hidden = r.shown >= notes.length;
  more.textContent = t('notes.older', { n: notes.length - r.shown });
}
