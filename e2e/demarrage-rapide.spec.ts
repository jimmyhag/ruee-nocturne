// Un premier lancement rapide sur un téléphone modeste (docs/specs/demarrage-rapide.md, scénarios 1 à 3) : le premier
// écran d'un nouveau joueur est décidé et affiché par les scripts en ligne d'index.html. Le script principal est retenu
// (jamais servi), comme dans e2e/accueil-rapide.spec.ts : ce qui s'affiche vient de la page seule. Le scénario 4 (la
// cible Lighthouse) se mesure avec `npm run lh`. Les tests suivants laissent arriver main.ts : il reprend l'aide sans la
// redessiner ni la remettre en haut, rejoue « Jouer » et le premier geste faits avant lui ; « À propos » ne charge rien.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ locale: 'en-US' });

/** Retient le script principal, pose la sauvegarde (aucune : profil vierge), puis ouvre `path`. */
async function loadWithoutMain(page: Page, path: string, save?: object): Promise<void> {
  await page.route(/\/assets\/main-[^/]+\.js$/, () => {}); // jamais servi
  if (save) await page.addInitScript((s) => localStorage.setItem('ruee-meta', JSON.stringify(s)), save);
  await page.goto(path, { waitUntil: 'commit' });
}
const mainRan = (page: Page) => page.evaluate(() => '__game' in window);
/** Retient le script principal jusqu'à l'appel de la fonction rendue (l'entrée, boot-*.js, passe). */
async function holdMain(page: Page): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/main-[^/]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

test('A new player sees the help before the main script finishes', async ({ page, hasTouch }) => {
  await loadWithoutMain(page, '/');
  await expect(page.locator('#help')).toBeVisible();
  // traduite (navigateur en anglais), dans l'état où main.ts la met : « Jouer » seule sortie, rien de non dévoilé
  await expect(page.locator('#help h2')).toHaveText('How to play');
  await expect(page.locator('#helpPlayBtn')).toHaveText('Play');
  await expect(page.locator('#help [data-i18n="menu.ctrl.daily"]')).toContainText('Daily challenge');
  await expect(page.locator('#help [data-key="move"]')).toHaveText('WASD');
  await expect(page.locator('#help [data-key="jump"]')).toHaveText('Space');
  await expect(page.locator('#helpBackBtn')).toBeHidden();
  await expect(page.locator('#helpTutoBtn')).toBeHidden();
  await expect(page.locator('#help [data-reveal]').first()).toBeHidden();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#tabBar')).toBeHidden();
  if (!hasTouch) await expect(page.locator('#helpPlayBtn')).toBeFocused(); // Entrée la presse dès que le jeu répond
  expect(await page.evaluate(() => document.documentElement.classList.contains('help-due'))).toBe(false);
  expect(await mainRan(page)).toBe(false); // le script principal n'est jamais arrivé
});

