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
