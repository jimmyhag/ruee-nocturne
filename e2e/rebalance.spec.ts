// Phase 43 (grand rééquilibrage, demande de Jimmy) : relance du marchand qui double, objet au plafond marqué « max »,
// dernier passage du marchand en monde infini, nouvelles attaques des boss et rage (captures à lire).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.survivalNext = 99;
  });
}
async function press(page: Page, hasTouch: boolean, key: string, sel: string): Promise<void> {
  if (hasTouch) await page.locator(sel).tap();
  else await page.keyboard.press(key);
}

test('marchand : la relance coûte 60 or puis double ; un objet au plafond est marqué « max »', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 8);
  await calm(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.gold = 5000;
    for (let k = 0; k < 7; k++) g.debug.item('amulette'); // commun : 5 exemplaires au plus
    g.debug.item('phenix');
    g.debug.merchant(6);
    g.debug.teleport(g.world.merchant.x, g.world.merchant.z);
  });
  await page.waitForSelector('#merchant:not([hidden])');
  expect(await page.evaluate(() => (window as any).__game.world.items[29])).toBe(5); // It.Amulette
  await expect(page.locator('#mReroll')).toHaveText(/60/);
  await press(page, hasTouch, 'KeyR', '#mReroll');
  await page.waitForFunction(() => (window as any).__game.world.merchant.rerolls === 1);
  await expect(page.locator('#mReroll')).toHaveText(/120/);
  await press(page, hasTouch, 'KeyR', '#mReroll');
  await expect(page.locator('#mReroll')).toHaveText(/240/);
  // l'Amulette, au plafond, ne sort plus chez le marchand
  const keys = await page.evaluate(() => (window as any).__game.world.offers.map((c: any) => c.key));
  expect(keys).not.toContain('amulette');
  await page.screenshot({ path: `shots/${info.project.name}-p43-marchand.png` });
  await press(page, hasTouch, 'Escape', '#mLeave');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // barre d'équipement : « ×5 » en couleur d'accent, libellé « (max) »
  const max = page.locator('#gear .git b.max');
  await expect(max).toHaveCount(1);
  await expect(max).toHaveText('×5');
  await expect(page.locator('#gear .git:has(b.max)')).toHaveAttribute('aria-label', /max/);
  expect(errors).toEqual([]);
});

test('monde infini : le marchand passe deux fois, annonce son dernier passage, puis ne revient plus', async ({
  page,
  hasTouch,
}) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calm(page);
  await page.evaluate(() => (window as any).__game.debug.win());
  await expect(page.locator('#victory')).toBeVisible({ timeout: 10_000 });
  await press(page, hasTouch, 'Enter', '#vContinue');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const visits = () => page.evaluate(() => (window as any).__game.world.merchant.endlessVisits as number);
  const leave = () =>
    page.evaluate(() => {
      const w = (window as any).__game.world;
      w.merchant.active = false;
      w.nextEndlessBoss = 1e9; // pas de vague de boss : on observe le marchand
    });
  await leave();
  // premier passage à 1:15
  await page.evaluate(() => (window as any).__game.debug.endlessTime(74.5));
  await expect(page.locator('#banner')).toContainText(/marchand est arrivé|merchant/i, { timeout: 15_000 });
  expect(await visits()).toBe(1);
  await leave();
  // second et dernier passage à 3:45 : annoncé
  await page.evaluate(() => (window as any).__game.debug.endlessTime(224.5));
  await expect(page.locator('#banner')).toContainText(/Dernier passage|last visit/i, { timeout: 15_000 });
  expect(await visits()).toBe(2);
  // dans l'échoppe, la note le dit aussi
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.merchant.x, g.world.merchant.z);
  });
  await page.waitForSelector('#merchant:not([hidden])');
  await expect(page.locator('#mNote')).toContainText(/dernier passage|last visit/i);
  await press(page, hasTouch, 'Escape', '#mLeave');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await leave();
  // plus jamais ensuite
  await page.evaluate(() => (window as any).__game.debug.endlessTime(374.5));
  await page.waitForFunction(() => (window as any).__game.world.endlessT > 376, null, { timeout: 20_000 });
  expect(await visits()).toBe(2);
  expect(await page.evaluate(() => (window as any).__game.world.merchant.active)).toBe(false);
  expect(errors).toEqual([]);
});

