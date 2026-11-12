import {
  ELITE_TYPE,
  ENDLESS,
  ENEMIES,
  ITEM_KEYS,
  MAP,
  POWER_KEYS,
  REAPER_TYPE,
  SLIDE,
  STAGE,
  STEP,
} from './sim/balance';
import { startRun, step } from './sim/step';
import { Ev, Mode, Pw, Spell, HIT_CRIT, HitSrc } from './sim/types';
import { POWER_ICON } from './ui/icons';
import type { Input } from './sim/types';
import { World } from './sim/world';
import type { GameScene } from './render/scene';
import { PAL } from './render/palette';
import { FEEL, HitStop } from './render/feel';
import { InputManager } from './platform/input';
import { AudioBus } from './platform/audio';
import { Hud, flashCard, gearHtml, renderCards } from './ui/hud';
import { statsHTML } from './ui/stats';
import { LANG_SETTINGS, fmtTime, getLang, has, ordinal, resolveLang, setLang, t } from './i18n';
import { achName, achUnlock, itemName, synergyName } from './ui/cards';
import { canGainItem } from './sim/items';
import { MERCHANT_LEAVE, MERCHANT_REROLL, rerollCost } from './sim/merchant';
import { LEVEL_REROLL, canReroll } from './sim/progression';
import { startEndless } from './sim/stages';
import type { Achievement } from './meta/achievements';
import {
  exportMeta,
  importMeta,
  loadMeta,
  onMetaSaved,
  normalizeMeta,
  peekMeta,
  saveMeta,
  resetProgress,
  QUALITY_SETTINGS,
} from './meta/save';
import type { Meta } from './meta/save';
import {
  SYNC,
  decide,
  loadSyncRecord,
  progressOf,
  saveSyncRecord,
  summary,
  toCloudDoc,
  withProgress,
} from './meta/sync';
import type { CloudDoc, SyncRecord } from './meta/sync';
import { errorKey, initialAccountView, renderAccount } from './ui/account';
import { initialBoardState, renderBoard, viewOf } from './ui/board';
import { BOARD, cleanPseudo, isoWeek, suggestPseudo } from './meta/board';
import type { RunScore } from './meta/board';
import type { Account, AccountUser } from './platform/account'; // type seulement : firebase reste dans son chunk
import {
  checkAchievements,
  dailyUnlocked,
  missingTime,
  unlockedCharacters,
  unlockedWeapons,
} from './meta/achievements';
import {
  buyCharacter,
  buyOutfit,
  buyReroll,
  buySlot,
  masterOutfit,
  nextSlot,
  outfitOf,
  worldOptions,
} from './meta/shop';
import { buyUnlock, recordCodex, toggleItem } from './meta/library';
import { addCharRun, runCharStats } from './meta/chars';
import type { LibKind } from './meta/library';
import { LIB_TABS, renderLibrary } from './ui/library';
import { initKeySettings, loadKeyboardLayout, renderKeyHints } from './ui/keys';
import type { LibTab } from './ui/library';
import { dailyBest, dailySeed, dailyTimes, msToNextDaily, recordDaily, todayKey } from './meta/daily';
import type { PatchNote } from './meta/patch-notes';
import { hasUnseenNotes, renderNotes } from './ui/notes';
import { hashString } from './sim/rng';
import { MapView } from './ui/minimap';
import {
  bestLine,
  esc,
  renderAchievements,
  renderCharacters,
  renderProgress,
  renderRerolls,
  renderSlots,
  slotCondition,
  slotName,
  slotsLine,
} from './ui/meta-ui';
import type { CharacterKey, ItemKey } from './sim/types';
import { installDebugHooks, debugEnabled } from './debug';
import { Pwa } from './platform/pwa';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const VERSION = __APP_VERSION__;

// ---------- rendu (module chargé à part : three + src/render ≈ 150 ko gzip) ----------
// Le menu s'affiche et répond sans WebGL. Le module de rendu est téléchargé tout de suite (modulepreload injecté
// par vite.config.ts) mais évalué et construit après le premier affichage, quand le navigateur est libre, ou dès
// « Jouer » si le joueur est plus rapide. Les shaders sont compilés en parallèle (compileAsync) : pas de tâche
// longue sur le fil principal pendant le chargement (Lighthouse TBT), et le premier run démarre sans à-coup.
let scene: GameScene | null = null;
let sceneReady = false; // construite et shaders compilés : on peut rendre
let scenePromise: Promise<GameScene> | null = null;
function loadScene(): Promise<GameScene> {
  return (scenePromise ??= import('./render/scene').then(async ({ GameScene }) => {
    let s: GameScene;
    try {
      s = new GameScene(
        $('c') as HTMLCanvasElement,
        $('dmg'),
        POWER_KEYS.map((k) => POWER_ICON[k]),
      );
    } catch (e) {
      $('nogl').hidden = false;
      $('menu').hidden = true;
      throw e;
    }
    scene = s;
    s.setQuality(qualityLevel()); // phase 9 : niveau de rendu (réglage ou repli automatique de la session)
    s.setCharacter(meta.character, outfitOf(meta, meta.character)); // aperçu du menu : le personnage choisi tourne derrière le panneau
    sizeW = sizeH = 0;
    resize();
    // le décor ne dépend que de DECOR_SEED : construit ici pour que warmup() compile aussi ses matériaux (lacs, lanternes)
    s.buildDecor(new World(DECOR_SEED));
    await s.warmup();
    sceneReady = true;
    return s;
  }));
}
// ---------- langue ----------
// Lue avant tout rendu (le HUD précalcule les noms de boss) : réglage du joueur, sinon langue du navigateur.
const metaAtStart = peekMeta(); // synchrone (localStorage) : le menu est juste dès le premier affichage, IndexedDB confirme
setLang(resolveLang(metaAtStart.settings.lang, navigator.language));
applyLangStatic();

const hud = new Hud();
const audio = new AudioBus();
const input = new InputManager($('stick'), $('knob'), $('btnJump'), $('btnSpell'), $('btnSlide'));

// ---------- état applicatif ----------
type AppMode =
  | 'menu'
  | 'play'
  | 'levelup'
  | 'pause'
  | 'over'
  | 'shop'
  | 'achievements'
  | 'library'
  | 'settings'
  | 'account'
  | 'board'
  | 'victory'
  | 'characters'
  | 'help'
  | 'daily'
  | 'notes'
  | 'merchant'
  | 'map';
const SCREENS = [
  'menu',
  'levelup',
  'merchant',
  'pause',
  'over',
  'shop',
  'achievements',
  'library',
  'settings',
  'account',
  'board',
  'victory',
  'characters',
  'help',
  'daily',
  'notes',
  'map',
] as const;
let backTo: AppMode = 'menu'; // écran à rouvrir en quittant boutique / succès / réglages
let dailyRun = false; // partie en cours = défi du jour
// compteurs du run en cours (succès) ; remis à zéro à chaque startGame
const runStats = { dards: 0, elites: 0, bosses: 0, won: false };
let lastVibe = 0;
let app: AppMode = 'menu';
let world: World | null = null;
let meta: Meta = metaAtStart;
let hurtT = 0;
let timestopOn = false; // phase 35 : Temps figé affiché
let portalFade = 0; // phase 37 : opacité du fondu pilotée par le portail
let duckOn = false; // phase 36 : musique atténuée (pause, cartes, marchand, fin de partie)
const hitStop = new HitStop(); // borné : voir render/feel.ts
// « réduction des effets » : réglage du joueur, sinon prefers-reduced-motion (skill game-feel §9)
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function reducedFx(): boolean {
  return meta.fxChosen ? meta.reducedFx : meta.reducedFx || prefersReduced;
}
function applyFx(): void {
  const r = reducedFx();
  hitStop.enabled = !r;
  hud.flashMul = r ? 0.4 : 1;
  $('fxBtn').textContent = $('setFxBtn').textContent = t(
    r ? (meta.fxChosen ? 'settings.fx.reduced' : 'settings.fx.reducedSystem') : 'settings.fx.full',
  );
}
// rendu (phase 9) : réglage auto|net|pixel ; en auto, le niveau de session descend quand les frames dépassent le budget
let autoLevel = 2;
let slowWindows = 0;
function qualityLevel(): number {
  const q = meta.settings.quality;
  return q === 'net' ? 2 : q === 'pixel' ? 0 : autoLevel;
}
function applyQuality(): void {
  scene?.setQuality(qualityLevel());
  $('qualityBtn').textContent = $('setQualityBtn').textContent = t('settings.quality.' + meta.settings.quality);
}
let perfOn = location.search.includes('debug');
const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };

