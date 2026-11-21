// Noms des touches affichés (1.40.0) : l'aide du premier lancement, affichée par la page avant main.ts
// (docs/specs/demarrage-rapide.md), écrit les touches par défaut ; main.ts les réécrit ensuite avec keyText.
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPS } from '../i18n/early';
import { setLang, t } from '../i18n';
import { keyText, moveText } from './keys';
import type { KeyAction } from '../platform/keymap';

afterEach(() => setLang('fr'));

describe('noms des touches', () => {
  it("the help's default key names are those main.ts writes for a new player", () => {
    for (const l of ['fr', 'en'] as const) {
      setLang(l);
      for (const [action, key] of Object.entries(DEFAULT_CAPS)) {
        const shown = action === 'move' ? moveText({}) : keyText({}, action as KeyAction);
        expect(shown, `${l} ${action}`).toBe(t(key));
      }
    }
  });
});
