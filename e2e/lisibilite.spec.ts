// Phase 51 (retour de Jimmy) : élites reconnaissables, coffres lâchés visibles et sonores, minicarte lisible, totems de
// boss toujours sur la carte.
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

test('élite : couronne, aura, double anneau ; tuée, son coffre s’annonce (colonne, halo, son)', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 7);
  await page.waitForFunction(() => {
    const s = (window as any).__game.scene;
    return s.enemyKind === 'gltf' && s.propsReady === true;
  });
  // jeu figé (plus aucune apparition), joueur invincible : on pose un monstre de base et une élite du même type côte à
  // côte et on compte ce que l'élite ajoute aux écrivains d'instances
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.debug.speed(0);
  });
  await page.waitForTimeout(400);
  const count = () =>
    page.evaluate(() => {
      const g = (window as any).__game,
        s = g.scene;
      return {
        elites: g.world.enemies.slice(0, g.world.enemyCount).filter((e: any) => e.elite).length,
        met: s.metW.mesh.count as number,
        gem: s.gemW.mesh.count as number,
        glow: s.glowW.mesh.count as number,
        beam: s.beamW.mesh.count as number,
        calls: g.renderer.info.render.calls as number,
      };
    });
  // d'abord le monstre de base seul : la mesure « avant » a déjà son maillage et son ombre
  await page.evaluate(() => (window as any).__game.debug.spawn(0, 1, 3.2));
  await page.waitForTimeout(2000); // quelques images, même à 1 image par seconde en rendu logiciel
  const before = await count();
  expect(before.elites).toBe(0);
  // puis l'élite du même type, à côté (1 PV : elle tombera au premier coup)
  await page.evaluate(() => (window as any).__game.debug.elite(0, 3.2, 1.2, 1));
  // on attend l'image où l'élite est dessinée (ses deux anneaux), pas une durée
  await expect.poll(async () => (await count()).met - before.met, { timeout: 20_000 }).toBe(2);
  const marks = await count();
  expect(marks.elites).toBe(1);
  expect(marks.met - before.met, 'deux anneaux dorés').toBe(2);
  expect(marks.gem - before.gem, 'la couronne').toBe(1);
  expect(marks.glow - before.glow, 'l’aura').toBeGreaterThanOrEqual(1);
  // aucun maillage nouveau : une élite n'ajoute d'appel que si un de ses trois écrivains (anneaux, cristaux, lueurs)
  // était vide, comme ici en tout début de partie. En combat ils sont déjà dessinés (gemmes au sol, armes lumineuses)
  expect(marks.calls - before.calls, 'appels de dessin ajoutés par une élite, au pire').toBeLessThanOrEqual(3);
  expect(marks.calls, 'budget d’appels').toBeLessThanOrEqual(p === 'mobile' ? 40 : 80);
  await page.screenshot({ path: `shots/${p}-elite.png` });

  // l'élite meurt : un coffre lâché, sa colonne, son halo, et le son de drop part
  const drops0 = await page.evaluate(() => (window as any).__game.audio.drops as number);
  const powers0 = await page.evaluate(() => (window as any).__game.world.powerCount as number);
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const k of Object.keys(g.world.weapons)) delete g.world.weapons[k];
    g.debug.give('aura', 8); // le Halo touche tout ce qui est à portée
    g.debug.speed(1);
  });
  await page.waitForFunction(() => (window as any).__game.world.chestCount === 1, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  const readDrop = () =>
    page.evaluate(() => {
      const g = (window as any).__game,
        s = g.scene;
      return {
        chest: s.chestW.mesh.count as number,
        beam: s.beamW.mesh.count as number,
        drops: g.audio.drops as number,
        powers: g.world.powerCount as number,
      };
    });
  await expect.poll(async () => (await readDrop()).chest, { timeout: 20_000 }).toBe(1);
  const drop = await readDrop();
  expect(drop.chest).toBe(1);
  expect(drop.beam - before.beam, 'colonne du coffre lâché').toBe(1);
  // une élite lâche aussi un bonus au sol une fois sur cinq (POWER.eliteChance), qui a son propre son de drop :
  // un son au moins (le coffre), un de plus au plus par bonus tombé
  expect(drop.drops - drops0, 'le son du coffre est parti').toBeGreaterThanOrEqual(1);
  expect(drop.drops - drops0, 'pas de son de drop en trop').toBeLessThanOrEqual(1 + (drop.powers - powers0));
  await page.screenshot({ path: `shots/${p}-coffre-lache.png` });
  expect(errors).toEqual([]);
});

