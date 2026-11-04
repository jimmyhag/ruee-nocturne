// Rendu toon (phase 15) : matériau à trois tons partagé par les personnages, les ennemis et le décor, et contour
// « coque inversée » cuit dans la géométrie (zéro appel de rendu en plus, voir parts.ts withOutline).
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;
/** Rampe à 3 tons (ombre, demi-teinte, lumière) : NearestFilter pour des bandes nettes. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([132, 196, 255]); // ombre à 52 %, demi-teinte à 77 % : lisible la nuit
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Matériau toon : couleur unie ou couleurs par sommet (multipliées par la couleur d'instance). */
export function toonMaterial(opts: { color?: number; vertexColors?: boolean } = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    vertexColors: !!opts.vertexColors,
    gradientMap: toonGradient(),
  });
}

/** Épaisseurs de contour (unités monde) : le contour est cuit dans la géométrie, l'échelle d'instance le suit. */
export const OUTLINE = { player: 0.035, enemy: 0.045, boss: 0.09, decor: 0.05 };
/** Couleur du contour : bleu nuit presque noir (multiplicateur pour les couleurs d'instance). */
export const OUTLINE_RGB: [number, number, number] = [0.05, 0.06, 0.1];
