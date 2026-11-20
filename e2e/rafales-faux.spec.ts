// Rafales, faux et explications au bon moment (docs/specs/rafales-faux-guidage.md, 1.69.0) : l'interface, sur PC
// (clavier) et sur téléphone (doigt), un test par scénario d'interface (titres en anglais). La simulation et la méta sont
// dans src/sim/burst.test.ts et src/meta/windows.test.ts. Avec CAPTURES=1, les captures vont dans
// docs/captures/rafales-faux/ (sinon dans shots/, en PNG).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const ALL = 511; // toutes les consignes et fenêtres vues (e2e/helpers.ts)
const PORTAL = 4,
  OVERTIME = 7,
  ENDLESS = 8;

async function shot(page: Page, name: string, project: string): Promise<void> {
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true)); // l'onglet perf du debug
  // dans docs/ : en JPEG, comme les captures des autres lots (le PNG pèse dix fois plus)
  if (process.env.CAPTURES === '1')
    await page.screenshot({ path: `docs/captures/rafales-faux/${project}-${name}.jpg`, type: 'jpeg', quality: 80 });
  else await page.screenshot({ path: `shots/${project}-${name}.png` });
}
const app = (page: Page) => page.evaluate(() => (window as any).__game.app as string);
/** Un joueur qui a tout vu, sauf la fenêtre `bit`. */
async function unseen(page: Page, bit: number): Promise<void> {
  await page.evaluate(
    (h) => (window as any).__game.setMeta({ ...(window as any).__game.meta, hints: h }),
    ALL & ~(1 << bit),
  );
}
/** Partie au repos : héros increvable, ni horde, ni vague, ni niveau, ni marchand. */
async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.enemyCount = 0;
  });
}
/** Le boss du totem du monde appelé (le héros dans le cercle), puis abattu par l'arme du héros. */
async function beatTotemBoss(page: Page): Promise<void> {
  await page.evaluate(() => {
    const G = (window as any).__game;
    const T = G.world.totem;
    G.debug.teleport(T.x, T.z);
    T.charge = 2.9;
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1, null, { timeout: 20_000 });
  // le héros s'écarte du portail à venir ; le boss, à 1 PV, tombe sous ses coups dans un pas de jeu (comme en partie)
  await page.evaluate(() => {
    const G = (window as any).__game,
      w = G.world;
    G.debug.teleport(w.totem.x + 7, w.totem.z);
    const b = w.enemies[w.bossIndex];
    b.hp = 1;
    b.x = b.px = w.player.x + 2.5;
    b.z = b.pz = w.player.z;
  });
}
/** Attend la fenêtre ; une feuille de cartes (coffre du boss sous les pieds) passe d'abord : on la ferme. */
async function untilInfo(page: Page): Promise<void> {
  for (let i = 0; i < 80 && (await app(page)) !== 'info'; i++) {
    if ((await app(page)) === 'levelup') await page.locator('#cards .card').first().click();
    await page.waitForTimeout(200);
  }
  await expect(page.locator('#info')).toBeVisible();
}
/** La fenêtre met le jeu en pause : le temps de jeu ne bouge plus. */
async function expectPaused(page: Page): Promise<void> {
  expect(await app(page)).toBe('info');
  const t0 = await page.evaluate(() => (window as any).__game.world.t as number);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).__game.world.t as number)).toBe(t0);
}
/** « Compris » : Entrée (ou Espace) au clavier, le doigt sur téléphone (règle 4) ; le jeu reprend. */
async function gotIt(page: Page, hasTouch: boolean, key = 'Enter'): Promise<void> {
  if (hasTouch) await page.locator('#infoOk').tap();
  else {
    await expect(page.locator('#infoOk')).toBeFocused();
    await page.keyboard.press(key);
  }
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await expect(page.locator('#info')).toBeHidden();
}
/** Change la langue en cours de partie (réglage du joueur, comme depuis les réglages de la pause). */
async function setLang(page: Page, lang: 'fr' | 'en'): Promise<void> {
  await page.evaluate((l) => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: l } });
  }, lang);
}
const hintsHave = (page: Page, bit: number) =>
  page.evaluate((b) => ((window as any).__game.meta.hints & (1 << b)) !== 0, bit);

