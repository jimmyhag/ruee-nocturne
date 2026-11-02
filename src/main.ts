import { ELITE_TYPE, STEP } from './sim/balance';
import { startRun, step } from './sim/step';
import { Ev, Mode } from './sim/types';
import type { Input } from './sim/types';
import { World } from './sim/world';
import { GameScene } from './render/scene';
import { PAL } from './render/palette';
import { FEEL, HitStop } from './render/feel';
import { InputManager } from './platform/input';
import { AudioBus } from './platform/audio';
import { Hud, flashCard, fmtTime, renderCards } from './ui/hud';
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
  $('fxBtn').textContent = 'Effets : ' + (r ? (meta.fxChosen ? 'réduits' : 'réduits (système)') : 'complets');
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
  scene.resize(w, h);
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
visualViewport?.addEventListener('resize', resize);
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
  if (!reducedFx()) scene.shake = 0.5;
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
  $('perfBtn').textContent = 'Perf : ' + (on ? 'affichée' : 'masquée');
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
const HIT_COLORS = [PAL.proj, PAL.xp, PAL.paper, PAL.bolt]; // HitSrc : Orbe, Aura, Lames, Foudre
function handleEvents(w: World, now: number): void {
  const reduced = reducedFx();
  const fx = reduced ? 0.5 : 1; // particules ÷2 en mode réduit
  const PT = FEEL.particles;
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    switch (e.type) {
      case Ev.Hit:
        scene.dmg.add(e.x, e.y, e.z, e.v);
        // gerbe de la couleur de l'arme, orientée comme le recul (opposée à la source)
        scene.particles.burst(
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
        if (e.v === ELITE_TYPE) {
          // élite (Brute) : grosse gerbe ennemi + or, shake
          scene.particles.burst(
            e.x,
            e.y,
            e.z,
            PAL.enemy[ELITE_TYPE],
            (PT.elite.n * 0.5 * fx) | 0,
            PT.elite.speed,
            PT.elite.up,
          );
          scene.particles.burst(e.x, e.y, e.z, PAL.gold, (PT.elite.n * 0.5 * fx) | 0, PT.elite.speed, PT.elite.up);
          if (!reduced) scene.shake = Math.max(scene.shake, FEEL.shake.elite);
        } else
          scene.particles.burst(e.x, e.y, e.z, PAL.enemy[e.v | 0], (PT.kill.n * fx) | 0, PT.kill.speed, PT.kill.up);
        audio.kill(false, now);
        hitStop.request(FEEL.hitStop.kill.duration, FEEL.hitStop.kill.scale);
        break;
      case Ev.BossKill:
        scene.particles.burst(e.x, e.y, e.z, PAL.enemy[3], (PT.elite.n * fx) | 0, PT.elite.speed + 2, PT.elite.up);
        scene.particles.burst(e.x, e.y, e.z, PAL.gold, (PT.elite.n * 0.6 * fx) | 0, PT.elite.speed, PT.elite.up);
        if (!reduced) scene.shake = FEEL.shake.boss;
        hud.banner('Gardien vaincu');
        hud.flash('gold');
        audio.kill(true);
        hitStop.request(FEEL.hitStop.boss.duration, FEEL.hitStop.boss.scale, 2);
        break;
      case Ev.Shoot:
        scene.particles.burst(e.x, e.y, e.z, PAL.proj, PT.shoot.n, PT.shoot.speed, PT.shoot.up, false);
        audio.shoot();
        break;
      case Ev.Jump:
        audio.jump();
        break;
      case Ev.Land:
        scene.onLand();
        scene.particles.burst(e.x, 0.2, e.z, PAL.dust, PT.land.n, PT.land.speed, PT.land.up);
        break;
      case Ev.Dash:
        audio.dash();
        break;
      case Ev.Pickup:
        audio.pickup(now);
        break;
      case Ev.LevelUp:
        scene.particles.ring(e.x, 0.3, e.z, PAL.xp, (PT.levelUp.n * fx) | 0, PT.levelUp.speed, PT.levelUp.up);
        break;
      case Ev.PlayerHurt:
        hurtT = 0.15;
        if (Math.random() < 0.12) audio.hurt();
        if (!reduced) scene.shake = Math.max(scene.shake, FEEL.shake.hurt);
        hitStop.request(FEEL.hitStop.hurt.duration, FEEL.hitStop.hurt.scale, 1);
        break;
      case Ev.Wave:
        hud.banner('La horde encercle !');
        break;
      case Ev.BossSpawn:
        hud.banner('Le Gardien approche');
        audio.boss();
        if (!reduced) scene.shake = Math.max(scene.shake, FEEL.shake.elite);
        break;
      case Ev.Bolt:
        scene.bolts.add(e.x, e.y, e.z, e.x2, e.y2, e.z2);
        scene.particles.burst(e.x2, e.y2, e.z2, PAL.bolt, (4 * fx) | 0, 4, 3);
        if (i % 3 === 0) audio.bolt();
        break;
      case Ev.AuraPulse:
      case Ev.Evolve:
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
    else if (world.mode === Mode.LevelUp) openLevelUp();
    hurtT -= realDt;
    hud.update(world, hurtT, now, realDt);
    // musique : intensité = min(1, ennemis / 120), 1 pendant un boss (skill game-feel §7)
    audio.setIntensity(world.bossIndex >= 0 ? 1 : Math.min(1, world.enemyCount / 120), realDt);
  } else if (app === 'levelup') {
    // clavier / manette : touches 1-3 (parité avec le tap sur la carte)
    const pick = input.takePick();
    if (pick >= 0) choose(pick);
  }

  if (world && app !== 'menu') {
    const alpha = app === 'play' ? Math.min(1, acc / STEP) : 1;
    scene.render(world, alpha, realDt * (app === 'play' ? hitStop.timeScale : 0.2), now, hurtT > 0);
    scene.dmg.update(realDt, scene.camera, innerWidth, innerHeight);
  } else {
    scene.renderIdle(now, realDt);
  }

  if (perfOn) {
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
loadMeta().then((m) => {
  meta = m;
  audio.setMuted(meta.muted);
  $('soundBtn').textContent = 'Son : ' + (meta.muted ? 'coupé' : 'activé');
  applyFx();
  updateBestLine();
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
  scene,
  start: startGame,
  afterSimJump() {
    if (!world) return;
    hud.kit(world);
    if (world.mode === Mode.LevelUp) openLevelUp();
  },
  audioVoices: () => audio.voiceCount,
});
