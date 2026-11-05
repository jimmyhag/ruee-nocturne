// Phase 20 : construit public/models/*.glb et src/render/models.json à partir des packs KayKit (CC0).
//   npm run assets            (clone les packs dans .cache/kaykit si absents, ~300 Mo, hors dépôt)
//   KAYKIT_DIR=/chemin npm run assets   (packs déjà clonés ailleurs)
// Héros : animations utiles seulement, accessoires choisis, rééchantillonnage, compression meshopt (décodeur fourni par
// three/examples). Objets : un seul fichier, un nœud par objet, transformations cuites, plafond de triangles vérifié.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, mergeDocuments, meshopt, prune, resample, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { BUDGET, HERO_ANIMS, HEROES, PACKS, PROPS } from './config';
import type { PackKey } from './config';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = process.env.KAYKIT_DIR ?? path.join(ROOT, '.cache/kaykit');
const OUT = path.join(ROOT, 'public/models');
const MANIFEST = path.join(ROOT, 'src/render/models.json');

function packDir(p: PackKey): string {
  const repo = path.join(CACHE, PACKS[p]);
  if (!fs.existsSync(repo)) {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log(`clone ${PACKS[p]}…`);
    execFileSync('git', ['clone', '--depth', '1', `https://github.com/KayKit-Game-Assets/${PACKS[p]}`, repo], {
      stdio: 'inherit',
    });
  }
  const addons = path.join(repo, 'addons');
  const sub = fs.readdirSync(addons).find((d) => d.startsWith('kaykit_'));
  if (!sub) throw new Error(`pack ${p} : dossier addons/kaykit_* introuvable`);
  return path.join(addons, sub);
}

/**
 * Retire les pistes d'animation qui ne bougent pas de la pose de repos (la plupart des os sur la plupart des clips) :
 * chaque piste coûte deux accessors dans le JSON, et KayKit en anime ≈ 120 par clip.
 */
function stripStaticTracks(doc: Document, eps = 1e-4): number {
  let removed = 0;
  for (const a of doc.getRoot().listAnimations())
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode(),
        s = ch.getSampler();
      const out = s?.getOutput();
      if (!node || !s || !out) continue;
      const p = ch.getTargetPath();
      const rest =
        p === 'translation'
          ? node.getTranslation()
          : p === 'rotation'
            ? node.getRotation()
            : p === 'scale'
              ? node.getScale()
              : null;
      if (!rest) continue;
      const v = out.getArray()!,
        n = rest.length;
      let same = true;
      for (let i = 0; i < v.length && same; i++) if (Math.abs(v[i] - rest[i % n]) > eps) same = false;
      if (same) {
        ch.dispose();
        s.dispose();
        removed++;
      }
    }
  return removed;
}

function tris(doc: Document): number {
  let n = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3;
  return Math.round(n);
}

async function main(): Promise<void> {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  fs.mkdirSync(OUT, { recursive: true });
  const manifest: {
    source: string;
    heroes: Record<string, { file: string; bytes: number; tris: number; anims: string[]; meshes: string[] }>;
    props: { file: string; bytes: number; nodes: Record<string, number> };
  } = {
    source: 'KayKit by Kay Lousberg (www.kaylousberg.com), CC0',
    heroes: {},
    props: { file: '', bytes: 0, nodes: {} },
  };
  let total = 0;

  // --- héros ---
  for (const [key, h] of Object.entries(HEROES)) {
    const doc = await io.read(path.join(packDir(h.pack), h.file));
    const root = doc.getRoot();
    const keepAnims = new Set<string>(HERO_ANIMS);
    // retirer un clip ne libère pas ses samplers : on les jette d'abord, sinon prune garde leurs accessors
    for (const a of root.listAnimations())
      if (!keepAnims.has(a.getName())) {
        for (const c of a.listChannels()) c.dispose();
        for (const sm of a.listSamplers()) sm.dispose(); // les accessors (parfois partagés) partent au prune
        a.dispose();
      }
    const missing = HERO_ANIMS.filter((n) => !root.listAnimations().some((a) => a.getName() === n));
    if (missing.length) throw new Error(`${key} : animations absentes ${missing.join(', ')}`);
    // accessoires : maillages non skinnés absents de `keep` retirés (les parties du corps sont skinnées)
    const keep = new Set(h.keep);
    for (const n of root.listNodes()) if (n.getMesh() && !n.getSkin() && !keep.has(n.getName())) n.dispose();
    await doc.transform(resample({ tolerance: 1e-3 }));
    const stripped = stripStaticTracks(doc);
    // un seul volume de quantification pour tout le personnage : les parties du corps partagent le même repère et
    // se fusionnent en une SkinnedMesh au chargement (src/render/heroes.ts)
    await doc.transform(
      prune(),
      dedup(),
      weld(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
    );
    console.log(`${key} : ${stripped} pistes immobiles retirées`);
    const file = `hero-${key}.glb`;
    const bin = await io.writeBinary(doc);
    fs.writeFileSync(path.join(OUT, file), bin);
    if (bin.byteLength > BUDGET.heroBytes) throw new Error(`${file} : ${bin.byteLength} o > ${BUDGET.heroBytes}`);
    total += bin.byteLength;
    manifest.heroes[key] = {
      file,
      bytes: bin.byteLength,
      tris: tris(doc),
      anims: root.listAnimations().map((a) => a.getName()),
      meshes: root
        .listNodes()
        .filter((n) => n.getMesh())
        .map((n) => n.getName()),
    };
    console.log(
      `${file.padEnd(26)} ${(bin.byteLength / 1024).toFixed(0).padStart(5)} Ko  ${manifest.heroes[key].tris} tris`,
    );
  }

  // --- objets : un document par objet, transformations cuites, puis fusion dans props.glb ---
  const props = new Document();
  const scene = props.createScene('props');
  for (const [key, p] of Object.entries(PROPS)) {
    const src = await io.read(path.join(packDir(p.pack), p.file));
    await src.transform(flatten());
    const t = tris(src);
    if (t > p.tris) throw new Error(`${key} : ${t} triangles > ${p.tris}`);
    manifest.props.nodes[key] = t;
    const map = mergeDocuments(props, src);
    // un nœud racine par objet, nommé par sa clé, qui reprend les nœuds de la scène source
    const holder = props.createNode(key);
    for (const s of src.getRoot().listScenes())
      for (const child of s.listChildren()) {
        const c = map.get(child) as Node;
        holder.addChild(c);
      }
    scene.addChild(holder);
  }
  for (const s of props.getRoot().listScenes()) if (s !== scene) s.dispose();
  props.getRoot().setDefaultScene(scene);
  await props.transform(unpartition(), prune(), dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const pbin = await io.writeBinary(props);
  fs.writeFileSync(path.join(OUT, 'props.glb'), pbin);
  total += pbin.byteLength;
  manifest.props.file = 'props.glb';
  manifest.props.bytes = pbin.byteLength;
  console.log(
    `${'props.glb'.padEnd(26)} ${(pbin.byteLength / 1024).toFixed(0).padStart(5)} Ko  ${Object.keys(PROPS).length} objets`,
  );

  if (total > BUDGET.totalBytes) throw new Error(`total ${total} o > ${BUDGET.totalBytes}`);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`total ${(total / 1024).toFixed(0)} Ko → ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
