// 1.48.1 (retour de Jimmy) : une Plume de phénix consommée quitte la barre d'équipement, pour voir ce qu'il reste.
import { describe, expect, it } from 'vitest';
import { It } from '../sim/balance';
import { gainItem } from '../sim/items';
import { syncTiers } from '../sim/tiers';
import { World } from '../sim/world';
import { itemName, weaponName } from './cards';
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

// Lot L5 : le palier visuel d'une arme reste visible dans la barre d'équipement après la bannière
describe('barre d’équipement : paliers visuels d’arme', () => {
  /** Classes de l'icône de l'arme `name` dans la barre. */
  const iconClass = (html: string, name: string): string =>
    new RegExp(`class="([^"]*)" title="${name} `).exec(html)?.[1] ?? '';
  it('the weapon icon takes the border colour of its tier', () => {
    const w = new World(1);
    w.weapons.orbe = 24;
    w.weapons.lames = 50;
    syncTiers(w);
    const html = gearHtml(w);
    expect(iconClass(html, weaponName('orbe'))).toBe('gi gw');
    expect(iconClass(html, weaponName('lames'))).toBe('gi gw tier2');
    w.weapons.orbe = 25;
    syncTiers(w);
    expect(iconClass(gearHtml(w), weaponName('orbe'))).toBe('gi gw tier1');
    w.weapons.orbe = 100;
    syncTiers(w);
    expect(iconClass(gearHtml(w), weaponName('orbe'))).toBe('gi gw tier3');
  });
});
