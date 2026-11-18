// Interface « Nocturne », décision 7 : les icônes d'armes et de sorts de la maquette (assets/ui/<id>.svg, table dans
// docs/design/menus/README.md) sont les dessins du jeu (src/ui/icons.ts) exportés par l'éditeur de la maquette. Le jeu
// les affiche donc déjà dans Héros, la Bibliothèque et les cartes de niveau, sans fichier en double ; ce test le prouve
// tracé par tracé et échoue si l'une des deux sources change sans l'autre.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPELL_ICON, WEAPON_ICON } from './icons';

const ASSETS = join(__dirname, '..', '..', 'assets', 'ui');
/** Id de la maquette → icône du jeu (ordre de la table du README). */
const MOCKUP: [string, string][] = [
  ['6e94e1e6db8e4a455fbae1386e444647', WEAPON_ICON.orbe],
  ['2c86e43caed74f4d168547360170823d', SPELL_ICON.bond],
  ['d86385d8ebe58bc4f19b8a3be31b38c5', WEAPON_ICON.foudre],
  ['abeeb9e93d288554141def5f755e5a51', WEAPON_ICON.aura],
  ['7f73e07afaa84430c228ea252a7e7115', WEAPON_ICON.lames],
  ['df23e222159356084eaddce50550d6e2', WEAPON_ICON.boomerang],
  ['e8054d77e4e730b513103eeaabd688e5', WEAPON_ICON.mines],
  ['708db1e6d15ae48714a99333eb2a27d3', WEAPON_ICON.faux],
  ['8cd7e9fb20d7fb768fe149b97b4f9b7a', WEAPON_ICON.lance],
  ['d4c5ad4d77a19fc7ff7a5a9092950d5b', WEAPON_ICON.meteores],
  ['8e6517121cfdd64bc20e6ee32cd506c8', WEAPON_ICON.fouet],
  ['eec3693f2f87dd052de5544541b52358', WEAPON_ICON.vitriol],
  ['79f6cd262d54d8df3d6bfaeaa4a7f0f8', WEAPON_ICON.esprits],
  ['3dc04331eddfb813d5f7388b937df62c', WEAPON_ICON.balise],
];

/** Tracés d'un SVG, sans l'élément racine : balises auto-fermées et nombres écrits de la même façon. */
function shapes(svg: string): string {
  const inner = svg.slice(svg.indexOf('<g'), svg.lastIndexOf('</g>'));
  return inner
    .replace(/<(path|circle|polygon)([^>]*?)\s*\/>/g, '<$1$2></$1>')
    .replace(/\d+\.\d+/g, (n) => String(+(+n).toFixed(1)))
    .replace(/\s+/g, ' ');
}

describe('decision 7: mockup weapon and spell icons', () => {
  it.each(MOCKUP)('%s is the game drawing', (id, game) => {
    expect(shapes(readFileSync(join(ASSETS, `${id}.svg`), 'utf8'))).toBe(shapes(game));
  });
});
