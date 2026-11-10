#!/usr/bin/env node
// Médiane de plusieurs rapports Lighthouse (JSON) et vérification des seuils de la porte de phase 5.
// Une seule définition des seuils, utilisée en local (`npm run lh`) et en CI.
//   node tools/lh-median.mjs lh-mobile-1.json lh-mobile-2.json lh-mobile-3.json [--pwa lh-pwa.json]
// Sort en erreur (code 1) si la médiane d'une catégorie est sous son seuil.
import { readFileSync } from 'node:fs';

const THRESHOLDS = { performance: 85, accessibility: 90, 'best-practices': 90 }; // PLAN.md §5 phase 5 : perf mobile ≥ 85
const PWA_THRESHOLD = 100; // skill pwa-release §6 (Lighthouse 11, dernière version avec la catégorie PWA)
const METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
];

const args = process.argv.slice(2);
const pwaIdx = args.indexOf('--pwa');
const pwaFile = pwaIdx >= 0 ? args.splice(pwaIdx, 2)[1] : null;
if (args.length === 0) {
  console.error('usage : node tools/lh-median.mjs <rapport.json>... [--pwa <rapport-pwa.json>]');
  process.exit(2);
}

const reports = args.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const score = (r, cat) => Math.round((r.categories[cat]?.score ?? 0) * 100);

let failed = false;
console.log(
  `Lighthouse ${reports[0].lighthouseVersion} · ${reports.length} run(s) · ${reports[0].configSettings?.formFactor ?? '?'}`,
);
for (const cat of Object.keys(THRESHOLDS)) {
  if (!reports[0].categories[cat]) continue;
  const all = reports.map((r) => score(r, cat));
  const med = median(all);
  const ok = med >= THRESHOLDS[cat];
  if (!ok) failed = true;
  console.log(
    `${ok ? '✔' : '✘'} ${cat.padEnd(16)} médiane ${String(med).padStart(3)} (runs ${all.join(' / ')}) · seuil ${THRESHOLDS[cat]}`,
  );
}
for (const id of METRICS) {
  const vals = reports.map((r) => r.audits[id]?.numericValue).filter((v) => typeof v === 'number');
  if (!vals.length) continue;
  const med = median(vals);
  const txt = id === 'cumulative-layout-shift' ? med.toFixed(3) : `${Math.round(med)} ms`;
  console.log(`  ${id.padEnd(26)} ${txt}`);
}
// Les trois pires audits de performance (diagnostics), pour attribuer les points perdus.
const perf = reports[0].categories.performance;
if (perf) {
  const worst = perf.auditRefs
    .map((a) => ({
      id: a.id,
      weight: a.weight,
      score: reports[0].audits[a.id]?.score,
      display: reports[0].audits[a.id]?.displayValue,
    }))
    .filter((a) => a.score !== null && a.score !== undefined && a.score < 0.9)
    .sort((a, b) => b.weight - a.weight || a.score - b.score)
    .slice(0, 8);
  for (const a of worst)
    console.log(`  ↓ ${a.id} (poids ${a.weight}) score ${Math.round(a.score * 100)} ${a.display ?? ''}`);
}
if (pwaFile) {
  const pwa = JSON.parse(readFileSync(pwaFile, 'utf8'));
  const s = score(pwa, 'pwa');
  const ok = s >= PWA_THRESHOLD;
  if (!ok) failed = true;
  console.log(`${ok ? '✔' : '✘'} pwa              ${s} · seuil ${PWA_THRESHOLD}`);
}
process.exit(failed ? 1 : 0);