// Taille du rendu : l'événement `resize` ne suffit pas (écran pliable ouvert au lancement, rotation, barres iOS,
// fenêtre redimensionnée avant la première frame) → on compare aussi la taille à chaque frame (zéro coût, zéro
// allocation) et on écoute le viewport visuel et l'orientation. Une taille fausse = image écrasée ou étirée.
let sizeW = 0;
let sizeH = 0;
let sizeDpr = 0; // densité de pixels suivie aussi (zoom navigateur, changement d'écran) : la résolution interne en dépend
function resize(): void {
  const w = innerWidth,
    h = innerHeight,
    dpr = devicePixelRatio;
  if (w === sizeW && h === sizeH && dpr === sizeDpr) return;
  sizeW = w;
  sizeH = h;
  sizeDpr = dpr;
  scene?.resize(w, h);
  if (scene) scene.menuWide = w > 900 && w > h; // cadrage de l'accueil (phase 14)
  refitGear();
}
/** Phase 38 : la barre d'équipement se remet en rangées après un changement de taille ou de mode d'entrée (regroupé). */
let gearTimer = 0;
function refitGear(): void {
  clearTimeout(gearTimer);
  gearTimer = window.setTimeout(() => {
    if (world && app !== 'menu' && app !== 'over') hud.kit(world);
  }, 200);
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
visualViewport?.addEventListener('resize', resize);
resize();

function showOnly(id: AppMode | null): void {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('vignette').hidden = world === null; // vignette douce sur le jeu (phase 9), pas sur le menu ni ses écrans
}
function updateBestLine(): void {
  $('bestLine').textContent = bestLine(meta);
  $('slotLine').textContent = slotsLine(meta);
  $('resetNote').hidden = meta.seenReset;
  renderCharacters($('chars'), meta, $('charInfo'));
  const daily = dailyUnlocked(meta);
  $('dailyBtn').hidden = !daily;
  if (daily) {
    const best = dailyBest(meta);
    $('dailyBtn').textContent = best > 0 ? t('menu.dailyBest', { time: fmtTime(best) }) : t('menu.daily');
  }
  const fresh = hasUnseenNotes(meta.seenNotes, VERSION, meta.runs); // 1.49.0 : une version pas encore lue
  $('notesDot').hidden = !fresh;
  $('notesBtn').classList.toggle('fresh', fresh);
  $('shopLabel').textContent = t('menu.shopGold', { gold: t('gold', { n: Math.round(meta.gold) }) }); // le bouton garde son icône
}
/** Applique les réglages (HUD, gaucher, vibrations, son, langue) au DOM et aux libellés. */
function applySettings(): void {
  document.documentElement.style.setProperty('--hud-scale', String(meta.settings.hudScale));
  document.body.classList.toggle('lefty', meta.settings.lefty);
  $('setSoundBtn').textContent = $('soundBtn').textContent = t(meta.muted ? 'settings.sound.off' : 'settings.sound.on');
  $('setVibrateBtn').textContent = t(meta.settings.vibrate ? 'settings.vibrate.on' : 'settings.vibrate.off');
  $('setLeftyBtn').textContent = t(meta.settings.lefty ? 'settings.lefty.yes' : 'settings.lefty.no');
  $('setLangBtn').textContent = t('settings.lang.' + meta.settings.lang);
  ($('sfxVol') as HTMLInputElement).value = String(Math.round(meta.settings.sfxVol * 100));
  ($('musicVol') as HTMLInputElement).value = String(Math.round(meta.settings.musicVol * 100));
  audio.setVolumes(meta.settings.sfxVol, meta.settings.musicVol);
  applyKeys();
  for (const [id, v] of [
    ['hudSmallBtn', 0.85],
    ['hudNormalBtn', 1],
    ['hudLargeBtn', 1.2],
  ] as const)
    $(id).classList.toggle('selected', meta.settings.hudScale === v);
}
// 1.40.0 (demande de Jimmy) : touches du clavier configurables. Les réglages restent sur l'appareil (jamais synchronisés).
let keysApplied = '';
const keySettings = initKeySettings({
  grid: $('keygrid'),
  msg: $('keysMsg'),
  reset: $('keysResetBtn'),
  get: () => meta.settings.keys,
  set: (b) => {
    meta.settings.keys = b;
    saveMeta(meta);
    applySettings();
  },
});
/** Applique les touches choisies : lecture du clavier, bandeau du jeu, aide, grille des réglages. */
function applyKeys(): void {
  const json = JSON.stringify(meta.settings.keys);
  if (json !== keysApplied) {
    keysApplied = json;
    input.setBinds(meta.settings.keys); // seulement au changement : relâche les touches tenues
  }
  renderKeyHints(meta.settings.keys);
  keySettings.render();
  // un téléphone ou une tablette sans souris ni clavier n'a rien à régler ici
  $('keybinds').hidden = input.isTouch && !matchMedia('(any-pointer: fine)').matches;
}
loadKeyboardLayout(() => applyKeys());
function vibrate(ms: number): void {
  if (!meta.settings.vibrate || !input.isTouch || !navigator.vibrate) return;
  const now = performance.now();
  if (now - lastVibe < 250) return;
  lastVibe = now;
  try {
    navigator.vibrate(ms);
  } catch {
    /* non supporté */
  }
}
function openScreen(
  id:
    'shop' | 'achievements' | 'library' | 'settings' | 'account' | 'board' | 'characters' | 'help' | 'daily' | 'notes',
): void {
  if (app === 'menu' || app === 'over' || app === 'pause' || app === 'settings')
    backTo = app === 'settings' ? 'menu' : app;
  app = id;
  if (id === 'shop') renderShopScreen();
  else if (id === 'achievements') renderAchievements($('achList'), meta);
  else if (id === 'library') renderLibraryScreen();
  else if (id === 'account') openAccount();
  else if (id === 'board') {
    showOnly(id);
    void openBoard();
    return;
  } else if (id === 'characters') {
    showOnly(id); // la feuille doit être visible avant le rendu : la rangée se recentre sur la carte choisie (téléphone)
    renderCharacters($('chars'), meta, $('charInfo'));
    return;
  } else if (id === 'help') {
    /* statique */
  } else if (id === 'notes') {
    showOnly(id);
    void openNotes();
    return;
  } else if (id === 'daily') {
    renderDailyScreen();
    showOnly(id);
    $('dailyPlayBtn').focus(); // au clavier : Entrée lance le défi, Échap ferme
    return;
  } else {
    applySettings();
    $('settingsMsg').textContent = '';
  }
  showOnly(id);
}
// ---------- Nouveautés (1.49.0) : le journal des versions, chargé à la première ouverture ----------
let notesData: PatchNote[] | null = null;
let notesSeen = ''; // version vue avant cette ouverture : ce qui est plus récent est marqué « Nouveau »
let notesAll = false;
function renderNotesScreen(): void {
  if (notesData) renderNotes($('notesList'), $('notesMore'), notesData, notesSeen, notesAll);
}
async function openNotes(): Promise<void> {
  notesSeen = meta.seenNotes;
  notesAll = false;
  if (meta.seenNotes !== VERSION) {
    meta.seenNotes = VERSION; // propre à l'appareil : la pastille du menu s'éteint
    saveMeta(meta);
  }
  if (!notesData) {
    $('notesMore').hidden = true;
    $('notesList').textContent = t('notes.loading');
    try {
      notesData = (await import('virtual:patch-notes')).default;
    } catch {
      $('notesList').textContent = t('notes.error'); // hors ligne avant que le service worker ait tout mis en cache
      return;
    }
  }
  if (app === 'notes') renderNotesScreen();
}
/** Feuille du défi du jour (1.48.1) : les temps du jour et le délai avant le prochain ; les règles sont statiques. */
function renderDailyScreen(): void {
  const times = dailyTimes(meta);
  $('dailyTimes').textContent = times.length
    ? t('daily.times', { list: times.map((s, i) => `${ordinal(i + 1)} ${fmtTime(s)}`).join(' · ') })
    : t('daily.noTime');
  const min = Math.ceil(msToNextDaily() / 60000),
    h = Math.floor(min / 60),
    m = min % 60;
  $('dailyNext').textContent = t('daily.next', {
    time: h > 0 ? t('daily.hm', { h, m: String(m).padStart(2, '0') }) : t('daily.m', { m }),
  });
}
// phase 40 : Bibliothèque (onglet gardé d'une ouverture à l'autre)
let libTab: LibTab = 'w';
function renderLibraryScreen(): void {
  $('libGold').textContent = t('gold', { n: Math.round(meta.gold) });
  renderLibrary($('libTabs'), $('libList'), meta, libTab);
}
function renderShopScreen(): void {
  // phase 17 : plus de boutique par personnage ; la feuille ne garde que les emplacements (communs à tous)
  $('shopGold').textContent = t('gold', { n: Math.round(meta.gold) });
  renderSlots($('slotList'), meta);
  renderRerolls($('rerollList'), $('rerollNote'), meta); // phase 31
}

// ---------- langue : passe statique (index.html) et re-rendu de l'écran courant ----------
/** Nœuds `data-i18n` / `data-i18n-attr` de index.html et langue du document. */
function applyLangStatic(): void {
  document.documentElement.lang = getLang();
  document.documentElement.classList.remove('lang-pending'); // posé par le script inline de index.html
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-attr]'))
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
}
/** Changement de langue à chaud : le statique, les libellés d'état et ce que le code a rendu pour l'écran courant. */
function applyLang(): void {
  applyLangStatic();
  applyFx();
  applyQuality(); // le libellé « Rendu : … » suivait l'ancienne langue
  applySettings();
  setPerf(perfOn);
  if (world) hud.kit(world);
  updateBestLine();
  if (app === 'over') renderOverScreen();
  else if (app === 'levelup') openLevelUp();
  else if (app === 'shop') renderShopScreen();
  else if (app === 'achievements') renderAchievements($('achList'), meta);
  else if (app === 'library') renderLibraryScreen();
  else if (app === 'daily') renderDailyScreen();
  else if (app === 'notes') renderNotesScreen();
}
/** Après tout remplacement de la méta (import, effacement, IndexedDB, tests) : applique la langue si elle change. */
function syncLang(): void {
  const l = resolveLang(meta.settings.lang, navigator.language);
  if (l !== getLang()) {
    setLang(l);
    applyLang();
    refreshAccount();
  }
}
function closeScreen(): void {
  app = backTo;
  showOnly(backTo);
  if (backTo === 'menu') updateBestLine();
}

// ---------- carte : phase 27, une nouvelle carte à chaque partie ----------
// Le menu montre la carte MAP.seed (décor construit au chargement). Chaque partie tire sa graine de carte : l'horloge
// en jeu normal, la date pour le défi du jour (même carte pour tous), MAP.seed quand un test impose sa variante.
const DECOR_SEED = MAP.seed;
let decorSeed = DECOR_SEED; // graine du décor actuellement construit dans la scène
function mapSeedFor(variant: number | undefined, daily: boolean): number {
  if (daily) return (hashString('carte-' + todayKey()) % 1_000_000) + 1;
  if (variant !== undefined) return debugMapSeed ?? DECOR_SEED;
  return (Date.now() % 1_000_000_007) + 1;
}
/** Graine imposée par le débogage (tests e2e) aux parties lancées avec une variante. */
let debugMapSeed: number | null = null;

let startWanted: { variant?: number; daily: boolean } | null = null;
/** Attente des modèles des ennemis au premier départ de la session (une seule fois). */
let modelsWaited = false;
function startGame(variant?: number, daily = false): void {
  timestopOn = false; // phase 35
  document.body.classList.remove('timestop');
  if (!meta.seenReset) {
    meta.seenReset = true; // la bannière « nouvelle progression » a été vue
    saveMeta(meta);
  }
  if (!scene || !sceneReady) {
    // le joueur a été plus rapide que le module de rendu : on démarre dès qu'il est prêt
    if (!startWanted) startWanted = { variant, daily }; // la première intention (ex. défi du jour) l'emporte
    $<HTMLButtonElement>('playBtn').disabled = true;
    $('playBtn').textContent = t('menu.loading');
    loadScene().then(
      () => {
        const w = startWanted;
        startWanted = null;
        $<HTMLButtonElement>('playBtn').disabled = false;
        $('playBtn').textContent = t('menu.play');
        if (w) startGame(w.variant, w.daily);
      },
      () => {
        // module introuvable (réseau coupé au tout premier lancement) : on laisse réessayer
        scenePromise = null;
        startWanted = null;
        $<HTMLButtonElement>('playBtn').disabled = false;
        $('playBtn').textContent = t('menu.retry');
      },
    );
    return;
  }
  if (scene.enemiesPending && !modelsWaited) {
    // modèles 3D des ennemis encore en route (premier lancement, ou après une mise à jour) : on les attend un peu
    // plutôt que de lancer la partie avec les silhouettes de repli (8 s au plus, puis on joue quand même)
    modelsWaited = true;
    const btn = $<HTMLButtonElement>('playBtn');
    btn.disabled = true;
    btn.textContent = t('menu.loading');
    Promise.race([scene.enemiesReady, new Promise<void>((r) => setTimeout(r, 8000))]).then(() => {
      btn.disabled = false;
      btn.textContent = t('menu.play');
      startGame(variant, daily);
    });
    return;
  }
  const S = scene;
  S.setCharacter(daily ? 'eclaireuse' : meta.character, daily ? 0 : outfitOf(meta, meta.character));
  audio.init();
  audio.setMusic('game'); // phase 36 : musique de partie et ambiance de nuit
  dailyRun = daily;
  runStats.dards = runStats.elites = runStats.bosses = 0;
  runStats.won = false;
  // la méta entre dans la sim par des options (personnage, boutique, armes débloquées) ; défi du jour : égalité
  const mapSeed = mapSeedFor(variant, daily);
  world = new World(mapSeed, worldOptions(meta, unlockedWeapons(meta), daily));
  if (mapSeed !== decorSeed) {
    S.buildDecor(world); // phase 27 : nouvelle carte, nouveau décor (relief, lieux, coffres)
    decorSeed = mapSeed;
  }
  S.setStage(0); // phase 37 : ambiance du premier monde
  mapView.prepare(world); // fond de la minicarte construit ici, pas dans la première image de jeu
  // on décale le rng selon l'horloge pour que deux runs diffèrent (le décor, lui, utilise seed ^ constante)
  // `variant` (debug/tests) remplace l'horloge ; le défi du jour utilise la seed de la date : même run pour tous
  const skips = (daily ? dailySeed() : (variant ?? Date.now() % 1000)) | 0;
  for (let i = 0; i < skips; i++) world.rng.next();
  startRun(world);
  app = 'play';
  showOnly(null);
  $('hud').hidden = false;
  $('gear').hidden = false;
  $('keys').hidden = input.isTouch;
  $('touch').hidden = !input.isTouch;
  hud.reset();
  hud.kit(world);
  S.dmg.clear();
  S.snapCamera(world);
  S.resetHero();
  hurtT = 0;
  hitStop.reset();
  applyFx();
  $('update').hidden = true; // jamais de bannière de mise à jour en jeu
  last = performance.now();
}
/**
 * Phase 37 : arrivée dans un nouveau monde (la sim a déjà construit la carte). Fondu au noir, décor et minicarte
 * reconstruits pendant le fondu, ambiance du monde, bannière avec son nom.
 */