test('The end of the guided run reads at a glance', async ({ page, hasTouch }, info) => {
  test.setTimeout(90_000);
  const errors = collectConsoleErrors(page);
  // un joueur qui meurt pendant la partie guidée
  await page.goto('/?debug=1&tuto=1&help=1');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5 }));
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const btn = (await page.locator('#help').isVisible()) ? '#helpPlayBtn' : '#playBtn';
  if (hasTouch) await page.locator(btn).tap();
  else await page.locator(btn).click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(true);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#tutoEnd')).toBeVisible({ timeout: 8000 });
  // le résultat en titre, en grand ; l'encouragement dessous ; « Rejouer » et « Retour au menu »
  await expect(page.locator('#teTitle')).toHaveText('La horde a eu raison de toi… pour cette fois');
  await expect(page.locator('#teTitle')).toHaveClass(/h1/);
  const size = await page.locator('#teTitle').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(26);
  await expect(page.locator('#teText')).toHaveText('Deviens plus fort à chaque partie et reviens. À toi de jouer !');
  await expect(page.locator('#tePlayBtn')).toHaveText('Rejouer');
  await expect(page.locator('#teMenuBtn')).toHaveText('Retour au menu');
  await expect(page.locator('#tePlayBtn')).toBeInViewport();
  await expect(page.locator('#teMenuBtn')).toBeInViewport();
  await page.waitForTimeout(400);
  await shot(page, 'fin-guidee', info.project.name);
  // anglais
  await setLang(page, 'en');
  await expect(page.locator('#teTitle')).toHaveText('The horde got the better of you… this time');
  await expect(page.locator('#teMenuBtn')).toHaveText('Back to menu');
  await setLang(page, 'fr');
  // retour au menu : le doigt, ou Échap au clavier (« Rejouer » a le focus : Entrée relance)
  if (hasTouch) await page.locator('#teMenuBtn').tap();
  else {
    await expect(page.locator('#tePlayBtn')).toBeFocused();
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('#menu')).toBeVisible();
  expect(await app(page)).toBe('menu');
  expect(await page.evaluate(() => (window as any).__game.meta.tutorial)).toBe(1); // la partie guidée est finie
  expect(errors).toEqual([]);
});

test('The portal explains itself only once', async ({ page, hasTouch }, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await unseen(page, PORTAL);
  await startRun(page, 3);
  await calm(page);
  // le boss du monde meurt : la fenêtre explique le portail et le chrono à 0, jeu en pause
  await beatTotemBoss(page);
  await untilInfo(page);
  await expect(page.locator('#infoTitle')).toHaveText('Le portail est ouvert !');
  await expect(page.locator('#infoL1')).toContainText('le chrono tombe à 0');
  await expect(page.locator('#infoL2')).toContainText('monde suivant');
  await expect(page.locator('#infoL3')).toContainText('se renforcent');
  await expectPaused(page);
  await shot(page, 'fenetre-portail', info.project.name);
  await gotIt(page, hasTouch);
  expect(await hintsHave(page, PORTAL)).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.world.portal.open)).toBe(true);
  // au portail suivant (monde 2), elle ne revient pas
  await page.evaluate(() => (window as any).__game.debug.nextStage());
  await page.waitForFunction(() => (window as any).__game.world.stage === 1);
  await calm(page);
  await beatTotemBoss(page);
  await page.waitForFunction(() => (window as any).__game.world.portal.open === true, null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('#info')).toBeHidden();
  expect(await app(page)).not.toBe('info');
  expect(errors).toEqual([]);
});

test('Time running out is announced only once', async ({ page, hasTouch }, info) => {
  test.setTimeout(90_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await unseen(page, OVERTIME);
  await startRun(page);
  await calm(page);
  // le chrono atteint 0 sans que le boss du monde ait été tué
  await page.evaluate(() => (window as any).__game.debug.stageTime(598));
  await untilInfo(page);
  await expect(page.locator('#infoTitle')).toHaveText('Temps écoulé !');
  await expect(page.locator('#infoTitle')).toHaveClass(/alert/);
  await expect(page.locator('#infoL1')).toContainText('se renforcent chaque minute');
  await expect(page.locator('#infoL2')).toHaveText('Active la statue rouge, tue le boss et prends le portail.');
  await expectPaused(page);
  await shot(page, 'fenetre-temps-ecoule', info.project.name);
  // anglais
  await setLang(page, 'en');
  await expect(page.locator('#infoTitle')).toHaveText("Time's up!");
  await expect(page.locator('#infoOk')).toHaveText('Got it');
  await setLang(page, 'fr');
  if (!hasTouch) await page.locator('#infoOk').focus(); // le changement de langue a pu déplacer le focus
  await gotIt(page, hasTouch, 'Space');
  expect(await hintsHave(page, OVERTIME)).toBe(true);
  // une seule fois : la prolongation continue, le monde suivant atteint son chrono sans rien rouvrir
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as any).__game.debug.nextStage());
  await page.waitForFunction(() => (window as any).__game.world.stage === 1);
  await calm(page);
  await page.evaluate(() => (window as any).__game.debug.stageTime(598));
  await page.waitForFunction(() => (window as any).__game.world.overT > 0, null, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('#info')).toBeHidden();
  expect(errors).toEqual([]);
});

