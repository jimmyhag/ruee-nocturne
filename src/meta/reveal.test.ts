// Lot L2 (docs/specs/l2-premieres-parties.md) : dévoilement progressif côté méta. Compteur `reveal` (une étape par partie
// finie, jamais au-delà de REVEAL.max), moment « Nouveau ! » une fois par étape, défi du jour à part, et surtout la
// migration : un joueur qui a déjà joué ne perd rien, ni sur l'appareil ni par le nuage.
import { describe, expect, it } from 'vitest';
import { REVEAL } from '../sim/balance';
import { World } from '../sim/world';
import { TOTEM_HIDDEN } from '../sim/poi';
import { snapshotWorld } from '../sim/snapshot';
import { DEFAULT_META, normalizeMeta, resetProgress } from './save';
import type { Meta } from './save';
import { REVEAL_KEYS, revealAfterRun, revealNews } from './reveal';
import { worldOptions } from './shop';
import { progressOf, withProgress } from './sync';

const fresh = () => normalizeMeta(DEFAULT_META);

/**
 * Sauvegarde réelle d'avant le lot L2 (forme écrite par la 1.57.0 : version 5, pas de `reveal`), d'un joueur qui a fait
 * douze parties : or, succès, personnages, tenues, emplacements, Bibliothèque, défis par personnage.
 */
const BEFORE_L2 = {
  version: 5,
  bestTime: 612.4,
  bestKills: 1408,
  runs: 12,
  totalKills: 9311,
  muted: false,
  reducedFx: false,
  fxChosen: false,
  gold: 1873.25,
  goldEarned: 6420,
  stats: {
    kills: 9311,
    dards: 1204,
    elites: 31,
    bosses: 4,
    triples: 6,
    wins: 0,
    bestTime: 612.4,
    runs: 12,
    noHitBest: 41.5,
    distanceBest: 2140.2,
    weaponLvBest: 17,
    slideDist: 860.4,
    tricksBest: 3,
    mapChests: 14,
    bestStage: 2,
    endlessBest: 0,
  },
  achievements: ['survie3', 'survie10', 'kills500', 'dards100'],
  bought: ['bucheron'],
  character: 'bucheron',
  outfits: ['eclaireuse'],
  outfit: { eclaireuse: 1 },
  daily: { date: '2026-11-16', times: [301.2, 188.7] },
  slots: { weapons: 2, passives: 3, rerolls: 1 },
  unlocks: ['w:boomerang', 'i:phenix'],
  itemsOff: [],
  codex: { 'w:orbe': 9, 'w:lames': 3, 't:degats': 5 },
  chars: {},
  pseudo: '',
  seenReset: true,
  seenHelp: true,
  seenNotes: '1.57.0',
  settings: {
    vibrate: true,
    hudScale: 1,
    lefty: false,
    lang: 'fr',
    quality: 'auto',
    sfxVol: 1,
    musicVol: 0.7,
    keys: {},
  },
};
/** Ce qui ne doit pas bouger quand le jeu charge une sauvegarde. */
const kept = (m: Meta) => ({
  gold: m.gold,
  goldEarned: m.goldEarned,
  achievements: m.achievements,
  bought: m.bought,
  character: m.character,
  outfits: m.outfits,
  slots: m.slots,
  unlocks: m.unlocks,
  codex: m.codex,
  stats: m.stats,
  runs: m.runs,
  bestTime: m.bestTime,
});

/** Partie finie : mort ou victoire (t s de jeu). */
const finish = (m: Meta, t = 200) => revealAfterRun(m, { daily: false, t, abandoned: false });

