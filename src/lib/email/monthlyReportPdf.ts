/**
 * Generatore PDF: Resoconto Mensile
 * 
 * Allegato all'email mensile inviata il 1° del mese successivo.
 * Contiene il dettaglio completo per proprietà di ogni pulizia/sgrosso/ordine
 * con elenco articoli biancheria, kit cortesia, servizi extra.
 */

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface MonthlyReportPdfParams {
  clientName: string;
  monthLabel: string;
  year: number;
  totalFormatted: string;
  propertiesCount: number;
  servicesCount: number;
  cleaningsCount: number;
  /** Elenco proprietà con dentro pulizie e ordini */
  properties: PropertyForPdf[];
}

export interface PropertyForPdf {
  id: string;
  name: string;
  address: string;
  totalAmount: number;
  totalAmountFormatted: string;
  cleanings: CleaningForPdf[];
}

export interface CleaningForPdf {
  id: string;
  date: Date;
  isSgrosso: boolean;
  sgrossoReasonLabel?: string;
  basePrice: number;        // prezzo pulizia
  holidayFee: number;
  /** Items biancheria (linkati alla pulizia) */
  laundryItems: LaundryItemForPdf[];
  laundryTotal: number;
  /** Items kit cortesia */
  kitItems: LaundryItemForPdf[];
  kitTotal: number;
  /** Items servizi extra */
  extraItems: LaundryItemForPdf[];
  extraTotal: number;
  /** Costo consegna biancheria */
  deliveryFee: number;
  /** Costo preparazione letti */
  bedMakingFee: number;
  /** Totale finale del servizio (somma di tutto) */
  totalFormatted: string;
}

