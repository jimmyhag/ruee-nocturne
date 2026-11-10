// 1.40.0 (demande de Jimmy) : touches du clavier configurables sur PC. Module pur (ni DOM ni rendu) : quelles touches
// déclenchent quelle action, comment une nouvelle touche s'insère (échange en cas de conflit), ce qui est réservé.
// Les codes sont ceux de KeyboardEvent.code (position physique : « KeyW » est la touche Z d'un clavier AZERTY).

export const KEY_ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'slide', 'spell', 'map', 'pause'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

/** Une touche choisie par le joueur : son code, et ce qu'elle a tapé au moment du choix (pour l'afficher). */
export interface KeyBind {
  c: string; // KeyboardEvent.code
  k: string; // KeyboardEvent.key au moment du choix ('c', ' ', 'Shift'…)
}
/** Actions modifiées seulement ; une action absente garde ses touches par défaut. */
export type KeyBinds = Partial<Record<KeyAction, KeyBind>>;

/** Touches par défaut (les deux dispositions ZQSD et WASD marchent sans réglage, comme avant la 1.40.0). */
export const KEY_DEFAULTS: Record<KeyAction, readonly string[]> = {
  up: ['KeyW', 'KeyZ'],
  down: ['KeyS'],
  left: ['KeyA', 'KeyQ'],
  right: ['KeyD'],
  jump: ['Space'],
  slide: ['KeyC'],
  spell: ['ShiftLeft', 'ShiftRight'],
  map: ['KeyM', 'Semicolon'], // la touche M d'un clavier QWERTY, puis celle d'un AZERTY (avant la 1.40.0, il fallait « , »)
  pause: ['KeyP'],
};
/** Touches toujours actives en plus, jamais réattribuables : les flèches pour bouger, Échap pour la pause. */
export const KEY_FIXED: Record<KeyAction, readonly string[]> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  jump: [],
  slide: [],
  spell: [],
  map: [],
  pause: ['Escape'],
};

/**
 * Touches qu'on ne peut pas attribuer : flèches et Échap (fixes), Entrée (valider), chiffres 1 à 4 (choisir une carte),
 * R (relancer les cartes ou le marchand), touches de fonction (F3 : mesures), Tab et touches système.
 */
export function isReserved(code: string): boolean {
  return (
    /^(Arrow|F\d|Meta|OS|Numpad[1-4]$|Digit[1-4]$)/.test(code) ||
    ['Escape', 'Enter', 'NumpadEnter', 'Tab', 'KeyR', 'ContextMenu', 'PrintScreen', ''].includes(code)
  );
}

/** Touches réattribuables de l'action (celle du joueur, sinon les défauts), sans les touches fixes. */
export function ownCodes(b: KeyBinds, a: KeyAction): readonly string[] {
  const own = b[a];
  return own ? [own.c] : KEY_DEFAULTS[a];
}
/** Toutes les touches qui déclenchent l'action. Alloue : à appeler au changement de réglage, pas par image. */
export function codesFor(b: KeyBinds, a: KeyAction): string[] {
  return [...ownCodes(b, a), ...KEY_FIXED[a]];
}
/** L'action déclenchée par cette touche, ou null. */
export function actionOf(b: KeyBinds, code: string): KeyAction | null {
  for (const a of KEY_ACTIONS) if (ownCodes(b, a).includes(code) || KEY_FIXED[a].includes(code)) return a;
  return null;
}

/**
 * Attribue `code` à `action`. Renvoie les nouvelles touches, ou null si la touche est réservée.
 * Conflit avec une autre action : si elle garde une autre touche (ZQSD et WASD), elle perd seulement celle-ci ; sinon
 * les deux actions échangent leurs touches.
 */
export function rebind(b: KeyBinds, action: KeyAction, code: string, key: string): KeyBinds | null {
  if (isReserved(code)) return null;
  const out: KeyBinds = { ...b };
  const before = ownCodes(b, action);
  for (const other of KEY_ACTIONS) {
    if (other === action) continue;
    const theirs = ownCodes(b, other);
    if (!theirs.includes(code)) continue;
    const rest = theirs.filter((c) => c !== code);
    if (rest.length > 0) out[other] = { c: rest[0], k: '' };
    else out[other] = b[action] ? { ...b[action]! } : { c: before[0], k: '' }; // échange
  }
  out[action] = { c: code, k: key };
  return dropDefaults(out);
}

/** Une action revenue exactement à ses touches par défaut n'est plus notée. */
function dropDefaults(b: KeyBinds): KeyBinds {
  const out: KeyBinds = {};
  for (const a of KEY_ACTIONS) {
    const own = b[a];
    if (!own) continue;
    const d = KEY_DEFAULTS[a];
    if (d.length === 1 && d[0] === own.c) continue;
    out[a] = own;
  }
  return out;
}

/** Nettoie des touches lues d'une sauvegarde : actions connues, codes plausibles, pas de touche réservée ni en double. */
export function normalizeBinds(raw: unknown): KeyBinds {
  const out: KeyBinds = {};
  if (!raw || typeof raw !== 'object') return out;
  const used = new Set<string>();
  for (const a of KEY_ACTIONS) {
    const v = (raw as Record<string, unknown>)[a];
    if (!v || typeof v !== 'object') continue;
    const c = (v as Record<string, unknown>).c,
      k = (v as Record<string, unknown>).k;
    if (typeof c !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(c) || isReserved(c) || used.has(c)) continue;
    used.add(c);
    out[a] = { c, k: typeof k === 'string' ? k.slice(0, 16) : '' };
  }
  // une touche choisie ne doit pas rester aussi la touche par défaut d'une autre action
  for (const a of KEY_ACTIONS) {
    if (out[a]) continue;
    const rest = KEY_DEFAULTS[a].filter((c) => !used.has(c));
    if (rest.length === KEY_DEFAULTS[a].length) continue;
    if (rest.length > 0) out[a] = { c: rest[0], k: '' };
  }
  return dropDefaults(out);
}

/**
 * Nom court d'une touche pour l'affichage, sans traduction : la lettre tapée si on la connaît (`key`, ou la
 * disposition du clavier `layout` quand le navigateur la donne), sinon un nom tiré du code. Les touches à nom traduit
 * (Espace, Maj) renvoient une clé de texte préfixée par « @ », que l'interface traduit.
 */
export function keyLabel(code: string, key = '', layout?: { get(code: string): string | undefined } | null): string {
  if (code === 'Space') return '@keys.space';
  if (code.startsWith('Shift')) return '@keys.shift';
  if (code.startsWith('Control')) return 'Ctrl';
  if (code.startsWith('Alt')) return 'Alt';
  const typed = key.length === 1 && key !== ' ' ? key : (layout?.get(code) ?? '');
  if (typed.length === 1) return typed.toUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  const named: Record<string, string> = {
    Backspace: '⌫',
    CapsLock: 'Verr',
    Backquote: '²',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    IntlBackslash: '<',
    Insert: 'Inser',
    Delete: 'Suppr',
    Home: '↖',
    End: 'Fin',
    PageUp: 'Pg↑',
    PageDown: 'Pg↓',
  };
  return named[code] ?? code;
}
