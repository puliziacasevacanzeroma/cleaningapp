/**
 * Generatore PDF: Estratto Conto Debiti
 *
 * Allegato alle email warning (5 del mese) e suspension (10 del mese).
 *
 * IMPORTANTE: il totale di copertina di QUESTO PDF è ESATTAMENTE uguale
 * al banner email (somma di tutti i mesi non saldati). Questo risolve
 * l'incoerenza tra email (mostrava solo mesi scaduti) e PDF (mostrava
 * UN mese di fatturato e basta).
 *
 * STRUTTURA:
 * - Pagina 1: Copertina con totale dovuto + breakdown per mese
 * - Pagine successive: una sezione per ogni mese in debito con
 *   totale fatturato, pagamenti ricevuti, saldo aperto.
 *
 * Layout coerente con monthlyReportPdf.ts (header rosso/giallo,
 * footer aziendale, font Helvetica + Times).
 */

import type { MonthDebtServer } from "../payments/computeOwnerDebt";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface DebtStatementPdfParams {
  /** Nome completo del cliente */
  clientName: string;
  /** Tipo di documento — cambia il colore della copertina e l'etichetta */
  documentType: "WARNING" | "SUSPENSION";
  /** Data di emissione del documento (oggi) */
  issueDate: Date;
  /** Tutti i mesi non saldati ordinati cronologicamente (più vecchi prima) */
  debts: MonthDebtServer[];
  /** Totale dovuto (somma di tutti i saldi) */
  totalDebt: number;
  /** Data limite per pagamento — usata in copertina */
  paymentDeadline: Date;
}

// ════════════════════════════════════════════════════════════════
// PDF GENERATOR
// ════════════════════════════════════════════════════════════════

/**
 * Genera il PDF estratto conto e lo restituisce come Buffer.
 */
