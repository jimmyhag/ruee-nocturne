// Passe d'ergonomie de l'interface « Nocturne » (docs/specs/ui-ergonomie.md) : un test par scénario de la spec, au
// titre anglais du scénario, dans les deux projets. Chaque test pose la taille de fenêtre de son scénario
// (`setViewportSize`) : les gabarits sont des requêtes média, ils suivent la fenêtre sans recharger.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const LANTERN = 'rgb(245, 185, 74)';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** Rectangle englobant d'un élément (coordonnées d'écran, agrandissement compris). */
async function box(page: Page, sel: string): Promise<Box> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`absent : ${s}`);
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}
/** Deux rectangles se recouvrent (un demi-pixel d'arrondi toléré). */
const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
/** Aucune paire d'éléments ne se recouvre ; chacun a une taille. */
async function expectApart(page: Page, sels: string[]): Promise<void> {
  const boxes: Box[] = [];
  for (const s of sels) {
    const b = await box(page, s);
    expect(b.width * b.height, `${s} a une taille`).toBeGreaterThan(0);
    boxes.push(b);
  }
  for (let i = 0; i < sels.length; i++)
    for (let j = i + 1; j < sels.length; j++)
      expect(overlap(boxes[i], boxes[j]), `${sels[i]} recouvre ${sels[j]}`).toBe(false);
}
/** L'élément est tout entier dans la fenêtre. */
async function expectInside(page: Page, sel: string): Promise<void> {
  const vp = page.viewportSize()!;
  const b = await box(page, sel);
  expect(b.left, `${sel} déborde à gauche`).toBeGreaterThanOrEqual(-0.5);
  expect(b.top, `${sel} déborde en haut`).toBeGreaterThanOrEqual(-0.5);
  expect(b.right, `${sel} déborde à droite`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(b.bottom, `${sel} déborde en bas`).toBeLessThanOrEqual(vp.height + 0.5);
}
const css = (loc: Locator, prop: string, pseudo?: string) =>
  loc.evaluate((el, [p, ps]) => getComputedStyle(el, ps || undefined).getPropertyValue(p), [prop, pseudo ?? '']);
/** Opacité d'une couleur calculée (`rgb(…)` : 1, `rgba(…, a)` : a). */
const alpha = (color: string): number => {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return 0;
  const parts = m[1].split(/[,/ ]+/).filter(Boolean);
  return parts.length > 3 ? parseFloat(parts[3]) : 1;
};
const app = (page: Page) => page.evaluate(() => (window as any).__game.app as string);
const dayKey = (d = 0): string => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
/** Toucher au doigt sur mobile, cliquer à la souris sur PC (parité, règle 4). */
async function press(loc: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await loc.tap();
  else await loc.click();
}
/** Un joueur qui a déjà joué : défi du jour ouvert, trois missions, tout dévoilé, Nouveautés déjà lues. */
async function veteran(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(
    ([more, version]) =>
      (window as any).__game.setMeta({
        version: 5,
        runs: 6,
        gold: 570,
        achievements: ['survie3'],
        reveal: 4,
        seenReveal: 4,
        seenNotes: version,
        ...(more as object),
      }),
    [extra, await page.evaluate(() => document.getElementById('notesVer')!.textContent)] as const,
  );
}
/** Éléments de l'accueil qu'on peut toucher (visibles, actifs) : leur taille. */
async function homeTargets(page: Page): Promise<{ id: string; w: number; h: number }[]> {
  return page.evaluate(() => {
    const out: { id: string; w: number; h: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('#menu button, #menu summary, #menu a, #tabBar button')) {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
      out.push({ id: el.id || el.tagName.toLowerCase(), w: r.width, h: r.height });
    }
    return out;
  });
}

test('The home screen fills a tablet in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await veteran(page);
  expect((await box(page, '.home')).width, 'colonne de contenu').toBeGreaterThanOrEqual(600);
  expect((await box(page, '#playBtn')).height, '« Jouer »').toBeGreaterThanOrEqual(64);
  for (const id of ['charsBtn', 'shopBtn', 'achBtn', 'libBtn', 'boardBtn']) {
    const ico = await box(page, `#${id} svg`);
    expect(ico.width, `icône de ${id}`).toBeGreaterThanOrEqual(30);
    expect(ico.height, `icône de ${id}`).toBeGreaterThanOrEqual(30);
  }
  const parts = ['#heroName', '#goalBtn', '#missions summary', '#playBtn', '#tabBar'];
  for (const s of parts) {
    await expect(page.locator(s)).toBeVisible();
    await expectInside(page, s);
  }
  await expectApart(page, parts);
  // rien ne reste à la taille du téléphone : cibles tactiles de 48 px au moins (décision 3)
  for (const t of await homeTargets(page)) {
    expect(t.w, `largeur de ${t.id}`).toBeGreaterThanOrEqual(48);
    expect(t.h, `hauteur de ${t.id}`).toBeGreaterThanOrEqual(48);
  }
  expect(errors).toEqual([]);
});

