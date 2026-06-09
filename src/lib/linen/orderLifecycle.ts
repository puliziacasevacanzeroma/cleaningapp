/**
 * ════════════════════════════════════════════════════════════════════
 * FONTE DI VERITÀ — Ciclo di vita ordine biancheria vs ricalcolo config
 * ════════════════════════════════════════════════════════════════════
 *
 * Modulo PURO (zero dipendenze firebase/react), così è testabile in isolamento.
 *
 * Risponde a UNA domanda: "questo ordine biancheria PENDING va RICALCOLATO
 * dalla configurazione della proprietà, oppure è STORICO/CONGELATO?"
 *
 * Un ordine NON va ricalcolato (è congelato) se:
 *   - è già in stato terminale (DELIVERED / COMPLETED / CANCELLED), OPPURE
 *   - la pulizia collegata è in stato TERMINALE (COMPLETED / VERIFIED):
 *     il servizio è stato erogato e la quantità consegnata è un fatto storico
 *     già fatturato. Cambiare la config NON deve riscrivere il passato.
 *   - (regole preesistenti, preservate identiche)
 *       · la pulizia ha biancheria personalizzata (linenConfigModified === true)
 *       · la pulizia è senza biancheria / la proprietà usa biancheria propria
 */

/** Stati pulizia in cui il servizio è concluso → ordine da congelare. */
export const DONE_CLEANING_STATUSES = ["COMPLETED", "VERIFIED"] as const;

/** Stati ordine terminali → nulla da ricalcolare. */
export const TERMINAL_ORDER_STATUSES = ["DELIVERED", "COMPLETED", "CANCELLED"] as const;

export function isCleaningDone(cleaningStatus: string | null | undefined): boolean {
  if (!cleaningStatus) return false;
  return (DONE_CLEANING_STATUSES as readonly string[]).includes(
    String(cleaningStatus).toUpperCase(),
  );
}

export function isOrderTerminal(orderStatus: string | null | undefined): boolean {
  if (!orderStatus) return false;
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(
    String(orderStatus).toUpperCase(),
  );
}

export interface ConfigRecomputeInput {
  orderStatus?: string | null;
  cleaning?: {
    status?: string | null;
    linenConfigModified?: boolean;
    hasLinenOrder?: boolean;
  } | null;
  propertyUsesOwnLinen?: boolean;
}

/**
 * Ritorna la RAGIONE per cui NON ricalcolare (stringa), oppure `null` se
 * l'ordine VA ricalcolato dalla config.
 *
 * L'ordine dei controlli è dal più "definitivo" al meno: prima lo stato
 * terminale dell'ordine, poi la pulizia conclusa (il fix), poi le regole
 * preesistenti.
 */
export function configRecomputeSkipReason(input: ConfigRecomputeInput): string | null {
  if (isOrderTerminal(input.orderStatus)) {
    return `ordine in stato terminale (${String(input.orderStatus).toUpperCase()})`;
  }

  const c = input.cleaning;
  if (c) {
    // 🔒 IL FIX: pulizia conclusa → biancheria già consegnata/fatturata.
    if (isCleaningDone(c.status)) {
      return `pulizia ${String(c.status).toUpperCase()}: biancheria già consegnata/fatturata (congelata)`;
    }
    // Regola preesistente: biancheria personalizzata.
    if (c.linenConfigModified === true) {
      return "biancheria personalizzata (linenConfigModified)";
    }
    // Regola preesistente: guardia biancheria propria.
    const hlo = c.hasLinenOrder;
    if (hlo === false || (hlo === undefined && input.propertyUsesOwnLinen === true)) {
      return "pulizia senza biancheria / biancheria propria";
    }
  }

  return null; // ✅ ricalcola
}

/** Comodo per i punti che vogliono solo il booleano. */
export function shouldRecomputeOrderFromConfig(input: ConfigRecomputeInput): boolean {
  return configRecomputeSkipReason(input) === null;
}

/**
 * true quando una pulizia PASSA a uno stato concluso (COMPLETED/VERIFIED)
 * partendo da uno stato NON concluso. Serve a triggerare la conferma consegna
 * biancheria SOLO sulla transizione (non a ogni salvataggio di una pulizia
 * già conclusa → evita ri-esecuzioni inutili; l'azione è comunque idempotente).
 */
export function isTransitionToDone(
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
): boolean {
  if (!newStatus) return false; // lo status non è tra i campi aggiornati
  return isCleaningDone(newStatus) && !isCleaningDone(oldStatus);
}
