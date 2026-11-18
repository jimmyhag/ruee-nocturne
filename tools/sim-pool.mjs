// Regroupe les sorties `--out` de plusieurs graines d'un même réglage (phase 53).
// Une simulation de 200 parties n'en laisse que ≈ 40 en monde infini : la médiane du temps tenu y varie de 3 à 7 min
// d'une graine à l'autre (elle saute d'une vague de boss à la suivante). On lance donc le même réglage sur plusieurs graines, chacune avec `--out`, et on lit les
// chiffres sur toutes les parties réunies.
//   npm run sim -- --runs 200 --seed 42 --profile maxed --endless --out sim/ref-maxed-42.json   (puis 43, 44, 45)
//   node tools/sim-pool.mjs sim ref g50        → une fiche par préfixe et par profil (fichiers <préfixe>-<profil>-<graine>.json)
import { readFileSync, readdirSync } from 'node:fs';

const [dir, ...prefixes] = process.argv.slice(2);
if (!dir || prefixes.length === 0) {
  console.error('usage : node tools/sim-pool.mjs <dossier> <préfixe> [<préfixe>…]');
  process.exit(2);
}
const fmt = (s) => {
  if (!Number.isFinite(s)) return '–';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const quantile = (values, p) => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : '–');

for (const prefix of prefixes)
  // lot L3 : `daily` (fichiers <préfixe>-daily-<graine>.json, `--daily`) ; sa « victoire » est le défi réussi
  for (const profile of ['maxed', 'naked', 'daily']) {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(`${prefix}-${profile}-`) && f.endsWith('.json'))
      .sort();
    if (files.length === 0) continue;
    const all = [];
    const perSeed = [];
    for (const f of files) {
      const runs = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).results;
      all.push(...runs);
      const share = (test) => pct(runs.filter(test).length, runs.length);
      perSeed.push(
        `${f.slice(prefix.length + profile.length + 2, -5)} : ${share((r) => r.stage >= 2)} / ${share((r) => r.stage >= 3)} / ${share((r) => r.reachedEnd)}`,
      );
    }
    const n = all.length;
    const count = (test) => all.filter(test).length;
    const mean = (key) => (all.reduce((sum, r) => sum + r[key], 0) / n).toFixed(2);
    const endless = all.filter((r) => r.endless);
    const held = endless.map((r) => r.endlessT);
    console.log(`== ${prefix} · ${profile} · ${n} parties (${files.length} graines)`);
    if (profile === 'daily')
      console.log(
        `   défi réussi ${pct(
          count((r) => r.reachedEnd),
          n,
        )} % · kills p50 ${quantile(
          all.map((r) => r.kills),
          0.5,
        )} · ratés morts p50 à ${fmt(
          quantile(
            all.filter((r) => !r.reachedEnd).map((r) => r.time),
            0.5,
          ),
        )}`,
      );
    console.log(
      `   monde 2 ${pct(
        count((r) => r.stage >= 2),
        n,
      )} % · monde 3 ${pct(
        count((r) => r.stage >= 3),
        n,
      )} % · victoire ${pct(
        count((r) => r.reachedEnd),
        n,
      )} % · morts < 3 min ${pct(
        count((r) => r.time < 180),
        n,
      )} % · survie p50 ${fmt(
        quantile(
          all.map((r) => r.time),
          0.5,
        ),
      )}`, // lot L2 : la médiane regroupée (cible du profil nu : 4–6 min)
    );
    console.log(
      `   coffres de carte ${mean('mapChests')} · objets ${mean('itemN')} (dont achetés ${mean('bought')}) · sanctuaires ${mean('shrines')} · or gardé p50 ${Math.round(
        quantile(
          all.map((r) => r.gold),
          0.5,
        ),
      )}`,
    );
    console.log(
      `   monde infini ${held.length} parties · tenu p10 ${fmt(quantile(held, 0.1))} p50 ${fmt(quantile(held, 0.5))} p90 ${fmt(quantile(held, 0.9))} · ≥ 6 vagues ${pct(endless.filter((r) => r.endlessWave >= 6).length, held.length)} %`,
    );
    console.log(`   par graine (monde 2 / monde 3 / victoire) ${perSeed.join(' · ')}`);
  }
