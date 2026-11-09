// Phase 36 : son enregistré. Rien n'est demandé avant le premier geste ; après Jouer, la planche de bruitages est
// décodée et la musique de partie tourne ; sans réseau pour /audio/, la partie se joue avec les sons synthétisés ;
// les curseurs Effets et Musique changent les gains et restent après rechargement.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, isIgnorableConsoleError, openGame } from './helpers';

const audioState = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (window as any).__game.audio as { ctx: string; samples: boolean; music: string; sfx: number; musicGain: number },
  );

test('aucune requête audio avant le premier geste ; après Jouer, bruitages décodés et musique de partie', async ({
  page,
  hasTouch,
}) => {
  const errors = collectConsoleErrors(page);
  const audioReq: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/audio/')) audioReq.push(r.url());
  });
  await openGame(page);
  await page.waitForTimeout(800);
  expect(audioReq, 'rien avant un geste').toEqual([]);
  if (hasTouch) await page.locator('#playBtn').tap();
  else await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction(() => (window as any).__game.audio.samples === true, null, { timeout: 10_000 });
  expect((await audioState(page)).ctx).toBe('running');
  expect(audioReq.some((u) => u.includes('/audio/sfx.mp3'))).toBe(true);
  // le geste était sur Jouer : la musique du menu n'est pas téléchargée pour rien
  expect(audioReq.some((u) => u.includes('/audio/menu.mp3'))).toBe(false);
  // la musique de partie est lancée (lecture refusée sans vrai son dans Chromium headless : on vérifie la demande)
  await page.waitForFunction(() => (window as any).__game.audio.musicGain > 0);
  expect(audioReq.some((u) => u.includes('/audio/game.mp3'))).toBe(true);
  await page.waitForTimeout(1500); // quelques tirs, coups et kills joués depuis la planche
  expect(errors.filter((e) => !isIgnorableConsoleError(e))).toEqual([]);
});

test('premier geste hors de Jouer (réglages) : contexte audio actif, musique du menu demandée, pas celle de partie', async ({
  page,
  hasTouch,
}) => {
  const audioReq: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/audio/')) audioReq.push(r.url());
  });
  await openGame(page);
  // au doigt, c'est le relâchement (pointerup) qui active la page : un tap complet doit suffire
  if (hasTouch) await page.locator('#settingsBtn').tap();
  else await page.locator('#settingsBtn').click();
  await page.waitForFunction(() => (window as any).__game.audio.ctx === 'running', null, { timeout: 10_000 });
  await expect.poll(() => audioReq.some((u) => u.includes('/audio/menu.mp3'))).toBe(true);
  expect(audioReq.some((u) => u.includes('/audio/game.mp3'))).toBe(false);
});

test('sans réseau pour /audio/, la partie se joue avec les sons synthétisés', async ({ page }) => {
  await page.route('**/audio/**', (r) => r.abort());
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // la partie avance (machine lente en CI : on attend la condition plutôt qu'une durée fixe)
  await page.waitForFunction(() => (window as any).__game.world.t > 1, null, { timeout: 20_000 });
  expect((await audioState(page)).samples).toBe(false);
  // l'échec de chargement est un avertissement, jamais une erreur
  expect(errors.filter((e) => !isIgnorableConsoleError(e) && !/audio|sfx|net::ERR/i.test(e))).toEqual([]);
});

test('réglages : curseurs Effets et Musique, appliqués et gardés après rechargement', async ({ page }) => {
  await openGame(page);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#sfxVol')).toBeVisible();
  await page.locator('#sfxVol').fill('40');
  await page.locator('#musicVol').fill('0');
  await page.locator('#musicVol').dispatchEvent('change');
  await page.locator('#sfxVol').dispatchEvent('change');
  const s = await audioState(page);
  expect(s.sfx).toBeCloseTo(0.42 * 0.4, 3);
  expect(s.musicGain).toBe(0);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const meta = await page.evaluate(() => (window as any).__game.meta.settings);
  expect(meta.sfxVol).toBeCloseTo(0.4, 3);
  expect(meta.musicVol).toBe(0);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#sfxVol')).toHaveValue('40');
  await expect(page.locator('#musicVol')).toHaveValue('0');
});
