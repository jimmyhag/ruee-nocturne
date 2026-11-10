// Phase 20 : construit public/models/*.glb et src/render/models.json à partir des packs KayKit (CC0) ; phase 25 : héros
// Quaternius « HD » (Universal Base Characters, Modular Character Outfits – Fantasy, Universal Animation Library, CC0).
//   npm run assets            (clone les packs KayKit dans .cache/kaykit et les miroirs Quaternius dans .cache/quaternius,
//                              hors dépôt, si absents ; clones partiels : seuls les fichiers utilisés sont téléchargés)
//   KAYKIT_DIR=… QUATERNIUS_DIR=… npm run assets   (sources déjà clonées ailleurs)
//   npm run assets -- --heroes [--only clé,clé] [--out dossier]   (héros seulement, manifeste intact : essais)
//   npm run assets -- --nature   (phase 44 : décor stylisé seulement ; le manifeste garde le reste tel quel)
//   NATURE_DIR=… : dossier « sources » du pack Ultimate Stylized Nature déjà cloné
// Héros : tête, tenue, coiffures et objets tenus fusionnés, atlas JPEG, clips UAL, simplification, compression meshopt
// (décodeur fourni par three/examples). Objets : un seul fichier, un nœud par objet, transformations cuites.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, mergeDocuments, meshopt, prune, resample, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import {
  BUDGET,
  ENEMY_LODS,
  ENEMY_MODELS,
  GROUND,
  HERO_CLIPS,
  HEROES,
  NATURE,
  PACKS,
  PROPS,
  QUATERNIUS,
} from './config';
import { buildGround } from './ground';
import { addBody, assemble, buildHero, copyClip, finish } from './heroes';
import { buildNature, NATURE_TEXTURES } from './nature';
import type { PackKey } from './config';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = process.env.KAYKIT_DIR ?? path.join(ROOT, '.cache/kaykit');
const QCACHE = process.env.QUATERNIUS_DIR ?? path.join(ROOT, '.cache/quaternius');
const ARGS = process.argv.slice(2);
const HEROES_ONLY = ARGS.includes('--heroes');
const NATURE_ONLY = ARGS.includes('--nature');
const OUT = ARGS.includes('--out') ? path.resolve(ARGS[ARGS.indexOf('--out') + 1]) : path.join(ROOT, 'public/models');
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

type MirrorKey = keyof typeof QUATERNIUS.mirrors;
/** Pixel PNG transparent : remplace les images que le build n'utilise pas (cartes de normales, ORM : ≈ 10 Mo chacune). */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Clone partiel d'un miroir (arbre seul, sans fichiers : les fichiers sont tirés à la demande). */
function mirror(key: MirrorKey): string {
  const repo = path.join(QCACHE, key);
  if (!fs.existsSync(path.join(repo, '.git'))) {
    fs.mkdirSync(QCACHE, { recursive: true });
    console.log(`clone ${QUATERNIUS.mirrors[key].repo} (partiel)…`);
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', QUATERNIUS.mirrors[key].repo, repo],
      {
        stdio: 'inherit',
      },
    );
    execFileSync('git', ['-C', repo, 'config', 'gc.auto', '0']);
  }
  return repo;
}
/** Tire les fichiers manquants d'un miroir ; retourne leurs chemins locaux. */
function fetchFiles(key: MirrorKey, files: string[]): string[] {
  const repo = mirror(key);
  const rel = files.map((f) => path.join(QUATERNIUS.mirrors[key].dir, f));
  const missing = rel.filter((f) => !fs.existsSync(path.join(repo, f)));
  if (missing.length) execFileSync('git', ['-C', repo, 'checkout', 'HEAD', '--', ...missing], { stdio: 'inherit' });
  return rel.map((f) => path.join(repo, f));
}

/**
 * Lit un fichier du kit. Pour un .gltf : tampons et textures de couleur seulement (les autres images deviennent un
 * pixel), via une copie « .lite.gltf » à côté de l'original.
 */
