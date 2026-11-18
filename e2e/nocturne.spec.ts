// Interface « Nocturne » (docs/specs/ui-nocturne.md) : un test par scénario de la spec, au titre anglais du scénario,
// PC et mobile. La maquette est docs/design/menus/ ; les captures de chaque écran viennent de e2e/shots.spec.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const LANTERN = 'rgb(245, 185, 74)';
const MOON = 'rgb(243, 236, 221)';

/** Toucher au doigt sur mobile, cliquer à la souris sur PC (parité, règle 4). */
async function press(loc: Locator, hasTouch: boolean, force = false): Promise<void> {
  if (hasTouch) await loc.tap({ force });
  else await loc.click({ force });
}
const css = (loc: Locator, prop: string) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const app = (page: Page) => page.evaluate(() => (window as any).__game.app as string);

test('The home screen follows the Nocturne mockup', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page); // un joueur qui a déjà joué (tout dévoilé)
  await expect(page.locator('#accountBtn .avatar img')).toBeVisible(); // puce de profil
  await expect(page.locator('#accountLabel')).toHaveText('Invité');
  await expect(page.locator('#accountBtn')).toHaveAttribute(
    'aria-label',
    /^Compte : Invité, (Record \d+:\d\d|Aucun record)$/,
  );
  await expect(page.locator('#bestLine')).toBeVisible();
  await expect(page.locator('#menuGold')).toHaveAttribute('aria-label', /^Or : \d/);
  await expect(page.locator('#settingsBtn svg')).toBeVisible();
  await expect(page.locator('#menu img.logo')).toBeVisible();
  const portrait = page.locator('#heroPortrait');
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('src', '/ui/portrait-eclaireuse.webp');
  expect(await portrait.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#goalBtn')).toBeVisible(); // prochain objectif
  await expect(page.locator('#goalName')).not.toBeEmpty();
  const play = page.locator('#playBtn');
  await expect(play).toHaveClass(/btn-full/);
  await expect(play).toHaveText('Jouer');
  expect(await css(play, 'background-color')).toBe(MOON); // un seul bouton plein, lune sur nuit
  expect(await css(play, 'font-family')).toContain('Barlow Condensed');
  await expect(page.locator('#menu .btn-full:visible')).toHaveCount(1);
  const tabs = page.locator('#tabBar button');
  await expect(tabs).toHaveCount(5);
  for (let i = 0; i < 5; i++) await expect(tabs.nth(i)).toBeVisible();
  expect(errors).toEqual([]);
});

test('The tab bar leads to the five screens', async ({ page, hasTouch }) => {
  await openGame(page);
  for (const [tab, screen, back] of [
    ['charsBtn', 'characters', 'charactersBackBtn'],
    ['shopBtn', 'shop', 'shopBackBtn'],
    ['achBtn', 'achievements', 'achBackBtn'],
    ['libBtn', 'library', 'libBackBtn'],
    ['boardBtn', 'board', 'boardBackBtn'],
  ] as const) {
    await press(page.locator('#' + tab), hasTouch);
    const sheet = page.locator('#' + screen);
    await expect(sheet).toBeVisible();
    await expect(page.locator('#' + back)).toBeVisible(); // flèche retour (44 px)
    const box = await page.locator('#' + back).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    const title = sheet.locator('h2.h1');
    await expect(title).toBeVisible();
    expect(await css(title, 'font-weight')).toBe('700');
    await expect(page.locator('#' + tab)).toHaveAttribute('aria-current', 'page');
    expect(await css(page.locator('#' + tab), 'color')).toBe(LANTERN); // l'onglet courant en lanterne
    await expect(page.locator('#tabBar [aria-current="page"]')).toHaveCount(1);
    await press(page.locator('#' + back), hasTouch);
    await expect(page.locator('#menu')).toBeVisible();
    expect(await app(page)).toBe('menu');
  }
  if (!hasTouch) {
    // parité clavier (règle 4) : un onglet s'ouvre au clavier (focus puis Entrée), Échap ramène à l'accueil
    await page.locator('#achBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#achievements')).toBeVisible();
    expect(await app(page)).toBe('achievements'); // Entrée sur un onglet ne lance pas de partie
    await expect(page.locator('#achBtn')).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#achBtn')).toBeFocused(); // le focus revient sur l'onglet qui a ouvert l'écran
  }
});

