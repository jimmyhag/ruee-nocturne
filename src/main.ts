import { STEP } from './sim/balance';
import { startRun, step } from './sim/step';
import { Ev, Mode } from './sim/types';
import type { Input } from './sim/types';
import { World } from './sim/world';
import { GameScene } from './render/scene';
import { PAL } from './render/palette';
import { InputManager } from './platform/input';
import { AudioBus } from './platform/audio';
import { Hud, fmtTime, renderCards } from './ui/hud';
import { loadMeta, saveMeta, DEFAULT_META } from './meta/save';
import type { Meta } from './meta/save';
import { installDebugHooks } from './debug';
import { Pwa } from './platform/pwa';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const VERSION = '0.1.0';

// ---------- rendu ----------
let scene: GameScene;
try {
  scene = new GameScene($('c') as HTMLCanvasElement, $('dmg'));
} catch {
  $('nogl').hidden = false;
  $('menu').hidden = true;
  throw new Error('WebGL indisponible');
}
const hud = new Hud();
const audio = new AudioBus();
const input = new InputManager($('stick'), $('knob'), $('btnJump'), $('btnDash'));

// ---------- état applicatif ----------
type AppMode = 'menu' | 'play' | 'levelup' | 'pause' | 'over';
let app: AppMode = 'menu';
let world: World | null = null;
let meta: Meta = { ...DEFAULT_META };
let hurtT = 0;
let timeScale = 1; // hit-stop
let hitStopT = 0;
let perfOn = location.search.includes('debug') ? true : false;
const inp: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };

