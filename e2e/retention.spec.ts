// Lot L1 : mesure anonyme de la rétention, seulement sur accord (docs/specs/l1-mesure-retention.md). Un test par
// scénario de la spec. `vite preview` n'a pas de /__/firebase/init.json : quand la mesure doit envoyer, on sert une
// configuration factice et un Firestore factice (page.route), qui répond 200 et garde les requêtes reçues. Les jours qui
// passent : l'état `ruee-retention` est posé avant le chargement, la cohorte en jours relatifs à aujourd'hui.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const FIREBASE = /googleapis\.com|firebaseapp\.com|apis\.google\.com|gstatic\.com|\/__\//;
const GOOGLE = /googleapis\.com|firebaseapp\.com|apis\.google\.com|gstatic\.com/;
const KEY = 'ruee-retention';
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CONFIG = { apiKey: 'cle-test', projectId: 'demo-ruee', appId: '1:2:web:3', authDomain: 'demo-ruee.web.app' };
const DOC_URL = (id: string) =>
  `https://firestore.googleapis.com/v1/projects/demo-ruee/databases/(default)/documents/retention/${id}?key=cle-test`;
/** La demande d'accord est masquée en debug (comme l'aide du premier lancement), sauf avec ?consent=1. */
const ASK_URL = '/?debug=1&consent=1';
const QUIET = 1500; // ms laissées à une requête qui ne doit pas partir

// le service worker servirait les requêtes de la page sans passer par page.route : il n'a rien à voir ici
test.use({ serviceWorkers: 'block' });

interface Call {
  method: string;
  url: string;
  body: unknown;
}
/** Hosting et Firestore factices ; `fail` : les envois vers Firestore échouent comme hors ligne. */
async function fakeFirebase(page: Page, opts: { fail?: boolean } = {}): Promise<{ calls: Call[]; fail: boolean }> {
  const state = { calls: [] as Call[], fail: opts.fail ?? false };
  await page.route('**/__/firebase/init.json', (r) => r.fulfill({ json: CONFIG }));
  await page.route('https://firestore.googleapis.com/**', (r) => {
    const q = r.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': '*',
    };
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (state.fail) return r.abort('internetdisconnected');
    const raw = q.postData();
    state.calls.push({ method: q.method(), url: q.url(), body: raw ? JSON.parse(raw) : null });
    return r.fulfill({ status: 200, headers: cors, json: {} });
  });
  return state;
}
/** Requêtes vers Google ou Firebase (configuration Hosting comprise). */
function watch(page: Page, re = FIREBASE): string[] {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (re.test(r.url())) hits.push(`${r.method()} ${r.url()}`);
  });
  return hits;
}
/** État local avant le premier chargement (pas aux rechargements) ; `c` en jours relatifs à aujourd'hui (UTC). */
async function seed(page: Page, s: { consent: 'yes' | 'no'; c?: number; o?: number[]; sent?: number }): Promise<void> {
  await page.addInitScript(
    ([key, id, st]) => {
      if (sessionStorage.getItem('retention-seeded')) return;
      sessionStorage.setItem('retention-seeded', '1');
      const today = Math.floor(Date.now() / 86_400_000);
      const full = { id: st.consent === 'yes' ? id : null, f: true, o: [0], sent: 0, ...st, c: today + (st.c ?? 0) };
      localStorage.setItem(key, JSON.stringify(full));
    },
    [KEY, ID, s] as const,
  );
}
async function state(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
}
/** Une partie jusqu'à la mort, puis « Menu ». */
async function finishRun(page: Page): Promise<void> {
  await startRun(page, 1);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await page.locator('#menuBtn').click();
}
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
}
/** Retour au premier plan : une ouverture. */
async function foreground(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}
const opened = (body: unknown): string[] =>
  ((body as any).fields.o.arrayValue.values as { integerValue: string }[]).map((v) => v.integerValue);

test('a player who refuses sends no request', async ({ page }) => {
  await seed(page, { consent: 'no' });
  const hits = watch(page);
  await page.goto(ASK_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await finishRun(page);
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('#consent')).toBeHidden(); // déjà répondu : jamais redemandé
  await reopen(page);
  await foreground(page);
  await page.waitForTimeout(QUIET);
  expect(hits).toEqual([]);
});

