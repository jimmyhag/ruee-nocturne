import {
  ARENA,
  CHARACTERS,
  DAILY,
  ELITE_TYPE,
  ENDLESS,
  ENEMIES,
  ITEM_KEYS,
  MAP,
  POWER_KEYS,
  REAPER_TYPE,
  REVEAL,
  SLIDE,
  STAGE,
  STEP,
  TUTORIAL,
} from './sim/balance';
import { startRun, step } from './sim/step';
import { Ev, Mode, Pw, Spell, HIT_CRIT, HitSrc } from './sim/types';
import { POWER_ICON } from './ui/icons';
import type { Input } from './sim/types';
import { World } from './sim/world';
import { restoreWorld, snapshotWorld } from './sim/snapshot';
import { clearRun, peekRun, readRun, writeRun, type RunRead, type SavedRun } from './meta/run-save';
import type { GameScene } from './render/scene';
import { PAL } from './render/palette';
import { FEEL, HitStop, tierCelebration } from './render/feel';
import { InputManager } from './platform/input';
import { AudioBus, FinalSfx } from './platform/audio';
import { Hud, flashCard, gearHtml, renderCards, showRevealed } from './ui/hud';
import { statsHTML } from './ui/stats';
import { LANG_SETTINGS, fmtDay, fmtTime, getLang, has, ordinal, resolveLang, setLang, t } from './i18n';
import { achName, achUnlock, cardTitle, characterName, itemName, synergyName, weaponName } from './ui/cards';
import { canGainItem } from './sim/items';
import { WEAPON_KEYS } from './sim/weapons/defs';
import { MERCHANT_LEAVE, MERCHANT_REROLL, rerollCost } from './sim/merchant';
import { LEVEL_REROLL, canReroll, tutorialLock } from './sim/progression';
import { adoptDaily, startEndless, totemLocked } from './sim/stages';
import { FINAL_DONE, adoptCleared } from './sim/final';
import { creditAbandoned, creditOutcome, runOutcome } from './meta/outcome';
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
import { BOARD, cleanPseudo, friendRows, isoWeek, suggestPseudo } from './meta/board';
import { cardText, challengeGap, challengeUrl, isChallengeHash, parseChallenge } from './meta/share-card';
import type { CardRun, Challenge } from './meta/share-card';
import { addFriend, removeFriend } from './meta/friends';
import { shareText } from './platform/share';
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
  tutorialOptions,
  worldOptions,
} from './meta/shop';
import { HINTS, Step, guideCardsDone, guideJump, newGuide, readGuide, takeWindow } from './meta/guide';
import type { GuideState, Hint } from './meta/guide';
import { softAfterRun, tutorialDue, tutorialEnd, tutorialSkip } from './meta/tutorial';
import { TUTO_FEEL, TutorialView } from './ui/tutorial';
import { buyUnlock, recordCodex, toggleItem } from './meta/library';
import { addCharRun, runCharStats } from './meta/chars';
import type { LibKind } from './meta/library';
import { LIB_TABS, renderLibrary } from './ui/library';
import { initKeySettings, loadKeyboardLayout, renderKeyHints } from './ui/keys';
import type { LibTab } from './ui/library';
import {
  bestMedal,
  dailyMapSeed,
  dailyRule,
  dailyRuns,
  dailySeed,
  msToNextDaily,
  recordDaily,
  recordStreak,
  settleStreak,
  streakNow,
  streakPreview,
  todayKey,
} from './meta/daily';
import type { StreakGain } from './meta/daily';
import { ensureMissions, missionGold, missionsAfterRun } from './meta/missions';
import type { Mission } from './meta/missions';
import { missionText, renderMissions } from './ui/missions';
import { medalName, medalNext, ruleName, ruleText } from './ui/daily-rule';
import type { PatchNote } from './meta/patch-notes';
import { hasUnseenNotes, renderNotes } from './ui/notes';
import { MapView } from './ui/minimap';
import { revealAfterRun, revealNews } from './meta/reveal';
import {
  ACH_TABS,
  esc,
  goldHtml,
  renderAchievements,
  renderCharacters,
  renderProgress,
  renderRerolls,
  renderSlots,
  slotCondition,
  slotName,
} from './ui/meta-ui';
import type { AchTab } from './ui/meta-ui';
import { LOCKED_TABS, profileAria, renderHome, stepHero, tabsLocked } from './ui/home';
import type { CharacterKey, ItemKey } from './sim/types';
import { installDebugHooks, debugEnabled } from './debug';
import {
  QUALITY_STEPS,
  QualityChange,
  newAutoQuality,
  qualityIdle,
  qualityNewRun,
  qualityWindow,
  windowP95,
} from './render/quality';
import { Pwa } from './platform/pwa';
import { loadConfig } from './platform/firebase-config';
import { Retention } from './platform/retention';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const VERSION = __APP_VERSION__;

// ---------- rendu (module chargé à part : three + src/render ≈ 150 ko gzip) ----------
// Le menu s'affiche et répond sans WebGL. Le module de rendu n'est pas préchargé avec la page (interface « Nocturne » :
// le menu n'a plus de 3D, le premier affichage garde la bande passante ; Lighthouse LCP) : le service worker le met en
// cache après la première visite, sinon il part après le premier geste du joueur ; il est évalué et la scène construite
// quand l'écran est au repos, ou dès « Jouer » si le joueur est plus rapide. Les shaders sont compilés en parallèle
// (compileAsync) : pas de tâche longue sur le fil principal pendant le chargement (Lighthouse TBT), et le premier run
// démarre sans à-coup.
let scene: GameScene | null = null;
let sceneReady = false; // construite et shaders compilés : on peut rendre
let scenePromise: Promise<GameScene> | null = null;
// Passe d'ergonomie (docs/specs/ui-ergonomie.md, décision 17) : rien de lourd pendant un appui. La scène ne se prépare
// plus dans le premier geste du joueur (une tâche de 8,6 s gelait l'écran juste après, processeur ralenti 4 fois) :
// elle se prépare quand l'écran est au repos (aucun appui depuis `REST_MS`, chaque appui repoussant la suite), par
// étapes qui rendent la main entre elles (module, construction, décor, shaders). « Jouer » avant la fin : `urgent`,
// les étapes s'enchaînent dès la prochaine image (le bouton a le temps de montrer « Chargement… »).
const REST_MS = 1200;
let lastPress = 0; // dernier appui ou défilement (doigt, souris, touche, molette), en ms de performance.now()
let pressing = false; // un doigt ou un bouton de souris est posé
let sceneUrgent = false;
let restWake: (() => void) | null = null;
function notePress(e: Event): void {
  lastPress = performance.now();
  const ty = e.type;
  if (ty === 'pointerdown' || ty === 'touchstart') pressing = true;
  else if (ty === 'pointerup' || ty === 'pointercancel' || ty === 'touchend' || ty === 'touchcancel') pressing = false;
}
// à la capture et passifs : deux affectations par événement, rien d'alloué (le défilement d'une liste compte aussi)
for (const ev of [
  'pointerdown',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchend',
  'touchcancel',
  'keydown',
  'wheel',
  'scroll',
])
  addEventListener(ev, notePress, { capture: true, passive: true });
/** Délai (ms) avant que l'écran soit au repos ; ≤ 0 : il l'est. Un appui « posé » depuis plus de 10 s ne compte plus. */
function restDelay(): number {
  const now = performance.now();
  if (pressing && now - lastPress < 10_000) return REST_MS;
  return lastPress + REST_MS - now;
}
/**
 * Rend la main, puis attend le bon moment pour une étape lourde de la scène : l'écran au repos, ou tout de suite après
 * la prochaine image si la scène est attendue (`sceneUrgent`).
 */
