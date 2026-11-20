// Le Cœur de la Nuit (docs/specs/boss-final.md) : l'interface, sur PC et sur téléphone, un test par scénario d'interface
// (titres en anglais) : bannières de phase, invulnérabilité visible, zone sûre, éclipse, écrans de fin. La simulation est
// dans src/sim/final.test.ts. Captures de chaque phase dans shots/, et dans docs/captures/boss-final/ avec CAPTURES=1
// (téléphone), relues pour la livraison. Budget d'appels de dessin (mobile ≤ 40) mesuré dans l'Arène, éclipse comprise.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const FR = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8')) as Record<string, string>;

/** Capture dans shots/ ; au téléphone avec CAPTURES=1, aussi dans docs/captures/boss-final/. */
async function shot(page: Page, project: string, name: string): Promise<void> {
  await page.screenshot({ path: `shots/${project}-boss-final-${name}.png` });
  if (process.env.CAPTURES === '1' && project === 'mobile')
    await page.screenshot({ path: `docs/captures/boss-final/${name}.jpg`, type: 'jpeg', quality: 70 });
}
/** Note chaque texte de bannière (une autre peut prendre sa place avant qu'on la lise). */
async function recordBanners(page: Page): Promise<void> {
  await page.evaluate(() => {
    const b = document.getElementById('banner')!;
    const seen: string[] = ((window as any).__banners = []);
    new MutationObserver(() => seen.push(b.textContent ?? '')).observe(b, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}
const banners = (page: Page): Promise<string> =>
  page.evaluate(() => ((window as any).__banners as string[]).join(' | '));
/** Une partie, héros increvable et sans montée de niveau, le panneau de perf caché. */
async function hero(page: Page, variant = 3): Promise<void> {
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, variant);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
  });
  await recordBanners(page);
}
/** Dans l'Arène, le boss sorti (comme après le portail rouge). */
async function arena(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.arena();
    g.world.chestCount = 0; // le coffre du boss du monde 3 ouvrirait une feuille d'objets
  });
  await page.waitForFunction(() => (window as any).__game.world.finalPhase === 1, null, { timeout: 20_000 });
}
/** Le boss final passe à la phase `p` (la suivante), comme sous les coups : le jeu change de phase au pas suivant. */
async function nextPhase(page: Page, p: number): Promise<void> {
  await page.evaluate(() => (window as any).__game.debug.finalPhase());
  await page.waitForFunction((n) => (window as any).__game.world.finalPhase === n, p, { timeout: 10_000 });
}
const drawCalls = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return (window as any).__game.renderer.info.render.calls as number;
  });

test('Beating the world 3 boss opens the way to the Arena', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await hero(page);
  // au monde 3, le boss du totem tombe : « Monde 3 vaincu ! », le chrono tombe à 0, le portail est rouge
  await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    g.debug.nextStage();
    g.debug.nextStage();
    w.stageT = 200;
    w.survivalNext = 99; // pas de boss de survie pendant le test
    g.debug.teleport(w.totem.x, w.totem.z);
    w.totem.charge = 99; // le totem s'éveille au pas suivant
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1);
  await page.evaluate(() => (window as any).__game.debug.killBoss());
  await expect.poll(() => banners(page), { timeout: 10_000 }).toContain(FR['banner.cleared']);
  await expect.poll(() => banners(page)).toContain(FR['banner.timeUpArena']);
  const w3 = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { cleared: w.cleared, portal: w.portal.open, over: w.overT >= 0, stage: w.stage, mode: w.mode };
  });
  expect(w3).toEqual({ cleared: true, portal: true, over: true, stage: 2, mode: 0 });
  await expect(page.locator('#victory')).toBeHidden(); // plus de feuille de victoire à ce moment
  await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world;
    w.enemyCount = 0; // la horde de la prolongation retirée pour la capture
    w.spawnAcc = -1e9;
    w.nextWave = w.nextElite = 1e9;
    g.debug.teleport(w.totem.x, w.totem.z + 5.5); // le portail au-dessus du héros, à l'écran
  });
  await page.waitForTimeout(400);
  await shot(page, info.project.name, 'portail-rouge');
  // y entrer : l'Arène, puis le Cœur de la Nuit au centre
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    (window as any).__game.debug.teleport(w.totem.x, w.totem.z);
  });
  await page.waitForFunction(() => (window as any).__game.world.stage === 3, null, { timeout: 15_000 });
  await expect.poll(() => banners(page)).toContain(FR['banner.arena']);
  await expect(page.locator('#stageLbl')).toHaveText(FR['hud.arena']);
  await page.waitForFunction(() => (window as any).__game.world.finalPhase === 1, null, { timeout: 15_000 });
  await expect.poll(() => banners(page)).toContain(FR['banner.heart']);
  await expect(page.locator('#bossbar')).toBeVisible();
  await expect(page.locator('#bossbar')).toHaveClass(/final/);
  await expect(page.locator('#bossname')).toHaveText(FR['boss.heart'].toUpperCase());
  await expect(page.locator('#bossbar s')).toHaveCount(3);
  await page.waitForTimeout(600);
  await shot(page, info.project.name, 'phase1-souvenir');
  expect(await drawCalls(page)).toBeLessThanOrEqual(40);
  expect(errors).toEqual([]);
});