async function readKit(io: NodeIO, file: string): Promise<Document> {
  const [local] = fetchFiles('kit', [file]);
  if (!file.endsWith('.gltf')) return io.read(local);
  const json = JSON.parse(fs.readFileSync(local, 'utf8'));
  const color = new Set<number>();
  for (const m of json.materials ?? []) {
    const t = m.pbrMetallicRoughness?.baseColorTexture;
    if (t) color.add(json.textures[t.index].source);
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  const dir = path.dirname(file);
  const need = [...(json.buffers ?? []).map((b: { uri: string }) => b.uri)];
  (json.images ?? []).forEach((im: { uri: string }, i: number) => {
    if (color.has(i)) need.push(im.uri);
    else im.uri = PIXEL;
  });
  fetchFiles(
    'kit',
    need.map((u: string) => path.join(dir, decodeURIComponent(u))),
  );
  const lite = local.replace(/\.gltf$/, '.lite.gltf');
  fs.writeFileSync(lite, JSON.stringify(json));
  return io.read(lite);
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

/**
 * Phase 26 : les morts-vivants dans un seul fichier. Par modèle : assemblage avec le kit des héros (atlas 512²), corps
 * fusionné puis simplifié à chaque niveau (`<clé>__body__<niveau>`), clips `<clé>__<clip>` (marche, geste), puis fusion
 * dans enemies.glb sous un nœud nommé par la clé. Séparateur `__` : GLTFLoader retire `.` et `:` des noms de nœuds.
 */
async function buildEnemies(
  io: NodeIO,
  bases: Record<'M' | 'F', Document>,
  libs: Record<string, Document>,
): Promise<{ bin: Uint8Array; models: Record<string, { anims: string[]; tris: Record<string, number> }> }> {
  const out = new Document();
  const scene = out.createScene('enemies');
  const models: Record<string, { anims: string[]; tris: Record<string, number> }> = {};
  for (const [key, m] of Object.entries(ENEMY_MODELS)) {
    const doc = await readKit(io, QUATERNIUS.outfit(m.sex, m.outfit));
    const root = doc.getRoot();
    const hairs = await Promise.all(m.hair.map((n) => readKit(io, QUATERNIUS.hair(n))));
    const props = await Promise.all(m.props.map((p) => io.read(fetchFiles('showcase', [p.file])[0])));
    const a = await assemble(doc, m, bases[m.sex], hairs, props, m.atlas, 'atlas');
    const lodTris: Record<string, number> = {};
    // seuls les niveaux cuits à l'exécution : hi pour les boss, mid et lo pour la masse
    for (const lod of m.lods) lodTris[lod] = addBody(doc, a, `${key}__body__${lod}`, ENEMY_LODS[lod], 'Atlas');
    finish(a);
    const anims: string[] = [];
    for (const c of m.clips) {
      copyClip(doc, libs[c.src], c.from, `${key}__${c.from}`, true, 1, false);
      anims.push(c.from);
    }
    await doc.transform(resample({ tolerance: 1e-3 }));
    stripStaticTracks(doc);
    await doc.transform(prune());
    const mainScene = root.getDefaultScene() ?? root.listScenes()[0];
    for (const s of root.listScenes()) if (s !== mainScene) s.dispose();
    const map = mergeDocuments(out, doc);
    const holder = out.createNode(key);
    for (const s of root.listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child) as Node);
    scene.addChild(holder);
    models[key] = { anims, tris: lodTris };
    console.log(`ennemi ${key.padEnd(8)} → ${JSON.stringify(lodTris)}`);
  }
  for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose();
  out.getRoot().setDefaultScene(scene);
  await out.transform(
    unpartition(),
    prune(),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
  );
  return { bin: await io.writeBinary(out), models };
}

/** Dossier « sources » du pack de décor stylisé (clone partiel : FBX retenus et textures de l'atlas seulement). */
function natureDir(): string {
  if (process.env.NATURE_DIR) return process.env.NATURE_DIR;
  const repo = path.join(QCACHE, 'nature');
  if (!fs.existsSync(path.join(repo, '.git'))) {
    fs.mkdirSync(QCACHE, { recursive: true });
    console.log(`clone ${NATURE.repo} (partiel)…`);
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', NATURE.repo, repo], {
      stdio: 'inherit',
    });
    execFileSync('git', ['-C', repo, 'config', 'gc.auto', '0']);
  }
  const need = [
    ...new Set(Object.values(NATURE.models).map((m) => `FBX/${m.file}.fbx`)),
    ...NATURE_TEXTURES.map((t) => `Textures/${t}`),
  ]
    .map((f) => path.join(NATURE.dir, f))
    .filter((f) => !fs.existsSync(path.join(repo, f)));
  if (need.length) execFileSync('git', ['-C', repo, 'checkout', 'HEAD', '--', ...need], { stdio: 'inherit' });
  return path.join(repo, NATURE.dir);
}