function atRest(): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    let done = false;
    const check = (): void => {
      if (done) return;
      clearTimeout(timer);
      const wait = sceneUrgent ? 0 : restDelay();
      if (wait > 0) {
        timer = window.setTimeout(check, wait);
        return;
      }
      done = true;
      if (restWake === check) restWake = null;
      resolve();
    };
    restWake = check;
    // toujours une image d'abord (le navigateur peint, traite les appuis) ; minuterie de secours : page en arrière-plan
    requestAnimationFrame(() => setTimeout(check, 0));
    timer = window.setTimeout(check, 250);
  });
}
function loadScene(urgent = false): Promise<GameScene> {
  if (urgent && !sceneUrgent && !sceneReady) {
    sceneUrgent = true;
    // une étape attendait le repos : elle part, mais après la prochaine image (« Chargement… » a le temps de se
    // peindre, l'étape ne s'exécute pas dans l'appui) ; la minuterie de l'attente sert de secours en arrière-plan
    const wake = restWake;
    if (wake) requestAnimationFrame(() => setTimeout(wake, 0));
  }
  scenePromise ??= (async () => {
    await atRest();
    // relecture perf : la graisse 300 du chrono n'est pas sur l'accueil ; chargée avec la scène, pas à la première image
    void document.fonts?.load("300 40px 'Barlow Condensed'").catch(() => undefined);
    const { GameScene } = await import('./render/scene');
    await atRest();
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
    s.reducedFx = reducedFx(); // corrompus : réduction des effets
    s.setQuality(meta.settings.quality === 'pixel', autoStep()); // phase 9 : réglage ; 1.69.2 : palier auto
    await atRest();
    s.setCharacter(meta.character, outfitOf(meta, meta.character)); // héros de la prochaine partie, chargé et compilé d'avance
    sizeW = sizeH = 0;
    resize();
    await atRest();
    // le décor ne dépend que de DECOR_SEED : construit ici pour que warmup() compile aussi ses matériaux (lacs, lanternes)
    s.buildDecor(new World(DECOR_SEED));
    await atRest();
    await s.warmup();
    sceneReady = true;
    sceneUrgent = false; // ce qui suit (modèle d'un autre héros au carrousel) attend de nouveau le repos
    return s;
  })();
  return scenePromise;
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
  | 'challenge'
  | 'notes'
  | 'consent'
  | 'merchant'
  | 'map'
  | 'tutoEnd'
  | 'info';
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
  'challenge',
  'notes',
  'consent',
  'map',
  'tutoEnd', // partie guidée : « À toi de jouer »
  'info', // 1.69.0 : fenêtre de première fois (portail, temps écoulé, monde infini)
] as const;
let backTo: AppMode = 'menu'; // écran à rouvrir en quittant boutique / succès / réglages
// lot L1 : mesure anonyme de fréquentation, seulement sur accord (src/platform/retention.ts, sans SDK Firebase)
const retention = new Retention(loadConfig);
let dailyRun = false; // partie en cours = défi du jour
// partie guidée (docs/specs/tutoriel.md) : partie en cours = la partie guidée ; guide de la partie (aussi pour les consignes
// de première apparition des autres parties, décision 8), gardé avec elle (décision 10)
let tutorialRun = false;
let guide: GuideState | null = null;
// phase 49 : partie gardée sur l'appareil (menu « Reprendre »), personnage et tenue de la partie en cours (le joueur peut
// changer de personnage au menu pendant qu'elle attend)
let savedRun: SavedRun | null = null;
let runChar = 'eclaireuse';
let runOutfit = 0;
let runDay = ''; // défi du jour : le jour de la partie (reprise le lendemain, elle compte pour son jour)
// lot L4 : le défi d'un ami (lien). D'un jour passé, il se joue avec la graine et les règles de ce jour-là mais ne compte
// ni pour la série ni pour le classement du jour (`runRanked` faux) ; son score à battre s'affiche sous le chrono.
let runRanked = true;
let runBeat: { t: number; k: number } | null = null;
let linkChallenge: Challenge | null = null; // défi reçu par lien, sur sa feuille au menu
/** Choix faits dans la partie (cartes, relances, achats) : avec le temps de jeu, dit si l'état a changé depuis l'écriture. */
let runEdits = 0;
let runSavedKey = '';
/** Lancement en attente d'une confirmation d'abandon (« Jouer » ou défi du jour alors qu'une partie attend). */
let abandonFor: { daily: boolean; challenge: Challenge | null; tutorial: boolean } | null = null;
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
  document.body.classList.toggle('calm', r); // interface Nocturne : les animations du menu s'arrêtent (décision 19)
  document.body.classList.toggle('fx-reduced', r); // lot L5 : coupe le liseré animé du palier III
  if (scene) scene.reducedFx = r; // corrompus : traînée ÷2, pas de battement violet
  $('fxBtn').textContent = t(
    r ? (meta.fxChosen ? 'settings.fx.reduced' : 'settings.fx.reducedSystem') : 'settings.fx.full',
  );
  pressed($('setFx'), 'fx', r ? 'reduced' : 'full');
}
/** Choix soulignés (réglages) : le bouton dont `data-<attr>` vaut `v` est enfoncé. */
function pressed(group: HTMLElement, attr: string, v: string): void {
  for (const b of group.querySelectorAll<HTMLElement>(`[data-${attr}]`))
    b.setAttribute('aria-pressed', String(b.dataset[attr] === v));
}
// rendu (phase 9) : réglage auto|net|pixel. 1.69.2 (docs/specs/rendu-allege.md) : en auto, l'automate de
// `render/quality.ts` choisit un palier (net, allégé, puis résolution ×0,85 → ×0,6, jamais le pixel) d'après les mesures
// de chaque fenêtre de 2 s, et remonte quand les images redeviennent confortables
let autoQ = newAutoQuality();
/** Palier du rendu : celui de l'automate en auto ; net (0) sinon (le pixel est un réglage à part). */
function autoStep(): number {
  return meta.settings.quality === 'auto' ? autoQ.step : 0;
}
function applyQuality(): void {
  scene?.setQuality(meta.settings.quality === 'pixel', autoStep());
  $('qualityBtn').textContent = t('settings.quality.' + meta.settings.quality);
  pressed($('setQuality'), 'quality', meta.settings.quality);
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

/** La partie est à l'écran (en jeu ou sous un écran de partie) : la scène 3D se rend ; au menu, plus rien (décision 6). */
function gameShown(): boolean {
  return (
    app === 'play' ||
    app === 'pause' ||
    app === 'levelup' ||
    app === 'merchant' ||
    app === 'map' ||
    app === 'victory' ||
    app === 'over' ||
    app === 'tutoEnd' ||
    app === 'info'
  ); // les écrans intérieurs (réglages ou emplacements ouverts depuis la pause ou la fin) ont leur propre fond opaque
}
/** Écrans intérieurs de l'accueil : la barre d'onglets les accompagne quand ils sont ouverts depuis l'accueil. */
const MENU_SHEETS: readonly AppMode[] = [
  'characters',
  'shop',
  'achievements',
  'library',
  'board',
  'daily',
  'notes',
  'account',
  'settings',
  'help',
];
/** Onglet de la barre du bas de chaque écran (l'onglet courant passe en lanterne). */
const TAB_OF: Partial<Record<AppMode, string>> = {
  characters: 'charsBtn',
  shop: 'shopBtn',
  achievements: 'achBtn',
  library: 'libBtn',
  board: 'boardBtn',
};
function showOnly(id: AppMode | null): void {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('vignette').hidden = world === null; // vignette douce sur le jeu (phase 9), pas sur le menu ni ses écrans
  // interface Nocturne (décision 5) : barre d'onglets sur l'accueil et les écrans ouverts depuis lui (pas depuis la
  // pause ni l'écran de fin : on ne quitte pas une partie par un onglet)
  const tabs = id === 'menu' || (id !== null && MENU_SHEETS.includes(id) && backTo === 'menu');
  $('tabBar').hidden = !tabs;
  // relecture perf : au menu et dans ses écrans (fond opaque), le canvas n'est plus composité
  $('c').style.visibility = tabs || id === 'consent' ? 'hidden' : '';
  document.body.classList.toggle('tabs-on', tabs);
  const cur = id ? TAB_OF[id] : undefined;
  for (const b of $('tabBar').querySelectorAll<HTMLElement>('button'))
    if (b.id === cur) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  if (id !== 'menu') $('tabTip').hidden = true;
}
/** Héros regardé : carrousel de l'accueil et fiche de l'écran Héros (un héros verrouillé se regarde sans se choisir). */
let heroView: CharacterKey = metaAtStart.character;
/** Le héros regardé est verrouillé : « Jouer » est indisponible. */
let heroLocked = false;
/** « 14 h 22 » avant le prochain défi du jour. */
function dailyLeft(): string {
  const min = Math.ceil(msToNextDaily() / 60000),
    h = Math.floor(min / 60),
    m = min % 60;
  return h > 0 ? t('daily.hm', { h, m: String(m).padStart(2, '0') }) : t('daily.m', { m });
}
/** Lot L3 : le joker a pardonné un jour manqué à cette ouverture (« Ta série est sauvée par le joker » au menu). */
let jokerSaved = false;
/**
 * Lot L3 : à chaque affichage du menu, le jour UTC courant — missions du jour tirées au premier passage d'un nouveau jour,
 * série réglée (joker consommé ou série perdue après un oubli). Sauvegarde si quelque chose a changé ; rend le jour.
 */
function dailyRefresh(): string {
  const today = todayKey();
  const drawn = ensureMissions(meta, today);
  // relecture du lot L3 : un défi gardé du lendemain du dernier jour compté, repris après minuit, comptera pour son jour
  // lot L4 : pas le défi gardé d'un ami d'un jour passé, qui ne compte pas pour la série
  const settled = settleStreak(meta, today, savedRun?.daily && savedRun.ranked !== false ? (savedRun.day ?? '') : '');
  if (settled === 'joker') jokerSaved = true;
  if (drawn || settled) saveMeta(meta);
  return today;
}
/** Accueil (profil, or, carrousel, objectif, missions, boutons du défi du jour et des nouveautés) et écran Héros. */
function updateBestLine(): void {
  $('resetNote').hidden = meta.seenReset;
  heroLocked = renderHome(meta, heroView);
  renderCharacters($('chars'), meta, $('charInfo'), heroView);
  renderHeroCounts();
  const daily = dailyUnlocked(meta);
  $('dailyBtn').hidden = !daily;
  // lot L3 : la série sur le bouton du défi (flamme + nombre), le joker dit dès l'ouverture, les missions du jour
  const today = dailyRefresh();
  const streak = streakNow(meta, today);
  if (daily) {
    // passe d'ergonomie (décision 8) : « à jouer » tant qu'aucune partie du défi n'est enregistrée aujourd'hui (flamme
    // et contour lanterne), « fait » ensuite (coche) ; le nom accessible dit tout : durée, série, état, temps ou délai
    const best = dailyRuns(meta)[0]?.t ?? 0; // meilleure partie du jour (temps tenu)
    // défi v2 (UI & Layout Contract) : « fait » devient la meilleure médaille du jour (pastille bronze, argent, or)
    const medal = bestMedal(meta);
    const state = medal > 0 ? t(`medal.name.${medal}`) : t(best > 0 ? 'menu.dailyDone' : 'menu.dailyTodo');
    $('dailyBtn').dataset.state = best > 0 ? 'done' : 'todo';
    if (medal > 0) $('dailyBtn').dataset.medal = String(medal);
    else delete $('dailyBtn').dataset.medal;
    $('dailyRail').textContent = state;
    const parts = [t('menu.dailyAria')];
    if (streak > 0) parts.push(t('menu.streakAria', { n: streak }));
    parts.push(medal > 0 ? t('menu.dailyAriaMedal', { medal: state }) : state); // « meilleure médaille : argent »
    parts.push(
      best > 0 ? t('menu.dailyAriaBest', { time: fmtTime(best) }) : t('menu.dailyAriaLeft', { time: dailyLeft() }),
    );
    $('dailyBtn').setAttribute('aria-label', parts.join(', '));
  }
  $('dailyStreak').hidden = streak === 0;
  $('dailyStreakN').textContent = String(streak);
  $('dailyStreak').setAttribute('aria-label', t('menu.streak', { n: streak }));
  $('dailyStreak').title = t('menu.streak', { n: streak });
  $('streakNote').hidden = !(daily && jokerSaved && meta.streak.last !== today);
  renderMissions($('missionList'), $('missionsCount'), $('missionsDone'), meta);
  const fresh = hasUnseenNotes(meta.seenNotes, VERSION, meta.runs); // 1.49.0 : une version pas encore lue
  $('notesDot').hidden = !fresh;
  $('notesBtn').hidden = meta.reveal === 0 && !fresh; // première ouverture : rien à raconter (maquette)
  $('notesBtn').setAttribute('aria-label', t(fresh ? 'menu.notesAriaNew' : 'menu.notesAria', { v: VERSION }));
  updateResumeBtn();
}
/** Écran Héros : or à droite, « 01 / 09 » (place du héros regardé), « Les 9 héros », débloqués. */
function renderHeroCounts(): void {
  const i = CHARACTERS.findIndex((c) => c.key === heroView);
  $('charsCount').textContent = `${String(i + 1).padStart(2, '0')} / ${String(CHARACTERS.length).padStart(2, '0')}`;
  $('charsAll').textContent = t('chars.all', { n: CHARACTERS.length });
  $('charsOpen').textContent = t('chars.open', { n: unlockedCharacters(meta).length });
  $('charsGold').innerHTML = goldHtml(meta.gold);
}
/** Carrousel : héros voisin (`dir` ±1) ; un héros débloqué devient le héros choisi, un verrouillé se regarde seulement. */
/** Pose différée du héros 3D quand le carrousel tourne. */
let heroModelT = 0;
function viewHero(k: CharacterKey): void {
  heroView = k;
  if (unlockedCharacters(meta).includes(k) && meta.character !== k) {
    meta.character = k;
    saveMeta(meta);
    // relecture perf : le modèle 3D (chargement, compilation) attend que le carrousel s'arrête ; passe d'ergonomie
    // (décision 17) : et que l'écran soit au repos, comme la préparation de la scène. startGame le pose de toute façon
    clearTimeout(heroModelT);
    const pose = (): void => {
      const wait = restDelay();
      if (wait > 0) heroModelT = window.setTimeout(pose, wait);
      else scene?.setCharacter(meta.character, outfitOf(meta, meta.character));
    };
    heroModelT = window.setTimeout(pose, 300);
  }
  updateBestLine();
}
/** Applique les réglages (HUD, gaucher, vibrations, son, langue) au DOM et aux libellés. */
function applySettings(): void {
  document.documentElement.style.setProperty('--hud-scale', String(meta.settings.hudScale));
  document.body.classList.toggle('lefty', meta.settings.lefty);
  $('soundBtn').textContent = t(meta.muted ? 'settings.sound.off' : 'settings.sound.on');
  // interface Nocturne : interrupteurs (aria-pressed) et choix soulignés
  $('setSoundBtn').setAttribute('aria-pressed', String(!meta.muted));
  $('setVibrateBtn').setAttribute('aria-pressed', String(meta.settings.vibrate));
  $('setLeftyBtn').setAttribute('aria-pressed', String(meta.settings.lefty));
  $('setRetentionBtn').setAttribute('aria-pressed', String(retention.consent === 'yes'));
  pressed($('setLang'), 'lang', meta.settings.lang);
  ($('sfxVol') as HTMLInputElement).value = String(Math.round(meta.settings.sfxVol * 100));
  ($('musicVol') as HTMLInputElement).value = String(Math.round(meta.settings.musicVol * 100));
  audio.setVolumes(meta.settings.sfxVol, meta.settings.musicVol);
  applyKeys();
  for (const [id, v] of [
    ['hudSmallBtn', 0.85],
    ['hudNormalBtn', 1],
    ['hudLargeBtn', 1.2],
  ] as const)
    $(id).setAttribute('aria-pressed', String(meta.settings.hudScale === v));
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
  if (app === 'menu' || app === 'over' || app === 'pause' || app === 'settings') {
    backTo = app === 'settings' ? 'menu' : app;
    // focus : en fermant l'écran, il revient sur l'élément qui l'a ouvert (contrat de la spec Nocturne)
    if (app !== 'settings') opener = document.activeElement as HTMLElement | null;
  }
  app = id;
  // focus (contrat de la spec) : si ce qui a ouvert l'écran est maintenant masqué, il passe à la flèche retour
  queueMicrotask(() => {
    const a = document.activeElement as HTMLElement | null;
    if (app === id && (!a || a === document.body || a.closest('[hidden]')))
      $(id).querySelector<HTMLElement>('.back')?.focus({ preventScroll: true });
  });
  if (id === 'shop') renderShopScreen();
  else if (id === 'achievements') renderAchScreen();
  else if (id === 'library') renderLibraryScreen();
  else if (id === 'account') openAccount();
  else if (id === 'board') {
    showTop(id);
    void openBoard();
    return;
  } else if (id === 'characters') {
    renderCharacters($('chars'), meta, $('charInfo'), heroView);
    renderHeroCounts();
  } else if (id === 'help') {
    showRevealed($('help'), meta.reveal); // lot L2 : l'aide ne montre que les systèmes dévoilés
  } else if (id === 'notes') {
    showTop(id);
    void openNotes();
    return;
  } else if (id === 'daily') {
    renderDailyScreen();
    showTop(id);
    // au clavier : Entrée lance le défi, Échap ferme ; sans défilement : le titre et la flèche retour restent en vue
    $('dailyPlayBtn').focus({ preventScroll: true });
    return;
  } else {
    applySettings();
    $('settingsMsg').textContent = '';
  }
  showTop(id);
}
/** Passe d'ergonomie (décision 12) : un écran ouvert commence toujours en haut (titre et flèche retour visibles). */
function showTop(id: AppMode): void {
  showOnly(id);
  $(id).scrollTop = 0; // après l'affichage : un écran masqué ne défile pas
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
// ---------- lot L1 : demande d'accord pour la mesure anonyme de fréquentation ----------
// Une seule fois, au retour au menu après la première partie terminée (ou au prochain retour au menu d'un joueur qui a
// déjà joué), jamais redemandée après une réponse ; ensuite, l'interrupteur des Réglages. Pas dans les tests sauf
// demande (?consent=1), comme l'aide du premier lancement.
function askConsent(): void {
  if (retention.consent !== null || meta.runs < 1 || app !== 'menu') return;
  if (debugEnabled() && !location.search.includes('consent=1')) return;
  app = 'consent';
  showOnly('consent');
  $('consentYesBtn').focus({ preventScroll: true });
}
function answerConsent(yes: boolean): void {
  if (app !== 'consent') return;
  if (yes) retention.accept(meta.runs);
  else retention.refuse();
  app = 'menu';
  showOnly('menu');
  showUpdateBanner();
  $('playBtn').focus({ preventScroll: true });
}
/** Feuille du défi du jour (1.48.1) : les temps du jour et le délai avant le prochain ; les règles sont statiques. */
function renderDailyScreen(): void {
  // interface Nocturne : la date du jour en libellé, le délai en grands chiffres, les trois meilleurs temps du jour
  $('dailyDate').textContent = new Date().toLocaleDateString(getLang(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  // défi v2 : la règle du jour, la même pour tous (textContent)
  const today0 = todayKey(),
    rule = dailyRule(today0);
  $('dailyRuleName').textContent = ruleName(rule);
  $('dailyRuleText').textContent = ruleText(rule, today0);
  // lot L3 : parties du jour classées au temps tenu, puis aux vaincus (les trois meilleures en grands chiffres) ;
  // défi v2 : la médaille de chacune (pastille, et son nom pour les lecteurs d'écran)
  const runs = dailyRuns(meta);
  const el = $('dailyTimes');
  el.classList.toggle('none', runs.length === 0);
  el.setAttribute(
    'aria-label',
    runs.length
      ? t('daily.times', {
          list: runs
            .map((r, i) => {
              const p = { rank: ordinal(i + 1), time: fmtTime(r.t), kills: String(r.k) };
              return r.medal > 0 ? t('daily.runMedal', { ...p, medal: medalName(r.medal) }) : t('daily.run', p);
            })
            .join(' · '),
        })
      : t('daily.noTime'),
  );
  // seul HTML écrit ici : des nombres, des chaînes traduites passées par esc() et des pastilles sans texte
  el.innerHTML = runs.length
    ? runs
        .slice(0, 3)
        .map(
          (r) =>
            `<span>${r.medal > 0 ? `<i class="medal" data-m="${r.medal | 0}"></i>` : ''}<b>${fmtTime(r.t)}</b><small>${esc(t('daily.kills', { n: r.k }))}</small></span>`,
        )
        .join('')
    : esc(t('daily.noTime'));
  // lot L3 : série, joker de la semaine, ce que le défi d'aujourd'hui rapporte (sans rien écrire)
  const today = todayKey();
  const live = streakNow(meta, today);
  const p = streakPreview(meta, today);
  $('dailySeries').textContent =
    live > 0 ? t('daily.streakNow', { n: live, best: Math.max(meta.streak.best, live) }) : t('daily.streakNone');
  $('dailyJoker').textContent = t(p.joker ? 'daily.joker.free' : 'daily.joker.used');
  $('dailyReward').textContent = p.done
    ? t('daily.reward.done')
    : `${t('daily.reward.next', { gold: t('gold', { n: p.gold }) })} · ${
        p.outfitIn === 0 ? t('daily.reward.outfitToday') : t('daily.reward.outfit', { n: p.outfitIn })
      }`;
  $('dailyNext').textContent = dailyLeft();
}
// phase 40 : Bibliothèque (onglet et entrée choisie gardés d'une ouverture à l'autre)
let libTab: LibTab = 'w';
let libSel = '';
function renderLibraryScreen(): void {
  $('libGold').innerHTML = goldHtml(meta.gold);
  libSel = renderLibrary($('libTabs'), $('libList'), $('libCount'), meta, libTab, libSel);
}
// Succès : onglet gardé d'une ouverture à l'autre
let achTab: AchTab = 'all';
function renderAchScreen(): void {
  renderAchievements($('achTabs'), $('achList'), $('achCount'), meta, achTab);
}
function renderShopScreen(): void {
  // phase 17 : plus de boutique par personnage ; la feuille ne garde que les emplacements (communs à tous)
  $('shopGold').innerHTML = goldHtml(meta.gold);
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
  else if (app === 'achievements') renderAchScreen();
  else if (app === 'library') renderLibraryScreen();
  else if (app === 'daily') renderDailyScreen();
  else if (app === 'challenge') renderChallenge();
  else if (app === 'victory')
    renderVictory(); // défi v2
  else if (app === 'pause') renderPauseRule();
  else if (app === 'notes') renderNotesScreen();
  else if (app === 'tutoEnd') renderTutoEnd();
  else if (app === 'info') renderInfo();
  tuto.refresh(); // partie guidée : la consigne dans la nouvelle langue
  if (world) hud.setBeat(beatText()); // lot L4
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
/** Élément qui a ouvert l'écran intérieur courant : le focus y revient à la fermeture. */
let opener: HTMLElement | null = null;
/**
 * Partie guidée (1.65.1) : l'aide du tout premier lancement est obligatoire. Ni flèche retour, ni Échap, ni « Rejouer la
 * partie guidée » : « Jouer » est la seule sortie, et il lance la partie guidée.
 */
let helpFirst = false;
function setHelpFirst(on: boolean): void {
  helpFirst = on;
  $('helpBackBtn').hidden = on;
  $('helpTutoBtn').hidden = on;
  document.body.classList.toggle('help-first', on); // la barre d'onglets du bas est masquée (index.html)
}
function closeScreen(): void {
  app = backTo;
  showOnly(backTo);
  if (backTo === 'menu') updateBestLine();
  if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus({ preventScroll: true });
  opener = null;
}
// Échap ferme tout écran intérieur (interface Nocturne) ; le défi du jour, les nouveautés, la bibliothèque et la
// demande d'accord ont déjà leur propre gestion
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || e.repeat) return;
  if (
    app === 'characters' ||
    app === 'shop' ||
    app === 'achievements' ||
    app === 'board' ||
    app === 'account' ||
    app === 'settings' ||
    (app === 'help' && !helpFirst) // l'aide du premier lancement ne se ferme que par « Jouer »
  ) {
    const el = e.target as HTMLElement | null;
    if (el && el.closest('#keygrid')) return; // une touche en cours de choix : Échap annule le choix (keys.ts)
    e.preventDefault();
    closeScreen();
  }
});

// ---------- carte : phase 27, une nouvelle carte à chaque partie ----------
// Le menu montre la carte MAP.seed (décor construit au chargement). Chaque partie tire sa graine de carte : l'horloge
// en jeu normal, la date pour le défi du jour (même carte pour tous), MAP.seed quand un test impose sa variante.
const DECOR_SEED = MAP.seed;
let decorSeed = DECOR_SEED; // graine du décor actuellement construit dans la scène
function mapSeedFor(variant: number | undefined, daily: boolean, day: string): number {
  if (daily) return dailyMapSeed(day); // lot L4 : le jour du défi (celui d'un ami peut être passé)
  if (variant !== undefined) return debugMapSeed ?? DECOR_SEED;
  return (Date.now() % 1_000_000_007) + 1;
}
/** Graine imposée par le débogage (tests e2e) aux parties lancées avec une variante. */
let debugMapSeed: number | null = null;

let startWanted: {
  variant?: number;
  daily: boolean;
  resume: SavedRun | null;
  challenge: Challenge | null;
  tutorial: boolean;
} | null = null;
/** Attente des modèles des ennemis au premier départ de la session (une seule fois). */
let modelsWaited = false;
function startGame(
  variant?: number,
  daily = false,
  resume: SavedRun | null = null,
  challenge: Challenge | null = null,
  tutorial = false,
): void {
  if (challenge) daily = true; // lot L4 : le défi d'un ami se joue avec les règles du défi du jour
  if (daily) tutorial = false;
  timestopOn = false; // phase 35
  qualityNewRun(autoQ); // 1.69.2 : le palier reste (même appareil) ; blocage anti yo-yo et bannière repartent de zéro
  bossTotemNote = -1; // phase 51 : le nombre de totems de boss se réannonce à chaque partie
  document.body.classList.remove('timestop');
  if (!meta.seenReset) {
    meta.seenReset = true; // la bannière « nouvelle progression » a été vue
    saveMeta(meta);
  }
  if (!scene || !sceneReady) {
    // le joueur a été plus rapide que le module de rendu : on démarre dès qu'il est prêt
    if (!startWanted) startWanted = { variant, daily, resume, challenge, tutorial }; // la première intention (ex. défi du jour) l'emporte
    playLoading = true;
    setPlayState();
    loadScene(true).then(
      () => {
        const w = startWanted;
        startWanted = null;
        playLoading = false;
        setPlayState();
        if (w) startGame(w.variant, w.daily, w.resume, w.challenge, w.tutorial);
      },
      () => {
        // module introuvable (réseau coupé au tout premier lancement) : on laisse réessayer
        scenePromise = null;
        startWanted = null;
        playLoading = false;
        setPlayState();
        $('playLbl').textContent = t('menu.retry');
      },
    );
    return;
  }
  if (scene.enemiesPending && !modelsWaited) {
    // modèles 3D des ennemis encore en route (premier lancement, ou après une mise à jour) : on les attend un peu
    // plutôt que de lancer la partie avec les silhouettes de repli (8 s au plus, puis on joue quand même)
    modelsWaited = true;
    playLoading = true;
    setPlayState();
    Promise.race([scene.enemiesReady, new Promise<void>((r) => setTimeout(r, 8000))]).then(() => {
      playLoading = false;
      setPlayState();
      startGame(variant, daily, resume, challenge, tutorial);
    });
    return;
  }
  const S = scene;
  // phase 49 : reprise d'une partie gardée (le monde vient de l'instantané), ou partie neuve
  $('runLostNote').hidden = true;
  let restored: World | null = null;
  if (resume) {
    try {
      restored = restoreWorld(resume.snap);
    } catch {
      forgetRun(); // sauvegarde illisible : le menu repart sans elle
      $('runLostNote').hidden = false;
      updateBestLine();
      return;
    }
    daily = resume.daily;
    if (daily) adoptDaily(restored); // relecture du lot L3 : un défi gardé avant la mise à jour devient le défi court
    adoptCleared(restored); // 1.68.0 : une victoire gardée par la 1.67 reste la victoire du monde 3
    runChar = resume.character;
    runOutfit = resume.outfit;
    runDay = resume.day ?? todayKey();
    runRanked = resume.ranked !== false; // sauvegarde d'avant le lot L4 : un défi du jour qui compte
    runBeat = readBeat(resume.beat);
    tutorial = restored.tutorial;
  } else {
    countAbandon(); // lot L2 : la partie remplacée compte pour le dévoilement après une minute de jeu
    forgetRun(); // une nouvelle partie remplace celle qui attendait (abandon confirmé au menu)
    runChar = daily || tutorial ? 'eclaireuse' : meta.character; // partie guidée : l'Éclaireuse (décision 1)
    runOutfit = daily || tutorial ? 0 : outfitOf(meta, meta.character);
    runDay = challenge ? challenge.date : todayKey();
    runRanked = !challenge || challenge.date === todayKey(); // décision 4 : seul le défi d'aujourd'hui compte
    runBeat = challenge ? { t: challenge.t, k: challenge.k } : null;
  }
  clearTimeout(heroModelT); // relecture perf : une pose différée du carrousel ne doit pas changer le héros en pleine partie
  S.setCharacter(runChar as CharacterKey, runOutfit);
  audio.init();
  audio.setMusic('game'); // phase 36 : musique de partie et ambiance de nuit
  dailyRun = daily;
  tutorialRun = tutorial;
  runStats.dards = resume?.runStats.dards ?? 0;
  runStats.elites = resume?.runStats.elites ?? 0;
  runStats.bosses = resume?.runStats.bosses ?? 0;
  runStats.won = false;
  runEdits = 0;
  runSavedKey = '';
  if (restored) world = restored;
  else {
    // la méta entre dans la sim par des options (personnage, boutique, armes débloquées) ; défi du jour : égalité
    // défi v2 : la règle du jour de la partie (un défi d'ami joue celle de son jour)
    // partie guidée : sa carte (TUTORIAL.map, choisie pour que chaque lieu montré soit près du départ)
    world = tutorial
      ? new World(TUTORIAL.map, tutorialOptions())
      : new World(
          mapSeedFor(variant, daily, runDay),
          worldOptions(meta, unlockedWeapons(meta), daily, daily ? runDay : ''),
        );
  }
  if (world.seed !== decorSeed) {
    S.buildDecor(world); // phase 27 : nouvelle carte, nouveau décor (relief, lieux, coffres)
    decorSeed = world.seed;
  }
  S.setStage(world.stage); // phase 37 : ambiance du monde
  mapView.prepare(world); // fond de la minicarte construit ici, pas dans la première image de jeu
  if (!restored) {
    // on décale le rng selon l'horloge pour que deux runs diffèrent (le décor, lui, utilise seed ^ constante)
    // `variant` (debug/tests) remplace l'horloge ; le défi du jour utilise la seed de la date : même run pour tous
    const skips = (daily ? dailySeed(runDay) : (variant ?? Date.now() % 1000)) | 0;
    for (let i = 0; i < skips; i++) world.rng.next();
    startRun(world);
  }
  app = 'play';
  showOnly(null);
  $('hud').hidden = false;
  $('gear').hidden = false;
  $('keys').hidden = input.isTouch;
  $('touch').hidden = !input.isTouch;
  hud.reset();
  hud.kit(world);
  hud.setBeat(beatText()); // lot L4 : score à battre du défi d'un ami
  // partie guidée : le guide de la partie (repris avec elle), sinon les seules consignes de première apparition
  guide = (resume ? readGuide(resume.guide) : null) ?? newGuide(world, tutorial, meta.hints);
  tuto.start(guide, world);
  $('skipTuto').hidden = !tutorial;
  // lot L2 : une étape dévoilée s'annonce au début de la partie qui l'apporte (pas à la reprise, pas au défi du jour)
  const news = restored || tutorial ? null : revealNews(meta, daily);
  mapView.setNew(news === null || news === 'slide' ? null : news, t('reveal.tag'));
  if (news) {
    saveMeta(meta);
    hud.banner(t('reveal.new'), 'reward', t(`reveal.${news}`), REVEAL_BANNER_MS);
    audio.levelUp();
  } else if (!restored && world.dailyRule >= 0)
    // défi v2 : la règle du jour s'annonce au départ (la pause la rappelle)
    hud.banner(
      t('rule.banner', { name: ruleName(world.dailyRule) }),
      'info',
      ruleText(world.dailyRule, runDay),
      REVEAL_BANNER_MS,
    );
  S.dmg.clear();
  S.snapCamera(world);
  S.resetHero();
  hurtT = 0;
  hitStop.reset();
  applyFx();
  $('update').hidden = true; // jamais de bannière de mise à jour en jeu
  last = performance.now();
  if (restored) {
    runSavedKey = runKey(world); // la sauvegarde lue est déjà à jour : pas de réécriture à la reprise
    // phase 49 : on rouvre ce que le joueur avait devant lui ; une partie en cours reprend en pause
    if (world.mode === Mode.LevelUp) openLevelUp();
    else if (world.mode === Mode.Merchant) openMerchant();
    else if (world.mode === Mode.Won) openVictory();
    else pauseGame();
  }
}

// ---------- phase 49 : partie gardée sur l'appareil ----------
/** Écrans où une partie est en cours (la mort et l'écran de fin n'en font plus partie). */
function runOngoing(): boolean {
  return (
    world !== null &&
    world.mode !== Mode.Dead &&
    (app === 'play' ||
      app === 'pause' ||
      app === 'levelup' ||
      app === 'merchant' ||
      app === 'map' ||
      app === 'victory' ||
      app === 'info')
  );
}
/**
 * Écrit la partie en cours sur l'appareil : en quittant (onglet caché, fermeture), en pause, aux choix de cartes et chez le
 * marchand. Jamais pendant l'action : un instantané à 400 ennemis coûte ≈ 3-4 ms et 212 Ko (npm run bench), une image
 * perdue sur téléphone ; les montées de niveau (une toutes les 15 s environ) le rafraîchissent déjà souvent.
 */
/** Ce qui change quand la partie avance : temps de jeu, mode, choix faits. */
function runKey(w: World): string {
  return `${w.t}|${w.mode}|${runEdits}`;
}
function saveRun(): void {
  if (!world || !runOngoing()) return;
  const w = world;
  const key = runKey(w);
  if (key === runSavedKey) return; // quitter l'app enchaîne pause, onglet caché et pagehide : une seule écriture
  runSavedKey = key;
  try {
    savedRun = {
      v: 1,
      version: VERSION,
      at: Date.now(),
      snap: snapshotWorld(w),
      character: runChar,
      outfit: runOutfit,
      daily: dailyRun,
      day: runDay,
      ranked: runRanked,
      beat: runBeat ?? undefined,
      runStats: { dards: runStats.dards, elites: runStats.elites, bosses: runStats.bosses },
      summary: { stage: w.stage + 1, stageT: w.stageT, t: w.t, endless: w.endless, kills: w.kills },
      guide: guide ?? undefined, // partie guidée : l'étape du guide reprend avec la partie (décision 10)
    };
    writeRun(savedRun);
  } catch {
    /* jamais bloquant : la partie continue, au pire sans sauvegarde */
  }
}
/** Lot L2 : la partie gardée, abandonnée pour une nouvelle, compte comme finie après REVEAL.abandonAfter s de jeu. */
function countAbandon(): void {
  if (!savedRun) return;
  const before = meta.reveal,
    softBefore = meta.softLeft;
  const run = { daily: savedRun.daily, t: savedRun.summary.t, abandoned: true };
  if (savedRun.snap.fields.tutorial === true) return; // la partie guidée abandonnée ne compte pas
  revealAfterRun(meta, run);
  softAfterRun(meta, run); // partie guidée : une des parties adoucies qui la suivent
  // 1.68.0 : une partie qui avait vaincu le monde 3 (Arène, feuille de victoire, monde infini) garde sa victoire
  // (statistiques, défi du personnage, succès, classement) : un joueur ne perd jamais sa progression
  let won: ReturnType<typeof creditAbandoned> = null;
  if (!savedRun.daily && savedRun.snap.fields.cleared === true) {
    try {
      const w = restoreWorld(savedRun.snap);
      won = creditAbandoned(meta, w, savedRun.character as CharacterKey);
      if (won) {
        checkAchievements(meta);
        queueScore({
          stage: 4,
          time: Math.floor(w.t),
          kills: w.kills,
          char: savedRun.character as CharacterKey,
        });
      }
    } catch {
      /* instantané illisible : rien à créditer, la partie est oubliée comme avant */
    }
  }
  if (won || meta.reveal !== before || meta.softLeft !== softBefore) saveMeta(meta);
}
function forgetRun(): void {
  savedRun = null;
  abandonFor = null;
  clearRun(); // localStorage et IndexedDB : une sauvegarde trop grosse pour le premier vit dans le second
}
/** Libellé du bouton de partie : « Jouer », ou « Nouvelle partie » quand une partie attend (maquette Menu-Reprendre). */
function playLabel(): string {
  return t(savedRun ? 'menu.newRun' : 'menu.play');
}
/** Le module de rendu ou les modèles se chargent après un « Jouer » : le bouton attend. */
let playLoading = false;
/** « Jouer » : indisponible pendant un chargement et sur un héros verrouillé (décision 8). */
function setPlayState(): void {
  const b = $<HTMLButtonElement>('playBtn');
  b.disabled = heroLocked || playLoading;
  b.setAttribute('aria-disabled', String(b.disabled));
  $('playLbl').textContent = playLoading ? t('menu.loading') : playLabel();
}
/** Bouton « Reprendre » du menu (fond crépuscule, bouton plein) et confirmation d'abandon. */
function updateResumeBtn(): void {
  const r = savedRun;
  $('resumeRunBtn').hidden = !r;
  $('menu').classList.toggle('resume', !!r);
  // un seul bouton plein par écran (kit) : « Reprendre » l'est, « Nouvelle partie » devient un lien filet
  $('playBtn').classList.toggle('btn-full', !r);
  $('playBtn').classList.toggle('btn-link', !!r);
  setPlayState();
  if (r) {
    const time = fmtTime(r.summary.endless ? r.summary.t : r.summary.stageT);
    $('resumeRunInfo').textContent = r.summary.endless
      ? t('menu.resumeInfoEndless', { time })
      : r.summary.stage === ARENA + 1 // le boss final : « Arène · 1:20 »
        ? t('menu.resumeInfoArena', { time })
        : t('menu.resumeInfo', { stage: r.summary.stage, time });
    $('resumeRunBtn').setAttribute('aria-label', t('menu.resumeAria', { info: $('resumeRunInfo').textContent ?? '' }));
  }
  $('abandonRow').hidden = abandonFor === null;
}
/** « Jouer » ou défi du jour : si une partie attend, on demande d'abord s'il faut l'abandonner. */
function playNew(daily: boolean, challenge: Challenge | null = null, tutorial = wantsTutorial(daily, challenge)): void {
  if (savedRun) {
    abandonFor = { daily, challenge, tutorial };
    updateResumeBtn();
    $('abandonNoBtn').focus({ preventScroll: true });
    return;
  }
  startGame(undefined, daily, null, challenge, tutorial);
}
/**
 * Partie guidée (décision 1) : « Jouer » la lance pour un nouveau joueur. Pas dans les tests sauf demande (`?tuto=1`),
 * comme l'aide du premier lancement : les specs lancent leurs parties sur un profil vierge.
 */
function wantsTutorial(daily: boolean, challenge: Challenge | null): boolean {
  if (daily || challenge || !tutorialDue(meta)) return false;
  return !debugEnabled() || location.search.includes('tuto=1');
}
/** Lot L4 : score à battre lu dans une partie gardée (jamais cru tel quel). */
function readBeat(raw: unknown): { t: number; k: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ok = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
  return ok(o.t, BOARD.dayTimeMax) && ok(o.k, BOARD.dayKillsMax) ? { t: o.t as number, k: o.k as number } : null;
}
/** Lot L4 : « À battre : 5:00 · 412 » sous le chrono ('' hors du défi d'un ami). */
function beatText(): string {
  return runBeat ? t('challenge.toBeat', { time: fmtTime(runBeat.t), kills: String(runBeat.k) }) : '';
}
/**
 * Phase 37 : arrivée dans un nouveau monde (la sim a déjà construit la carte). Fondu au noir, décor et minicarte
 * reconstruits pendant le fondu, ambiance du monde, bannière avec son nom.
 */
const stageFade = $('stageFade');
/** `quiet` : la carte change sans bannière de monde (1.68.0 : le monde infini quitte l'Arène, sa bannière suit). */
function onStageStart(n: number, quiet = false): void {
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
  if (quiet) return;
  // 1.68.0 : l'Arène du boss final n'est pas un « monde n »
  if (n === ARENA + 1) hud.banner(t('banner.arena'), 'danger', t('banner.arenaSub'));
  else hud.banner(t('banner.stage', { n, name: t('stage.name.' + n) }), 'info');
  audio.whoosh();
  audio.levelUp();
}
/** 1.68.0 : vignette sombre de l'éclipse (body.eclipse ; « réduction des effets » : plus légère, index.html). */
let eclipseOn = false;
function setEclipse(on: boolean): void {
  eclipseOn = on;
  document.body.classList.toggle('eclipse', on);
}
function toMenu(): void {
  setEclipse(false);
  app = 'menu';
  world = null;
  guide = null;
  tuto.stop();
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
  askConsent();
  showUpdateBanner();
}
function pauseGame(): void {
  if (app !== 'play') return;
  app = 'pause';
  if (world) $('pauseStats').innerHTML = statsHTML(world); // phase 47 : fiche de stats, à jour à chaque pause
  renderPauseRule();
  $('skipTuto').hidden = !tutorialRun;
  showOnly('pause');
  saveRun(); // phase 49
}
/** Défi v2 : la règle du jour rappelée dans la pause (cachée hors du défi, ou pour un défi gardé avant les règles). */
function renderPauseRule(): void {
  const rule = world?.dailyRule ?? -1;
  $('pauseRule').hidden = rule < 0;
  $('pauseRuleName').textContent = ruleName(rule);
  $('pauseRuleText').textContent = ruleText(rule, runDay);
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
  if (!again) saveRun(); // phase 49 : les cartes proposées sont gardées telles quelles
  // phase 17 : un coffre propose des objets passifs (même écran, autre titre)
  const chest = world.cards[0]?.kind === 'i';
  const shrine = world.cards[0]?.kind === 'b'; // phase 18 : bonus de sanctuaire
  $('luTitle').textContent = chest
    ? t('chest.title')
    : shrine
      ? t('shrine.title')
      : t('levelup.title', { n: world.player.level - world.pending + 1 });
  // partie guidée (décision 13) : un tome imposé, seule carte qu'on peut prendre ; les autres restent visibles, éteintes
  const lock = tutorialLock(world);
  $('luHint').textContent = chest
    ? t('chest.hint')
    : shrine
      ? t('shrine.hint')
      : lock >= 0
        ? t('tuto.cards.take', { name: cardTitle(world.cards[lock]) }) // le nom affiché sur la carte
        : t('levelup.hint');
  $('luHint').classList.toggle('imposed', lock >= 0);
  $('luSlots').hidden = chest || shrine; // les emplacements d'armes et de tomes ne disent rien d'un objet ni d'un bonus
  $('luSlots').textContent = t('levelup.slots', {
    w: Object.keys(world.weapons).length,
    wMax: world.maxWeapons,
    p: Object.keys(world.tomes).length,
    pMax: world.maxTomes,
  });
  renderCards($('cards'), world.cards, world);
  if (lock >= 0)
    for (let i = 0; i < world.cards.length; i++) {
      const el = $('cards').children[i] as HTMLElement;
      el.classList.toggle('imposed', i === lock);
      el.classList.toggle('off', i !== lock);
      if (i !== lock) {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('aria-describedby', 'luHint'); // un lecteur d'écran dit pourquoi elle est éteinte
      }
    }
  // partie guidée (décision 4) : la première feuille de niveau, en pause, explique armes, tomes et raretés
  $('luTuto').hidden = !(guide?.tutorial && !guide.cards && !chest && !shrine);
  // phase 31 : relance des cartes (pas pour un coffre ni un sanctuaire)
  const rr = $('luReroll') as HTMLButtonElement;
  rr.hidden = chest || shrine;
  rr.disabled = !canReroll(world);
  rr.textContent = world.rerolls > 0 ? t('levelup.reroll', { n: world.rerolls }) : t('levelup.reroll0');
  if (again) return;
  showOnly('levelup');
  audio.levelUp();
  hud.xpSweep();
  if (!input.isTouch)
    ($('cards').children[Math.max(0, lock)] as HTMLElement | undefined)?.focus({ preventScroll: true });
}
// ---------- marchand (phase 17) : échoppe en pause, achats avec l'or de la partie ----------
function openMerchant(): void {
  if (!world) return;
  const first = app !== 'merchant';
  app = 'merchant';
  renderMerchant();
  if (!first) return;
  saveRun(); // phase 49
  showOnly('merchant');
  audio.chest();
  if (!input.isTouch) ($('mcards').firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}
function renderMerchant(): void {
  if (!world) return;
  $('mGold').textContent = t('gold', { n: Math.floor(world.gold) });
  $('mNote').textContent = !canGainItem(world) ? t('merchant.full') : t('merchant.hint');
  renderCards($('mcards'), world.offers, world, { gold: world.gold, full: !canGainItem(world) });
  const cost = rerollCost(world);
  const rr = $('mReroll') as HTMLButtonElement;
  rr.textContent = t('merchant.reroll', { gold: t('gold', { n: cost }) });
  rr.disabled = world.gold < cost;
}
/** Achat (0–3), relance ou départ : un pas de sim dans l'échoppe, puis retour au jeu si l'on est parti. */
function merchantAct(code: number): void {
  if (!world || app !== 'merchant') return;
  runEdits++;
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
  runEdits++;
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
  const lock = tutorialLock(world);
  if (lock >= 0 && i !== lock) return; // partie guidée : rien ne se passe, la simulation refuserait aussi (décision 13)
  runEdits++;
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
    if (guide && !$('luTuto').hidden) guideCardsDone(guide); // la feuille expliquée a été choisie
    inp.pick = i;
    step(world, inp, STEP); // applique la carte ; peut re-rouler si plusieurs niveaux en attente
    inp.pick = -1;
    handleEvents(world, performance.now() / 1000); // objet de coffre, synergie : bannière, son, particules
    tuto.step(world, 0);
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
  heart: boolean; // 1.68.0 : le Cœur de la Nuit vaincu (victoire totale)
  arena: boolean; // 1.68.0 : mort dans l'Arène, contre lui
  rec: boolean;
  gold: number;
  dailyRank: number;
  miss: ReturnType<typeof missingTime>;
  fresh: Achievement[];
  dailyOk: boolean; // lot L3 : défi du jour tenu jusqu'au bout
  medal: number; // défi v2 : médaille du défi (0 : aucune, ou pas un défi)
  streak: StreakGain | null; // lot L3 : jour compté dans la série (défi du jour terminé)
  missions: Mission[]; // lot L3 : missions remplies par cette partie
  card: CardRun | null; // lot L4 : carte de résultat (défi du jour, aussi celui d'un ami)
  gap: { t: number; k: number } | null | undefined; // lot L4 : défi d'un ami (null : battu) ; undefined : pas de défi
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
    : o.heart // 1.68.0 : le boss final vaincu, ou la phase où il a gagné
      ? t('over.heartDown')
      : o.arena
        ? t('over.heartPhase', { n: Math.min(4, Math.max(1, world.finalPhase)) })
        : o.won
          ? t('over.stages')
          : t('over.stage', { n: world.stage + 1 }); // phase 37
  $('oLvl').textContent = String(world.player.level);
  $('oGear').innerHTML = gearHtml(world); // phase 38 : l'équipement de la partie
  $('oKills').textContent = String(world.kills);
  // phase 48 : difficulté atteinte, si la partie l'a montée
  // … et totems de boss activés (livraison 2)
  const oDiff: string[] = [];
  if (world.player.difficulty > 0)
    // lot L2 : avant le dévoilement des crânes, « crânes activés : 0 » parlerait d'un système encore caché
    oDiff.push(
      world.reveal >= REVEAL.totem
        ? t('over.difficulty', { n: Math.round(world.player.difficulty * 100), skulls: world.skullsOn })
        : t('over.difficultyOnly', { n: Math.round(world.player.difficulty * 100) }),
    );
  if (world.bossTotemsOn > 0) oDiff.push(t('over.bossTotems', { n: world.bossTotemsOn }));
  $('oDiff').hidden = oDiff.length === 0;
  $('oDiff').textContent = oDiff.join(' · ');
  $('oBest').textContent = fmtTime(meta.bestTime);
  $('oGold').textContent = String(o.gold);
  // défi v2 : un défi réussi le reste après la suite en monde infini (sa médaille sous le titre)
  $('oTitle').textContent = t(
    o.dailyOk
      ? 'over.dailyDone'
      : world.endless
        ? 'over.endlessEnd'
        : o.arena
          ? 'over.heartDead' // 1.68.0 : « Vaincu par le Cœur de la Nuit »
          : o.won
            ? 'over.win'
            : 'over.dead',
  );
  $('oTitle').classList.toggle('win', o.won || o.dailyOk);
  $('oMedal').hidden = o.medal === 0;
  $('oMedal').dataset.m = String(o.medal);
  $('oMedalName').textContent = medalName(o.medal);
  // lot L3 : série du jour, tenue offerte, missions remplies (et leur or)
  const rewards: string[] = [];
  if (o.streak) rewards.push(t('over.streak', { n: o.streak.count, gold: t('gold', { n: o.streak.gold }) }));
  if (o.streak?.outfit) rewards.push(t('over.outfitGift', { character: characterName(o.streak.outfit) }));
  for (const ms of o.missions)
    rewards.push(t('over.mission', { text: missionText(ms), gold: t('gold', { n: missionGold(ms) }) }));
  $('oRewards').hidden = rewards.length === 0;
  $('oRewards').innerHTML = rewards.map((r) => `<p>${esc(r)}</p>`).join('');
  // lot L4 : défi d'un ami battu, ou raté de combien (temps, ou kills à temps égal) ; bouton « Partager » du défi
  $('oBeat').hidden = o.gap === undefined;
  $('oBeat').textContent =
    o.gap === undefined
      ? ''
      : o.gap === null
        ? t('challenge.beaten')
        : t('challenge.missed', {
            gap: o.gap.t > 0 ? fmtTime(o.gap.t) : t('challenge.gapKills', { n: o.gap.k }),
          });
  $('shareBox').hidden = !o.card;
  // seul HTML autorisé : le <span class="newrec"> écrit ici ; tout texte traduit passe par esc()
  const ns = nextSlot(meta);
  $('oNext').hidden = ns < 0;
  if (ns >= 0) $('oNext').textContent = t('over.nextSlot', { name: slotName(ns), cond: slotCondition(ns) });
  $('oMsg').innerHTML = o.won
    ? `<span class="newrec">${esc(t(o.heart ? 'over.dawn' : 'over.reaperDown'))}</span>`
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
function gameOver(): void {
  timestopOn = false; // phase 35
  document.body.classList.remove('timestop');
  setEclipse(false);
  if (!world || !scene) return;
  if (tutorialRun) {
    tutorialOver();
    return;
  }
  const S = scene;
  app = 'over';
  // 1.68.0 (docs/specs/boss-final.md) : la victoire est le monde 3 vaincu, acquise même si le héros meurt ensuite (dans
  // l'Arène ou en monde infini) ; le Cœur de la Nuit vaincu compte à part ; rien de cela au défi du jour
  const outcome = runOutcome(world),
    won = outcome.won;
  forgetRun(); // phase 49 : une partie finie n'est plus à reprendre
  // défi v2 (décision 10, récompenses inchangées) : la suite d'un défi du jour en monde infini ne compte pas pour le
  // record de survie ni pour les succès de survie (survie10 débloque le Bûcheron, survie15 et survie20 des objets) ;
  // elle se joue sur une difficulté propre au défi. Le défi garde ses 5 minutes, comme avant la suite
  const heldT = dailyRun ? Math.min(world.t, DAILY.duration) : world.t;
  const rec = heldT > meta.bestTime;
  meta.runs++;
  revealAfterRun(meta, { daily: dailyRun, t: world.t, abandoned: false }); // lot L2 : une étape de plus (pas au défi du jour)
  softAfterRun(meta, { daily: dailyRun, t: world.t, abandoned: false }); // partie guidée : parties adoucies qui la suivent
  meta.totalKills += world.kills;
  if (rec) meta.bestTime = heldT;
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
  creditOutcome(st, outcome); // victoires, Cœur de la Nuit vaincu (succès « Aube »), meilleur monde
  st.bestTime = Math.max(st.bestTime, heldT);
  st.runs++;
  // défis (phase 6) : meilleurs scores en un run
  st.noHitBest = Math.max(st.noHitBest, world.noHitBest);
  st.distanceBest = Math.max(st.distanceBest, world.distance);
  st.weaponLvBest = Math.max(st.weaponLvBest, world.weaponLvBest);
  st.slideDist += world.slideDist; // phase 28
  st.tricksBest = Math.max(st.tricksBest, world.tricks);
  st.mapChests += world.mapChestsOpened;
  st.bestStage = Math.max(st.bestStage, won ? 4 : world.stage + 1); // phase 37
  // phase 39 ; défi v2 (décision 10, récompenses inchangées) : la suite d'un défi du jour ne compte pas pour le monde
  // infini d'après la victoire (succès « infini1 »)
  if (world.endless && !dailyRun) st.endlessBest = Math.max(st.endlessBest, Math.floor(world.endlessT));
  recordCodex(meta, world); // phase 40 : parties avec chaque arme, objet, tome, synergie (Bibliothèque)
  const played = runChar as CharacterKey; // défi du jour : toujours l'Éclaireuse ; phase 49 : celui de la partie, même reprise
  addCharRun(meta.chars, played, runCharStats(played, world, won)); // phase 41 : défis par personnage
  const fresh = checkAchievements(meta);
  let dailyRank = 0;
  let streak: StreakGain | null = null;
  // lot L3 : vivant à la fin du chrono du défi ; défi v2 : la partie peut finir plus tard (mort en monde infini), la
  // médaille dit si le défi a été tenu
  const medal = dailyRun ? world.medal : 0;
  const dailyOk = medal > 0;
  if (dailyRun && runRanked) {
    // phase 49 : le jour de la partie, même reprise le lendemain ; lot L3 : temps tenu puis vaincus, et la série ;
    // lot L4 : pas le défi d'un ami d'un jour passé (il compte pour l'or et les missions, comme une partie) ;
    // défi v2 : le temps total tenu (5:00 et la suite) et la médaille
    dailyRank = recordDaily(meta, Math.floor(world.t), world.kills, runDay, medal);
    streak = recordStreak(meta, runDay);
  }
  // lot L3 : missions du jour, dans toutes les parties (or crédité une fois, à la fin de la partie qui les remplit)
  const weapons: string[] = [];
  for (const k in world.weapons) if ((world.weapons[k as keyof typeof world.weapons] ?? 0) > 0) weapons.push(k);
  const missions = missionsAfterRun(
    meta,
    {
      char: played,
      weapons,
      kills: world.kills,
      elites: world.eliteKills,
      t: world.t,
      chests: world.mapChestsOpened,
      weaponLv: world.weaponLvBest,
    },
    todayKey(),
  );
  saveMeta(meta);
  const card: CardRun | null = dailyRun
    ? // la série d'aujourd'hui ne figure pas sur la carte d'un défi d'un jour passé
      {
        date: runDay,
        t: Math.floor(world.t),
        k: world.kills,
        ok: dailyOk,
        medal,
        streak: runRanked ? streakNow(meta, todayKey()) : 0,
      }
    : null;
  const gap = runBeat ? challengeGap({ t: world.t, k: world.kills }, runBeat) : undefined;
  lastOver = {
    won,
    heart: outcome.heart,
    arena: outcome.arena,
    rec,
    gold,
    dailyRank,
    miss: missingTime(meta, heldT),
    fresh,
    dailyOk,
    medal,
    streak,
    missions,
    card,
    gap,
  };
  $('shareMsg').textContent = '';
  $('shareText').hidden = true;
  // phase 38 : classement en ligne (joueurs connectés) ; personnage de la partie (défi du jour : l'Éclaireuse) ;
  // lot L4 : un défi du jour qui compte est aussi publié pour le classement du jour entre amis
  queueScore({
    stage: won ? 4 : world.stage + 1,
    time: Math.floor(world.t),
    kills: world.kills,
    char: runChar,
    ...(dailyRun && runRanked ? { day: runDay } : {}),
  });
  renderOverScreen();
  // la fête seulement pour une partie gagnée qu'on termine (feuille de victoire, défi réussi) ; 1.68.0 : une mort,
  // même après la victoire du monde 3 (dans l'Arène, en monde infini), est une défaite pour l'oreille et pour l'œil
  const celebrate = world.mode === Mode.Won;
  S.particles.burst(world.player.x, 1, world.player.z, celebrate ? PAL.gold : PAL.accent, 30, 8, 8);
  if (!reducedFx()) S.shake = 0.5;
  if (celebrate) audio.victory();
  else audio.death();
  // lot L3 : bannière « Défi réussi ! » (et la tenue offerte au 7e jour de série) avant l'écran de fin
  const gift = streak?.outfit ? t('over.outfitGift', { character: characterName(streak.outfit) }) : '';
  if (dailyOk && !world.endless) hud.banner(t('over.dailyDone'), 'reward', gift);
  else if (gift) hud.banner(gift);
  setTimeout(() => {
    if (app !== 'over') return;
    showOnly('over');
    showUpdateBanner();
  }, 700);
}

// ---------- partie guidée (docs/specs/tutoriel.md) : fin, « À toi de jouer », la passer ----------
/** Ce que la feuille « À toi de jouer » affiche (re-rendue au changement de langue). */
let tutoOver = { gold: 0, bonus: 0, end: 'boss' as 'boss' | 'horde' | 'win' };
/** Ralenti de la mort voulue (décision 7) avant la feuille : le rendu continue à 0,2× derrière (frame). */
const TUTO_END_MS = 1600;
/**
 * Décision 7 : la mort de la partie guidée (contre le boss du totem, ou avant lui) ouvre sa feuille, pas l'écran de fin.
 * L'or de la partie est gardé, avec la prime de fin de guide ; ni série, ni record, ni succès, ni classement.
 */
function tutorialOver(): void {
  if (!world || !scene) return;
  app = 'tutoEnd';
  forgetRun();
  const gold = Math.round(world.gold);
  // révision 1.66.0 (décision 16) : le boss du totem abattu (portail ouvert, ou déjà au monde suivant), c'est une victoire
  const won = world.stage > 0 || world.endless || world.portal.open;
  const end = won ? 'win' : world.totem.state === 1 ? 'boss' : 'horde';
  tutoOver = { gold, bonus: tutorialEnd(meta, gold), end };
  meta.seenHelp = true; // l'aide du premier lancement n'a plus rien à apprendre
  saveMeta(meta);
  renderTutoEnd();
  scene.particles.burst(world.player.x, 1, world.player.z, PAL.accent, 30, 8, 8);
  if (!reducedFx()) scene.shake = 0.5;
  audio.death();
  setTimeout(
    () => {
      if (app !== 'tutoEnd') return;
      showOnly('tutoEnd');
      if (!input.isTouch) $('tePlayBtn').focus({ preventScroll: true }); // Entrée : Rejouer (règle 4)
    },
    reducedFx() ? 700 : TUTO_END_MS,
  );
}
/** 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 1) : le résultat en titre (doré pour la victoire), l'encouragement dessous. */
function renderTutoEnd(): void {
  const title = $('teTitle');
  title.textContent = t('tuto.end.' + tutoOver.end);
  title.className = 'h1 tetitle ' + (tutoOver.end === 'win' ? 'win' : 'dead');
  $('teText').textContent = t('tuto.end.' + tutoOver.end + 'Text');
  $('teGold').textContent = String(tutoOver.gold);
  $('teBonus').textContent = '+' + tutoOver.bonus;
}
$('tePlayBtn').onclick = () => {
  if (app !== 'tutoEnd') return;
  startGame(); // « Rejouer » : une partie normale, comme « Jouer » avant la 1.69.0
};
$('teMenuBtn').onclick = () => {
  if (app === 'tutoEnd') toMenu();
};
addEventListener('keydown', (e) => {
  if (app !== 'tutoEnd' || e.repeat || e.code !== 'Escape') return;
  e.preventDefault();
  toMenu();
});

// ---------- 1.69.0 (docs/specs/rafales-faux-guidage.md, décisions 2 à 5) : fenêtres de première fois ----------
/** Fenêtre ouverte (index dans HINTS : portail, temps écoulé, monde infini), -1 aucune. */
let infoHint = -1;
/** Ouvre la fenêtre `h`, jeu en pause ; retenue dans la méta (une fois par joueur, bits synchronisés comme les consignes). */
function openInfo(h: number): void {
  if (!world || h < 0 || app !== 'play') return;
  infoHint = h;
  app = 'info';
  renderInfo();
  showOnly('info');
  hud.hideBanner(); // la fenêtre dit déjà ce que la bannière annonçait (temps écoulé, portail)
  hintShown(h as Hint);
  audio.bossWarn(); // un signal court : le jeu s'arrête pour une raison
  if (!input.isTouch) $('infoOk').focus({ preventScroll: true }); // Entrée, Espace : « Compris » (règle 4)
}
function renderInfo(): void {
  const k = HINTS[infoHint];
  if (!k || !world) return;
  const title = $('infoTitle');
  title.textContent = t(`win.${k}.title`);
  title.className = 'h1 infotitle ' + (k === 'overtime' ? 'alert' : 'win');
  const P = ENDLESS.period;
  // le portail du monde 3 mène au boss final (1.68.0), pas à un monde
  const l2 = k === 'portal' && world.stage >= STAGE.count - 1 ? 'win.portal.l2final' : `win.${k}.l2`;
  $('infoL1').textContent = t(`win.${k}.l1`, { m: Math.floor(P / 60), s: String(P % 60).padStart(2, '0') });
  $('infoL2').textContent = t(l2);
  $('infoL3').textContent = has(`win.${k}.l3`) ? t(`win.${k}.l3`) : '';
}
function closeInfo(): void {
  if (app !== 'info') return;
  infoHint = -1;
  backToPlay();
}
$('infoOk').onclick = closeInfo;
addEventListener('keydown', (e) => {
  if (app !== 'info' || e.repeat) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'Escape') {
    e.preventDefault();
    closeInfo();
  }
});
/** Décision 10 : « Passer la partie guidée » (pause) : la partie s'arrête sans compter, tout est dévoilé, retour au menu. */
function skipTutorial(): void {
  if (!tutorialRun || app !== 'pause') return;
  tutorialSkip(meta);
  meta.seenHelp = true;
  saveMeta(meta);
  forgetRun();
  toMenu();
}
$('skipTutoBtn').onclick = skipTutorial;
/** Aide : « Rejouer la partie guidée » (décision 1), pour tout le monde. */
$('helpTutoBtn').onclick = () => {
  closeScreen();
  playNew(false, null, true);
};
/** Une consigne de première apparition a été montrée : une fois par joueur (décision 8). */
function hintShown(h: Hint): void {
  const bit = 1 << h;
  if (meta.hints & bit) return;
  meta.hints |= bit;
  saveMeta(meta);
}
const tuto = new TutorialView({
  isTouch: () => input.isTouch,
  binds: () => meta.settings.keys,
  project(x, y, z, out) {
    if (!scene) return false;
    scene.project(x, y, z, out);
    return true;
  },
  hintShown,
  forced() {
    hud.banner(t('tuto.force'), 'danger', '', TUTO_FEEL.forceMs);
    audio.bossWarn();
  },
  wave(w) {
    // étape du saut : une onde au sol qui vient vers le joueur, comme celle du Gardien (rendu seulement)
    if (!scene) return;
    const P = w.player;
    scene.particles.ring(P.x + P.dirX * 5, 0.25, P.z + P.dirZ * 5, PAL.telegraph, 26, 5.5, 0.6);
  },
});

// ---------- phase 39 : victoire, puis monde infini au choix ----------
/** Le boss du monde 3 est tombé à temps : « Victoire ! », continuer en monde infini ou terminer (stats comptées à la fin). */
function openVictory(): void {
  if (!world || app === 'victory' || app === 'over') return;
  app = 'victory';
  // défi v2 : au défi du jour, la médaille gagnée à 5:00 est annoncée par la feuille elle-même (sa ligne de médaille) ;
  // une bannière du HUD se lisait en transparence derrière, au milieu des chiffres
  renderVictory();
  showOnly('victory');
  scene?.particles.burst(world.player.x, 1, world.player.z, PAL.gold, 40, 8, 8);
  audio.victory();
  vibrate(120);
  if (!input.isTouch) ($('vContinue') as HTMLElement).focus({ preventScroll: true });
}
/**
 * Feuille de victoire (phase 39) ; défi v2 (décision 5) : au défi du jour, « Défi réussi ! », la médaille du moment, ce
 * qui reste pour la suivante et « Continuer en monde infini ». Textes par textContent ; re-rendue au changement de langue.
 */
function renderVictory(): void {
  if (!world) return;
  const daily = world.dailyEnd > 0;
  $('vTitle').textContent = t(daily ? 'over.dailyDone' : 'victory.title');
  $('vTime').textContent = fmtTime(world.t);
  $('vKills').textContent = String(world.kills);
  $('vMedal').hidden = !daily || world.medal === 0;
  $('vMedal').dataset.m = String(world.medal);
  $('vMedalName').textContent = medalName(world.medal);
  const next = daily ? medalNext(world.medal) : [];
  $('vNext').hidden = next.length === 0;
  $('vNext').replaceChildren(
    ...next.map((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      return li;
    }),
  );
  // 1.68.0 : une partie gardée par la 1.67 sur sa feuille de victoire (le monde 3 était la fin) garde son ancien texte
  $('vText').textContent = t(
    daily ? 'victory.dailyText' : world.finalPhase === FINAL_DONE ? 'victory.text' : 'victory.textWorlds',
  );
  $('vContinue').textContent = t(daily ? 'victory.dailyContinue' : 'victory.continue');
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
  gameOver(); // défi v2 : terminer un défi réussi n'est pas la victoire des trois mondes (runOutcome)
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
$('playBtn').onclick = () => playNew(false);
$('resumeRunBtn').onclick = () => {
  if (savedRun) startGame(undefined, false, savedRun);
};
$('abandonYesBtn').onclick = () => {
  const d = abandonFor?.daily ?? false;
  const c = abandonFor?.challenge ?? null;
  const tu = abandonFor?.tutorial ?? false;
  countAbandon();
  forgetRun();
  updateResumeBtn();
  startGame(undefined, d, null, c, tu);
};
$('abandonNoBtn').onclick = () => {
  abandonFor = null;
  updateResumeBtn();
};
// 1.48.1 : le bouton ouvre la feuille qui explique le défi ; c'est elle qui lance la partie
$('dailyBtn').onclick = () => openScreen('daily');
$('dailyBackBtn').onclick = closeScreen;
$('dailyPlayBtn').onclick = () => {
  closeScreen();
  playNew(true);
};
addEventListener('keydown', (e) => {
  if ((app !== 'daily' && app !== 'notes' && app !== 'challenge') || e.repeat || e.code !== 'Escape') return;
  e.preventDefault();
  closeScreen();
});
// ---------- lot L4 : carte de résultat et défi lancé à un ami ----------
/** « Partager » (écran de fin d'un défi du jour) : partage natif, sinon presse-papiers, sinon texte sélectionné. */
async function shareResult(): Promise<void> {
  const card = lastOver?.card;
  if (!card || app !== 'over') return;
  // décision 3 : le pseudo si le joueur en a un, son identifiant s'il est connecté avec ce pseudo (ami au retour)
  const uid = meta.pseudo ? (account?.user?.uid ?? '') : '';
  const text = cardText(card, challengeUrl(location.origin, card, meta.pseudo, uid));
  const r = await shareText(text);
  const ta = $<HTMLTextAreaElement>('shareText');
  $('shareMsg').textContent = r === 'copied' ? t('share.copied') : r === 'manual' ? t('share.manual') : '';
  ta.hidden = r !== 'manual';
  if (r === 'manual') {
    ta.value = text;
    ta.focus({ preventScroll: true });
    ta.select();
  }
}
$('shareBtn').onclick = () => void shareResult();
/** Feuille « Défi de {pseudo} » : le score à battre et « Relever le défi » (focus), Échap la ferme. */
function renderChallenge(): void {
  const c = linkChallenge;
  if (!c) return;
  $('challengeTitle').textContent = c.name ? t('challenge.title', { name: c.name }) : t('challenge.titleAnon');
  $('challengeScore').textContent = t('challenge.score', { time: fmtTime(c.t), kills: String(c.k) });
  $('challengeDay').textContent = t('share.title', { date: fmtDay(c.date) });
  const rule = dailyRule(c.date); // défi v2 (décision 8) : la règle se déduit de la date du défi
  $('challengeRuleName').textContent = ruleName(rule);
  $('challengeRuleText').textContent = ruleText(rule, c.date);
}
function openChallenge(c: Challenge): void {
  linkChallenge = c;
  backTo = 'menu';
  app = 'challenge';
  renderChallenge();
  showOnly('challenge');
  $('challengePlayBtn').focus({ preventScroll: true });
}
$('challengeBackBtn').onclick = closeScreen;
$('challengePlayBtn').onclick = () => {
  const c = linkChallenge;
  if (app !== 'challenge' || !c) return;
  closeScreen();
  playNew(true, c);
};
$('consentYesBtn').onclick = () => answerConsent(true);
$('consentNoBtn').onclick = () => answerConsent(false);
addEventListener('keydown', (e) => {
  if (app !== 'consent' || e.repeat || e.code !== 'Escape') return; // Échap vaut « Non merci »
  e.preventDefault();
  answerConsent(false);
});
$('notesBtn').onclick = () => openScreen('notes');
$('notesBackBtn').onclick = closeScreen;
$('notesMore').onclick = () => {
  notesAll = true;
  renderNotesScreen();
};
$('overShopBtn').onclick = () => openScreen('shop');
// ---------- interface Nocturne : barre d'onglets, carrousel de héros, prochain objectif ----------
let tipT = 0;
/** Bulle d'un onglet verrouillé à la première ouverture (décision 10). */
function showTabTip(): void {
  const tip = $('tabTip');
  tip.hidden = false;
  clearTimeout(tipT);
  tipT = window.setTimeout(() => (tip.hidden = true), 2600);
}
for (const b of $('tabBar').querySelectorAll<HTMLElement>('button[data-screen]'))
  b.onclick = () => {
    const screen = b.dataset.screen as 'characters' | 'shop' | 'achievements' | 'library' | 'board';
    if ((LOCKED_TABS as readonly string[]).includes(b.id) && tabsLocked(meta)) return showTabTip();
    if (app === screen) return;
    audio.init();
    openScreen(screen);
  };
$('heroPrev').onclick = () => viewHero(stepHero(heroView, -1));
$('heroNext').onclick = () => viewHero(stepHero(heroView, 1));
$('goalBtn').onclick = () => openScreen('achievements');
// clavier : ← → changent de héros à l'accueil (parité avec les flèches au doigt, décision 8)
addEventListener('keydown', (e) => {
  if (app !== 'menu' || e.repeat || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  e.preventDefault();
  viewHero(stepHero(heroView, e.code === 'ArrowLeft' ? -1 : 1));
});
$('libBackBtn').onclick = closeScreen;
$('libTabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
  if (!b) return;
  libTab = b.dataset.tab as LibTab;
  libSel = '';
  renderLibraryScreen();
});
// succès : onglets (tous, généraux, défis des héros)
$('achTabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-ach]') as HTMLElement | null;
  if (!b) return;
  achTab = ACH_TABS.includes(b.dataset.ach as AchTab) ? (b.dataset.ach as AchTab) : 'all';
  renderAchScreen();
});
// phase 40 : achat d'une arme ou d'un objet débloqué, retrait d'un objet du tirage
$('libList').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const buy = target.closest('[data-unlock]') as HTMLButtonElement | null;
  const tog = target.closest('[data-toggle]') as HTMLButtonElement | null;
  const pick = target.closest('[data-pick]') as HTMLElement | null;
  audio.init();
  if (pick) {
    // interface Nocturne : une icône de la grille ouvre sa fiche au-dessus
    libSel = pick.dataset.pick!;
    renderLibraryScreen();
    audio.select('s');
    if (!input.isTouch) ($('libList').querySelector(`[data-pick="${libSel}"]`) as HTMLElement | null)?.focus();
    return;
  }
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
    libSel = '';
    renderLibraryScreen();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    closeScreen();
  }
});
$('settingsBtn').onclick = () => openScreen('settings');
// passe d'ergonomie (décision 10) : l'or du haut de l'accueil est un bouton ; il mène là où l'or se dépense (comme
// l'onglet Emplacements, bulle comprise tant que l'onglet est fermé)
$('menuGold').onclick = () => $('shopBtn').click();
$('accountBtn').onclick = () => openScreen('account');
$('accountBackBtn').onclick = closeScreen;
$('boardBackBtn').onclick = closeScreen;
$('boardAccountBtn').onclick = () => openScreen('account');
$('boardPseudoBtn').onclick = () => openScreen('account');
$('boardTabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-view]') as HTMLElement | null;
  if (!b) return;
  boardState.view = viewOf(b.dataset.view, boardState.view);
  boardState.friends = false; // lot L4 : quitte l'onglet « Amis »
  void refreshBoard();
});
$('boardAll').onclick = () => {
  boardState.week = false;
  boardState.friends = false;
  void refreshBoard();
};
$('boardWeek').onclick = () => {
  boardState.week = true;
  boardState.friends = false;
  void refreshBoard();
};
$('boardFriends').onclick = () => {
  boardState.friends = true; // lot L4 : défi du jour entre amis
  void refreshBoard();
};
// lot L4 : « Retirer » un ami (onglet du défi du jour) ; la liste est synchronisée avec la progression
$('boardList').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-remove]') as HTMLElement | null;
  const uid = b?.dataset.remove;
  if (!uid || !removeFriend(meta.friends, uid)) return;
  saveMeta(meta);
  boardState.friendRows = boardState.friendRows.filter((r) => r.uid !== uid);
  renderBoard(boardState);
  if (!input.isTouch) $('boardFriends').focus({ preventScroll: true }); // le bouton touché a disparu
});
$('charactersBackBtn').onclick = closeScreen;
$('helpBtn').onclick = () => openScreen('help');
$('helpBackBtn').onclick = closeScreen;
$('helpPlayBtn').onclick = () => {
  if (helpFirst) {
    setHelpFirst(false);
    meta.seenHelp = true; // le prochain lancement va droit au menu (« Jouer » y lance toujours la partie guidée)
    saveMeta(meta);
  }
  closeScreen();
  playNew(false);
};
$('pauseSettingsBtn').onclick = () => openScreen('settings');
$('shopBackBtn').onclick = closeScreen;
$('achBackBtn').onclick = closeScreen;
$('settingsBackBtn').onclick = closeScreen;
$('chars').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const b = target.closest('.char') as HTMLElement | null;
  if (!b) return;
  // interface Nocturne : un héros débloqué est choisi, un verrouillé s'affiche dans la fiche (condition ou achat)
  viewHero(b.dataset.char as CharacterKey);
  renderHeroCounts();
  audio.init();
  audio.select('s');
});
// tenues (phase 7) : bascule gratuite si possédée, sinon achat en or ; le héros de la partie suit
$('charInfo').addEventListener('click', (e) => {
  // achat d'un personnage en or (phase 6), depuis sa fiche : débité, choisi, accueil et écran rafraîchis
  const buyEl = (e.target as HTMLElement).closest('[data-buy]') as HTMLButtonElement | null;
  if (buyEl) {
    const key = buyEl.dataset.buy as CharacterKey;
    if (buyCharacter(meta, key)) {
      meta.character = key;
      heroView = key;
      saveMeta(meta);
      audio.init();
      audio.chest();
      scene?.setCharacter(key, outfitOf(meta, key));
      updateBestLine();
    }
    return;
  }
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
  renderCharacters($('chars'), meta, $('charInfo'), heroView);
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
// interface Nocturne : la langue se choisit parmi auto, français, anglais (choix soulignés)
$('setLang').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-lang]') as HTMLElement | null;
  const v = b?.dataset.lang as (typeof LANG_SETTINGS)[number] | undefined;
  if (!v || !LANG_SETTINGS.includes(v) || v === meta.settings.lang) return;
  meta.settings.lang = v;
  saveMeta(meta);
  setLang(resolveLang(meta.settings.lang, navigator.language));
  applyLang();
  refreshAccount(); // applyLang remet « Invité » sur la puce de profil, renderAccount le rend à nouveau
});
$('setVibrateBtn').onclick = () => {
  meta.settings.vibrate = !meta.settings.vibrate;
  saveMeta(meta);
  applySettings();
  if (meta.settings.vibrate) vibrate(40);
};
$('setFx').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-fx]') as HTMLElement | null;
  if (b && (b.dataset.fx === 'reduced') !== reducedFx()) $('fxBtn').click();
});
$('qualityBtn').onclick = () => {
  const i = QUALITY_SETTINGS.indexOf(meta.settings.quality);
  setQuality(QUALITY_SETTINGS[(i + 1) % QUALITY_SETTINGS.length]);
};
$('setQuality').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-quality]') as HTMLElement | null;
  const v = b?.dataset.quality as (typeof QUALITY_SETTINGS)[number] | undefined;
  if (v && QUALITY_SETTINGS.includes(v) && v !== meta.settings.quality) setQuality(v);
});
function setQuality(q: (typeof QUALITY_SETTINGS)[number]): void {
  meta.settings.quality = q;
  if (meta.settings.quality === 'auto') autoQ = newAutoQuality(); // geste explicite du joueur : on repart du net
  saveMeta(meta);
  applyQuality();
  audio.init();
  audio.select('s');
}
$('setLeftyBtn').onclick = () => {
  meta.settings.lefty = !meta.settings.lefty;
  saveMeta(meta);
  applySettings();
};
// lot L1 : mesure anonyme de fréquentation, à tout moment ; le retrait supprime le document et oublie l'identifiant
$('setRetentionBtn').onclick = () => {
  if (retention.consent === 'yes') retention.refuse();
  else retention.accept(meta.runs);
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
  if (!world) forgetRun(); // phase 49 : depuis le menu, la partie gardée part avec la progression
  applySettings();
  $('settingsMsg').textContent = t('settings.resetDone');
};
$('againBtn').onclick = () => startGame();
$('restartBtn').onclick = () => startGame(undefined, false, null, null, tutorialRun); // la partie guidée recommence guidée
$('menuBtn').onclick = toMenu; // écran de fin : la partie est terminée
$('quitBtn').onclick = () => {
  saveRun(); // phase 49 : « Menu » de la pause garde la partie (« Reprendre »)
  toMenu();
};
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
let bossTotemNote = -1; // phase 51 : monde dont le nombre de totems de boss a été annoncé
const REVEAL_BANNER_MS = 4000; // lot L2 : la bannière « Nouveau ! » reste 4 s (le temps de lire la phrase)
const MEDAL_BANNER_MS = 3000; // défi v2 : une médaille gagnée reste annoncée 3 s
const BOSS_TOTEM_NOTE_AT = 2.5; // s du monde
const BOSS_TOTEM_NOTE_LATE = 12; // s du monde : au-delà, on ne l'annonce plus
let slideBtnOn = false; // bouton GLISSE allumé pendant la glissade
function openMap(): void {
  if (!world || (app !== 'play' && app !== 'pause')) return;
  mapFrom = app;
  app = 'map';
  showOnly('map');
  const f = mapView.drawBig(world);
  $('mapExplored').textContent = t('map.explored', { pct: Math.round(f * 100) });
  $('lgBossTotem').textContent = t('map.legend.bosstotems', { n: world.bossTotems.length }); // phase 51 : leur nombre varie (1 à 3)
  showRevealed($('map'), world.reveal); // lot L2 : la légende ne nomme que ce qui existe dans la partie
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
  // phase 49 : au menu, Entrée reprend la partie gardée s'il y en a une (le focus clavier, lui, peut viser un autre bouton)
  // un bouton du menu qui a le focus reçoit déjà Entrée (clic natif) : il décide seul (« Jouer » demande l'abandon)
  if (app === 'menu' && document.activeElement?.closest?.('#menu button, #tabBar button')) return; // onglets compris
  if (app === 'menu' && heroLocked && !savedRun) return; // héros verrouillé : « Jouer » est indisponible
  // lot L4 : à l'écran de fin, un bouton qui a le focus (« Partager ») reçoit Entrée seul : pas de nouvelle partie
  if (app === 'over' && document.activeElement?.closest?.('#over button, #over textarea')) return;
  if (app === 'menu') {
    if (savedRun) startGame(undefined, false, savedRun);
    else playNew(false); // partie guidée : Entrée la lance aussi pour un nouveau joueur (règle 4)
  } else if (app === 'over') startGame();
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
  if (document.hidden) {
    pauseGame();
    saveRun(); // phase 49 : changer d'app ou fermer passe ici (sur téléphone, souvent sans pagehide ensuite)
  }
  audio.background(document.hidden); // phase 36 : pas de musique quand l'appli passe en arrière-plan
  if (!document.hidden) retention.open(); // lot L1 : le retour au premier plan est une ouverture
});
// phase 49 : rafraîchir ou fermer l'onglet ; localStorage est écrit de façon synchrone, avant que la page parte
addEventListener('pagehide', saveRun);
$('version').textContent = `v${VERSION}`;
$('notesVer').textContent = VERSION;

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
  renderAccount(accView, meta.pseudo);
  profileAria(); // la puce de profil porte le nom du compte
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
      const cfg = await loadConfig();
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
  if (u && removeFriend(meta.friends, u.uid)) saveMeta(meta); // lot L4 : jamais soi-même parmi ses amis
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
  // phase 49 : aussi chez le marchand, sur la carte et à l'écran de victoire (une partie y est encore en cours)
  if (runOngoing()) {
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
  scene?.setCharacter(meta.character, outfitOf(meta, meta.character)); // héros de la partie : pas dans applyMeta
  if (app === 'shop') renderShopScreen();
  else if (app === 'achievements') renderAchScreen();
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
  else if (boardState.friends && !navigator.onLine) boardState.status = 'offline';
  else boardState.status = 'loading';
  renderBoard(boardState);
  if (boardState.status !== 'loading' || !account || !u) return;
  const seq = ++boardSeq;
  if (boardState.friends) {
    // lot L4 : toi et tes amis, par identifiants (jamais toute la collection du jour)
    try {
      const docs = await account.fetchDay(todayKey(), [u.uid, ...meta.friends.map((f) => f.uid)]);
      if (seq !== boardSeq) return;
      boardState.uid = u.uid;
      boardState.friendRows = friendRows({ uid: u.uid, name: meta.pseudo }, meta.friends, docs);
      boardState.status = 'ready';
    } catch {
      if (seq !== boardSeq) return;
      boardState.status = navigator.onLine ? 'error' : 'offline';
    }
    renderBoard(boardState);
    return;
  }
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
// HitSrc : les treize armes dans l'ordre de WEAPON_KEYS, puis Fire, Thorns, Talisman, Spell, Patins, Horn, Burn, Toxin
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
  0x7ddc4a, // phase 50 : Toxine
];
/** Lot L5 : chiffres romains des paliers visuels d'arme (bannière « Palier II — Orbe »). */
const TIER_NUM = ['I', 'II', 'III'];
/** Lot L5 : couleur des étincelles de coup de chaque arme à la teinte de son palier (tableau réutilisé). */
const hitTint: number[] = HIT_COLORS.slice(0, WEAPON_KEYS.length);
/** Couleur des étincelles d'un coup de source `src` (HitSrc) : arme à la teinte de son palier (lot L5), sinon la sienne. */
function hitColor(src: number): number {
  return src < hitTint.length ? hitTint[src] : HIT_COLORS[src];
}
function handleEvents(w: World, now: number): void {
  const S = scene as GameScene; // une partie ne tourne jamais sans scène (startGame)
  for (let k = 0; k < WEAPON_KEYS.length; k++) hitTint[k] = S.tint(HIT_COLORS[k], w.wtier[WEAPON_KEYS[k]], now);
  const reduced = reducedFx();
  const fx = reduced ? 0.5 : 1; // particules ÷2 en mode réduit
  const PT = FEEL.particles;
  let bladeSnd = false; // phase 32 : un seul son de lame par pas, même si plusieurs cibles sont frappées
  let scytheSnd = false; // 1.69.0 : un seul son de faux par pas, même à trois faux
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
          hitColor((e.x2 | 0) & (HIT_CRIT - 1)),
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
        S.scythe(e.v, e.x2, e.z2, e.y2); // 1.69.0 : une faux par événement
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
        if (!scytheSnd) {
          audio.scythe();
          scytheSnd = true;
        }
        break;
      }
      case Ev.MeteorWarn:
        audio.meteorWarn();
        break;
      case Ev.Whip: {
        // phase 47 C : la lanière claque en ligne droite (trait de l'éclair, orangé et tendu), étincelles au bout
        const tx = e.x + e.x2 * e.v,
          tz = e.z + e.z2 * e.v;
        S.bolts.add(e.x, e.y, e.z, tx, e.y - 0.4, tz, true, w.wtier.fouet); // à la hauteur du héros : la claque suit un saut
        S.particles.burst(tx, e.y - 0.4, tz, hitColor(HitSrc.Fouet), (5 * fx) | 0, 4, 3, false, e.x2, e.z2, 1);
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
        hud.banner(t('banner.raceStart'), 'info');
        audio.levelUp();
        break;
      case Ev.RaceWin:
        hud.banner(t('banner.raceWin'));
        S.particles.ring(e.x, 0.5, e.z, PAL.gold, (30 * fx) | 0, 5, 5);
        audio.chest();
        break;
      case Ev.RaceFail:
        hud.banner(t('banner.raceFail'), 'danger');
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
      case Ev.WeaponTier: {
        // lot L5 : une arme arrive à un palier visuel (25, 50, 100) ; en réduction des effets, bannière et son seulement
        const c = tierCelebration(e.v, reduced),
          TF = FEEL.tier;
        hud.banner(t('banner.tier', { n: TIER_NUM[(e.v | 0) - 1], name: weaponName(WEAPON_KEYS[e.x2 | 0]) }));
        audio.levelUp(c.pitch);
        if (c.particles)
          for (let j = 0; j < 3; j++) {
            // trois tiers de la gerbe, décalés sur la roue du prisme au palier III (une seule teinte aux paliers I et II)
            const hex = S.tint(PAL.cream, e.v, now, j / 3);
            S.particles.ring(e.x, 0.3, e.z, hex, (TF.ring / 3) | 0, 5, 6);
            S.particles.burst(e.x, e.y, e.z, hex, (TF.burst / 3) | 0, 6, 7);
          }
        if (c.shake > 0) S.shake = Math.max(S.shake, c.shake);
        if (c.hitStop > 0) hitStop.request(c.hitStop, TF.hitStop.scale, 2);
        break;
      }
      case Ev.ChestDrop:
        // phase 51 : le coffre qui tombe s'annonce (gerbe dorée, son à lui) ; il passait inaperçu dans la mêlée
        S.particles.burst(e.x, 0.8, e.z, PAL.gold, ((e.v ? 30 : 16) * fx) | 0, 5, 7);
        S.particles.ring(e.x, 0.4, e.z, PAL.gold, ((e.v ? 22 : 12) * fx) | 0, 3, 3);
        audio.chestDrop(e.v === 1);
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
        hud.banner(t('banner.merchant'), 'info');
        audio.chest();
        break;
      case Ev.Explored:
        // phase 53 (demande de Jimmy) : carte du monde explorée à 100 %, prime d'or
        hud.banner(t('banner.explored', { n: e.v }));
        S.particles.burst(e.x, 1, e.z, PAL.gold, (40 * fx) | 0, 7, 8);
        S.particles.ring(e.x, 0.2, e.z, PAL.gold, (30 * fx) | 0, 5, 6);
        audio.levelUp();
        audio.mapChest();
        hud.flash('gold');
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
      case Ev.SkullOn:
        // phase 48 : crâne de difficulté activé (e.v = difficulté ajoutée de la partie)
        S.particles.ring(e.x, 0.2, e.z, PAL.skull, (40 * fx) | 0, 5, 7);
        S.particles.burst(e.x, 1.6, e.z, PAL.skull, (24 * fx) | 0, 4, 10, false);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.hurt);
        audio.roar();
        // partie guidée (décision 14) : la bannière redit l'effet
        hud.banner(t('banner.skull', { n: Math.round(e.v * 100) }), 'danger', tutorialRun ? t('tuto.on.skull') : '');
        hud.flash('skull');
        break;
      case Ev.BossTotemOn:
        // phase 48 : totem de boss activé (e.v = boss en plus par vague dans ce monde)
        S.particles.ring(e.x, 0.3, e.z, PAL.bossTotem, (40 * fx) | 0, 6, 8);
        S.particles.burst(e.x, 1.6, e.z, PAL.bossTotem, (24 * fx) | 0, 4, 10, false);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        audio.roar();
        hud.banner(t('banner.bossTotem', { n: e.v }), 'danger', tutorialRun ? t('tuto.on.bossTotem') : '');
        break;
      case Ev.SurvivalWarn:
        // phase 42 : un boss de survie arrive dans quelques secondes ; défi v2 : x2 = 1, le boss final
        if (e.x2 === 1) hud.banner(t('banner.final'), 'danger', t('banner.finalSoon', { n: DAILY.bossWarn }));
        else hud.banner(t('banner.survivalSoon'), 'danger');
        audio.roar();
        vibrate(40);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite * 0.6);
        break;
      case Ev.BossWarn:
        // phase 37 : plus qu'une minute pour activer le totem
        hud.banner(t('banner.bossWarn'), 'danger');
        audio.bossWarn();
        break;
      case Ev.TotemOn:
        // phase 37 : le totem s'éveille, le boss du monde arrive
        S.particles.ring(e.x, 0.3, e.z, PAL.hp, (40 * fx) | 0, 6, 8);
        S.particles.burst(e.x, 1.5, e.z, PAL.hp, (24 * fx) | 0, 4, 10, false);
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        audio.shrine();
        break;
      case Ev.PortalOpen: {
        // 1.68.0 : au monde 3, le monde est vaincu et le portail, rouge, mène à l'Arène du boss final
        const arena = e.v === ARENA + 1,
          c = arena ? PAL.hp : PAL.xp;
        S.particles.ring(e.x, 0.3, e.z, c, (50 * fx) | 0, 6, 9);
        S.particles.burst(e.x, 1.2, e.z, c, (30 * fx) | 0, 4, 9, false);
        if (arena) hud.banner(t('banner.cleared'), 'reward', t('banner.arenaPortal'));
        else hud.banner(t('banner.portal', { n: e.v }), 'info');
        hud.flash('gold');
        audio.evolve();
        vibrate(60);
        break;
      }
      case Ev.StageStart:
        onStageStart(e.v, e.x2 === 1);
        break;
      case Ev.Medal:
        // défi v2 : argent (boss final abattu après 5:00) ou or (10:00 tenues) : bannière, gerbe dorée, son
        hud.banner(t(`medal.banner.${e.v | 0}`), 'reward', '', MEDAL_BANNER_MS);
        hud.flash('gold');
        S.particles.ring(e.x, 0.4, e.z, PAL.gold, (40 * fx) | 0, 6, 6);
        S.particles.burst(e.x, e.y, e.z, PAL.gold, (30 * fx) | 0, 6, 8);
        audio.evolve();
        vibrate(80);
        break;
      case Ev.Corrupt:
        // corrompus (docs/specs/corrompus.md, décisions 3 et 10) : apparition (x2 = 0), ou compétence lancée (y2 = Skill) :
        // gerbe violette et son de la compétence
        if (e.x2 === 0) audio.corrupt(0);
        else {
          S.particles.burst(e.x, e.y + 0.4, e.z, PAL.corruptEye, (6 * fx) | 0, 3, 3, false);
          audio.corrupt(e.y2 | 0);
        }
        break;
      case Ev.EndlessStart:
        hud.banner(t('banner.endless'), 'info');
        hud.flash('gold');
        break;
      case Ev.EndlessWave:
        hud.banner(t('banner.endlessWave', { n: e.v, count: e.x2 }), 'danger');
        audio.bossWarn();
        vibrate(80);
        break;
      case Ev.TimeUp:
        // 1.66.0 (décision 18) : x2 = 1, le boss du totem vient de tomber et le chrono tombe à 0 ; la ligne du portail
        // reste sous la bannière (celle de PortalOpen, au pas précédent, serait aussitôt remplacée)
        // 1.68.0 : au monde 3, la bannière garde « Monde 3 vaincu ! » (celle de PortalOpen ne dure qu'un pas)
        if (e.x2 === 1 && e.v === STAGE.count) hud.banner(t('banner.cleared'), 'reward', t('banner.timeUpArena'));
        else
          hud.banner(
            t(e.x2 === 1 ? 'banner.timeUpOpen' : e.x2 === 2 ? 'banner.timeUpFight' : 'banner.timeUp'),
            'danger',
            e.x2 === 1 ? t('banner.portal', { n: e.v + 1 }) : '',
          );
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
        // décision 18 : la vague qui suit la chute du chrono ne cache pas la bannière « Le chrono tombe à 0 »
        if (!(w.portal.open && w.overT < FEEL.clockDropBanner)) hud.banner(t('banner.wave'), 'danger');
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
          // phase 42 : boss de survie ; phase 48 : un boss en plus (y2 = 2) n'écrase pas la bannière du boss du totem
          // défi v2 : y2 = 3, le boss final du défi ; 1.68.0 : y2 = 4, le Cœur de la Nuit
          if (e.y2 === 4) hud.banner(t('banner.heart'), 'danger', t('banner.heartSub'));
          else if (e.y2 !== 2)
            hud.banner(
              e.y2 === 1 ? t('banner.survival', { name }) : e.y2 === 3 ? t('banner.finalBoss', { name }) : name,
              'danger',
            );
        }
        audio.boss();
        if (!reduced)
          S.shake = Math.max(S.shake, e.x2 === REAPER_TYPE || e.y2 === 4 ? FEEL.shake.boss : FEEL.shake.elite);
        break;
      // ---- le Cœur de la Nuit (docs/specs/boss-final.md, décision 8 : chaque événement a son retour) ----
      case Ev.FinalPhase:
        if (e.v >= 2 && e.v <= 4) {
          // changement de phase : bannière qui dit quoi faire, rugissement, anneau violet, secousse (le boss s'arrête)
          hud.banner(t(`final.phase.${e.v | 0}`), 'danger', t(`final.phase.${e.v | 0}.sub`));
          audio.final(FinalSfx.Phase);
          vibrate(120);
          S.particles.ring(e.x, 0.4, e.z, PAL.corruptEye, (40 * fx) | 0, 9, 3);
          S.particles.burst(e.x, e.y + 2, e.z, PAL.corrupt, (30 * fx) | 0, 6, 8);
          if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.boss);
        } else if (e.v === FINAL_DONE) hud.banner(t('over.heartDown'), 'reward'); // la victoire totale
        break;
      case Ev.Blocked:
        // coup sans effet (boss invulnérable, ou un double) : étincelles grises, son mat, pas de chiffre
        S.particles.burst(e.x, e.y + 1.5, e.z, PAL.blocked, (3 * fx) | 0, 3, 2, false);
        audio.final(FinalSfx.Blocked);
        break;
      case Ev.Decoy:
        // un double part en fumée (x2 = 0) ou revient (x2 = 1)
        S.particles.burst(e.x, 1.4, e.z, PAL.dust, (26 * fx) | 0, 4, 4);
        S.particles.burst(e.x, 1.8, e.z, PAL.corrupt, (10 * fx) | 0, 3, 5, false);
        audio.final(FinalSfx.Decoy);
        break;
      case Ev.Seal:
        if (e.x2 === 0) {
          // posé : colonne violette (les quatre en même temps : un seul son)
          S.particles.burst(e.x, 1.5, e.z, PAL.corruptEye, (16 * fx) | 0, 3, 9, false);
          if (e.v === 1) audio.final(FinalSfx.Seal);
        } else {
          // brisé : il emporte sa part des PV du boss (le chiffre est sur le boss)
          S.particles.burst(e.x, 1.2, e.z, PAL.corruptEye, (30 * fx) | 0, 7, 8);
          S.particles.ring(e.x, 0.3, e.z, PAL.gold, (24 * fx) | 0, 5, 3);
          if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
          hud.flash('gold');
          audio.final(FinalSfx.SealBreak);
          vibrate(60);
        }
        break;
      case Ev.RingWarn:
        audio.final(FinalSfx.RingWarn); // le cercle de flammes rougit (rendu) : il se resserre dans 0,7 s
        break;
      case Ev.Judgement:
        if (e.x2 === 0) {
          // l'annonce : l'Arène rougit, la zone sûre s'allume (rendu)
          S.particles.ring(e.x, 0.4, e.z, PAL.gold, (30 * fx) | 0, e.v * 2.2, 1.5);
          audio.final(FinalSfx.Judgement);
          vibrate(60);
        } else {
          S.particles.ring(w.player.x, 0.3, w.player.z, PAL.telegraph, (40 * fx) | 0, 10, 4);
          if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.boss);
          audio.final(FinalSfx.JudgementHit);
        }
        break;
      case Ev.BossRoar:
        audio.roar();
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        break;
      case Ev.BossEnrage:
        // phase 43 : rage du boss (en vie depuis BOSS.enrage.after s) : bannière, rugissement, anneau rouge, secousse
        hud.banner(t('banner.enrage'), 'danger');
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
      case Ev.Bolt: {
        // lot L5 : v = 1 + index de l'arme qui le lance (0 : objet ou sort), pour la teinte de son palier
        const src = (e.v | 0) - 1,
          tier = src >= 0 && src < WEAPON_KEYS.length ? w.wtier[WEAPON_KEYS[src]] : 0;
        S.bolts.add(e.x, e.y, e.z, e.x2, e.y2, e.z2, false, tier);
        S.particles.burst(e.x2, e.y2, e.z2, S.tint(PAL.bolt, tier, now), (4 * fx) | 0, 4, 3);
        if (i % 3 === 0) audio.bolt();
        break;
      }
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
// temps JS de chaque image : anneau de 120 frames (2 s à 60 Hz) et copie triée préallouée, aucune allocation par frame.
// 1.69.2 : toujours mesuré (plus seulement onglet perf ouvert) : l'automate du rendu y lit si le JS est le goulot
const PERF_WINDOW = 120;
const frameTimes = new Float64Array(PERF_WINDOW).fill(4);
const frameSorted = new Float64Array(PERF_WINDOW);
let frameIdx = 0;
let jsP95 = 4;
// intervalles entre frames rAF (phase 9) : toujours mesurés, c'est ce qui déclenche le repli automatique de qualité
const gapTimes = new Float64Array(PERF_WINDOW).fill(16);
const gapSorted = new Float64Array(PERF_WINDOW);
let gapIdx = 0;
let gapIdx0 = 0; // 1.69.2 : index des anneaux au début de la fenêtre de mesure (le p95 ne lit que ses images)
let frameIdx0 = 0;
let gapP95 = 16;
let gapT0 = 0; // fenêtres de 2 s de temps réel (indépendantes du fps) ; seuils : AUTO_QUALITY de render/quality.ts
// fps réels : frames rAF comptées sur une fenêtre de 2 s (ce que voit le joueur, pas seulement notre temps JS)
let fpsT0 = 0;
let fpsFrames = 0;
let fps = 0;
// ratio temps de jeu / temps réel sur la même fenêtre : vérifie que le hit-stop reste borné (≈ 0,9–1 attendu en jeu)
let simT0 = 0;
let simRatio = 1;
// 17 nov. 2026 : la part du temps réel que le hit-stop laisse passer, sur la même fenêtre. Contrairement à `simRatio`,
// elle ne dépend pas de la vitesse de rendu (rattrapage borné à 4 pas) : c'est elle que l'e2e de stress vérifie
let stopReal = 0;
let stopFed = 0;
let stopRatio = 1;

