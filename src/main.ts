import { ELITE_TYPE, ENEMIES, REAPER_TYPE, STEP } from './sim/balance';
import { WEAPON_KEYS } from './sim/weapons/defs';
import { startRun, step } from './sim/step';
import { Ev, Mode } from './sim/types';
import type { Input } from './sim/types';
import { World } from './sim/world';
import type { GameScene } from './render/scene';
import { PAL } from './render/palette';
import { FEEL, HitStop } from './render/feel';
import { InputManager } from './platform/input';
import { AudioBus } from './platform/audio';
import { Hud, flashCard, renderCards } from './ui/hud';
import { LANG_SETTINGS, fmtTime, getLang, has, ordinal, resolveLang, setLang, t } from './i18n';
import { achName, achUnlock, evolutionName } from './ui/cards';
import type { Achievement } from './meta/achievements';
import { exportMeta, importMeta, loadMeta, normalizeMeta, peekMeta, saveMeta, DEFAULT_META } from './meta/save';
import type { Meta } from './meta/save';
import {
  checkAchievements,
  dailyUnlocked,
  missingTime,
  unlockedCharacters,
  unlockedWeapons,
} from './meta/achievements';
import { buy, worldOptions } from './meta/shop';
import { dailyBest, dailySeed, recordDaily } from './meta/daily';
import { bestLine, esc, renderAchievements, renderCharacters, renderProgress, renderShop } from './ui/meta-ui';
import type { CharacterKey } from './sim/types';
import { installDebugHooks } from './debug';
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
      s = new GameScene($('c') as HTMLCanvasElement, $('dmg'));
    } catch (e) {
      $('nogl').hidden = false;
      $('menu').hidden = true;
      throw e;
    }
    scene = s;
    sizeW = sizeH = 0;
    resize();
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
const input = new InputManager($('stick'), $('knob'), $('btnJump'), $('btnDash'));

// ---------- état applicatif ----------
type AppMode = 'menu' | 'play' | 'levelup' | 'pause' | 'over' | 'shop' | 'achievements' | 'settings';
const SCREENS = ['menu', 'levelup', 'pause', 'over', 'shop', 'achievements', 'settings'] as const;
let backTo: AppMode = 'menu'; // écran à rouvrir en quittant boutique / succès / réglages
let dailyRun = false; // partie en cours = défi du jour
// compteurs du run en cours (succès) ; remis à zéro à chaque startGame
const runStats = { dards: 0, elites: 0, bosses: 0, evolutions: 0, won: false };
let lastVibe = 0;
let app: AppMode = 'menu';
let world: World | null = null;
let meta: Meta = metaAtStart;
let hurtT = 0;
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
let perfOn = location.search.includes('debug');
const inp: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };

// Taille du rendu : l'événement `resize` ne suffit pas (écran pliable ouvert au lancement, rotation, barres iOS,
// fenêtre redimensionnée avant la première frame) → on compare aussi la taille à chaque frame (zéro coût, zéro
// allocation) et on écoute le viewport visuel et l'orientation. Une taille fausse = image écrasée ou étirée.
let sizeW = 0;
let sizeH = 0;
function resize(): void {
  const w = innerWidth,
    h = innerHeight;
  if (w === sizeW && h === sizeH) return;
  sizeW = w;
  sizeH = h;
  scene?.resize(w, h);
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
visualViewport?.addEventListener('resize', resize);
resize();

function showOnly(id: AppMode | null): void {
  for (const s of SCREENS) $(s).hidden = s !== id;
}
function updateBestLine(): void {
  $('bestLine').textContent = bestLine(meta);
  renderCharacters($('chars'), meta);
  const daily = dailyUnlocked(meta);
  $('dailyBtn').hidden = !daily;
  if (daily) {
    const best = dailyBest(meta);
    $('dailyBtn').textContent = best > 0 ? t('menu.dailyBest', { time: fmtTime(best) }) : t('menu.daily');
  }
  $('shopBtn').textContent = t('menu.shopGold', { gold: t('gold', { n: Math.round(meta.gold) }) });
}
/** Applique les réglages (HUD, gaucher, vibrations, son, langue) au DOM et aux libellés. */
function applySettings(): void {
  document.documentElement.style.setProperty('--hud-scale', String(meta.settings.hudScale));
  document.body.classList.toggle('lefty', meta.settings.lefty);
  $('setSoundBtn').textContent = $('soundBtn').textContent = t(meta.muted ? 'settings.sound.off' : 'settings.sound.on');
  $('setVibrateBtn').textContent = t(meta.settings.vibrate ? 'settings.vibrate.on' : 'settings.vibrate.off');
  $('setLeftyBtn').textContent = t(meta.settings.lefty ? 'settings.lefty.yes' : 'settings.lefty.no');
  $('setLangBtn').textContent = t('settings.lang.' + meta.settings.lang);
  for (const [id, v] of [
    ['hudSmallBtn', 0.85],
    ['hudNormalBtn', 1],
    ['hudLargeBtn', 1.2],
  ] as const)
    $(id).classList.toggle('selected', meta.settings.hudScale === v);
}
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
function openScreen(id: 'shop' | 'achievements' | 'settings'): void {
  if (app === 'menu' || app === 'over' || app === 'pause') backTo = app;
  app = id;
  if (id === 'shop') renderShopScreen();
  else if (id === 'achievements') renderAchievements($('achList'), meta);
  else {
    applySettings();
    $('settingsMsg').textContent = '';
  }
  showOnly(id);
}
function renderShopScreen(): void {
  $('shopGold').textContent = t('gold', { n: Math.round(meta.gold) });
  renderShop($('shopLines'), meta);
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
  applySettings();
  setPerf(perfOn);
  if (world) hud.kit(world);
  updateBestLine();
  if (app === 'over') renderOverScreen();
  else if (app === 'levelup') openLevelUp();
  else if (app === 'shop') renderShopScreen();
  else if (app === 'achievements') renderAchievements($('achList'), meta);
}
/** Après tout remplacement de la méta (import, effacement, IndexedDB, tests) : applique la langue si elle change. */
function syncLang(): void {
  const l = resolveLang(meta.settings.lang, navigator.language);
  if (l !== getLang()) {
    setLang(l);
    applyLang();
  }
}
function closeScreen(): void {
  app = backTo;
  if (backTo === 'menu') updateBestLine();
  showOnly(backTo);
}

// ---------- décor : construit une fois pour la seed de décor fixe ----------
// Le décor dépend de la seed du monde ; on garde une seed de décor constante pour ne pas le reconstruire à chaque run.
const DECOR_SEED = 20261102;
let decorBuilt = false;

let startWanted: { variant?: number; daily: boolean } | null = null;
function startGame(variant?: number, daily = false): void {
  if (!scene || !sceneReady) {
    // le joueur a été plus rapide que le module de rendu : on démarre dès qu'il est prêt
    startWanted = { variant, daily };
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
  const S = scene;
  audio.init();
  dailyRun = daily;
  runStats.dards = runStats.elites = runStats.bosses = runStats.evolutions = 0;
  runStats.won = false;
  // la méta entre dans la sim par des options (personnage, boutique, armes débloquées) ; défi du jour : égalité
  world = new World(DECOR_SEED, worldOptions(meta, unlockedWeapons(meta), daily)); // même décor à chaque run
  // on décale le rng selon l'horloge pour que deux runs diffèrent (le décor, lui, utilise seed ^ constante)
  // `variant` (debug/tests) remplace l'horloge ; le défi du jour utilise la seed de la date : même run pour tous
  const skips = (daily ? dailySeed() : (variant ?? Date.now() % 1000)) | 0;
  for (let i = 0; i < skips; i++) world.rng.next();
  startRun(world);
  if (!decorBuilt) {
    S.buildDecor(world);
    decorBuilt = true;
  }
  app = 'play';
  showOnly(null);
  $('hud').hidden = false;
  $('keys').hidden = input.isTouch;
  $('touch').hidden = !input.isTouch;
  hud.reset();
  hud.kit(world);
  S.dmg.clear();
  S.snapCamera(world);
  hurtT = 0;
  hitStop.reset();
  applyFx();
  $('update').hidden = true; // jamais de bannière de mise à jour en jeu
  last = performance.now();
}
function toMenu(): void {
  app = 'menu';
  world = null;
  showOnly('menu');
  $('hud').hidden = true;
  $('keys').hidden = true;
  $('touch').hidden = true;
  updateBestLine();
  showUpdateBanner();
}
function pauseGame(): void {
  if (app !== 'play') return;
  app = 'pause';
  showOnly('pause');
}
function resumeGame(): void {
  if (app !== 'pause') return;
  app = 'play';
  showOnly(null);
  last = performance.now();
}
function openLevelUp(): void {
  if (!world) return;
  const again = app === 'levelup'; // re-rendu (changement de langue) : ni son ni balayage
  app = 'levelup';
  $('luTitle').textContent = t('levelup.title', { n: world.player.level - world.pending + 1 });
  renderCards($('cards'), world.cards);
  if (again) return;
  showOnly('levelup');
  audio.levelUp();
  hud.xpSweep();
  if (!input.isTouch) ($('cards').firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}
let choosing = false;
function choose(i: number): void {
  if (!world || app !== 'levelup' || choosing || i < 0 || i >= world.cards.length) return;
  // flash de la carte + son selon le type, puis fermeture (160 ms, ou tout de suite en mode réduit)
  const c = world.cards[i];
  audio.select(c.kind === 'w' ? (c.lv === 1 ? 'wnew' : 'w') : c.kind === 's' ? 's' : 'heal');
  flashCard($('cards'), i);
  choosing = true;
  const apply = () => {
    choosing = false;
    if (!world || app !== 'levelup') return;
    inp.pick = i;
    step(world, inp, STEP); // applique la carte ; peut re-rouler si plusieurs niveaux en attente
    inp.pick = -1;
    hud.kit(world);
    if (world.mode === Mode.LevelUp) openLevelUp();
    else {
      app = 'play';
      showOnly(null);
      audio.whoosh();
      last = performance.now();
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
  renderProgress($('oProgress'), meta, 3);
  $('oTime').textContent = fmtTime(world.t);
  $('oLvl').textContent = String(world.player.level);
  $('oKills').textContent = String(world.kills);
  $('oBest').textContent = fmtTime(meta.bestTime);
  $('oGold').textContent = String(o.gold);
  $('oTitle').textContent = t(o.won ? 'over.win' : 'over.dead');
  $('oTitle').classList.toggle('win', o.won);
  // seul HTML autorisé : le <span class="newrec"> écrit ici ; tout texte traduit passe par esc()
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
  st.evolutions += runStats.evolutions;
  st.wins += won ? 1 : 0;
  st.bestTime = Math.max(st.bestTime, world.t);
  st.runs++;
  const fresh = checkAchievements(meta);
  let dailyRank = 0;
  if (dailyRun) dailyRank = recordDaily(meta, Math.floor(world.t));
  saveMeta(meta);
  lastOver = { won, rec, gold, dailyRank, miss: missingTime(meta, world.t), fresh };
  renderOverScreen();
  S.particles.burst(world.player.x, 1, world.player.z, won ? PAL.gold : PAL.accent, 30, 8, 8);
  if (!reducedFx()) S.shake = 0.5;
  if (!won) audio.death();
  setTimeout(() => {
    if (app !== 'over') return;
    showOnly('over');
    showUpdateBanner();
  }, 700);
}

// ---------- boutons ----------
$('playBtn').onclick = () => startGame();
$('dailyBtn').onclick = () => startGame(undefined, true);
$('shopBtn').onclick = () => openScreen('shop');
$('overShopBtn').onclick = () => openScreen('shop');
$('achBtn').onclick = () => openScreen('achievements');
$('settingsBtn').onclick = () => openScreen('settings');
$('pauseSettingsBtn').onclick = () => openScreen('settings');
$('shopBackBtn').onclick = closeScreen;
$('achBackBtn').onclick = closeScreen;
$('settingsBackBtn').onclick = closeScreen;
$('chars').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.card.char') as HTMLElement | null;
  if (!b) return;
  const key = b.dataset.char as CharacterKey;
  if (!unlockedCharacters(meta).includes(key)) return;
  meta.character = key;
  saveMeta(meta);
  renderCharacters($('chars'), meta);
  audio.init();
  audio.select('s');
});
$('shopLines').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.buy') as HTMLButtonElement | null;
  if (!b || b.disabled) return;
  if (buy(meta, +b.dataset.line!)) {
    saveMeta(meta);
    audio.init();
    audio.chest();
    renderShopScreen();
  }
});
// réglages
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
};
$('setVibrateBtn').onclick = () => {
  meta.settings.vibrate = !meta.settings.vibrate;
  saveMeta(meta);
  applySettings();
  if (meta.settings.vibrate) vibrate(40);
};
$('setFxBtn').onclick = () => $('fxBtn').click();
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
  // on garde ce qui relève de l'appareil et du confort : son, effets, langue
  meta = normalizeMeta({
    ...DEFAULT_META,
    muted: meta.muted,
    reducedFx: meta.reducedFx,
    fxChosen: meta.fxChosen,
    settings: { ...DEFAULT_META.settings, lang: meta.settings.lang },
  });
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
};
input.onConfirm = () => {
  if (app === 'menu') startGame();
  else if (app === 'over') startGame();
};
input.onTouchDetected = () => {
  if (app !== 'menu') {
    $('touch').hidden = false;
    $('keys').hidden = true;
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
});
$('version').textContent = `v${VERSION}`;