/** Phase 44 : nature.glb (un nœud par modèle, un matériau, un atlas), compressé comme les autres objets. */
async function buildNatureFile(io: NodeIO): Promise<{ bin: Uint8Array; nodes: Record<string, number> }> {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('nature');
  doc.getRoot().setDefaultScene(scene);
  const { nodes } = await buildNature(doc, natureDir(), true);
  await doc.transform(unpartition(), prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  return { bin: await io.writeBinary(doc), nodes };
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
  await MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  fs.mkdirSync(OUT, { recursive: true });
  const manifest: {
    source: string;
    heroes: Record<string, { file: string; bytes: number; tris: number; anims: string[] }>;
    props: { file: string; bytes: number; nodes: Record<string, number> };
    nature: { file: string; bytes: number; nodes: Record<string, number> };
    ground: Record<string, number>;
    enemies: {
      file: string;
      bytes: number;
      lods: typeof ENEMY_LODS;
      models: Record<string, { anims: string[]; tris: Record<string, number> }>;
    };
  } = {
    source: `KayKit by Kay Lousberg (www.kaylousberg.com), CC0 ; héros : ${QUATERNIUS.source} ; décor : ${NATURE.source} ; sol : ${GROUND.source}`,
    heroes: {},
    props: { file: '', bytes: 0, nodes: {} },
    nature: { file: '', bytes: 0, nodes: {} },
    ground: {},
    enemies: { file: '', bytes: 0, lods: ENEMY_LODS, models: {} },
  };
  let total = 0;

  // --- décor stylisé (phase 44) ---
  const writeNature = async (): Promise<number> => {
    const nat = await buildNatureFile(io);
    fs.writeFileSync(path.join(OUT, 'nature.glb'), nat.bin);
    if (nat.bin.byteLength > BUDGET.natureBytes)
      throw new Error(`nature.glb : ${nat.bin.byteLength} o > ${BUDGET.natureBytes}`);
    manifest.nature = { file: 'nature.glb', bytes: nat.bin.byteLength, nodes: nat.nodes };
    manifest.ground = await buildGround(path.join(ROOT, '.cache/polyhaven'), OUT);
    console.log(
      `${'nature.glb'.padEnd(26)} ${(nat.bin.byteLength / 1024).toFixed(0).padStart(5)} Ko  ${Object.keys(nat.nodes).length} modèles`,
    );
    return nat.bin.byteLength;
  };
  if (NATURE_ONLY) {
    // le reste du manifeste (héros, objets, ennemis) est repris tel quel
    const old = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as typeof manifest;
    await writeNature();
    old.nature = manifest.nature;
    old.ground = manifest.ground;
    old.source = manifest.source;
    fs.writeFileSync(MANIFEST, JSON.stringify(old, null, 2) + '\n');
    execFileSync('npx', ['prettier', '--write', MANIFEST], { cwd: ROOT, stdio: 'ignore' });
    return;
  }

  // --- héros (phase 25 : Quaternius HD) ---
  fetchFiles('kit', [...QUATERNIUS.licenses]);
  const libs: Record<string, Document> = {};
  for (const [k, f] of Object.entries(QUATERNIUS.anims)) libs[k] = await readKit(io, f);
  const bases = { M: await readKit(io, QUATERNIUS.base.M), F: await readKit(io, QUATERNIUS.base.F) };
  const only = ARGS.includes('--only') ? ARGS[ARGS.indexOf('--only') + 1].split(',') : null;
  for (const [key, h] of Object.entries(HEROES)) {
    if (only && !only.includes(key)) continue;
    const doc = await readKit(io, QUATERNIUS.outfit(h.sex, h.outfit));
    const root = doc.getRoot();
    const hairs = await Promise.all(h.hair.map((n) => readKit(io, QUATERNIUS.hair(n))));
    const props = await Promise.all(h.props.map((p) => io.read(fetchFiles('showcase', [p.file])[0])));
    const heroTris = await buildHero(doc, h, bases[h.sex], hairs, libs, props);
    await doc.transform(resample({ tolerance: 1e-3 }));
    const stripped = stripStaticTracks(doc);
    await doc.transform(
      prune(),
      dedup(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
    );
    const file = `hero-${key}.glb`;
    const bin = await io.writeBinary(doc);
    fs.writeFileSync(path.join(OUT, file), bin);
    if (bin.byteLength > BUDGET.heroBytes) throw new Error(`${file} : ${bin.byteLength} o > ${BUDGET.heroBytes}`);
    total += bin.byteLength;
    const anims = root.listAnimations().map((a) => a.getName());
    const missing = HERO_CLIPS.filter((c) => !anims.includes(c.to));
    if (missing.length) throw new Error(`${key} : clips absents ${missing.map((c) => c.to).join(', ')}`);
    manifest.heroes[key] = { file, bytes: bin.byteLength, tris: heroTris, anims };
    console.log(
      `${file.padEnd(26)} ${(bin.byteLength / 1024).toFixed(0).padStart(5)} Ko  ${heroTris} tris, ${stripped} pistes immobiles retirées`,
    );
  }
  if (HEROES_ONLY) {
    console.log(`héros seulement → ${OUT} (manifeste inchangé)`);
    return;
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

  // --- ennemis (phase 21) ---
  const en = await buildEnemies(io, bases, libs);
  fs.writeFileSync(path.join(OUT, 'enemies.glb'), en.bin);
  if (en.bin.byteLength > BUDGET.enemyBytes)
    throw new Error(`enemies.glb : ${en.bin.byteLength} o > ${BUDGET.enemyBytes}`);
  total += en.bin.byteLength;
  manifest.enemies = { file: 'enemies.glb', bytes: en.bin.byteLength, lods: ENEMY_LODS, models: en.models };
  console.log(`${'enemies.glb'.padEnd(26)} ${(en.bin.byteLength / 1024).toFixed(0).padStart(5)} Ko`);

  total += await writeNature();

  if (total > BUDGET.totalBytes) throw new Error(`total ${total} o > ${BUDGET.totalBytes}`);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  execFileSync('npx', ['prettier', '--write', MANIFEST], { cwd: ROOT, stdio: 'ignore' }); // même forme que le lint
  console.log(`total ${(total / 1024).toFixed(0)} Ko → ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