test('a player who has not answered yet sends no request', async ({ page }) => {
  const hits = watch(page);
  await page.goto(ASK_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await finishRun(page);
  await expect(page.locator('#consent')).toBeVisible();
  await foreground(page);
  await page.waitForTimeout(QUIET);
  expect(await state(page)).toBeNull();
  expect(hits).toEqual([]);
});

test('the consent prompt appears once, after the first run', async ({ page }) => {
  await page.goto(ASK_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#consent')).toBeHidden(); // pas avant d'avoir joué
  await finishRun(page);
  const sheet = page.locator('#consent');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Aider à améliorer le jeu ?');
  await expect(sheet).toContainText('pendant 30 jours');
  await expect(page.locator('#consentYesBtn')).toHaveText("Oui, j'aide");
  await expect(page.locator('#consentYesBtn')).toBeFocused();
  await page.locator('#consentNoBtn').click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#playBtn')).toBeFocused();
  expect((await state(page))?.consent).toBe('no');
  await finishRun(page);
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(sheet).toBeHidden();
  await reopen(page);
  await finishRun(page);
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(sheet).toBeHidden();
});

test('a player who accepts sends a single document per day', async ({ page }) => {
  const fake = await fakeFirebase(page);
  await page.goto(ASK_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await finishRun(page);
  await page.locator('#consentYesBtn').click();
  await expect.poll(() => fake.calls.length).toBe(1);
  const s = (await state(page))!;
  expect(s).toMatchObject({ consent: 'yes', f: true, o: [0], sent: 1 });
  expect(s.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const [call] = fake.calls;
  expect(call.method).toBe('PATCH');
  expect(call.url).toBe(DOC_URL(s.id as string));
  const c = s.c as number;
  expect(call.body).toEqual({
    fields: {
      c: { integerValue: String(c) },
      f: { booleanValue: true },
      o: { arrayValue: { values: [{ integerValue: '0' }] } },
      x: { timestampValue: new Date((c + 90) * 86_400_000).toISOString() },
    },
  });
  // deuxième ouverture du même jour, puis un retour au premier plan : rien de plus
  await reopen(page);
  await foreground(page);
  await page.waitForTimeout(QUIET);
  expect(fake.calls).toHaveLength(1);
});

test('the next day adds an opening day', async ({ page }) => {
  await seed(page, { consent: 'yes', c: -1, o: [0], sent: 1 });
  const fake = await fakeFirebase(page);
  await openGame(page);
  await expect.poll(() => fake.calls.length).toBe(1);
  expect(fake.calls[0].url).toBe(DOC_URL(ID));
  expect(opened(fake.calls[0].body)).toEqual(['0', '1']);
  await expect.poll(async () => (await state(page))?.sent).toBe(2);
});

test('after thirty days nothing is sent', async ({ page }) => {
  await seed(page, { consent: 'yes', c: -31, o: [0, 1], sent: 1 }); // même un jour pas encore parti
  const fake = await fakeFirebase(page);
  const hits = watch(page);
  await openGame(page);
  await foreground(page);
  await page.waitForTimeout(QUIET);
  expect(fake.calls).toEqual([]);
  expect(hits).toEqual([]);
  expect((await state(page))?.o).toEqual([0, 1]);
});

test('a failed send goes again at the next opening', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await seed(page, { consent: 'yes', c: -1, o: [0], sent: 0 }); // l'envoi d'hier a échoué hors ligne
  const fake = await fakeFirebase(page, { fail: true });
  await openGame(page); // aujourd'hui, Firestore injoignable : le jour est noté, rien n'est perdu
  await expect.poll(async () => (await state(page))?.o).toEqual([0, 1]);
  await page.waitForTimeout(QUIET);
  expect(fake.calls).toEqual([]);
  expect((await state(page))?.sent).toBe(0);
  fake.fail = false; // de nouveau en ligne
  await reopen(page);
  await expect.poll(() => fake.calls.length).toBe(1);
  expect(opened(fake.calls[0].body)).toEqual(['0', '1']);
  await expect.poll(async () => (await state(page))?.sent).toBe(2);
  expect(errors).toEqual([]); // aucune erreur visible (le réseau coupé est ignoré par collectConsoleErrors)
});

test('withdrawal deletes the document and forgets the identifier', async ({ page }) => {
  const fake = await fakeFirebase(page);
  await openGame(page);
  await page.locator('#settingsBtn').click();
  const toggle = page.locator('#setRetentionBtn');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => fake.calls.length).toBe(1);
  const id = (await state(page))!.id as string;
  expect(fake.calls[0]).toMatchObject({ method: 'PATCH', url: DOC_URL(id) });
  await toggle.click(); // retrait
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => fake.calls.length).toBe(2);
  expect(fake.calls[1]).toEqual({ method: 'DELETE', url: DOC_URL(id), body: null });
  // suppression confirmée : plus d'identifiant, plus rien en attente
  await expect.poll(() => state(page)).toEqual({ consent: 'no', id: null, c: 0, f: false, o: [], sent: 0, del: [] });
  await reopen(page);
  await foreground(page);
  await page.waitForTimeout(QUIET);
  expect(fake.calls).toHaveLength(2);
});

test('an offline withdrawal is deleted at the next opening', async ({ page }) => {
  await seed(page, { consent: 'yes', c: 0, o: [0], sent: 1 });
  const fake = await fakeFirebase(page, { fail: true });
  await openGame(page);
  await page.locator('#settingsBtn').click();
  const toggle = page.locator('#setRetentionBtn');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click(); // retrait hors ligne : la suppression échoue
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(QUIET);
  expect(fake.calls).toEqual([]);
  expect(await state(page)).toMatchObject({ consent: 'no', id: null, del: [ID] });
  fake.fail = false; // de retour en ligne
  await reopen(page);
  await expect.poll(() => fake.calls.length).toBe(1);
  expect(fake.calls[0]).toEqual({ method: 'DELETE', url: DOC_URL(ID), body: null });
  await expect.poll(() => state(page)).toMatchObject({ consent: 'no', del: [] });
  await foreground(page);
  await page.waitForTimeout(QUIET);
  expect(fake.calls).toHaveLength(1);
});

test('the measure never loads the Firebase SDK', async ({ page }) => {
  await seed(page, { consent: 'yes', c: 0, o: [0], sent: 0 });
  const fake = await fakeFirebase(page);
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  const google = watch(page, GOOGLE);
  await openGame(page);
  await expect.poll(() => fake.calls.length).toBe(1);
  // le SDK vit dans le chunk account-*.js (src/platform/account.ts, seul importateur de firebase)
  expect(scripts.filter((u) => /account-/.test(u))).toEqual([]);
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
  expect(loaded.filter((u) => /account-|firebase/.test(u) && !u.includes('/__/firebase/init.json'))).toEqual([]);
  expect(google.every((h) => h.includes('firestore.googleapis.com/v1/'))).toBe(true); // ni gstatic, ni authentification
});

test('without configuration the measure does nothing', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const google = watch(page, GOOGLE);
  await page.goto(ASK_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await finishRun(page);
  // vite preview répond index.html à /__/firebase/init.json : pas de configuration
  const config = page.waitForResponse('**/__/firebase/init.json');
  await page.locator('#consentYesBtn').click();
  await config;
  await page.waitForTimeout(QUIET);
  expect(await state(page)).toMatchObject({ consent: 'yes', sent: 0 });
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#setRetentionBtn')).toHaveAttribute('aria-pressed', 'true'); // l'interrupteur marche
  expect(google).toEqual([]);
  expect(errors).toEqual([]);
});

test('the consent prompt plays with the keyboard as with the finger', async ({ page }) => {
  test.setTimeout(180_000); // quatre parties et trois rechargements : plus de 60 s sur une machine chargée ou sous SwiftShader
  const sheet = page.locator('#consent');
  const yes = page.locator('#consentYesBtn');
  const no = page.locator('#consentNoBtn');
  /** Oublie la réponse et rejoue une partie : la demande revient (le joueur a déjà fini une partie). */
  const askAgain = async () => {
    await page.evaluate((k) => localStorage.removeItem(k), KEY);
    await reopen(page);
    await finishRun(page);
    await expect(sheet).toBeVisible();
  };
  await page.goto(ASK_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await finishRun(page);
  await expect(sheet).toBeVisible();
  // clavier : Tab atteint les deux boutons, Entrée valide
  await expect(yes).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(no).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(yes).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(page.locator('#playBtn')).toBeFocused();
  expect((await state(page))?.consent).toBe('yes');
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('menu');
  // Échap vaut « Non merci »
  await askAgain();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect((await state(page))?.consent).toBe('no');
  // au doigt (projet mobile) ou à la souris : chaque bouton répond
  const touch = test.info().project.use.hasTouch === true;
  await askAgain();
  await (touch ? yes.tap() : yes.click());
  await expect(sheet).toBeHidden();
  expect((await state(page))?.consent).toBe('yes');
  await askAgain();
  await (touch ? no.tap() : no.click());
  await expect(sheet).toBeHidden();
  expect((await state(page))?.consent).toBe('no');
});