test('The home screen switches to two zones on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await openGame(page);
  await veteran(page);
  const portrait = await box(page, '#heroPortrait');
  const play = await box(page, '#playBtn');
  expect(portrait.right, 'le portrait est à gauche de « Jouer »').toBeLessThanOrEqual(play.left);
  // les missions du jour sont dépliées dans le panneau de droite, sans y toucher
  const missions = page.locator('#missionList .mission');
  await expect(missions).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(missions.nth(i)).toBeVisible();
  const first = await box(page, '#missionList .mission');
  expect(first.left).toBeGreaterThanOrEqual(portrait.right);
  expect(first.bottom).toBeLessThanOrEqual(play.top + 0.5);
  // l'ensemble occupe au moins 80 % de la largeur : du bord gauche de la zone du héros au bord droit du panneau
  const left = Math.min((await box(page, '.stage')).left, (await box(page, '.carousel')).left);
  expect(play.right - left).toBeGreaterThanOrEqual(1180 * 0.8);
  // la barre d'onglets prend la largeur de l'écran
  expect((await box(page, '#tabBar')).width).toBeGreaterThanOrEqual(1180 - 1);
  const parts = [
    '.home-top',
    '#heroPortrait',
    '.carousel',
    '.home .logo',
    '#dailyBtn',
    '#notesBtn',
    '#goalBtn',
    '.missions',
    '#playBtn',
    '#tabBar',
  ];
  for (const s of parts) await expectInside(page, s);
  await expectApart(page, parts);
});