const stageFade = $('stageFade');
function onStageStart(n: number): void {
  if (!world || !scene) return;
  const S = scene;
  const fade = stageFade;
  portalFade = 0;
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  void fade.offsetWidth; // le noir est posé avant la reconstruction
  S.buildDecor(world);
  decorSeed = world.seed;
  S.setStage(world.stage);
  mapView.prepare(world);
  S.dmg.clear();
  S.snapCamera(world);
  fade.style.transition = 'opacity 0.8s ease-out';
  fade.style.opacity = '0';
  hud.banner(t('banner.stage', { n, name: t('stage.name.' + n) }));
  audio.whoosh();
  audio.levelUp();
}
function toMenu(): void {
  app = 'menu';
  world = null;
  scene?.marks.clear(); // phase 35 : les icônes des bonus ne restent pas sur le menu
  showOnly('menu');
  audio.setMusic('menu'); // phase 36
  if (pendingReconcile) void reconcileAccount(); // une synchronisation attendait la fin de la partie
  scene?.setCharacter(meta.character, outfitOf(meta, meta.character)); // après un défi du jour (Éclaireuse forcée)
  $('hud').hidden = true;
  $('gear').hidden = true;
  $('keys').hidden = true;
  $('touch').hidden = true;
  updateBestLine();
  showUpdateBanner();
}
function pauseGame(): void {
  if (app !== 'play') return;
  app = 'pause';
  if (world) $('pauseStats').innerHTML = statsHTML(world); // phase 47 : fiche de stats, à jour à chaque pause
  showOnly('pause');
}
function resumeGame(): void {
  if (app !== 'pause') return;
  backToPlay();
}
// 1.37.1 (retour de Jimmy) : toute reprise garde l'élan (input.resume) et repart en douceur (FEEL.resume)
let resumeEase = 0;
function backToPlay(): void {
  app = 'play';
  showOnly(null);
  last = performance.now();
  input.resume();
  resumeEase = reducedFx() ? 0 : FEEL.resume.ease;
}
function openLevelUp(): void {
  if (!world) return;
  const again = app === 'levelup'; // re-rendu (changement de langue) : ni son ni balayage
  app = 'levelup';
  // phase 17 : un coffre propose des objets passifs (même écran, autre titre)
  const chest = world.cards[0]?.kind === 'i';
  const shrine = world.cards[0]?.kind === 'b'; // phase 18 : bonus de sanctuaire
  $('luTitle').textContent = chest
    ? t('chest.title')
    : shrine
      ? t('shrine.title')
      : t('levelup.title', { n: world.player.level - world.pending + 1 });
  $('luHint').textContent = chest ? t('chest.hint') : shrine ? t('shrine.hint') : t('levelup.hint');
  $('luSlots').hidden = chest || shrine; // les emplacements d'armes et de tomes ne disent rien d'un objet ni d'un bonus
  $('luSlots').textContent = t('levelup.slots', {
    w: Object.keys(world.weapons).length,
    wMax: world.maxWeapons,
    p: Object.keys(world.tomes).length,
    pMax: world.maxTomes,
  });
  renderCards($('cards'), world.cards, world);
  // phase 31 : relance des cartes (pas pour un coffre ni un sanctuaire)
  const rr = $('luReroll') as HTMLButtonElement;
  rr.hidden = chest || shrine;
  rr.disabled = !canReroll(world);
  rr.textContent = world.rerolls > 0 ? t('levelup.reroll', { n: world.rerolls }) : t('levelup.reroll0');
  if (again) return;
  showOnly('levelup');
  audio.levelUp();
  hud.xpSweep();
  if (!input.isTouch) ($('cards').firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}
// ---------- marchand (phase 17) : échoppe en pause, achats avec l'or de la partie ----------
function openMerchant(): void {
  if (!world) return;
  const first = app !== 'merchant';
  app = 'merchant';
  renderMerchant();
  if (!first) return;
  showOnly('merchant');
  audio.chest();
  if (!input.isTouch) ($('mcards').firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}
function renderMerchant(): void {
  if (!world) return;
  $('mGold').textContent = t('gold', { n: Math.floor(world.gold) });
  // phase 43 : en monde infini, le dernier passage est dit dans l'échoppe aussi
  const lastVisit = world.endless && world.merchant.endlessVisits >= ENDLESS.merchantVisits;
  $('mNote').textContent = !canGainItem(world)
    ? t('merchant.full')
    : lastVisit
      ? `${t('merchant.hint')} ${t('merchant.last')}`
      : t('merchant.hint');
  renderCards($('mcards'), world.offers, world, { gold: world.gold, full: !canGainItem(world) });
  const cost = rerollCost(world);
  const rr = $('mReroll') as HTMLButtonElement;
  rr.textContent = t('merchant.reroll', { gold: t('gold', { n: cost }) });
  rr.disabled = world.gold < cost;
}
/** Achat (0–3), relance ou départ : un pas de sim dans l'échoppe, puis retour au jeu si l'on est parti. */
function merchantAct(code: number): void {
  if (!world || app !== 'merchant') return;
  const before = world.itemOrder.length;
  inp.pick = code;
  step(world, inp, STEP);
  inp.pick = -1;
  handleEvents(world, performance.now() / 1000); // objet acheté, synergie : bannière, son, particules
  hud.kit(world);
  if (world.mode === Mode.Merchant) {
    if (world.itemOrder.length > before) audio.select('wnew');
    renderMerchant();
    return;
  }
  backToPlay();
  audio.whoosh();
}
$('mcards').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
  if (b) merchantAct(+b.dataset.i!);
});
$('mReroll').onclick = () => merchantAct(MERCHANT_REROLL);
$('mLeave').onclick = () => merchantAct(MERCHANT_LEAVE);
addEventListener('keydown', (e) => {
  if (app !== 'merchant') return;
  if (e.code === 'KeyR') merchantAct(MERCHANT_REROLL);
  else if (e.code === 'Escape' || e.code === 'KeyQ') {
    e.preventDefault();
    merchantAct(MERCHANT_LEAVE);
  }
});

/** Relance des cartes de montée de niveau (phase 31) : un pas de sim, puis nouvelles cartes en cascade. */
function rerollCards(): void {
  if (!world || app !== 'levelup' || choosing || !canReroll(world)) return;
  inp.pick = LEVEL_REROLL;
  step(world, inp, STEP);
  inp.pick = -1;
  handleEvents(world, performance.now() / 1000);
  openLevelUp(); // re-rendu (déjà ouvert : ni son de niveau ni balayage d'XP)
  audio.select('s');
  if (!input.isTouch) ($('cards').firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}
$('luReroll').onclick = () => rerollCards();
addEventListener('keydown', (e) => {
  if (app === 'levelup' && e.code === 'KeyR' && !e.repeat) rerollCards();
});

let choosing = false;
function choose(i: number): void {
  if (!world || app !== 'levelup' || choosing || i < 0 || i >= world.cards.length) return;
  // flash de la carte + son selon le type, puis fermeture (160 ms, ou tout de suite en mode réduit)
  const c = world.cards[i];
  // son selon le type ; une carte à 3 lignes (épique) sonne comme une nouvelle arme
  audio.select(
    c.n >= 3 || c.kind === 'i' ? 'wnew' : c.kind === 'w' ? (c.lv === 1 ? 'wnew' : 'w') : c.kind === 't' ? 's' : 'heal',
  );
  flashCard($('cards'), i);
  choosing = true;
  const apply = () => {
    choosing = false;
    if (!world || app !== 'levelup') return;
    inp.pick = i;
    step(world, inp, STEP); // applique la carte ; peut re-rouler si plusieurs niveaux en attente
    inp.pick = -1;
    handleEvents(world, performance.now() / 1000); // objet de coffre, synergie : bannière, son, particules
    hud.kit(world);
    if (world.mode === Mode.LevelUp) openLevelUp();
    else {
      backToPlay();
      audio.whoosh();
    }
  };
  if (reducedFx()) apply();
  else setTimeout(apply, 160);
}
/** Ce que l'écran de mort affiche, gardé pour le re-rendre dans l'autre langue (un objet par mort, pas par frame). */
let lastOver: {
  won: boolean;
  rec: boolean;
  gold: number;
  dailyRank: number;
  miss: ReturnType<typeof missingTime>;
  fresh: Achievement[];
} | null = null;
function renderOverScreen(): void {
  const o = lastOver;
  if (!o || !world) return;
  const g = t('gold', { n: o.gold });
  $('oUnlocked').hidden = o.fresh.length === 0;
  $('oUnlocked').textContent = o.fresh.length
    ? t('over.unlocked', {
        list: o.fresh.map((a) => achName(a) + (a.unlocks ? ` (${achUnlock(a)})` : '')).join(', '),
      })
    : '';
  renderProgress($('oProgress'), meta, 3, dailyRun ? 'eclaireuse' : meta.character); // phase 41 : défis du personnage joué
  $('oTime').textContent = fmtTime(world.t);
  $('oStage').textContent = world.endless // phase 39 : monde infini
    ? t('over.endless', { time: fmtTime(world.endlessT), n: world.endlessWave })
    : o.won
      ? t('over.stages')
      : t('over.stage', { n: world.stage + 1 }); // phase 37
  $('oLvl').textContent = String(world.player.level);
  $('oGear').innerHTML = gearHtml(world); // phase 38 : l'équipement de la partie
  $('oKills').textContent = String(world.kills);
  $('oBest').textContent = fmtTime(meta.bestTime);
  $('oGold').textContent = String(o.gold);
  $('oTitle').textContent = t(world.endless ? 'over.endlessEnd' : o.won ? 'over.win' : 'over.dead');
  $('oTitle').classList.toggle('win', o.won);
  // seul HTML autorisé : le <span class="newrec"> écrit ici ; tout texte traduit passe par esc()
  const ns = nextSlot(meta);
  $('oNext').hidden = ns < 0;
  if (ns >= 0) $('oNext').textContent = t('over.nextSlot', { name: slotName(ns), cond: slotCondition(ns) });
  $('oMsg').innerHTML = o.won
    ? `<span class="newrec">${esc(t('over.reaperDown'))}</span>`
    : o.dailyRank > 0
      ? esc(
          o.dailyRank === 1
            ? t('over.dailyBest', { gold: g })
            : t('over.dailyRank', { rank: ordinal(o.dailyRank), gold: g }),
        )
      : o.miss
        ? esc(t('over.missing', { time: fmtTime(o.miss.seconds), name: achName(o.miss.a), gold: g }))
        : o.rec
          ? `<span class="newrec">${esc(t('over.newRecord'))}</span>${esc(t('over.plusGold', { gold: g }))}`
          : esc(t('over.toBeat', { time: fmtTime(meta.bestTime - world.t), gold: g }));
}
function gameOver(won = false): void {
  timestopOn = false; // phase 35
  document.body.classList.remove('timestop');
  if (!world || !scene) return;
  const S = scene;
  app = 'over';
  const rec = world.t > meta.bestTime;
  meta.runs++;
  meta.totalKills += world.kills;
  if (rec) meta.bestTime = world.t;
  if (world.kills > meta.bestKills) meta.bestKills = world.kills;
  // or, compteurs cumulés, succès, défi du jour
  const gold = Math.round(world.gold);
  meta.gold += gold;
  meta.goldEarned += gold;
  const st = meta.stats;
  st.kills += world.kills;
  st.dards += runStats.dards;
  st.elites += runStats.elites;
  st.bosses += runStats.bosses;
  st.triples += world.triples;
  st.wins += won ? 1 : 0;
  st.bestTime = Math.max(st.bestTime, world.t);
  st.runs++;
  // défis (phase 6) : meilleurs scores en un run
  st.noHitBest = Math.max(st.noHitBest, world.noHitBest);
  st.distanceBest = Math.max(st.distanceBest, world.distance);
  st.weaponLvBest = Math.max(st.weaponLvBest, world.weaponLvBest);
  st.slideDist += world.slideDist; // phase 28
  st.tricksBest = Math.max(st.tricksBest, world.tricks);
  st.mapChests += world.mapChestsOpened;
  st.bestStage = Math.max(st.bestStage, won ? 4 : world.stage + 1); // phase 37
  if (world.endless) st.endlessBest = Math.max(st.endlessBest, Math.floor(world.endlessT)); // phase 39
  recordCodex(meta, world); // phase 40 : parties avec chaque arme, objet, tome, synergie (Bibliothèque)
  const played = dailyRun ? 'eclaireuse' : meta.character; // défi du jour : toujours l'Éclaireuse
  addCharRun(meta.chars, played, runCharStats(played, world, won)); // phase 41 : défis par personnage
  const fresh = checkAchievements(meta);
  let dailyRank = 0;
  if (dailyRun) dailyRank = recordDaily(meta, Math.floor(world.t));
  saveMeta(meta);
  lastOver = { won, rec, gold, dailyRank, miss: missingTime(meta, world.t), fresh };
  // phase 38 : classement en ligne (joueurs connectés) ; personnage de la partie (défi du jour : l'Éclaireuse)
  queueScore({
    stage: won ? 4 : world.stage + 1,
    time: Math.floor(world.t),
    kills: world.kills,
    char: dailyRun ? 'eclaireuse' : meta.character,
  });
  renderOverScreen();
  S.particles.burst(world.player.x, 1, world.player.z, won ? PAL.gold : PAL.accent, 30, 8, 8);
  if (!reducedFx()) S.shake = 0.5;
  if (won && !world.endless) audio.victory();
  else audio.death();
  setTimeout(() => {
    if (app !== 'over') return;
    showOnly('over');
    showUpdateBanner();
  }, 700);
}

// ---------- phase 39 : victoire, puis monde infini au choix ----------
/** Le boss du monde 3 est tombé à temps : « Victoire ! », continuer en monde infini ou terminer (stats comptées à la fin). */
function openVictory(): void {
  if (!world || app === 'victory' || app === 'over') return;
  app = 'victory';
  $('vTime').textContent = fmtTime(world.t);
  $('vKills').textContent = String(world.kills);
  showOnly('victory');
  scene?.particles.burst(world.player.x, 1, world.player.z, PAL.gold, 40, 8, 8);
  audio.victory();
  vibrate(120);
  if (!input.isTouch) ($('vContinue') as HTMLElement).focus({ preventScroll: true });
}
function victoryContinue(): void {
  if (!world || app !== 'victory') return;
  startEndless(world);
  handleEvents(world, performance.now() / 1000); // bannière « Monde infini »
  app = 'play';
  showOnly(null);
  last = performance.now();
}
function victoryEnd(): void {
  if (!world || app !== 'victory') return;
  gameOver(true);
}
$('vContinue').onclick = () => victoryContinue();
$('vEnd').onclick = () => victoryEnd();
addEventListener('keydown', (e) => {
  if (app !== 'victory' || e.repeat) return;
  if (e.code === 'Digit1' || e.code === 'Numpad1') victoryContinue();
  else if (e.code === 'Digit2' || e.code === 'Numpad2' || e.code === 'Escape') {
    e.preventDefault();
    victoryEnd();
  }
});

// ---------- boutons ----------
$('playBtn').onclick = () => startGame();
// 1.48.1 : le bouton ouvre la feuille qui explique le défi ; c'est elle qui lance la partie
$('dailyBtn').onclick = () => openScreen('daily');
$('dailyBackBtn').onclick = closeScreen;
$('dailyPlayBtn').onclick = () => {
  closeScreen();
  startGame(undefined, true);
};
addEventListener('keydown', (e) => {
  if ((app !== 'daily' && app !== 'notes') || e.repeat || e.code !== 'Escape') return;
  e.preventDefault();
  closeScreen();
});
$('notesBtn').onclick = () => openScreen('notes');
$('notesBackBtn').onclick = closeScreen;
$('notesMore').onclick = () => {
  notesAll = true;
  renderNotesScreen();
};
$('shopBtn').onclick = () => openScreen('shop');
$('overShopBtn').onclick = () => openScreen('shop');
$('achBtn').onclick = () => openScreen('achievements');
$('libBtn').onclick = () => openScreen('library');
$('libBackBtn').onclick = closeScreen;
$('libTabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
  if (!b) return;
  libTab = b.dataset.tab as LibTab;
  renderLibraryScreen();
});
// phase 40 : achat d'une arme ou d'un objet débloqué, retrait d'un objet du tirage
$('libList').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const buy = target.closest('[data-unlock]') as HTMLButtonElement | null;
  const tog = target.closest('[data-toggle]') as HTMLButtonElement | null;
  audio.init();
  if (buy && !buy.disabled) {
    const [kind, key] = buy.dataset.unlock!.split(':') as [LibKind, string];
    if (!buyUnlock(meta, kind, key)) return;
    audio.chest();
  } else if (tog) {
    if (!toggleItem(meta, tog.dataset.toggle as ItemKey)) {
      $('libList').querySelector('.note')?.classList.add('warn'); // minimum atteint : la ligne du compte le dit
      return;
    }
    audio.select('s');
  } else return;
  saveMeta(meta);
  renderLibraryScreen();
  updateBestLine();
  // le focus clavier reste sur la fiche touchée (le rendu a remplacé le bouton)
  if (!input.isTouch) {
    const sel = buy
      ? `[data-unlock="${buy.dataset.unlock}"], [data-toggle="${buy.dataset.unlock!.slice(2)}"]`
      : `[data-toggle="${tog!.dataset.toggle}"]`;
    ($('libList').querySelector(sel) as HTMLElement | null)?.focus({ preventScroll: true });
  }
});
// onglets au clavier (1 à 4) et Échap pour fermer
addEventListener('keydown', (e) => {
  if (app !== 'library' || e.repeat) return;
  const n = e.code.startsWith('Digit') ? +e.code.slice(5) : e.code.startsWith('Numpad') ? +e.code.slice(6) : 0;
  if (n >= 1 && n <= LIB_TABS.length) {
    libTab = LIB_TABS[n - 1];
    renderLibraryScreen();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    closeScreen();
  }
});
$('settingsBtn').onclick = () => openScreen('settings');
$('accountBtn').onclick = () => openScreen('account');
$('accountBackBtn').onclick = closeScreen;
$('boardBtn').onclick = () => openScreen('board');
$('boardBackBtn').onclick = closeScreen;
$('boardAccountBtn').onclick = () => openScreen('account');
$('boardPseudoBtn').onclick = () => openScreen('account');
$('boardTabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-view]') as HTMLElement | null;
  if (!b) return;
  boardState.view = viewOf(b.dataset.view, boardState.view);
  void refreshBoard();
});
$('boardAll').onclick = () => {
  boardState.week = false;
  void refreshBoard();
};
$('boardWeek').onclick = () => {
  boardState.week = true;
  void refreshBoard();
};
$('charsBtn').onclick = () => openScreen('characters');
$('charactersBackBtn').onclick = closeScreen;
$('helpBtn').onclick = () => openScreen('help');
$('helpBackBtn').onclick = closeScreen;
$('helpPlayBtn').onclick = () => {
  closeScreen();
  startGame();
};
$('pauseSettingsBtn').onclick = () => openScreen('settings');
$('shopBackBtn').onclick = closeScreen;
$('achBackBtn').onclick = closeScreen;
$('settingsBackBtn').onclick = closeScreen;
$('chars').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  // achat d'un personnage en or (phase 6) : débité, choisi, grille et or du menu rafraîchis
  const buyEl = target.closest('[data-buy]') as HTMLElement | null;
  if (buyEl) {
    const key = buyEl.dataset.buy as CharacterKey;
    if (buyCharacter(meta, key)) {
      meta.character = key;
      saveMeta(meta);
      audio.init();
      audio.chest();
      updateBestLine();
    }
    return;
  }
  const b = target.closest('.card.char') as HTMLElement | null;
  if (!b) return;
  const key = b.dataset.char as CharacterKey;
  if (!unlockedCharacters(meta).includes(key)) return;
  meta.character = key;
  saveMeta(meta);
  renderCharacters($('chars'), meta, $('charInfo'));
  scene?.setCharacter(key, outfitOf(meta, key));
  audio.init();
  audio.select('s');
});
// tenues (phase 7) : bascule gratuite si possédée, sinon achat en or ; l'aperçu du menu change aussitôt
$('charInfo').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-outfit]') as HTMLElement | null;
  if (!btn) return;
  const i = +btn.dataset.outfit!;
  const key = meta.character;
  audio.init();
  if (i === 2 && !masterOutfit(meta, key)) return; // phase 41 : tenue de maître, seulement après le défi III
  if (i === 1 && !meta.outfits.includes(key)) {
    if (!buyOutfit(meta, key)) return;
    audio.chest();
    updateBestLine();
  } else {
    meta.outfit[key] = i;
    audio.select('s');
  }
  saveMeta(meta);
  renderCharacters($('chars'), meta, $('charInfo'));
  scene?.setCharacter(key, outfitOf(meta, key));
});
// emplacements (phase 10) : achat quand le succès est obtenu et l'or suffisant
$('slotList').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-slot]') as HTMLButtonElement | null;
  if (!b || b.disabled) return;
  if (buySlot(meta, +b.dataset.slot!)) {
    saveMeta(meta);
    audio.init();
    audio.chest();
    renderShopScreen();
    updateBestLine();
  }
});
// relances (phase 31) : achat dans l'ordre, or suffisant
$('rerollList').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-reroll]') as HTMLButtonElement | null;
  if (!b || b.disabled) return;
  if (buyReroll(meta)) {
    saveMeta(meta);
    audio.init();
    audio.chest();
    renderShopScreen();
    updateBestLine();
  }
});
// réglages
// phase 36 : curseurs Effets et Musique (appliqués en direct, sauvegardés au relâcher)
for (const id of ['sfxVol', 'musicVol'] as const) {
  const el = $(id) as HTMLInputElement;
  el.oninput = () => {
    meta.settings[id] = Number(el.value) / 100;
    audio.init();
    audio.setVolumes(meta.settings.sfxVol, meta.settings.musicVol);
  };
  el.onchange = () => {
    saveMeta(meta);
    if (id === 'sfxVol') audio.select('w'); // un aperçu du niveau des effets
  };
}
$('setSoundBtn').onclick = () => {
  meta.muted = !meta.muted;
  audio.setMuted(meta.muted);
  saveMeta(meta);
  applySettings();
};
$('setLangBtn').onclick = () => {
  const i = LANG_SETTINGS.indexOf(meta.settings.lang);
  meta.settings.lang = LANG_SETTINGS[(i + 1) % LANG_SETTINGS.length];
  saveMeta(meta);
  setLang(resolveLang(meta.settings.lang, navigator.language));
  applyLang();
  refreshAccount(); // applyLang remet « Compte » sur le bouton, renderAccount le rend à nouveau
};
$('setVibrateBtn').onclick = () => {
  meta.settings.vibrate = !meta.settings.vibrate;
  saveMeta(meta);
  applySettings();
  if (meta.settings.vibrate) vibrate(40);
};
$('setFxBtn').onclick = () => $('fxBtn').click();
$('qualityBtn').onclick = () => {
  const i = QUALITY_SETTINGS.indexOf(meta.settings.quality);
  meta.settings.quality = QUALITY_SETTINGS[(i + 1) % QUALITY_SETTINGS.length];
  if (meta.settings.quality === 'auto') {
    autoLevel = 2; // geste explicite du joueur : on repart du net (la remontée automatique, elle, n'existe pas)
    slowWindows = 0;
  }
  saveMeta(meta);
  applyQuality();
  audio.init();
  audio.select('s');
};
$('setQualityBtn').onclick = () => $('qualityBtn').click();
$('setLeftyBtn').onclick = () => {
  meta.settings.lefty = !meta.settings.lefty;
  saveMeta(meta);
  applySettings();
};
for (const [id, v] of [
  ['hudSmallBtn', 0.85],
  ['hudNormalBtn', 1],
  ['hudLargeBtn', 1.2],
] as const)
  $(id).onclick = () => {
    meta.settings.hudScale = v;
    saveMeta(meta);
    applySettings();
  };
