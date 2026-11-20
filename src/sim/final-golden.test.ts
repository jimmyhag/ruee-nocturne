// Le Cœur de la Nuit (docs/specs/boss-final.md) : « Le défi du jour et la partie guidée ne changent pas ». Le défi du
// jour (son boss final, sa suite en monde infini) et la partie guidée sont joués ici avec des entrées fixes ; leur
// empreinte (générateur, horloges, héros, ennemis, tirs, gemmes, or) a été relevée sur le code d'avant le lot (1.67.0) et
// doit rester la même au bit près. L'empreinte ne lit que des champs qui existaient avant le lot : un champ ajouté au
// monde ne la change pas, un tirage ou un comportement de plus, si.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DAILY, STEP, TUTORIAL } from './balance';
import { MERCHANT_LEAVE } from './merchant';
import { startEndless, summonStageBoss } from './stages';
import { startRun, step } from './step';
import { Mode } from './types';
import type { Input } from './types';
import { World } from './world';
import { tutorialOptions, worldOptions } from '../meta/shop';
import { DEFAULT_META } from '../meta/save';

const r = (v: number): string => v.toFixed(6);
/** Empreinte du monde : seulement des champs d'avant le lot. */
function fingerprint(w: World): string {
  const P = w.player;
  const parts: string[] = [
    String(w.rng.state()),
    r(w.t),
    r(w.stageT),
    r(w.diffT),
    String(w.mode),
    String(w.stage),
    String(w.kills),
    r(w.gold),
    String(w.medal),
    String(w.dailyBoss),
    String(w.endless),
    r(w.endlessT),
    String(w.endlessWave),
    String(w.bossCount),
    String(w.totem.state),
    String(w.portal.open),
    [P.x, P.z, P.y, P.hp, P.maxHp, P.xp, P.level].map(r).join(','),
  ];
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    parts.push([e.type, e.id, e.state, e.corrupt].join(':') + '@' + [e.x, e.z, e.hp, e.max, e.timer].map(r).join(','));
  }
  for (let i = 0; i < w.shotCount; i++) {
    const s = w.shots[i];
    parts.push(s.kind + '#' + [s.x, s.z, s.r, s.life, s.dmg].map(r).join(','));
  }
  for (let i = 0; i < w.gemCount; i++) parts.push('g' + r(w.gems[i].x) + r(w.gems[i].z) + r(w.gems[i].v));
  parts.push(JSON.stringify(w.weapons), JSON.stringify(w.tomes), Array.from(w.items).join(''));
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** Joue `s` secondes : entrée qui tourne, cartes et marchand pris au fil de l'eau. */
function play(w: World, s: number): void {
  const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
  const end = w.t + s;
  for (let k = 0; w.t < end && k < s * 240; k++) {
    if (w.mode === Mode.Dead || w.mode === Mode.Won) return;
    inp.pick = w.mode === Mode.LevelUp ? 0 : w.mode === Mode.Merchant ? MERCHANT_LEAVE : -1;
    inp.mx = Math.sin(w.t * 0.7);
    inp.mz = Math.cos(w.t * 0.5);
    inp.jump = k % 97 === 0;
    inp.spell = k % 131 === 0;
    step(w, inp, STEP);
  }
}

describe('le défi du jour et la partie guidée (docs/specs/boss-final.md)', () => {
  it('The daily challenge and the guided run do not change', () => {
    // défi du jour : départ, puis le boss final (4:00), puis la fin à 5:00 et la suite en monde infini
    const d = new World(20261120, worldOptions(DEFAULT_META, undefined, true, '2026-11-20'));
    startRun(d);
    d.player.maxHp = d.player.hp = 1e7;
    play(d, 20);
    const fp: string[] = [fingerprint(d)];
    d.t = DAILY.bossAt - 3; // horloge avancée : préavis et boss final sans jouer quatre minutes
    play(d, 25);
    expect(d.dailyBoss).toBeGreaterThan(0); // le boss final est venu
    fp.push(fingerprint(d));
    d.t = DAILY.duration - 2;
    play(d, 5);
    expect(d.mode).toBe(Mode.Won);
    fp.push(fingerprint(d));
    startEndless(d);
    play(d, 20);
    fp.push(fingerprint(d));
    // partie guidée : ses premières secondes, puis le combat du boss du totem du monde 1
    const g = new World(TUTORIAL.map, tutorialOptions());
    startRun(g);
    g.player.maxHp = g.player.hp = 1e7;
    play(g, 20);
    fp.push(fingerprint(g));
    g.stageT = TUTORIAL.forceAt + 1;
    summonStageBoss(g);
    play(g, 25);
    expect(g.totem.state).toBeGreaterThan(0); // le combat du totem a eu lieu
    fp.push(fingerprint(g));
    expect(fp).toEqual(GOLDEN);
  });
});

/**
 * Relevé sur le code d'avant le lot (1.67.0, be0d9c1). 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 12 : « le défi
 * du jour et la partie guidée changent avec les armes ») : la dernière empreinte, le combat du totem de la partie guidée,
 * est relevée de nouveau (l'Orbe saute une cible que ses tirs en vol suffisent à tuer) ; les cinq autres n'ont pas bougé.
 */
const GOLDEN: string[] = [
  '15b3ebae3ff5a868',
  'efa80d4d0195d62e',
  'fdb0efdd7468f4f4',
  '351f35fcb10c56a4',
  'acfc08418721f0de',
  'e4681cb2f4205a69',
];
