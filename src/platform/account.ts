// Compte du joueur (phase 13) : Firebase Authentication (Google, e-mail / mot de passe) et Cloud Firestore (lite).
// Seul fichier du projet qui importe `firebase/*` : main.ts le charge par import() quand le joueur ouvre le panneau Compte
// ou qu'une session est connue, jamais au premier chargement (Lighthouse). La logique de fusion est dans src/meta/sync.ts ;
// la configuration web, dans src/platform/firebase-config.ts (lot L1).
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore/lite';
import type { Firestore } from 'firebase/firestore/lite';
import { SYNC, fromCloudDoc } from '../meta/sync';
import type { CloudDoc } from '../meta/sync';
import { BOARD, dayExpiry, dayWritable, isoWeek, mergeDay, mergeScore, readDay, readScore } from '../meta/board';
import type { BoardRow, BoardView, DayDoc, RunScore, ScoreDoc } from '../meta/board';
import { todayKey } from '../meta/daily';
import type { FirebaseConfig } from './firebase-config';

export type Provider = 'google' | 'password' | 'other';
export interface AccountUser {
  uid: string;
  email: string | null;
  name: string | null; // phase 38 : nom du compte (Google), pour proposer un pseudo
  provider: Provider;
}
function toUser(u: User | null): AccountUser | null {
  if (!u) return null;
  const ids = u.providerData.map((p) => p.providerId);
  const provider: Provider = ids.includes('google.com') ? 'google' : ids.includes('password') ? 'password' : 'other';
  return { uid: u.uid, email: u.email, name: u.displayName, provider };
}
const code = (e: unknown): string =>
  e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '';
/** Le popup ne marche pas ici (bloqué, PWA installée) : on passe par la redirection. */
const REDIRECT_FALLBACK = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

export class Account {
  user: AccountUser | null = null;
  /** Premier état d'authentification connu (sinon le panneau afficherait « Pas connecté » le temps de la restauration). */
  ready = false;
  onChange: ((u: AccountUser | null) => void) | null = null;
  private readonly auth: Auth;
  private readonly db: Firestore;

  constructor(cfg: FirebaseConfig) {
    const app = initializeApp(cfg);
    this.auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    this.db = getFirestore(app);
    onAuthStateChanged(this.auth, (u) => {
      this.user = toUser(u);
      this.ready = true;
      this.onChange?.(this.user);
    });
  }

  /** Consomme le retour d'une connexion Google par redirection (sans effet s'il n'y en a pas). */
  async finishRedirect(): Promise<void> {
    await getRedirectResult(this.auth);
  }