test('The hero carousel changes hero by touch and keyboard', async ({ page, hasTouch }) => {
  await openGame(page);
  const name = page.locator('#heroName');
  const dots = page.locator('#heroDots i');
  await expect(name).toHaveText('Éclaireuse');
  await expect(dots).toHaveCount(9);
  await expect(dots.nth(0)).toHaveClass('on');
  await press(page.locator('#heroNext'), hasTouch); // « Héros suivant »
  await expect(name).toHaveText('Bûcheron');
  await expect(dots.nth(1)).toHaveClass('on');
  await expect(page.locator('#heroPortrait')).toHaveAttribute('src', '/ui/portrait-bucheron.webp');
  // le Bûcheron est verrouillé : portrait assombri, condition sous le nom, « JOUER » indisponible
  await expect(page.locator('#heroPortrait')).toHaveClass(/locked/);
  await expect(page.locator('#heroSub')).toContainText('Survis 10 minutes');
  await expect(page.locator('#heroSub .lockico')).toBeVisible();
  await expect(page.locator('#playBtn')).toBeDisabled();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // Entrée hors d'un bouton…
  await page.keyboard.press('Enter'); // … ne lance pas un héros verrouillé
  expect(await app(page)).toBe('menu');
  await page.keyboard.press('ArrowLeft'); // flèche gauche : retour au premier héros
  await expect(name).toHaveText('Éclaireuse');
  await expect(dots.nth(0)).toHaveClass('on');
  await expect(page.locator('#heroSub')).toContainText('Orbe filante');
  await expect(page.locator('#playBtn')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__game.meta.character)).toBe('eclaireuse');
});

test('First open, three tabs dimmed', async ({ page, hasTouch }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5 })); // nouveau joueur, aucune partie finie
  for (const id of ['shopBtn', 'libBtn', 'boardBtn']) {
    const tab = page.locator('#' + id);
    await expect(tab).toHaveAttribute('aria-disabled', 'true');
    expect(await css(tab, 'opacity')).toBe('0.38');
    await press(tab, hasTouch, true); // aria-disabled : Playwright attendrait sinon qu'il s'active
    await expect(page.locator('#tabTip')).toBeVisible();
    await expect(page.locator('#tabTip')).toHaveText('Se débloque après ta première partie');
    expect(await app(page)).toBe('menu'); // inactif : rien ne s'ouvre
  }
  if (!hasTouch) {
    // parité clavier (règle 4) : la bulle s'affiche aussi au clavier, et elle décrit l'onglet fermé
    await page.evaluate(() => ((document.getElementById('tabTip') as HTMLElement).hidden = true));
    await page.locator('#libBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#tabTip')).toBeVisible();
    await expect(page.locator('#libBtn')).toHaveAttribute('aria-describedby', 'tabTip');
    expect(await app(page)).toBe('menu');
  }
  for (const id of ['charsBtn', 'achBtn'])
    await expect(page.locator('#' + id)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#goalName')).toHaveText('Première nuit');
  await expect(page.locator('#goalVal')).toHaveText('Survis 3 minutes');
});

test('An existing player sees no locked tab', async ({ page }) => {
  await openGame(page);
  // sauvegarde d'avant la mise à jour (1.58.0 et avant : version 5, sans dévoilement) qui compte des parties
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 5,
      runs: 7,
      gold: 1234,
      bestTime: 372,
      achievements: ['survie3', 'kills500'],
    }),
  );
  for (const id of ['charsBtn', 'shopBtn', 'achBtn', 'libBtn', 'boardBtn']) {
    await expect(page.locator('#' + id)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await css(page.locator('#' + id), 'opacity')).toBe('1');
  }
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.reveal).toBe(4);
  expect(meta.runs).toBe(7);
  expect(meta.gold).toBe(1234);
  expect(meta.achievements).toEqual(['survie3', 'kills500']);
  await expect(page.locator('#menuGold')).toHaveAttribute('aria-label', /^Or : 1\D?234$/);
  await expect(page.locator('#bestLine')).toHaveText('Record 6:12');
});

test('A run to resume changes the home screen', async ({ page, hasTouch }) => {
  await openGame(page);
  await startRun(page, 7);
  // une partie interrompue en monde 2 à 7:10
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.nextStage();
    g.debug.stageTime(430);
    g.debug.speed(0);
  });
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click(); // « Menu » de la pause garde la partie
  await page.waitForFunction(() => (window as any).__game.app === 'menu');
  await expect(page.locator('#menu')).toHaveClass(/resume/);
  await expect(page.locator('#menu .home-bg img.dusk')).toBeVisible(); // fond du crépuscule
  await expect(page.locator('#menu .home-bg img.night')).toBeHidden();
  const resume = page.locator('#resumeRunBtn');
  await expect(resume).toHaveClass(/btn-full/);
  await expect(resume).toContainText('Reprendre');
  await expect(page.locator('#resumeRunInfo')).toHaveText('Monde 2 · 7:10');
  await expect(page.locator('#menu .btn-full:visible')).toHaveCount(1); // « Nouvelle partie » n'est plus plein
  const fresh = page.locator('#playBtn');
  await expect(fresh).toHaveText('Nouvelle partie');
  await press(fresh, hasTouch);
  await expect(page.locator('#abandonRow')).toBeVisible(); // confirmation d'abandon (phase 49)
  expect(await app(page)).toBe('menu');
  await press(page.locator('#abandonNoBtn'), hasTouch);
  await expect(page.locator('#abandonRow')).toBeHidden();
  await expect(resume).toBeVisible();
});

