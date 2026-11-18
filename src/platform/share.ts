// Lot L4 (docs/specs/l4-partage-defi-amis.md, décision 2 ; règle 11) : partager un texte par l'API du navigateur, avec un
// repli. Le partage natif (Android, iPhone) ouvre la feuille du système ; sinon le texte est copié dans le presse-papiers ;
// si les deux manquent, l'appelant montre le texte sélectionné. Rien ne part sans le geste du joueur, et rien vers nous :
// c'est le joueur qui choisit à qui il l'envoie.

/** Le sous-ensemble de `navigator` utilisé (injectable pour les tests). */
export interface ShareNav {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}
/** shared : feuille du système ; copied : presse-papiers ; cancelled : le joueur a fermé la feuille ; manual : à lui de copier. */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'manual';

export async function shareText(text: string, nav: ShareNav = navigator as ShareNav): Promise<ShareResult> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (e) {
      // fermé par le joueur : rien ; refusé (pas de geste, type non permis) : on passe au presse-papiers
      if (e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError') return 'cancelled';
    }
  }
  if (typeof nav.clipboard?.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return 'copied';
    } catch {
      /* permission refusée, page non sécurisée : repli manuel */
    }
  }
  return 'manual';
}
