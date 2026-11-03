// Génère les icônes PWA depuis assets/icon.svg avec le Chromium de Playwright (déjà requis par les e2e).
// Pas de dépendance native (sharp) pour quatre PNG. Les fichiers produits sont commités dans public/.
//   npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SRC = 'assets/icon.svg';
const OUT = 'public';
// nom → taille. Le SVG réserve déjà la marge de sécurité de 12 % (zone maskable) : même rendu plein cadre.
const ICONS: Record<string, number> = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
  'apple-touch-icon.png': 180,
};
// icône « store » 1024 px, hors public/ (pas précachée) : docs/store/
const STORE_ICON = { dir: 'docs/store', name: 'icon-1024.png', size: 1024 };

const svg = readFileSync(SRC, 'utf8');
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
try {
  for (const [name, size] of Object.entries(ICONS)) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1c1226"><img src="${dataUrl}" style="display:block;width:${size}px;height:${size}px"></body></html>`,
    );
    await page.waitForLoadState('load');
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(`${OUT}/${name}`, png);
    console.log(`${OUT}/${name}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} ko`);
    await page.close();
  }
  {
    mkdirSync(STORE_ICON.dir, { recursive: true });
    const page = await browser.newPage({
      viewport: { width: STORE_ICON.size, height: STORE_ICON.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1c1226"><img src="${dataUrl}" style="display:block;width:${STORE_ICON.size}px;height:${STORE_ICON.size}px"></body></html>`,
    );
    await page.waitForLoadState('load');
    writeFileSync(`${STORE_ICON.dir}/${STORE_ICON.name}`, await page.screenshot({ type: 'png' }));
    console.log(`${STORE_ICON.dir}/${STORE_ICON.name}  ${STORE_ICON.size}×${STORE_ICON.size}`);
    await page.close();
  }
  writeFileSync(`${OUT}/favicon.svg`, svg);
  console.log(`${OUT}/favicon.svg`);
} finally {
  await browser.close();
}
