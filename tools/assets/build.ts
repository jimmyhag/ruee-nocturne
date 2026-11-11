// Phase 20 : construit public/models/*.glb et src/render/models.json. Objets : packs KayKit (CC0). Héros et ennemis
// (phase 46) : personnages KayKit mis en proportions humanoïdes (kaykit.ts), animés par les clips des Universal Animation
// Library de Quaternius (CC0) repris d'un squelette source (heroes.ts). Décor (phase 44) : nature.ts, ground.ts.
//   npm run assets            (clone les packs KayKit dans .cache/kaykit et le miroir Quaternius dans .cache/quaternius,
//                              hors dépôt, si absents ; clones partiels : seuls les fichiers utilisés sont téléchargés)
//   KAYKIT_DIR=… QUATERNIUS_DIR=… npm run assets   (sources déjà clonées ailleurs)
//   npm run assets -- --heroes [--only clé,clé] [--out dossier]   (héros seulement ; avec --only ou --out : essais,
//                              manifeste intact ; sans : les neuf héros et leur partie du manifeste)
//   npm run assets -- --enemies [--out dossier]   (enemies.glb seulement ; avec --out : essai, manifeste intact)
//   npm run assets -- --nature   (phase 44 : décor stylisé seulement ; le manifeste garde le reste tel quel)
//   NATURE_DIR=… : dossier « sources » du pack Ultimate Stylized Nature déjà cloné
// Héros : une primitive skinnée, objets tenus fusionnés, atlas, clips repris, simplification, compression meshopt
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
  KAY_HEROES,
  KAYKIT2,
  MONSTERS,
  NATURE,
  PACKS,
  PROPS,
  QUATERNIUS,
} from './config';
import type * as THREE from 'three';
import { buildGround } from './ground';
import { copyClip } from './heroes';
import { dropAnimations, fetchKay, mergeKay, readKay, reproportion, retargetClips } from './kaykit';
import type { KayBuild } from './kaykit';
import { buildNature, NATURE_TEXTURES } from './nature';
import type { PackKey } from './config';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CACHE = process.env.KAYKIT_DIR ?? path.join(ROOT, '.cache/kaykit');
const QCACHE = process.env.QUATERNIUS_DIR ?? path.join(ROOT, '.cache/quaternius');
const KCACHE = process.env.KAYKIT2_DIR ?? path.join(ROOT, '.cache/kaykit-characters');
const MCACHE = process.env.MONSTERS_DIR ?? path.join(ROOT, '.cache/quaternius-monsters');
const ARGS = process.argv.slice(2);
const HEROES_ONLY = ARGS.includes('--heroes');
const NATURE_ONLY = ARGS.includes('--nature');
const ENEMIES_ONLY = ARGS.includes('--enemies');
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

/** Télécharge (une fois, dans le cache hors dépôt) un fichier du pack de monstres épinglé ; retourne son chemin. */
async function fetchMonster(file: string, lfs: boolean): Promise<string> {
  const local = path.join(MCACHE, file);
  if (fs.existsSync(local)) return local;
  fs.mkdirSync(path.dirname(local), { recursive: true });
  const res = await fetch(`${lfs ? MONSTERS.media : MONSTERS.raw}/${file}`);
  if (!res.ok) throw new Error(`monstres : ${file} → ${res.status}`);
  fs.writeFileSync(local, new Uint8Array(await res.arrayBuffer()));
  return local;
}

/**
 * Phase 46 B : enemies.glb. Un nœud par modèle (`ENEMY_MODELS`), ses niveaux de détail `<clé>__body__<niveau>` et
 * ses clips `<clé>__<clip>`. Personnages KayKit : mise en proportions humanoïdes puis reprise des clips UAL, comme les
 * héros. Dragonnet : tel quel, avec ses clips.
 */
