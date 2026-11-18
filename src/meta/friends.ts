// Lot L4 (docs/specs/l4-partage-defi-amis.md, décision 6) : les amis du joueur, ajoutés en ouvrant le lien de défi d'un
// joueur connecté avec un pseudo. Pas de recherche ni de demande d'ami : le lien suffit. Module pur, sans DOM.
// `Meta.friends` est une clé de progression synchronisée (firestore.rules : liste bornée à FRIENDS.max).
import { cleanPseudo } from './board';

export interface Friend {
  uid: string; // identifiant du compte (Firebase Authentication)
  name: string; // pseudo au moment du lien ; le classement du jour affiche le pseudo courant
}
export const FRIENDS = { max: 50 };
/** Identifiant de compte Firebase : lettres et chiffres (28 pour Google et l'e-mail), 128 au plus. */
export const UID = /^[A-Za-z0-9]{1,128}$/;

/** Liste lue dans une sauvegarde ou dans le nuage ; sans champ (joueur d'avant le lot) : vide. */
export function normalizeFriends(raw: unknown): Friend[] {
  const out: Friend[] = [];
  if (!Array.isArray(raw)) return out;
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const name = cleanPseudo(o.name);
    if (typeof o.uid !== 'string' || !UID.test(o.uid) || !name || out.some((x) => x.uid === o.uid)) continue;
    out.push({ uid: o.uid, name });
    if (out.length >= FRIENDS.max) break;
  }
  return out;
}

/**
 * Ajoute (ou renomme) un ami ; jamais soi-même (`self` : identifiant du compte de l'appareil, '' sans compte connu).
 * Déjà présent : une seule ligne, le pseudo du lien la met à jour. Liste pleine : le plus ancien laisse sa place.
 * Retourne vrai si la liste a changé.
 */
export function addFriend(list: Friend[], f: Friend, self: string): boolean {
  if (!UID.test(f.uid) || f.uid === self) return false;
  const name = cleanPseudo(f.name);
  if (!name) return false;
  const known = list.find((x) => x.uid === f.uid);
  if (known) {
    if (known.name === name) return false;
    known.name = name;
    return true;
  }
  if (list.length >= FRIENDS.max) list.splice(0, list.length - FRIENDS.max + 1);
  list.push({ uid: f.uid, name });
  return true;
}

/** Retire un ami (depuis le classement du jour) ; vrai s'il était dans la liste. */
export function removeFriend(list: Friend[], uid: string): boolean {
  const i = list.findIndex((x) => x.uid === uid);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
