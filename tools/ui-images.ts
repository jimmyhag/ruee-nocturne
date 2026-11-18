// Images de l'interface « Nocturne » (docs/specs/ui-nocturne.md, décision 7) : les sources de la maquette
// (assets/ui/<id>.<ext>, table dans docs/design/menus/README.md) deviennent des WebP aux noms parlants dans public/ui/,
// précachés par le service worker. sharp est déjà une dépendance de développement : aucune dépendance ajoutée.
//   npm run ui-images
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'assets/ui';
const OUT = 'public/ui';

/** Plafonds de poids de la spec (octets) : le script échoue s'ils sont dépassés. */
const CAP = { portrait: 60_000, avatar: 15_000, background: 120_000, total: 900_000 };

// personnage → [portrait 414 × 717, avatar 192] ; ordre de la grille de l'écran Héros (Heros.dc.html)
const HEROES: Record<string, [string, string]> = {
  eclaireuse: ['fcf4facc404f32e3d4db093e07382d5a', '8857d72e8463e66380f59419c55e22e1'],
  bucheron: ['5172ff22ccae213b71643bceb9fd062d', '6c058a5d55fc1e90334934be58de7951'],
  sorciere: ['21011f57f8ea5a3eab4039725fdfca6f', 'b6cb22de71465354fce0415ed8f741f7'],
  veilleuse: ['e6cb30f756965724ca6ecb1801926419', '5e94f53c51f95f68696ff42397711ef6'],
  braconnier: ['aecb9fc4420717ee4ee73f5a73150d50', 'f2028553913b0f42c22d28a053b04982'],
  sapeur: ['1b4c2a4d5345d2d191130e7046c636b5', '7a304108ca0599f539fd315402f48537'],
  feufollet: ['c876097f7c5fd1ccfdea45b34e49598a', '154506c929fe04ff8db7a64cb19d7a6d'],
  revenante: ['e80418f134109f5521b6c2c1625b23f6', 'db85e2f88e33af4128cba0087d7904eb'],
  colporteur: ['eed242cc9a49ae1efd616bd204db7c4c', '34a5225304989912a76ba942931d7ad1'],
};
// fonds 1170 × 2532 : nuit (accueil), crépuscule (partie à reprendre)
const BACKGROUNDS: Record<string, string> = {
  night: 'f30635138b96f8daa8acd3041a8e75ec',
  dusk: '3b27da41ceb30d69a8f2ff833d846614',
};
const LOGO = '9ef8c2bd9a0ab2876b7871be2efaebeb';

mkdirSync(OUT, { recursive: true });
let total = 0;
const report: string[] = [];
function check(file: string, cap: number): void {
  const n = statSync(file).size;
  total += n;
  report.push(`${file.padEnd(36)} ${(n / 1000).toFixed(1).padStart(6)} ko`);
  if (n > cap) throw new Error(`${file} : ${n} o > plafond ${cap} o`);
}

for (const [key, [portrait, avatar]] of Object.entries(HEROES)) {
  const p = `${OUT}/portrait-${key}.webp`;
  await sharp(`${SRC}/${portrait}.png`).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(p);
  check(p, CAP.portrait);
  // l'avatar s'affiche à 40 px (80 px sur un écran ×2) : 96 px suffisent, en gardant la marge de la source
  const a = `${OUT}/avatar-${key}.webp`;
  await sharp(`${SRC}/${avatar}.png`).resize(96, 96).webp({ quality: 80, effort: 6 }).toFile(a);
  check(a, CAP.avatar);
}
for (const [name, id] of Object.entries(BACKGROUNDS)) {
  // 1000 px de large : net sur un téléphone ×2 de 390 px, le fond couvre l'écran (object-fit: cover)
  const b = `${OUT}/bg-${name}.webp`;
  await sharp(`${SRC}/${id}.jpg`).resize(1000).webp({ quality: 80, effort: 6 }).toFile(b);
  check(b, CAP.background);
}
// écrans intérieurs : le fond de nuit flouté (9 px à 390 de large) est cuit ici, petit, plutôt qu'un filtre CSS
// recalculé par le GPU sur tout l'écran
const blur = `${OUT}/bg-night-blur.webp`;
await sharp(`${SRC}/${BACKGROUNDS.night}.jpg`).resize(390).blur(9).webp({ quality: 60, effort: 6 }).toFile(blur);
check(blur, CAP.background);
// logo vectoriel : copié tel quel (5 ko, net à toutes les tailles)
const logo = `${OUT}/logo.svg`;
copyFileSync(`${SRC}/${LOGO}.svg`, logo);
check(logo, CAP.avatar);

console.log(report.join('\n'));
console.log(`total ${(total / 1000).toFixed(1)} ko (plafond ${CAP.total / 1000} ko)`);
if (total > CAP.total) throw new Error(`total ${total} o > ${CAP.total} o`);
