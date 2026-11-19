// Partie guidée (docs/specs/tutoriel.md) : les scénarios de la simulation et de la méta, titres en anglais. L'interface
// (lancement par « Jouer », consignes au doigt et au clavier, feuilles, pause, reprise) est dans e2e/tutoriel.spec.ts ;
// l'équilibrage (« Nobody loses the guided run before the boss ») dans tools/tutorial.test.ts.
import { describe, expect, it } from 'vitest';
import {
  BOSS,
  ENEMIES,
  FIRST_RUNS,
  MAPCHEST,
  PLAYER,
  REVEAL,
  SHRINE,
  SPAWN,
  STAGE,
  STEP,
  TUTORIAL,
} from '../sim/balance';
import { nextChoice } from '../sim/progression';
import { restoreWorld, snapshotWorld } from '../sim/snapshot';
import { tutorialRate } from '../sim/spawner';
import { stageLeft } from '../sim/stages';
import { startRun, step } from '../sim/step';
import { Ev, Mode, Pw } from '../sim/types';
import type { Input } from '../sim/types';
import { World } from '../sim/world';
import {
  ALL_HINTS,
  GUIDE,
  Hint,
  STEPS,
  Step,
  guideForced,
  guideJump,
  guideTarget,
  newGuide,
  readGuide,
  updateGuide,
} from './guide';
import { revealNews } from './reveal';
import { DEFAULT_META, normalizeMeta } from './save';
import type { Meta } from './save';
import { tutorialOptions, worldOptions } from './shop';
import { withProgress } from './sync';
import { softAfterRun, tutorialDue, tutorialEnd, tutorialSkip } from './tutorial';

const fresh = (): Meta => normalizeMeta({ version: 5 });
/** La partie guidée telle que main.ts la lance (carte TUTORIAL.map), générateur décalé de `skip` tirages. */
function tutorialWorld(skip = 0): World {
  const w = new World(TUTORIAL.map, tutorialOptions());
  for (let i = 0; i < skip; i++) w.rng.next();
  startRun(w);
  return w;
}
/** Horde au repos et héros increvable : seuls comptent les lieux, les horloges et le guide (tests rapides). */
function quiet(w: World): World {
  for (let i = w.enemyCount - 1; i >= 0; i--) if (!ENEMIES[w.enemies[i].type].boss) w.freeEnemy(i);
  w.powerT[Pw.Gel] = 1e9;
  w.player.maxHp = w.player.hp = 1e9;
  return w;
}
const idle = (): Input => ({ mx: 0, mz: 0, jump: false, spell: false, pick: -1 });
/** Joue `s` secondes de jeu avec l'entrée `inp` (cartes : la première), le guide suit chaque pas. */
function play(w: World, g: ReturnType<typeof newGuide>, s: number, inp: Input = idle()): void {
  const end = w.t + s;
  for (let n = 0; w.t < end && n < (s / STEP) * 4 + 100; n++) {
    const t0 = w.t;
    if (w.mode === Mode.LevelUp) {
      inp.pick = 0;
      if (!g.cards) g.cards = true;
    } else inp.pick = -1;
    step(w, inp, STEP);
    updateGuide(g, w, w.t - t0);
    if (w.mode === Mode.Dead) return;
  }
}
const teleport = (w: World, x: number, z: number): void => {
  const P = w.player;
  P.x = P.px = x;
  P.z = P.pz = z;
};
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

describe('partie guidée : qui la joue (décision 1)', () => {
  it('An existing player never sees it (saves and cloud progress)', () => {
    // nouveau joueur : la partie guidée l'attend
    expect(tutorialDue(fresh())).toBe(true);
    // sauvegarde d'avant la partie guidée, avec des parties jouées : jamais, ni ses consignes
    const old = normalizeMeta({ version: 5, runs: 3, reveal: 2 });
    expect(old.tutorial).toBe(1);
    expect(old.hints).toBe(ALL_HINTS);
    expect(old.reveal).toBe(2); // le dévoilement en cours est gardé tel quel (décision 9)
    expect(tutorialDue(old)).toBe(false);
    // joueur de la 1.64 qui n'a qu'abandonné des parties (lot L2 : une étape dévoilée, `runs` à 0) : il a déjà joué
    const quitter = normalizeMeta({ version: 5, runs: 0, reveal: 2 });
    expect(quitter.tutorial).toBe(1);
    expect(quitter.hints).toBe(ALL_HINTS);
    expect(quitter.reveal).toBe(2);
    expect(quitter.softLeft).toBe(0);
    expect(tutorialDue(quitter)).toBe(false);
    expect(tutorialDue({ ...fresh(), reveal: 1 })).toBe(false);
    expect(tutorialDue(withProgress(fresh(), { ...DEFAULT_META, runs: 0, reveal: 1 }))).toBe(false);
    // appareil neuf qui reçoit la progression d'un joueur qui a déjà joué
    const pulled = withProgress(fresh(), { ...DEFAULT_META, runs: 5, reveal: 4 });
    expect(tutorialDue(pulled)).toBe(false);
    expect(pulled.hints).toBe(ALL_HINTS);
    // la partie guidée : l'Éclaireuse au kit de départ, tout dévoilé, quelle que soit la méta
    const opts = tutorialOptions();
    expect(opts).toMatchObject({ character: 'eclaireuse', tutorial: true });
    expect(opts.reveal).toBeUndefined();
    const w = tutorialWorld();
    expect(w.tutorial).toBe(true);
    expect(w.reveal).toBe(REVEAL.max);
    expect(Object.keys(w.weapons)).toEqual(['orbe']);
    expect(w.softHp).toBe(1); // les parties adoucies sont celles d'après
  });
});

