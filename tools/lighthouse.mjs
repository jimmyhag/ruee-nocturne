#!/usr/bin/env node
// Mesure Lighthouse reproductible de la porte de phase 5 : sert `dist/` (vite preview), lance N runs mobiles
// (Lighthouse 13 : performance, accessibilité, bonnes pratiques) et 1 run PWA (Lighthouse 11, dernière version
// avec la catégorie), puis délègue médiane et seuils à tools/lh-median.mjs. Le serveur est arrêté à la fin.
//   npm run lh                 # 3 runs, port 4173
//   npm run lh -- --runs 5 --port 4273 --no-pwa
// CHROME_PATH : binaire Chromium (en local, celui de Playwright : /opt/pw-browsers/chromium-*/chrome-linux*/chrome).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const RUNS = +arg('--runs', 3);
const PORT = +arg('--port', 4173);
const PWA = !process.argv.includes('--no-pwa');
const OUT = 'lighthouse';
const URL = `http://localhost:${PORT}/`;
const FLAGS = '--headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader';

if (!existsSync('dist/index.html')) {
  console.error('dist/ absent : lance `npm run build` d’abord');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => {
  if (!server.killed) server.kill();
};
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

// attente du serveur (jusqu'à 30 s)
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(URL);
    if (r.ok) break;
  } catch {
    /* pas encore prêt */
  }
  await new Promise((r) => setTimeout(r, 500));
  if (i === 59) {
    console.error('le serveur de preview ne répond pas');
    process.exit(1);
  }
}

const lh = (pkg, args) => {
  const r = spawnSync('npx', ['--yes', pkg, URL, ...args, '--quiet', `--chrome-flags=${FLAGS}`], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${pkg} a échoué (code ${r.status})`);
    process.exit(1);
  }
};

const files = [];
for (let i = 1; i <= RUNS; i++) {
  const f = `${OUT}/mobile-${i}.json`;
  console.log(`▶ run mobile ${i}/${RUNS}`);
  lh('lighthouse@13', [
    '--only-categories=performance,accessibility,best-practices',
    '--form-factor=mobile',
    '--output=json',
    `--output-path=${f}`,
  ]);
  files.push(f);
}
const median = ['tools/lh-median.mjs', ...files];
if (PWA) {
  console.log('▶ run PWA (Lighthouse 11)');
  lh('lighthouse@11.7.1', ['--only-categories=pwa', '--output=json', `--output-path=${OUT}/pwa.json`]);
  median.push('--pwa', `${OUT}/pwa.json`);
}
stop();
const res = spawnSync('node', median, { stdio: 'inherit' });
process.exit(res.status ?? 1);
