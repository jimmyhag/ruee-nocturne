// 1.37.1 (retour de Jimmy) : après une pause, le héros garde son élan tant que le joueur n'a pas repris la main ;
// avant, au doigt (on lève le pouce pour toucher une carte) ou au clavier (touche relâchée pendant la pause), il
// restait planté à la reprise.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, player, startRun } from './helpers';

async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
  });
}

test('pause puis reprise sans rien tenir : le héros continue dans sa direction', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calm(page);
  if (hasTouch) {
    // pouce sur le joystick vers la droite, pause, pouce levé (comme pour toucher le menu), reprise
    const cdp = await page.context().newCDPSession(page);
    const vp = page.viewportSize()!;
    const x0 = Math.round(vp.width * 0.25),
      y0 = Math.round(vp.height * 0.6);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }],
      });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);
    // pause par un autre doigt, le pouce toujours posé sur le joystick
    await page.evaluate(() => document.getElementById('pauseBtn')!.click());
    await expect(page.locator('#pause')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('#resumeBtn').tap();
  } else {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toBeVisible();
    await page.keyboard.up('KeyD'); // touche relâchée pendant la pause
    await page.keyboard.press('Escape');
  }
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const a = await player(page);
  await page.waitForTimeout(900);
  const b = await player(page);
  expect(b.x, 'toujours en mouvement après la reprise').toBeGreaterThan(a.x + 0.5);
  expect(errors).toEqual([]);
});
