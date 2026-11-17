// Mesure de fréquentation (lot L1, décision de Jimmy) : seulement si le joueur l'a acceptée. Un document anonyme
// `retention/{id}` écrit par l'API REST de Firestore avec fetch, sans SDK (Lighthouse : rien de chargé au premier
// affichage). Sans accord, sans configuration ou hors ligne : aucune requête vers Google, aucune erreur visible ;
// un envoi raté repart à l'ouverture suivante avec la liste complète, jamais en boucle. Logique pure : src/meta/retention.ts.
import {
  RETENTION,
  acceptState,
  dayOf,
  docOf,
  docUrl,
  markOpen,
  readState,
  refusedState,
  shouldSend,
  toFirestore,
} from '../meta/retention';
import type { Consent, RetentionState } from '../meta/retention';
import type { FirebaseConfig } from './firebase-config';

function load(): RetentionState {
  try {
    return readState(localStorage.getItem(RETENTION.key));
  } catch {
    return readState(null); // stockage bloqué : pas de réponse, rien ne part
  }
}
function store(s: RetentionState): void {
  try {
    localStorage.setItem(RETENTION.key, JSON.stringify(s));
  } catch {
    /* stockage bloqué : l'état vit le temps de la session */
  }
}
/** Identifiant aléatoire, jamais dérivé de l'appareil ni du compte ; repli sur getRandomValues (navigateurs anciens). */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class Retention {
  private s = load();
  /** Envoi ou suppression en cours : les requêtes partent l'une après l'autre (un retrait passe après l'envoi). */
  private queue: Promise<void> = Promise.resolve();
  private sending = false;

  /** `config` : src/platform/firebase-config.ts, appelé seulement quand une requête doit partir. */
  constructor(private readonly config: () => Promise<FirebaseConfig | null>) {}

  get consent(): Consent {
    return this.s.consent;
  }

  /** Lancement de l'app ou retour au premier plan : note le jour et envoie ce qui manque au serveur. */
  open(now = Date.now()): void {
    const today = dayOf(now);
    if (markOpen(this.s, today)) store(this.s);
    this.flush(today);
  }

  /** « Oui, compter » ou interrupteur des Réglages : nouvel identifiant, cohorte du jour. */
  accept(runs: number, now = Date.now()): void {
    const today = dayOf(now);
    this.s = acceptState(newId(), today, runs);
    store(this.s);
    this.flush(today);
  }

  /** « Non merci » ou retrait : plus rien ne part ; le document existant est supprimé et l'identifiant oublié. */
  refuse(): void {
    const id = this.s.id;
    this.s = refusedState();
    store(this.s);
    if (id)
      void this.enqueue(async (cfg) => void (await fetch(docUrl(cfg.projectId, cfg.apiKey, id), { method: 'DELETE' })));
  }

  private flush(today: number): void {
    if (this.sending || !shouldSend(this.s, today)) return;
    this.sending = true;
    void this.enqueue(async (cfg) => {
      const s = this.s; // l'état au moment de l'envoi : un retrait ou un nouvel accord a pu passer avant
      if (!s.id || !shouldSend(s, today)) return;
      const n = s.o.length;
      const r = await fetch(docUrl(cfg.projectId, cfg.apiKey, s.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toFirestore(docOf(s))),
      });
      if (r.ok && this.s === s) {
        s.sent = n;
        store(s);
      }
    }).finally(() => (this.sending = false));
  }

  /** Une requête après l'autre ; sans configuration (dev sans .env.local, vite preview), la mesure ne fait rien. */
  private enqueue(job: (cfg: FirebaseConfig) => Promise<void>): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        const cfg = await this.config();
        if (cfg) await job(cfg);
      })
      .catch(() => {
        /* hors ligne, refus du serveur : rien de visible, la prochaine ouverture renverra la liste complète */
      });
    return this.queue;
  }
}