$('exportBtn').onclick = () => {
  const json = exportMeta(meta);
  ($('saveText') as HTMLTextAreaElement).value = json;
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('settings.exportFile')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* le texte reste disponible dans la zone */
  }
  $('settingsMsg').textContent = t('settings.exported');
};
$('importBtn').onclick = () => {
  const m = importMeta(($('saveText') as HTMLTextAreaElement).value);
  if (!m) {
    $('settingsMsg').textContent = t('settings.notASave');
    return;
  }
  meta = m;
  saveMeta(meta);
  audio.setMuted(meta.muted);
  applyFx();
  applySettings();
  syncLang();
  $('settingsMsg').textContent = t('settings.imported', {
    runs: t('runs', { n: meta.runs }),
    time: fmtTime(meta.bestTime),
    gold: t('gold', { n: Math.round(meta.gold) }),
  });
};
let resetArmed = 0;
$('resetBtn').onclick = () => {
  if (performance.now() - resetArmed > 4000) {
    resetArmed = performance.now();
    $('settingsMsg').textContent = t('settings.resetArm');
    return;
  }
  // on garde ce qui relève de l'appareil et du confort : son, effets, réglages
  meta = resetProgress(meta);
  saveMeta(meta);
  applySettings();
  $('settingsMsg').textContent = t('settings.resetDone');
};
$('againBtn').onclick = () => startGame();
$('restartBtn').onclick = () => startGame();
$('menuBtn').onclick = toMenu;
$('quitBtn').onclick = toMenu;
$('pauseBtn').onclick = pauseGame;
$('resumeBtn').onclick = resumeGame;
$('soundBtn').onclick = () => {
  meta.muted = !meta.muted;
  audio.setMuted(meta.muted);
  saveMeta(meta);
  applySettings();
};
$('fxBtn').onclick = () => {
  meta.reducedFx = !reducedFx();
  meta.fxChosen = true;
  applyFx();
  saveMeta(meta);
};
$('cards').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
  if (b) choose(+b.dataset.i!);
});
input.onPause = () => {
  if (app === 'play') pauseGame();
  else if (app === 'pause') resumeGame();
  else if (app === 'map') closeMap();
};
// ---------- carte (phase 27) : M, appui sur la minicarte, bouton de la pause ; la partie est en pause ----------
const mapView = new MapView($('minimap') as HTMLCanvasElement, $('bigmap') as HTMLCanvasElement);
let mapFrom: 'play' | 'pause' = 'play';
let slideBtnOn = false; // bouton GLISSE allumé pendant la glissade
function openMap(): void {
  if (!world || (app !== 'play' && app !== 'pause')) return;
  mapFrom = app;
  app = 'map';
  showOnly('map');
  const f = mapView.drawBig(world);
  $('mapExplored').textContent = t('map.explored', { pct: Math.round(f * 100) });
}
function closeMap(): void {
  if (app !== 'map') return;
  app = 'pause';
  if (mapFrom === 'pause') showOnly('pause');
  else resumeGame();
}
$('minimap').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation(); // pas de joystick sous le doigt
  openMap();
});
$('pauseMapBtn').onclick = () => openMap();
$('mapClose').onclick = () => closeMap();
addEventListener('keydown', (e) => {
  if (!input.isMapKey(e.code) || e.repeat) return; // 1.40.0 : touche configurable
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  if (app === 'map') closeMap();
  else openMap();
});
input.onConfirm = () => {
  if (app === 'menu') startGame();
  else if (app === 'over') startGame();
  else if (app === 'victory') victoryContinue(); // phase 39 : Entrée = continuer en monde infini
};
input.onTouchDetected = () => {
  if (app !== 'menu') {
    $('touch').hidden = false;
    $('keys').hidden = true;
    refitGear(); // la barre passe à côté des boutons tactiles
  }
};
// onglet perf : F3 au clavier, bouton « Perf » de l'écran de pause au doigt (parité clavier/tactile)
function setPerf(on: boolean): void {
  perfOn = on;
  hud.showPerf(on);
  $('perfBtn').textContent = t(on ? 'pause.perf.on' : 'pause.perf.off');
  fpsT0 = 0; // nouvelle fenêtre de mesure
}
addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    setPerf(!perfOn);
  }
});
$('perfBtn').onclick = () => setPerf(!perfOn);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
  audio.background(document.hidden); // phase 36 : pas de musique quand l'appli passe en arrière-plan
});
$('version').textContent = `v${VERSION}`;
$('notesVer').textContent = `v${VERSION}`;

// PWA : mise à jour proposée uniquement au menu ou à l'écran de mort (skill pwa-release §2)
const pwa = new Pwa();
function showUpdateBanner(): void {
  $('update').hidden = !(pwa.needRefresh && (app === 'menu' || app === 'over'));
}
pwa.onNeedRefresh = showUpdateBanner;

// ---------- Compte (phase 13) : Firebase chargé à la demande, progression synchronisée sur le compte ----------
// Le module src/platform/account.ts (seul importateur de firebase) n'est chargé que si le joueur ouvre le panneau,
// ou au démarrage quand une session est connue ; sans compte, aucune requête ne part (test e2e account.spec.ts).
function isIosStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    (nav.standalone === true || matchMedia('(display-mode: standalone)').matches)
  );
}
const accView = initialAccountView(isIosStandalone());
let account: Account | null = null;
let accountLoad: Promise<Account | null> | null = null;
let accountUnavailable = false; // configuration absente : définitif pour cette session
let syncRec: SyncRecord | null = loadSyncRecord();
let lastSynced: string | null = null; // progression (JSON) alignée avec le nuage : un saveMeta identique ne salit rien
let applyingCloud = false;
let pendingReconcile = false; // une synchronisation attend le retour au menu (jamais en pleine partie)
let pendingCloud: CloudDoc | null = null; // document du nuage en attente du choix du joueur
let pushTimer = 0;
let reconciling = false; // relecture du nuage en cours : aucun envoi ne doit s'intercaler (relecture perf B2)
let deleteArmed = 0;

