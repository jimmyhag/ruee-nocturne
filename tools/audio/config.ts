// Phase 36 : sons du jeu, choisis dans des banques libres et traités par tools/audio/build.ts.
// Chaque clé est un son du jeu ; ses fichiers sont des variantes (une tirée au hasard à chaque lecture).
// Changer un son : modifier ses fichiers ici, puis `npm run audio`. Licences : voir CREDITS.md.

export const SOURCES = {
  /** Kenney « Impact Sounds », CC0. */
  kimpact: { repo: 'https://github.com/Boyquotes/kenney-impact-sounds-for-godot', dir: 'addons/kenney impact sounds' },
  /** Kenney « RPG Audio », CC0. */
  krpg: { repo: 'https://github.com/Boyquotes/kenney-rpg-audio-for-godot', dir: 'addons/kenney rpg audio' },
  /** Kenney « Digital Audio », CC0. */
  kdigital: { repo: 'https://github.com/Boyquotes/kenney-digital-audio-for-godot', dir: 'addons/kenney digital audio' },
  /** Oculus Audio Pack 01 (Meta Open Sound), CC BY 4.0 : crédit obligatoire (CREDITS.md, À propos). */
  oculus: { repo: 'https://github.com/facebookincubator/Meta-open-sound', dir: 'corpora/oculus-audio-pack/ogg' },
  /** HoliznaCC0, album « Background Music » (Free Music Archive), CC0. */
  holizna: {
    repo: 'https://github.com/C-C-Minetest-Server/phonograph_albumm_holiznacc0',
    dir: 'phonographs/001-background-music',
  },
} as const;
export type SourceKey = keyof typeof SOURCES;

/** Catégorie : fixe le niveau cible (loudness intégrée, LUFS) pour que rien ne claque plus fort que le reste. */
export const LEVELS = {
  weapon: -22, // tirs : fréquents, en retrait
  impact: -21, // coups et kills
  hero: -19, // ce qui arrive au héros (coup reçu, saut)
  enemy: -21, // attaques ennemies (graves, distinctes du héros)
  reward: -17, // ramassage, coffres, niveau : ce qu'on veut entendre
  ui: -20,
  boss: -16,
} as const;
export type Level = keyof typeof LEVELS;

export interface SoundDef {
  src: SourceKey;
  files: string[]; // variantes (noms dans SOURCES[src].dir)
  level: Level;
  max: number; // s : longueur maximale gardée (fondu de sortie)
  rate?: number; // vitesse de lecture appliquée à la fabrication (≠ 1 : plus grave ou plus aigu)
}

const n = (base: string, ids: number[], pad = 2, ext = '.ogg') =>
  ids.map((i) => `${base}${String(i).padStart(pad, '0')}${ext}`);
const oc = (base: string, ids: number[]) => n(`${base}_OS_`, ids);
const ki = (base: string, ids: number[]) => n(`${base}_`, ids, 3);