describe('partie guidée : les gestes (décisions 2 et 3)', () => {
  it('Each gesture waits for the player to do it', () => {
    const w = quiet(tutorialWorld());
    const g = newGuide(w, true, 0);
    expect(STEPS[g.step]).toBe('move');
    guideJump(g, w, Step.Jump);
    // 30 secondes sans sauter, en marchant : la consigne du saut reste
    play(w, g, 30, { mx: 1, mz: 0, jump: false, spell: false, pick: -1 });
    expect(STEPS[g.step]).toBe('jump');
    // il saute : l'étape suivante commence
    play(w, g, STEP * 2, { mx: 0, mz: 0, jump: true, spell: false, pick: -1 });
    expect(STEPS[g.step]).toBe('slide');
    // la glisse, puis le saut en pleine glisse, puis le sort : chacun sur le geste
    play(w, g, 1, idle()); // retombé au sol
    teleport(w, 0, 0); // de retour dans la clairière (30 s de marche l'ont mené au bord de la carte)
    play(w, g, 0.5, { mx: 1, mz: 0, jump: false, spell: false, pick: -1, slide: true });
    expect(STEPS[g.step]).toBe('slideJump');
    play(w, g, 1, idle()); // la glissade retombe : un saut debout ne compte pas
    play(w, g, STEP * 2, { mx: 1, mz: 0, jump: true, spell: false, pick: -1 });
    expect(STEPS[g.step]).toBe('slideJump');
    play(w, g, 1.5, idle());
    play(w, g, STEP * 3, { mx: 1, mz: 0, jump: false, spell: false, pick: -1, slide: true });
    expect(w.player.sliding).toBe(true);
    play(w, g, STEP * 2, { mx: 1, mz: 0, jump: true, spell: false, pick: -1, slide: true });
    expect(STEPS[g.step]).toBe('spell');
    play(w, g, STEP * 2, { mx: 1, mz: 0, jump: false, spell: true, pick: -1 });
    expect(STEPS[g.step]).toBe('chest');
    // le déplacement et le tir automatique attendent eux aussi le geste (distance, monstres vaincus)
    const w2 = tutorialWorld();
    const g2 = newGuide(w2, true, 0);
    w2.player.maxHp = w2.player.hp = 1e9;
    play(w2, g2, 5);
    expect(STEPS[g2.step]).toBe('move');
    play(w2, g2, 2, { mx: 1, mz: 0, jump: false, spell: false, pick: -1 });
    expect(STEPS[g2.step]).not.toBe('move');
  });
});

describe('partie guidée : la première feuille de niveau (décision 4)', () => {
  it('The first level-up card explains the rarities', () => {
    let adjusted = 0;
    for (let skip = 0; skip < 40; skip++) {
      // deux mondes identiques ; l'un ne fait pas l'ajustement de la première feuille
      const a = tutorialWorld(skip),
        b = tutorialWorld(skip);
      b.tutoRare = true;
      a.pending = b.pending = 1;
      nextChoice(a);
      nextChoice(b);
      expect(a.mode).toBe(Mode.LevelUp);
      // au moins une carte rare (deux lignes ou plus)
      expect(
        a.cards.some((c) => c.n >= 2),
        `décalage ${skip}`,
      ).toBe(true);
      // le tirage est celui de w.rng, sans un nombre de plus : même état, mêmes cartes et mêmes premières lignes
      expect(a.rng.state()).toBe(b.rng.state());
      expect(a.cards.map((c) => [c.kind, c.key, c.s0])).toEqual(b.cards.map((c) => [c.kind, c.key, c.s0]));
      if (!b.cards.some((c) => c.n >= 2)) adjusted++;
      // seulement la première feuille
      a.pending = 1;
      a.mode = Mode.Play;
      const before = a.rng.state();
      nextChoice(a);
      expect(a.tutoRare).toBe(true);
      expect(a.rng.state()).not.toBe(before);
    }
    expect(adjusted).toBeGreaterThan(0); // le tirage seul n'en donnait pas toujours une
  });
});