function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  if (innerWidth !== sizeW || innerHeight !== sizeH || devicePixelRatio !== sizeDpr) resize();
  const gapMs = debugRt && debugRt.slowFrames > 0 ? debugRt.slowFrames : nowMs - last;
  let realDt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  // rendu auto : p95 des intervalles et du temps JS sur 2 s, en jeu seulement, après les 3 premières secondes du run
  gapTimes[gapIdx++ % PERF_WINDOW] = gapMs;
  if (nowMs - gapT0 >= 2000) {
    gapT0 = nowMs;
    gapP95 = windowP95(gapTimes, gapIdx, gapIdx - gapIdx0, gapSorted);
    jsP95 = windowP95(frameTimes, frameIdx, frameIdx - frameIdx0, frameSorted);
    gapIdx0 = gapIdx;
    frameIdx0 = frameIdx;
    if (app === 'play' && world && world.t > 3 && meta.settings.quality === 'auto') {
      const change = qualityWindow(autoQ, gapP95, jsP95, nowMs / 1000);
      if (change !== QualityChange.None) applyQuality();
      // décision 7 : une bannière à la première baisse de résolution de la partie, aucune pour l'allègement ni la remontée
      if (change === QualityChange.FirstResolutionDrop) hud.banner(t('banner.quality'), 'info');
    } else qualityIdle(autoQ);
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
    dtIn *= tuto.timeScale(reducedFx()); // partie guidée : ralenti (le pas fixe ne change pas)
    const fed = hitStop.advance(dtIn);
    acc += fed;
    stopReal += dtIn;
    stopFed += fed;
    let n = 0;
    while (acc >= STEP && n < 4) {
      input.poll(inp);
      const t0 = world.t;
      step(world, inp, STEP);
      handleEvents(world, now);
      tuto.step(world, world.t - t0); // partie guidée : étape franchie, consigne de première apparition
      acc -= STEP;
      n++;
      if (world.mode !== Mode.Play) break;
    }
    if (n === 4) acc = 0; // on ne rattrape pas : évite la spirale de la mort
    if (debugRt) debugRt.onFrame(world); // mode stress (debug uniquement) ; null en prod
    if (world.mode === Mode.Dead)
      // 1.68.0 : la victoire (le monde 3 vaincu) est acquise après lui ; défi v2 : pas au défi du jour (runOutcome)
      gameOver();
    else if (world.mode === Mode.Won) openVictory();
    else if (world.mode === Mode.LevelUp) openLevelUp();
    else if (world.mode === Mode.Merchant) openMerchant();
    // 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 5) : une fenêtre de première fois attend que le jeu tourne
    // sans autre feuille (carte de niveau, coffre, marchand passent d'abord)
    else if (guide && guide.win !== 0) openInfo(takeWindow(guide));
    hurtT -= realDt;
    // partie guidée : la puce « Active le totem » attend que le guide montre le totem (ou le rende obligatoire)
    hud.goalHold = guide !== null && guide.tutorial && totemLocked(world);
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
    // 1.68.0 : l'éclipse du boss final (phases 3 et 4) assombrit les bords (vignette CSS, écrite au changement)
    const eclipseNow = world.stage === ARENA && world.finalPhase >= 3 && world.finalPhase < FINAL_DONE;
    if (eclipseNow !== eclipseOn) setEclipse(eclipseNow);
    const frozenNow = world.powerT[Pw.Gel] > 0; // phase 35 : voile bleuté du Temps figé (classe CSS, écrite au changement)
    if (frozenNow !== timestopOn) {
      timestopOn = frozenNow;
      document.body.classList.toggle('timestop', frozenNow);
    }
    mapView.update(world, realDt); // phase 27 : minicarte (4 fois par seconde)
    tuto.frame(world, realDt, true);
    // phase 51 : le nombre de totems de boss du monde s'annonce une fois, après la bannière d'arrivée. L'annonce attend
    // qu'aucune autre bannière ne soit affichée (elle écrasait celle d'un bonus ramassé tôt) et se tait passé
    // BOSS_TOTEM_NOTE_LATE s : une partie reprise plus loin dans le monde ne la répète pas
    if (bossTotemNote !== world.stage && world.stageT > BOSS_TOTEM_NOTE_AT) {
      // lot L2 : avant le dévoilement du totem, le monde n'a aucun totem de boss ; rien à annoncer (« 0 totem » sinon)
      if (world.stageT > BOSS_TOTEM_NOTE_LATE || world.endless || world.bossTotems.length === 0)
        bossTotemNote = world.stage;
      else if (world.mode === Mode.Play && !hud.bannerOn) {
        hud.banner(t('banner.bossTotems', { n: world.bossTotems.length }), 'danger');
        bossTotemNote = world.stage;
      }
    }
    const slideOn = world.player.sliding;
    if (slideOn !== slideBtnOn) {
      slideBtnOn = slideOn;
      $('btnSlide').classList.toggle('on', slideOn);
    }
  } else if (world && tuto.g) tuto.frame(world, realDt, false); // bulle masquée hors du jeu
  if (app === 'levelup') {
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
    app === 'pause' ||
    app === 'levelup' ||
    app === 'merchant' ||
    app === 'map' ||
    app === 'over' ||
    app === 'victory' ||
    app === 'tutoEnd' ||
    app === 'info';
  if (duckNow !== duckOn) {
    duckOn = duckNow;
    audio.duck(duckNow);
  }
  // interface Nocturne (décision 6) : le menu et ses écrans ont un fond illustré, opaque ; la scène 3D ne rend que
  // la partie (en jeu, et derrière les écrans de partie : pause, cartes, marchand, carte, victoire, fin)
  if (world && scene && gameShown()) {
    const alpha = app === 'play' ? Math.min(1, acc / STEP) : 1;
    scene.render(world, alpha, realDt * (app === 'play' ? hitStop.timeScale : 0.2), now, hurtT > 0);
    scene.dmg.update(realDt, scene.camera, innerWidth, innerHeight);
    scene.marks.update(world.powers, world.powerCount, now, scene.camera, innerWidth, innerHeight); // phase 35
  }
  if (world) tuto.arrowFrame(world, innerWidth, innerHeight); // après le rendu : la caméra de cette image

  // temps JS de l'image (1.69.2 : toujours mesuré) ; `debug.jsTime` le remplace dans les tests
  frameTimes[frameIdx++ % PERF_WINDOW] = debugRt && debugRt.jsTime > 0 ? debugRt.jsTime : performance.now() - t0;
  if (perfOn && scene) {
    fpsFrames++;
    if (fpsT0 === 0) {
      fpsT0 = nowMs;
      fpsFrames = 0;
      simT0 = world ? world.t : 0;
      stopReal = stopFed = 0;
    } else if (nowMs - fpsT0 >= 2000) {
      fps = (fpsFrames * 1000) / (nowMs - fpsT0);
      if (world && app === 'play') simRatio = ((world.t - simT0) * 1000) / (nowMs - fpsT0);
      if (world && app === 'play' && stopReal > 0) stopRatio = stopFed / stopReal;
      fpsT0 = nowMs;
      fpsFrames = 0;
      simT0 = world ? world.t : 0;
      stopReal = stopFed = 0;
    }
    if (frameIdx % 10 === 0) {
      frameSorted.set(frameTimes);
      frameSorted.sort(); // tri numérique natif des Float64Array, en place
      const p50 = frameSorted[PERF_WINDOW >> 1];
      const p95 = frameSorted[(PERF_WINDOW * 0.95) | 0];
      const info = scene.info();
      hud.perf(
        `fps ${fps.toFixed(0)}  js p50 ${p50.toFixed(2)} ms  p95 ${p95.toFixed(2)} ms (2 s)\n` +
          `temps ×${simRatio.toFixed(2)}  hit-stop ${hitStop.enabled ? 'on' : 'off'} ×${stopRatio.toFixed(2)}\n` +
          `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
          (world
            ? `ennemis ${world.enemyCount}  proj ${world.projCount}  gemmes ${world.gemCount}  part. ${scene.particles.alive}\n`
            : '') +
          `voix audio ${audio.voiceCount}/${audio.maxVoices}\n` +
          `modèles : héros ${scene.heroKind}, ennemis ${scene.enemyStatus}\n` +
          `rendu ${info.level === 0 ? 'pixel' : QUALITY_STEPS[info.step].name} (${meta.settings.quality})  res ${info.width}×${info.height}\n` +
          `frame p95 ${gapP95.toFixed(1)} ms  js p95 ${jsP95.toFixed(1)} ms (fenêtre du rendu auto)`,
      );
    }
  }
}

// ---------- démarrage ----------
function applyMeta(): void {
  heroView = meta.character; // le carrousel repart du héros choisi de la sauvegarde
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
  if (t?.closest?.('#playBtn, #dailyPlayBtn, #challengePlayBtn')) return;
  audio.setMusic(app === 'play' || app === 'levelup' || app === 'merchant' ? 'game' : 'menu'); // aide, réglages… : le menu
}
addEventListener('pointerup', firstGesture, true);
addEventListener('keydown', firstGesture, true);
// Passe d'ergonomie (décision 9) : les missions du jour commencent repliées ; dépliées, elles se posent par-dessus
// l'accueil et se referment à Échap ou d'un toucher hors du panneau (le focus revient sur leur ligne). Sur un écran
// large la liste est toujours montrée par la mise en page (CSS) : l'état replié n'y change rien.
{
  const box = $<HTMLDetailsElement>('missions');
  addEventListener(
    'pointerdown',
    (e) => {
      if (box.open && !(e.target as Element | null)?.closest?.('.missions')) box.open = false;
    },
    true,
  );
  addEventListener('keydown', (e) => {
    if (app !== 'menu' || e.code !== 'Escape' || !box.open) return;
    e.preventDefault();
    box.open = false;
    box.querySelector('summary')?.focus({ preventScroll: true });
  });
}
applyMeta(); // depuis le repli localStorage, tout de suite : aucun décalage de mise en page quand IndexedDB répond
refreshAccount();
retention.open(); // lot L1 : le lancement est une ouverture (rien ne part sans accord)
// lot L4 : un lien de défi (`/#defi=…`, dans le fragment : rien ne part vers l'hébergeur) ouvre sa feuille au menu
// (l'aide du premier lancement attendra la prochaine ouverture). Le fragment est retiré de l'adresse une fois lu : un
// rechargement ne rouvre pas la feuille. Paramètres invalides : menu normal.
/** Lit le fragment de l'adresse : le défi qu'il porte (null s'il est invalide), et le retire de l'adresse. */
function takeLinked(): Challenge | null {
  if (!isChallengeHash(location.hash)) return null;
  const c = parseChallenge(location.hash, todayKey());
  history.replaceState(history.state, '', location.pathname + location.search);
  return c;
}
let linked = takeLinked();
/** Lot L4 : le lien d'un joueur connecté avec un pseudo l'ajoute aux amis (une fois, jamais soi-même). */
function befriendLinked(): void {
  if (!linked?.uid) return;
  const self = account?.user?.uid ?? syncRec?.uid ?? '';
  if (addFriend(meta.friends, { uid: linked.uid, name: linked.name }, self)) saveMeta(meta);
}
if (linked) {
  befriendLinked();
  openChallenge(linked);
}
// un lien ouvert dans l'onglet où le jeu tourne déjà (même document) : la feuille s'ouvre si le joueur est au menu
addEventListener('hashchange', () => {
  const c = takeLinked();
  if (!c || app !== 'menu') return;
  linked = c;
  befriendLinked();
  openChallenge(c);
});
// premier lancement : l'aide « Comment jouer » (phase 14), une fois ; pas dans les tests sauf demande (?help=1)
// partie guidée (1.65.1, retour de Jimmy) : un nouveau joueur voit d'abord les touches, sans retour possible ;
// seul « Jouer » ferme l'aide, et lance la partie guidée
if (!linked && !meta.seenHelp && (!debugEnabled() || location.search.includes('help=1'))) {
  if (tutorialDue(meta)) {
    setHelpFirst(true);
    openScreen('help');
    if (!input.isTouch) queueMicrotask(() => $('helpPlayBtn').focus({ preventScroll: true }));
  } else {
    meta.seenHelp = true;
    saveMeta(meta);
    openScreen('help');
  }
}
// phase 49 : une partie gardée sur l'appareil ? Lecture synchrone d'abord (menu juste dès l'affichage), IndexedDB ensuite
function takeRun(r: RunRead): void {
  if (r && 'run' in r) savedRun = r.run;
  else if (r && 'stale' in r) {
    clearRun(); // format d'avant une mise à jour qui le rend faux : on le dit une fois et on l'oublie
    $('runLostNote').hidden = false;
  }
}
takeRun(peekRun());
updateResumeBtn();
if (!savedRun)
  void readRun().then((r) => {
    if (app !== 'menu' || savedRun) return;
    takeRun(r);
    updateResumeBtn();
  });
let metaLoaded = false;
loadMeta().then((m) => {
  if (JSON.stringify(m) !== JSON.stringify(meta)) {
    meta = m;
    applyMeta();
  }
  befriendLinked(); // lot L4 : la méta durable a pu remplacer celle du repli
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
  get guide() {
    return guide;
  },
  startTutorial() {
    startGame(undefined, false, null, null, true);
  },
  guideStep(n) {
    if (!world || !guide) return;
    guideJump(guide, world, n as Step);
    tuto.refresh();
  },
  tutoScale: () => tuto.timeScale(reducedFx()),
  renderStep(n) {
    autoQ.step = Math.max(0, Math.min(QUALITY_STEPS.length - 1, n | 0));
    applyQuality();
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
      // lot L4 : documents du défi du jour (`opts.day`), filtrés par identifiants comme la vraie requête
      fetchDay: (_day: string, uids: string[]) =>
        Promise.resolve(
          new Map(
            ((opts?.day ?? []) as { uid: string; name: string; time: number; kills: number }[])
              .filter((d) => uids.includes(d.uid))
              .map((d) => [d.uid, { name: d.name, time: d.time, kills: d.kills, at: 0 }]),
          ),
        ),
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

// Module de rendu : rien ne part avant la première interaction du joueur (geste, touche, survol de « Jouer ») : le
// menu reste léger tant qu'on ne joue pas, et aucune tâche longue ne précède l'interactivité (Lighthouse). Après ce
// premier geste, la scène se prépare quand l'écran est au repos, jamais dans l'appui lui-même (passe d'ergonomie,
// décision 17 : `loadScene`). En debug/tests (`?debug=1`), tout de suite : les specs attendent `__game.ready` sans
// interagir.
{
  const warm = (): void => {
    if (!lastPress) lastPress = performance.now(); // un survol n'est pas un appui : le repos se compte de maintenant
    void loadScene().catch(() => {});
  };
  if (debugRt) requestAnimationFrame(() => void loadScene(true).catch(() => {}));
  else {
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const)
      addEventListener(ev, warm, { once: true, passive: true });
    $('playBtn').addEventListener('pointerenter', warm, { once: true });
  }
}
