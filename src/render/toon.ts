// Rendu toon (phase 15) : matériau à trois tons partagé par les personnages, les ennemis et le décor, et contour
// « coque inversée » cuit dans la géométrie (zéro appel de rendu en plus, voir parts.ts withOutline).
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;
/**
 * Rampe à 3 tons (ombre, demi-teinte, lumière) : NearestFilter pour des bandes nettes. Phase 44 B : rampe en couleur,
 * l'ombre tire vers le bleu-violet (ombres colorées : la lumière chaude du monde et l'ombre froide se répondent).
 * Le canal rouge garde les anciennes valeurs : un matériau non passé par `stylize` (qui ne lit que le rouge) reste
 * comme avant.
 */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  // ombre (52 % en rouge, plus claire en bleu), demi-teinte (77 %), lumière
  const data = new Uint8Array([132, 142, 198, 255, 196, 200, 222, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const GRADIENT_RGB = THREE.ShaderChunk.gradientmap_pars_fragment.replace(
  'texture2D( gradientMap, coord ).r',
  'texture2D( gradientMap, coord ).rgb',
);
/**
 * Phase 44 B : habille un matériau toon. La rampe est lue en couleur (ombres froides) et un liseré de lumière
 * (`rim`, couleur linéaire × force) éclaire le bord des silhouettes, vu de la caméra : héros et ennemis se détachent
 * du sol. Un seul programme pour tous (liseré noir = aucun) ; la couleur du liseré est un uniforme par matériau,
 * gardé dans `userData.rim` pour être réglé après coup.
 */
export function stylize<T extends THREE.MeshToonMaterial>(mat: T, rim = 0x000000, strength = 0): T {
  const u = { value: new THREE.Color(rim).multiplyScalar(strength) };
  mat.userData.rim = u;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = u;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', 'uniform vec3 rimColor;\n' + GRADIENT_RGB)
      .replace(
        '#include <opaque_fragment>',
        `float rimF = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );
        outgoingLight += rimColor * rimF * rimF * rimF;
        #include <opaque_fragment>`,
      );
  };
  return mat;
}

/** Matériau toon : couleur unie ou couleurs par sommet (multipliées par la couleur d'instance). */
export function toonMaterial(opts: { color?: number; vertexColors?: boolean } = {}): THREE.MeshToonMaterial {
  return stylize(
    new THREE.MeshToonMaterial({
      color: opts.color ?? 0xffffff,
      vertexColors: !!opts.vertexColors,
      gradientMap: toonGradient(),
    }),
  );
}

/** Épaisseurs de contour (unités monde) : le contour est cuit dans la géométrie, l'échelle d'instance le suit. */
// phase 44 B : contours plus fins (héros 0,035 → 0,026, ennemis 0,045 → 0,034, boss 0,09 → 0,065) : la scène est claire,
// un trait épais alourdissait les silhouettes
export const OUTLINE = { player: 0.026, enemy: 0.034, boss: 0.065, decor: 0.05 };
/** Couleur du contour : bleu nuit presque noir (multiplicateur pour les couleurs d'instance). */
export const OUTLINE_RGB: [number, number, number] = [0.05, 0.06, 0.1];