/** Couleur d'un point de la minicarte, donné en coordonnées du monde (décalage en pixels en option). */
async function miniPixel(page: Page, x: number, z: number, dx = 0, dz = 0): Promise<number[]> {
  return page.evaluate(
    ([x, z, dx, dz]) => {
      const g = (window as any).__game,
        c = document.getElementById('minimap') as HTMLCanvasElement,
        k = c.width / 110, // VIEW de src/ui/minimap.ts
        px = (x - (g.world.player.x - 55)) * k + dx,
        pz = (z - (g.world.player.z - 55)) * k + dz;
      const d = c.getContext('2d')!.getImageData(Math.round(px), Math.round(pz), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    [x, z, dx, dz],
  );
}
const near = (rgb: number[], hex: number, tol = 45): boolean =>
  Math.abs(rgb[0] - (hex >> 16)) <= tol &&
  Math.abs(rgb[1] - ((hex >> 8) & 255)) <= tol &&
  Math.abs(rgb[2] - (hex & 255)) <= tol;

/** La minicarte ne se redessine que 4 fois par seconde, et bien moins en rendu logiciel : on attend le bon pixel. */
const waitPixel = (read: () => Promise<number[]>, hex: number, what: string) =>
  expect.poll(async () => near(await read(), hex), { message: what, timeout: 20_000 }).toBe(true);

test('minicarte : totem de boss sans exploration, flèche de bord, étoile des bonus, coffre lâché ; légende', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 7);
  // le nombre de totems de boss du monde s'annonce après la bannière d'arrivée, à 2,5 s de temps de jeu : sur une
  // machine chargée le jeu tourne à un sixième de l'horloge, 20 s n'y suffisaient pas
  await expect(page.locator('#banner')).toContainText(/\d totems? de boss dans ce monde/, { timeout: 45_000 });
  const R = 140 / 48; // rayon de base des repères (Math.max(2.5, W / 48))
  const A = R * 1.9; // demi-diagonale du losange d'un totem de boss
  const bt = (await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    for (const k of Object.keys(g.world.weapons)) delete g.world.weapons[k];
    const b = g.world.bossTotems[0];
    return { x: b.x as number, z: b.z as number, n: g.world.bossTotems.length as number };
  })) as { x: number; z: number; n: number };

  // 1. à 30 u du totem : il n'est pas découvert (rayon de découverte 26 u) et pourtant il est sur la minicarte
  const side = bt.x > 0 ? -1 : 1;
  await page.evaluate(([x, z]) => (window as any).__game.debug.teleport(x, z), [bt.x + side * 30, bt.z]);
  await waitPixel(() => miniPixel(page, bt.x, bt.z, A * 0.3, A * 0.3), 0xff8a3d, 'losange orange du totem de boss');
  const seen = await page.evaluate(
    ([x, z]) => {
      const w = (window as any).__game.world,
        n = Math.round(Math.sqrt(w.seen.length)),
        cell = 340 / n;
      return w.seen[Math.floor((z + 170) / cell) * n + Math.floor((x + 170) / cell)] as number;
    },
    [bt.x, bt.z],
  );
  expect(seen, 'le totem de boss n’est pas dans la zone découverte').toBe(0);
  await page.locator('#minimap').screenshot({ path: `shots/${p}-minicarte-totem-de-boss.png` });

  // 2. à 85 u : hors du cadre (55 u de demi-côté), une flèche orange sur le bord, du côté du totem
  await page.evaluate(([x, z]) => (window as any).__game.debug.teleport(x, z), [bt.x + side * 85, bt.z]);
  const edge = () =>
    page.evaluate(
      ([sx, a]) => {
        const c = document.getElementById('minimap') as HTMLCanvasElement,
          x = sx > 0 ? a + a * 0.2 : c.width - a - a * 0.2; // pointe posée à `a` du bord, on lit juste derrière
        const d = c.getContext('2d')!.getImageData(Math.round(x), c.width / 2, 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      [side, A],
    );
  await waitPixel(edge, 0xff8a3d, 'flèche de bord orange');
  await page.locator('#minimap').screenshot({ path: `shots/${p}-minicarte-fleche.png` });

  // 3. bonus au sol : une étoile de sa couleur (Temps figé, bleu clair ; Aimant, rose), plus un disque
  const me = (await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.power('gel', 14, 0);
    g.debug.power('aimant', -14, 0);
    return { x: g.world.player.x as number, z: g.world.player.z as number };
  })) as { x: number; z: number };
  await waitPixel(() => miniPixel(page, me.x + 14, me.z), 0x9fe8ff, 'étoile du Temps figé');
  await waitPixel(() => miniPixel(page, me.x - 14, me.z), 0xff6ad5, 'étoile rose de l’Aimant');
  // entre deux branches de l'étoile, rien : un disque de même rayon y serait plein
  const diag = await miniPixel(page, me.x + 14, me.z, R * 1.2, R * 1.2);
  expect(near(diag, 0x9fe8ff, 30), 'une étoile, pas un disque').toBe(false);

  // 4. coffre lâché : l'élite tombe près du joueur, on s'écarte de 16 u, le coffre reste sur la minicarte
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.give('aura', 8);
    g.debug.elite(0, 2.5, 0, 1);
  });
  await page.waitForFunction(() => (window as any).__game.world.chestCount === 1, null, { timeout: 30_000 });
  const chest = (await page.evaluate(() => {
    const g = (window as any).__game,
      c = g.world.chests[0];
    for (const k of Object.keys(g.world.weapons)) delete g.world.weapons[k];
    g.debug.teleport(c.x - 16, c.z);
    return { x: c.x as number, z: c.z as number };
  })) as { x: number; z: number };
  await waitPixel(() => miniPixel(page, chest.x, chest.z), 0xffe9a0, 'carré doré du coffre lâché');
  expect(await page.evaluate(() => (window as any).__game.world.chestCount)).toBe(1);
  await page.locator('#minimap').screenshot({ path: `shots/${p}-minicarte-reperes.png` });

  // 5. grande carte : la légende donne le nombre de totems de boss du monde, et les nouveaux repères
  await page.locator('#minimap').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#lgBossTotem')).toHaveText(bt.n === 1 ? '1 totem de boss' : `${bt.n} totems de boss`);
  await expect(page.locator('#map .lg.power')).toBeVisible();
  await expect(page.locator('#map .lg.drop')).toBeVisible();
  await page.screenshot({ path: `shots/${p}-grande-carte.png` });
  expect(errors).toEqual([]);
});
