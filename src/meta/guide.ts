// Partie guidée (docs/specs/tutoriel.md) : l'automate du guide, pur (ni DOM ni stockage), partagé par l'interface
// (src/ui/tutorial.ts, qui l'affiche) et par la CLI d'équilibrage (le bot y fait les gestes demandés). Il lit le monde et
// ses événements, n'écrit jamais dedans et ne tire aucun nombre de `w.rng` : la simulation reste celle d'une partie
// sans guide. Une étape « geste » ne passe que sur l'événement de la sim que le geste produit (décision 2), le crâne et
// le totem de boss sur leur activation (décision 14) ; seules les étapes « à voir » (la course, le totem du monde)
// passent sur un délai. Aucune allocation par pas : l'état est un objet de nombres, écrit en place.
import { STAGE, TUTORIAL } from '../sim/balance';
import { totemLocked } from '../sim/stages';
import { Ev, Mode } from '../sim/types';
import type { World } from '../sim/world';

/** Étapes, dans l'ordre (décisions 3 et 5). Les clés nomment les textes `tuto.step.<clé>`. */
export const STEPS = [
  'move', // se déplacer
  'fire', // le tir automatique : quelques monstres vaincus
  'gems', // ramasser les cristaux jusqu'au niveau 2
  'cards', // la première feuille de niveau (en pause, raretés expliquées)
  'jump',
  'slide',
  'slideJump', // glisse puis saute en pleine glisse (flèche vers la rampe la plus proche)
  'spell',
  'chest', // un coffre de carte, l'or offert
  'shrine',
  'race', // passer la première arche, ou la regarder GUIDE.race s
  'skull', // l'activer (décision 14)
  'bossTotem', // l'activer (décision 14)
  'totem', // à voir : il ne s'active qu'à TUTORIAL.forceAt (décision 15)
  'free', // seul, avec les consignes de première apparition
] as const;
export const enum Step {
  Move = 0,
  Fire,
  Gems,
  Cards,
  Jump,
  Slide,
  SlideJump,
  Spell,
  Chest,
  Shrine,
  Race,
  Skull,
  BossTotem,
  Totem,
  Free,
}
/** Étapes « geste » : la consigne montre la commande (bouton au doigt, touche au clavier). */
export const GESTURE_STEPS: readonly Step[] = [Step.Move, Step.Jump, Step.Slide, Step.SlideJump, Step.Spell];

/**
 * Consignes de première apparition (décisions 5 et 8), une fois par joueur (bits de `Meta.hints`) : clés des textes
 * `tuto.hint.<clé>`, dans l'ordre des bits, du moins au plus important (deux au même moment : la plus importante).
 */
export const HINTS = ['power', 'elite', 'survival', 'merchant', 'portal', 'world'] as const;
export const enum Hint {
  Power = 0,
  Elite,
  Survival,
  Merchant,
  Portal,
  World,
}
/** Tous les bits de consignes : un joueur d'avant la partie guidée les a toutes « vues ». */
export const ALL_HINTS = (1 << HINTS.length) - 1;

export const GUIDE = {
  move: 4, // u parcourus pour l'étape du déplacement
  kills: 5, // monstres vaincus pour l'étape du tir automatique
  see: 10, // s : l'étape « à voir » du totem du monde
  race: 20, // s : la course passe aussi à la regarder
};

/** État du guide d'une partie (sauvegardé avec elle : phase 49, décision 10). Uniquement des nombres. */
export interface GuideState {
  tutorial: boolean; // partie guidée ; sinon seules les consignes de première apparition jouent
  step: Step;
  t: number; // s de jeu passées dans l'étape
  base: number; // repère de l'étape (distance ou kills au début)
  target: number; // index du lieu montré (coffre, sanctuaire, course, crâne, totem de boss) ; -1 aucun
  cards: boolean; // la première feuille de niveau a été expliquée
  hints: number; // consignes déjà montrées (bits de HINTS) : celles du joueur, plus celles de cette partie
  hint: number; // consigne apparue à ce pas (index dans HINTS), à afficher puis remettre à -1 ; -1 aucune
  elite: number; // heure de la prochaine élite connue (w.nextElite) : quand elle avance, une élite vient d'apparaître
  portal: boolean; // la flèche montre le portail (après sa consigne, jusqu'au monde suivant)
}

