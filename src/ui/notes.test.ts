// Nouveautés (1.49.0) : rendu de la feuille et règle de la pastille du menu.
import { describe, expect, it } from 'vitest';
import type { PatchNote } from '../meta/patch-notes';
import { NOTES_FIRST, hasUnseenNotes, notesHtml, versionKey } from './notes';

const note = (version: string, text = 'Une chose.'): PatchNote => ({
  version,
  date: '12 nov. 2026',
  lead: 'Résumé',
  sections: [{ kind: 'added', items: [{ text }] }],
});
const many = Array.from({ length: 12 }, (_, i) => note(`1.${20 - i}.0`));
const count = (html: string, what: string): number => html.split(what).length - 1;

describe('versions', () => {
  it('se comparent comme des nombres, pas comme du texte', () => {
    expect(versionKey('1.10.0')).toBeGreaterThan(versionKey('1.9.3'));
    expect(versionKey('2.0.0')).toBeGreaterThan(versionKey('1.48.1'));
    expect(versionKey('')).toBe(0);
    expect(versionKey('pas une version')).toBe(0);
  });
  it('pastille du menu : version courante pas encore vue, sauf pour qui n’a jamais joué', () => {
    expect(hasUnseenNotes('', '1.49.0', 0)).toBe(false); // nouveau joueur
    expect(hasUnseenNotes('', '1.49.0', 3)).toBe(true); // joueur d'avant la feuille
    expect(hasUnseenNotes('1.48.1', '1.49.0', 0)).toBe(true);
    expect(hasUnseenNotes('1.49.0', '1.49.0', 9)).toBe(false);
    expect(hasUnseenNotes('1.50.0', '1.49.0', 9)).toBe(false); // sauvegarde venue d'une version plus récente
  });
});

describe('feuille Nouveautés', () => {
  it('jamais vue : les premières versions, la dernière ouverte, aucune étiquette', () => {
    const r = notesHtml(many, '', false);
    expect(r.shown).toBe(NOTES_FIRST);
    expect(count(r.html, '<details')).toBe(NOTES_FIRST);
    expect(count(r.html, ' open')).toBe(1);
    expect(r.html.indexOf(' open')).toBeLessThan(r.html.indexOf('1.19.0'));
    expect(r.html).not.toContain('badge new');
  });
  it('« Versions plus anciennes » montre tout', () => {
    expect(notesHtml(many, '', true).shown).toBe(many.length);
  });
  it('depuis la dernière visite : étiquette « Nouveau » sur ce qui est plus récent, trois ouvertes au plus', () => {
    const r = notesHtml(many, '1.16.0', false); // 1.20, 1.19, 1.18, 1.17 sont nouvelles
    expect(count(r.html, 'badge new')).toBe(4);
    expect(count(r.html, ' open')).toBe(3);
    // très en retard : toutes les versions manquées restent visibles, au-delà des premières
    expect(notesHtml(many, '1.9.0', false).shown).toBe(many.length - 1);
  });
  it('le texte du journal est échappé ; seul le gras passe', () => {
    const r = notesHtml([note('1.0.0', '**Gras** <img src=x onerror=alert(1)> & « guillemets »')], '', false);
    expect(r.html).toContain('<b>Gras</b>');
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('&#60;img');
  });
});
