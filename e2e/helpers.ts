// Aides partagées par les specs : accès à `window.__game` (exposé avec ?debug=1).
import type { Page } from '@playwright/test';

export const DEBUG_URL = '/?debug=1';

/** Erreurs console à ignorer : polices Google indisponibles hors ligne (CI), ce n'est pas un bug. */
export function isIgnorableConsoleError(text: string): boolean {
  return /fonts\.(googleapis|gstatic)\.com|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(text);
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isIgnorableConsoleError(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function openGame(page: Page): Promise<void> {
  await page.goto(DEBUG_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
}

/** Clique (ou tape) sur Jouer et attend que la partie tourne. */
export async function startRun(page: Page, variant = 1): Promise<void> {
  await page.evaluate((v) => (window as any).__game.start(v), variant);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}

export async function appMode(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__game.app as string);
}

export async function player(page: Page): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(() => {
    const p = (window as any).__game.world.player;
    return { x: p.x, y: p.y, z: p.z };
  });
}
