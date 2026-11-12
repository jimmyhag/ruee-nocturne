// Nouveautés (1.49.0, demande de Jimmy : « un récap de tous les patchs dans le menu ») : le journal CHANGELOG.md, lu
// au build et réduit à ce qui parle aux joueurs. Module pur (ni DOM ni fichier) : vite.config.ts lui passe le texte du
// journal et sert le résultat sous `virtual:patch-notes`, chargé à l'ouverture de la feuille seulement.
//
// Ce qui est gardé : les sections Ajouté, Modifié et Corrigé, et la phrase d'introduction d'une version.
// Ce qui est écarté : les sections Technique et autres, toute ligne qui cite du code (accent grave) ou un outil du
// projet, et les mentions de personnes (le journal est écrit pour l'équipe, la feuille pour tout le monde).

export type NoteKind = 'added' | 'changed' | 'fixed';
export interface NoteItem {
  /** Texte de la ligne ; le gras du journal (`**…**`) est gardé tel quel, rendu par src/ui/notes.ts. */
  text: string;
  sub?: string[];
}
export interface NoteSection {
  kind: NoteKind;
  items: NoteItem[];
}
export interface PatchNote {
  version: string;
  date: string;
  /** Une ligne pour la version repliée : l'introduction du journal, sinon les titres en gras de ses premières lignes. */
  lead: string;
  sections: NoteSection[];
}

const KINDS: Record<string, NoteKind> = { Ajouté: 'added', Modifié: 'changed', Corrigé: 'fixed' };
/** Outils et documents du projet : une ligne qui en parle s'adresse aux développeurs. */
const DEV =
  /`|\b(PLAN|GATES|CHANGELOG|README|CLAUDE)\b|\.md\b|\b(CI|e2e|Vitest|Playwright|Lighthouse|TypeScript|ESLint|bench|skill|npm|sim|CLI|bot|seed|tests?|perf|p95|triangles?|Firestore|IndexedDB|localStorage|InstancedMesh|shaders?|chunk|gzip|commit|PR)\b|appels de (rendu|dessin)|Diagnostic|§/;
/** Parenthèse qui nomme quelqu'un (« (demande de Jimmy) », « (retour de Jimmy sur iPhone) ») : retirée, phrase gardée. */
const PERSON_PAREN = /\s*\([^()]*\bJimmy\b[^()]*\)/g;
const PERSON = /\bJimmy\b/;
const LEAD_MAX = 3;

/** Ligne du journal → texte pour les joueurs, ou '' si elle ne les concerne pas. */
function clean(line: string): string {
  const s = line.replace(PERSON_PAREN, '').trim();
  return !s || DEV.test(s) || PERSON.test(s) ? '' : s;
}
/** Titre en gras au début d'une ligne (« **Seize objets** (48 en tout)… » → « Seize objets »). */
function boldLead(text: string): string {
  const m = /^\*\*([^*]+)\*\*/.exec(text);
  return m ? m[1].replace(/\s*[:.]$/, '') : '';
}

/** CHANGELOG.md → versions de la plus récente à la plus ancienne ; une version sans rien pour les joueurs est omise. */
export function parsePatchNotes(md: string): PatchNote[] {
  const out: PatchNote[] = [];
  let cur: PatchNote | null = null;
  let intro = '';
  let section: NoteSection | null = null;
  let item: NoteItem | null = null;
  let seenSection = false; // l'introduction est le premier paragraphe, avant toute section
  const close = (): void => {
    if (!cur) return;
    cur.sections = cur.sections.filter((s) => s.items.length > 0);
    if (cur.sections.length === 0) return;
    const leads: string[] = [];
    for (const s of cur.sections)
      for (const it of s.items) {
        const b = boldLead(it.text);
        if (b && leads.length < LEAD_MAX && !leads.includes(b)) leads.push(b);
      }
    // sans introduction ni titre en gras : le début de la première ligne (la feuille coupe ce qui dépasse)
    cur.lead = intro || leads.join(' · ') || cur.sections[0].items[0].text;
    out.push(cur);
  };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const ver = /^## (\d+\.\d+\.\d+) — ([^(]+?)(?:\s*\(.*)?$/.exec(line);
    if (ver) {
      close();
      cur = { version: ver[1], date: ver[2].trim(), lead: '', sections: [] };
      intro = '';
      section = null;
      item = null;
      seenSection = false;
      continue;
    }
    if (!cur) continue;
    const head = /^#{3,4} (.+)$/.exec(line);
    if (head) {
      seenSection = true;
      item = null;
      const kind = KINDS[head[1].trim()];
      // une version à plusieurs phases répète ses sections : les lignes d'une même sorte se suivent dans un seul bloc
      section = kind ? (cur.sections.find((s) => s.kind === kind) ?? null) : null;
      if (kind && !section) {
        section = { kind, items: [] };
        cur.sections.push(section);
      }
      continue;
    }
    const top = /^- (.+)$/.exec(line);
    if (top) {
      item = null;
      if (!section) continue;
      const text = clean(top[1]);
      if (!text) continue; // ses sous-lignes partent avec elle
      item = { text };
      section.items.push(item);
      continue;
    }
    const sub = /^ {2,}- (.+)$/.exec(line);
    if (sub) {
      if (!item) continue;
      const text = clean(sub[1]);
      if (text) (item.sub ??= []).push(text);
      continue;
    }
    if (line && !seenSection && !intro) intro = clean(line);
  }
  close();
  return out;
}