test('Account and settings from the top of the screen', async ({ page, hasTouch }) => {
  await openGame(page);
  await press(page.locator('#accountBtn'), hasTouch); // puce de profil
  await expect(page.locator('#account')).toBeVisible();
  await press(page.locator('#accountBackBtn'), hasTouch);
  await expect(page.locator('#menu')).toBeVisible();
  await press(page.locator('#settingsBtn'), hasTouch); // icône des réglages
  const settings = page.locator('#settings');
  await expect(settings).toBeVisible();
  await expect(settings.locator('.group', { hasText: 'Vie privée' })).toBeVisible();
  await expect(page.locator('#setRetentionBtn')).toBeVisible();
  if (!hasTouch) {
    await page.keyboard.press('Escape'); // Échap ferme un écran intérieur, le focus revient sur l'icône
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#settingsBtn')).toBeFocused();
  }
});

test('The in-game HUD follows the kit without losing anything', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } }); // SwiftShader : rendu réduit
  });
  await startRun(page, 3);
  await page.evaluate(() => (window as any).__game.debug.god());
  await page.waitForFunction(() => (window as any).__game.world.t > 2, null, { timeout: 30_000 });
  // mêmes informations, mêmes places : vie et niveau à gauche, chrono au centre, or, kills et pause à droite
  for (const sel of [
    '.hleft #lvl',
    '.hleft #hpfill',
    '.hleft #hptxt',
    '#timeBox #time',
    '.hright #goldN',
    '.hright #kills',
  ])
    await expect(page.locator('#hud ' + sel)).toBeVisible();
  await expect(page.locator('#hud .xpbar #xpfill')).toBeAttached();
  await expect(page.locator('.hleft #diffLbl')).toBeVisible(); // difficulté (phase 50 : dès 0 %)
  await expect(page.locator('.hleft #foesLbl')).toBeVisible(); // intensité des monstres (phase 53)
  // polices et couleurs du kit : chrono en Condensed 300, vie en lune, XP et or en lanterne, aucune boîte pleine
  const time = page.locator('#time');
  expect(await css(time, 'font-family')).toContain('Barlow Condensed');
  expect(await css(page.locator('#timeBox'), 'font-weight')).toBe('300');
  expect(await css(page.locator('#hpfill'), 'background-color')).toBe(MOON);
  expect(await css(page.locator('#xpfill'), 'background-color')).toBe(LANTERN);
  expect(await css(page.locator('#goldBox'), 'color')).toBe(LANTERN);
  for (const sel of ['#goldBox', '#killsBox', '#timeBox', '#diffLbl'])
    expect(await css(page.locator(sel), 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await css(page.locator('#hud'), 'text-shadow')).not.toBe('none'); // ombre portée douce
  // budget d'appels de dessin (PLAN.md §4.3) ; le bench est mesuré par `just bench`
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => (window as any).__game.renderer.info.render.calls as number);
  expect(calls).toBeLessThanOrEqual(40);
});

test('Level-up cards are a ruled list', async ({ page, hasTouch }) => {
  await openGame(page);
  await startRun(page, 2);
  await page.evaluate(() => (window as any).__game.debug.god());
  for (const way of hasTouch ? ['tap'] : ['key', 'click']) {
    await page.evaluate(() => (window as any).__game.debug.levelUp());
    await expect(page.locator('#levelup')).toBeVisible();
    const cards = page.locator('#cards .card');
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const c = cards.nth(i);
      // une ligne : filet de 1 px dessous, ni carte (fond) ni contour (bords)
      expect(await css(c, 'border-bottom-width')).toBe('1px');
      for (const side of ['top', 'left', 'right']) expect(await css(c, `border-${side}-width`)).toBe('0px');
      expect(await css(c, 'border-radius')).toBe('0px');
      await page.waitForTimeout(400); // fin de l'entrée en cascade
      expect(await css(c, 'background-color')).toBe('rgba(0, 0, 0, 0)');
      const heal = (await c.locator('h3').innerText()).match(/soin|heal/i);
      if (!heal) await expect(c.locator('.rar')).toHaveText(/Commune|Rare|Épique/); // rareté : pastille et libellé
    }
    if (way === 'key') await page.keyboard.press('Digit1');
    else await press(cards.first(), way === 'tap');
    await page.waitForFunction(() => (window as any).__game.app === 'play');
  }
});