test('The home screen fits a phone held sideways', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openGame(page);
  await veteran(page);
  const tabs = ['#charsBtn', '#shopBtn', '#achBtn', '#libBtn', '#boardBtn'];
  const parts = ['#playBtn', '#goalBtn', ...tabs];
  for (const s of parts) {
    await expect(page.locator(s)).toBeVisible();
    await expectInside(page, s);
  }
  await expectApart(page, parts);
  await expectApart(page, ['#heroPortrait', '#playBtn', '#goalBtn', '#missions summary', '#tabBar']);
  for (const s of tabs) {
    const b = await box(page, s);
    expect(b.width, `${s} : largeur`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${s} : hauteur`).toBeGreaterThanOrEqual(44);
  }
  // missions repliées
  await expect(page.locator('#missionList .mission').first()).toBeHidden();
});

test('Rotating the device changes the layout without reloading', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openGame(page);
  await veteran(page, { bought: ['bucheron'] });
  await page.evaluate(() => ((window as any).__kept = 1)); // perdu si la page se recharge
  await press(page.locator('#heroNext'), hasTouch);
  await expect(page.locator('#heroName')).toHaveText('Bûcheron');
  const stacked = async () => (await box(page, '#heroPortrait')).bottom <= (await box(page, '#playBtn')).top;
  const sideBySide = async () => (await box(page, '#heroPortrait')).right <= (await box(page, '#playBtn')).left;
  expect(await stacked(), 'portrait : le héros au-dessus de « Jouer »').toBe(true);
  expect(await sideBySide()).toBe(false);
  // à l'horizontale : deux zones, le héros choisi est gardé
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(sideBySide).toBe(true);
  await expect(page.locator('#heroName')).toHaveText('Bûcheron');
  // un écran ouvert reste ouvert quand on retourne l'appareil
  await press(page.locator('#libBtn'), hasTouch);
  await expect(page.locator('#library')).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('#library')).toBeVisible();
  expect(await app(page)).toBe('library');
  await expect.poll(async () => (await box(page, '#library .panel')).width).toBeLessThanOrEqual(820);
  await press(page.locator('#libBackBtn'), hasTouch);
  await expect(page.locator('#menu')).toBeVisible();
  await expect.poll(stacked).toBe(true);
  await expect(page.locator('#heroName')).toHaveText('Bûcheron');
  expect(await page.evaluate(() => (window as any).__game.meta.character)).toBe('bucheron');
  expect(await page.evaluate(() => (window as any).__kept), 'aucun rechargement').toBe(1);
});

test('The daily challenge and the news are seen at a glance', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await veteran(page, { streak: { last: dayKey(-1), count: 6, best: 6, jokerWeek: '' } });
  const daily = page.locator('#dailyBtn');
  const notes = page.locator('#notesBtn');
  for (const btn of [daily, notes]) {
    await expect(btn).toBeVisible();
    await expect(btn.locator('svg').first()).toBeVisible(); // une icône
    expect(await css(btn, 'writing-mode')).toBe('horizontal-tb'); // plus de libellé vertical
    // tout le texte du bouton : horizontal, 12 px au moins
    const sizes = await btn.evaluate((el) => {
      const out: { text: string; size: number; mode: string }[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const p = n.parentElement!;
        if (!n.textContent?.trim() || p.closest('[hidden]')) continue;
        const st = getComputedStyle(p);
        out.push({ text: n.textContent.trim(), size: parseFloat(st.fontSize), mode: st.writingMode });
      }
      return out;
    });
    expect(sizes.length).toBeGreaterThan(1);
    for (const s of sizes) {
      expect(s.size, `« ${s.text} »`).toBeGreaterThanOrEqual(12);
      expect(s.mode, `« ${s.text} »`).toBe('horizontal-tb');
    }
  }
  const d = await box(page, '#dailyBtn');
  const n = await box(page, '#notesBtn');
  expect(d.height).toBeGreaterThanOrEqual(48);
  expect(n.height).toBeGreaterThanOrEqual(48);
  expect(d.width, 'un bouton horizontal').toBeGreaterThan(d.height);
  expect(n.width, 'un bouton horizontal').toBeGreaterThan(n.height);
  expect(Math.abs(d.top - n.top), 'côte à côte').toBeLessThan(2);
  expect(overlap(d, n)).toBe(false);
  await expectInside(page, '#dailyBtn');
  await expectInside(page, '#notesBtn');
  // sous l'accroche, au-dessus du héros
  expect(d.top).toBeGreaterThanOrEqual((await box(page, '.tagline')).bottom);
  expect(d.bottom).toBeLessThanOrEqual((await box(page, '#heroPortrait')).top + 0.5);
  // ce que dit chaque bouton : défi, durée, série en cours ; nouveautés, version
  await expect(daily).toContainText('Défi du jour');
  await expect(daily).toContainText('5 min');
  await expect(page.locator('#dailyStreakN')).toHaveText('6');
  await expect(daily).toHaveAttribute('aria-label', /^Défi du jour, 5 minutes, série de 6 jours, à jouer, /);
  await expect(notes).toContainText('Nouveautés');
  await expect(notes).toContainText(/\d+\.\d+\.\d+/);
  // chacun s'ouvre au doigt (ou à la souris) et au clavier (Entrée), et reprend le focus à la fermeture
  for (const [btn, screen, back] of [
    [daily, 'daily', '#dailyBackBtn'],
    [notes, 'notes', '#notesBackBtn'],
  ] as const) {
    await press(btn, hasTouch);
    await expect(page.locator('#' + screen)).toBeVisible();
    expect(await app(page)).toBe(screen);
    await press(page.locator(back), hasTouch);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#' + screen)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(btn).toBeFocused();
  }
});

test('A new version is clearly announced', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await veteran(page, { seenNotes: '1.40.0' }); // Nouveautés lues à une version plus ancienne
  const pill = page.locator('#notesDot');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText('Nouveau');
  expect(await css(pill, 'background-color')).toBe(LANTERN);
  expect(parseFloat(await css(pill, 'font-size'))).toBeGreaterThanOrEqual(12);
  expect(await css(page.locator('#notesBtn'), 'border-top-color'), 'contour lanterne').toBe(LANTERN);
  await expect(page.locator('#notesBtn')).toHaveAttribute('aria-label', /^Nouveautés, version \d+\.\d+\.\d+ non lue$/);
  await expectInside(page, '#notesDot');
  // en anglais : « New »
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: 'en' } });
  });
  await expect(pill).toHaveText('New');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: 'fr' } });
  });
  // après l'ouverture des Nouveautés, elle a disparu
  await press(page.locator('#notesBtn'), hasTouch);
  await expect(page.locator('#notes')).toBeVisible();
  await press(page.locator('#notesBackBtn'), hasTouch);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(pill).toBeHidden();
  expect(alpha(await css(page.locator('#notesBtn'), 'border-top-color')), 'plus de contour').toBe(0);
  await expect(page.locator('#notesBtn')).toHaveAttribute('aria-label', /^Nouveautés, version \d+\.\d+\.\d+$/);
});

test('The challenge not played yet is put forward', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  // sans partie du défi aujourd'hui : « à jouer », flamme et contour lanterne
  await veteran(page, { daily: { date: dayKey(-1), times: [120], kills: [80] } });
  const btn = page.locator('#dailyBtn');
  await expect(btn).toHaveAttribute('data-state', 'todo');
  await expect(page.locator('#dailyRail')).toHaveText('à jouer');
  await expect(btn.locator('.q-ico .flame')).toBeVisible();
  await expect(btn.locator('.q-ico .check')).toBeHidden();
  expect(await css(btn, 'border-top-color')).toBe(LANTERN);
  await expect(btn).toHaveAttribute('aria-label', /^Défi du jour, 5 minutes, à jouer, se termine dans /);
  // après un défi enregistré aujourd'hui : « fait », coche, sans contour
  await veteran(page, { daily: { date: dayKey(0), times: [185], kills: [240] } });
  await expect(btn).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#dailyRail')).toHaveText('fait');
  await expect(btn.locator('.q-ico .check')).toBeVisible();
  await expect(btn.locator('.q-ico .flame')).toBeHidden();
  expect(alpha(await css(btn, 'border-top-color'))).toBe(0);
  await expect(btn).toHaveAttribute('aria-label', 'Défi du jour, 5 minutes, fait, ton temps 3:05');
  // en anglais
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: 'en' } });
  });
  await expect(page.locator('#dailyRail')).toHaveText('done');
});

test('The missions never hide the hero', async ({ page, hasTouch }) => {
  for (const [width, height] of [
    [390, 844],
    [717, 880],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await openGame(page);
    await veteran(page);
    const where = `${width} × ${height}`;
    const row = page.locator('#missionList .mission').first();
    // à l'ouverture de l'accueil : repliées, une ligne « Missions du jour · 0/3 »
    expect(await page.locator('#missions').evaluate((d: HTMLDetailsElement) => d.open), where).toBe(false);
    await expect(row).toBeHidden();
    await expect(page.locator('#missions summary')).toContainText('Missions du jour');
    await expect(page.locator('#missionsCount')).toHaveText('0/3');
    // la ligne ne recouvre ni le nom du héros, ni le carrousel (flèches, points), ni l'objectif
    await expectApart(page, ['.carousel', '#goalBtn', '#missions summary', '#playBtn']);
    await expectApart(page, ['#heroName', '#heroDots', '#heroPrev', '#heroNext', '#missions summary']);
    const still = ['#heroName', '#goalBtn', '#playBtn', '#missions summary'];
    const before = await Promise.all(still.map((s) => box(page, s)));
    // dépliées : par-dessus l'accueil (fond opaque), rien ne bouge, « Jouer » reste visible
    await press(page.locator('#missions summary'), hasTouch);
    await expect(row, where).toBeVisible();
    await expect(page.locator('#missionList .mission')).toHaveCount(3);
    const after = await Promise.all(still.map((s) => box(page, s)));
    for (let i = 0; i < still.length; i++) {
      expect(Math.abs(after[i].top - before[i].top), `${still[i]} a bougé (${where})`).toBeLessThan(0.5);
      expect(Math.abs(after[i].left - before[i].left), `${still[i]} a bougé (${where})`).toBeLessThan(0.5);
    }
    const panel = page.locator('#missionsPanel');
    expect(alpha(await css(panel, 'background-color')), 'fond opaque').toBe(1);
    await expectInside(page, '#missionsPanel');
    const p = await box(page, '#missionsPanel');
    const top = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('#missionsPanel'),
      [p.left + p.width / 2, p.top + p.height / 2],
    );
    expect(top, `le panneau est par-dessus (${where})`).toBe(true);
    const play = await box(page, '#playBtn');
    expect(overlap(p, play), `les missions recouvrent « Jouer » (${where})`).toBe(false);
    await expect(page.locator('#playBtn')).toBeVisible();
    // Échap les referme (le focus revient sur la ligne)
    await page.keyboard.press('Escape');
    await expect(row).toBeHidden();
    expect(await app(page)).toBe('menu');
    await expect(page.locator('#missions summary')).toBeFocused();
    // un toucher hors du panneau aussi
    await press(page.locator('#missions summary'), hasTouch);
    await expect(row).toBeVisible();
    const logo = await box(page, '.home .logo');
    const [x, y] = [logo.left + logo.width / 2, logo.top + logo.height / 2];
    if (hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await expect(row).toBeHidden();
    expect(await app(page)).toBe('menu');
  }
});

test('Gold and settings stay readable over the moon', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 }); // le fond recadré amène la lune sous la barre du haut
  await openGame(page);
  await veteran(page);
  for (const id of ['accountBtn', 'menuGold', 'settingsBtn']) {
    const el = page.locator('#' + id);
    await expect(el).toBeVisible();
    expect(await el.evaluate((e) => e.tagName), `${id} est un bouton`).toBe('BUTTON');
    expect(alpha(await css(el, 'background-color')), `fond de ${id}`).toBeGreaterThanOrEqual(0.5);
    const b = await box(page, '#' + id);
    expect(b.width, `largeur de ${id}`).toBeGreaterThanOrEqual(44);
    expect(b.height, `hauteur de ${id}`).toBeGreaterThanOrEqual(44);
  }
  // l'icône des réglages fait 24 px (avant l'agrandissement du gabarit), au trait de 2 px
  expect(parseFloat(await css(page.locator('#settingsBtn svg'), 'width'))).toBeGreaterThanOrEqual(24);
  expect(await css(page.locator('#settingsBtn svg'), 'stroke-width')).toBe('2px');
  // le voile de nuit du haut : un dégradé qui part d'au moins 70 % d'opacité, sous la barre du haut et le logo
  const veil = await page.locator('#menu').evaluate((el) => {
    const st = getComputedStyle(el, '::before');
    return { image: st.backgroundImage, height: parseFloat(st.height), top: parseFloat(st.top) };
  });
  expect(veil.image).toContain('linear-gradient');
  const first = veil.image.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  expect(parseFloat(first![1])).toBeGreaterThanOrEqual(0.7);
  expect(veil.top).toBe(0);
  expect(veil.height).toBeGreaterThanOrEqual((await box(page, '.home .logo')).bottom);
  // l'or mène à Emplacements, où il se dépense
  await page.locator('#menuGold').click();
  await expect(page.locator('#shop')).toBeVisible();
});

test('The tabs read well', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await veteran(page);
  const bar = page.locator('#tabBar');
  expect(alpha(await css(bar, 'background-color')), 'fond opaque').toBe(1);
  expect(parseFloat(await css(bar, 'border-top-width')), 'filet en haut').toBeGreaterThanOrEqual(1);
  for (const id of ['charsBtn', 'shopBtn', 'achBtn', 'libBtn', 'boardBtn']) {
    const tab = page.locator('#' + id);
    const ico = await box(page, `#${id} svg`);
    expect(ico.width, `icône de ${id}`).toBeGreaterThanOrEqual(26);
    expect(ico.height, `icône de ${id}`).toBeGreaterThanOrEqual(26);
    expect(await css(tab.locator('svg'), 'stroke-width')).toBe('2px');
    const label = tab.locator('span').last();
    expect(parseFloat(await css(label, 'font-size')), `libellé de ${id}`).toBeGreaterThanOrEqual(11);
    // inactif : lune à 80 % d'opacité au moins (icône et libellé), sans marque
    expect(alpha(await css(tab.locator('svg'), 'stroke')), `icône de ${id}`).toBeGreaterThanOrEqual(0.8);
    expect(alpha(await css(label, 'color')), `libellé de ${id}`).toBeGreaterThanOrEqual(0.8);
    expect(await css(tab, 'opacity')).toBe('1');
    expect(await css(tab, 'content', '::before')).toBe('none');
  }
  // onglet courant : icône et libellé en lanterne, et sa marque (un filet lanterne)
  await press(page.locator('#achBtn'), hasTouch);
  await expect(page.locator('#achievements')).toBeVisible();
  const cur = page.locator('#achBtn');
  await expect(cur).toHaveAttribute('aria-current', 'page');
  expect(await css(cur.locator('svg'), 'stroke')).toBe(LANTERN);
  expect(await css(cur.locator('span').last(), 'color')).toBe(LANTERN);
  const mark = await cur.evaluate((el) => {
    const st = getComputedStyle(el, '::before');
    return { content: st.content, bg: st.backgroundColor, w: parseFloat(st.width), h: parseFloat(st.height) };
  });
  expect(mark.content).not.toBe('none');
  expect(mark.bg).toBe(LANTERN);
  expect(mark.w).toBeGreaterThanOrEqual(12);
  expect(mark.h).toBeGreaterThanOrEqual(2);
  expect(await css(page.locator('#libBtn'), 'content', '::before')).toBe('none'); // une seule marque
});

