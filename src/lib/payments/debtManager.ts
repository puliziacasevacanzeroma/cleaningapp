/**
 * SISTEMA CONTABILE - Gestione Debiti e Pagamenti
 * 
 * REGOLE:
 * - Ogni servizio appartiene al mese in cui è stato erogato
 * - Scadenza WARNING: 5 del mese successivo
 * - Scadenza CRITICA: 10 del mese successivo
 * - Pagamenti FIFO: si scalano prima i debiti più vecchi
 */

// ==================== TYPES ====================

export type DebtStatus = "DA_PAGARE" | "WARNING" | "SCADUTO" | "SALDATO";

export interface MonthDebt {
  month: number;
  year: number;
  monthName: string;
  monthKey: string;           // Es: "2026-01" per sorting
  totaleServizi: number;
  totalePagato: number;
  saldo: number;
  status: DebtStatus;
  scadenza: Date;             // Data scadenza (10 del mese dopo)
  warningDate: Date;          // Data warning (5 del mese dopo)
  giorniAllaScadenza: number; // Giorni mancanti (negativo se scaduto)
}

export interface ClientDebtSummary {
  proprietarioId: string;
  proprietarioName: string;
  debts: MonthDebt[];         // Mesi con debito > 0
  totalDebt: number;
  oldestDebtMonth?: string;
  hasScaduto: boolean;        // Ha almeno un debito scaduto
  hasWarning: boolean;        // Ha almeno un debito in warning
}

export interface PaymentAllocation {
  month: number;
  year: number;
  amount: number;
}

// ==================== CONSTANTS ====================

export const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

export const MONTHS_SHORT_IT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic"
];

export const SCADENZA_WARNING_GIORNO = 5;  // Warning dal 5 del mese
export const SCADENZA_CRITICA_GIORNO = 10; // Scaduto dal 10 del mese

// ==================== HELPERS ====================

/**
 * Calcola la data di scadenza per un mese di servizio
 * Es: servizi di Gennaio 2026 → scadenza 10 Febbraio 2026
 */
export function getScadenzaDate(month: number, year: number): Date {
  let scadenzaMonth = month + 1;
  let scadenzaYear = year;
  
  if (scadenzaMonth > 12) {
    scadenzaMonth = 1;
    scadenzaYear++;
  }
  
  return new Date(scadenzaYear, scadenzaMonth - 1, SCADENZA_CRITICA_GIORNO, 23, 59, 59);
}

/**
 * Calcola la data di warning per un mese di servizio
 * Es: servizi di Gennaio 2026 → warning 5 Febbraio 2026
 */
export function getWarningDate(month: number, year: number): Date {
  let warningMonth = month + 1;
  let warningYear = year;
  
  if (warningMonth > 12) {
    warningMonth = 1;
    warningYear++;
  }
  
  return new Date(warningYear, warningMonth - 1, SCADENZA_WARNING_GIORNO, 0, 0, 0);
}

/**
 * Calcola lo status di un debito basato sulla data corrente
 */
export function getDebtStatus(month: number, year: number, saldo: number): DebtStatus {
  if (saldo <= 0) return "SALDATO";
  
  const now = new Date();
  const scadenza = getScadenzaDate(month, year);
  const warning = getWarningDate(month, year);
  
  if (now > scadenza) return "SCADUTO";
  if (now >= warning) return "WARNING";
  return "DA_PAGARE";
}

/**
 * Calcola i giorni mancanti alla scadenza (negativo se già scaduto)
 */