export async function generateDebtStatementPdf(p: DebtStatementPdfParams): Promise<Buffer> {
  const jspdfModule: any = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
  if (!jsPDF) throw new Error("jsPDF non trovato");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Costanti layout (coerenti con monthlyReportPdf)
  const W = 210;
  const H = 297;
  const M = 14;
  const CW = W - M * 2;
  const BOTTOM = H - 18;
  let y = 0;

  // Palette in base al tipo di documento
  const isWarning = p.documentType === "WARNING";
  const accentColor = isWarning
    ? [217, 119, 6]   // ambra #d97706
    : [185, 28, 28];  // rosso #b91c1c
  const accentDark = isWarning
    ? [120, 53, 15]   // ambra scuro #78350f
    : [127, 29, 29];  // rosso scuro #7f1d1d

  // Helper page break
  const checkPage = (needed: number) => {
    if (y + needed > BOTTOM) {
      drawFooter(doc, W, H, M);
      doc.addPage();
      y = 18;
    }
  };

  // ─── PAGINA 1: HEADER + COPERTINA ─────────────────────────
  drawHeader(doc, p, W, M, accentColor, accentDark);
  y = 32;

  // ─── BOX TOTALE DOVUTO (palette in base al tipo) ──────────
  const totalBoxH = 30;
  // Sfondo colorato (ambra o rosso)
  doc.setFillColor(accentColor[0]!, accentColor[1]!, accentColor[2]!);
  doc.rect(0, y, W, totalBoxH, "F");

  // Etichetta "TOTALE DOVUTO"
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("IMPORTO TOTALE DOVUTO", M, y + 8, { charSpace: 0.4 });

  // Importo grande in serif
  doc.setFontSize(32); doc.setFont("times", "normal");
  doc.text(formatCurrency(p.totalDebt), M, y + 23);

  // A destra: data scadenza
  const deadlineLabel = isWarning ? "SCADENZA PAGAMENTO" : "PAGAMENTO SCADUTO IL";
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text(deadlineLabel, W - M, y + 8, { align: "right", charSpace: 0.4 });
  doc.setFontSize(13); doc.setFont("times", "normal");
  doc.text(formatDateIt(p.paymentDeadline), W - M, y + 18, { align: "right" });

  // Counter mesi a destra
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text(`${p.debts.length} ${p.debts.length === 1 ? "mese" : "mesi"} non saldati`, W - M, y + 25, { align: "right" });

  y += totalBoxH;

  // ─── DESTINATARIO + EMISSIONE ─────────────────────────────
  const recipientH = 14;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, y, W, recipientH, "F");

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6); doc.setFont("helvetica", "bold");
  doc.text("DESTINATARIO", M, y + 5, { charSpace: 0.4 });
  doc.setFontSize(10); doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold");
  doc.text(p.clientName, M, y + 11);

  doc.setFontSize(6); doc.setTextColor(100, 116, 139); doc.setFont("helvetica", "bold");
  doc.text("EMISSIONE", W - M, y + 5, { align: "right", charSpace: 0.4 });
  doc.setFontSize(10); doc.setTextColor(15, 23, 42);
  doc.text(formatDateIt(p.issueDate), W - M, y + 11, { align: "right" });

  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.line(M, y + recipientH, W - M, y + recipientH);
  y += recipientH + 10;

  // ─── RIEPILOGO PER MESE (tabella copertina) ──────────────
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("DETTAGLIO PER MESE", M, y, { charSpace: 0.4 });
  y += 6;

  // Header tabella
  doc.setFillColor(248, 250, 252);
  doc.rect(M, y, CW, 7, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("MESE", M + 3, y + 4.5, { charSpace: 0.3 });
  doc.text("FATTURATO", M + 70, y + 4.5, { align: "right", charSpace: 0.3 });
  doc.text("PAGATO", M + 110, y + 4.5, { align: "right", charSpace: 0.3 });
  doc.text("STATO", M + 140, y + 4.5, { align: "right", charSpace: 0.3 });
  doc.text("SALDO APERTO", M + CW - 3, y + 4.5, { align: "right", charSpace: 0.3 });
  y += 7;

  // Righe per mese
  for (const d of p.debts) {
    checkPage(8);

    // Sfondo alternato
    const isOdd = p.debts.indexOf(d) % 2 === 1;
    if (isOdd) {
      doc.setFillColor(252, 252, 253);
      doc.rect(M, y, CW, 8, "F");
    }

    // Mese
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(`${d.monthName} ${d.year}`, M + 3, y + 5);

    // Fatturato
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(formatCurrency(d.totaleServizi), M + 70, y + 5, { align: "right" });

    // Pagato
    doc.text(formatCurrency(d.totalePagato), M + 110, y + 5, { align: "right" });

    // Stato (badge colorato)
    const statusLabel = d.status === "SCADUTO" ? "SCADUTO" : "IN SCADENZA";
    const statusColor = d.status === "SCADUTO" ? [185, 28, 28] : [217, 119, 6];
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.setTextColor(statusColor[0]!, statusColor[1]!, statusColor[2]!);
    doc.text(statusLabel, M + 140, y + 5, { align: "right", charSpace: 0.3 });

    // Saldo aperto
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.setTextColor(accentDark[0]!, accentDark[1]!, accentDark[2]!);
    doc.text(formatCurrency(d.saldo), M + CW - 3, y + 5, { align: "right" });

    // Bordo sotto
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.15);
    doc.line(M, y + 8, M + CW, y + 8);

    y += 8;
  }

  // Totale fondo tabella
  y += 2;
  doc.setFillColor(accentColor[0]!, accentColor[1]!, accentColor[2]!);
  doc.rect(M, y, CW, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("TOTALE DOVUTO", M + 3, y + 5.5, { charSpace: 0.3 });
  doc.setFontSize(11); doc.setFont("times", "normal");
  doc.text(formatCurrency(p.totalDebt), M + CW - 3, y + 6, { align: "right" });
  y += 9 + 10;

  // ─── NOTA DI CHIUSURA ─────────────────────────────────────
  checkPage(28);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(M, y, CW, 22, 2, 2, "F");
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.roundedRect(M, y, CW, 22, 2, 2, "S");

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("MODALITÀ DI PAGAMENTO", M + 5, y + 6, { charSpace: 0.3 });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  const noteText = isWarning
    ? "Per il saldo dell'importo dovuto e l'emissione di regolare fattura, contattare telefonicamente l'amministrazione al numero +39 392 7830017."
    : "L'erogazione dei servizi e l'accesso al gestionale sono sospesi fino a regolarizzazione della posizione contabile. Per il saldo e il ripristino dell'account, contattare telefonicamente l'amministrazione al numero +39 392 7830017.";

  const noteLines = doc.splitTextToSize(noteText, CW - 10);
  doc.text(noteLines, M + 5, y + 12);
  y += 22;

  // ─── FOOTER FINALE ────────────────────────────────────────
  drawFooter(doc, W, H, M);

  // Restituisce il PDF come Buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

// ════════════════════════════════════════════════════════════════
// HELPERS PRIVATI
// ════════════════════════════════════════════════════════════════

function drawHeader(
  doc: any,
  p: DebtStatementPdfParams,
  W: number,
  M: number,
  accentColor: number[],
  accentDark: number[],
) {
  const HEADER_H = 32;

  // Banda blu (full width)
  doc.setFillColor(12, 74, 110); // #0c4a6e
  doc.rect(0, 0, W, HEADER_H, "F");

  // Trapezio colorato a destra (ambra o rosso in base al tipo)
  const accTopLeft = W - 58;
  const accBottomLeft = W - 74;
  doc.setFillColor(accentColor[0]!, accentColor[1]!, accentColor[2]!);
  doc.lines(
    [
      [accBottomLeft - accTopLeft, HEADER_H],
      [W - accBottomLeft, 0],
      [0, -HEADER_H],
      [-(W - accTopLeft), 0],
    ],
    accTopLeft,
    0,
    [1, 1],
    "F",
    true,
  );

  // Wordmark a sinistra
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont("helvetica", "bold");
  const wordmarkPart1 = "Puliziacasevacanze";
  const wordmarkPart1Width = doc.getTextWidth(wordmarkPart1);
  doc.text(wordmarkPart1, M, 14);
  doc.setTextColor(251, 191, 36);
  doc.text(".it", M + wordmarkPart1Width, 14);

  // Sottotitolo
  doc.setTextColor(180, 200, 220);
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text("PULIZIE E SERVIZI PER STRUTTURE EXTRALBERGHIERE", M, 21, { charSpace: 0.4 });

  // Testo nel trapezio (etichetta + tipo doc)
  const yellowCenterX = (accTopLeft + W) / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("ESTRATTO CONTO", yellowCenterX, 10, { align: "center", charSpace: 0.6 });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont("times", "normal");
  const titleLabel = p.documentType === "WARNING" ? "Promemoria" : "Sospensione";
  doc.text(titleLabel, yellowCenterX, 20, { align: "center" });

  doc.setFontSize(10); doc.setFont("times", "normal");
  doc.text("Stato debiti", yellowCenterX, 28, { align: "center" });

  // Suppress unused warning per accentDark (può essere usato in espansioni future)
  void accentDark;
}

function drawFooter(doc: any, W: number, H: number, M: number) {
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.line(M, H - 16, W - M, H - 16);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("Puliziacasevacanze.it", M, H - 11);
  doc.setFont("helvetica", "normal"); doc.setTextColor(148, 163, 184);
  doc.text(" · Via della Cava Aurelia 84, Roma · +39 392 7830017 · puliziacasevacanzeroma@gmail.com",
    M + doc.getTextWidth("Puliziacasevacanze.it"), H - 11);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
  doc.text("Puliziacasevacanze.it srls · P.IVA 17817311008", M, H - 6);
}

function formatCurrency(amount: number): string {
  return "€ " + amount.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateIt(d: Date): string {
  const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
                  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