function refreshAccount(): void {
  renderAccount(accView);
}
function accountMessage(msg: string, error = false): void {
  accView.msg = msg;
  accView.error = error;
  refreshAccount();
}
function accountError(e: unknown): void {
  accountMessage(t(errorKey(e)), true);
}

/** Charge le module Firebase et la configuration ; null si les comptes sont indisponibles (ou réseau coupé). */
function loadAccount(): Promise<Account | null> {
  if (account) return Promise.resolve(account);
  if (accountUnavailable) return Promise.resolve(null);
  if (accountLoad) return accountLoad;
  accView.status = 'loading';
  accView.retry = false;
  refreshAccount();
  accountLoad = (async () => {
    try {
      const mod = await import('./platform/account');
      const cfg = await mod.loadConfig();
      if (!cfg) {
        accountUnavailable = true;
        accView.status = 'unavailable';
        refreshAccount();
        return null;
      }
      account = new mod.Account(cfg);
      account.onChange = onAuthChange;
      let redirect = false;
      try {
        redirect = sessionStorage.getItem(SYNC.redirectKey) === '1';
        sessionStorage.removeItem(SYNC.redirectKey);
      } catch {
        /* stockage bloqué */
      }
      if (redirect) account.finishRedirect().catch(accountError);
      return account;
    } catch (e) {
      // le chunk n'a pas pu être téléchargé (hors ligne, première fois) : on réessaiera
      accountLoad = null;
      accView.status = 'unavailable';
      accView.retry = true;
      accountMessage(t(navigator.onLine ? errorKey(e) : 'account.err.network-request-failed'), true);
      return null;
    }
  })();
  return accountLoad;
}

function openAccount(): void {
  accView.msg = '';
  accView.error = false;
  accView.askPassword = false;
  deleteArmed = 0;
  refreshAccount();
  showOnly('account');
  void loadAccount();
}

function onAuthChange(u: AccountUser | null): void {
  accView.status = u ? 'in' : 'out';
  accView.email = u?.email ?? null;
  accView.choice = null;
  accView.askPassword = false;
  accView.sync = 'idle';
  try {
    if (u) localStorage.setItem(SYNC.accountKey, '1');
    else localStorage.removeItem(SYNC.accountKey);
  } catch {
    /* stockage bloqué */
  }
  refreshAccount();
  fillPseudo(u);
  if (!u) savePending([]); // déconnexion : les parties en attente ne partiront pas sous un autre compte
  if (!u) syncOk(); // 1.36.1 : plus de réessai sans compte
  if (u) void reconcileAccount();
  if (u) void flushScores();
  if (app === 'board') void refreshBoard();
}

/** Compare local et nuage et applique la décision (src/meta/sync.ts) ; attend le menu si une partie est en cours. */
async function reconcileAccount(): Promise<void> {
  const u = account?.user;
  if (!account || !u) return;
  if (app === 'play' || app === 'levelup' || app === 'pause') {
    pendingReconcile = true;
    return;
  }
  pendingReconcile = false;
  if (!navigator.onLine) {
    accView.sync = 'offline';
    refreshAccount();
    return;
  }
  clearTimeout(pushTimer); // un envoi en attente serait doublé par decide() (le drapeau dirty est persistant)
  pushTimer = 0;
  accView.sync = 'syncing';
  accView.retry = false;
  refreshAccount();
  reconciling = true;
  try {
    const cloud = await account.readSave(u.uid);
    const d = decide(meta, cloud, syncRec, u.uid);
    if (d === 'ask' && cloud) {
      pendingCloud = cloud;
      accView.choice = { local: summary(meta), cloud: summary(withProgress(meta, cloud.progress)) };
      accView.sync = 'idle';
      refreshAccount();
      return;
    }
    if (d === 'push') await pushNow(u.uid);
    else if (d === 'pull' && cloud) applyCloud(u.uid, cloud);
    else if (d === 'adopt' && cloud) alignWith(u.uid, cloud.updatedAt);
    accView.sync = 'synced';
    syncOk();
    refreshAccount();
  } catch (e) {
    accView.sync = 'error';
    accView.retry = true;
    accountError(e);
    scheduleRetry();
  } finally {
    reconciling = false;
  }
}
function alignWith(uid: string, base: number): void {
  lastSynced = JSON.stringify(progressOf(meta));
  syncRec = { uid, base, dirty: false, changedAt: 0 };
  saveSyncRecord(syncRec);
}
/** Remplace la progression locale par celle du nuage (réglages gardés), sans redéclencher un envoi. */
function applyCloud(uid: string, cloud: CloudDoc): void {
  applyingCloud = true;
  meta = withProgress(meta, cloud.progress);
  saveMeta(meta);
  applyingCloud = false;
  alignWith(uid, cloud.updatedAt);
  applyMeta();
  scene?.setCharacter(meta.character, outfitOf(meta, meta.character)); // l'aperçu du menu n'est pas dans applyMeta
  if (app === 'shop') renderShopScreen();
  else if (app === 'achievements') renderAchievements($('achList'), meta);
  else if (app === 'library') renderLibraryScreen();
  else if (app === 'daily') renderDailyScreen();
  else if (app === 'notes') renderNotesScreen();
}
async function pushNow(uid: string): Promise<void> {
  if (!account) return;
  if (!navigator.onLine) {
    accView.sync = 'offline';
    refreshAccount();
    return;
  }
  const d = toCloudDoc(meta, Date.now());
  accView.sync = 'syncing';
  refreshAccount();
  await account.writeSave(uid, d);
  const sent = JSON.stringify(d.progress);
  lastSynced = sent;
  syncRec = { uid, base: d.updatedAt, dirty: false, changedAt: 0 };
  if (JSON.stringify(progressOf(meta)) !== sent) {
    // une sauvegarde est passée pendant l'envoi : le nuage est déjà en retard, on renverra
    syncRec.dirty = true;
    syncRec.changedAt = Date.now();
    schedulePush();
  }
  saveSyncRecord(syncRec);
  accView.sync = 'synced';
  syncOk();
  refreshAccount();
}
// 1.36.1 : réessai automatique d'une synchronisation ratée (en ligne mais injoignable) ; remis à zéro au succès
let retryTimer = 0;
let retryN = 0;
function scheduleRetry(): void {
  clearTimeout(retryTimer);
  if (!account?.user || !navigator.onLine) return; // hors ligne : l'événement « online » relancera
  const d = SYNC.retryMs[Math.min(retryN, SYNC.retryMs.length - 1)];
  retryN++;
  retryTimer = window.setTimeout(() => {
    retryTimer = 0;
    if (account?.user) void reconcileAccount();
  }, d);
}
function syncOk(): void {
  clearTimeout(retryTimer);
  retryTimer = 0;
  retryN = 0;
}
function schedulePush(): void {
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = 0;
    const u = account?.user;
    if (reconciling)
      schedulePush(); // on réessaie après la relecture du nuage
    else if (u && app !== 'play')
      pushNow(u.uid).catch((e) => {
        accView.sync = 'error';
        accView.retry = true;
        accountError(e);
        scheduleRetry();
      });
  }, SYNC.debounceMs);
}
// chaque sauvegarde de progression salit l'appareil ; l'envoi est regroupé (2 s), ou immédiat quand l'app se cache
onMetaSaved((m) => {
  if (applyingCloud || !syncRec) return;
  const p = JSON.stringify(progressOf(m));
  if (p === lastSynced) return;
  syncRec.dirty = true;
  syncRec.changedAt = Date.now();
  saveSyncRecord(syncRec);
  if (account?.user) schedulePush();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = 0;
    const u = account?.user;
    if (u)
      pushNow(u.uid).catch(() => {
        accView.sync = 'error';
        accView.retry = true;
        scheduleRetry();
      });
  } else if (!document.hidden && account?.user && syncRec?.dirty && navigator.onLine && !reconciling) {
    // 1.36.1 : retour au premier plan avec une progression pas encore partie (l'événement « online » a pu être manqué)
    void reconcileAccount();
  }
});
addEventListener('online', () => {
  if (account?.user) void reconcileAccount();
  // 1.36.1 : lancé hors ligne sans pouvoir charger le compte (module ou configuration) : on réessaie maintenant
  else if (!account && !accountUnavailable && sessionKnown()) void loadAccount();
  void flushScores(); // phase 38 : parties terminées hors ligne
});

// ---------- classement en ligne (phase 38, décision de Jimmy) : joueurs connectés seulement ----------
// Sans compte connu, l'écran invite à se connecter et Firebase n'est pas chargé (règle 8 de CLAUDE.md).
const boardState = initialBoardState();
let boardSeq = 0; // dernière requête : une réponse plus ancienne (onglet changé entre-temps) est ignorée
function sessionKnown(): boolean {
  try {
    return localStorage.getItem(SYNC.accountKey) === '1' || sessionStorage.getItem(SYNC.redirectKey) === '1';
  } catch {
    return false;
  }
}
async function openBoard(): Promise<void> {
  boardState.rows = [];
  boardState.mine = null;
  if (!account && !sessionKnown()) {
    boardState.status = accountUnavailable ? 'unavailable' : 'out';
    renderBoard(boardState);
    return;
  }
  boardState.status = 'loading';
  renderBoard(boardState);
  const acc = await loadAccount();
  if (!acc) {
    boardState.status = accountUnavailable ? 'unavailable' : 'out';
    renderBoard(boardState);
    return;
  }
  if (acc.ready) await refreshBoard(); // sinon onAuthChange s'en charge à la restauration de la session
}
async function refreshBoard(): Promise<void> {
  if (app !== 'board') return;
  const u = account?.user;
  if (!account || !u) boardState.status = accountUnavailable ? 'unavailable' : 'out';
  else if (!meta.pseudo) boardState.status = 'nopseudo';
  else boardState.status = 'loading';
  renderBoard(boardState);
  if (boardState.status !== 'loading' || !account || !u) return;
  const seq = ++boardSeq;
  try {
    const r = await account.fetchBoard(u.uid, boardState.view, boardState.week ? isoWeek(Date.now()) : null);
    if (seq !== boardSeq) return;
    boardState.uid = u.uid;
    boardState.rows = r.rows;
    boardState.mine = r.mine;
    boardState.status = 'ready';
  } catch {
    if (seq !== boardSeq) return;
    boardState.status = 'error';
  }
  renderBoard(boardState);
}
interface PendingScore {
  uid: string; // compte qui a joué : jamais publié sous un autre compte connecté ensuite sur l'appareil
  run: RunScore;
  at: number;
}
function loadPending(): PendingScore[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARD.pendingKey) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as PendingScore[]).slice(-BOARD.pendingMax) : [];
  } catch {
    return [];
  }
}
function savePending(list: PendingScore[]): void {
  try {
    if (list.length) localStorage.setItem(BOARD.pendingKey, JSON.stringify(list.slice(-BOARD.pendingMax)));
    else localStorage.removeItem(BOARD.pendingKey);
  } catch {
    /* stockage bloqué : la partie ne sera pas publiée */
  }
}
/** Fin de partie d'un joueur connecté (ou dont la session est connue) : le score attend son envoi. */
function queueScore(run: RunScore): void {
  const uid = account?.user?.uid;
  if (!uid) return; // sans compte connecté, rien n'est gardé pour le classement
  savePending([...loadPending(), { uid, run, at: Date.now() }]);
  void flushScores();
}
let flushing = false;
async function flushScores(): Promise<void> {
  const u = account?.user;
  if (flushing || !account || !u || !meta.pseudo || !navigator.onLine) return;
  flushing = true;
  try {
    savePending(loadPending().filter((p) => p.uid === u.uid)); // parties d'un autre compte : oubliées
    let list = loadPending();
    while (list.length) {
      await account.submitScore(u.uid, meta.pseudo, list[0].run, list[0].at);
      list = loadPending().slice(1);
      savePending(list);
    }
  } catch {
    /* réseau ou règles : on réessaiera au retour du réseau ou à la prochaine partie */
  } finally {
    flushing = false;
  }
}
/** Pseudo du panneau Compte : celui de la progression, sinon une proposition tirée du compte (prénom Google). */
function fillPseudo(u: AccountUser | null): void {
  const el = $('accPseudo') as HTMLInputElement;
  if (u && document.activeElement !== el) el.value = meta.pseudo || suggestPseudo(u.name, u.email);
}
$('accPseudoForm').onsubmit = (e) => {
  e.preventDefault();
  const name = cleanPseudo(($('accPseudo') as HTMLInputElement).value);
  if (!name) {
    accountMessage(t('account.pseudo.invalid'), true);
    return;
  }
  ($('accPseudo') as HTMLInputElement).value = name;
  const renamed = name !== meta.pseudo;
  meta.pseudo = name;
  saveMeta(meta); // synchronisé avec la progression
  accountMessage(t('account.pseudo.saved', { name }));
  const u = account?.user;
  if (renamed && account && u && navigator.onLine) account.renameScores(u.uid, name).catch(() => undefined); // la prochaine partie le refera
  void flushScores();
};

