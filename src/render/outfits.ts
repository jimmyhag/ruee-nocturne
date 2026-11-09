// Tenues des personnages (phase 7) : palettes, sans import de three (lues aussi par l'UI du menu pour les pastilles).
// Index 0 : tenue classique, toujours possédée ; 1 : tenue alternative, achetée en or (OUTFIT.price, balance.ts) ;
// 2 : tenue de maître (phase 41), or et nuit, gagnée au défi III du personnage.
import type { CharacterKey } from '../sim/types';
import { PAL } from './palette';

export interface Palette {
  p1: number;
  p2: number;
  p3: number;
  skin: number;
}
const PAPER = PAL.paper;
const BASE: Record<CharacterKey, Palette[]> = {
  eclaireuse: [
    { p1: PAL.accent, p2: 0x3d2b52, p3: PAL.hp, skin: PAPER },
    { p1: 0x2fb3a0, p2: 0x1c3a44, p3: PAL.gold, skin: PAPER },
  ],
  bucheron: [
    { p1: 0xb23a3a, p2: 0x3f6b3a, p3: 0x6b4a2a, skin: PAPER },
    { p1: 0x2a4f8a, p2: 0x1c1226, p3: 0x3a2a1a, skin: PAPER },
  ],
  sorciere: [
    { p1: 0x4b2d7a, p2: 0x2a1a4a, p3: 0xb9b3c9, skin: 0xe8dcc0 },
    { p1: 0x1f5a4a, p2: 0x0f2f28, p3: 0xdedad0, skin: 0xe8dcc0 },
  ],
  veilleuse: [
    { p1: 0x2f7f8f, p2: 0x1f4f5f, p3: PAL.gold, skin: PAPER },
    { p1: 0x8a3a5a, p2: 0x4a1f33, p3: 0x9bf0e4, skin: PAPER },
  ],
  braconnier: [
    { p1: 0x8a5a2b, p2: 0x3f6b3a, p3: PAL.boomerang, skin: PAPER },
    { p1: 0x4a4a4a, p2: 0x7a2a2a, p3: PAL.gold, skin: PAPER },
  ],
  sapeur: [
    { p1: 0x6b6b4a, p2: 0x4a3a2a, p3: 0x8a8a2a, skin: PAPER },
    { p1: 0x2a4a6a, p2: 0x1c2a3a, p3: 0xd8c84a, skin: PAPER },
  ],
  feufollet: [
    { p1: 0xbfe8ff, p2: 0x9fd8ff, p3: PAL.accent, skin: PAPER },
    { p1: 0xd8c0ff, p2: 0xb89aff, p3: 0x59d8ff, skin: PAPER },
  ],
  revenante: [
    { p1: 0xb8b0c8, p2: PAL.ink, p3: PAL.xp, skin: PAPER },
    { p1: 0x3a2a4a, p2: 0x0c0810, p3: PAL.hp, skin: PAPER },
  ],
  colporteur: [
    { p1: 0x9a6a3a, p2: 0x6b4a2a, p3: 0x2a2a2a, skin: PAPER },
    { p1: 0x3a6a4a, p2: 0x2a3a2a, p3: 0x8a2a2a, skin: PAPER },
  ],
};
/** Tenue de maître : or sur nuit, avec le liseré (p3) de la tenue classique. */
const master = (p: Palette): Palette => ({ p1: PAL.gold, p2: 0x231a10, p3: p.p3, skin: p.skin });
export const OUTFITS = Object.fromEntries(
  Object.entries(BASE).map(([k, pals]) => [k, [...pals, master(pals[0])]]),
) as Record<CharacterKey, Palette[]>;
/** Couleur CSS `#rrggbb` d'un entier (pastilles du menu). */
export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
