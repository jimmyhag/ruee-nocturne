// Phase 25 : les clips des Universal Animation Library (Quaternius, CC0) copiés par nom d'os sur le squelette d'une tenue
// Quaternius (même squelette de 65 os : aucun reciblage), bassin à l'échelle. Depuis la phase 46, ce squelette n'est plus
// livré : c'est la source d'animation que `retargetClips` (kaykit.ts) reprend sur les personnages KayKit, héros et
// ennemis. L'assemblage des personnages Quaternius (têtes, coiffures, objets tenus, atlas) des phases 25 à 45 est retiré.
import type { Document } from '@gltf-transform/core';

const FINGER = /^(index|middle|ring|pinky|thumb)_/;

/**
 * Copie un clip d'une bibliothèque UAL sur le squelette maître, par nom d'os : rotations de tous les os, translation du
 * bassin seulement (mise à l'échelle des hanches du maître ; les longueurs d'os du maître sont gardées). `inPlace` :
 * bassin figé à l'horizontale et jamais plus haut qu'au repos (le jeu déplace le héros).
 */
export function copyClip(
  doc: Document,
  lib: Document,
  from: string,
  to: string,
  inPlace: boolean,
  speed: number,
  fingers = true,
): void {
  const anim = lib
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === from);
  if (!anim) throw new Error(`clip ${from} absent de la bibliothèque`);
  const nodes = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const buffer = doc.getRoot().listBuffers()[0];
  const out = doc.createAnimation(to);
  const pelvisLib = lib
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === 'pelvis')!;
  const pelvis = nodes.get('pelvis')!;
  const restL = pelvisLib.getTranslation(),
    rest = pelvis.getTranslation();
  const up = [0, 1, 2].reduce((a, i) => (Math.abs(restL[i]) > Math.abs(restL[a]) ? i : a), 0);
  const k = rest[up] / restL[up];
  for (const ch of anim.listChannels()) {
    const name = ch.getTargetNode()?.getName() ?? '';
    const path = ch.getTargetPath();
    const target = nodes.get(name);
    if (!target || name === 'root') continue;
    if (!fingers && FINGER.test(name)) continue; // ennemis : doigts au repos (invisibles à cette distance)
    if (path === 'scale' || (path === 'translation' && name !== 'pelvis')) continue;
    const s = ch.getSampler()!;
    const times = Float32Array.from(s.getInput()!.getArray()!, (t) => t / speed);
    const vals = new Float32Array(s.getOutput()!.getArray()!);
    if (path === 'translation') {
      for (let i = 0; i < vals.length; i += 3) {
        for (let c = 0; c < 3; c++) vals[i + c] *= k;
        if (inPlace) {
          for (let c = 0; c < 3; c++) if (c !== up) vals[i + c] = rest[c];
          vals[i + up] = Math.min(vals[i + up], rest[up]);
        }
      }
    }
    const smp = doc
      .createAnimationSampler()
      .setInput(doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer))
      .setOutput(
        doc
          .createAccessor()
          .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
          .setArray(vals)
          .setBuffer(buffer),
      )
      .setInterpolation(s.getInterpolation());
    out
      .addSampler(smp)
      .addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path!).setSampler(smp));
  }
}
