// 1.40.0 (demande de Jimmy) : réglage des touches du clavier. Noms des touches, bandeau du jeu, grille des réglages et
// capture de la nouvelle touche. La règle (conflits, touches réservées) vit dans src/platform/keymap.ts.
import { KEY_ACTIONS, KEY_DEFAULTS, keyLabel, rebind } from '../platform/keymap';
import type { KeyAction, KeyBinds } from '../platform/keymap';
import { t } from '../i18n';

type Layout = { get(code: string): string | undefined } | null;
let layout: Layout = null;

/** Disposition du clavier, quand le navigateur la donne (Chrome, Edge) : sert à nommer une touche jamais tapée. */
export function loadKeyboardLayout(onReady: () => void): void {
  const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Layout> } }).keyboard;
  kb?.getLayoutMap?.()
    .then((m) => {
      layout = m;
      onReady();
    })
    .catch(() => {
      /* pas de disposition : noms tirés des codes */
    });
}

const MOVE: KeyAction[] = ['up', 'left', 'down', 'right']; // ordre de « ZQSD »

/** Nom affiché de la touche d'une action. Par défaut : les lettres du jeu dans la langue (ZQSD ou WASD, C, M, P). */
export function keyText(b: KeyBinds, a: KeyAction): string {
  const own = b[a];
  if (!own) {
    const m = MOVE.indexOf(a);
    if (m >= 0) return t('menu.keys.move')[m];
    if (a === 'map') return 'M'; // KeyM et Semicolon : la touche M des claviers QWERTY et AZERTY
  }
  const label = keyLabel(own ? own.c : KEY_DEFAULTS[a][0], own ? own.k : '', layout);
  return label.startsWith('@') ? t(label.slice(1)) : label;
}
/** Les quatre touches de déplacement, accolées (« ZQSD »). */
export function moveText(b: KeyBinds): string {
  if (!MOVE.some((a) => b[a])) return t('menu.keys.move');
  const parts = MOVE.map((a) => keyText(b, a));
  return parts.every((p) => p.length === 1) ? parts.join('') : parts.join(' ');
}

/** Pose les noms des touches partout où le jeu les affiche (bandeau en jeu, aide) : éléments `data-key`. */
export function renderKeyHints(b: KeyBinds): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-key]')) {
    const k = el.dataset.key!;
    el.textContent = k === 'move' ? moveText(b) : keyText(b, k as KeyAction);
  }
}

export interface KeySettings {
  /** Redessine la grille (changement de langue, de réglages). */
  render(): void;
}

/**
 * Grille des réglages : une ligne par action, un bouton par touche. Un clic met le bouton à l'écoute ; la touche
 * suivante devient la nouvelle (Échap annule). L'écoute intercepte la touche avant le jeu (phase de capture).
 */
export function initKeySettings(o: {
  grid: HTMLElement;
  msg: HTMLElement;
  reset: HTMLElement;
  get: () => KeyBinds;
  set: (b: KeyBinds) => void;
}): KeySettings {
  let listening: KeyAction | null = null;
  const name = (a: KeyAction) => t('key.' + a);
  const render = () => {
    const b = o.get();
    let html = '';
    for (const a of KEY_ACTIONS) {
      const on = listening === a;
      html += `<label><span>${name(a)}</span><button type="button" class="ghost${on ? ' listening' : ''}" data-act="${a}" aria-label="${name(a)} : ${keyText(b, a)}">${on ? t('settings.keys.listen') : keyText(b, a)}</button></label>`;
    }
    o.grid.innerHTML = html;
  };
  o.grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn) return;
    listening = listening === btn.dataset.act ? null : (btn.dataset.act as KeyAction);
    o.msg.textContent = listening ? t('settings.keys.press', { action: name(listening) }) : t('settings.keys.hint');
    render();
    (o.grid.querySelector(`[data-act="${btn.dataset.act}"]`) as HTMLElement | null)?.focus();
  });
  o.reset.addEventListener('click', () => {
    listening = null;
    o.set({});
    o.msg.textContent = t('settings.keys.default');
    render();
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!listening) return;
      if (o.grid.offsetParent === null) {
        listening = null; // l'écran des réglages s'est fermé pendant l'écoute
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation(); // ni le jeu ni les raccourcis ne voient cette touche
      if (e.repeat) return;
      const action = listening;
      if (e.code === 'Escape') {
        listening = null;
        o.msg.textContent = t('settings.keys.hint');
        render();
        return;
      }
      const before = o.get();
      const next = rebind(before, action, e.code, e.key);
      if (!next) {
        o.msg.textContent = t('settings.keys.reserved');
        return; // on reste à l'écoute
      }
      listening = null;
      o.set(next);
      // une autre action a-t-elle changé de touche ? (échange)
      const other = KEY_ACTIONS.find((a) => a !== action && keyText(before, a) !== keyText(next, a));
      o.msg.textContent = other
        ? t('settings.keys.swap', {
            action: name(action),
            key: keyText(next, action),
            other: name(other),
            otherKey: keyText(next, other),
          })
        : t('settings.keys.set', { action: name(action), key: keyText(next, action) });
      render();
    },
    true,
  );
  return { render };
}