test('The inner screens use the width of the screen', async ({ page, hasTouch }) => {
  await openGame(page);
  await veteran(page);
  // tablette en portrait : colonne de 600 px au moins
  await page.setViewportSize({ width: 820, height: 1180 });
  for (const [tab, screen, back] of [
    ['charsBtn', 'characters', 'charactersBackBtn'],
    ['libBtn', 'library', 'libBackBtn'],
  ] as const) {
    await press(page.locator('#' + tab), hasTouch);
    await expect(page.locator('#' + screen)).toBeVisible();
    const b = await box(page, `#${screen} .panel`);
    expect(b.width, `${screen} à 820 × 1180`).toBeGreaterThanOrEqual(600);
    expect(b.width).toBeLessThanOrEqual(820);
    // les textes sont agrandis comme l'accueil : le titre (42 px sur téléphone) fait 1,25 fois plus au moins
    const title = page.locator(`#${screen} h2.h1`);
    expect(parseFloat(await css(title, 'font-size'))).toBe(42);
    expect((await box(page, `#${screen} h2.h1`)).height, 'titre agrandi').toBeGreaterThanOrEqual(46 * 1.25);
    await press(page.locator('#' + back), hasTouch);
  }
  // écran large : 800 px au moins, la Bibliothèque en grille de six colonnes avec la fiche à côté
  await page.setViewportSize({ width: 1180, height: 820 });
  await press(page.locator('#charsBtn'), hasTouch);
  await expect(page.locator('#characters')).toBeVisible();
  expect((await box(page, '#characters .panel')).width).toBeGreaterThanOrEqual(800);
  const head = await box(page, '#characters .herohead');
  const chal = await box(page, '#characters .chalwrap');
  expect(head.right, 'Héros : la fiche à gauche, les défis à droite').toBeLessThanOrEqual(chal.left);
  await press(page.locator('#charactersBackBtn'), hasTouch);
  await press(page.locator('#libBtn'), hasTouch);
  await expect(page.locator('#library')).toBeVisible();
  expect((await box(page, '#library .panel')).width).toBeGreaterThanOrEqual(800);
  const cols = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#library .libgrid .lib')].map((e) => e.getBoundingClientRect());
    return items.filter((r) => Math.abs(r.top - items[0].top) < 1).length;
  });
  expect(cols, 'colonnes de la grille').toBeGreaterThanOrEqual(6);
  const detail = await box(page, '#library .libdetail');
  const grid = await box(page, '#library .libgrid');
  expect(detail.right, 'la fiche à côté de la grille').toBeLessThanOrEqual(grid.left);
  expect(Math.abs(detail.top - grid.top)).toBeLessThan(40);
  await press(page.locator('#libBackBtn'), hasTouch);
  // Succès et Emplacements sur deux colonnes
  await press(page.locator('#achBtn'), hasTouch);
  const a0 = await box(page, '#achList .ach:nth-child(1)');
  const a1 = await box(page, '#achList .ach:nth-child(2)');
  expect(Math.abs(a0.top - a1.top), 'Succès sur deux colonnes').toBeLessThan(1);
  expect(a0.right).toBeLessThanOrEqual(a1.left);
  await press(page.locator('#achBackBtn'), hasTouch);
  await press(page.locator('#shopBtn'), hasTouch);
  const s0 = await box(page, '#slotList .slotsec:nth-child(1)');
  const s1 = await box(page, '#slotList .slotsec:nth-child(2)');
  expect(Math.abs(s0.top - s1.top), 'Emplacements sur deux colonnes').toBeLessThan(1);
  expect(s0.right).toBeLessThanOrEqual(s1.left);
  await press(page.locator('#shopBackBtn'), hasTouch);
  // chaque écran s'ouvre en haut : rien n'a défilé, la flèche retour et le titre sont à l'écran ; les écrans à lire
  // gardent une colonne de 760 px au plus
  for (const [opener, screen, back, reading] of [
    ['charsBtn', 'characters', 'charactersBackBtn', false],
    ['shopBtn', 'shop', 'shopBackBtn', false],
    ['achBtn', 'achievements', 'achBackBtn', false],
    ['libBtn', 'library', 'libBackBtn', false],
    ['boardBtn', 'board', 'boardBackBtn', true],
    ['dailyBtn', 'daily', 'dailyBackBtn', true],
    ['notesBtn', 'notes', 'notesBackBtn', true],
    ['accountBtn', 'account', 'accountBackBtn', true],
    ['settingsBtn', 'settings', 'settingsBackBtn', true],
  ] as const) {
    await press(page.locator('#' + opener), hasTouch);
    await expect(page.locator('#' + screen)).toBeVisible();
    expect(await page.locator('#' + screen).evaluate((s) => s.scrollTop), `${screen} s'ouvre en haut`).toBe(0);
    await expectInside(page, '#' + back);
    await expectInside(page, `#${screen} h2.h1`);
    const w = (await box(page, `#${screen} .panel`)).width;
    if (reading) expect(w, `${screen} : colonne de lecture`).toBeLessThanOrEqual(760.5);
    else expect(w, `${screen} : jusqu'à 1040 px`).toBeLessThanOrEqual(1040.5);
    if (screen === 'daily') {
      // « Lancer le défi » reste à l'écran, au-dessus de la barre d'onglets
      await expectInside(page, '#dailyPlayBtn');
      expect(overlap(await box(page, '#dailyPlayBtn'), await box(page, '#tabBar'))).toBe(false);
    }
    await press(page.locator('#' + back), hasTouch);
    await expect(page.locator('#menu')).toBeVisible();
  }
});