describe('dévoilement progressif : méta (lot L2)', () => {
  it('a new player starts with nothing revealed and no announcement', () => {
    const m = fresh();
    expect(m.reveal).toBe(0);
    expect(revealNews(m, false)).toBeNull();
    expect(worldOptions(m, ['orbe']).reveal).toBe(0);
  });

  it('A system is revealed with a "New!" moment', () => {
    const m = fresh();
    finish(m);
    expect(m.reveal).toBe(1);
    // au lancement de la deuxième partie : la glisse est dans le monde, et annoncée une fois
    expect(worldOptions(m, ['orbe']).reveal).toBe(REVEAL.slide);
    expect(revealNews(m, false)).toBe('slide');
    expect(revealNews(m, false)).toBeNull(); // la partie suivante au même dévoilement n'annonce plus rien
    // le défi du jour n'annonce rien (tout y est dévoilé)
    finish(m);
    expect(revealNews(m, true)).toBeNull();
    expect(revealNews(m, false)).toBe('shrines');
  });

  it('Everything is revealed by the fifth run', () => {
    const m = fresh();
    const news: (string | null)[] = [];
    for (let run = 1; run <= 4; run++) {
      news.push(revealNews(m, false));
      finish(m);
    }
    expect(m.reveal).toBe(REVEAL.max);
    expect(revealNews(m, false)).toBe('totem');
    expect(news).toEqual([null, 'slide', 'shrines', 'merchant']);
    expect(REVEAL_KEYS).toEqual(['slide', 'shrines', 'merchant', 'totem']);
    const w = new World(5, worldOptions(m, ['orbe']));
    expect(w.reveal).toBe(REVEAL.max);
    expect(w.shrines.length).toBeGreaterThan(0);
    expect(w.skulls.length).toBeGreaterThan(0);
    expect(w.bossTotems.length).toBeGreaterThan(0);
    expect(w.totem.state).toBe(0);
    // jamais au-delà
    for (let run = 0; run < 5; run++) finish(m);
    expect(m.reveal).toBe(REVEAL.max);
  });

  it('an abandon counts only after a minute of play, a daily challenge never', () => {
    const m = fresh();
    revealAfterRun(m, { daily: false, t: REVEAL.abandonAfter - 1, abandoned: true });
    expect(m.reveal).toBe(0);
    revealAfterRun(m, { daily: false, t: REVEAL.abandonAfter, abandoned: true });
    expect(m.reveal).toBe(1);
    revealAfterRun(m, { daily: false, t: 20, abandoned: false }); // une mort compte même très tôt
    expect(m.reveal).toBe(2);
    revealAfterRun(m, { daily: true, t: 400, abandoned: false });
    expect(m.reveal).toBe(2);
  });

  it('A player who had already played keeps everything', () => {
    const before = JSON.parse(JSON.stringify(BEFORE_L2)) as Record<string, unknown>;
    const m = normalizeMeta(before);
    expect(m.reveal).toBe(REVEAL.max);
    expect(revealNews(m, false)).toBeNull(); // joueur ancien : aucune bannière
    // or, succès, personnages et emplacements inchangés (comme la sauvegarde d'avant, normalisée sans le lot)
    expect(kept(m)).toEqual(kept(normalizeMeta({ ...before, reveal: REVEAL.max })));
    expect(m.gold).toBe(1873.25);
    expect(m.achievements).toEqual(['survie3', 'survie10', 'kills500', 'dards100']);
    expect(m.bought).toEqual(['bucheron']);
    expect(m.slots).toEqual({ weapons: 2, passives: 3, rerolls: 1 });
    // la sim reçoit tout : aucun système retiré
    const w = new World(8, worldOptions(m, ['orbe']));
    expect(snapshotWorld(w)).toEqual(snapshotWorld(new World(8, { ...worldOptions(m, ['orbe']), reveal: undefined })));
    // relue après une sauvegarde (le champ existe désormais) : toujours tout
    expect(normalizeMeta(JSON.parse(JSON.stringify(m))).reveal).toBe(REVEAL.max);
    // sauvegardes plus anciennes : sans partie jouée on part de zéro ; d'avant la phase 10 avec des parties, rien ne disparaît
    expect(normalizeMeta({ ...before, runs: 0, stats: { ...BEFORE_L2.stats, runs: 0 } }).reveal).toBe(0);
    const v2 = normalizeMeta({ version: 2, runs: 4 });
    expect(v2.reveal).toBe(REVEAL.max);
    expect(revealNews(v2, false)).toBeNull();
    expect(normalizeMeta({ version: 2, runs: 0 }).reveal).toBe(0);
    // un champ hostile est borné
    expect(normalizeMeta({ ...before, reveal: 99 }).reveal).toBe(REVEAL.max);
    expect(normalizeMeta({ ...before, reveal: -3 }).reveal).toBe(0);
    expect(normalizeMeta({ ...before, reveal: 'x' }).reveal).toBe(REVEAL.max); // illisible : migration
  });

  it('A cloud progression from an old client keeps everything', () => {
    // progression écrite par un ancien client (1.57.0) : pas de champ de dévoilement, des parties jouées
    const old = progressOf(normalizeMeta(BEFORE_L2)) as unknown as Record<string, unknown>;
    delete old.reveal;
    const device = fresh(); // nouvel appareil, rien joué
    const m = withProgress(device, JSON.parse(JSON.stringify(old)));
    expect(m.reveal).toBe(REVEAL.max);
    expect(revealNews(m, false)).toBeNull(); // pas de bannière pour un joueur ancien
    expect(m.gold).toBe(1873.25);
    // un appareil qui a joué reçoit la même chose
    const played = fresh();
    finish(played);
    expect(withProgress(played, old).reveal).toBe(REVEAL.max);
  });

  it('the cloud merge keeps the larger reveal of the two', () => {
    const local = fresh();
    finish(local);
    finish(local); // 2 sur cet appareil
    const other = fresh();
    finish(other); // 1 sur l'autre
    expect(withProgress(local, progressOf(other)).reveal).toBe(2);
    finish(other);
    finish(other);
    finish(other); // 4 sur l'autre
    const m = withProgress(local, progressOf(other));
    expect(m.reveal).toBe(4);
    expect(revealNews(m, false)).toBeNull(); // dévoilé (et annoncé) sur l'autre appareil
    // l'étape gagnée ici et pas encore annoncée le reste quand le nuage n'apporte rien de plus
    const here = fresh();
    finish(here);
    const back = withProgress(here, progressOf(here));
    expect(revealNews(back, false)).toBe('slide');
  });

  it('a progress reset never takes a system away', () => {
    const m = normalizeMeta(BEFORE_L2);
    const r = resetProgress(m);
    expect(r.runs).toBe(0);
    expect(r.reveal).toBe(REVEAL.max);
    expect(revealNews(r, false)).toBeNull();
  });

  it('The daily challenge is the same for everyone', () => {
    const newcomer = fresh();
    const veteran = normalizeMeta(BEFORE_L2);
    const a = worldOptions(newcomer, ['orbe'], true);
    const b = worldOptions(veteran, ['orbe', 'lames', 'boomerang'], true);
    expect(a).toEqual(b);
    expect(a.reveal).toBeUndefined(); // absent = tout dévoilé
    const seed = 424242; // même graine du jour pour tous (main.ts : mapSeedFor)
    const wa = new World(seed, a),
      wb = new World(seed, b);
    expect(wa.reveal).toBe(REVEAL.max);
    expect(wa.shrines.length).toBeGreaterThan(0);
    expect(wa.skulls.length).toBeGreaterThan(0);
    expect(wa.totem.state).toBe(TOTEM_HIDDEN); // lot L3 : le défi se joue au monde 1 seul, sans le totem du passage
    expect(wa.softHp).toBe(1);
    expect(snapshotWorld(wa)).toEqual(snapshotWorld(wb));
    // le dévoilement du nouveau joueur n'avance pas
    revealAfterRun(newcomer, { daily: true, t: 300, abandoned: false });
    expect(newcomer.reveal).toBe(0);
    expect(revealNews(newcomer, true)).toBeNull();
  });
});