describe('partie guidée : les lieux (décision 5)', () => {
  it('The map places are shown one by one', () => {
    const w = quiet(tutorialWorld());
    const g = newGuide(w, true, 0);
    // le guide passe d'abord par la pente du saut glissé, puis montre les lieux un à un
    guideJump(g, w, Step.SlideJump);
    const at = { x: 0, z: 0 };
    expect(guideTarget(g, w, at)).toBe(true);
    expect(dist(at.x, at.z, 0, 0)).toBeLessThan(50);
    teleport(w, at.x, at.z);
    guideJump(g, w, Step.Chest);
    const seen: string[] = [];
    let px = w.player.x,
      pz = w.player.z;
    for (let k = 0; k < 6; k++) {
      const s = g.step;
      seen.push(STEPS[s]);
      expect(guideTarget(g, w, at), STEPS[s]).toBe(true); // une flèche vers le lieu
      // près du joueur : la carte de la partie guidée est choisie pour cela (TUTORIAL.map)
      expect(dist(at.x, at.z, px, pz), STEPS[s]).toBeLessThan(50);
      if (s === Step.Chest) {
        expect(w.gold).toBe(0);
        teleport(w, at.x, at.z);
        play(w, g, MAPCHEST.hold + 0.2); // l'or est offert : le coffre s'ouvre sans or
        expect(w.mapChestsOpened).toBe(1);
      } else if (s === Step.Shrine) {
        teleport(w, at.x, at.z);
        play(w, g, SHRINE.charge + 0.3);
        expect(w.shrinesUsed).toBe(1);
      } else if (s === Step.Race) {
        teleport(w, at.x, at.z);
        play(w, g, 0.2); // passer l'arche du haut
      } else {
        teleport(w, at.x + 6, at.z); // à côté, pour voir : jamais dans le cercle
        play(w, g, GUIDE.see + 0.2);
      }
      expect(g.step, STEPS[s]).toBe(s + 1);
      px = at.x;
      pz = at.z;
    }
    expect(seen).toEqual(['chest', 'shrine', 'race', 'skull', 'bossTotem', 'totem']);
    expect(STEPS[g.step]).toBe('free');
    expect(w.totem.state).toBe(0); // le totem du monde est montré, pas activé
  });

  it('A chest opened during the gestures skips the chest step', () => {
    const w = quiet(tutorialWorld());
    const g = newGuide(w, true, 0);
    guideJump(g, w, Step.SlideJump);
    w.mapChestsOpened = TUTORIAL.freeChests; // le coffre offert est déjà pris : la consigne « l'or est offert » mentirait
    guideJump(g, w, Step.Chest);
    play(w, g, STEP * 2);
    expect(STEPS[g.step]).toBe('shrine');
  });

  it('The skull and the boss totem are never imposed', () => {
    const w = quiet(tutorialWorld());
    const g = newGuide(w, true, 0);
    guideJump(g, w, Step.Skull);
    play(w, g, GUIDE.see + 0.2); // le joueur ne bouge pas
    expect(STEPS[g.step]).toBe('bossTotem');
    play(w, g, GUIDE.see + 0.2);
    expect(STEPS[g.step]).toBe('totem');
    expect(w.skullsOn).toBe(0);
    expect(w.bossTotemsOn).toBe(0);
    expect(w.player.difficulty).toBe(0);
  });
});