test('The HUD grows on a tablet', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } }); // SwiftShader : rendu réduit
  });
  await startRun(page, 3);
  await page.evaluate(() => (window as any).__game.debug.god());
  const sizes = async () => ({
    time: (await box(page, '#time')).height,
    map: (await box(page, '#minimap')).width,
    hp: (await box(page, '.hpbar')).height,
    pause: (await box(page, '#pauseBtn')).width,
    jump: hasTouch ? (await box(page, '#btnJump')).width : 0,
    slide: hasTouch ? (await box(page, '#btnSlide')).width : 0,
    spell: hasTouch ? (await box(page, '#btnSpell')).width : 0,
  });
  // téléphone : les tailles de la 1.62.0
  const phone = await sizes();
  expect(await css(page.locator('#time'), 'font-size')).toBe('30px');
  expect(parseFloat(await css(page.locator('#hud'), 'zoom'))).toBe(1);
  expect(phone.map).toBeCloseTo(96, 0);
  expect(phone.hp).toBeCloseTo(6, 0);
  expect(phone.pause).toBeCloseTo(44, 0);
  if (hasTouch) {
    expect(phone.jump).toBeCloseTo(84, 0);
    expect(phone.slide).toBeCloseTo(62, 0);
    expect(phone.spell).toBeCloseTo(70, 0);
  }
  // tablette en portrait : tout grandit de 1,25 au moins, sans recharger (la partie continue)
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect.poll(async () => (await sizes()).map).toBeGreaterThanOrEqual(130);
  const tablet = await sizes();
  for (const k of ['time', 'map', 'hp', 'pause', 'jump', 'slide', 'spell'] as const)
    expect(tablet[k], `${k} : ${phone[k]} → ${tablet[k]}`).toBeGreaterThanOrEqual(phone[k] * 1.25);
  await expectInside(page, '#minimap');
  await expectApart(page, ['#timeBox', '#minimap', '.hleft']);
  await expectApart(page, ['#timeBox', '#hptxt', '#goldBox']); // les PV en chiffres ne mordent pas sur le chrono
  expect(await app(page)).toBe('play');
  if (hasTouch) {
    // les boutons agrandis répondent là où ils sont dessinés : un appui au centre du bouton de saut fait sauter
    for (const s of ['#btnJump', '#btnSlide', '#btnSpell']) await expectInside(page, s);
    await expectApart(page, ['#btnJump', '#btnSlide', '#btnSpell']);
    const j = await box(page, '#btnJump');
    await page.touchscreen.tap(j.left + j.width / 2, j.top + j.height / 2);
    await page.waitForFunction(() => (window as any).__game.world.player.y > 0, null, { timeout: 3000 });
    // le joystick flottant reste sous le doigt (il n'est dans aucun élément agrandi)
    const cdp = await page.context().newCDPSession(page);
    const [x0, y0] = [200, 700];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    await expect(page.locator('#stick')).toHaveClass(/on/);
    const st = await box(page, '#stick');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(Math.abs(st.left + st.width / 2 - x0)).toBeLessThan(6);
    expect(Math.abs(st.top + st.height / 2 - y0)).toBeLessThan(6);
  } else {
    // au clavier (parité) : les rappels de touches grandissent du même facteur
    expect(parseFloat(await css(page.locator('#keys'), 'zoom'))).toBeGreaterThanOrEqual(1.25);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => (window as any).__game.world.player.y > 0, null, { timeout: 3000 });
  }
  // écran large : le HUD grandit aussi
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(async () => parseFloat(await css(page.locator('#hud'), 'zoom'))).toBeGreaterThanOrEqual(1.25);
  expect((await box(page, '#minimap')).width).toBeGreaterThanOrEqual(130);
  // téléphone à l'horizontale : inchangé
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => parseFloat(await css(page.locator('#hud'), 'zoom'))).toBe(1);
});

