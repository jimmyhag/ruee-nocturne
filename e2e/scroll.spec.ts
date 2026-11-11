// Défilement tactile des écrans (retour de Jimmy sur iPhone : impossible de faire glisser les menus) : les écrans
// défilent au doigt, le jeu (canvas, joystick) reste verrouillé. Gestes synthétisés par CDP (Chromium).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

test.describe('défilement tactile', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'tactile seulement');

  /** Glissement du doigt vers le haut depuis (x, y) sur `dist` px (fait défiler vers le bas). Touches réelles via CDP :
   *  Input.synthesizeScrollGesture ne déclenche pas le défilement d'un conteneur dans Chromium headless. */
  async function swipeUp(page: Page, x: number, y: number, dist: number): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let d = 0; d <= dist; d += 20) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - d }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }

  test('les réglages, la boutique et les succès défilent au doigt quand ils dépassent l’écran', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 420 }); // fenêtre basse : chaque écran dépasse et doit défiler
    // 1.43.0 : trois écrans, trois gestes de 16 touches, chacune attend une image du menu (scène 3D derrière). Sous
    // SwiftShader le test prenait 53 s ici pour 60 s de limite, et expirait sur la CI au milieu d'un geste (1.42.1)
    test.setTimeout(180_000);
    await openGame(page);
    for (const [btn, screen, back] of [
      ['settingsBtn', 'settings', 'settingsBackBtn'],
      ['shopBtn', 'shop', 'shopBackBtn'],
      ['achBtn', 'achievements', 'achBackBtn'],
    ] as const) {
      await page.locator('#' + btn).click();
      const el = page.locator('#' + screen);
      await expect(el).toBeVisible();
      const over = await el.evaluate((s) => s.scrollHeight - s.clientHeight);
      expect(over, `${screen} dépasse et doit défiler`).toBeGreaterThan(40);
      // le haut du panneau est visible au départ (pas coupé par le centrage)
      expect(await el.evaluate((s) => s.scrollTop)).toBe(0);
      await page.screenshot({ path: `shots/mobile-${screen}-haut.png` });
      await swipeUp(page, 187, 380, 300);
      await expect.poll(() => el.evaluate((s) => s.scrollTop), { timeout: 3000 }).toBeGreaterThan(40);
      await page.screenshot({ path: `shots/mobile-${screen}-bas.png` });
      await page.locator('#' + back).click();
    }
    // phase 14 : l'accueil ne défile pas (overflow caché, pas de glissement possible). Pas de geste CDP ici : sur le
    // Chromium livré avec Playwright, Input.dispatchTouchEvent ne rend jamais la main sur cet écran non défilable
    // (le test expirait en CI, alors qu'il passe sur Chromium 153) ; la propriété CSS est ce qui garantit le comportement.
    const menu = page.locator('#menu');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((s) => getComputedStyle(s).overflowY)).toBe('hidden');
    expect(await menu.evaluate((s) => s.scrollTop)).toBe(0);
  });

  test('en jeu, glisser le doigt sur le canvas ne fait rien défiler', async ({ page }) => {
    await openGame(page);
    await startRun(page, 3);
    await swipeUp(page, 187, 500, 300);
    const scrolled = await page.evaluate(
      () => window.scrollY + document.documentElement.scrollTop + document.body.scrollTop,
    );
    expect(scrolled).toBe(0);
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
  });
});
