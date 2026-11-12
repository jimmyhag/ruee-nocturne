// Nouveautés (1.49.0) : ce que les joueurs lisent vient de CHANGELOG.md. Ces tests tournent aussi sur le vrai journal :
// une version mal écrite (titre, section) se voit ici, pas dans le jeu.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { parsePatchNotes } from './patch-notes';

const SAMPLE = `# Journal

Format : texte d'en-tête ignoré.

## 2.1.0 — 12 nov. 2026 (demande de Jimmy : des chapeaux)

Des chapeaux pour tout le monde.

### Ajouté

- **Trois chapeaux** (demande de Jimmy) : melon, haut-de-forme, casquette.
  - Le melon rend 1 PV.
  - \`HAT.melon\` vaut 1.
- \`World.hats\` compte les chapeaux.
- Retour de Jimmy : trop de chapeaux.

### Modifié par rapport au plan

- Le béret attendra.

### Technique

- Un tableau de plus.

### Corrigé

- **Le chapeau ne tombe plus.** Il tient en sautant.

## 2.0.1 — 11 nov. 2026

### Technique

- Rien pour les joueurs.

## 2.0.0 — 10 nov. 2026 (phase 50 « Départ »)

### Phase 50 « Départ »

Paragraphe de phase, ignoré.

#### Ajouté

- Un monde.

### Phase 49 « Avant »

#### Ajouté

- Un menu.

#### Modifié

- **Le saut** est plus haut.
`;

describe('journal → nouveautés', () => {
  const notes = parsePatchNotes(SAMPLE);
  it('une entrée par version qui a quelque chose pour les joueurs, de la plus récente à la plus ancienne', () => {
    expect(notes.map((n) => n.version)).toEqual(['2.1.0', '2.0.0']); // 2.0.1 : technique seulement
    expect(notes[0].date).toBe('12 nov. 2026'); // sans la parenthèse du titre
  });
  it('garde Ajouté, Modifié, Corrigé ; écarte Technique et les autres sections', () => {
    expect(notes[0].sections.map((s) => s.kind)).toEqual(['added', 'fixed']);
    expect(JSON.stringify(notes)).not.toContain('béret');
    expect(JSON.stringify(notes)).not.toContain('tableau');
  });
  it('écarte les lignes qui citent du code et retire les mentions de personnes', () => {
    const added = notes[0].sections[0].items;
    expect(added).toEqual([
      { text: '**Trois chapeaux** : melon, haut-de-forme, casquette.', sub: ['Le melon rend 1 PV.'] },
    ]);
    expect(JSON.stringify(notes)).not.toMatch(/Jimmy|`/);
  });
  it('résumé : l’introduction, sinon les titres en gras, sinon la première ligne', () => {
    expect(notes[0].lead).toBe('Des chapeaux pour tout le monde.');
    expect(notes[1].lead).toBe('Le saut');
    expect(parsePatchNotes('## 1.0.0 — 1 janv. 2026\n\n### Corrigé\n\n- Une chose.\n')[0].lead).toBe('Une chose.');
  });
  it('une version à plusieurs phases regroupe ses lignes par sorte', () => {
    expect(notes[1].sections).toEqual([
      { kind: 'added', items: [{ text: 'Un monde.' }, { text: 'Un menu.' }] },
      { kind: 'changed', items: [{ text: '**Le saut** est plus haut.' }] },
    ]);
  });
});

describe('le vrai CHANGELOG.md', () => {
  const md = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  const notes = parsePatchNotes(md);
  it('le journal commence par la version du jeu ; la première entrée a du contenu', () => {
    expect(/^## (\d+\.\d+\.\d+) /m.exec(md)![1]).toBe(pkg.version); // version livrée sans ligne au journal : rouge
    expect(notes[0].sections.length).toBeGreaterThan(0);
  });
  it('presque toutes les versions du journal ont une entrée, dans l’ordre', () => {
    const all = md.match(/^## \d+\.\d+\.\d+ /gm)!.length;
    expect(notes.length).toBeGreaterThanOrEqual(all - 6);
    const key = (v: string): number => v.split('.').reduce((a, n) => a * 1000 + +n, 0);
    for (let i = 1; i < notes.length; i++) expect(key(notes[i].version)).toBeLessThan(key(notes[i - 1].version));
  });
  it('chaque entrée a une date, un résumé et des lignes ; ni code ni nom de personne', () => {
    for (const n of notes) {
      expect(n.date, n.version).toMatch(/^\d{1,2} \S+ \d{4}$/);
      expect(n.lead.length, n.version).toBeGreaterThan(0);
      for (const s of n.sections) expect(s.items.length, n.version).toBeGreaterThan(0);
    }
    expect(JSON.stringify(notes)).not.toMatch(/Jimmy|`/);
  });
  it('le module servi au jeu est ce même contenu', async () => {
    expect((await import('virtual:patch-notes')).default).toEqual(notes);
  });
});