test('A press shows at once', async ({ page, hasTouch }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await veteran(page);
  const shown = (sel: string) =>
    page.evaluate((s) => {
      const st = getComputedStyle(document.querySelector(s)!);
      return `${st.backgroundImage}|${st.backgroundColor}|${st.transform}|${st.filter}`;
    }, sel);
  /**
   * Appuie sur l'élément sans relâcher, puis relâche. L'appui est celui du pointeur de la souris dans les deux
   * projets : le Chromium sans écran n'applique pas `:active` aux touchers injectés par CDP (ni `touchStart` ni
   * geste synthétisé, vérifié), alors qu'un vrai doigt l'applique. La règle CSS vérifiée est la même.
   */
  const hold = async (sel: string): Promise<void> => {
    await expect(page.locator(sel)).toBeVisible();
    await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' })); // hors de la barre d'onglets
    const idle = await shown(sel);
    const b = await box(page, sel);
    const [x, y] = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    expect(
      await page.evaluate(([px, py, s]) => !!document.elementFromPoint(px, py)?.closest(s), [x, y, sel] as const),
      `${sel} est sous le pointeur`,
    ).toBe(true);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect.poll(() => shown(sel), { message: `${sel} : état pressé`, timeout: 3000 }).not.toBe(idle);
    await page.mouse.up();
    await expect.poll(() => shown(sel), { message: `${sel} : relâché`, timeout: 3000 }).toBe(idle);
  };
  // une flèche du carrousel (le héros change au relâchement)
  await hold('#heroNext');
  await expect(page.locator('#heroName')).toHaveText('Bûcheron');
  await hold('#heroPrev');
  // la puce de profil, l'or, les réglages, le prochain objectif et la ligne des missions réagissent aussi
  for (const [sel, back] of [
    ['#accountBtn', '#accountBackBtn'],
    ['#menuGold', '#shopBackBtn'],
    ['#settingsBtn', '#settingsBackBtn'],
    ['#goalBtn', '#achBackBtn'],
  ] as const) {
    await hold(sel);
    await press(page.locator(back), hasTouch);
    await expect(page.locator('#menu')).toBeVisible();
  }
  // la ligne des missions : pressée sous le pointeur ; relâchée, elle ouvre le panneau (Échap le referme)
  {
    const line = '#missions summary';
    const idle = await shown(line);
    const b = await box(page, line);
    await page.mouse.move(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    await page.mouse.down();
    await expect.poll(() => shown(line), { message: `${line} : état pressé`, timeout: 3000 }).not.toBe(idle);
    await page.mouse.up();
    await expect(page.locator('#missionList .mission').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#missionList .mission').first()).toBeHidden();
  }
  // un onglet : l'écran s'ouvre au relâchement, l'onglet n'est plus pressé
  await hold('#shopBtn');
  await expect(page.locator('#shop')).toBeVisible();
  await hold('#shopBackBtn'); // la flèche retour
  await expect(page.locator('#menu')).toBeVisible();
  // le bouton Nouveautés, puis une ligne de la liste des versions
  await hold('#notesBtn');
  await expect(page.locator('#notes')).toBeVisible();
  await expect(page.locator('#notesList details').nth(1)).toBeVisible();
  await hold('#notesList details:nth-of-type(2) summary');
  await expect(page.locator('#notesList details').nth(1)).toHaveAttribute('open', '');
});

test('The first press answers without waiting', async ({ page, hasTouch }) => {
  test.setTimeout(240_000); // processeur ralenti 4 fois : la scène met du temps à se préparer, après coup
  await page.setViewportSize({ width: 390, height: 844 });
  // un joueur revenu (pas d'aide du premier lancement), page chargée sans le mode debug
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('ruee-meta')) localStorage.setItem('ruee-meta', JSON.stringify({ seenHelp: true }));
    } catch {
      /* stockage bloqué */
    }
    const w = window as any;
    w.__long = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__long.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
    w.__press = [];
    addEventListener('pointerdown', () => w.__press.push(performance.now()), true);
  });
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.locator('#menu')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500); // la page est posée : polices, images, service worker
  // rien de la scène n'est parti avant le premier geste : le canvas du jeu n'a pas encore sa taille de rendu
  const untouched = () => page.evaluate(() => (document.getElementById('c') as HTMLCanvasElement).width === 300);
  expect(await untouched()).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  /** Appuie sur `sel` et rend le délai entre l'appui et la première image où l'écran `screen` est affiché. */
  const pressAndTime = async (sel: string, screen: string): Promise<number> => {
    const n = await page.evaluate((s) => {
      const w = window as any;
      w.__shown = 0;
      const el = document.getElementById(s)!;
      const tick = (): void => {
        if (el.hidden) requestAnimationFrame(tick);
        else requestAnimationFrame(() => (w.__shown = performance.now()));
      };
      requestAnimationFrame(tick);
      return w.__press.length as number;
    }, screen);
    await press(page.locator(sel), hasTouch);
    await page.waitForFunction(() => (window as any).__shown > 0, null, { timeout: 60_000 });
    return page.evaluate((i) => (window as any).__shown - (window as any).__press[i], n);
  };
  // le tout premier appui, sur un onglet : l'écran en moins de 400 ms
  const first = await pressAndTime('#charsBtn', 'characters');
  expect(first, `premier appui → écran : ${Math.round(first)} ms`).toBeLessThan(400);
  expect(await untouched(), 'la scène ne se prépare pas dans le premier geste').toBe(true);
  // d'autres appuis au menu, espacés de moins que le délai de repos : la préparation attend toujours
  await page.waitForTimeout(700);
  const back = await pressAndTime('#charactersBackBtn', 'menu');
  expect(back, `retour → accueil : ${Math.round(back)} ms`).toBeLessThan(400);
  await page.waitForTimeout(700);
  const second = await pressAndTime('#achBtn', 'achievements');
  expect(second, `deuxième onglet → écran : ${Math.round(second)} ms`).toBeLessThan(400);
  // la scène se prépare ensuite, écran au repos : le canvas prend sa taille de rendu
  await expect.poll(async () => !(await untouched()), { timeout: 120_000, intervals: [500] }).toBe(true);
  await page.waitForTimeout(3000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // aucune tâche de plus de 200 ms n'a démarré dans la seconde qui suit un appui
  const { long, presses } = await page.evaluate(() => ({
    long: (window as any).__long as { start: number; dur: number }[],
    presses: (window as any).__press as number[],
  }));
  expect(presses.length).toBeGreaterThanOrEqual(3);
  const late = long.filter((t) => t.dur > 200 && presses.some((p) => t.start >= p - 20 && t.start < p + 1000));
  expect(
    late.map((t) => `${Math.round(t.dur)} ms à ${Math.round(t.start)}`),
    `tâches longues : ${long.map((t) => `${Math.round(t.start)}+${Math.round(t.dur)}`).join(' ')} ; appuis : ${presses.map((p) => Math.round(p)).join(' ')}`,
  ).toEqual([]);
  // la préparation a bien eu lieu après les appuis (du travail lourd, écran au repos)
  const last = presses[presses.length - 1];
  expect(long.some((t) => t.start >= last + 1000)).toBe(true);
});

