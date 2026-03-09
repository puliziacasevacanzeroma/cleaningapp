/**
 * Export PDF e XLSX professionali — Pagamenti proprietario
 * Raggruppati per proprietà, biancheria dettagliata articolo per articolo
 */

const MONTHS_FULL = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const MONTHS_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

function fmtCur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}
function fmtDate(d: Date): string {
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;
}
function fmtDateShort(d: Date): string {
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
}
function svcLabel(type: string): string {
  switch(type) {
    case "PULIZIA": return "Pulizia";
    case "BIANCHERIA": return "Biancheria";
    case "KIT_CORTESIA": return "Kit Cortesia";
    case "SERVIZI_EXTRA": return "Servizio Extra";
    default: return type;
  }
}

async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch("/Favicon_64.png");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

interface GroupedProp { propName: string; propTotal: number; groups: any[][]; }

function groupByProperty(services: any[]): GroupedProp[] {
  const propMap = new Map<string, { name: string; services: any[] }>();
  services.forEach(s => {
    if (!propMap.has(s.propertyId)) propMap.set(s.propertyId, { name: s.propertyName, services: [] });
    propMap.get(s.propertyId)!.services.push(s);
  });
  const result: GroupedProp[] = [];
  for (const [, { name, services: svcs }] of propMap) {
    svcs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const groups: any[][] = [];
    const used = new Set<string>();
    svcs.filter((s: any) => s.type === "PULIZIA").forEach((pul: any) => {
      const group = [pul];
      used.add(pul.id);
      svcs.forEach((s: any) => {
        if (s.type !== "PULIZIA" && !used.has(s.id)) {
          if (s.cleaningId === pul.id || pul.laundryOrderId === s.id) { group.push(s); used.add(s.id); }
        }
      });
      groups.push(group);
    });
    svcs.filter((s: any) => !used.has(s.id)).forEach((s: any) => groups.push([s]));
    const propTotal = svcs.reduce((sum: number, sv: any) => sum + sv.effectivePrice, 0);
    result.push({ propName: name, propTotal, groups });
  }
  return result;
}


