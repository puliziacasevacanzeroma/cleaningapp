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
  /** URL della foto della proprietà (opzionale, per il quadrato nella card) */
  imageUrl?: string;
  totalAmount: number;
  totalAmountFormatted: string;
  cleanings: CleaningForPdf[];
}

export interface CleaningForPdf {
  id: string;
  date: Date;
  isSgrosso: boolean;
  sgrossoReasonLabel?: string;
  /** 
   * Tipo servizio per l'etichetta nel PDF:
   *  - "PULIZIA_CON_BIANCHERIA": pulizia + biancheria collegata → "Pulizia con biancheria"
   *  - "PULIZIA": pulizia da sola → "Pulizia"
   *  - "CONSEGNA_BIANCHERIA": solo ordine biancheria standalone → "Consegna biancheria"
   */
  serviceType?: "PULIZIA_CON_BIANCHERIA" | "PULIZIA" | "CONSEGNA_BIANCHERIA";
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
  /** ID nel database Firestore. Opzionale per retrocompatibilità ma necessario per il merge corretto. */
  itemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// ════════════════════════════════════════════════════════════════
// COSTANTI
// ════════════════════════════════════════════════════════════════

const MONTHS_ABBR = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

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
    checkPage(22);

    // Header proprietà — design Demo 3 (barra blu sopra, niente foto/placeholder)
    const HEADER_H = 16;
    const BAR_H = 1.2; // spessore barra accent in alto

    // Card bianca con bordo grigio chiaro
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, y, CW, HEADER_H, 2, 2, "F");
    // Bordo sottile
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, CW, HEADER_H, 2, 2, "S");

    // Barra accent blu scuro in alto
    doc.setFillColor(12, 74, 110); // blu scuro
    // Disegno solo la parte alta come rettangolo (non rounded sotto)
    doc.rect(M + 1, y, CW - 2, BAR_H, "F");

    // Nome e indirizzo (a sinistra)
    const textX = M + 5;
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(10.5); doc.setFont("helvetica", "bold");
    doc.text(prop.name, textX, y + 7.5);
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); // slate-500
    // Indirizzo in caps spaziati
    const addressUpper = (prop.address || "-").toUpperCase();
    doc.text(addressUpper, textX, y + 12.5, { charSpace: 0.3 });

    // Totale a destra (con etichetta "TOTALE" sopra)
    doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(148, 163, 184); // slate-400
    doc.text("TOTALE", W - M - 4, y + 6, { align: "right", charSpace: 0.5 });
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(12, 74, 110); // blu scuro
    doc.text(prop.totalAmountFormatted, W - M - 4, y + 12, { align: "right" });

    y += HEADER_H + 3;

    // Pulizie della proprietà
    for (const cl of prop.cleanings) {
      const linesNeeded = estimateCleaningLines(cl);
      checkPage(linesNeeded);

      // Sfondo riga (giallo se sgrosso, bianco altrimenti)
      if (cl.isSgrosso) {
        doc.setFillColor(255, 251, 235);
        doc.roundedRect(M, y, CW, 12, 1, 1, "F");
      }

      // Quadratino data — giorno (grande) sopra + mese (abbreviato) sotto
      const DATE_BOX_SIZE = 11;
      const dateBoxX = M + 2;
      const dateBoxY = y + 0.5;
      doc.setFillColor(cl.isSgrosso ? 180 : 12, cl.isSgrosso ? 83 : 74, cl.isSgrosso ? 9 : 110);
      doc.roundedRect(dateBoxX, dateBoxY, DATE_BOX_SIZE, DATE_BOX_SIZE, 1.2, 1.2, "F");
      const cx = dateBoxX + DATE_BOX_SIZE / 2;
      // Giorno (grande, in alto)
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(cl.date.getDate().toString(), cx, dateBoxY + 5.2, { align: "center" });
      // Mese abbreviato (piccolo, sotto)
      doc.setFontSize(5); doc.setFont("helvetica", "bold");
      doc.text(MONTHS_ABBR[cl.date.getMonth()] || "", cx, dateBoxY + 9, { align: "center" });
      y += 1;

      // Titolo del servizio (centrato verticalmente rispetto al quadratino data 11mm)
      const titleX = M + 14 + 2;
      const titleBaselineY = y + 7; // centro verticale del quadratino (~y + 6) + offset baseline
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      // Determino il testo del titolo
      let titleText: string;
      if (cl.isSgrosso) {
        titleText = cl.sgrossoReasonLabel ? `Sgrosso — ${cl.sgrossoReasonLabel}` : "Sgrosso";
      } else if (cl.serviceType === "CONSEGNA_BIANCHERIA") {
        titleText = "Consegna biancheria";
      } else if (cl.serviceType === "PULIZIA_CON_BIANCHERIA") {
        titleText = "Pulizia con biancheria";
      } else {
        titleText = "Pulizia";
      }
      // Render titolo
      if (cl.isSgrosso) {
        doc.setFillColor(180, 83, 9);
        doc.roundedRect(titleX, titleBaselineY - 3, 16, 4, 0.5, 0.5, "F");
        doc.setTextColor(255, 255, 255); doc.setFontSize(6);
        doc.text("SGROSSO", titleX + 8, titleBaselineY, { align: "center" });
        doc.setTextColor(15, 23, 42); doc.setFontSize(9);
        doc.text(titleText, titleX + 18, titleBaselineY);
      } else {
        doc.text(titleText, titleX, titleBaselineY);
      }
      // Totale del servizio a destra (allineato al titolo)
      doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text(cl.totalFormatted, W - M - 4, titleBaselineY, { align: "right" });
      y += 13; // più spazio sotto per accomodare il quadratino 11mm

      // Voce: Pulizia (con base + holiday se presente).
      // SKIP se è una consegna biancheria standalone (basePrice = 0).
      if (cl.basePrice + cl.holidayFee > 0) {
        drawServiceRow(doc, "Pulizia", cl.basePrice + cl.holidayFee, [14, 165, 233], titleX, W - M - 4, y);
        y += 4.5;
      }

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
  // Barretta colorata (più alta per allinearsi al font bold)
  doc.setFillColor(color[0]!, color[1]!, color[2]!);
  doc.rect(xLeft, y, 0.8, 4, "F");
  // Testo label in grassetto, colore intonato alla barretta (versione scura per leggibilità)
  // I 3 canali colore vengono scuriti del ~50% per ottenere un colore "scuro tinta"
  const darkR = Math.round(color[0]! * 0.5);
  const darkG = Math.round(color[1]! * 0.5);
  const darkB = Math.round(color[2]! * 0.5);
  doc.setTextColor(darkR, darkG, darkB);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text(label, xLeft + 3, y + 3);
  // Importo a destra
  doc.setTextColor(15, 23, 42); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(amount), xRight, y + 3, { align: "right" });
}

function estimateCleaningLines(cl: CleaningForPdf): number {
  // Stima approssimativa altezza in mm per page break
  let h = 16; // header servizio (12mm sfondo sgrosso + 1 padding bottom + 3 buffer)
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