test('Play as the first gesture still starts the run', async ({ page, hasTouch }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('ruee-meta')) localStorage.setItem('ruee-meta', JSON.stringify({ seenHelp: true }));
    } catch {
      /* stockage bloqué */
    }
    const w = window as any;
    w.__press = 0;
    w.__loading = 0;
    addEventListener('pointerdown', () => (w.__press ||= performance.now()), true);
    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('playBtn') as HTMLButtonElement;
      // l'état « chargement » : bouton indisponible ; l'instant de la première image qui le montre
      new MutationObserver(() => {
        if (btn.disabled && !w.__loading) requestAnimationFrame(() => (w.__loading = performance.now()));
      }).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
    });
  });
  await page.goto('/'); // sans le mode debug : la scène n'est pas préparée d'avance
  await page.waitForLoadState('load');
  const play = page.locator('#playBtn');
  await expect(play).toBeVisible();
  await expect(play).toHaveText('Jouer');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (document.getElementById('c') as HTMLCanvasElement).width)).toBe(300); // rien de prêt
  await press(play, hasTouch); // le premier geste de la session
  await page.waitForFunction(() => (window as any).__loading > 0, null, { timeout: 10_000 });
  const delay = await page.evaluate(() => (window as any).__loading - (window as any).__press);
  expect(delay, `appui → « Chargement… » : ${Math.round(delay)} ms`).toBeLessThan(300);
  // puis la partie démarre
  await page.waitForFunction(() => document.getElementById('hud')?.hidden === false, null, { timeout: 90_000 });
  await expect(page.locator('#menu')).toBeHidden();
  await expect(play).toHaveText('Jouer'); // l'état « chargement » est levé
});