test('The endless world is announced only once', async ({ page, hasTouch }, info) => {
  test.setTimeout(180_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await unseen(page, ENDLESS);
  const toEndless = async () => {
    await startRun(page);
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.debug.god();
      const w = g.world;
      w.player.need = 1e9;
      w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
      w.merchant.next = 99;
      w.merchant.endlessNext = 1e9;
      g.debug.win();
    });
    await expect(page.locator('#victory')).toBeVisible({ timeout: 15_000 });
    if (hasTouch) await page.locator('#vContinue').tap();
    else await page.keyboard.press('Enter');
  };
  // la première entrée dans un monde infini
  await toEndless();
  await untilInfo(page);
  await expect(page.locator('#infoTitle')).toHaveText('Monde infini !');
  await expect(page.locator('#infoL1')).toHaveText('Plus de chrono : une vague de boss toutes les 2 min 30.');
  await expect(page.locator('#infoL3')).toHaveText('Tiens le plus longtemps possible !');
  await expect(page.locator('#info')).not.toContainText(/corromp/); // le monde infini du défi n'en a pas
  expect(await page.evaluate(() => (window as any).__game.world.endless)).toBe(true);
  await expectPaused(page);
  await shot(page, 'fenetre-monde-infini', info.project.name);
  await gotIt(page, hasTouch);
  expect(await hintsHave(page, ENDLESS)).toBe(true);
  // la partie suivante entre en monde infini sans fenêtre
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 10_000 });
  await toEndless();
  await page.waitForFunction(() => (window as any).__game.world?.endless === true, null, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('#info')).toBeHidden();
  expect(await app(page)).toBe('play');
  expect(errors).toEqual([]);
});

test('The totem is not in a hurry', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calm(page);
  // le début d'un monde : le totem quand on est prêt
  await expect(page.locator('#goalChip')).toHaveClass(/g1/);
  await expect(page.locator('#goalText')).toHaveText('Survis · totem quand tu es prêt');
  await expect(page.locator('#goalDist')).toBeVisible(); // la flèche et la distance restent
  await shot(page, 'objectif-totem', info.project.name);
  // la dernière minute : « Active le totem », rouge qui pulse
  await page.evaluate(() => (window as any).__game.debug.stageTime(545));
  await expect(page.locator('#goalChip')).toHaveClass(/g6/);
  await expect(page.locator('#goalText')).toHaveText('Active le totem');
  const pulse = await page.locator('#goalChip').evaluate((el) => getComputedStyle(el).animationName);
  expect(pulse).toBe('goalPulse');
  await shot(page, 'objectif-totem-derniere-minute', info.project.name);
  // le chrono à 0 : rouge vif
  await page.evaluate(() => (window as any).__game.debug.stageTime(603));
  await expect(page.locator('#goalChip')).toHaveClass(/g7/);
  await expect(page.locator('#goalText')).toHaveText('Active le totem');
  await shot(page, 'objectif-totem-temps-ecoule', info.project.name);
  // anglais
  await page.evaluate(() => (window as any).__game.debug.stageTime(10));
  await setLang(page, 'en');
  await expect(page.locator('#goalText')).toHaveText("Survive · totem when you're ready");
  await setLang(page, 'fr');
  expect(errors).toEqual([]);
});

