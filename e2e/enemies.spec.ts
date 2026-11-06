// Phase 21 : ennemis animés par morphs instanciés (phase 26 : morts-vivants Quaternius HD). Le glTF remplace les silhouettes
// procédurales une fois chargé ; sans réseau pour /models, les silhouettes restent et la partie se joue.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

// type, nombre, distance (une seule instance : posée au nord du joueur, face à la caméra)
const GROUPS: [string, number, number, number][] = [
  ['spectre', 0, 8, 4],
  ['dard', 1, 6, 4],
  ['brute', 2, 4, 5],
  ['volant', 4, 5, 4],
  ['cracheur', 5, 4, 4],
  ['archer', 9, 4, 5],
  ['sorcier', 10, 4, 5],
  ['gardien', 3, 1, 4],
  ['essaim', 6, 1, 4],
  ['colosse', 7, 1, 4],
  ['faucheur', 8, 1, 4],
];

test('les morts-vivants remplacent les silhouettes : chaque type et chaque boss (captures)', async ({ page }, info) => {
  test.setTimeout(150_000);
  const p = info.project.name;
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'net' } }); // pas de repli « pixel » pendant les captures
    (document.getElementById('perf') as HTMLElement).hidden = true;
  });
  await startRun(page, 11);
  await page.waitForFunction(() => (window as any).__game.scene.enemyKind === 'gltf', null, { timeout: 20_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // pas d'écran de niveau pendant les captures
  });
  for (const [name, type, n, d] of GROUPS) {
    await page.evaluate(() => {
      const w = (window as any).__game.world;
      for (let i = 0; i < w.enemyCount; i++) w.enemies[i].alive = false;
    });
    await page.waitForTimeout(150);
    await page.evaluate(
      ([type, n, d]) => {
        const g = (window as any).__game,
          w = g.world,
          P = w.player;
        g.debug.spawn(type, n, d);
        if (n === 1)
          for (let i = 0; i < w.enemyCount; i++)
            if (w.enemies[i].alive) {
              w.enemies[i].x = w.enemies[i].px = P.x;
              w.enemies[i].z = w.enemies[i].pz = P.z - d;
            }
      },
      [type, n, d],
    );
    await page.waitForTimeout(700);
    await page.evaluate(() => (window as any).__game.debug.speed(0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: `shots/${p}-ennemi-${name}.png`, animations: 'disabled' });
    await page.evaluate(() => (window as any).__game.debug.speed(1));
  }
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('play');
  expect(errors).toEqual([]);
});

test('sans réseau pour /models, les ennemis gardent leurs silhouettes et la partie se joue', async ({ page }) => {
  await page.route('**/models/**', (r) => r.abort());
  await openGame(page);
  await startRun(page, 6);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__game.scene.enemyKind)).toBe('proc');
  expect(await page.evaluate(() => (window as any).__game.world.enemyCount)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('play');
});

test('réseau lent : « Jouer » attend les modèles 3D des ennemis (8 s au plus) au lieu de lancer les silhouettes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // ≈ 4G moyenne : 3 Mbit/s, 150 ms
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (3 * 1024 * 1024) / 8,
    uploadThroughput: (1024 * 1024) / 8,
  });
  await openGame(page);
  await page.click('#playBtn');
  await page.waitForFunction(() => (window as any).__game.app === 'play', null, { timeout: 30_000 });
  const s = await page.evaluate(() => {
    const sc = (window as any).__game.scene;
    return { kind: sc.enemyKind as string, status: sc.enemyStatus as string };
  });
  expect(s.kind, s.status).toBe('gltf');
  expect(s.status).toMatch(/3D prêts/);
});