describe('partie guidée : le totem obligatoire et le boss (décisions 6 et 7)', () => {
  it('Two minutes before the end the totem is mandatory', () => {
    const w = quiet(tutorialWorld());
    const g = newGuide(w, true, 0);
    w.t = w.stageT = TUTORIAL.forceAt - 1;
    play(w, g, 0.5);
    expect(guideForced(g, w)).toBe(false);
    play(w, g, 1);
    expect(guideForced(g, w)).toBe(true); // flèche et bannière (interface : e2e)
    expect(STEPS[g.step]).toBe('free'); // trop lent : le reste du guide passe
    const at = { x: 0, z: 0 };
    expect(guideTarget(g, w, at)).toBe(true);
    expect([at.x, at.z]).toEqual([w.totem.x, w.totem.z]);
    expect(tutorialRate(w)).toBe(TUTORIAL.wait); // la horde s'éclaircit
    // le chrono s'arrête à 0:30 tant que le totem attend, sans prolongation ni rappel
    w.t = w.stageT = STAGE.dur - TUTORIAL.hold - 2;
    const events: number[] = [];
    for (let i = 0; i < 20 / STEP; i++) {
      step(w, idle(), STEP);
      for (let k = 0; k < w.eventCount; k++) events.push(w.events[k].type);
    }
    expect(stageLeft(w)).toBe(TUTORIAL.hold);
    expect(w.overT).toBe(0);
    expect(events).not.toContain(Ev.TimeUp);
    expect(events).not.toContain(Ev.BossWarn);
    // activé : le chrono repart
    teleport(w, w.totem.x, w.totem.z);
    play(w, g, STAGE.totemCharge + 0.5);
    expect(w.totem.state).toBe(1);
    expect(guideForced(g, w)).toBe(false);
    expect(stageLeft(w)).toBeLessThan(TUTORIAL.hold);
  });

  it('The guided run boss is too strong', () => {
    // même appel du totem dans une partie normale et dans la partie guidée : le boss guidé est renforcé
    const call = (tutorial: boolean) => {
      const w = new World(TUTORIAL.map, { ...tutorialOptions(), tutorial });
      quiet(w);
      teleport(w, w.totem.x, w.totem.z);
      for (let i = 0; i < (STAGE.totemCharge + 0.2) / STEP; i++) step(w, idle(), STEP);
      expect(w.totem.state).toBe(1);
      return w.enemies[w.bossIndex];
    };
    const normal = call(false),
      guided = call(true);
    expect(guided.type).toBe(STAGE.bosses[0]); // le Gardien
    expect(guided.max / normal.max).toBeCloseTo(TUTORIAL.bossHp, 6);
    expect(guided.dmgMul / normal.dmgMul).toBeCloseTo(TUTORIAL.bossDmg * TUTORIAL.dmg, 6);
    expect(guided.max).toBeGreaterThan(ENEMIES[STAGE.bosses[0]].hp * BOSS.hpMul[0] * SPAWN.hpScale(300) * 5);
    // il tue un héros qui ne fait que l'attendre, en moins d'une minute (le héros, increvable le temps d'appeler le
    // boss, repart avec ses PV de départ)
    const w = quiet(tutorialWorld());
    w.powerT[Pw.Gel] = 0;
    w.t = w.stageT = TUTORIAL.forceAt;
    teleport(w, w.totem.x, w.totem.z);
    const g = newGuide(w, true, 0);
    play(w, g, STAGE.totemCharge + 0.1);
    expect(w.totem.state).toBe(1);
    w.player.maxHp = w.player.hp = PLAYER.hp;
    const called = w.t;
    play(w, g, 60);
    expect(w.mode).toBe(Mode.Dead);
    expect(w.t - called).toBeLessThan(60);
    // la feuille « À toi de jouer » : l'or de la partie et la prime (méta)
    const m = fresh();
    const bonus = tutorialEnd(m, Math.round(w.gold));
    expect(bonus).toBe(TUTORIAL.gold);
    expect(m.gold).toBe(Math.round(w.gold) + TUTORIAL.gold);
  });
});

