// Captures d'écran pour vérification visuelle (à lire avec l'outil Read, jamais à « supposer »).
// Sortie : shots/<projet>-<écran>.png
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

const shot = (name: string, project: string) => ({
  path: `shots/${project}-${name}.png`,
  animations: 'disabled' as const,
});

/** Attend qu'un kill survienne, laisse courir `afterMs` de jeu puis fige la boucle (particules en vol). */
async function freezeAfterKill(page: Page, afterMs: number): Promise<void> {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve, reject) => {
        const g = (window as any).__game;
        const k0 = g.world.kills as number;
        const t0 = performance.now();
        let tKill = 0;
        const check = () => {
          if (g.app !== 'play') return reject(new Error('partie interrompue : ' + g.app));
          if (performance.now() - t0 > 8000) return reject(new Error('aucun kill en 8 s'));
          if (!tKill && g.world.kills > k0) tKill = performance.now();
          if (tKill && performance.now() - tKill >= ms) {
            g.debug.speed(0);
            return resolve();
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    afterMs,
  );
}

/** Prend la carte 1 au clavier tant qu'un choix est affiché (niveaux en attente, coffres), puis attend le jeu. */
async function pickUntilPlay(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const app = await page.evaluate(() => (window as any).__game.app as string);
    if (app === 'play') return;
    if (app === 'levelup') await page.keyboard.press('Digit1');
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => (window as any).__game.app === 'play', null, { timeout: 3000 });
}

test('menu, jeu à 3 min, montée de niveau, mort', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true)); // pas d'onglet perf sur les captures
  await page.waitForTimeout(800); // polices
  await page.screenshot(shot('menu', p));

  await startRun(page, 42);
  await page.evaluate(() => (window as any).__game.debug.warp(180));
  await page.evaluate(() => (window as any).__game.debug.god()); // à 3:00 encerclé, le joueur mourrait avant la capture
  await page.waitForTimeout(600); // quelques frames de rendu après le saut dans la sim
  const app = await page.evaluate(() => (window as any).__game.app as string);
  if (app === 'levelup') {
    // le warp a pu laisser une montée de niveau en attente : on la prend
    await page.locator('#cards .card').first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot(shot('jeu-3min', p));

  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await page.waitForTimeout(400); // animation des cartes
  await page.screenshot(shot('levelup', p));
  await page.locator('#cards .card').first().click();

  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot(shot('mort', p));
});

// Porte de phase 2 : kill d'élite (particules, chiffres), montée de niveau (anneau), boss (bannière, barre, recul caméra).
test('game feel : kill d’élite, montée de niveau, boss', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 7);
  await page.evaluate(() => (window as any).__game.debug.god());
  // élite : une Brute à 1 PV posée à 2 u, tuée par la première arme qui la touche
  await page.evaluate(() => (window as any).__game.debug.weak(2, 2));
  await freezeAfterKill(page, 140);
  await page.waitForTimeout(150);
  const parts = await page.evaluate(() => (window as any).__game.scene.particles.alive as number);
  expect(parts, 'particules du kill en vol').toBeGreaterThan(20);
  await page.screenshot(shot('kill-elite', p));

  // montée de niveau : anneau de particules autour du joueur, juste avant l'écran de choix
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot(shot('levelup-feel', p));
  await pickUntilPlay(page); // parité clavier : touche 1 = carte 1 (plusieurs niveaux ou un coffre peuvent être en attente)

  // boss : saut à 4:59,5 puis la boucle réelle fait apparaître le Gardien (bannière, son, shake passent par
  // handleEvents, pas par warp) ; ramené à 6 u devant le joueur
  await page.evaluate(() => (window as any).__game.debug.warp(299.5 - (window as any).__game.world.t));
  await pickUntilPlay(page);
  await page.waitForFunction(() => (window as any).__game.world.bossIndex >= 0, null, { timeout: 8000 });
  await page.evaluate(() => (window as any).__game.debug.pullBoss(6));
  await page.waitForTimeout(400);
  await expect(page.locator('#banner')).toHaveClass(/on/);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.screenshot(shot('boss', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));
});

// Porte de phase 3 : armes évoluées, Colosse et ses cercles rouges, lac.
test('contenu : évolutions, Colosse, lac', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 11);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // pas de montée de niveau pendant la capture : l'écran de choix figerait la sim
    g.debug.evolve('aura');
    g.debug.evolve('lames');
    g.debug.give('boomerang', 5);
    g.debug.give('mines', 5);
    g.debug.spawn(2, 6, 4); // des Brutes autour pour voir les coups
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await page.screenshot(shot('evolutions', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));

  // Colosse à 8 u : cercles rouges télégraphiés 1 s sous le joueur
  await page.evaluate(() => (window as any).__game.debug.spawn(7, 1, 8));
  await page.waitForFunction(() => (window as any).__game.world.shotCount > 0, null, { timeout: 8000 });
  await page.waitForTimeout(450);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await page.screenshot(shot('colosse', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));

  // lac : le joueur est ralenti et l'eau est visible
  await page.evaluate(() => {
    const g = (window as any).__game;
    const l = g.world.lakes[0];
    g.debug.teleport(l.x, l.z);
  });
  await page.waitForTimeout(600);
  const speed = await page.evaluate(() => {
    const g = (window as any).__game;
    return g.world.speedAt(g.world.player.x, g.world.player.z) as number;
  });
  expect(speed).toBeLessThan(1);
  await page.screenshot(shot('lac', p));
});
