// Porte de phase 4 : un nouveau joueur obtient son premier déblocage en moins de 3 runs ; export/import vérifié.
import { expect, test } from '@playwright/test';
import { openCharacters, openGame, startRun } from './helpers';

/** Profil vierge : on remplace la méta par défaut via le hook de debug (IndexedDB + localStorage). */
async function freshProfile(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.setMeta({ version: 3 }));
}

test('nouveau joueur : premier déblocage (défi du jour) dès le premier run', async ({ page }) => {
  await openGame(page);
  await freshProfile(page);
  await expect(page.locator('#dailyBtn')).toBeHidden();
  await expect(page.locator('#chars .card.char')).toHaveCount(9);
  await expect(page.locator('#chars .card.char.locked')).toHaveCount(8);

  // run 1 : 3 minutes et quelques, puis la mort
  await startRun(page, 5);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(185);
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#oUnlocked')).toBeVisible();
  await expect(page.locator('#oUnlocked')).toContainText('Première nuit');
  await expect(page.locator('#oProgress .ach')).toHaveCount(3); // les 3 succès les plus proches, avec barres
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.runs).toBe(1);
  expect(meta.achievements).toContain('survie3');
  expect(meta.gold).toBeGreaterThan(0);

  // retour au menu : le défi du jour est disponible, l'or s'affiche sur la boutique
  await page.locator('#menuBtn').click();
  await expect(page.locator('#dailyBtn')).toBeVisible();
  await expect(page.locator('#shopBtn')).toContainText('or');
});

test('boutique : acheter un palier débite l’or et le run suivant en bénéficie', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 3, gold: 300 }));
  await page.locator('#shopBtn').click();
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#shopGold')).toHaveText('300 or');
  await expect(page.locator('#shopTitle')).toContainText('Éclaireuse');
  const firstBuy = page.locator('#shopLines .buy').first(); // Vitalité, 200 or
  await firstBuy.click();
  await expect(page.locator('#shopGold')).toHaveText('100 or');
  await page.locator('#shopBackBtn').click();
  await startRun(page, 3);
  const maxHp = await page.evaluate(() => (window as any).__game.world.player.maxHp as number);
  expect(maxHp).toBe(103); // 100 + 3 (phase 8 : +3 PV par palier)
});

test('boutique par personnage : le palier de l’Éclaireuse ne profite pas au Bûcheron, et survit au rechargement', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 3, gold: 500, achievements: ['survie10'], shops: { eclaireuse: [1] } }),
  );
  await page.locator('#shopBtn').click();
  await expect(page.locator('#shopChars .shopchar.sel')).toContainText('Éclaireuse');
  await expect(page.locator('#shopLines .pips').first().locator('i.on')).toHaveCount(1);
  await page.locator('#shopChars [data-char="bucheron"]').click();
  await expect(page.locator('#shopTitle')).toContainText('Bûcheron');
  await expect(page.locator('#shopLines .pips').first().locator('i.on')).toHaveCount(0);
  await expect(page.locator('#shopChars [data-char="sorciere"]')).toBeDisabled(); // verrouillée
  await page.locator('#shopLines .buy').first().click(); // Vitalité du Bûcheron : 200 or
  await expect(page.locator('#shopGold')).toHaveText('300 or');
  await page.locator('#shopBackBtn').click();
  await startRun(page, 3);
  const maxHp = await page.evaluate(() => (window as any).__game.world.player.maxHp as number);
  expect(maxHp).toBe(133); // Bûcheron : 100 + 30, +3 (son propre palier)
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'menu');
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('keyval-store');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const get = req.result.transaction('keyval').objectStore('keyval').get('ruee-meta');
          get.onsuccess = () => resolve(get.result?.shops?.bucheron?.[0] === 1);
          get.onerror = () => resolve(false);
        };
      }),
  );
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.shops).toEqual({ eclaireuse: [1, 0, 0, 0, 0, 0, 0, 0], bucheron: [1, 0, 0, 0, 0, 0, 0, 0] });
});

test('réglages : export puis import restaurent record, or et succès ; le JSON étranger est refusé', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 3, bestTime: 456, gold: 321, runs: 9, achievements: ['survie3'] }),
  );
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settings')).toBeVisible();
  // export : la zone de texte reçoit le JSON (le téléchargement n'est pas attendu sous Playwright)
  const downloadP = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await page.locator('#exportBtn').click();
  await downloadP;
  const json = await page.locator('#saveText').inputValue();
  expect(json).toContain('"app": "ruee-nocturne"');
  // remise à zéro (deux appuis), puis import du texte
  await page.locator('#resetBtn').click();
  await page.locator('#resetBtn').click();
  expect(await page.evaluate(() => (window as any).__game.meta.gold)).toBe(0);
  await page.locator('#saveText').fill(json);
  await page.locator('#importBtn').click();
  await expect(page.locator('#settingsMsg')).toContainText('importée');
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.bestTime).toBe(456);
  expect(meta.gold).toBe(321);
  expect(meta.runs).toBe(9);
  expect(meta.achievements).toEqual(['survie3']);
  // JSON étranger
  await page.locator('#saveText').fill('{"hello":"world"}');
  await page.locator('#importBtn').click();
  await expect(page.locator('#settingsMsg')).toContainText("n'est pas une sauvegarde");
  // la sauvegarde survit au rechargement
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.meta.gold)).toBe(321);
});

