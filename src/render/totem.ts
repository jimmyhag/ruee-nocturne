// 1.42.1 (demande de Jimmy : refaire le totem). Le totem du monde était le modèle des sanctuaires, agrandi et teinté :
// il se confondait avec eux. Ici, une vraie stèle : socle à deux marches, trois blocs de pierre empilés et décalés,
// bandeaux de runes entre les blocs, coiffe à cornes, cristal flottant. Une seule géométrie fusionnée, un seul
// matériau, un appel de rendu (à la place de l'instance de sanctuaire). Les runes et le cristal prennent la couleur
// de l'état (rouge : à activer ; orangé : boss appelé ; gris : fermé) par un uniforme : la pierre, elle, reste pierre.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon';

const STONE = 0x726d90,
  STONE_LIGHT = 0x8f8aae,
  STONE_DARK = 0x57526f;

/** Hauteur du modèle à l'échelle 1 (du sol à la pointe du cristal). */
export const TOTEM_HEIGHT = 5.4;

export interface TotemView {
  mesh: THREE.Mesh;
  /** Couleur des runes et du cristal (linéaire ; au-delà de 1 : surexposée, lisible de loin). */
  glow: THREE.Color;
}

/** Pièces de pierre à facettes : couleur unie par sommet, attribut `glow` (1 = prend la couleur de l'état). */
export interface StoneKit {
  add(g: THREE.BufferGeometry, color: number, glow?: number): void;
  /** Fusionne les pièces en une géométrie non indexée (facettes nettes) et libère les pièces. */
  build(): THREE.BufferGeometry;
}
export const STONES = { base: STONE, light: STONE_LIGHT, dark: STONE_DARK };

export function stoneKit(): StoneKit {
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  return {
    add(g, color, glow = 0) {
      const geo = g.index ? g.toNonIndexed() : g;
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3),
        gl = new Float32Array(n);
      c.setHex(color);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        gl[i] = glow;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
      geo.deleteAttribute('uv');
      parts.push(geo);
    },
    build() {
      const merged = mergeGeometries(parts)!;
      for (const p of parts) p.dispose();
      merged.computeVertexNormals();
      return merged;
    },
  };
}

/**
 * Matériau de pierre à runes : toon à facettes, ombres colorées, et les sommets `glow` remplacés par la couleur de
 * l'état. `glow` donné : un uniforme (objet unique, le totem). Absent : la couleur d'instance (sanctuaires), que la
 * pierre, elle, ignore.
 */
export function stoneMaterial(glow?: THREE.Color): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }); // facettes : géométrie non indexée
  material.onBeforeCompile = (sh) => {
    if (glow) sh.uniforms.glowColor = { value: glow };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying vec3 vGlowColor;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        vGlowColor = vec3( 1.0 );
        #ifdef USE_INSTANCING_COLOR
          vGlowColor = instanceColor.rgb;
          vColor.rgb = color;
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${glow ? 'uniform vec3 glowColor;' : '#define glowColor vGlowColor'}\nvarying float vGlow;\nvarying vec3 vGlowColor;`,
      )
      .replace(
        '#include <gradientmap_pars_fragment>',
        THREE.ShaderChunk.gradientmap_pars_fragment.replace(
          'texture2D( gradientMap, coord ).r',
          'texture2D( gradientMap, coord ).rgb',
        ),
      )
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight = mix( outgoingLight, glowColor, vGlow );\n#include <opaque_fragment>',
      );
  };
  material.customProgramCacheKey = () => (glow ? 'stone-uniform' : 'stone-instance');
  return material;
}

export function buildTotem(): TotemView {
  const { add, build } = stoneKit();
  // socle : deux marches hexagonales
  add(new THREE.CylinderGeometry(1.3, 1.45, 0.28, 6).translate(0, 0.14, 0), STONE_DARK);
  add(new THREE.CylinderGeometry(0.98, 1.12, 0.26, 6).translate(0, 0.41, 0), STONE);
  // fût : trois blocs à quatre faces, de plus en plus étroits, chacun un peu tourné ; un bandeau de runes entre eux
  let y = 0.54;
  const blocks: [top: number, bottom: number, h: number, turn: number, color: number][] = [
    [0.66, 0.76, 0.98, 0, STONE],
    [0.58, 0.64, 0.88, 0.32, STONE_LIGHT],
    [0.5, 0.56, 0.82, -0.18, STONE],
  ];
  for (const [top, bottom, h, turn, color] of blocks) {
    const ry = Math.PI / 4 + turn;
    add(new THREE.CylinderGeometry(top, bottom, h, 4).rotateY(ry).translate(0, y + h / 2, 0), color);
    // œil du bloc : un losange lumineux sur deux faces opposées
    for (const s of [-1, 1])
      add(
        new THREE.OctahedronGeometry(0.17, 0)
          .scale(1, 1.5, 0.35)
          .translate(0, y + h * 0.55, s * (top + bottom) * 0.36)
          .rotateY(turn),
        0xffffff,
        1,
      );
    y += h;
    add(new THREE.CylinderGeometry(top * 0.84, top * 0.84, 0.1, 4).rotateY(ry).translate(0, y + 0.05, 0), 0xffffff, 1);
    y += 0.1;
  }
  // coiffe et cornes
  add(new THREE.CylinderGeometry(0.22, 0.62, 0.36, 4).rotateY(Math.PI / 4).translate(0, y + 0.18, 0), STONE_DARK);
  for (const s of [-1, 1])
    add(new THREE.ConeGeometry(0.17, 0.78, 4).rotateZ(-s * 0.95).translate(s * 0.66, y + 0.2, 0), STONE_LIGHT);
  y += 0.36;
  // cristal flottant
  add(new THREE.OctahedronGeometry(0.36, 0).scale(1, 1.75, 1).translate(0, y + 0.85, 0), 0xffffff, 1);

  const geometry = build();
  const glow = new THREE.Color(1, 0.3, 0.35);
  const material = stoneMaterial(glow);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false; // posé loin de l'origine : la sphère englobante de la géométrie ne suit pas
  return { mesh, glow };
}