// Chaque boss dans sa nouvelle attaque : capture lue à la main (CLAUDE.md : ne rien affirmer sans l'avoir regardé)
const BOSSES: { name: string; type: number; dist: number; arm: string; wait: string }[] = [
  // Gardien : charge immédiate, on capture quand les cercles du sillage sont au sol
  { name: 'gardien-sillage', type: 3, dist: 9, arm: 'e.aim = 1e9; e.timer = 0;', wait: 'zone' },
  // Essaim-mère : salve en éventail
  { name: 'essaim-salve', type: 6, dist: 9, arm: 'e.timer = 1e9; e.t2 = 0.01; e.hp = e.max * 0.4;', wait: 'spit' },
  // Colosse : croix de la phase 2 (deuxième attaque de cercles)
  {
    name: 'colosse-croix',
    type: 7,
    dist: 11,
    arm: 'e.t2 = 1e9; e.hp = e.max * 0.4; e.combo = 1; e.timer = 0.01;',
    wait: 'zone',
  },
  // Colosse : onde de choc au contact
  { name: 'colosse-onde', type: 7, dist: 5, arm: 'e.timer = 1e9; e.t2 = 0.01;', wait: 'ring' },
];
for (const B of BOSSES)
  test(`boss : ${B.name} (capture)`, async ({ page }, info) => {
    const errors = collectConsoleErrors(page);
    await openGame(page);
    await startRun(page);
    await calm(page);
    await page.evaluate(
      ([type, dist, arm]) => {
        const g = (window as any).__game;
        const w = g.world;
        for (let i = 0; i < w.enemyCount; i++) w.enemies[i].hp = 0; // la horde de départ
        g.debug.spawn(type, 1, dist);
        const e = w.enemies[w.enemyCount - 1];
        e.hp = e.max = 1e9;
        e.spd = 0.0001; // presque immobile : cadrage stable
        // au-dessus du joueur à l'écran (−z) : le boss et son attaque sont dans le cadre
        e.x = e.px = w.player.x;
        e.z = e.pz = w.player.z - (dist as number);
        (document.getElementById('perf') as HTMLElement).hidden = true;
        new Function('e', arm as string)(e);
      },
      [B.type, B.dist, B.arm] as const,
    );
    // on attend que le danger existe (ShotKind : 0 crachat, 1 cercle au sol, 3 onde)
    await page.waitForFunction(
      ([kind, min]) => {
        const w = (window as any).__game.world;
        let n = 0;
        for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === kind) n++;
        return n >= min;
      },
      (B.wait === 'zone' ? [1, 3] : B.wait === 'spit' ? [0, 5] : [3, 1]) as [number, number], // sillage : 3 cercles au plus à la fois (0,7 s de vie, un tous les 0,25 s)
      { timeout: 20_000 },
    );
    await page.waitForTimeout(B.wait === 'spit' ? 350 : 250);
    await page.screenshot({ path: `shots/${info.project.name}-p43-${B.name}.png` });
    expect(errors).toEqual([]);
  });

test('rage : un boss en vie depuis longtemps enrage (bannière), il devient rouge', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calm(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    for (let i = 0; i < w.enemyCount; i++) w.enemies[i].hp = 0;
    g.debug.spawn(7, 1, 9);
    const e = w.enemies[w.enemyCount - 1];
    e.hp = e.max = 1e9;
    e.spd = 0.0001;
    e.x = e.px = w.player.x;
    e.z = e.pz = w.player.z - 7;
    (document.getElementById('perf') as HTMLElement).hidden = true;
    e.timer = e.t2 = 1e9;
    w.totemBossId = e.id; // la rage est réservée aux boss du totem et du monde infini
    e.age = 1e4; // bien au-delà de BOSS.enrage.after
  });
  await expect(page.locator('#banner')).toContainText(/enrage/i, { timeout: 15_000 });
  expect(
    await page.evaluate(() => {
      const w = (window as any).__game.world;
      for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].type === 7) return w.enemies[i].enraged;
      return null;
    }),
  ).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/${info.project.name}-p43-rage.png` });
  expect(errors).toEqual([]);
});