  async signInGoogle(): Promise<void> {
    const p = new GoogleAuthProvider();
    try {
      await signInWithPopup(this.auth, p);
    } catch (e) {
      if (!REDIRECT_FALLBACK.has(code(e))) throw e;
      try {
        sessionStorage.setItem(SYNC.redirectKey, '1'); // au retour, main.ts charge ce module tout de suite
      } catch {
        /* stockage bloqué : la redirection marchera quand même, le résultat sera lu au prochain panneau */
      }
      await signInWithRedirect(this.auth, p);
    }
  }
  async signUpEmail(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email, password);
  }
  async signInEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }
  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  /**
   * Supprime la sauvegarde en ligne puis le compte. Firebase exige une connexion récente : on réauthentifie
   * (popup Google, ou mot de passe fourni) et on recommence ; sans mot de passe l'erreur remonte au panneau.
   */
  async deleteAccount(password?: string): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) return;
    const ref = doc(this.db, 'saves', u.uid);
    try {
      await this.deleteScores(u.uid); // phase 38 : le classement oublie le joueur
      await deleteDoc(ref);
      await deleteUser(u);
    } catch (e) {
      if (code(e) !== 'auth/requires-recent-login') throw e;
      if (this.user?.provider === 'password') {
        if (!password) throw e;
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', password));
      } else await reauthenticateWithPopup(u, new GoogleAuthProvider());
      await deleteDoc(ref);
      await deleteUser(u);
    }
  }

  async readSave(uid: string): Promise<CloudDoc | null> {
    const snap = await getDoc(doc(this.db, 'saves', uid));
    return snap.exists() ? fromCloudDoc(snap.data()) : null;
  }
  async writeSave(uid: string, d: CloudDoc): Promise<void> {
    await setDoc(doc(this.db, 'saves', uid), d);
  }

  // ---- phase 38 : classement en ligne (src/meta/board.ts), réservé aux joueurs connectés ----
  private scoreRef(uid: string, week: string | null) {
    return week ? doc(this.db, 'weeks', week, 'scores', uid) : doc(this.db, 'scores', uid);
  }
  /**
   * Publie une partie sous le pseudo `name` : fusion avec les meilleurs scores du joueur (tous les temps et semaine en
   * cours), écrite seulement si quelque chose change. `at` : fin de la partie (la semaine est celle de la partie).
   */
  async submitScore(uid: string, name: string, run: RunScore, at: number): Promise<void> {
    for (const week of [null, isoWeek(at)]) {
      const ref = this.scoreRef(uid, week);
      const snap = await getDoc(ref);
      const next = mergeScore(snap.exists() ? readScore(snap.data()) : null, run, name, Date.now());
      if (next) await setDoc(ref, next);
    }
    // lot L4 : un défi du jour qui compte publie aussi la meilleure partie du jour (classement entre amis), tant que
    // les règles acceptent ce jour (J-2 à J+1) : une partie restée hors ligne plus longtemps ne bloque pas les suivantes
    if (run.day && dayWritable(run.day, Date.now())) {
      const ref = this.dayRef(uid, run.day);
      const snap = await getDoc(ref);
      const next = mergeDay(snap.exists() ? readDay(snap.data()) : null, run.time, run.kills, name, Date.now());
      if (next) await setDoc(ref, this.dayDoc(next, run.day));
    }
  }
  /** Document du jour tel qu'écrit : avec son expiration `x` (horodatage, règle TTL de Firestore), exigée par les règles. */
  private dayDoc(d: DayDoc, day: string) {
    return { name: d.name, time: d.time, kills: d.kills, at: d.at, x: Timestamp.fromMillis(dayExpiry(day)) };
  }
  // ---- lot L4 : défi du jour entre amis, `days/{jour}/scores/{uid}` ----
  private dayRef(uid: string, day: string) {
    return doc(this.db, 'days', day, 'scores', uid);
  }
  /**
   * Documents du jour `day` des joueurs `uids` (soi et ses amis), lus par identifiants : BOARD.dayQuery par requête
   * (limite de l'opérateur `in`), jamais toute la collection.
   */
  async fetchDay(day: string, uids: readonly string[]): Promise<Map<string, DayDoc>> {
    const col = collection(this.db, 'days', day, 'scores');
    const chunks: string[][] = [];
    for (let i = 0; i < uids.length; i += BOARD.dayQuery) chunks.push(uids.slice(i, i + BOARD.dayQuery));
    const snaps = await Promise.all(
      chunks.map((ids) => getDocs(query(col, where(documentId(), 'in', ids), limit(BOARD.dayQuery)))),
    );
    const out = new Map<string, DayDoc>();
    for (const snap of snaps)
      for (const d of snap.docs) {
        const r = readDay(d.data());
        if (r) out.set(d.id, r);
      }
    return out;
  }
  /** Top BOARD.top d'une vue (tous les temps, ou la semaine `week`), et le document du joueur. */
  async fetchBoard(
    uid: string,
    view: BoardView,
    week: string | null,
  ): Promise<{ rows: BoardRow[]; mine: ScoreDoc | null }> {
    const col = week ? collection(this.db, 'weeks', week, 'scores') : collection(this.db, 'scores');
    const [list, me] = await Promise.all([
      getDocs(query(col, orderBy(view, 'desc'), limit(BOARD.top))),
      getDoc(this.scoreRef(uid, week)),
    ]);
    const rows: BoardRow[] = [];
    for (const d of list.docs) {
      const s = readScore(d.data());
      if (s) rows.push({ uid: d.id, name: s.name, char: s.char, value: s[view] });
    }
    return { rows, mine: me.exists() ? readScore(me.data()) : null };
  }
  /** Nouveau pseudo : appliqué aux documents existants seulement (aucun score n'est créé). */
  async renameScores(uid: string, name: string): Promise<void> {
    for (const week of [null, isoWeek(Date.now())]) {
      const ref = this.scoreRef(uid, week);
      const snap = await getDoc(ref);
      const prev = snap.exists() ? readScore(snap.data()) : null;
      if (prev && prev.name !== name) await setDoc(ref, { ...prev, name, at: Date.now() });
    }
    const day = todayKey(); // lot L4 : le défi du jour aussi
    const ref = this.dayRef(uid, day);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? readDay(snap.data()) : null;
    if (prev && prev.name !== name) await setDoc(ref, this.dayDoc({ ...prev, name, at: Date.now() }, day));
  }
  /** Retire le joueur du classement (tous les temps, semaine en cours, défi du jour) : suppression du compte. */
  async deleteScores(uid: string): Promise<void> {
    await Promise.all([
      deleteDoc(this.scoreRef(uid, null)),
      deleteDoc(this.scoreRef(uid, isoWeek(Date.now()))),
      deleteDoc(this.dayRef(uid, todayKey())),
    ]);
  }
}