export const SOUNDS: Record<string, SoundDef> = {
  // armes du héros
  orb: { src: 'oculus', files: oc('WHSH_WhooshSmall', [1, 2, 3]), level: 'weapon', max: 0.35, rate: 1.25 },
  blade: {
    src: 'krpg',
    files: ['knife_slice.ogg', 'knife_slice_2.ogg', 'draw_knife_1.ogg', 'draw_knife_2.ogg'],
    level: 'weapon',
    max: 0.35,
  },
  bolt: { src: 'kdigital', files: ['zap_1.ogg', 'zap_2.ogg'], level: 'weapon', max: 0.3, rate: 0.8 },
  throw: { src: 'oculus', files: oc('SWSH_Swoosh', [1, 2, 3, 4]), level: 'weapon', max: 0.45 },
  blast: { src: 'oculus', files: oc('FGHTImpt_Kick', [1, 2, 3]), level: 'impact', max: 0.6, rate: 0.6 },
  scythe: { src: 'oculus', files: oc('WEAPSwrd_Sword', [1, 2]), level: 'weapon', max: 0.5 },
  lance: { src: 'oculus', files: oc('WEAPSwrd_SwordScrape', [1, 2]), level: 'weapon', max: 0.3, rate: 1.3 },
  meteorWarn: { src: 'oculus', files: oc('WHSH_WhooshMedium', [1, 2]), level: 'weapon', max: 0.7, rate: 0.7 },
  spell: { src: 'oculus', files: oc('MAGSpel_MagicSpell', [1]), level: 'hero', max: 0.7 },
  // coups et kills (squelettes : os qui cassent)
  hit: { src: 'kimpact', files: ki('impact_soft_medium', [0, 1, 2, 3, 4]), level: 'impact', max: 0.2 },
  kill: { src: 'oculus', files: oc('GOREBone_BonesBreaking', [1, 2, 3]), level: 'impact', max: 0.3 },
  killElite: { src: 'oculus', files: oc('GOREBone_SkullCracking', [1, 2]), level: 'impact', max: 0.5 },
  bossHit: { src: 'oculus', files: oc('DSGNImpt_ImpactCreepyReverb', [1, 2]), level: 'boss', max: 1.3 },
  bossRoar: { src: 'oculus', files: oc('CREAMnstr_CreatureCreepyReverb', [1, 2]), level: 'boss', max: 1.3 },
  // le héros
  hurt: { src: 'kimpact', files: ki('impact_punch_heavy', [0, 1, 2, 3, 4]), level: 'hero', max: 0.35 },
  jump: { src: 'oculus', files: oc('CLOTHMvmt_MovementWithGear', [1, 2, 3, 4]), level: 'hero', max: 0.3 },
  land: { src: 'kimpact', files: ki('footstep_grass', [0, 1, 2, 3, 4]), level: 'hero', max: 0.25 },
  slide: { src: 'oculus', files: oc('CLOTHMvmt_ClothingMovement', [1, 2, 3, 4]), level: 'hero', max: 0.5 },
  launch: { src: 'oculus', files: oc('WHSH_WhooshMedium', [1, 2]), level: 'hero', max: 0.5, rate: 1.1 },
  // récompenses
  gem: { src: 'oculus', files: oc('UIAlert_MusicTone', [1]), level: 'reward', max: 0.3 },
  coin: { src: 'krpg', files: ['handle_coins.ogg', 'handle_coins_2.ogg'], level: 'reward', max: 0.5 },
  levelUp: { src: 'oculus', files: oc('MUSCStngr_LevelUpMallet', [1]), level: 'reward', max: 1.4 },
  chest: { src: 'oculus', files: oc('MUSCStngr_VictoryMallet', [1]), level: 'reward', max: 1.5 },
  evolve: { src: 'oculus', files: oc('MUSCStngr_LevelUpOrchestral', [1]), level: 'reward', max: 1.8 },
  trick: { src: 'oculus', files: oc('UIClick_MagicalConfirm', [1]), level: 'reward', max: 0.8 },
  shrine: { src: 'oculus', files: n('MUSCChim_WindChimes_LOOP_', [1]), level: 'reward', max: 1.2 },
  combo: { src: 'oculus', files: oc('UIAlert_MusicTone', [3]), level: 'reward', max: 0.6 },
  powerDrop: { src: 'oculus', files: oc('UIAlert_Notification', [1]), level: 'ui', max: 0.6 },
  powerAimant: { src: 'oculus', files: oc('MAGSpel_MagicSpell', [2]), level: 'reward', max: 0.9 },
  powerOr: { src: 'oculus', files: n('OBJCoin_CoinsUI_LOOP_', [1]), level: 'reward', max: 0.8 },
  powerVitesse: { src: 'oculus', files: oc('WHSH_WhooshMedium', [1]), level: 'reward', max: 0.6, rate: 1.3 },
  powerGel: { src: 'oculus', files: oc('CLOCKTick_ClockCreepyReverb', [1]), level: 'reward', max: 1.2 },
  powerRage: { src: 'oculus', files: oc('CREAHmn_OgreEffort', [1]), level: 'reward', max: 0.9 },
  victory: { src: 'oculus', files: oc('MUSCStngr_VictoryOrchestral', [1]), level: 'boss', max: 3 },
  death: { src: 'oculus', files: oc('MUSCStngr_LossOrchestral', [1]), level: 'boss', max: 2.5 },
  // dangers ennemis (plus graves que le héros)
  spit: { src: 'oculus', files: oc('GORESqsh_BloodSquishSlimy', [1, 2, 3]), level: 'enemy', max: 0.35 },
  arrow: { src: 'oculus', files: oc('SWSH_Swoosh', [5, 6]), level: 'enemy', max: 0.3, rate: 1.4 },
  cast: { src: 'oculus', files: oc('MAGSpel_MagicSpell', [1]), level: 'enemy', max: 0.7, rate: 0.7 },
  eruption: { src: 'oculus', files: oc('FGHTImpt_PunchHardest', [1]), level: 'enemy', max: 0.6, rate: 0.6 },
  ring: { src: 'oculus', files: oc('DSGNDron_DroneCreepy', [1]), level: 'enemy', max: 0.9 },
  charge: { src: 'oculus', files: oc('CREAHmn_TrollEffort', [1]), level: 'enemy', max: 0.7 },
  dive: { src: 'oculus', files: oc('WHSH_WhooshMedium', [2]), level: 'enemy', max: 0.6, rate: 0.85 },
  shield: { src: 'oculus', files: oc('METLImpt_MetalHitSurface', [1, 2]), level: 'impact', max: 0.4 },
  thud: { src: 'kimpact', files: ki('impact_wood_heavy', [0, 1]), level: 'impact', max: 0.4 },
  // interface
  click: { src: 'oculus', files: oc('UIClick_MagicalConfirm', [1]), level: 'ui', max: 0.6 },
  pick: { src: 'oculus', files: oc('UIClick_CasualMusicalConfirm', [1]), level: 'ui', max: 0.6 },
  pickNew: { src: 'oculus', files: oc('UIClick_MagicalOpen', [1]), level: 'ui', max: 0.8 },
  error: { src: 'oculus', files: oc('UIAlert_WoodError', [1]), level: 'ui', max: 0.6 },
  whoosh: { src: 'oculus', files: oc('WHSH_WhooshSmall', [1]), level: 'ui', max: 0.4 },
};

/** Musiques (stéréo) et ambiance : un fichier chacune. */
export const TRACKS = {
  game: {
    src: 'holizna' as SourceKey,
    file: 'phonograph_album_holiznacc0_001-05-dangerous-voyage.ogg',
    lufs: -18,
    kbps: 80,
    stereo: true,
  },
  menu: {
    src: 'holizna' as SourceKey,
    file: 'phonograph_album_holiznacc0_001-01-creppy-piano-1.ogg',
    lufs: -20,
    kbps: 96,
    stereo: true,
  },
  night: { src: 'oculus' as SourceKey, file: 'AMBForst_Night_LOOP_01.ogg', lufs: -30, kbps: 64, stereo: false },
};

/** Budgets (octets) vérifiés par src/platform/sfx.test.ts. */
export const BUDGET = { sfx: 450_000, track: 2_200_000 };