describe('partie guidée : après elle (décisions 7 et 9)', () => {
  it('The guided run counts for neither the streak nor the records', () => {
    const m = fresh();
    const before = JSON.stringify({ streak: m.streak, daily: m.daily, achievements: m.achievements, stats: m.stats });
    tutorialEnd(m, 37);
    expect(m.bestTime).toBe(0);
    expect(m.bestKills).toBe(0);
    expect(JSON.stringify({ streak: m.streak, daily: m.daily, achievements: m.achievements, stats: m.stats })).toBe(
      before,
    );
    expect(m.gold).toBe(37 + TUTORIAL.gold);
    expect(m.runs).toBe(1); // un autre appareil ne la repropose pas
    // rejouée depuis l'Aide : l'or de la partie, sans nouvelle prime
    tutorialEnd(m, 10);
    expect(m.gold).toBe(47 + TUTORIAL.gold);
    expect(m.runs).toBe(1);
  });

  it('After the guided run everything is revealed', () => {
    for (const end of ['finished', 'skipped'] as const) {
      const m = fresh();
      if (end === 'finished') tutorialEnd(m, 0);
      else tutorialSkip(m);
      expect(m.tutorial, end).toBe(end === 'finished' ? 1 : 2);
      expect(tutorialDue(m)).toBe(false);
      // tout dévoilé, sans bannière « Nouveau ! »
      expect(m.reveal).toBe(REVEAL.max);
      expect(revealNews(m, false)).toBeNull();
      const w = new World(1, worldOptions(m, undefined));
      expect(w.reveal).toBe(REVEAL.max);
      expect(w.shrines.length).toBeGreaterThan(0);
      expect(w.skulls.length).toBeGreaterThan(0);
      expect(w.totem.state).toBe(0);
      // les deux parties suivantes sont adoucies, pas la troisième ; le défi du jour n'en consomme pas
      for (let k = 0; k < FIRST_RUNS.afterTutorial; k++) {
        const soft = new World(1, worldOptions(m, undefined));
        expect([soft.softHp, soft.softDmg], `${end} ${k}`).toEqual([FIRST_RUNS.hp, FIRST_RUNS.dmg]);
        softAfterRun(m, { daily: true, t: 300, abandoned: false });
        softAfterRun(m, { daily: false, t: 30, abandoned: true });
        softAfterRun(m, { daily: false, t: 200, abandoned: false });
      }
      const third = new World(1, worldOptions(m, undefined));
      expect([third.softHp, third.softDmg]).toEqual([1, 1]);
    }
  });
});

describe('partie guidée : les consignes uniques (décision 8)', () => {
  it('The portal is explained the first time', () => {
    const m = fresh();
    tutorialEnd(m, 0);
    // première partie autonome : le boss du totem tombe, le portail s'ouvre
    const w = quiet(new World(3, worldOptions(m, undefined)));
    const g = newGuide(w, false, m.hints);
    expect(STEPS[g.step]).toBe('free'); // plus de consigne à geste
    w.clearEvents();
    w.portal.open = true;
    w.emit(Ev.PortalOpen, w.totem.x, 0, w.totem.z, 2);
    updateGuide(g, w, 0);
    expect(g.hint).toBe(Hint.Portal); // consigne (et ralenti : interface)
    const at = { x: 0, z: 0 };
    expect(guideTarget(g, w, at)).toBe(true); // flèche vers le portail
    expect([at.x, at.z]).toEqual([w.totem.x, w.totem.z]);
    m.hints = g.hints; // retenue dans la méta (main.ts : hintShown)
    // arrivée au monde 2 : sa consigne, une fois
    g.hint = -1;
    w.clearEvents();
    w.emit(Ev.StageStart, 0, 0, 0, 2);
    updateGuide(g, w, 0);
    expect(g.hint).toBe(Hint.World);
    m.hints = g.hints;
    // les parties suivantes : plus jamais
    const w2 = quiet(new World(4, worldOptions(m, undefined)));
    const g2 = newGuide(w2, false, m.hints);
    w2.clearEvents();
    w2.emit(Ev.PortalOpen, 0, 0, 0, 2);
    w2.emit(Ev.StageStart, 0, 0, 0, 2);
    updateGuide(g2, w2, 0);
    expect(g2.hint).toBe(-1);
    // une sauvegarde normalisée garde les consignes vues
    expect(normalizeMeta(JSON.parse(JSON.stringify(m))).hints).toBe(m.hints);
  });
});

describe('partie guidée : reprise (décision 10)', () => {
  it('An interrupted guided run resumes at its step (snapshot and guide)', () => {
    const w = quiet(tutorialWorld(7));
    const g = newGuide(w, true, 0);
    guideJump(g, w, Step.Shrine);
    play(w, g, 1);
    // instantané (phase 49) et guide, par le texte comme sur l'appareil
    const snap = JSON.parse(JSON.stringify(snapshotWorld(w)));
    const saved = readGuide(JSON.parse(JSON.stringify(g)));
    expect(saved).not.toBeNull();
    const r = restoreWorld(snap);
    expect(r.tutorial).toBe(true);
    expect(STEPS[saved!.step]).toBe('shrine');
    expect(saved!.target).toBe(g.target);
    // les deux parties continuent à l'identique, guide compris
    play(w, g, 2);
    play(r, saved!, 2);
    expect(JSON.stringify(snapshotWorld(r))).toBe(JSON.stringify(snapshotWorld(w)));
    expect({ ...saved!, hint: 0 }).toEqual({ ...g, hint: 0 });
    // un état illisible ne casse pas la reprise : le guide repart
    expect(readGuide({ step: 'x' })).toBeNull();
  });
});