export function newGuide(w: World, tutorial: boolean, hints: number): GuideState {
  const g: GuideState = {
    tutorial,
    step: tutorial ? Step.Move : Step.Free,
    t: 0,
    base: w.distance,
    target: -1,
    cards: !tutorial,
    hints: tutorial ? 0 : hints,
    hint: -1,
    elite: w.nextElite,
    portal: false,
  };
  return g;
}

/** Garde un état lu dans une sauvegarde (jamais cru tel quel) ; null s'il est illisible. */
export function readGuide(raw: unknown): GuideState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (typeof o.tutorial !== 'boolean' || !n(o.step) || !n(o.t) || !n(o.base) || !n(o.target) || !n(o.hints))
    return null;
  if (!n(o.elite) || typeof o.cards !== 'boolean' || typeof o.portal !== 'boolean') return null;
  return {
    tutorial: o.tutorial,
    step: Math.max(0, Math.min(Step.Free, Math.floor(o.step as number))) as Step,
    t: o.t as number,
    base: o.base as number,
    target: Math.floor(o.target as number),
    cards: o.cards,
    hints: (o.hints as number) & ALL_HINTS,
    hint: -1,
    elite: o.elite as number,
    portal: o.portal,
  };
}

/** Le totem du monde attend le joueur : à 2 minutes de la fin de la partie guidée (décision 6). */
export function guideForced(g: GuideState, w: World): boolean {
  return g.tutorial && w.stage === 0 && w.totem.state === 0 && !w.endless && w.stageT >= TUTORIAL.forceAt;
}

/**
 * Décision 15 : le joueur est dans le cercle du totem du monde avant son tour ; l'interface dit « Pas encore : ce sera
 * le dernier défi de la partie ».
 */
export function guideTotemWait(g: GuideState, w: World): boolean {
  if (!g.tutorial || !totemLocked(w) || w.totem.state !== 0) return false;
  return (w.totem.x - w.player.x) ** 2 + (w.totem.z - w.player.z) ** 2 < STAGE.totemR * STAGE.totemR;
}