function resize(): void {
  scene.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

function showOnly(id: AppMode | null): void {
  for (const s of ['menu', 'levelup', 'pause', 'over'] as const) $(s).hidden = s !== id;
}
function updateBestLine(): void {
  $('bestLine').textContent =
    meta.bestTime > 0
      ? `Record : ${fmtTime(meta.bestTime)} · ${meta.bestKills} vaincus · ${meta.runs} run${meta.runs > 1 ? 's' : ''}`
      : "Aucun record pour l'instant";
}

// ---------- décor : construit une fois pour la seed de décor fixe ----------
// Le décor dépend de la seed du monde ; on garde une seed de décor constante pour ne pas le reconstruire à chaque run.
const DECOR_SEED = 20261102;
let decorBuilt = false;

function startGame(variant?: number): void {
  audio.init();
  world = new World(DECOR_SEED); // même décor à chaque run ; la variété vient du spawner (rng avancé par le temps réel ci-dessous)
  // on décale le rng selon l'horloge pour que deux runs diffèrent (le décor, lui, utilise seed ^ constante)
  // `variant` (debug/tests) remplace l'horloge : partie reproductible, décor identique
  const skips = (variant ?? Date.now() % 1000) | 0;
  for (let i = 0; i < skips; i++) world.rng.next();
  startRun(world);
  if (!decorBuilt) {
    scene.buildDecor(world);
    decorBuilt = true;
  }
  app = 'play';
  showOnly(null);
  $('hud').hidden = false;
  $('keys').hidden = input.isTouch;
  $('touch').hidden = !input.isTouch;
  hud.reset();
  hud.kit(world);
  scene.dmg.clear();
  scene.snapCamera(world);
  hurtT = 0;
  timeScale = 1;
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
  audio.stopMusic();
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
  app = 'levelup';
  $('luTitle').textContent = 'Niveau ' + (world.player.level - world.pending + 1);
  renderCards($('cards'), world.cards);
  showOnly('levelup');
  audio.levelUp();
  hud.xpSweep();
  if (!input.isTouch) ($('cards').firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}
function choose(i: number): void {
  if (!world || app !== 'levelup' || i < 0 || i >= world.cards.length) return;
  inp.pick = i;
  step(world, inp, STEP); // applique la carte ; peut re-rouler si plusieurs niveaux en attente
  inp.pick = -1;
  audio.select();
  hud.kit(world);
  if (world.mode === Mode.LevelUp) openLevelUp();
  else {
    app = 'play';
    showOnly(null);
    last = performance.now();
  }
}
function gameOver(): void {
  if (!world) return;
  app = 'over';
  const rec = world.t > meta.bestTime;
  meta.runs++;
  meta.totalKills += world.kills;
  if (rec) meta.bestTime = world.t;
  if (world.kills > meta.bestKills) meta.bestKills = world.kills;
  saveMeta(meta);
  $('oTime').textContent = fmtTime(world.t);
  $('oLvl').textContent = String(world.player.level);
  $('oKills').textContent = String(world.kills);
  $('oBest').textContent = fmtTime(meta.bestTime);
  $('oMsg').innerHTML = rec
    ? '<span class="newrec">Nouveau record</span>'
    : `Encore ${fmtTime(meta.bestTime - world.t)} pour battre ton record`;
  scene.particles.burst(world.player.x, 1, world.player.z, PAL.accent, 30, 8, 8);
  scene.shake = 0.5;
  audio.death();
  audio.stopMusic();
  setTimeout(() => {
    if (app !== 'over') return;
    showOnly('over');
    showUpdateBanner();
  }, 700);
}

// ---------- boutons ----------
$('playBtn').onclick = () => startGame();
$('againBtn').onclick = () => startGame();
$('restartBtn').onclick = () => startGame();
$('menuBtn').onclick = toMenu;
$('quitBtn').onclick = toMenu;
$('pauseBtn').onclick = pauseGame;
$('resumeBtn').onclick = resumeGame;
$('soundBtn').onclick = () => {
  meta.muted = !meta.muted;
  audio.setMuted(meta.muted);
  $('soundBtn').textContent = 'Son : ' + (meta.muted ? 'coupé' : 'activé');
  saveMeta(meta);
};
$('fxBtn').onclick = () => {
  meta.reducedFx = !meta.reducedFx;
  $('fxBtn').textContent = 'Effets : ' + (meta.reducedFx ? 'réduits' : 'complets');
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
addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    perfOn = !perfOn;
    hud.showPerf(perfOn);
  }
});
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
function handleEvents(w: World, now: number): void {
  const fxMul = meta.reducedFx ? 0.5 : 1;
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    switch (e.type) {
      case Ev.Hit:
        scene.dmg.add(e.x, e.y, e.z, e.v);
        scene.particles.burst(e.x, e.y, e.z, PAL.proj, (3 * fxMul) | 0, 4, 3);
        audio.hit(e.v, now);
        break;
      case Ev.Kill:
        scene.particles.burst(e.x, e.y, e.z, PAL.enemy[e.v | 0], (6 * fxMul) | 0, 6, 7);
        audio.kill();
        if (!meta.reducedFx) hitStop(0.04, 0.15);
        break;
      case Ev.BossKill:
        scene.particles.burst(e.x, e.y, e.z, PAL.enemy[3], (50 * fxMul) | 0, 10, 9);
        scene.particles.burst(e.x, e.y, e.z, PAL.gold, (30 * fxMul) | 0, 8, 9);
        scene.shake = meta.reducedFx ? 0 : 0.6;
        hud.banner('Gardien vaincu');
        audio.kill(true);
        hitStop(0.12, 0.1);
        break;
      case Ev.Shoot:
        scene.particles.burst(e.x, e.y, e.z, PAL.proj, 3, 3, 2, false);
        audio.shoot();
        break;
      case Ev.Jump:
        audio.jump();
        break;
      case Ev.Land:
        scene.particles.burst(e.x, 0.2, e.z, PAL.dust, 6, 2, 3);
        break;
      case Ev.Dash:
        audio.dash();
        break;
      case Ev.Pickup:
        audio.pickup(now);
        break;
      case Ev.LevelUp:
        scene.particles.burst(e.x, e.y, e.z, PAL.xp, 30, 5, 6, false);
        break;
      case Ev.PlayerHurt:
        hurtT = 0.15;
        if (Math.random() < 0.12) audio.hurt();
        if (!meta.reducedFx) {
          scene.shake = Math.max(scene.shake, 0.25);
          hitStop(0.06, 0.3);
        }
        break;
      case Ev.Wave:
        hud.banner('La horde encercle !');
        break;
      case Ev.BossSpawn:
        hud.banner('Le Gardien approche');
        audio.boss();
        scene.shake = meta.reducedFx ? 0 : 0.4;
        break;
      case Ev.Bolt:
        scene.bolts.add(e.x, e.y, e.z, e.x2, e.y2, e.z2);
        scene.particles.burst(e.x2, e.y2, e.z2, PAL.bolt, 4, 4, 3);
        if (i % 3 === 0) audio.bolt();
        break;
      case Ev.Death:
        break;
    }
  }
}
function hitStop(duration: number, scale: number): void {
  hitStopT = Math.max(hitStopT, duration);
  timeScale = Math.min(timeScale, scale);
}

