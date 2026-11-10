// Phase 36 : construit public/audio/ (planche de bruitages sfx.mp3, musiques, ambiance) et src/platform/sfx.json à partir
// des banques libres de tools/audio/config.ts.
//   npm run audio            (clones partiels dans .cache/audio, hors dépôt : seuls les fichiers utilisés sont tirés)
// Outil système requis : ffmpeg (avec libmp3lame). Rien n'est ajouté à npm.
// Traitement : mono 44,1 kHz, silence de tête coupé, vitesse (rate), longueur max, fondus 5 ms / 40 ms, niveau moyen
// ramené à la cible de la catégorie (LEVELS) sans dépasser −1 dBFS en crête. La planche met tous les sons bout à bout
// (100 ms de silence en tête, 80 ms entre deux) : un seul fichier à charger, un seul décodage.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS, SOUNDS, SOURCES, TRACKS } from './config';
import type { SourceKey } from './config';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = path.join(ROOT, '.cache/audio');
const TMP = path.join(CACHE, 'tmp');
const OUT = path.join(ROOT, 'public/audio');
const MANIFEST = path.join(ROOT, 'src/platform/sfx.json');
const SR = 44100;
const LEAD = 0.1;
const GAP = 0.08;
/** Coupe le silence de tête d'une musique (appliqué deux fois, à l'endroit puis à l'envers : tête et queue). */
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const probeDur = (f: string) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
/** Niveau moyen et crête (dB) d'un fichier. */
function levels(f: string): { mean: number; peak: number } {
  // volumedetect écrit sur stderr : on le relit par un shell (2>&1)
  const txt = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${f}" -af volumedetect -f null - 2>&1`]).toString();
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(txt)?.[1] ?? -99);
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(txt)?.[1] ?? -99);
  return { mean, peak };
}

/** Clone partiel d'une source (arbre seul), puis checkout des seuls fichiers demandés. */
function fetchFiles(src: SourceKey, files: string[]): string[] {
  const S = SOURCES[src];
  const repo = path.join(CACHE, src);
  if (!fs.existsSync(path.join(repo, '.git'))) {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log(`clone ${S.repo} (partiel)…`);
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', S.repo, repo], {
      stdio: 'inherit',
    });
  }
  const rel = files.map((f) => `${S.dir}/${f}`);
  const missing = rel.filter((r) => !fs.existsSync(path.join(repo, r)));
  if (missing.length) execFileSync('git', ['-C', repo, 'checkout', 'HEAD', '--', ...missing], { stdio: 'inherit' });
  return rel.map((r) => path.join(repo, r));
}

function main(): void {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  // 1. bruitages : chaque variante traitée en WAV mono, niveau ajusté
  const parts: { key: string; file: string; dur: number }[] = [];
  const report: string[] = [];
  for (const [key, d] of Object.entries(SOUNDS)) {
    const srcs = fetchFiles(d.src, d.files);
    srcs.forEach((src, v) => {
      const raw = path.join(TMP, `${key}_${v}_raw.wav`);
      const rate = d.rate ?? 1;
      const af = [
        'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.005',
        rate !== 1 ? `asetrate=${Math.round(SR * rate)},aresample=${SR}` : '',
        `atrim=0:${d.max}`,
      ]
        .filter(Boolean)
        .join(',');
      ff(['-i', src, '-ac', '1', '-ar', String(SR), '-af', af, raw]);
      const dur = probeDur(raw);
      const lv = levels(raw);
      const target = LEVELS[d.level];
      // gain vers la cible (au plus +12 dB) ; un son très percussif (crête haute, moyenne basse) passe par un limiteur
      // doux qui tient la crête à −1 dBFS au lieu de rester trop bas
      const gain = Math.min(12, target - lv.mean);
      const limit = lv.peak + gain > -1;
      const out = path.join(TMP, `${key}_${v}.wav`);
      const fo = Math.min(0.04, dur / 3);
      ff([
        '-i',
        raw,
        '-af',
        `volume=${gain.toFixed(2)}dB${limit ? ',alimiter=limit=0.89:attack=1:release=40:level=disabled' : ''},` +
          `afade=t=in:d=0.005,afade=t=out:st=${(dur - fo).toFixed(3)}:d=${fo.toFixed(3)}`,
        '-ar',
        String(SR),
        '-ac',
        '1',
        out,
      ]);
      parts.push({ key, file: out, dur });
      const after = levels(out);
      report.push(
        `${key}[${v}] ${dur.toFixed(2)} s, moyen ${lv.mean.toFixed(1)} → ${after.mean.toFixed(1)} dB, crête ${after.peak.toFixed(1)} dB${limit ? ' (limiteur)' : ''}`,
      );
    });
  }
  // 2. planche : silences + sons bout à bout, offsets au pas d'échantillon
  const sil = (s: number, name: string) => {
    const f = path.join(TMP, name);
    ff(['-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono`, '-t', s.toFixed(3), f]);
    return f;
  };
  const lead = sil(LEAD, 'lead.wav');
  const gap = sil(GAP, 'gap.wav');
  const list: string[] = [`file '${lead}'`];
  const sounds: Record<string, [number, number][]> = {};
  let t = LEAD;
  for (const p of parts) {
    const dur = probeDur(p.file);
    (sounds[p.key] ??= []).push([+t.toFixed(4), +dur.toFixed(4)]);
    list.push(`file '${p.file}'`, `file '${gap}'`);
    t += dur + GAP;
  }
  const listFile = path.join(TMP, 'list.txt');
  fs.writeFileSync(listFile, list.join('\n'));
  const sheetWav = path.join(TMP, 'sfx.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', sheetWav]);
  const sfx = path.join(OUT, 'sfx.mp3');
  ff(['-i', sheetWav, '-ac', '1', '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', '56k', sfx]);
  // 3. musiques et ambiance
  const tracks: Record<string, { file: string; dur: number; bytes: number }> = {};
  for (const [name, tr] of Object.entries(TRACKS)) {
    const [src] = fetchFiles(tr.src, [tr.file]);
    const out = path.join(OUT, `${name}.mp3`);
    ff([
      '-i',
      src,
      '-ac',
      tr.stereo ? '2' : '1',
      '-ar',
      String(SR),
      '-af',
      // silences de début et de fin coupés (la boucle reprend sans trou), puis niveau intégré à la cible
      (tr.stereo ? `${TRIM},areverse,${TRIM},areverse,` : '') + `loudnorm=I=${tr.lufs}:TP=-1.5:LRA=11`,
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${tr.kbps}k`,
      out,
    ]);
    const bytes = fs.statSync(out).size;
    tracks[name] = { file: `${name}.mp3?v=${bytes}`, dur: +probeDur(out).toFixed(2), bytes };
    report.push(`piste ${name} : ${tracks[name].dur} s, ${(bytes / 1e6).toFixed(2)} Mo`);
  }
  const bytes = fs.statSync(sfx).size;
  const manifest = { sfx: `sfx.mp3?v=${bytes}`, sfxBytes: bytes, sounds, tracks };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(report.join('\n'));
  console.log(
    `planche : ${parts.length} sons, ${t.toFixed(1)} s, ${(bytes / 1000).toFixed(0)} Ko → ${path.relative(ROOT, sfx)}`,
  );
}

main();
