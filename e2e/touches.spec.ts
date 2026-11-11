// 1.40.0 (demande de Jimmy) : touches du clavier configurables dans les réglages (PC). Sur un téléphone sans clavier,
// le réglage n'apparaît pas.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const sliding = (page: Page) => page.evaluate(() => (window as any).__game.world.player.sliding as boolean);
const keyBtn = (page: Page, act: string) => page.locator(`#keygrid [data-act="${act}"]`);

test('PC : changer la touche de glissade ; la nouvelle marche, l’ancienne plus ; affichée en jeu et gardée', async ({
  page,
  hasTouch,
}, info) => {
  test.skip(hasTouch, 'projet PC');
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#keybinds')).toBeVisible();
  await expect(keyBtn(page, 'slide')).toHaveText('C');
  await expect(keyBtn(page, 'jump')).toHaveText('Espace');
  // clic, puis la nouvelle touche
  await keyBtn(page, 'slide').click();
  await expect(keyBtn(page, 'slide')).toHaveText(/Appuie/);
  await page.keyboard.press('KeyV');
  await expect(keyBtn(page, 'slide')).toHaveText('V');
  await expect(page.locator('#keysMsg')).toContainText('Glissade');
  // une touche réservée est refusée, on reste à l'écoute ; Échap annule
  await keyBtn(page, 'map').click();
  await page.keyboard.press('KeyR');
  await expect(page.locator('#keysMsg')).toContainText(/réservée/);
  await expect(keyBtn(page, 'map')).toHaveText(/Appuie/);
  await page.keyboard.press('Escape');
  await expect(keyBtn(page, 'map')).toHaveText('M');
  await expect(page.locator('#settings')).toBeVisible(); // Échap a annulé l'écoute, pas fermé les réglages
  await page.screenshot({ path: `shots/${info.project.name}-touches.png` });
  await page.locator('#settingsBackBtn').click();

  // en jeu : le bandeau montre V ; V glisse, C ne fait plus rien
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  await expect(page.locator('#keys [data-key="slide"]')).toHaveText('V');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(300);
  expect(await sliding(page)).toBe(false);
  await page.keyboard.down('KeyV');
  await page.waitForFunction(() => (window as any).__game.world.player.sliding === true, null, { timeout: 2000 });
  await page.keyboard.up('KeyV');
  await page.keyboard.up('KeyD');

  // gardé après rechargement (réglage local)
  expect(await page.evaluate(() => (window as any).__game.meta.settings.keys.slide.c)).toBe('KeyV');
  await page.waitForTimeout(400); // écriture de la sauvegarde
  await openGame(page);
  await page.locator('#settingsBtn').click();
  await expect(keyBtn(page, 'slide')).toHaveText('V');
  expect(errors).toEqual([]);
});

test('PC : une touche déjà prise échange les deux actions ; « Touches par défaut » remet tout', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'projet PC');
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.locator('#settingsBtn').click();
  // saut sur C : la glissade récupère Espace
  await keyBtn(page, 'jump').click();
  await page.keyboard.press('KeyC');
  await expect(keyBtn(page, 'jump')).toHaveText('C');
  await expect(keyBtn(page, 'slide')).toHaveText('Espace');
  await expect(page.locator('#keysMsg')).toContainText('Glissade');
  await page.locator('#settingsBackBtn').click();
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => (window as any).__game.world.player.y > 0.2, null, { timeout: 2000 }); // C saute
  // carte sur une autre touche : l'ancienne n'ouvre plus rien
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, keys: { map: { c: 'KeyB', k: 'b' } } } });
  });
  await startRun(page, 2);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('play');
  await page.keyboard.press('KeyB');
  await page.waitForFunction(() => (window as any).__game.app === 'map');
  await page.keyboard.press('KeyB');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // retour aux touches par défaut
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.evaluate(() => (window as any).__game.debug.kill?.());
  await openGame(page);
  await page.locator('#settingsBtn').click();
  await expect(keyBtn(page, 'map')).toHaveText('B');
  await page.locator('#keysResetBtn').click();
  await expect(keyBtn(page, 'map')).toHaveText('M');
  await expect(keyBtn(page, 'slide')).toHaveText('C');
  expect(await page.evaluate(() => (window as any).__game.meta.settings.keys)).toEqual({});
  expect(errors).toEqual([]);
});

test('téléphone : pas de réglage des touches (aucun clavier), le reste des réglages est là', async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, 'projet mobile');
  await openGame(page);
  await page.locator('#settingsBtn').tap();
  await expect(page.locator('#setLangBtn')).toBeVisible();
  await expect(page.locator('#keybinds')).toBeHidden();
});

// 1.45.3 (retour de Jimmy) : en bougeant, un clic droit ouvrait le menu du navigateur ; à sa fermeture, une direction
// restait « tenue » (les relâchements de touches n'arrivent pas pendant que le menu est ouvert) et annulait l'opposée.
test('clic droit et clic milieu : pas de menu du navigateur dans le jeu, le déplacement continue', async ({
  page,
  hasTouch,
}) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // au menu comme en partie ; un champ de texte garde son menu (coller un pseudo, un code de sauvegarde)
  const fire = (sel: string | null, type: string, button: number) =>
    page.evaluate(
      ([sel, type, button]) => {
        let el: Element | null = sel ? document.querySelector(sel as string) : null;
        if (!sel) {
          el = document.createElement('input');
          document.body.appendChild(el);
        }
        const prevented = !el!.dispatchEvent(
          new MouseEvent(type as string, { bubbles: true, cancelable: true, button: button as number }),
        );
        if (!sel) el!.remove();
        return prevented;
      },
      [sel, type, button] as const,
    );
  expect(await fire('#playBtn', 'contextmenu', 2), 'menu bloqué sur un bouton du menu').toBe(true);
  expect(await fire(null, 'contextmenu', 2), 'menu gardé dans un champ de texte').toBe(false);
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  expect(await fire('#c', 'contextmenu', 2), 'menu bloqué sur le jeu').toBe(true);
  expect(await fire('#c', 'mousedown', 1), 'défilement automatique du clic milieu bloqué').toBe(true);
  expect(await fire('#c', 'mousedown', 0), 'clic gauche laissé tel quel').toBe(false);
  if (!hasTouch) {
    // touche tenue, clic droit, puis la direction opposée : elle répond (aucune touche coincée)
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(300);
    await page.mouse.click(640, 400, { button: 'right' });
    await page.keyboard.up('KeyA');
    const x0 = await page.evaluate(() => (window as any).__game.world.player.x as number);
    await page.keyboard.down('KeyD');
    await page.waitForFunction((x) => (window as any).__game.world.player.x > x + 0.5, x0, { timeout: 15_000 });
    await page.keyboard.up('KeyD');
  }
  expect(errors).toEqual([]);
});
