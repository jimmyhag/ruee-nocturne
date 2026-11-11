// Textures procédurales partagées (phase 9) : disque doux pour les ombres et les particules rondes. Générées une fois.
import * as THREE from 'three';

let softDisc: THREE.Texture | null = null;
let hardDisc: THREE.Texture | null = null;

function disc(size: number, stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, col] of stops) grad.addColorStop(k, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ombre portée : opaque au centre, fondu jusqu'au bord (à teinter par la couleur du matériau). */
export function softDiscTexture(): THREE.Texture {
  return (softDisc ??= disc(64, [
    [0, 'rgba(255,255,255,1)'],
    [0.45, 'rgba(255,255,255,0.75)'],
    [1, 'rgba(255,255,255,0)'],
  ]));
}
/** Particule ronde : pleine jusqu'à 60 % du rayon, bord court. */
export function hardDiscTexture(): THREE.Texture {
  return (hardDisc ??= disc(32, [
    [0, 'rgba(255,255,255,1)'],
    [0.6, 'rgba(255,255,255,1)'],
    [1, 'rgba(255,255,255,0)'],
  ]));
}

// ---- phase 30 : effets d'armes stylisés ----
let glow: THREE.Texture | null = null;
let beam: THREE.Texture | null = null;
let slash: THREE.Texture | null = null;
let rune: THREE.Texture | null = null;

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lueur : cœur blanc très chaud, halo qui décroît vite (sprites additifs : orbes, feu, météores, éclats). */
export function glowTexture(): THREE.Texture {
  return (glow ??= disc(64, [
    [0, 'rgba(255,255,255,1)'],
    [0.18, 'rgba(255,255,255,0.95)'],
    [0.42, 'rgba(255,255,255,0.35)'],
    [0.7, 'rgba(255,255,255,0.08)'],
    [1, 'rgba(255,255,255,0)'],
  ]));
}

/** Rayon (éclair) : bande horizontale, pleine au centre, fondue vers le haut et le bas. */
export function beamTexture(): THREE.Texture {
  return (beam ??= canvasTexture(64, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }));
}

/**
 * Arc de lame (Faux, sillage des Lames) : croissant entre 78 % et 100 % du rayon, de −SLASH_ARC à +SLASH_ARC autour
 * de +x (angle mathématique, y vers le haut) ; bord d'attaque (+) éclatant, queue (−) qui s'efface ; plus vif au bord.
 */
export const SLASH_ARC = (70 * Math.PI) / 180;
export function slashTexture(): THREE.Texture {
  return (slash ??= canvasTexture(256, (g, s) => {
    const c = s / 2,
      img = g.createImageData(s, s),
      d = img.data;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const dx = (x + 0.5 - c) / c,
          dy = (c - y - 0.5) / c,
          r = Math.hypot(dx, dy),
          a = Math.atan2(dy, dx);
        if (r < 0.62 || r > 1 || Math.abs(a) > SLASH_ARC) continue;
        const along = (a + SLASH_ARC) / (2 * SLASH_ARC); // 0 queue → 1 bord d'attaque
        const radial = Math.min(1, (r - 0.62) / 0.34) * Math.min(1, (1 - r) / 0.05); // fin vers l'intérieur, net au bord
        const tip = Math.min(1, (SLASH_ARC - Math.abs(a)) / 0.12); // pointes arrondies
        const v = Math.pow(along, 1.6) * radial * tip;
        const o = (y * s + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = 255;
        d[o + 3] = Math.round(255 * Math.min(1, v * 1.3));
      }
    g.putImageData(img, 0, 0);
  }));
}

/** Anneau runique du Halo : bande lumineuse et 12 runes en traits, sur une texture plane (UV du RingGeometry). */
export function runeRingTexture(): THREE.Texture {
  return (rune ??= canvasTexture(256, (g, s) => {
    const c = s / 2;
    g.translate(c, c);
    const band = g.createRadialGradient(0, 0, c * 0.8, 0, 0, c);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    band.addColorStop(0.6, 'rgba(255,255,255,1)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = band;
    g.beginPath();
    g.arc(0, 0, c, 0, Math.PI * 2);
    g.arc(0, 0, c * 0.8, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = s * 0.012;
    g.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      g.save();
      g.rotate((i / 12) * Math.PI * 2);
      g.translate(0, -c * 0.9);
      g.beginPath();
      // rune : trait vertical et deux branches, alternées
      g.moveTo(0, -c * 0.05);
      g.lineTo(0, c * 0.05);
      g.moveTo(0, i % 2 ? -c * 0.02 : c * 0.02);
      g.lineTo(c * 0.035, i % 2 ? -c * 0.05 : c * 0.05);
      g.moveTo(0, i % 2 ? c * 0.02 : -c * 0.02);
      g.lineTo(-c * 0.035, i % 2 ? c * 0.05 : -c * 0.05);
      g.stroke();
      g.restore();
    }
  }));
}

/**
 * 1.42.1 (demande de Jimmy : refaire les armes) : fusion « lumineuse couvrante » des effets. L'additif pur, pensé
 * pour la nuit sombre d'avant, se délave en blanc sur l'herbe claire. Ici la couleur est prémultipliée et l'alpha
 * écrit vaut `cover` × alpha : résultat = couleur·a + fond·(1 − cover·a). `cover` 0 = additif, 1 = fusion normale ;
 * entre les deux, l'effet garde sa couleur de jour et brille encore de nuit. `core` > 0 : cœur blanc là où la texture
 * est pleine (orbes, éclairs). Aucun appel de rendu en plus.
 */
export function softGlow<T extends THREE.Material>(m: T, cover = 0.6, core = 0): T {
  m.transparent = true;
  m.premultipliedAlpha = true;
  m.blending = THREE.NormalBlending;
  m.depthWrite = false;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>',
      `gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.0 ), smoothstep( 0.55, 1.0, gl_FragColor.a ) * ${core.toFixed(2)} );
      gl_FragColor.rgb *= gl_FragColor.a;
      gl_FragColor.a *= ${cover.toFixed(2)};`,
    );
  };
  m.customProgramCacheKey = () => `softglow-${cover}-${core}`;
  return m;
}