// boutons du panneau
async function withBusy(run: () => Promise<void>): Promise<void> {
  accView.busy = true;
  accView.msg = '';
  accView.error = false;
  refreshAccount();
  try {
    await run();
  } catch (e) {
    accountError(e);
  } finally {
    accView.busy = false;
    refreshAccount();
  }
}
const accEmail = () => ($('accEmail') as HTMLInputElement).value.trim();
const accPwd = () => ($('accPwd') as HTMLInputElement).value;
$('accGoogleBtn').onclick = () =>
  withBusy(async () => {
    const a = await loadAccount();
    if (a) await a.signInGoogle();
  });
$('accForm').onsubmit = (e) => {
  e.preventDefault();
  void withBusy(async () => {
    const a = await loadAccount();
    if (a) await a.signInEmail(accEmail(), accPwd());
  });
};
$('accSignUpBtn').onclick = () =>
  withBusy(async () => {
    const a = await loadAccount();
    if (a) await a.signUpEmail(accEmail(), accPwd());
  });
$('accForgotBtn').onclick = () =>
  withBusy(async () => {
    const a = await loadAccount();
    if (!a) return;
    await a.resetPassword(accEmail());
    accountMessage(t('account.resetSent'));
  });
$('accSignOutBtn').onclick = () =>
  withBusy(async () => {
    const u = account?.user;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = 0;
      if (u && navigator.onLine) await pushNow(u.uid); // les 2 dernières secondes de progression partent avant
    }
    await account?.signOut();
    syncRec = null;
    saveSyncRecord(null);
    lastSynced = null;
    accountMessage(t('account.signedOut'));
  });
$('accDeleteBtn').onclick = () => {
  if (performance.now() - deleteArmed > 4000) {
    deleteArmed = performance.now();
    accountMessage(t('account.deleteArm'));
    return;
  }
  void withBusy(async () => {
    const pwd = ($('accDeletePwd') as HTMLInputElement).value;
    try {
      await account?.deleteAccount(pwd || undefined);
    } catch (e) {
      if (errorKey(e) === 'account.err.requires-recent-login' && account?.user?.provider === 'password') {
        accView.askPassword = true; // on redemande le mot de passe, le prochain appui supprime
        deleteArmed = performance.now();
        accountMessage(t('account.deletePwd'), true);
        return;
      }
      throw e;
    }
    syncRec = null;
    saveSyncRecord(null);
    lastSynced = null;
    accountMessage(t('account.deleteDone'));
  });
};
$('accKeepLocal').onclick = () =>
  withBusy(async () => {
    const u = account?.user;
    pendingCloud = null;
    accView.choice = null;
    if (u) await pushNow(u.uid);
  });
$('accKeepCloud').onclick = () =>
  withBusy(async () => {
    const u = account?.user;
    const c = pendingCloud;
    pendingCloud = null;
    accView.choice = null;
    if (u && c) {
      applyCloud(u.uid, c);
      accView.sync = 'synced';
    }
  });
$('accRetryBtn').onclick = () =>
  withBusy(async () => {
    const a = await loadAccount();
    if (a?.user) await reconcileAccount();
  });

$('updateBtn').onclick = () => pwa.update();

// PWA : installation
let deferredInstall: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e as typeof deferredInstall;
  $('installBtn').hidden = false;
});
$('installBtn').onclick = async () => {
  if (!deferredInstall) return;
  await deferredInstall.prompt().catch(() => {});
  deferredInstall = null;
  $('installBtn').hidden = true;
};
{
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  if (ios && !standalone && location.protocol.startsWith('http')) $('iosHint').hidden = false;
}

// ---------- événements de la sim → effets ----------
// Règle 3 de CLAUDE.md : chaque coup porté produit flash (sim), recul (sim), son, chiffre et particules.
// HitSrc : les treize armes dans l'ordre de WEAPON_KEYS, puis Fire, Thorns, Talisman, Spell, Patins, Horn, Burn
/**
 * Retour visuel d'un sort (phase 19, règle 3) : au lancement (x2, z2 = point visé ou d'arrivée), à l'impact (x2 = rayon).
 * Les effets qui durent (filet, Tourbillon, Voile, ennemis étourdis) sont dessinés par la scène.
 */