test('Nothing overflows at the usual sizes', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await veteran(page, { streak: { last: dayKey(-1), count: 12, best: 12, jokerWeek: '' }, seenNotes: '1.40.0' });
  const tabs = ['#charsBtn', '#shopBtn', '#achBtn', '#libBtn', '#boardBtn'];
  for (const [width, height] of [
    [360, 640],
    [390, 844],
    [540, 720],
    [717, 880],
    [820, 1180],
    [1180, 820],
    [844, 390],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    const where = `${width} × ${height}`;
    await expect(page.locator('#playBtn')).toBeVisible();
    // pas de défilement horizontal
    const wide = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      menu: document.getElementById('menu')!.scrollWidth,
      inner: innerWidth,
    }));
    expect(wide.doc, `défilement horizontal (${where})`).toBeLessThanOrEqual(wide.inner);
    expect(wide.menu, `défilement horizontal de l'accueil (${where})`).toBeLessThanOrEqual(wide.inner);
    // « Jouer », les cinq onglets et le reste de l'accueil dans l'écran, sans chevauchement
    const parts = ['.home-top', '#heroPortrait', '.carousel', '#goalBtn', '#missions summary', '#playBtn'];
    for (const s of [...parts, '#dailyBtn', '#notesBtn', '#notesDot', ...tabs]) await expectInside(page, s);
    await expectApart(page, [...parts, '#tabBar']);
    await expectApart(page, ['#dailyBtn', '#notesBtn', '#heroPortrait', '#goalBtn', '#playBtn']);
    await expectApart(page, tabs);
    // le héros garde une taille lisible
    expect((await box(page, '#heroPortrait')).height, `portrait (${where})`).toBeGreaterThanOrEqual(90);
    // aucune cible tactile sous 44 px
    const targets = await homeTargets(page);
    expect(targets.length).toBeGreaterThanOrEqual(14);
    for (const t of targets) {
      expect(t.w, `largeur de ${t.id} (${where})`).toBeGreaterThanOrEqual(43.5);
      expect(t.h, `hauteur de ${t.id} (${where})`).toBeGreaterThanOrEqual(43.5);
    }
  }
});