export interface LaundryItemForPdf {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// ════════════════════════════════════════════════════════════════
// GENERATORE PDF
// ════════════════════════════════════════════════════════════════

/**
 * Genera il PDF e lo restituisce come Buffer (per allegarlo a un'email).
 */
export async function generateMonthlyReportPdf(p: MonthlyReportPdfParams): Promise<Buffer> {
  const jspdfModule: any = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
  if (!jsPDF) throw new Error("jsPDF non trovato");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Costanti layout
  const W = 210; // larghezza A4 in mm
  const H = 297; // altezza A4 in mm
  const M = 14;  // margine
  const CW = W - M * 2; // larghezza utile contenuto
  const BOTTOM = H - 18; // soglia per page break
  let y = 0;

  // Helper: page break automatico
  const checkPage = (needed: number) => {
    if (y + needed > BOTTOM) {
      drawFooter(doc, W, H, M);
      doc.addPage();
      y = 18;
    }
  };

  // ─── HEADER PRIMA PAGINA ─────────────────────────────────────
  drawHeader(doc, p, W, M);
  y = 52;

  // ─── BOX TOTALE COMPLESSIVO ──────────────────────────────────
  doc.setFillColor(12, 74, 110); // blu scuro
  doc.roundedRect(M, y, CW, 24, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("TOTALE COMPLESSIVO", M + 6, y + 7);
  doc.setFontSize(20); doc.setFont("helvetica", "normal");
  doc.text(p.totalFormatted, M + 6, y + 18);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  const subText = `${p.propertiesCount} immobili · ${p.servicesCount} servizi`;
  doc.text(subText, W - M - 6, y + 18, { align: "right" });
  y += 30;

  // ─── DESTINATARIO + EMISSIONE ────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(M, y, CW, 14, 2, 2, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6); doc.setFont("helvetica", "bold");
  doc.text("DESTINATARIO", M + 4, y + 5);
  doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  doc.text(p.clientName, M + 4, y + 11);

  doc.setFontSize(6); doc.setTextColor(100, 116, 139); doc.setFont("helvetica", "bold");
  doc.text("EMISSIONE", W - M - 4, y + 5, { align: "right" });
  doc.setFontSize(9); doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "normal");
  doc.text(formatDateIt(new Date()), W - M - 4, y + 11, { align: "right" });
  y += 20;

  // ─── PROPRIETÀ ───────────────────────────────────────────────
  for (const prop of p.properties) {
    checkPage(20);

    // Header proprietà
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(M, y, CW, 13, 2, 2, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(prop.name, M + 4, y + 5.5);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(prop.address || "-", M + 4, y + 10.5);
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
    doc.text(prop.totalAmountFormatted, W - M - 4, y + 8, { align: "right" });
    y += 16;

    // Pulizie della proprietà
    for (const cl of prop.cleanings) {
      const linesNeeded = estimateCleaningLines(cl);
      checkPage(linesNeeded);

      // Sfondo riga (giallo se sgrosso, bianco altrimenti)
      const rowStart = y;
      if (cl.isSgrosso) {
        doc.setFillColor(255, 251, 235);
        doc.roundedRect(M, y, CW, 6, 1, 1, "F");
      }

      // Quadratino data
      const dateBoxX = M + 2;
      const dateBoxY = y + 1;
      doc.setFillColor(cl.isSgrosso ? 180 : 12, cl.isSgrosso ? 83 : 74, cl.isSgrosso ? 9 : 110);
      doc.roundedRect(dateBoxX, dateBoxY, 9, 9, 1, 1, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text(cl.date.getDate().toString(), dateBoxX + 4.5, dateBoxY + 6, { align: "center" });
      y += 1;

      // Titolo
      const titleX = M + 14;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      if (cl.isSgrosso) {
        doc.setFillColor(180, 83, 9);
        doc.roundedRect(titleX, y + 1, 16, 4, 0.5, 0.5, "F");
        doc.setTextColor(255, 255, 255); doc.setFontSize(6);
        doc.text("SGROSSO", titleX + 8, y + 4, { align: "center" });
        doc.setTextColor(15, 23, 42); doc.setFontSize(9);
        const lbl = cl.sgrossoReasonLabel ? `Sgrosso — ${cl.sgrossoReasonLabel}` : "Sgrosso";
        doc.text(lbl, titleX + 18, y + 4);
      } else {
        doc.text("Pulizia", titleX, y + 4);
      }
      // Totale del servizio a destra
      doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text(cl.totalFormatted, W - M - 4, y + 4, { align: "right" });
      y += 7;

      // Voce: Pulizia (con base + holiday se presente)
      drawServiceRow(doc, "Pulizia", cl.basePrice + cl.holidayFee, [14, 165, 233], titleX, W - M - 4, y);
      y += 4.5;

      // Voce: Biancheria (con sotto-menu) - SOLO se ci sono items
      if (cl.laundryItems.length > 0 && cl.laundryTotal > 0) {
        const subMenuHeight = 4 + cl.laundryItems.length * 3.5 + 2;
        checkPage(subMenuHeight);
        // Box viola chiaro
        doc.setFillColor(250, 245, 255);
        doc.rect(titleX, y, CW - (titleX - M), subMenuHeight, "F");
        doc.setFillColor(139, 92, 246); // bordo sx viola
        doc.rect(titleX, y, 0.8, subMenuHeight, "F");
        // Voce principale "Biancheria"
        doc.setTextColor(107, 33, 168); // viola scuro
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("Biancheria", titleX + 3, y + 3);
        doc.setFontSize(8.5);
        doc.text(formatCurrency(cl.laundryTotal), W - M - 4, y + 3, { align: "right" });
        // Items
        doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7);
        for (let i = 0; i < cl.laundryItems.length; i++) {
          const it = cl.laundryItems[i]!;
          const ly = y + 6 + i * 3.5;
          doc.text(`· ${it.name} × ${it.quantity}`, titleX + 5, ly);
          doc.text(formatCurrency(it.totalPrice), W - M - 4, ly, { align: "right" });
        }
        y += subMenuHeight + 1;
      }

      // Voce: Kit cortesia (sotto-menu) se presente
      if (cl.kitItems.length > 0 && cl.kitTotal > 0) {
        const subMenuHeight = 4 + cl.kitItems.length * 3.5 + 2;
        checkPage(subMenuHeight);
        doc.setFillColor(254, 252, 232); // giallo chiaro
        doc.rect(titleX, y, CW - (titleX - M), subMenuHeight, "F");
        doc.setFillColor(245, 158, 11);
        doc.rect(titleX, y, 0.8, subMenuHeight, "F");
        doc.setTextColor(146, 64, 14);
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("Kit cortesia", titleX + 3, y + 3);
        doc.setFontSize(8.5);
        doc.text(formatCurrency(cl.kitTotal), W - M - 4, y + 3, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7);
        for (let i = 0; i < cl.kitItems.length; i++) {
          const it = cl.kitItems[i]!;
          const ly = y + 6 + i * 3.5;
          doc.text(`· ${it.name} × ${it.quantity}`, titleX + 5, ly);
          doc.text(formatCurrency(it.totalPrice), W - M - 4, ly, { align: "right" });
        }
        y += subMenuHeight + 1;
      }

      // Voce: Servizi extra (sotto-menu) se presenti
      if (cl.extraItems.length > 0 && cl.extraTotal > 0) {
        const subMenuHeight = 4 + cl.extraItems.length * 3.5 + 2;
        checkPage(subMenuHeight);
        doc.setFillColor(236, 253, 245); // verde chiaro
        doc.rect(titleX, y, CW - (titleX - M), subMenuHeight, "F");
        doc.setFillColor(16, 185, 129);
        doc.rect(titleX, y, 0.8, subMenuHeight, "F");
        doc.setTextColor(6, 95, 70);
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("Servizi extra", titleX + 3, y + 3);
        doc.setFontSize(8.5);
        doc.text(formatCurrency(cl.extraTotal), W - M - 4, y + 3, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(7);
        for (let i = 0; i < cl.extraItems.length; i++) {
          const it = cl.extraItems[i]!;
          const ly = y + 6 + i * 3.5;
          doc.text(`· ${it.name} × ${it.quantity}`, titleX + 5, ly);
          doc.text(formatCurrency(it.totalPrice), W - M - 4, ly, { align: "right" });
        }
        y += subMenuHeight + 1;
      }

      // Voce: consegna se presente
      if (cl.deliveryFee > 0) {
        drawServiceRow(doc, "Consegna biancheria", cl.deliveryFee, [245, 158, 11], titleX, W - M - 4, y);
        y += 4.5;
      }

      // Voce: preparazione letti se presente
      if (cl.bedMakingFee > 0) {
        drawServiceRow(doc, "Preparazione letti", cl.bedMakingFee, [16, 185, 129], titleX, W - M - 4, y);
        y += 4.5;
      }

      // Linea divisoria leggera
      y += 1;
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
      doc.line(M + 2, y, W - M - 2, y);
      y += 3;
    }

    y += 3;
  }

  // Footer ultima pagina
  drawFooter(doc, W, H, M);

  // Numerazione pagine: itero su tutte le pagine
  const totalPages = (doc.internal as any).getNumberOfPages?.() || 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(`Pagina ${i} di ${totalPages}`, W - M, H - 6, { align: "right" });
  }

  // Restituisco come Buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function drawHeader(doc: any, p: MonthlyReportPdfParams, W: number, M: number) {
  // Header bianco con bordo blu
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 44, "F");
  doc.setFillColor(12, 74, 110); doc.rect(0, 44, W, 1.5, "F");

  // Wordmark
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Puliziacasevacanze", M, 16);
  doc.setTextColor(234, 179, 8);
  doc.text(".it", M + doc.getTextWidth("Puliziacasevacanze"), 16);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text("PULIZIE E SERVIZI PER STRUTTURE EXTRALBERGHIERE", M, 22);

  // Titolo a destra
  doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("RESOCONTO MENSILE", W - M, 16, { align: "right" });
  doc.setTextColor(15, 23, 42); doc.setFontSize(14); doc.setFont("helvetica", "normal");
  doc.text(`${p.monthLabel} ${p.year}`, W - M, 24, { align: "right" });
}

function drawFooter(doc: any, W: number, H: number, M: number) {
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text("Puliziacasevacanze.it · Via della Cava Aurelia 84, Roma · +39 392 7830017 · puliziacasevacanzeroma@gmail.com", M, H - 6);
}

function drawServiceRow(doc: any, label: string, amount: number, color: number[], xLeft: number, xRight: number, y: number) {
  // Barretta colorata
  doc.setFillColor(color[0]!, color[1]!, color[2]!);
  doc.rect(xLeft, y + 1, 0.8, 3, "F");
  // Testo
  doc.setTextColor(51, 65, 85); doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text(label, xLeft + 3, y + 3.5);
  doc.setTextColor(15, 23, 42); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(amount), xRight, y + 3.5, { align: "right" });
}

function estimateCleaningLines(cl: CleaningForPdf): number {
  // Stima approssimativa altezza in mm per page break
  let h = 14; // header servizio
  h += 5; // voce pulizia
  if (cl.laundryItems.length > 0 && cl.laundryTotal > 0) h += 6 + cl.laundryItems.length * 3.5;
  if (cl.kitItems.length > 0 && cl.kitTotal > 0) h += 6 + cl.kitItems.length * 3.5;
  if (cl.extraItems.length > 0 && cl.extraTotal > 0) h += 6 + cl.extraItems.length * 3.5;
  if (cl.deliveryFee > 0) h += 5;
  if (cl.bedMakingFee > 0) h += 5;
  h += 4; // separatore
  return h;
}

function formatCurrency(amount: number): string {
  return "€ " + amount.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateIt(d: Date): string {
  const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