async function buildEnemies(
  io: NodeIO,
  libs: Record<string, Document>,
): Promise<{ bin: Uint8Array; models: Record<string, { anims: string[]; tris: Record<string, number> }> }> {
  const out = new Document();
  const scene = out.createScene('enemies');
  const models: Record<string, { anims: string[]; tris: Record<string, number> }> = {};
  await fetchMonster(MONSTERS.license, false);
  for (const [key, m] of Object.entries(ENEMY_MODELS)) {
    let doc: Document;
    let held: Map<string, THREE.Quaternion> | undefined;
    const anims = m.clips.map((c) => c.from);
    if (m.rig === 'own') {
      doc = await io.read(await fetchMonster(m.file, true));
      dropAnimations(doc, (n) => anims.includes(n));
      for (const a of doc.getRoot().listAnimations()) a.setName(`${key}__${a.getName()}`);
      if (doc.getRoot().listAnimations().length !== anims.length) throw new Error(`${key} : clip absent`);
    } else {
      // comme les héros : un squelette UE porte les clips UAL (en place), repris image par image sur le KayKit
      const src = await readKit(io, QUATERNIUS.outfit('M', 'Ranger'));
      for (const c of m.clips) copyClip(src, libs[c.src!], c.from, c.from, true, 1, false);
      doc = await readKay(io, KCACHE, m.file);
      dropAnimations(doc);
      if (m.prop) reproportion(doc, m.prop);
      held = retargetClips(src, doc, anims);
      for (const a of doc.getRoot().listAnimations()) a.setName(`${key}__${a.getName()}`);
    }
    const root = doc.getRoot();
    const props = [];
    for (const spec of m.props) props.push({ doc: await readKay(io, KCACHE, spec.file), spec });
    const b: KayBuild = {
      texture: m.texture ? fs.readFileSync(await fetchKay(KCACHE, m.texture)) : undefined,
      props,
      held,
      tris: 0,
      name: key,
      material: 'Enemy',
      atlas: m.atlas,
      full: true,
      // seuls les niveaux cuits à l'exécution : hi pour les boss, mid et lo pour la masse
      lods: m.lods.map((lod) => ({ name: `${key}__body__${lod}`, tris: m.tris?.[lod] ?? ENEMY_LODS[lod] })),
    };
    await mergeKay(doc, b);
    const lodTris: Record<string, number> = {};
    for (const lod of m.lods) lodTris[lod] = b.done![`${key}__body__${lod}`];
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
    source: `KayKit by Kay Lousberg (www.kaylousberg.com), CC0 ; héros : ${KAYKIT2.source} ; ennemis : ${KAYKIT2.source} et ${MONSTERS.source} ; animations des héros : ${QUATERNIUS.source} ; décor : ${NATURE.source} ; sol : ${GROUND.source}`,
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

  fetchFiles('kit', [...QUATERNIUS.licenses]);
  const libs: Record<string, Document> = {};
  for (const [k, f] of Object.entries(QUATERNIUS.anims)) libs[k] = await readKit(io, f);
  if (ENEMIES_ONLY) {
    // phase 46 B : enemies.glb seul ; avec --out, le manifeste n'est pas touché (essais)
    const en = await buildEnemies(io, libs);
    fs.writeFileSync(path.join(OUT, 'enemies.glb'), en.bin);
    console.log(`${'enemies.glb'.padEnd(26)} ${(en.bin.byteLength / 1024).toFixed(0).padStart(5)} Ko`);
    if (ARGS.includes('--out')) return;
    if (en.bin.byteLength > BUDGET.enemyBytes)
      throw new Error(`enemies.glb : ${en.bin.byteLength} o > ${BUDGET.enemyBytes}`);
    const old = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as typeof manifest;
    old.enemies = { file: 'enemies.glb', bytes: en.bin.byteLength, lods: ENEMY_LODS, models: en.models };
    old.source = manifest.source;
    fs.writeFileSync(MANIFEST, JSON.stringify(old, null, 2) + '\n');
    execFileSync('npx', ['prettier', '--write', MANIFEST], { cwd: ROOT, stdio: 'ignore' });
    return;
  }

  // --- héros (phase 46 : KayKit, clips UAL repris) ---
  await fetchKay(KCACHE, KAYKIT2.license);
  const only = ARGS.includes('--only') ? ARGS[ARGS.indexOf('--only') + 1].split(',') : null;
  for (const [key, h] of Object.entries(HEROES)) {
    if (only && !only.includes(key)) continue;
    // phase 46 : le squelette de la tenue Quaternius et ses 15 clips UAL ne servent plus que de source d'animation ;
    // le modèle est un personnage KayKit mis en proportions humanoïdes, sur lequel les clips sont repris
    const src = await readKit(io, QUATERNIUS.outfit(h.sex, h.outfit));
    for (const c of HERO_CLIPS) {
      const from = c.to === 'Idle' && h.idle ? h.idle : c;
      copyClip(src, libs[from.src], from.from, c.to, !!c.inPlace, c.speed ?? 1);
    }
    const K = KAY_HEROES[key];
    const doc = await readKay(io, KCACHE, K.file);
    const root = doc.getRoot();
    reproportion(doc, K.prop);
    const held = retargetClips(
      src,
      doc,
      HERO_CLIPS.map((c) => c.to),
    );
    const props = [];
    for (const spec of K.props) props.push({ doc: await readKay(io, KCACHE, spec.file), spec });
    const heroTris = await mergeKay(doc, { props, held, tris: h.tris, name: 'Body', material: 'Hero' });
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
    if (ARGS.includes('--out') || only) {
      console.log(`héros seulement → ${OUT} (manifeste inchangé)`);
      return;
    }
    // phase 46 : les neuf héros refaits sans toucher au reste ; le manifeste garde objets, ennemis et décor tels quels
    const old = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as typeof manifest;
    old.heroes = manifest.heroes;
    old.source = manifest.source;
    fs.writeFileSync(MANIFEST, JSON.stringify(old, null, 2) + '\n');
    execFileSync('npx', ['prettier', '--write', MANIFEST], { cwd: ROOT, stdio: 'ignore' });
    console.log(`héros seulement → ${path.relative(ROOT, OUT)}, manifeste mis à jour (héros et sources)`);
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
  const en = await buildEnemies(io, libs);
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