/** Index du lieu le plus proche du joueur dans une liste (filtré par `ok`), -1 s'il n'y en a pas. */
function nearest<T extends { x: number; z: number }>(w: World, list: readonly T[], ok: (p: T) => boolean): number {
  let best = -1,
    bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!ok(p)) continue;
    const d = (p.x - w.player.x) ** 2 + (p.z - w.player.z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
function nearestRace(w: World): number {
  let best = -1,
    bd = Infinity;
  for (let i = 0; i < w.races.length; i++) {
    const r = w.races[i];
    if (r.state !== 0) continue;
    const d = (r.sx - w.player.x) ** 2 + (r.sz - w.player.z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
/** Haut d'une rampe (là où la descente commence) : la pente du saut glissé. */
const rampTopX = (m: { x0: number; x1: number; h0: number; h1: number }) => (m.h0 >= m.h1 ? m.x0 : m.x1);
const rampTopZ = (m: { z0: number; z1: number; h0: number; h1: number }) => (m.h0 >= m.h1 ? m.z0 : m.z1);
function nearestRamp(w: World): number {
  let best = -1,
    bd = Infinity;
  for (let i = 0; i < w.ramps.length; i++) {
    const m = w.ramps[i];
    const d = (rampTopX(m) - w.player.x) ** 2 + (rampTopZ(m) - w.player.z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
const closedChest = (c: { open: boolean }) => !c.open;
const freeShrine = (s: { used: boolean }) => !s.used;
const offSkull = (s: { on: boolean }) => !s.on;

/** Entrée dans une étape : repères, lieu montré. Une étape de lieu sans lieu sur la carte passe tout de suite. */
function enter(g: GuideState, w: World, s: Step): void {
  g.step = s;
  g.t = 0;
  g.target = -1;
  g.base = s === Step.Move ? w.distance : w.kills;
  // coffre : déjà ouvert pendant les gestes (le seul offert), il n'y a rien à apprendre ni d'or à promettre
  if (s === Step.Chest) g.target = w.mapChestsOpened < TUTORIAL.freeChests ? nearest(w, w.mapChests, closedChest) : -1;
  else if (s === Step.Shrine) g.target = nearest(w, w.shrines, freeShrine);
  else if (s === Step.Race) g.target = nearestRace(w);
  else if (s === Step.SlideJump) g.target = nearestRamp(w);
  // crâne, totem de boss : déjà activé avant l'étape, la leçon est apprise (comme le coffre)
  else if (s === Step.Skull) g.target = w.skullsOn > 0 ? -1 : nearest(w, w.skulls, offSkull);
  else if (s === Step.BossTotem) g.target = w.bossTotemsOn > 0 ? -1 : nearest(w, w.bossTotems, offSkull);
}
const PLACE_STEPS: readonly Step[] = [Step.Chest, Step.Shrine, Step.Race, Step.Skull, Step.BossTotem];

/** L'étape est-elle franchie par un événement de ce pas ? */
function passedBy(g: GuideState, w: World, type: Ev, y2: number): boolean {
  switch (g.step) {
    case Step.Jump:
      return type === Ev.Jump;
    case Step.Slide:
      return type === Ev.SlideStart;
    case Step.SlideJump:
      return type === Ev.Jump && w.player.slideJump; // saut pris en pleine glisse (step.ts)
    case Step.Spell:
      return type === Ev.Spell && y2 === 0; // le lancer, pas l'impact
    case Step.Chest:
      return type === Ev.MapChestOpen;
    case Step.Shrine:
      return type === Ev.ShrineDone;
    case Step.Race:
      return type === Ev.RaceStart;
    case Step.Skull:
      return type === Ev.SkullOn;
    case Step.BossTotem:
      return type === Ev.BossTotemOn;
    case Step.Totem:
      return type === Ev.TotemOn;
    default:
      return false;
  }
}

/** Consigne de première apparition : une fois par joueur. */
function fire(g: GuideState, h: Hint): void {
  const bit = 1 << h;
  if (g.hints & bit || g.hint > h) return; // une consigne plus importante attend déjà d'être affichée (ordre de HINTS)
  if (g.hint >= 0) g.hints &= ~(1 << g.hint); // la moins importante reviendra à sa prochaine apparition
  g.hints |= bit;
  g.hint = h;
}

/**
 * Après un pas de la sim (ses événements sont dans w.events) : avance le guide. `dt` = temps de jeu du pas (0 pendant une
 * feuille). Renvoie vrai si l'étape a changé (l'interface met alors ses textes à jour). Aucune allocation.
 */
export function updateGuide(g: GuideState, w: World, dt: number): boolean {
  const before = g.step;
  // consignes de première apparition (sans arrêter le jeu)
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    if (e.type === Ev.PowerDrop) fire(g, Hint.Power);
    else if (e.type === Ev.SurvivalWarn && e.x2 !== 1) fire(g, Hint.Survival);
    else if (e.type === Ev.MerchantArrive) fire(g, Hint.Merchant);
    else if (e.type === Ev.PortalOpen) {
      g.elite = w.nextElite; // décision 18 : la chute du chrono décale l'élite suivante, ce n'est pas une élite apparue
      if (!(g.hints & (1 << Hint.Portal))) {
        fire(g, Hint.Portal);
        g.portal = true;
      }
    } else if (e.type === Ev.StageStart) {
      g.portal = false;
      fire(g, Hint.World);
    }
    if (g.step !== Step.Free && passedBy(g, w, e.type, e.y2)) enter(g, w, (g.step + 1) as Step);
  }
  if (w.nextElite !== g.elite) {
    if (w.nextElite > g.elite && w.stageT > 0) fire(g, Hint.Elite);
    g.elite = w.nextElite;
  }
  if (g.portal && !w.portal.open) g.portal = false;
  if (g.step === Step.Free) return g.step !== before;
  g.t += dt;
  // trop lent : à 8:00 le totem passe avant tout le reste (décision 6)
  if (guideForced(g, w)) {
    enter(g, w, Step.Free);
    return true;
  }
  switch (g.step) {
    case Step.Move:
      if (w.distance - g.base >= GUIDE.move) enter(g, w, Step.Fire);
      break;
    case Step.Fire:
      if (w.kills - g.base >= GUIDE.kills) enter(g, w, Step.Gems);
      break;
    case Step.Gems:
      if (w.player.level >= 2 || w.mode === Mode.LevelUp) enter(g, w, Step.Cards);
      break;
    case Step.Cards:
      if (g.cards && w.mode === Mode.Play) enter(g, w, Step.Jump);
      break;
    case Step.Race:
      if (g.t >= GUIDE.race) enter(g, w, Step.Skull);
      break;
    case Step.Totem:
      if (g.t >= GUIDE.see) enter(g, w, Step.Free);
      break;
  }
  // une étape de lieu sans lieu (tout ouvert, carte sans crâne…) ne bloque pas le guide
  while (PLACE_STEPS.includes(g.step) && g.target < 0) enter(g, w, (g.step + 1) as Step);
  if (g.step === Step.Totem && w.totem.state !== 0) enter(g, w, Step.Free);
  return g.step !== before;
}

/** Crochets de débogage (e2e, captures) : saute à l'étape `s`, comme si les précédentes étaient franchies. */
export function guideJump(g: GuideState, w: World, s: Step): void {
  enter(g, w, Math.max(0, Math.min(Step.Free, s)) as Step);
  if (s > Step.Cards) g.cards = true;
}

/** La première feuille de niveau vient d'être choisie : l'étape des cartes peut passer. */
export function guideCardsDone(g: GuideState): void {
  g.cards = true;
}

/**
 * Où pointe la flèche (x, z dans `out`) : le lieu de l'étape, le totem du monde à 8:00, le portail après sa consigne.
 * Faux s'il n'y a rien à montrer.
 */
export function guideTarget(g: GuideState, w: World, out: { x: number; z: number }): boolean {
  if (guideForced(g, w) || (g.portal && w.portal.open) || (g.step === Step.Totem && w.totem.state === 0)) {
    out.x = w.totem.x;
    out.z = w.totem.z;
    return true;
  }
  const i = g.target;
  if (i < 0) return false;
  switch (g.step) {
    case Step.Chest: {
      const c = w.mapChests[i];
      if (!c || c.open) return false;
      out.x = c.x;
      out.z = c.z;
      return true;
    }
    case Step.Shrine: {
      const s = w.shrines[i];
      if (!s || s.used) return false;
      out.x = s.x;
      out.z = s.z;
      return true;
    }
    case Step.SlideJump: {
      const m = w.ramps[i];
      if (!m) return false;
      out.x = rampTopX(m);
      out.z = rampTopZ(m);
      return true;
    }
    case Step.Race: {
      const r = w.races[i];
      if (!r) return false;
      out.x = r.sx;
      out.z = r.sz;
      return true;
    }
    case Step.Skull: {
      const s = w.skulls[i];
      if (!s) return false;
      out.x = s.x;
      out.z = s.z;
      return true;
    }
    case Step.BossTotem: {
      const b = w.bossTotems[i];
      if (!b) return false;
      out.x = b.x;
      out.z = b.z;
      return true;
    }
    default:
      return false;
  }
}
