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

  test('le bouton Perf de la pause affiche et masque l’onglet perf (parité F3)', async ({ page }) => {
    await page.goto('/'); // sans ?debug : l'onglet est masqué au départ, comme pour un joueur
    // phase 14 : premier lancement, l'aide « Comment jouer » s'ouvre d'abord ; on la ferme comme un joueur
    await expect(page.locator('#help')).toBeVisible();
    await page.locator('#helpBackBtn').tap();
    await page.locator('#playBtn').tap();
    await page.waitForFunction(() => document.getElementById('hud')?.hidden === false);
    await page.locator('#pauseBtn').tap();
    await expect(page.locator('#pause')).toBeVisible();
    await expect(page.locator('#perf')).toBeHidden();
    await page.locator('#perfBtn').tap();
    await expect(page.locator('#perf')).toBeVisible();
    await expect(page.locator('#perfBtn')).toHaveText('Perf : affichée');
    await page.locator('#perfBtn').tap();
    await expect(page.locator('#perf')).toBeHidden();
  });

  test('mode gaucher : les boutons SAUT et SORT passent à gauche et restent utilisables', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => (window as any).__game.setMeta({ version: 3, settings: { lefty: true } }));
    await expect(page.locator('body')).toHaveClass(/lefty/);
    await page.locator('#playBtn').tap();
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    const vp = page.viewportSize()!;
    const box = await page.locator('#btnJump').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width / 2, 'bouton SAUT dans la moitié gauche').toBeLessThan(vp.width / 2);
    await page.locator('#btnJump').tap();
    await page.waitForFunction(() => (window as any).__game.world.player.y > 0, null, { timeout: 2000 });
  });

  test('HUD « Grand » : l’anneau du joystick reste sous le doigt (le zoom ne touche pas #touch)', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => (window as any).__game.setMeta({ version: 3, settings: { hudScale: 1.2 } }));
    await page.locator('#playBtn').tap();
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    const cdp = await page.context().newCDPSession(page);
    const x0 = 120,
      y0 = 500;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    await page.waitForTimeout(100);
    const box = await page.locator('#stick').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - x0)).toBeLessThan(6);
    expect(Math.abs(box!.y + box!.height / 2 - y0)).toBeLessThan(6);
  });
});