// ---------- boucle principale : pas fixe + interpolation ----------
let last = performance.now();
let acc = 0;
// onglet perf : anneau de 120 frames (2 s à 60 Hz) et copie triée préallouée : aucune allocation par frame
const PERF_WINDOW = 120;
const frameTimes = new Float64Array(PERF_WINDOW).fill(16);
const frameSorted = new Float64Array(PERF_WINDOW);
let frameIdx = 0;

function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  const now = nowMs / 1000;
  const t0 = performance.now();

  if (app === 'play' && world) {
    // hit-stop : ralentit le temps de jeu (sim et rendu), déterminisme intact (pas fixe)
    if (hitStopT > 0) {
      hitStopT -= realDt;
      if (hitStopT <= 0) timeScale = 1;
    }
    acc += realDt * timeScale;
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
    if (world.mode === Mode.Dead) gameOver();
    else if (world.mode === Mode.LevelUp) openLevelUp();
    hurtT -= realDt;
    hud.update(world, hurtT, now);
    // musique : intensité selon la densité
    audio.setIntensity(world.bossIndex >= 0 ? 1 : Math.min(1, world.enemyCount / 300), realDt);
  }

  if (world && app !== 'menu') {
    const alpha = app === 'play' ? Math.min(1, acc / STEP) : 1;
    scene.render(world, alpha, realDt * (app === 'play' ? timeScale : 0.2), now, hurtT > 0);
    scene.dmg.update(realDt, scene.camera, innerWidth, innerHeight);
  } else {
    scene.renderIdle(now, realDt);
  }

  if (perfOn) {
    frameTimes[frameIdx++ % PERF_WINDOW] = performance.now() - t0;
    if (frameIdx % 10 === 0) {
      frameSorted.set(frameTimes);
      frameSorted.sort(); // tri numérique natif des Float64Array, en place
      const p50 = frameSorted[PERF_WINDOW >> 1];
      const p95 = frameSorted[(PERF_WINDOW * 0.95) | 0];
      const info = scene.info();
      hud.perf(
        `frame p50 ${p50.toFixed(2)} ms  p95 ${p95.toFixed(2)} ms (2 s)\n` +
          `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
          (world ? `ennemis ${world.enemyCount}  proj ${world.projCount}  gemmes ${world.gemCount}\n` : '') +
          `voix audio ${audio.voiceCount}/${audio.maxVoices}\n` +
          `res ${scene.renderer.domElement.width}×${scene.renderer.domElement.height}`,
      );
    }
  }
}

// ---------- démarrage ----------
loadMeta().then((m) => {
  meta = m;
  audio.setMuted(meta.muted);
  $('soundBtn').textContent = 'Son : ' + (meta.muted ? 'coupé' : 'activé');
  $('fxBtn').textContent = 'Effets : ' + (meta.reducedFx ? 'réduits' : 'complets');
  updateBestLine();
});
hud.showPerf(perfOn);
requestAnimationFrame(frame);

// hooks de debug / tests (jamais en prod sans ?debug=1)
installDebugHooks({
  get world() {
    return world;
  },
  get app() {
    return app;
  },
  scene,
  start: startGame,
  afterSimJump() {
    if (!world) return;
    hud.kit(world);
    if (world.mode === Mode.LevelUp) openLevelUp();
  },
  audioVoices: () => audio.voiceCount,
});
