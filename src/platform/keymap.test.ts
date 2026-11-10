// 1.40.0 (demande de Jimmy) : touches du clavier configurables.
import { describe, expect, it } from 'vitest';
import { KEY_ACTIONS, KEY_DEFAULTS, actionOf, codesFor, isReserved, keyLabel, normalizeBinds, rebind } from './keymap';

describe('touches configurables', () => {
  it('par défaut : ZQSD et WASD, flèches, Espace, C, Maj, M (QWERTY et AZERTY), P et Échap', () => {
    expect(codesFor({}, 'up')).toEqual(['KeyW', 'KeyZ', 'ArrowUp']);
    expect(codesFor({}, 'left')).toEqual(['KeyA', 'KeyQ', 'ArrowLeft']);
    expect(codesFor({}, 'jump')).toEqual(['Space']);
    expect(codesFor({}, 'slide')).toEqual(['KeyC']);
    expect(codesFor({}, 'spell')).toEqual(['ShiftLeft', 'ShiftRight']);
    expect(codesFor({}, 'map')).toEqual(['KeyM', 'Semicolon']);
    expect(codesFor({}, 'pause')).toEqual(['KeyP', 'Escape']);
    // aucune touche par défaut ne sert à deux actions
    const all = KEY_ACTIONS.flatMap((a) => codesFor({}, a));
    expect(new Set(all).size).toBe(all.length);
  });
  it('une touche libre remplace les touches par défaut de l’action ; les flèches et Échap restent', () => {
    const b = rebind({}, 'slide', 'KeyV', 'v')!;
    expect(codesFor(b, 'slide')).toEqual(['KeyV']);
    expect(actionOf(b, 'KeyC')).toBeNull();
    const m = rebind(b, 'up', 'KeyI', 'i')!;
    expect(codesFor(m, 'up')).toEqual(['KeyI', 'ArrowUp']);
    expect(codesFor(rebind(m, 'pause', 'KeyO', 'o')!, 'pause')).toEqual(['KeyO', 'Escape']);
  });
  it('conflit : les deux actions échangent leurs touches', () => {
    const b = rebind({}, 'slide', 'Space', ' ')!;
    expect(codesFor(b, 'slide')).toEqual(['Space']);
    expect(codesFor(b, 'jump')).toEqual(['KeyC']);
    // deux touches déjà choisies : échange aussi
    const c = rebind(rebind({}, 'slide', 'KeyV', 'v')!, 'map', 'KeyB', 'b')!;
    const d = rebind(c, 'slide', 'KeyB', 'b')!;
    expect(codesFor(d, 'slide')).toEqual(['KeyB']);
    expect(codesFor(d, 'map')).toEqual(['KeyV']);
    expect(d.map!.k).toBe('v'); // le nom tapé suit la touche
  });
  it('conflit avec une action à deux touches (ZQSD et WASD) : elle perd seulement celle-là', () => {
    const b = rebind({}, 'slide', 'KeyZ', 'w')!;
    expect(codesFor(b, 'slide')).toEqual(['KeyZ']);
    expect(codesFor(b, 'up')).toEqual(['KeyW', 'ArrowUp']);
    const all = KEY_ACTIONS.flatMap((a) => codesFor(b, a));
    expect(new Set(all).size).toBe(all.length);
  });
  it('revenir à la touche par défaut efface le réglage', () => {
    const b = rebind(rebind({}, 'slide', 'KeyV', 'v')!, 'slide', 'KeyC', 'c')!;
    expect(b).toEqual({});
  });
  it('touches réservées : flèches, Échap, Entrée, 1 à 4, R, F3, Tab', () => {
    for (const c of ['ArrowUp', 'Escape', 'Enter', 'Digit1', 'Digit4', 'Numpad2', 'KeyR', 'F3', 'Tab', 'MetaLeft']) {
      expect(isReserved(c), c).toBe(true);
      expect(rebind({}, 'slide', c, '')).toBeNull();
    }
    for (const c of ['KeyV', 'Space', 'Digit5', 'ControlLeft', 'KeyE', 'Semicolon'])
      expect(isReserved(c), c).toBe(false);
  });
  it('après n’importe quelle suite de réglages, aucune touche ne sert à deux actions', () => {
    const codes = [
      'KeyV',
      'Space',
      'KeyC',
      'KeyW',
      'KeyZ',
      'KeyA',
      'KeyQ',
      'KeyM',
      'KeyP',
      'ShiftLeft',
      'KeyE',
      'KeyF',
      'Semicolon',
    ];
    let b = {};
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    for (let i = 0; i < 400; i++) {
      b = rebind(b, KEY_ACTIONS[rnd(KEY_ACTIONS.length)], codes[rnd(codes.length)], '') ?? b;
      const all = KEY_ACTIONS.flatMap((a) => codesFor(b, a));
      expect(new Set(all).size, JSON.stringify(b)).toBe(all.length);
      for (const a of KEY_ACTIONS) expect(codesFor(b, a).length).toBeGreaterThan(0);
      expect(normalizeBinds(JSON.parse(JSON.stringify(b)))).toEqual(b); // la sauvegarde relit la même chose
    }
  });
  it('sauvegarde abîmée : actions inconnues, codes bizarres, touches réservées et doublons écartés', () => {
    expect(normalizeBinds(null)).toEqual({});
    expect(normalizeBinds('x')).toEqual({});
    expect(
      normalizeBinds({
        jump: { c: 'KeyV', k: 'v' },
        slide: { c: 'KeyV', k: 'v' }, // doublon : la première action (ordre de KEY_ACTIONS) garde la touche
        map: { c: 'Escape', k: '' }, // réservée
        spell: { c: '<script>', k: '' },
        fly: { c: 'KeyF', k: 'f' },
        pause: { c: 'KeyO', k: 'x'.repeat(99) },
        up: 3,
      }),
    ).toEqual({ jump: { c: 'KeyV', k: 'v' }, pause: { c: 'KeyO', k: 'x'.repeat(16) } });
    // une touche choisie qui est aussi une touche par défaut d'une autre action : l'autre la perd
    expect(codesFor(normalizeBinds({ slide: { c: 'KeyW', k: 'z' } }), 'up')).toEqual(['KeyZ', 'ArrowUp']);
  });
  it('nom d’une touche : la lettre tapée, sinon la disposition, sinon le code', () => {
    expect(keyLabel('KeyV', 'v')).toBe('V');
    expect(keyLabel('KeyW', '', { get: () => 'z' })).toBe('Z'); // AZERTY, donné par le navigateur
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Space', ' ')).toBe('@keys.space');
    expect(keyLabel('ShiftRight', 'Shift')).toBe('@keys.shift');
    expect(keyLabel('ControlLeft', 'Control')).toBe('Ctrl');
    expect(keyLabel('Digit5', '(')).toBe('('); // AZERTY : la touche 5 tape « ( »
    expect(keyLabel('Comma')).toBe(',');
    expect(KEY_DEFAULTS.slide).toEqual(['KeyC']);
  });
});