test('The end screens follow the kit', async ({ page }) => {
  await openGame(page);
  await startRun(page, 4);
  await page.evaluate(() => (window as any).__game.debug.kill());
  const over = page.locator('#over');
  await expect(over).toBeVisible({ timeout: 8000 });
  await expect(over.locator('h2.h1')).toBeVisible();
  expect(await css(over.locator('h2.h1'), 'text-transform')).toBe('uppercase');
  await expect(page.locator('#oTime')).toBeVisible();
  expect(await css(page.locator('#oTime'), 'font-weight')).toBe('300'); // chiffres en Condensed 300
  expect(await css(page.locator('#oKills'), 'font-family')).toContain('Barlow Condensed');
  const full = over.locator('.btn-full:visible');
  await expect(full).toHaveCount(1); // un seul bouton plein
  await expect(full).toHaveText('Rejouer');
  await expect(full).toHaveAttribute('id', 'againBtn');
});

test('The consent request follows the kit', async ({ page, hasTouch }) => {
  await page.goto('/?debug=1&consent=1');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  // la première partie, puis le retour au menu
  await startRun(page, 1);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await page.locator('#menuBtn').click();
  const sheet = page.locator('#consent');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('h2.h1')).toHaveText('Aider à améliorer le jeu ?');
  await expect(sheet.locator('.numrow')).toHaveCount(3); // trois lignes numérotées, comme l'écran Compte
  const yes = page.locator('#consentYesBtn');
  await expect(yes).toHaveText("Oui, j'aide");
  await expect(yes).toHaveClass(/btn-full/);
  await expect(page.locator('#consentNoBtn')).toHaveText('Non merci');
  await expect(page.locator('#consentNoBtn')).toHaveClass(/btn-link/);
  await expect(sheet.locator('.btn-full:visible')).toHaveCount(1);
  await expect(yes).toBeFocused();
  // le clavier (Échap) et le doigt (« Non merci ») répondent de la même façon : refus, retour au menu
  if (hasTouch) await page.locator('#consentNoBtn').tap();
  else await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await app(page)).toBe('menu');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ruee-retention') ?? 'null'));
  expect(stored?.consent).toBe('no');
});

test('Reduced effects stops the menu animations', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#heroPortrait')).toHaveCSS('animation-name', 'breathe');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, reducedFx: true, fxChosen: true }); // réglage « Effets réduits »
  });
  await expect(page.locator('body')).toHaveClass(/calm/);
  await expect(page.locator('#heroPortrait')).toHaveCSS('animation-name', 'none'); // le portrait ne respire plus
  for (const sel of ['#menu .eyes', '#menu .ff']) {
    const all = page.locator(sel);
    const n = await all.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(all.nth(i)).toHaveCSS('animation-name', 'none'); // yeux, lucioles
  }
});

test('The menu no longer renders the 3D scene', async ({ page }) => {
  await openGame(page);
  await page.waitForFunction(() => !!(window as any).__game.renderer);
  const frames = () => page.evaluate(() => (window as any).__game.renderer.info.render.frame as number);
  const f0 = await frames();
  await page.waitForTimeout(800);
  expect(await frames(), 'aucun rendu 3D au menu').toBe(f0);
  await expect(page.locator('canvas#c')).toBeHidden(); // canvas non composité au menu
  await page.locator('#playBtn').click(); // la partie démarre comme avant
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction((f) => (window as any).__game.renderer.info.render.frame > f + 3, f0, { timeout: 20_000 });
  // retour au menu : le rendu s'arrête de nouveau
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'menu');
  await page.waitForTimeout(200);
  const f1 = await frames();
  await page.waitForTimeout(800);
  expect(await frames()).toBe(f1);
});

test('No font loaded from another site', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/'); // sans compte, sans debug
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  const origin = new URL(page.url()).origin;
  expect(urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'))).toEqual([]);
  const fonts = urls.filter((u) => u.endsWith('.woff2'));
  expect(fonts.length).toBeGreaterThan(0);
  for (const u of fonts) expect(u).toMatch(/\/fonts\/barlow(-condensed)?-\d{3}-latin(-ext)?\.woff2$/);
  expect(await page.evaluate(() => document.fonts.check('700 20px "Barlow Condensed"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('500 14px "Barlow"'))).toBe(true);
});