export function getGiorniAllaScadenza(month: number, year: number): number {
  const now = new Date();
  const scadenza = getScadenzaDate(month, year);
  
  const diffTime = scadenza.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Genera la chiave univoca per un mese (per sorting)
 */
export function getMonthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Formatta un importo in Euro
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Formatta una data in formato italiano breve
 */
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Formatta una data in formato italiano completo
 */
export function formatDateFull(date: Date): string {
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ==================== FIFO PAYMENT ALLOCATION ====================

/**
 * Distribuisce un pagamento sui debiti usando logica FIFO
 * (Prima i debiti più vecchi)
 * 
 * @param amount - Importo da distribuire
 * @param debts - Array di debiti ordinati dal più vecchio al più recente
 * @returns Array di allocazioni (mese, anno, importo)
 */
export function allocatePaymentFIFO(
  amount: number, 
  debts: MonthDebt[]
): PaymentAllocation[] {
  const allocations: PaymentAllocation[] = [];
  let remainingAmount = amount;
  
  // Ordina i debiti dal più vecchio al più recente
  const sortedDebts = [...debts]
    .filter(d => d.saldo > 0)
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  
  for (const debt of sortedDebts) {
    if (remainingAmount <= 0) break;
    
    const allocationAmount = Math.min(remainingAmount, debt.saldo);
    
    if (allocationAmount > 0) {
      allocations.push({
        month: debt.month,
        year: debt.year,
        amount: allocationAmount,
      });
      
      remainingAmount -= allocationAmount;
    }
  }
  
  return allocations;
}

/**
 * Genera descrizione testuale dell'allocazione FIFO
 */
export function describeAllocation(allocations: PaymentAllocation[]): string {
  if (allocations.length === 0) return "Nessuna allocazione";
  
  return allocations
    .map(a => `${MONTHS_SHORT_IT[a.month - 1]} ${a.year}: ${formatCurrency(a.amount)}`)
    .join(" → ");
}

// ==================== STATUS HELPERS ====================

/**
 * Ottieni colore per lo status
 */
export function getStatusColor(status: DebtStatus): {
  bg: string;
  text: string;
  border: string;
  badge: string;
} {
  switch (status) {
    case "SCADUTO":
      return {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        badge: "bg-red-500 text-white",
      };
    case "WARNING":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        badge: "bg-amber-500 text-white",
      };
    case "DA_PAGARE":
      return {
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        badge: "bg-blue-500 text-white",
      };
    case "SALDATO":
      return {
        bg: "bg-green-50",
        text: "text-green-700",
        border: "border-green-200",
        badge: "bg-green-500 text-white",
      };
  }
}

/**
 * Ottieni etichetta per lo status
 */
export function getStatusLabel(status: DebtStatus): string {
  switch (status) {
    case "SCADUTO": return "Scaduto";
    case "WARNING": return "In scadenza";
    case "DA_PAGARE": return "Da pagare";
    case "SALDATO": return "Saldato";
  }
}

/**
 * Ottieni icona per lo status
 */
export function getStatusIcon(status: DebtStatus): string {
  switch (status) {
    case "SCADUTO": return "🔴";
    case "WARNING": return "🟡";
    case "DA_PAGARE": return "🔵";
    case "SALDATO": return "✅";
  }
}

// ==================== VALIDATION ====================

/**
 * Verifica se la modal deve essere mostrata
 * (Il 1° del mese se ci sono debiti del mese precedente non saldati)
 */
export function shouldShowPaymentModal(debts: MonthDebt[]): boolean {
  const now = new Date();
  const currentDay = now.getDate();
  
  // Mostra sempre se ci sono debiti scaduti
  const hasScaduto = debts.some(d => d.status === "SCADUTO");
  if (hasScaduto) return true;
  
  // Mostra se siamo nei primi 10 giorni e ci sono debiti del mese precedente
  if (currentDay <= 10) {
    const hasDebts = debts.some(d => d.saldo > 0);
    return hasDebts;
  }
  
  return false;
}

// ==================== EXPORT CSV ====================

export interface ExportOptions {
  includeDetails: boolean;      // Include dettaglio servizi
  filterByProperty?: string;    // Filtra per proprietà
  filterByStatus?: DebtStatus;  // Filtra per status
  filterByMonth?: { month: number; year: number }; // Filtra per mese
  onlyWithDebt?: boolean;       // Solo clienti con debito
}

/**
 * Genera contenuto CSV per export
 */
export function generateCSV(
  clients: ClientDebtSummary[],
  options: ExportOptions = { includeDetails: false }
): string {
  const rows: string[] = [];
  
  // Header
  if (options.includeDetails) {
    rows.push("Cliente,Mese,Anno,Status,Totale Servizi,Pagato,Saldo,Scadenza");
  } else {
    rows.push("Cliente,Totale Debito,Mesi in Sospeso,Status");
  }
  
  // Filter clients
  let filteredClients = clients;
  
  if (options.onlyWithDebt) {
    filteredClients = filteredClients.filter(c => c.totalDebt > 0);
  }
  
  if (options.filterByStatus) {
    filteredClients = filteredClients.filter(c => 
      c.debts.some(d => d.status === options.filterByStatus)
    );
  }
  
  // Data rows
  for (const client of filteredClients) {
    if (options.includeDetails) {
      for (const debt of client.debts) {
        if (options.filterByMonth) {
          if (debt.month !== options.filterByMonth.month || 
              debt.year !== options.filterByMonth.year) {
            continue;
          }
        }
        
        rows.push([
          `"${client.proprietarioName}"`,
          debt.monthName,
          debt.year,
          getStatusLabel(debt.status),
          debt.totaleServizi.toFixed(2),
          debt.totalePagato.toFixed(2),
          debt.saldo.toFixed(2),
          formatDateShort(debt.scadenza),
        ].join(","));
      }
    } else {
      const statusList = [...new Set(client.debts.map(d => d.status))];
      const worstStatus = statusList.includes("SCADUTO") ? "SCADUTO" :
                         statusList.includes("WARNING") ? "WARNING" :
                         statusList.includes("DA_PAGARE") ? "DA_PAGARE" : "SALDATO";
      
      rows.push([
        `"${client.proprietarioName}"`,
        client.totalDebt.toFixed(2),
        client.debts.length,
        getStatusLabel(worstStatus),
      ].join(","));
    }
  }
  
  return rows.join("\n");
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
