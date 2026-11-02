// Service worker (vite-plugin-pwa, registerType 'prompt') : on n'impose jamais une mise à jour en pleine partie.
// Le jeu décide quand afficher la bannière (menu ou écran de mort) via `needRefresh` et `onNeedRefresh`.
import { registerSW } from 'virtual:pwa-register';

export class Pwa {
  /** Une nouvelle version est prête côté service worker. */
  needRefresh = false;
  onNeedRefresh: (() => void) | null = null;
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

  constructor() {
    if (!('serviceWorker' in navigator)) return;
    this.updateSW = registerSW({
      onNeedRefresh: () => {
        this.needRefresh = true;
        this.onNeedRefresh?.();
      },
      onRegisterError: (e: unknown) => console.warn('Service worker non enregistré', e),
    });
  }

  /** Active la nouvelle version et recharge la page. */
  update(): void {
    void this.updateSW?.(true);
  }
}