// ══════════════════════════════════════════════════
//  PDF — biancheria dettagliata riga per riga
// ══════════════════════════════════════════════════
export async function generatePDF(stats: any, summary: any, selectedMonth: number, selectedYear: number) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
  if (!jsPDF) throw new Error("jsPDF non trovato");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, M = 14, CW = W - M * 2;
  let y = 0;
  const checkPage = (needed: number) => { if (y + needed > 278) { doc.addPage(); y = 18; } };

  // HEADER
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 44, "F");
  doc.setFillColor(20, 184, 166); doc.rect(0, 44, W, 1.5, "F");
  const logoB64 = await loadLogoBase64();
  if (logoB64) { try { doc.addImage(logoB64, "PNG", M, 8, 10, 10); } catch {} }
  const tX = logoB64 ? M + 14 : M;
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Riepilogo Pagamenti", tX, 15);
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(148, 163, 184);
  doc.text(`${MONTHS_FULL[selectedMonth - 1]} ${selectedYear}`, tX, 22);
  doc.setFontSize(8); doc.text(stats.proprietarioName || "Proprietario", tX, 28);
  doc.setFontSize(7); doc.setTextColor(100, 116, 139);
  doc.text("puliziacasevacanze.it", W - M, 15, { align: "right" });
  doc.text(`Generato il ${fmtDate(new Date())}`, W - M, 21, { align: "right" });
  y = 52;

  // 3 BOX
  const bW = (CW - 6) / 3;
  [
    { label: "TOTALE SERVIZI", val: fmtCur(summary.totaleServizi), bg: [241,245,249], fg: [15,23,42] },
    { label: "PAGATO", val: fmtCur(summary.totalePagato), bg: [209,250,229], fg: [4,120,87] },
    { label: "DA PAGARE", val: fmtCur(summary.totaleDovuto), bg: [254,226,226], fg: [185,28,28] },
  ].forEach((b, i) => {
    const x = M + i * (bW + 3);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]); doc.roundedRect(x, y, bW, 18, 2, 2, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(107, 114, 128);
    doc.text(b.label, x + bW / 2, y + 6, { align: "center" });
    doc.setFontSize(12); doc.setTextColor(b.fg[0], b.fg[1], b.fg[2]);
    doc.text(b.val, x + bW / 2, y + 14.5, { align: "center" });
  });
  doc.setFont("helvetica", "normal"); y += 26;

  const pmParts: string[] = [];
  if (summary.totaleContanti > 0) pmParts.push(`Contanti: ${fmtCur(summary.totaleContanti)}`);
  if (summary.totaleBonifico > 0) pmParts.push(`Bonifico: ${fmtCur(summary.totaleBonifico)}`);
  if (pmParts.length > 0) { doc.setFontSize(7); doc.setTextColor(100,116,139); doc.text(pmParts.join("     "), M, y); y += 6; }

  // DETTAGLIO PER PROPRIETÀ
  const grouped = groupByProperty(stats.services);

  grouped.forEach((prop) => {
    checkPage(28);
    // Barra proprietà
    doc.setFillColor(30, 41, 59); doc.roundedRect(M, y, CW, 10, 2, 2, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(prop.propName, M + 5, y + 7);
    doc.setFontSize(8); doc.text(fmtCur(prop.propTotal), W - M - 5, y + 7, { align: "right" });
    y += 13;

    // Colonne header
    doc.setFillColor(241,245,249); doc.rect(M, y, CW, 7, "F");
    doc.setDrawColor(226,232,240); doc.line(M, y + 7, M + CW, y + 7);
    doc.setFontSize(5.5); doc.setFont("helvetica", "bold"); doc.setTextColor(100,116,139);
    doc.text("DATA", M + 3, y + 5);
    doc.text("SERVIZIO", M + 22, y + 5);
    doc.text("ARTICOLO", M + 62, y + 5);
    doc.text("QTÀ", M + 120, y + 5);
    doc.text("€/UN.", M + 135, y + 5);
    doc.text("IMPORTO", W - M - 4, y + 5, { align: "right" });
    y += 7;

    let rowIdx = 0;
    prop.groups.forEach((group) => {
      const main = group[0];
      const linked = group.slice(1);
      const linkedItemCount = linked.reduce((n: number, s: any) => n + Math.max(s.items?.length || 0, 1), 0);
      checkPage(9 + linkedItemCount * 5.5 + 4);

      const even = rowIdx % 2 === 0;
      const isP = main.type === "PULIZIA";

      // Riga principale
      doc.setFillColor(isP ? (even ? 255 : 249) : (even ? 250 : 245), isP ? (even ? 255 : 250) : (even ? 245 : 240), isP ? (even ? 255 : 251) : (even ? 255 : 252));
      doc.rect(M, y, CW, 8, "F");
      doc.setDrawColor(241,245,249); doc.line(M, y + 8, M + CW, y + 8);
      doc.setFillColor(isP ? 79 : 147, isP ? 70 : 51, isP ? 229 : 234); doc.rect(M, y, 1.2, 8, "F");

      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(71,85,105);
      doc.text(fmtDateShort(new Date(main.date)), M + 3, y + 5.5);
      doc.setFont("helvetica", "bold"); doc.setTextColor(isP ? 79 : 147, isP ? 70 : 51, isP ? 229 : 234);
      doc.text(svcLabel(main.type), M + 22, y + 5.5);
      doc.setFont("helvetica", "normal"); doc.setTextColor(71,85,105); doc.setFontSize(6.5);
      doc.text((main.description || "").substring(0, 35), M + 62, y + 5.5);

      if (main.hasOverride && main.originalPrice !== main.effectivePrice) {
        doc.setFontSize(5.5); doc.setTextColor(148,163,184);
        const orig = fmtCur(main.originalPrice); const origW = doc.getTextWidth(orig);
        const oX = W - M - 4 - doc.getTextWidth(fmtCur(main.effectivePrice)) - origW - 3;
        doc.text(orig, oX, y + 5.5); doc.setDrawColor(148,163,184); doc.line(oX, y + 4.5, oX + origW, y + 4.5);
      }

      doc.setTextColor(15,23,42); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(fmtCur(main.effectivePrice), W - M - 4, y + 5.5, { align: "right" });
      y += 8;

      // Biancheria collegata — ogni articolo su riga separata
      linked.forEach((sub: any) => {
        if (sub.items && sub.items.length > 0) {
          // Header biancheria
          checkPage(6 + sub.items.length * 5.5);
          doc.setFillColor(248,250,252); doc.rect(M, y, CW, 6, "F");
          doc.setFillColor(20,184,166); doc.rect(M, y, 1.2, 1.5, "F"); doc.rect(M, y + 2.5, 1.2, 1.5, "F"); doc.rect(M, y + 5, 1.2, 1, "F");
          doc.setFontSize(6); doc.setTextColor(203,213,225); doc.setFont("helvetica", "normal"); doc.text("└─", M + 2.5, y + 4.2);
          doc.setTextColor(148,163,184); doc.text(fmtDateShort(new Date(sub.date)), M + 10, y + 4.2);
          doc.setTextColor(147,51,234); doc.setFont("helvetica", "bold"); doc.setFontSize(6);
          doc.text(svcLabel(sub.type), M + 22, y + 4.2);
          doc.setTextColor(71,85,105); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
          doc.text(fmtCur(sub.effectivePrice), W - M - 4, y + 4.2, { align: "right" });
          y += 6;

          // Articoli dettagliati
          sub.items.forEach((item: any, idx: number) => {
            checkPage(5.5);
            const ibg = idx % 2 === 0 ? [252,251,255] : [248,247,253];
            doc.setFillColor(ibg[0], ibg[1], ibg[2]);
            doc.rect(M + 3, y, CW - 3, 5.5, "F");
            doc.setDrawColor(245,243,255); doc.line(M + 3, y + 5.5, M + CW, y + 5.5);

            doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(107,114,128);
            doc.text(item.name || "Articolo", M + 62, y + 3.8);
            doc.setTextColor(71,85,105);
            doc.text(String(item.quantity || 1), M + 123, y + 3.8, { align: "center" });
            doc.setFontSize(5.5); doc.setTextColor(148,163,184);
            doc.text(fmtCur(item.unitPrice || 0), M + 140, y + 3.8, { align: "center" });
            doc.setTextColor(71,85,105); doc.setFont("helvetica", "bold"); doc.setFontSize(6);
            const itotal = item.totalPrice || (item.unitPrice || 0) * (item.quantity || 1);
            doc.text(fmtCur(itotal), W - M - 4, y + 3.8, { align: "right" });
            y += 5.5;
          });
          y += 1;
        } else {
          checkPage(7);
          doc.setFillColor(248,250,252); doc.rect(M, y, CW, 7, "F");
          doc.setFillColor(20,184,166); doc.rect(M, y, 1.2, 1.5, "F"); doc.rect(M, y + 2.5, 1.2, 1.5, "F");
          doc.setFontSize(6); doc.setTextColor(203,213,225); doc.setFont("helvetica", "normal"); doc.text("└─", M + 2.5, y + 4.8);
          doc.setTextColor(148,163,184); doc.text(fmtDateShort(new Date(sub.date)), M + 10, y + 4.8);
          doc.setTextColor(147,51,234); doc.setFont("helvetica", "bold"); doc.setFontSize(6);
          doc.text(svcLabel(sub.type), M + 22, y + 4.8);
          doc.setFont("helvetica", "normal"); doc.setTextColor(107,114,128); doc.setFontSize(5.5);
          doc.text((sub.description || "").substring(0, 50), M + 62, y + 4.8);
          doc.setTextColor(71,85,105); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
          doc.text(fmtCur(sub.effectivePrice), W - M - 4, y + 4.8, { align: "right" });
          y += 7;
        }
      });

      // Biancheria standalone con items
      if (!isP && main.items && main.items.length > 0 && linked.length === 0) {
        main.items.forEach((item: any, idx: number) => {
          checkPage(5.5);
          const ibg = idx % 2 === 0 ? [252,251,255] : [248,247,253];
          doc.setFillColor(ibg[0], ibg[1], ibg[2]); doc.rect(M + 3, y, CW - 3, 5.5, "F");
          doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(107,114,128);
          doc.text(item.name || "Articolo", M + 62, y + 3.8);
          doc.setTextColor(71,85,105); doc.text(String(item.quantity || 1), M + 123, y + 3.8, { align: "center" });
          doc.setFontSize(5.5); doc.setTextColor(148,163,184); doc.text(fmtCur(item.unitPrice || 0), M + 140, y + 3.8, { align: "center" });
          doc.setTextColor(71,85,105); doc.setFont("helvetica", "bold"); doc.setFontSize(6);
          doc.text(fmtCur((item.unitPrice || 0) * (item.quantity || 1)), W - M - 4, y + 3.8, { align: "right" });
          y += 5.5;
        });
      }
      rowIdx++;
    });

    // Subtotale
    doc.setFillColor(241,245,249); doc.rect(M, y, CW, 7, "F");
    doc.setDrawColor(226,232,240); doc.line(M, y, M + CW, y);
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(71,85,105);
    doc.text("Subtotale " + prop.propName.substring(0, 30), M + 4, y + 5);
    doc.setTextColor(15,23,42); doc.text(fmtCur(prop.propTotal), W - M - 4, y + 5, { align: "right" });
    y += 12;
  });

  // TOTALE FINALE
  checkPage(22);
  doc.setFillColor(15,23,42); doc.roundedRect(M, y, CW, 11, 2, 2, "F");
  doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("TOTALE MESE", M + 6, y + 7.5);
  doc.setFontSize(11); doc.text(fmtCur(summary.totaleServizi), W - M - 6, y + 7.5, { align: "right" });
  y += 13;
  doc.setFontSize(6); doc.setFont("helvetica", "italic"); doc.setTextColor(148,163,184);
  doc.text("* Importi IVA esclusa", M, y);
  y += 5;

  // PAGAMENTI REGISTRATI
  if (stats.payments && stats.payments.length > 0) {
    checkPage(16 + stats.payments.length * 8);
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(15,23,42);
    doc.text("Pagamenti Registrati", M, y + 4); y += 9;
    doc.setFillColor(209,250,229); doc.roundedRect(M, y, CW, 7, 1.5, 1.5, "F");
    doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(4,120,87);
    doc.text("DATA", M + 4, y + 5); doc.text("METODO", M + 35, y + 5);
    doc.text("NOTE", M + 70, y + 5); doc.text("IMPORTO", W - M - 4, y + 5, { align: "right" }); y += 7;

    stats.payments.forEach((p: any, i: number) => {
      checkPage(8);
      doc.setFillColor(i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 251);
      doc.rect(M, y, CW, 7, "F"); doc.setDrawColor(226,232,240); doc.line(M, y + 7, M + CW, y + 7);
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(71,85,105);
      doc.text(fmtDate(new Date(p.date)), M + 4, y + 5); doc.text(p.method || "—", M + 35, y + 5);
      doc.setFontSize(6); doc.text((p.notes || "").substring(0, 40), M + 70, y + 5);
      doc.setTextColor(4,120,87); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(fmtCur(p.amount), W - M - 4, y + 5, { align: "right" }); y += 7;
    });

    doc.setFillColor(209,250,229); doc.rect(M, y, CW, 8, "F");
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(4,120,87);
    doc.text("TOTALE PAGATO", M + 4, y + 5.5);
    doc.text(fmtCur(summary.totalePagato), W - M - 4, y + 5.5, { align: "right" }); y += 12;

    if (summary.totaleDovuto > 0) {
      doc.setFillColor(254,226,226); doc.roundedRect(M, y, CW, 8, 1.5, 1.5, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(185,28,28);
      doc.text("SALDO DA PAGARE", M + 4, y + 5.5);
      doc.text(fmtCur(summary.totaleDovuto), W - M - 4, y + 5.5, { align: "right" });
    }
  }

  // FOOTER
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setDrawColor(226,232,240); doc.line(M, 284, W - M, 284);
    doc.setFontSize(6); doc.setTextColor(148,163,184); doc.setFont("helvetica", "normal");
    doc.text("puliziacasevacanze.it — Documento generato automaticamente — Importi IVA esclusa", M, 289);
    doc.text(`Pagina ${p} di ${pages}`, W - M, 289, { align: "right" });
  }

  doc.save(`Riepilogo_${MONTHS_SHORT[selectedMonth - 1]}_${selectedYear}.pdf`);
}