test('personnage : le Bûcheron débloqué devient sélectionnable et démarre avec les Lames', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 3, achievements: ['survie3', 'survie10'] }));
  await expect(page.locator('#chars .card.char.locked')).toHaveCount(7); // 9 personnages, 2 débloqués
  await openCharacters(page);
  await page.locator('#chars .card.char[data-char="bucheron"]').click();
  await expect(page.locator('#chars .card.char[data-char="bucheron"]')).toHaveClass(/selected/);
  await startRun(page, 4);
  const w = await page.evaluate(() => {
    const g = (window as any).__game;
    return { weapons: Object.keys(g.world.weapons), hp: g.world.player.maxHp as number };
  });
  expect(w.weapons).toEqual(['lames']);
  expect(w.hp).toBe(130);
});

// Porte de phase 6 : un nouveau personnage en moins de 5 runs (achat en or), et l'achat lui-même.
test('personnage acheté en or : la Veilleuse se débloque en moins de 5 runs d’un nouveau joueur', async ({ page }) => {
  await openGame(page);
  const veilleuse = page.locator('#chars .card.char[data-char="veilleuse"]');
  await expect(veilleuse).toHaveClass(/locked/);
  await expect(veilleuse.locator('.buychar')).toHaveClass(/poor/);
  let runs = 0;
  for (; runs < 4; runs++) {
    await startRun(page, 10 + runs);
    await page.evaluate(() => (window as any).__game.debug.god());
    await page.evaluate(() => (window as any).__game.debug.warp(240)); // 4 min par run, sans aucun talent de joueur
    for (let i = 0; i < 12; i++) {
      // le saut dans le temps laisse des montées de niveau en attente : on prend la carte 1
      if ((await page.evaluate(() => (window as any).__game.app)) !== 'levelup') break;
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => (window as any).__game.debug.kill());
    await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
    await page.locator('#menuBtn').click();
    const gold = await page.evaluate(() => (window as any).__game.meta.gold as number);
    if (gold >= 800) break;
  }
  expect(runs + 1, 'runs nécessaires').toBeLessThan(5);
  await expect(veilleuse.locator('.buychar')).not.toHaveClass(/poor/);
  await openCharacters(page);
  await veilleuse.locator('.buychar').click();
  await expect(veilleuse).not.toHaveClass(/locked/);
  await expect(veilleuse).toHaveClass(/selected/);
  await expect(page.locator('#charInfo')).toContainText('Braise');
  await startRun(page, 5);
  const w = await page.evaluate(() => Object.keys((window as any).__game.world.weapons));
  expect(w).toEqual(['aura']);
});

test('progression lente (phase 10) : une arme au départ, emplacement acheté après « Première nuit » + 300 or, migration v2 remise à zéro', async ({
  page,
}) => {
  await openGame(page);
  await freshProfile(page);
  await expect(page.locator('#slotLine')).toContainText('1 arme');
  await startRun(page, 3);
  let slots = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { w: w.maxWeapons, p: w.maxTomes };
  });
  expect(slots).toEqual({ w: 1, p: 2 });
  // montée de niveau : jamais de « Nouvelle arme » proposée tant que l'emplacement n'est pas acheté
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as any).__game.debug.levelUp());
    await page.waitForSelector('#levelup:not([hidden])');
    await expect(page.locator('#luSlots')).toContainText('Armes 1/1');
    await expect(page.locator('#cards .badge.new.weapon')).toHaveCount(0); // les nouveaux tomes, eux, sont proposés
    await page.locator('#cards .card').first().click();
    await page.waitForFunction(() => (window as any).__game.app === 'play');
  }
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'menu');
  // succès + or : l'arme n°2 s'achète dans la boutique
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, achievements: ['survie3'], gold: 300 });
  });
  await page.locator('#shopBtn').click();
  const first = page.locator('#slotList .slotrow').first();
  await expect(first).toContainText('Arme n°2');
  await expect(first.locator('.buy')).toBeEnabled();
  await expect(page.locator('#slotList .slotrow').nth(1).locator('.buy')).toBeDisabled(); // succès manquant
  await first.locator('.buy').click();
  await expect(page.locator('#shopGold')).toHaveText('0 or');
  await expect(first).toContainText('Débloqué');
  await page.locator('#shopBackBtn').click();
  await expect(page.locator('#slotLine')).toContainText('2 armes');
  await startRun(page, 3);
  slots = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { w: w.maxWeapons, p: w.maxTomes };
  });
  expect(slots).toEqual({ w: 2, p: 2 });
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'menu');
  // une sauvegarde d'avant la 1.5.0 : progression remise à zéro, réglages gardés, bannière affichée
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 2,
      gold: 999,
      runs: 5,
      bought: ['veilleuse'],
      settings: { quality: 'pixel' },
    }),
  );
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.gold).toBe(0);
  expect(meta.bought).toEqual([]);
  expect(meta.settings.quality).toBe('pixel');
  await expect(page.locator('#resetNote')).toBeVisible();
});
