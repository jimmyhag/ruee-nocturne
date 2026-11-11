// 1.48.1 (retour de Jimmy) : une Plume de phénix consommée quitte la barre d'équipement, pour voir ce qu'il reste.
import { describe, expect, it } from 'vitest';
import { It } from '../sim/balance';
import { gainItem } from '../sim/items';
import { World } from '../sim/world';
import { itemName } from './cards';
import { gearHtml } from './hud';

const phenix = itemName('phenix');

describe('barre d’équipement : objets consommés', () => {
  it('deux plumes ×2, puis une seule, puis plus rien', () => {
    const w = new World(1);
    gainItem(w, It.Pierre);
    gainItem(w, It.Phenix);
    gainItem(w, It.Phenix);
    expect(gearHtml(w)).toContain(`${phenix} ×2`);
    w.itemUsed[It.Phenix] = 1;
    const one = gearHtml(w);
    expect(one).toContain(phenix);
    expect(one).not.toContain(`${phenix} ×2`);
    expect(one).toContain('×1'); // au plafond de la partie : le compte restant reste affiché
    w.itemUsed[It.Phenix] = 2;
    const none = gearHtml(w);
    expect(none).not.toContain(phenix);
    expect(none).toContain(itemName('pierre')); // les autres objets restent
  });
  it('seule plume consommée, aucun autre objet : plus de séparateur ni de pastille', () => {
    const w = new World(1);
    gainItem(w, It.Phenix);
    expect(gearHtml(w)).toContain('gsep');
    w.itemUsed[It.Phenix] = 1;
    expect(gearHtml(w)).not.toContain('gsep');
  });
});
