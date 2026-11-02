import { expect, test } from '@playwright/test';
import { openGame, player } from './helpers';

test.describe('tactile', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'projet mobile uniquement');

  test('le joystick fait bouger le joueur et SAUT le fait décoller', async ({ page }) => {
    await openGame(page);
    await page.locator('#playBtn').tap();
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    await expect(page.locator('#touch')).toBeVisible();

    const before = await player(page);

    // Joystick flottant : un doigt posé n'importe où hors des boutons, puis glissé vers la droite.
    // Playwright n'a pas de glissé tactile : on passe par le protocole Chrome (vrais événements touch).
    const cdp = await page.context().newCDPSession(page);
    const vp = page.viewportSize()!;
    const x0 = Math.round(vp.width * 0.25);
    const y0 = Math.round(vp.height * 0.6);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }],
      });
      await page.waitForTimeout(30);
    }
    await expect(page.locator('#stick')).toHaveClass(/on/);
    await page.waitForTimeout(700);
    const moved = await player(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(moved.x, 'le joueur avance vers la droite').toBeGreaterThan(before.x + 0.5);

    // SAUT
    await page.locator('#btnJump').tap();
    await page.waitForFunction(() => (window as any).__game.world.player.y > 0, null, { timeout: 2000 });
    const jumped = await player(page);
    expect(jumped.y).toBeGreaterThan(0);
  });
});