// PWA : mise à jour proposée uniquement au menu ou à l'écran de mort (skill pwa-release §2)
const pwa = new Pwa();
function showUpdateBanner(): void {
  $('update').hidden = !(pwa.needRefresh && (app === 'menu' || app === 'over'));
}
pwa.onNeedRefresh = showUpdateBanner;
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
const HIT_COLORS = [PAL.proj, PAL.xp, PAL.paper, PAL.bolt, PAL.boomerang, PAL.mine]; // HitSrc
function handleEvents(w: World, now: number): void {
  const S = scene as GameScene; // une partie ne tourne jamais sans scène (startGame)
  const reduced = reducedFx();
  const fx = reduced ? 0.5 : 1; // particules ÷2 en mode réduit
  const PT = FEEL.particles;
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    switch (e.type) {
      case Ev.Hit:
        S.dmg.add(e.x, e.y, e.z, e.v);
        // gerbe de la couleur de l'arme, orientée comme le recul (opposée à la source)
        S.particles.burst(
          e.x,
          e.y,
          e.z,
          HIT_COLORS[e.x2 | 0],
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
        audio.kill(false, now);
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
        audio.shoot();
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
        break;
      case Ev.Land:
        S.onLand();
        S.particles.burst(e.x, 0.2, e.z, PAL.dust, PT.land.n, PT.land.speed, PT.land.up);
        break;
      case Ev.Dash:
        audio.dash();
        break;
      case Ev.Pickup:
        audio.pickup(now);
        break;
      case Ev.LevelUp:
        S.particles.ring(e.x, 0.3, e.z, PAL.xp, (PT.levelUp.n * fx) | 0, PT.levelUp.speed, PT.levelUp.up);
        break;
      case Ev.Chest:
        S.particles.ring(e.x, 0.5, e.z, PAL.gold, (24 * fx) | 0, 4, 5);
        hud.banner(t('banner.chest', { n: e.v }));
        audio.chest();
        break;
      case Ev.Evolve:
        runStats.evolutions++;
        S.particles.ring(e.x, 0.5, e.z, PAL.gold, (40 * fx) | 0, 7, 8);
        S.particles.ring(e.x, 0.5, e.z, PAL.paper, (20 * fx) | 0, 4, 10);
        hud.banner(t('banner.evolve', { name: evolutionName(WEAPON_KEYS[e.v | 0]) }));
        hud.flash('gold');
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.evolve);
        audio.evolve();
        break;
      case Ev.PlayerHurt:
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
          hud.banner(t(has(k) ? k : 'banner.boss.default'));
        }
        audio.boss();
        if (!reduced) S.shake = Math.max(S.shake, e.x2 === REAPER_TYPE ? FEEL.shake.boss : FEEL.shake.elite);
        break;
      case Ev.BossRoar:
        audio.roar();
        if (!reduced) S.shake = Math.max(S.shake, FEEL.shake.elite);
        break;
      case Ev.Spit:
        S.particles.burst(e.x, e.y, e.z, PAL.spit, (3 * fx) | 0, 2, 2, false);
        audio.spit();
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
// fps réels : frames rAF comptées sur une fenêtre de 2 s (ce que voit le joueur, pas seulement notre temps JS)
let fpsT0 = 0;
let fpsFrames = 0;
let fps = 0;
// ratio temps de jeu / temps réel sur la même fenêtre : vérifie que le hit-stop reste borné (≈ 0,9–1 attendu en jeu)
let simT0 = 0;
let simRatio = 1;

function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  if (innerWidth !== sizeW || innerHeight !== sizeH) resize();
  let realDt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  if (debugRt) realDt *= debugRt.speed; // captures et tests uniquement (null en prod)
  const now = nowMs / 1000;
  const t0 = performance.now();

  if (app === 'play' && world) {
    // hit-stop borné : ralentit le temps réel injecté dans l'accumulateur, le pas fixe reste déterministe
    acc += hitStop.advance(realDt);
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
    if (world.mode === Mode.Dead) gameOver();
    else if (world.mode === Mode.Won) gameOver(true);
    else if (world.mode === Mode.LevelUp) openLevelUp();
    hurtT -= realDt;
    hud.update(world, hurtT, now, realDt);
  } else if (app === 'levelup') {
    // clavier / manette : touches 1-3 (parité avec le tap sur la carte)
    const pick = input.takePick();
    if (pick >= 0) choose(pick);
  }

  if (world && app !== 'menu' && scene) {
    const alpha = app === 'play' ? Math.min(1, acc / STEP) : 1;
    scene.render(world, alpha, realDt * (app === 'play' ? hitStop.timeScale : 0.2), now, hurtT > 0);
    scene.dmg.update(realDt, scene.camera, innerWidth, innerHeight);
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
          `res ${scene.renderer.domElement.width}×${scene.renderer.domElement.height}`,
      );
    }
  }
}

// ---------- démarrage ----------
function applyMeta(): void {
  audio.setMuted(meta.muted);
  applyFx();
  applySettings();
  updateBestLine();
  syncLang();
}
applyMeta(); // depuis le repli localStorage, tout de suite : aucun décalage de mise en page quand IndexedDB répond
let metaLoaded = false;
loadMeta().then((m) => {
  if (JSON.stringify(m) !== JSON.stringify(meta)) {
    meta = m;
    applyMeta();
  }
  metaLoaded = true;
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
  afterSimJump() {
    if (!world) return;
    hud.kit(world);
    if (world.mode === Mode.LevelUp) openLevelUp();
  },
  audioVoices: () => audio.voiceCount,
  getMeta: () => meta,
  setMeta(m) {
    meta = normalizeMeta(m);
    saveMeta(meta);
    applyMeta();
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