test('The final boss has four phases', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  await hero(page, 5);
  await arena(page);
  // phase 2 : « Brise les sceaux ! », barre grise « invulnérable », quatre stèles, un coup ne fait rien
  await nextPhase(page, 2);
  await expect.poll(() => banners(page)).toContain(FR['final.phase.2']);
  await expect(page.locator('#bossbar')).toHaveClass(/shield/);
  await expect(page.locator('#bossname')).toContainText('INVULNÉRABLE');
  const blocked = await page.evaluate(() => {
    const g = (window as any).__game,
      w = g.world,
      i = w.bossIndex,
      hp = w.enemies[i].hp;
    w.finalPause = 0; // la pause passée : les sceaux le protègent encore
    g.debug.killBoss();
    let seals = 0;
    for (let k = 0; k < w.enemyCount; k++) if (w.enemies[k].role === 3) seals++;
    return { same: w.enemies[i].hp === hp, seals };
  });
  expect(blocked).toEqual({ same: true, seals: 4 });
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    (window as any).__game.debug.teleport(0, 8); // les sceaux et le boss dans le champ
    w.enemies[w.bossIndex].timer = 99; // pas d'attaque pendant la capture
  });
  await page.waitForTimeout(500);
  await shot(page, info.project.name, 'phase2-sceaux');
  // phase 3 : l'éclipse, « Trouve le vrai ! », deux doubles ; l'Arène s'assombrit (moins en effets réduits)
  await nextPhase(page, 3);
  await expect.poll(() => banners(page)).toContain(FR['final.phase.3']);
  await expect.poll(() => banners(page)).toContain(FR['final.phase.3.sub']);
  await expect(page.locator('body')).toHaveClass(/eclipse/);
  // la pause du changement de phase passée (1,5 s de jeu : plus de temps réel sur un runner lent), il redevient vulnérable
  await page.waitForFunction(() => (window as any).__game.world.finalPause <= 0, null, { timeout: 20_000 });
  await expect(page.locator('#bossbar')).not.toHaveClass(/shield/);
  await page.waitForFunction(() => (window as any).__game.scene.eclipse > 0.8, null, { timeout: 10_000 });
  const decoys = await page.evaluate(() => {
    const w = (window as any).__game.world;
    let n = 0;
    for (let k = 0; k < w.enemyCount; k++) if (w.enemies[k].alive && w.enemies[k].role === 2) n++;
    return n;
  });
  expect(decoys).toBe(2);
  await page.waitForTimeout(400);
  await shot(page, info.project.name, 'phase3-eclipse');
  expect(await drawCalls(page)).toBeLessThanOrEqual(40); // budget mobile (PLAN §4.3), éclipse et doubles compris
  // phase 4 : la fureur, « Cours à la lumière ! », puis le Jugement : l'Arène rouge, la zone sûre
  await nextPhase(page, 4);
  await expect.poll(() => banners(page)).toContain(FR['final.phase.4']);
  await page.waitForFunction(() => (window as any).__game.world.judgeT > 0.7, null, { timeout: 20_000 });
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  // la zone sûre est dessinée : sa colonne de lumière et ses anneaux (écrivains des lieux), l'Arène rouge (télégraphes)
  const drawn = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s = (window as any).__game.scene;
    return {
      beams: s.beamW.mesh.count as number,
      rings: s.shrineGlowW.mesh.count as number,
      red: s.zoneFillW.mesh.count as number,
    };
  });
  expect(drawn.beams).toBeGreaterThanOrEqual(1);
  expect(drawn.rings).toBeGreaterThanOrEqual(2);
  expect(drawn.red).toBeGreaterThanOrEqual(1);
  await shot(page, info.project.name, 'phase4-jugement');
  expect(await drawCalls(page)).toBeLessThanOrEqual(40);
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  expect(errors).toEqual([]);
});

test('Dying in the Arena keeps the world 3 victory', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await hero(page, 6);
  await arena(page);
  await nextPhase(page, 2);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await page.waitForFunction(() => (window as any).__game.app === 'over', null, { timeout: 15_000 });
  await expect(page.locator('#oTitle')).toHaveText(FR['over.heartDead']);
  await expect(page.locator('#oStage')).toHaveText(FR['over.heartPhase'].replace('{n}', '2'));
  const st = await page.evaluate(() => (window as any).__game.meta.stats);
  expect([st.wins, st.hearts, st.bestStage]).toEqual([1, 0, 4]); // la victoire du monde 3, pas celle du boss final
  expect(errors).toEqual([]);
});

test('Beating the Heart of the Night opens the corrupted endless world', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await hero(page, 8);
  await arena(page);
  await page.evaluate(() => (window as any).__game.debug.win());
  await page.waitForFunction(() => (window as any).__game.app === 'victory', null, { timeout: 15_000 });
  await expect(page.locator('#vText')).toHaveText(FR['victory.text']);
  await shot(page, info.project.name, 'victoire');
  // continuer : le monde infini (la carte du monde 3), avec des corrompus
  if (info.project.name === 'mobile') await page.locator('#vContinue').tap();
  else await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const w = await page.evaluate(() => {
    const x = (window as any).__game.world;
    return { endless: x.endless, corrupt: x.endlessCorrupt, stage: x.stage, enemies: x.enemyCount };
  });
  expect(w).toEqual({ endless: true, corrupt: true, stage: 2, enemies: 0 });
  await expect(page.locator('#stageLbl')).toHaveText(FR['hud.endless']);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await page.waitForFunction(() => (window as any).__game.app === 'over', null, { timeout: 15_000 });
  await expect(page.locator('#oUnlocked')).toContainText(FR['ach.aube.name']);
  const st = await page.evaluate(() => (window as any).__game.meta.stats);
  expect([st.wins, st.hearts]).toEqual([1, 1]);
  expect(errors).toEqual([]);
});