function spellFx(
  S: GameScene,
  k: Spell,
  impact: boolean,
  x: number,
  y: number,
  z: number,
  x2: number,
  z2: number,
  fx: number,
  reduced: boolean,
): void {
  const P = S.particles;
  if (!impact) {
    switch (k) {
      case Spell.Bond:
      case Spell.Comete:
        P.burst(x, y + 0.6, z, k === Spell.Comete ? PAL.accent : PAL.cream, (8 * fx) | 0, 3, 2);
        break;
      case Spell.Tourbillon:
        P.ring(x, 0.4, z, PAL.paper, (14 * fx) | 0, 7, 1.5);
        break;
      case Spell.Clignement:
        // éclat violet au départ et à l'arrivée
        P.burst(x, y + 0.9, z, PAL.bolt, (14 * fx) | 0, 4, 3);
        P.burst(x2, y + 0.9, z2, PAL.bolt, (14 * fx) | 0, 4, 3);
        break;
      case Spell.Voile:
        P.ring(x, 0.6, z, PAL.xp, (16 * fx) | 0, 4, 2);
        break;
      case Spell.Collet:
      case Spell.Bourse:
        P.burst(x, y + 1, z, k === Spell.Bourse ? PAL.gold : PAL.paper, (6 * fx) | 0, 3, 2);
        break;
    }
    return;
  }
  switch (k) {
    case Spell.Eclat:
      P.ring(x, 0.5, z, PAL.lantern, (30 * fx) | 0, x2 * 2.6, 2);
      P.burst(x, 1, z, PAL.cream, (16 * fx) | 0, 5, 4);
      if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
      break;
    case Spell.Petard:
      P.burst(x, 0.4, z, PAL.mine, (36 * fx) | 0, 9, 10);
      P.burst(x, 0.4, z, PAL.gold, (18 * fx) | 0, 6, 7);
      P.ring(x, 0.2, z, PAL.accent, (32 * fx) | 0, x2 * 3, 2);
      if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
      break;
    case Spell.Bourse:
      P.burst(x, 0.6, z, PAL.gold, (24 * fx) | 0, 6, 7);
      P.ring(x, 0.2, z, PAL.gold, (16 * fx) | 0, x2 * 2.6, 1.2);
      if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt);
      break;
    case Spell.Collet:
      P.ring(x, 0.2, z, PAL.paper, (18 * fx) | 0, x2 * 1.5, 0.6);
      break;
    case Spell.Clignement:
      P.burst(x, 0.8, z, PAL.bolt, (10 * fx) | 0, 5, 3);
      break;
    case Spell.Bond:
      P.burst(x, 1, z, PAL.proj, (10 * fx) | 0, 5, 2);
      break;
  }
}
const HIT_COLORS = [
  PAL.proj,
  PAL.xp,
  PAL.paper,
  PAL.bolt,
  PAL.boomerang,
  PAL.mine,
  0xc9b3ff, // phase 28 : Faux
  0x9fe8ff, // Lance
  0xff9a5a, // Météores
  0xffb46b, // phase 47 C : Fouet
  0x9be36a, // Vitriol
  0xb9f3ff, // Esprits
  0xffe27a, // Balise
  PAL.accent,
  PAL.paper,
  PAL.bolt,
  PAL.gold,
  0xff8a3d, // phase 28 : Patins de braise
  0xffe08a, // Corne de guerre
  0xff6a2a, // phase 47 B : brûlure de la Dent de dragon
];
function handleEvents(w: World, now: number): void {
  const S = scene as GameScene; // une partie ne tourne jamais sans scène (startGame)
  const reduced = reducedFx();
  const fx = reduced ? 0.5 : 1; // particules ÷2 en mode réduit
  const PT = FEEL.particles;
  let bladeSnd = false; // phase 32 : un seul son de lame par pas, même si plusieurs cibles sont frappées
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    switch (e.type) {
      case Ev.Hit: {
        // phase 23 : x2 = source de l'arme, + HIT_CRIT si coup critique
        const crit = e.x2 >= HIT_CRIT;
        S.dmg.add(e.x, e.y, e.z, e.v, crit);
        if (crit) S.particles.burst(e.x, e.y, e.z, PAL.gold, PT.crit.n, PT.crit.speed, PT.crit.up);
        // gerbe de la couleur de l'arme, orientée comme le recul (opposée à la source)
        S.particles.burst(
          e.x,
          e.y,
          e.z,
          HIT_COLORS[(e.x2 | 0) & (HIT_CRIT - 1)],
          (PT.hit.n * fx) | 0,
          PT.hit.speed,
          PT.hit.up,
          true,
          e.y2,
          e.z2,
          0.7,
        );
        audio.hit(e.v, now);
        break;
      }
      case Ev.Kill:
        if (e.v === 1) runStats.dards++;
        if (e.x2 === 1) runStats.elites++;
        if (e.x2 === 1 || e.v === ELITE_TYPE) {
          // élite (dorée) ou Brute : grosse gerbe ennemi + or, shake
          const n = e.x2 === 1 ? PT.elite.n : PT.elite.n * 0.5;
          S.particles.burst(e.x, e.y, e.z, PAL.enemy[e.v | 0], (n * 0.5 * fx) | 0, PT.elite.speed, PT.elite.up);
          S.particles.burst(e.x, e.y, e.z, PAL.gold, (n * 0.5 * fx) | 0, PT.elite.speed, PT.elite.up);
          if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        } else S.particles.burst(e.x, e.y, e.z, PAL.enemy[e.v | 0], (PT.kill.n * fx) | 0, PT.kill.speed, PT.kill.up);
        audio.kill(false, now, e.x2 === 1);
        hitStop.request(FEEL.hitStop.kill.duration, FEEL.hitStop.kill.scale);
        break;
      case Ev.BossKill:
        runStats.bosses++;
        vibrate(80);
        S.particles.burst(e.x, e.y, e.z, PAL.enemy[e.v | 0], (PT.elite.n * fx) | 0, PT.elite.speed + 2, PT.elite.up);
        S.particles.burst(e.x, e.y, e.z, PAL.gold, (PT.elite.n * 0.6 * fx) | 0, PT.elite.speed, PT.elite.up);
        if (!reduced) S.shake = FEEL.shake.boss;
        hud.banner(t(e.v === REAPER_TYPE ? 'banner.reaperDown' : 'banner.bossDown'));
        hud.flash('gold');
        audio.kill(true);
        hitStop.request(FEEL.hitStop.boss.duration, FEEL.hitStop.boss.scale, 2);
        break;
      case Ev.Shoot:
        S.particles.burst(e.x, e.y, e.z, PAL.proj, PT.shoot.n, PT.shoot.speed, PT.shoot.up, false);
        if (e.x2 === 1)
          audio.lance(); // phase 36 : la Lance a son estoc
        else audio.shoot();
        break;
      case Ev.Throw:
        audio.throwSound();
        break;
      case Ev.MineBlast:
        S.particles.burst(e.x, e.y, e.z, PAL.mine, (12 * fx) | 0, 6, 6);
        S.particles.ring(e.x, 0.2, e.z, PAL.gold, (10 * fx) | 0, e.v * 2.5, 1);
        audio.blast();
        break;
      case Ev.ZoneBlast:
        S.particles.ring(e.x, 0.2, e.z, PAL.telegraph, (16 * fx) | 0, e.v * 3, 4);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt);
        audio.blast();
        break;
      case Ev.Jump:
        audio.jump();
        S.onJump();
        break;
      case Ev.Land:
        S.onLand(w.player.sliding, Math.sqrt(w.player.vx * w.player.vx + w.player.vz * w.player.vz));
        S.particles.burst(e.x, 0.2, e.z, PAL.dust, PT.land.n, PT.land.speed, PT.land.up);
        if (e.v > 0.25) audio.land(); // phase 36 : pas sur l'herbe (pas pour un simple pas de relief)
        break;
      // phase 27 : glissade, envol, vrille
      case Ev.SlideStart:
        S.onSlide(true);
        S.particles.burst(e.x, 0.15, e.z, PAL.dust, (PT.land.n * fx) | 0, PT.land.speed * 1.4, PT.land.up * 0.5);
        audio.slide(Math.min(1, e.v / (w.player.speed * SLIDE.maxMul)));
        break;
      case Ev.SlideEnd:
        S.onSlide(false);
        break;
      case Ev.Launch:
        S.particles.burst(e.x, 0.3, e.z, PAL.dust, (PT.land.n * fx) | 0, PT.land.speed, PT.land.up * 1.5);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt * 0.4);
        audio.launch();
        break;
      // phase 28 : armes, objets, pistes chronométrées
      case Ev.Blade: {
        // phase 32 : coup des Lames sur une cible ; étincelles bleu acier sur la zone de coupe
        S.blade(e.x, e.z, e.v, e.x2, e.z2);
        S.particles.burst(e.x, 0.9, e.z, FEEL.blade.sparkColor, (FEEL.blade.sparks * fx) | 0, 4, 2);
        if (!bladeSnd) {
          audio.blade();
          bladeSnd = true;
        }
        break;
      }
      case Ev.Scythe: {
        // phase 30 : arc de lame visible (balayage), plus quelques étincelles violettes le long du tranchant
        S.scythe(e.x, e.z, e.v, e.x2, e.z2, e.y2);
        const n = (8 * fx) | 0,
          half = (Math.min(360, e.y2) * Math.PI) / 360,
          a0 = Math.atan2(e.x2, e.z2);
        for (let k = 0; k < n; k++) {
          const a = a0 - half + (2 * half * k) / Math.max(1, n - 1);
          S.particles.burst(
            e.x + Math.sin(a) * e.v * 0.8,
            0.9,
            e.z + Math.cos(a) * e.v * 0.8,
            0xc9b3ff,
            1,
            3,
            1.5,
            false,
            Math.sin(a),
            Math.cos(a),
            1,
          );
        }
        audio.scythe();
        break;
      }
      case Ev.MeteorWarn:
        audio.meteorWarn();
        break;
      case Ev.Whip: {
        // phase 47 C : la lanière claque en ligne droite (trait de l'éclair, orangé et tendu), étincelles au bout
        const tx = e.x + e.x2 * e.v,
          tz = e.z + e.z2 * e.v;
        S.bolts.add(e.x, e.y, e.z, tx, e.y - 0.4, tz, true); // à la hauteur du héros : la claque suit un saut
        S.particles.burst(tx, e.y - 0.4, tz, HIT_COLORS[HitSrc.Fouet], (5 * fx) | 0, 4, 3, false, e.x2, e.z2, 1);
        if (!bladeSnd) {
          audio.blade(); // un seul son par image, même à quatre directions
          bladeSnd = true;
        }
        break;
      }
      case Ev.Puddle:
        // phase 47 C : la fiole de Vitriol éclate, gerbe verte et anneau au sol
        S.particles.burst(e.x, 0.3, e.z, HIT_COLORS[HitSrc.Vitriol], (12 * fx) | 0, 5, 5);
        S.particles.ring(e.x, 0.2, e.z, HIT_COLORS[HitSrc.Vitriol], (10 * fx) | 0, e.v * 2, 1);
        audio.spit();
        break;
      case Ev.Beacon:
        // phase 47 C : balise plantée, anneau doré qui montre sa portée
        S.particles.ring(e.x, 0.2, e.z, PAL.gold, (14 * fx) | 0, e.v * 2, 1.2);
        audio.thud();
        break;
      case Ev.MeteorHit:
        S.particles.burst(e.x, 0.3, e.z, 0xff9a5a, (18 * fx) | 0, 7, 7);
        S.particles.ring(e.x, 0.2, e.z, PAL.gold, (14 * fx) | 0, e.v * 2.4, 1.5);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt * 0.5);
        audio.blast();
        break;
      case Ev.Horn:
        S.particles.ring(e.x, 0.4, e.z, PAL.paper, (26 * fx) | 0, e.v * 2.2, 2);
        audio.roar();
        break;
      case Ev.ShieldBlock:
        S.particles.ring(e.x, 1, e.z, 0x7fd8ff, (20 * fx) | 0, 4, 2);
        S.dmg.text(e.x, 2.2, e.z, t('banner.shield'), 'gold');
        audio.shield();
        break;
      // phase 35 : bonus au sol
      case Ev.PowerDrop:
        S.particles.ring(e.x, 0.8, e.z, PAL.power[e.v], (10 * fx) | 0, 2, 2);
        audio.powerDrop();
        break;
      case Ev.PowerUp:
        S.particles.ring(e.x, 0.8, e.z, PAL.power[e.v], (26 * fx) | 0, 4, 5);
        audio.power(e.v);
        hud.banner(t('banner.power.' + POWER_KEYS[e.v]));
        hud.powerFlash(e.v);
        break;
      case Ev.PowerEnd:
        if (e.v === Pw.Gel) audio.whoosh(); // le temps repart
        break;
      case Ev.Heal: // phase 31 : soins des objets, un chiffre vert par seconde
        S.dmg.text(e.x, 2, e.z, `+${Math.round(e.v)}`, 'heal');
        break;
      case Ev.ShieldReady:
        S.particles.ring(e.x, 0.6, e.z, 0x7fd8ff, (10 * fx) | 0, 1.5, 1);
        break;
      case Ev.RaceStart:
        hud.banner(t('banner.raceStart'));
        audio.levelUp();
        break;
      case Ev.RaceWin:
        hud.banner(t('banner.raceWin'));
        S.particles.ring(e.x, 0.5, e.z, PAL.gold, (30 * fx) | 0, 5, 5);
        audio.chest();
        break;
      case Ev.RaceFail:
        hud.banner(t('banner.raceFail'));
        audio.trickFail();
        break;
      case Ev.Trick:
        S.dmg.text(e.x, 2.4, e.z, t('trick.ok'), 'gold');
        S.particles.ring(e.x, 0.3, e.z, PAL.gold, (18 * fx) | 0, 4, 3);
        audio.trick();
        break;
      case Ev.Spell:
        if (e.y2 === 0) S.onSpell(e.v | 0); // phase 20 : animation du sort sur le héros
        spellFx(S, e.v | 0, e.y2 === 1, e.x, e.y, e.z, e.x2, e.z2, fx, reduced);
        audio.spell(e.v | 0, e.y2 === 1);
        break;
      case Ev.Pickup:
        audio.pickup(now);
        break;
      case Ev.LevelUp:
        S.particles.ring(e.x, 0.3, e.z, PAL.xp, (PT.levelUp.n * fx) | 0, PT.levelUp.speed, PT.levelUp.up);
        break;
      case Ev.Chest:
        S.particles.ring(e.x, 0.5, e.z, PAL.gold, (24 * fx) | 0, 4, 5);
        audio.chest();
        break;
      // phase 17 : objets, synergies, marchand
      case Ev.Item:
        S.particles.ring(e.x, e.y, e.z, PAL.gold, (18 * fx) | 0, 3, 4);
        hud.banner(t('banner.item', { name: itemName(ITEM_KEYS[e.v]) }));
        break;
      case Ev.Synergy:
        S.particles.ring(e.x, e.y, e.z, PAL.accent, (30 * fx) | 0, 5, 6);
        hud.banner(t('banner.synergy', { name: synergyName(e.v) }));
        audio.levelUp();
        break;
      case Ev.MerchantArrive:
        hud.banner(t('banner.merchant'));
        audio.chest();
        break;
      case Ev.MerchantLast:
        hud.banner(t('banner.merchantLast')); // phase 43 : émis juste après MerchantArrive, il remplace sa bannière
        break;
      case Ev.MapChestOpen:
        // phase 18 : coffre de carte payé : pièces qui jaillissent, puis le choix d'objet
        S.particles.burst(e.x, e.y, e.z, PAL.gold, (26 * fx) | 0, 6, 7);
        S.particles.ring(e.x, 0.2, e.z, PAL.gold, (14 * fx) | 0, 3, 3);
        audio.mapChest();
        hud.flash('gold');
        break;
      case Ev.ShrineDone:
        S.particles.ring(e.x, 0.2, e.z, PAL.xp, (36 * fx) | 0, 4.5, 7);
        S.particles.burst(e.x, 1, e.z, PAL.xp, (20 * fx) | 0, 3, 9, false);
        audio.shrine();
        hud.banner(t('banner.shrine'));
        break;
      case Ev.SurvivalWarn:
        // phase 42 : un boss de survie arrive dans quelques secondes
        hud.banner(t('banner.survivalSoon'));
        audio.roar();
        vibrate(40);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite * 0.6);
        break;
      case Ev.BossWarn:
        // phase 37 : plus qu'une minute pour activer le totem
        hud.banner(t('banner.bossWarn'));
        audio.bossWarn();
        break;
      case Ev.TotemOn:
        // phase 37 : le totem s'éveille, le boss du monde arrive
        S.particles.ring(e.x, 0.3, e.z, PAL.hp, (40 * fx) | 0, 6, 8);
        S.particles.burst(e.x, 1.5, e.z, PAL.hp, (24 * fx) | 0, 4, 10, false);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        audio.shrine();
        break;
      case Ev.PortalOpen:
        S.particles.ring(e.x, 0.3, e.z, PAL.xp, (50 * fx) | 0, 6, 9);
        S.particles.burst(e.x, 1.2, e.z, PAL.xp, (30 * fx) | 0, 4, 9, false);
        hud.banner(t('banner.portal', { n: e.v }));
        hud.flash('gold');
        audio.evolve();
        vibrate(60);
        break;
      case Ev.StageStart:
        onStageStart(e.v);
        break;
      case Ev.EndlessStart:
        hud.banner(t('banner.endless'));
        hud.flash('gold');
        break;
      case Ev.EndlessWave:
        hud.banner(t('banner.endlessWave', { n: e.v, count: e.x2 }));
        audio.bossWarn();
        vibrate(80);
        break;
      case Ev.TimeUp:
        hud.banner(t(e.x2 === 1 ? 'banner.timeUpOpen' : e.x2 === 2 ? 'banner.timeUpFight' : 'banner.timeUp'));
        hud.flash('hurt');
        audio.bossWarn();
        vibrate(120);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        break;
      case Ev.MerchantLeave:
        break;
      case Ev.Shockwave:
        S.particles.ring(e.x, 0.2, e.z, PAL.dust, (16 * fx) | 0, e.v * 2.5, 1.2);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        break;
      case Ev.PlayerHurt:
        S.onHurt();
        hurtT = 0.15;
        vibrate(30);
        if (Math.random() < 0.12) audio.hurt();
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt);
        hitStop.request(FEEL.hitStop.hurt.duration, FEEL.hitStop.hurt.scale, 1);
        break;
      case Ev.Wave:
        hud.banner(t('banner.wave'));
        break;
      case Ev.Revive:
        hud.banner(t(e.v > 0 ? 'banner.revive2' : 'banner.revive1'));
        hud.kit(w); // la Plume de phénix consommée quitte la barre d'équipement (événement rare)
        hud.flash('gold');
        S.particles.ring(e.x, 0.5, e.z, PAL.gold, (40 * fx) | 0, 6, 8);
        audio.evolve();
        vibrate(80);
        hitStop.request(FEEL.hitStop.boss.duration, FEEL.hitStop.boss.scale, 2);
        break;
      case Ev.BossSpawn:
        vibrate(80);
        {
          const k = 'banner.boss.' + ENEMIES[e.x2 | 0].key; // événement rare : la concaténation est acceptable
          const name = t(has(k) ? k : 'banner.boss.default');
          hud.banner(e.y2 === 1 ? t('banner.survival', { name }) : name); // phase 42 : boss de survie
        }
        audio.boss();
        if (!reduced) S.shake = Math.max(S.shake, e.x2 === REAPER_TYPE ? FEEL.shake.boss : FEEL.shake.elite);
        break;
      case Ev.BossRoar:
        audio.roar();
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        break;
      case Ev.BossEnrage:
        // phase 43 : rage du boss (en vie depuis BOSS.enrage.after s) : bannière, rugissement, anneau rouge, secousse
        hud.banner(t('banner.enrage'));
        audio.roar();
        vibrate(120);
        S.particles.ring(e.x, 0.4, e.z, PAL.telegraph, (36 * fx) | 0, 8, 2);
        S.particles.burst(e.x, e.y + 1, e.z, PAL.telegraph, (24 * fx) | 0, 5, 8);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.boss);
        break;
      case Ev.Eruption:
        // pic sorti du sol : gerbe de roche vers le haut + anneau de poussière, secousse, coup sourd
        S.particles.burst(e.x, e.y + 0.2, e.z, PAL.rock, (14 * fx) | 0, 3, 9);
        S.particles.ring(e.x, e.y + 0.15, e.z, PAL.dust, (12 * fx) | 0, e.v * 3, 1.5);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt);
        audio.eruption();
        break;
      case Ev.Ring:
        S.particles.ring(e.x, 0.3, e.z, PAL.telegraph, (10 * fx) | 0, 6, 1);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        audio.ring();
        break;
      case Ev.Charge:
        audio.charge();
        break;
      case Ev.Spit:
        S.particles.burst(e.x, e.y, e.z, PAL.spit, (3 * fx) | 0, 2, 2, false);
        audio.spit();
        break;
      case Ev.Arrow:
        S.particles.burst(e.x + e.x2 * 0.6, e.y + 0.2, e.z + e.z2 * 0.6, PAL.arrow, (3 * fx) | 0, 2, 2, false);
        audio.arrow();
        break;
      case Ev.Cast:
        S.particles.burst(e.x, e.y, e.z, PAL.fire, (6 * fx) | 0, 3, 3);
        audio.cast();
        break;
      case Ev.ShotBlocked:
        S.particles.burst(e.x, e.y, e.z, PAL.dust, (5 * fx) | 0, 3, 3);
        audio.thud();
        break;
      case Ev.Dive:
        audio.dive();
        break;
      case Ev.Bolt:
        S.bolts.add(e.x, e.y, e.z, e.x2, e.y2, e.z2);
        S.particles.burst(e.x2, e.y2, e.z2, PAL.bolt, (4 * fx) | 0, 4, 3);
        if (i % 3 === 0) audio.bolt();
        break;
      case Ev.Telegraph:
      case Ev.AuraPulse:
      case Ev.Victory:
      case Ev.Death:
        break;
    }
  }
}