// test de soutien (pas un scénario de la spec) : la faux se voit, et le budget d'appels de dessin tient
test('la faux se voit, d’une à trois faux, dans le budget d’appels de dessin', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 5);
  await calm(page);
  for (let n = 1; n <= 3; n++) {
    await page.evaluate((n) => {
      const g = (window as any).__game,
        w = g.world;
      for (const k of Object.keys(w.weapons)) delete w.weapons[k];
      g.debug.give('faux', 4);
      w.wmods.faux[3] = n - 1; // la ligne « +1 faux »
      g.debug.upgrade('faux', 0); // stats recalculées
      w.enemyCount = 0;
      g.debug.spawn(0, 10, 2.6); // une ronde de monstres à portée
      w.player.dirX = 0;
      w.player.dirZ = 1;
    }, n);
    expect(await page.evaluate(() => (window as any).__game.world.wstats.faux.n)).toBe(n);
    await page.waitForFunction((n) => (window as any).__game.scene.scytheW.mesh.count === n, n, {
      timeout: 15_000,
      polling: 16,
    });
    await page.evaluate(() => (window as any).__game.debug.speed(0)); // figé en plein balayage
    await page.waitForTimeout(150);
    const calls = await page.evaluate(() => (window as any).__game.renderer.info.render.calls as number);
    expect(calls, 'appels de dessin').toBeLessThanOrEqual(info.project.name === 'mobile' ? 40 : 80);
    await shot(page, `faux-${n}`, info.project.name);
    await page.evaluate(() => (window as any).__game.debug.speed(1));
    await page.waitForTimeout(400);
  }
  // une rafale d'orbes : une Orbe à 5 projectiles sur une élite et un groupe, figée pendant la rafale
  await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    for (const k of Object.keys(w.weapons)) delete w.weapons[k];
    g.debug.give('orbe', 5);
    w.wmods.orbe[2] = 4; // « +1 projectile » × 4
    g.debug.upgrade('orbe', 0);
    w.enemyCount = 0;
    g.debug.elite(2, 5, 0, 1e6);
    g.debug.spawn(0, 6, 9);
  });
  await page.waitForFunction(
    () => {
      const w = (window as any).__game.world;
      let n = 0;
      for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === 0) n++;
      return n >= 3;
    },
    null,
    { timeout: 15_000, polling: 16 },
  );
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(150);
  await shot(page, 'rafale-orbe', info.project.name);
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  expect(errors).toEqual([]);
});

// tests de soutien (décision 5 et relecture) : la fenêtre passe après une carte de niveau ouverte au même pas, et une
// partie dont la fenêtre est ouverte s'enregistre quand l'appli passe en arrière-plan
test('la fenêtre attend la carte de niveau ouverte au même pas que la mort du boss', async ({ page, hasTouch }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await unseen(page, PORTAL);
  await startRun(page, 3);
  await calm(page);
  await page.evaluate(() => {
    const G = (window as any).__game;
    const T = G.world.totem;
    G.debug.teleport(T.x, T.z);
    T.charge = 2.9;
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1, null, { timeout: 20_000 });
  // au pas suivant, le Halo tue le boss (PV presque nuls, collé au héros, impulsion prête) et une montée de niveau
  // attend : la mort du boss (portail, fenêtre) et la carte de niveau tombent au même pas
  await page.evaluate(() => {
    const G = (window as any).__game,
      w = G.world;
    G.debug.teleport(w.totem.x + 7, w.totem.z);
    const b = w.enemies[w.bossIndex];
    b.hp = 0.001;
    b.x = b.px = w.player.x + 1;
    b.z = b.pz = w.player.z;
    w.weapons.aura = 1;
    w.wstate.auraT = 0;
    w.pending = 1;
  });
  await expect(page.locator('#levelup')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#info')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.world.portal.open)).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.guide.win)).toBe(1 << 4); // la fenêtre attend
  await page.waitForTimeout(500);
  await expect(page.locator('#info')).toBeHidden();
  // la carte choisie (doigt ou touche 1), la fenêtre s'ouvre
  if (hasTouch) await page.locator('#cards .card').first().tap();
  else await page.keyboard.press('Digit1');
  for (let i = 0; i < 10 && (await app(page)) === 'levelup'; i++) {
    // le coffre du boss a pu ajouter un choix : on prend aussi la première carte
    if (hasTouch) await page.locator('#cards .card').first().tap();
    else await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#info')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#infoTitle')).toHaveText('Le portail est ouvert !');
  await gotIt(page, hasTouch);
  expect(errors).toEqual([]);
});

test('une partie dont la fenêtre est ouverte s’enregistre en arrière-plan', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await unseen(page, OVERTIME);
  await startRun(page);
  await calm(page);
  await page.evaluate(() => (window as any).__game.debug.stageTime(598));
  await untilInfo(page);
  const t = await page.evaluate(() => (window as any).__game.world.t as number);
  // l'appli passe en arrière-plan, fenêtre ouverte : la partie est écrite sur l'appareil
  await page.evaluate(() => {
    localStorage.removeItem('ruee-run');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('ruee-run');
    return raw ? (JSON.parse(raw) as { snap: { fields: { t: number } } }).snap.fields.t : null;
  });
  expect(saved).not.toBeNull();
  expect(saved).toBeCloseTo(t, 6);
  expect(await app(page)).toBe('info'); // la fenêtre reste ouverte (le jeu y est déjà en pause)
  expect(errors).toEqual([]);
});
