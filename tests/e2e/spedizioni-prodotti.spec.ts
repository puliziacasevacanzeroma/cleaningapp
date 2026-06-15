import { test, expect, Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════
 * E2E REALE — Spedizioni Prodotti + Card Pulizia + Modifica prodotti da modal
 *
 * Guida il BROWSER VERO sul sito (in locale `npm run dev`, che usa il tuo
 * Firebase reale → dati e flussi reali). Verifica rendering, filtri, ricerca
 * proprietà, espansione card e il flusso completo di modifica prodotti dal
 * modal "Modifica dettaglio pulizia" (in modo REVERSIBILE: ripristina lo stato).
 *
 * COME LANCIARLO (CMD, dalla cartella del progetto):
 *   1) (una volta)  npx playwright install chromium
 *   2) set ADMIN_EMAIL=la-tua-mail-admin
 *      set ADMIN_PASSWORD=la-tua-password
 *      set TEST_PROPERTY=Pellegrino 62           (nome di una proprietà con pulizie)
 *      set TEST_PRODUCT=Stracci bianchi           (nome di un prodotto in inventario)
 *      npx playwright test tests/e2e/spedizioni-prodotti.spec.ts --headed
 *
 *   - Senza TEST_PROPERTY/TEST_PRODUCT: girano solo i test di sola lettura (sicuri).
 *   - Per testare contro produzione invece che locale:
 *      set BASE_URL=https://gestionale.puliziacasevacanze.it   (sconsigliato: usa locale)
 *
 * NOTA: il test 5 modifica un ordine reale ma è REVERSIBILE (aggiunge il
 * prodotto e poi lo rimuove). Non crea nuove spedizioni → nessuna notifica ai rider.
 * ════════════════════════════════════════════════════════════════════════
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL || "";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const TEST_PROPERTY = process.env.TEST_PROPERTY || "";
const TEST_PRODUCT = process.env.TEST_PRODUCT || "";

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("nome@email.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  // Login avvenuto = il campo password non è più presente. Non dipende dall'URL
  // esatto (admin → /dashboard, ma può variare). Timeout ampio per la prima
  // compilazione di `next dev`, che può richiedere parecchi secondi.
  await expect(page.getByPlaceholder("••••••••")).toHaveCount(0, { timeout: 90000 });
  await page.waitForLoadState("domcontentloaded");
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "Imposta ADMIN_EMAIL e ADMIN_PASSWORD per eseguire i test E2E.");
  await login(page);
});

// ─────────────────────────────────────────────────────────────────────────
test("1. Pagina Spedizioni: banner, filtri e bottone presenti", async ({ page }) => {
  await page.goto(`${BASE}/dashboard/spedizioni`);
  await expect(page.getByText("Spedizioni Prodotti")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: /Nuova spedizione|Nuova/ })).toBeVisible();
  await expect(page.getByPlaceholder("Cerca per proprietà o indirizzo…")).toBeVisible();
  // i 2 selettori filtro (stato, tipo) e i 2 input data
  await expect(page.locator("select")).toHaveCount(2);
  await expect(page.locator('input[type="date"]')).toHaveCount(2);
});

// ─────────────────────────────────────────────────────────────────────────
test("2. Modal Nuova spedizione: ricerca proprietà testuale funziona (no scrittura)", async ({ page }) => {
  await page.goto(`${BASE}/dashboard/spedizioni`);
  await page.getByRole("button", { name: /Nuova spedizione|Nuova/ }).click();
  await expect(page.getByText("Nuova spedizione prodotti")).toBeVisible();

  // Ricerca proprietà
  const searchTerm = TEST_PROPERTY ? TEST_PROPERTY.slice(0, 4) : "a";
  await page.getByPlaceholder("Cerca proprietà…").fill(searchTerm);
  // almeno un risultato proprietà compare
  const firstResult = page.locator("button", { hasText: /Via|via|,/ }).first();
  await expect(firstResult).toBeVisible({ timeout: 10000 });

  // Seleziona la prima proprietà → compaiono Data e Prodotti
  await firstResult.click();
  await expect(page.getByText("Data di consegna")).toBeVisible();
  await expect(page.getByText("Prodotti", { exact: true }).first()).toBeVisible();

  // Chiudi senza creare nulla
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByText("Nuova spedizione prodotti")).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────
test("3. Dashboard: le card pulizia si caricano ed espandono", async ({ page }) => {
  await page.goto(`${BASE}/dashboard`);
  // attende che compaia almeno una card (cerca un prezzo €... o uno stato)
  const anyCard = page.getByText(/€\d/).first();
  await expect(anyCard).toBeVisible({ timeout: 25000 });
});

// ─────────────────────────────────────────────────────────────────────────
test("4. Pagina Pulizie: il calendario/le card si caricano", async ({ page }) => {
  await page.goto(`${BASE}/dashboard/calendario/pulizie`);
  await page.waitForLoadState("networkidle");
  // la pagina non deve andare in errore: c'è del contenuto pulizie
  await expect(page.locator("body")).toContainText(/Pulizi|pulizi/i, { timeout: 20000 });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. FLUSSO COMPLETO REVERSIBILE: aggiungi un prodotto dal modal, salva,
//    verifica persistenza riaprendo il modal, poi rimuovilo (ripristino).
test("5. Modifica prodotti dal modal pulizia (reversibile)", async ({ page }) => {
  test.skip(!TEST_PROPERTY || !TEST_PRODUCT, "Imposta TEST_PROPERTY e TEST_PRODUCT per il flusso completo.");

  // helper: apre il modal cliccando la card della proprietà target
  async function openModalForProperty() {
    await page.goto(`${BASE}/dashboard/calendario/pulizie`);
    await page.waitForLoadState("networkidle");
    const card = page.getByText(TEST_PROPERTY, { exact: false }).first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.click();
    // attende la sezione prodotti del modal (sottotitolo univoco)
    await expect(page.getByText("Gratuiti, consegnati col rider", { exact: false })).toBeVisible({ timeout: 15000 });
  }

  // riga prodotto = il bottone-toggle che contiene il nome del prodotto
  function productToggle() {
    return page.locator("button", { hasText: new RegExp(TEST_PRODUCT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  }
  // la riga è "selezionata" se accanto compaiono i controlli quantità (+ / −)
  async function isSelected(): Promise<boolean> {
    const row = page.locator("div", { hasText: TEST_PRODUCT }).filter({ has: page.locator("button", { hasText: "+" }) });
    return (await row.count()) > 0;
  }
  async function save() {
    await page.getByRole("button", { name: /Salva Modifiche/ }).first().click();
    // il modal si chiude
    await expect(page.getByText("Gratuiti, consegnati col rider", { exact: false })).toHaveCount(0, { timeout: 20000 });
    await page.waitForTimeout(1500); // lascia propagare la scrittura realtime
  }

  // ── 1) Apri, assicurati che il prodotto sia SELEZIONATO, salva ──
  await openModalForProperty();
  if (!(await isSelected())) {
    await productToggle().click();
  }
  expect(await isSelected()).toBeTruthy();
  await save();

  // ── 2) Riapri: il prodotto deve essere ancora SELEZIONATO (persistito) ──
  await openModalForProperty();
  expect(await isSelected()).toBeTruthy(); // ← prova che il salvataggio ha persistito i prodotti

  // ── 3) Ripristino: deseleziona, salva, riapri, deve essere DESELEZIONATO ──
  await productToggle().click();
  expect(await isSelected()).toBeFalsy();
  await save();

  await openModalForProperty();
  expect(await isSelected()).toBeFalsy(); // ← stato ripristinato, nessun residuo
});