// ---------- boucle principale : pas fixe + interpolation ----------
let last = performance.now();
let acc = 0;
// onglet perf : anneau de 120 frames (2 s à 60 Hz) et copie triée préallouée : aucune allocation par frame
const PERF_WINDOW = 120;
const frameTimes = new Float64Array(PERF_WINDOW).fill(16);
const frameSorted = new Float64Array(PERF_WINDOW);
let frameIdx = 0;
// intervalles entre frames rAF (phase 9) : toujours mesurés, c'est ce qui déclenche le repli automatique de qualité
const gapTimes = new Float64Array(PERF_WINDOW).fill(16);
const gapSorted = new Float64Array(PERF_WINDOW);
let gapIdx = 0;
let gapP95 = 16;
let gapT0 = 0; // fenêtres de 2 s de temps réel (indépendantes du fps)
const GAP_P95_LIMIT = 24; // ms : au-delà pendant 3 fenêtres de 2 s, on descend d'un niveau (jamais de remontée en cours de run)
// fps réels : frames rAF comptées sur une fenêtre de 2 s (ce que voit le joueur, pas seulement notre temps JS)
let fpsT0 = 0;
let fpsFrames = 0;
let fps = 0;
// ratio temps de jeu / temps réel sur la même fenêtre : vérifie que le hit-stop reste borné (≈ 0,9–1 attendu en jeu)
let simT0 = 0;
let simRatio = 1;

function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  if (innerWidth !== sizeW || innerHeight !== sizeH || devicePixelRatio !== sizeDpr) resize();
  const gapMs = debugRt && debugRt.slowFrames > 0 ? debugRt.slowFrames : nowMs - last;
  let realDt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  // repli automatique de qualité : p95 des intervalles sur 2 s, en jeu seulement, après les 3 premières secondes du run
  gapTimes[gapIdx++ % PERF_WINDOW] = gapMs;
  if (nowMs - gapT0 >= 2000) {
    gapT0 = nowMs;
    gapSorted.set(gapTimes);
    gapSorted.sort();
    gapP95 = gapSorted[(PERF_WINDOW * 0.95) | 0];
    if (app === 'play' && world && world.t > 3 && meta.settings.quality === 'auto') {
      slowWindows = gapP95 > GAP_P95_LIMIT ? slowWindows + 1 : 0;
      if (slowWindows >= 3 && autoLevel > 0) {
        autoLevel--;
        slowWindows = 0;
        applyQuality();
        hud.banner(t('banner.quality'));
      }
    } else slowWindows = 0;
  }
  if (debugRt) realDt *= debugRt.speed; // captures et tests uniquement (null en prod)
  const now = nowMs / 1000;
  const t0 = performance.now();

  if (app === 'play' && world) {
    // hit-stop borné : ralentit le temps réel injecté dans l'accumulateur, le pas fixe reste déterministe
    let dtIn = realDt;
    if (resumeEase > 0) {
      // 1.37.1 : reprise en douceur, de FEEL.resume.from à 1 en FEEL.resume.ease s
      const R = FEEL.resume;
      dtIn *= R.from + (1 - R.from) * (1 - resumeEase / R.ease);
      resumeEase = Math.max(0, resumeEase - realDt);
    }
    acc += hitStop.advance(dtIn);
    let n = 0;
    while (acc >= STEP && n < 4) {
      input.poll(inp);
      step(world, inp, STEP);
      handleEvents(world, now);
      acc -= STEP;
      n++;
      if (world.mode !== Mode.Play) break;
    }
    if (n === 4) acc = 0; // on ne rattrape pas : évite la spirale de la mort
    if (debugRt) debugRt.onFrame(world); // mode stress (debug uniquement) ; null en prod
    if (world.mode === Mode.Dead)
      gameOver(world.endless); // phase 39 : la victoire est acquise si l'on est en monde infini
    else if (world.mode === Mode.Won) openVictory();
    else if (world.mode === Mode.LevelUp) openLevelUp();
    else if (world.mode === Mode.Merchant) openMerchant();
    hurtT -= realDt;
    hud.update(world, hurtT, now, realDt);
    // phase 37 : le noir monte pendant la seconde passée dans le portail ; quand la carte se reconstruit (StageStart),
    // l'écran est déjà noir et le gel de la reconstruction ne se voit pas
    if (world.portal.open) {
      const f = Math.min(1, world.portal.charge / STAGE.portalHold);
      if (Math.abs(f - portalFade) > 0.02 || (f === 0 && portalFade !== 0)) {
        portalFade = f;
        stageFade.style.transition = 'opacity 0.1s linear';
        stageFade.style.opacity = String(f);
      }
    } else if (portalFade !== 0) portalFade = 0;
    const frozenNow = world.powerT[Pw.Gel] > 0; // phase 35 : voile bleuté du Temps figé (classe CSS, écrite au changement)
    if (frozenNow !== timestopOn) {
      timestopOn = frozenNow;
      document.body.classList.toggle('timestop', frozenNow);
    }
    mapView.update(world, realDt); // phase 27 : minicarte (4 fois par seconde)
    const slideOn = world.player.sliding;
    if (slideOn !== slideBtnOn) {
      slideBtnOn = slideOn;
      $('btnSlide').classList.toggle('on', slideOn);
    }
  } else if (app === 'levelup') {
    // clavier / manette : touches 1-3 (parité avec le tap sur la carte)
    const pick = input.takePick();
    if (pick >= 0) choose(pick);
  } else if (app === 'merchant') {
    const pick = input.takePick(); // 1–4 : acheter
    if (pick >= 0) merchantAct(pick);
  }

  // phase 36 : musique plus basse et étouffée hors du jeu actif (écrite au changement)
  // pause, choix de carte, marchand, carte, fin : pas les écrans du menu (on y règle le curseur Musique à vrai niveau)
  const duckNow =
    app === 'pause' || app === 'levelup' || app === 'merchant' || app === 'map' || app === 'over' || app === 'victory';
  if (duckNow !== duckOn) {
    duckOn = duckNow;
    audio.duck(duckNow);
  }
  if (world && app !== 'menu' && scene) {
    const alpha = app === 'play' ? Math.min(1, acc / STEP) : 1;
    scene.render(world, alpha, realDt * (app === 'play' ? hitStop.timeScale : 0.2), now, hurtT > 0);
    scene.dmg.update(realDt, scene.camera, innerWidth, innerHeight);
    scene.marks.update(world.powers, world.powerCount, now, scene.camera, innerWidth, innerHeight); // phase 35
  } else if (scene && sceneReady) {
    scene.renderIdle(now, realDt);
  }

  if (perfOn && scene) {
    frameTimes[frameIdx++ % PERF_WINDOW] = performance.now() - t0;
    fpsFrames++;
    if (fpsT0 === 0) {
      fpsT0 = nowMs;
      fpsFrames = 0;
      simT0 = world ? world.t : 0;
    } else if (nowMs - fpsT0 >= 2000) {
      fps = (fpsFrames * 1000) / (nowMs - fpsT0);
      if (world && app === 'play') simRatio = ((world.t - simT0) * 1000) / (nowMs - fpsT0);
      fpsT0 = nowMs;
      fpsFrames = 0;
      simT0 = world ? world.t : 0;
    }
    if (frameIdx % 10 === 0) {
      frameSorted.set(frameTimes);
      frameSorted.sort(); // tri numérique natif des Float64Array, en place
      const p50 = frameSorted[PERF_WINDOW >> 1];
      const p95 = frameSorted[(PERF_WINDOW * 0.95) | 0];
      const info = scene.info();
      hud.perf(
        `fps ${fps.toFixed(0)}  js p50 ${p50.toFixed(2)} ms  p95 ${p95.toFixed(2)} ms (2 s)\n` +
          `temps ×${simRatio.toFixed(2)}  hit-stop ${hitStop.enabled ? 'on' : 'off'}\n` +
          `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
          (world
            ? `ennemis ${world.enemyCount}  proj ${world.projCount}  gemmes ${world.gemCount}  part. ${scene.particles.alive}\n`
            : '') +
          `voix audio ${audio.voiceCount}/${audio.maxVoices}\n` +
          `modèles : héros ${scene.heroKind}, ennemis ${scene.enemyStatus}\n` +
          `rendu niv ${info.level} (${meta.settings.quality})  res ${info.width}×${info.height}  frame p95 ${gapP95.toFixed(1)} ms`,
      );
    }
  }
}

// ---------- démarrage ----------
function applyMeta(): void {
  audio.setMuted(meta.muted);
  applyFx();
  applyQuality();
  applySettings();
  updateBestLine();
  syncLang();
  refreshAccount();
}
// phase 36 : le son (planche de bruitages, musique du menu) démarre au premier geste, jamais avant
// pointerup, pas pointerdown : au doigt, seul le relâchement compte comme activation (spec HTML, Chrome Android, iOS)
function firstGesture(e: Event): void {
  removeEventListener('pointerup', firstGesture, true);
  removeEventListener('keydown', firstGesture, true);
  audio.init();
  // un geste sur Jouer lance la musique de partie juste après : ne pas télécharger celle du menu pour rien
  const t = e.target as Element | null;
  if (t?.closest?.('#playBtn, #dailyPlayBtn')) return;
  audio.setMusic(app === 'play' || app === 'levelup' || app === 'merchant' ? 'game' : 'menu'); // aide, réglages… : le menu
}
addEventListener('pointerup', firstGesture, true);
addEventListener('keydown', firstGesture, true);
applyMeta(); // depuis le repli localStorage, tout de suite : aucun décalage de mise en page quand IndexedDB répond
refreshAccount();
// premier lancement : l'aide « Comment jouer » (phase 14), une fois ; pas dans les tests sauf demande (?help=1)
if (!meta.seenHelp && (!debugEnabled() || location.search.includes('help=1'))) {
  meta.seenHelp = true;
  saveMeta(meta);
  openScreen('help');
}
let metaLoaded = false;
loadMeta().then((m) => {
  if (JSON.stringify(m) !== JSON.stringify(meta)) {
    meta = m;
    applyMeta();
  }
  metaLoaded = true;
  // compte connu : charger Firebase après la méta durable (sinon IndexedDB pourrait écraser un pull) et hors du
  // chemin critique ; le menu d'un joueur sans compte ne charge jamais Firebase
  let known = false;
  try {
    known = localStorage.getItem(SYNC.accountKey) === '1' || sessionStorage.getItem(SYNC.redirectKey) === '1';
  } catch {
    /* stockage bloqué */
  }
  if (known) {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => void loadAccount());
    else setTimeout(() => void loadAccount(), 1500);
  }
});
setPerf(perfOn);
requestAnimationFrame(frame);

// hooks de debug / tests (jamais en prod sans ?debug=1)
const debugRt = installDebugHooks({
  get world() {
    return world;
  },
  get app() {
    return app;
  },
  get scene() {
    return scene;
  },
  ready: () => sceneReady && metaLoaded,
  start: startGame,
  setMapSeed(seed) {
    debugMapSeed = seed;
  },
  get mapSeed() {
    return decorSeed;
  },
  afterStage() {
    if (world) onStageStart(world.stage + 1);
  },
  afterSimJump() {
    if (!world) return;
    hud.kit(world);
    if (world.mode === Mode.LevelUp) openLevelUp();
  },
  audioVoices: () => audio.voiceCount,
  audioState: () => audio.state,
  getMeta: () => meta,
  setMeta(m) {
    meta = normalizeMeta(m);
    saveMeta(meta);
    applyMeta();
  },
  fakeAccount(uid, rows, opts) {
    const sent: unknown[] = [];
    // 1.36.1 : `opts.sync` branche aussi la sauvegarde (lecture, écriture, échecs simulés) et la réconciliation
    const saves: CloudDoc[] = [];
    let failWrites = opts?.failWrites ?? 0;
    const user: AccountUser = { uid, email: 'test@example.com', name: 'Testeur Fictif', provider: 'password' };
    const fake = {
      user,
      ready: true,
      onChange: null,
      fetchBoard: () => Promise.resolve({ rows, mine: null }),
      submitScore: (_uid: string, name: string, run: RunScore) => {
        sent.push({ name, ...run });
        return Promise.resolve();
      },
      renameScores: () => Promise.resolve(),
      readSave: () => Promise.resolve(saves.length ? saves[saves.length - 1] : null),
      writeSave: (_uid: string, d: CloudDoc) => {
        if (failWrites > 0) {
          failWrites--;
          return Promise.reject(new Error('fake/unavailable'));
        }
        saves.push(d);
        return Promise.resolve();
      },
    };
    account = fake as unknown as Account;
    accountUnavailable = false;
    accView.status = 'in';
    accView.email = user.email;
    refreshAccount();
    fillPseudo(user);
    if (opts?.sync) onAuthChange(user);
    return { sent, saves };
  },
});

// Module de rendu : déjà téléchargé (modulepreload), il n'est évalué et la scène construite qu'à la première
// interaction du joueur (geste, touche, survol de « Jouer ») : le menu reste léger tant qu'on ne joue pas, et
// aucune tâche longue ne précède l'interactivité (Lighthouse). En debug/tests (`?debug=1`), tout de suite :
// les specs attendent `__game.ready` sans interagir.
{
  const warm = () => void loadScene().catch(() => {});
  if (debugRt) requestAnimationFrame(warm);
  else {
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const)
      addEventListener(ev, warm, { once: true, passive: true });
    $('playBtn').addEventListener('pointerenter', warm, { once: true });
  }
}
