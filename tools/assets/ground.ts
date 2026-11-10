// Phase 44 : textures de sol (Poly Haven, CC0) → public/models/ground-<monde>-<a|b>.jpg.
// Les textures sources sont des photos : réduites, adoucies, puis ramenées vers une teinte franche (la photo ne garde
// que son grain et ses nuances) pour un sol « peint » qui va avec le décor stylisé. Deux par monde : `a` (herbe ou
// tapis du monde) et `b` (terre des sous-bois, des rives et des pentes), mélangées au rendu par un poids par sommet.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { GROUND } from './config';
import type { GroundSpec } from './config';

/** Télécharge (une fois, dans le cache hors dépôt) la couleur 1k d'une texture Poly Haven. */
async function fetchDiffuse(cache: string, id: string): Promise<string> {
  const file = path.join(cache, `${id}.jpg`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(cache, { recursive: true });
  const meta = (await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()) as Record<
    string,
    Record<string, Record<string, { url: string }>>
  >;
  const url = meta.Diffuse?.['1k']?.jpg?.url;
  if (!url) throw new Error(`Poly Haven : pas de couleur 1k pour ${id}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Poly Haven : ${id} → ${res.status}`);
  fs.writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  return file;
}

/** Étalonne une texture : luminance de la photo × teinte franche, mêlée à la photo, contraste adouci. */
async function grade(src: string, s: GroundSpec, size: number): Promise<Buffer> {
  const { data } = await sharp(src)
    .removeAlpha()
    .resize(size, size, { fit: 'fill' })
    .blur(s.blur ?? 0.6)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // luminance moyenne : la teinte est appliquée autour d'elle, le grain de la photo devient une nuance claire/sombre
  let mean = 0;
  for (let i = 0; i < data.length; i += 3) mean += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  mean /= data.length / 3;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / mean;
    const k = 1 + (l - 1) * s.contrast;
    for (let c = 0; c < 3; c++) {
      const tinted = s.tint[c] * 255 * k;
      const photo = (data[i + c] / mean) * (0.299 * s.tint[0] + 0.587 * s.tint[1] + 0.114 * s.tint[2]) * 255;
      out[i + c] = Math.max(0, Math.min(255, tinted * s.mix + photo * (1 - s.mix)));
    }
  }
  return sharp(out, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Construit les textures de sol ; retourne la taille de chaque fichier (version dans l'URL). */
export async function buildGround(cache: string, outDir: string): Promise<Record<string, number>> {
  const files: Record<string, number> = {};
  for (let w = 0; w < GROUND.worlds.length; w++)
    for (const slot of ['a', 'b'] as const) {
      const s = GROUND.worlds[w][slot];
      const jpg = await grade(await fetchDiffuse(cache, s.id), s, GROUND.size);
      const name = `ground-${w + 1}-${slot}.jpg`;
      fs.writeFileSync(path.join(outDir, name), jpg);
      files[name] = jpg.byteLength;
      console.log(`${name.padEnd(26)} ${(jpg.byteLength / 1024).toFixed(0).padStart(5)} Ko  ${s.id}`);
    }
  return files;
}