// ══════════════════════════════════════════════════
//  EXCEL — stile professionale con Sheet Biancheria
// ══════════════════════════════════════════════════
export async function generateXLSX(stats: any, summary: any, selectedMonth: number, selectedYear: number) {
  const XLSX = await import("xlsx");
  if (!XLSX.utils) throw new Error("XLSX non trovato");
  const wb = XLSX.utils.book_new();
  const grouped = groupByProperty(stats.services);

  // ─── SHEET 1: TOTALE ───
  const r: any[][] = [
    [],
    ["", "RIEPILOGO PAGAMENTI"],
    ["", `${MONTHS_FULL[selectedMonth - 1]} ${selectedYear} — ${stats.proprietarioName || "Proprietario"}`],
    ["", `Generato il ${fmtDate(new Date())} — puliziacasevacanze.it`],
    ["", "* Tutti gli importi sono IVA esclusa"],
    [],
    ["", "", "", "", "", "Biancheria", "Pulizie", "Totale"],
    ["", "", "", "", "", summary.totaleServizi - (stats.cleaningsTotal || 0), stats.cleaningsTotal || 0, summary.totaleServizi],
    [],
    ["", "", "", "", "", "VOCE", "", "IMPORTO"],
    ["", "", "", "", "", "Totale Servizi", "", summary.totaleServizi],
    ["", "", "", "", "", "Totale Pagato", "", summary.totalePagato],
    ["", "", "", "", "", "Da Pagare", "", summary.totaleDovuto],
    [],
    ["", "", "", "", "", "Contanti", "", summary.totaleContanti],
    ["", "", "", "", "", "Bonifico", "", summary.totaleBonifico],
    [],
    ["", "", "", "", "", "PROPRIETÀ", "SERVIZI", "TOTALE (€)"],
  ];
  stats.statsByProperty.forEach((p: any) => {
    r.push(["", "", "", "", "", p.propertyName, p.servicesCount, p.total]);
  });
  r.push([]); r.push(["", "", "", "", "", "", "TOTALE:", summary.totaleServizi]);

  const ws1 = XLSX.utils.aoa_to_sheet(r);
  ws1["!cols"] = [{ wch: 2 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 28 }, { wch: 16 }, { wch: 16 }];
  ws1["!merges"] = [{ s:{r:1,c:1}, e:{r:1,c:7} }, { s:{r:2,c:1}, e:{r:2,c:7} }, { s:{r:3,c:1}, e:{r:3,c:7} }];
  XLSX.utils.book_append_sheet(wb, ws1, "Totale");

  // ─── SHEET 2: BIANCHERIA (articolo per articolo) ───
  const b: any[][] = [
    ["Biancheria"],
    ["Prodotti", "Pezzi", "Prezzo Unit.", "Cliente", "Data", "Prezzo totale"],
  ];
  grouped.forEach((prop) => {
    prop.groups.forEach((group) => {
      const allOrders = group.filter((s: any) => s.type !== "PULIZIA");
      allOrders.forEach((order: any) => {
        if (order.items && order.items.length > 0) {
          order.items.forEach((item: any) => {
            b.push([item.name || "Articolo", item.quantity || 1, item.unitPrice || 0, prop.propName, fmtDate(new Date(order.date)), item.totalPrice || (item.unitPrice || 0) * (item.quantity || 1)]);
          });
        } else {
          b.push([order.description || svcLabel(order.type), 1, order.effectivePrice, prop.propName, fmtDate(new Date(order.date)), order.effectivePrice]);
        }
      });
    });
  });
  const ws2 = XLSX.utils.aoa_to_sheet(b);
  ws2["!cols"] = [{ wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Biancheria");

  // ─── SHEET 3: DETTAGLIO PROPRIETÀ ───
  const d: any[][] = [[], ["", "DETTAGLIO SERVIZI PER PROPRIETÀ"], ["", `${MONTHS_FULL[selectedMonth - 1]} ${selectedYear} — ${stats.proprietarioName || "Proprietario"}`], ["", "* Tutti gli importi sono IVA esclusa"], []];
  grouped.forEach((prop) => {
    d.push([]); d.push(["", `▪ ${prop.propName}`, "", "", "", "", fmtCur(prop.propTotal)]);
    d.push(["", "Data", "Tipo", "Articolo", "Qtà", "€/Un.", "Importo (€)"]);
    prop.groups.forEach((group) => {
      const main = group[0];
      d.push(["", fmtDate(new Date(main.date)), svcLabel(main.type), main.description || "", "", "", main.effectivePrice]);
      group.slice(1).forEach((sub: any) => {
        if (sub.items && sub.items.length > 0) {
          d.push(["", `  └ ${fmtDate(new Date(sub.date))}`, svcLabel(sub.type), "", "", "", sub.effectivePrice]);
          sub.items.forEach((item: any) => { d.push(["", "", "", item.name || "Articolo", item.quantity || 1, item.unitPrice || 0, item.totalPrice || 0]); });
        } else {
          d.push(["", `  └ ${fmtDate(new Date(sub.date))}`, svcLabel(sub.type), sub.description || "", "", "", sub.effectivePrice]);
        }
      });
      if (main.type !== "PULIZIA" && main.items && main.items.length > 0) {
        main.items.forEach((item: any) => { d.push(["", "", "", item.name, item.quantity || 1, item.unitPrice || 0, item.totalPrice || 0]); });
      }
    });
    d.push(["", "", "", "", "", "Subtotale:", prop.propTotal]);
  });
  d.push([]); d.push(["", "", "", "", "", "TOTALE MESE:", summary.totaleServizi]);
  const ws3 = XLSX.utils.aoa_to_sheet(d);
  ws3["!cols"] = [{ wch: 2 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 15 }];
  ws3["!merges"] = [{ s:{r:1,c:1}, e:{r:1,c:6} }, { s:{r:2,c:1}, e:{r:2,c:6} }];
  XLSX.utils.book_append_sheet(wb, ws3, "Dettaglio Proprietà");

  // ─── SHEET 4: PAGAMENTI ───
  if (stats.payments && stats.payments.length > 0) {
    const p: any[][] = [[], ["", "PAGAMENTI REGISTRATI"], ["", `${MONTHS_FULL[selectedMonth - 1]} ${selectedYear}`], [], ["", "Data", "Metodo", "Tipo", "Note", "Importo (€)"]];
    stats.payments.forEach((pay: any) => { p.push(["", fmtDate(new Date(pay.date)), pay.method || "—", pay.type || "—", pay.notes || "", pay.amount]); });
    p.push([]); p.push(["", "", "", "", "TOTALE PAGATO:", summary.totalePagato]);
    const ws4 = XLSX.utils.aoa_to_sheet(p);
    ws4["!cols"] = [{ wch: 2 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 15 }];
    ws4["!merges"] = [{ s:{r:1,c:1}, e:{r:1,c:5} }, { s:{r:2,c:1}, e:{r:2,c:5} }];
    XLSX.utils.book_append_sheet(wb, ws4, "Pagamenti");
  }

  const xlsxData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([xlsxData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Riepilogo_${MONTHS_SHORT[selectedMonth - 1]}_${selectedYear}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