test('A returning player sees the home screen, not the help', async ({ page }) => {
  await loadWithoutMain(page, '/', { version: 5, seenHelp: true, settings: { lang: 'en' } });
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#playBtn')).toHaveText('Play');
  await expect(page.locator('#tabBar')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
  expect(await mainRan(page)).toBe(false);
});

test('A challenge link does not show the help first', async ({ page }) => {
  await loadWithoutMain(page, '/#defi=2026-11-20&t=300&k=412&n=Jimmy');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
  expect(await mainRan(page)).toBe(false);
});

test('The main script takes over the help without redrawing it', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 800, height: 420 }); // l'aide dépasse l'écran : elle défile
  const release = await holdMain(page);
  // tout changement de l'aide, ou de l'affichage de l'accueil, relevé dès que l'aide est affichée par la page
  await page.addInitScript(() => {
    const w = window as unknown as { __changes: string[] };
    w.__changes = [];
    let on = false;
    new MutationObserver((list) => {
      const help = document.getElementById('help');
      if (!on) {
        if (!help || help.hidden) return;
        on = true; // à partir d'ici : l'aide est à l'écran
        return;
      }
      for (const m of list) {
        const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement) as Element | null;
        if (!el) continue;
        // l'aide entière ; de l'accueil masqué dessous (que main.ts remplit), seulement son affichage
        const shown =
          el.id === 'menu' || el.id === 'tabBar'
            ? m.attributeName === 'hidden'
            : el.closest('#help') && !el.closest('[hidden]'); // une ligne masquée (non dévoilée) n'est pas dessinée
        if (!shown) continue;
        if (m.type === 'attributes') {
          const now = (m.target as Element).getAttribute(m.attributeName!);
          if (m.attributeName !== 'hidden' || now === m.oldValue) continue; // même valeur : rien à l'écran
        }
        w.__changes.push(`${m.type} ${el.id || el.tagName} ${m.attributeName ?? ''}`);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
    });
  });
  await page.goto('/?debug=1&help=1', { waitUntil: 'commit' }); // l'aide s'ouvre sous ?debug quand on la demande
  await expect(page.locator('#help')).toBeVisible();
  // le joueur a commencé à lire : main.ts ne la remet pas en haut
  const scrolled = await page.evaluate(() => {
    const h = document.getElementById('help')!;
    h.scrollTop = 150;
    return h.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  release();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('help');
  expect(await page.evaluate(() => document.getElementById('help')!.scrollTop)).toBe(scrolled);
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#helpPlayBtn')).toHaveText('Play');
  if (!hasTouch) await expect(page.locator('#helpPlayBtn')).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __changes: string[] }).__changes)).toEqual([]);
});

test('A press on Play before the main script is ready starts the guided run once it is', async ({ page, hasTouch }) => {
  // décision 5 : l'aide s'affiche avant le script principal ; « Jouer » touché d'ici là n'est pas perdu
  const release = await holdMain(page);
  await page.goto('/?debug=1&tuto=1&help=1', { waitUntil: 'commit' }); // tuto=1 : la partie guidée même sous ?debug
  await expect(page.locator('#help')).toBeVisible();
  if (hasTouch) await page.locator('#helpPlayBtn').tap();
  else await page.keyboard.press('Enter'); // « Jouer » a le focus dès l'affichage
  expect(await page.evaluate(() => '__game' in window)).toBe(false); // le script principal n'est pas encore là
  release();
  await page.waitForFunction(() => (window as any).__game?.app === 'play', null, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(true);
  await expect(page.locator('#help')).toBeHidden();
  // le prochain lancement va droit au menu, comme avec « Jouer » pressé après le chargement
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ruee-meta') ?? '{}').seenHelp)).toBe(true);
});

test('A gesture on the help before the main script still prepares the scene', async ({ page, hasTouch }) => {
  test.setTimeout(120_000); // la scène se construit sous SwiftShader
  const release = await holdMain(page);
  await page.goto('/', { waitUntil: 'commit' }); // sans debug : la scène attend le premier geste
  await expect(page.locator('#help')).toBeVisible();
  if (hasTouch) await page.locator('#help h2').tap();
  else await page.locator('#help h2').click();
  expect(await page.evaluate(() => Number(document.documentElement.dataset.touched))).toBeGreaterThan(0);
  release();
  // aucun autre geste : la scène se prépare quand même, écran au repos (le canvas prend sa taille de rendu)
  await expect
    .poll(() => page.evaluate(() => (document.getElementById('c') as HTMLCanvasElement).width), {
      timeout: 90_000,
      intervals: [500],
    })
    .not.toBe(300);
  await expect(page.locator('#help')).toBeVisible(); // le geste n'a rien lancé d'autre
});

test('The about page loads no game script', async ({ request }) => {
  const about = await (await request.get('/a-propos/')).text();
  expect(about).toContain('<html');
  expect(about).not.toMatch(/modulepreload|\/assets\/(main|boot|step)-/);
  const game = await (await request.get('/')).text();
  expect(game).toMatch(/<link rel="modulepreload" crossorigin href="\/assets\/main-[^"]+\.js">/); // le jeu, lui, oui
});
