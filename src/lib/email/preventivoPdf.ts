/**
 * preventivoPdf.ts — PDF stampabile del preventivo (allegato email)
 * v1 — 07/07/2026
 * Stesso pattern di monthlyReportPdf: import dinamico di jspdf lato server.
 * Design coerente con brand e widget: testata blu, pannello prezzo, righe
 * di dettaglio, blocco "sempre compreso", termini e condizioni, footer.
 */

import type { DatiEmailPreventivo } from './emailPreventivo';

// palette (RGB)
const BLU_SCURO: [number, number, number] = [42, 66, 87];
const BLU: [number, number, number] = [61, 90, 115];
const RAME: [number, number, number] = [176, 118, 74];
const RAME_CHIARO: [number, number, number] = [243, 228, 212];
const CHIARO: [number, number, number] = [237, 241, 244];
const OK: [number, number, number] = [62, 124, 91];
const OK_CHIARO: [number, number, number] = [232, 242, 236];
const INCHIOSTRO: [number, number, number] = [34, 51, 63];
const GRIGIO: [number, number, number] = [122, 138, 150];

const eur = (v: number) => '\u20ac ' + v.toFixed(2).replace('.', ',');

export interface DatiPdfPreventivo extends DatiEmailPreventivo {
  numeroPreventivo: string; // es. "283/2026"
  dataIt: string;           // es. "07/07/2026"
}

export async function buildPreventivoPdf(d: DatiPdfPreventivo): Promise<Buffer> {
  const jspdfModule: any = await import('jspdf');
  const JsPDF = jspdfModule.jsPDF ?? jspdfModule.default;
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const MX = 18; // margine
  const CW = W - MX * 2;

  const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const txt = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const bold = () => doc.setFont('helvetica', 'bold');
  const norm = () => doc.setFont('helvetica', 'normal');

  function footerPagina() {
    fill(BLU_SCURO); doc.rect(0, 287, W, 10, 'F');
    txt([255, 255, 255]); norm(); doc.setFontSize(8.5);
    doc.text('WWW.PULIZIACASEVACANZE.IT', W / 2, 293.5, { align: 'center' });
  }

  // ═══════════ PAGINA 1 — testata brand ═══════════
  fill(BLU_SCURO); doc.rect(0, 0, W, 58, 'F');
  fill(BLU); doc.rect(0, 52, W, 6, 'F');
  txt([255, 255, 255]); bold(); doc.setFontSize(15);
  doc.text('PULIZIACASEVACANZE.IT', MX, 17);
  norm(); doc.setFontSize(8.5); doc.setTextColor(232, 201, 168);
  doc.text('PULIZIE E NOLEGGIO BIANCHERIA PER STRUTTURE RICETTIVE \u2014 ROMA, 365 GIORNI L\u2019ANNO', MX, 23.5);
  txt([255, 255, 255]); bold(); doc.setFontSize(24);
  doc.text('PREVENTIVO', MX, 40);
  doc.setFontSize(24); doc.setTextColor(232, 201, 168);
  doc.text('PULIZIE E BIANCHERIA', MX, 49);

  // striscia info: numero, data, cliente, zona
  let y = 68;
  txt(GRIGIO); norm(); doc.setFontSize(8.5);
  doc.text('PREVENTIVO N\u00b0', MX, y); doc.text('DATA', W - MX - 40, y);
  txt(INCHIOSTRO); bold(); doc.setFontSize(12);
  doc.text(d.numeroPreventivo, MX, y + 5.5); doc.text(d.dataIt, W - MX - 40, y + 5.5);
  y += 13;
  txt(GRIGIO); norm(); doc.setFontSize(8.5);
  doc.text('CLIENTE', MX, y); if (d.zona) doc.text('ZONA STRUTTURA', W - MX - 40, y);
  txt(INCHIOSTRO); bold(); doc.setFontSize(12);
  doc.text(d.nome, MX, y + 5.5); if (d.zona) doc.text(d.zona.slice(0, 28), W - MX - 40, y + 5.5);
  y += 12;
  doc.setDrawColor(227, 233, 238); doc.setLineWidth(0.4);
  doc.line(MX, y, W - MX, y);
  y += 8;

  const q = d.quote;
  const suMisura = q.suMisura || d.tipo === 'hotel';

  // ═══════════ pannello prezzo ═══════════
  const hHero = suMisura ? 34 : 52;
  fill(BLU_SCURO); doc.roundedRect(MX, y, CW, hHero, 4, 4, 'F');
  if (suMisura) {
    txt([255, 255, 255]); bold(); doc.setFontSize(14);
    doc.text('PREVENTIVO SU MISURA', W / 2, y + 14, { align: 'center' });
    norm(); doc.setFontSize(9.5);
    doc.text('Un nostro referente ti contatta entro 24 ore per costruire l\u2019offerta insieme a te.', W / 2, y + 23, { align: 'center' });
  } else {
    txt([255, 255, 255]); bold(); doc.setFontSize(8);
    doc.text((d.tipo === 'bnb' ? 'PULIZIA CAMERE A CHECKOUT' : 'PULIZIA A OGNI CAMBIO OSPITE'), W / 2, y + 9, { align: 'center', charSpace: 1 });
    norm(); doc.setFontSize(9.5);
    doc.text('a partire da', W / 2, y + 17, { align: 'center' });
    bold(); doc.setFontSize(30);
    doc.text(eur(q.min).replace(',00', ''), W / 2, y + 29, { align: 'center' });
    fill(RAME); doc.roundedRect(W / 2 - 7, y + 32.5, 14, 1.4, 0.7, 0.7, 'F');
    norm(); doc.setFontSize(9);
    doc.text('stima massima ' + eur(q.max).replace(',00', '') + '  \u00b7  confermato al sopralluogo gratuito', W / 2, y + 40, { align: 'center' });
    if (q.scontoPercento) {
      doc.setTextColor(232, 201, 168); doc.setFontSize(8.5);
      doc.text('sconto multi-unit\u00e0 -' + q.scontoPercento + '% gi\u00e0 applicato', W / 2, y + 46.5, { align: 'center' });
    }
  }
  y += hHero + 8;

  // ═══════════ righe di dettaglio ═══════════
  function assicuraSpazio(h: number) {
    if (y + h > 280) { footerPagina(); doc.addPage(); fill(BLU_SCURO); doc.rect(0, 0, W, 14, 'F'); txt([255, 255, 255]); bold(); doc.setFontSize(9); doc.text('PULIZIACASEVACANZE.IT \u2014 PREVENTIVO N\u00b0 ' + d.numeroPreventivo, MX, 9); y = 24; }
  }
  function rigaDettaglio(titolo: string, sotto: string, prezzo: string) {
    assicuraSpazio(16);
    fill([244, 246, 248]); doc.roundedRect(MX, y, CW, 13, 3, 3, 'F');
    fill(RAME_CHIARO); doc.roundedRect(MX + 4, y + 3.2, 6.5, 6.5, 1.8, 1.8, 'F');
    txt(INCHIOSTRO); bold(); doc.setFontSize(10);
    doc.text(titolo, MX + 14, y + 5.6);
    txt(GRIGIO); norm(); doc.setFontSize(7.8);
    doc.text(sotto, MX + 14, y + 10);
    txt(BLU_SCURO); bold(); doc.setFontSize(11);
    doc.text(prezzo, W - MX - 4, y + 8.2, { align: 'right' });
    y += 16;
  }

  if (!suMisura) {
    if (q.camereDettaglio && q.camereDettaglio.length > 0) {
      q.camereDettaglio.forEach((c, i) =>
        rigaDettaglio(`Camera ${i + 1} \u2014 ${c.etichetta}`, `${c.persone} ${c.persone === 1 ? 'persona' : 'persone'} \u00b7 pulizia a checkout`, '\u20ac ' + c.prezzo));
    } else if (q.unitaDettaglio && q.unitaDettaglio.length > 1) {
      q.unitaDettaglio.forEach((u) => rigaDettaglio(u.nome, 'pulizia a ogni cambio ospite', 'da \u20ac ' + u.min));
    } else {
      rigaDettaglio('Pulizia completa', 'a ogni cambio ospite', 'da \u20ac ' + q.min);
    }
    if (q.biancheria > 0) rigaDettaglio('Biancheria a noleggio', 'a cambio \u00b7 consegna e ritiro inclusi', '+ ' + eur(q.biancheria));
    if (q.kit > 0) rigaDettaglio('Kit di cortesia ospiti', 'doccia-shampoo, sapone e crema corpo per ospite', '+ ' + eur(q.kit));
    if (q.rifacimentoGiornaliero) rigaDettaglio('Rifacimento letti giornaliero', 'a uscita, durante il soggiorno degli ospiti', eur(q.rifacimentoGiornaliero));
    if (q.areaComuneImporto) rigaDettaglio('Pulizia aree comuni', q.areaComuneTipo === 'dedicata' ? 'a uscita dedicata, tutti i giorni' : 'quando siamo gi\u00e0 in struttura', eur(q.areaComuneImporto));
    if (q.passaggio) rigaDettaglio('Servizio durante il soggiorno', 'a passaggio: rifacimento letti, biancheria e kit', eur(q.passaggio.totale));
  }

  // ═══════════ sempre compreso ═══════════
  const inclusi = d.tipo === 'bnb'
    ? ['Pulizia completa delle camere a ogni checkout', 'Prodotti per la pulizia inclusi', 'Coordinamento con i tuoi check-in, 365 giorni l\u2019anno', 'Referente dedicato sempre raggiungibile']
    : ['Pulizia di stanze, bagni e cucina', 'Prodotti per la pulizia inclusi', '2 rotoli di carta igienica per bagno e un cioccolatino per ospite', 'Controllo di luci, acqua calda e clima a ogni intervento', 'Coordinamento con i tuoi check-in, 365 giorni l\u2019anno'];
  const hBox = 12 + inclusi.length * 6;
  assicuraSpazio(hBox + 6);
  fill(OK_CHIARO); doc.roundedRect(MX, y, CW, hBox, 3, 3, 'F');
  txt(OK); bold(); doc.setFontSize(8);
  doc.text('SEMPRE COMPRESO NEL SERVIZIO', MX + 6, y + 7, { charSpace: 0.8 });
  txt(INCHIOSTRO); norm(); doc.setFontSize(9);
  inclusi.forEach((r, i) => doc.text('\u2713  ' + r, MX + 6, y + 14 + i * 6));
  y += hBox + 8;

  // nota IVA
  assicuraSpazio(14);
  txt(GRIGIO); norm(); doc.setFontSize(8);
  const nota = doc.splitTextToSize('Prezzi indicativi al netto di IVA. Il preventivo definitivo viene confermato dopo un sopralluogo gratuito e senza impegno: prima dell\u2019inizio del servizio firmiamo insieme un contratto che definisce condizioni e costi.', CW);
  doc.text(nota, MX, y);
  footerPagina();

  // ═══════════ PAGINA — termini e condizioni + contatti ═══════════
  doc.addPage();
  fill(BLU_SCURO); doc.rect(0, 0, W, 24, 'F');
  txt([255, 255, 255]); bold(); doc.setFontSize(14);
  doc.text('TERMINI E CONDIZIONI', MX, 15.5);
  y = 36;
  const sezioni: [string, string][] = [
    ['PREZZI', 'Tutti i prezzi sono al netto di IVA. L\u2019IVA sar\u00e0 applicata su biancheria e servizi di pulizia per i clienti privi di partita IVA. Per i clienti con partita IVA, l\u2019IVA si applica solo sulla biancheria.'],
    ['TEMPISTICHE', 'Gli orari di lavoro sono concordati in anticipo con il cliente. Eventuali modifiche devono essere concordate preventivamente.'],
    ['METODO DI PAGAMENTO', 'Il pagamento dovr\u00e0 avvenire entro ogni 5\u00b0 del mese a vista fattura tramite bonifico bancario.'],
    ['MODALIT\u00c0 DI LAVORO', 'Prima dell\u2019inizio del servizio condurremo un sopralluogo gratuito, fornendo successivamente un contratto dettagliato che definisce le condizioni della collaborazione, inclusi costi e servizi.'],
  ];
  for (const [tit, corpo] of sezioni) {
    txt(RAME); bold(); doc.setFontSize(10);
    doc.text(tit, MX, y, { charSpace: 0.6 });
    y += 6;
    txt(INCHIOSTRO); norm(); doc.setFontSize(9.5);
    const righeTxt = doc.splitTextToSize(corpo, CW);
    doc.text(righeTxt, MX, y);
    y += righeTxt.length * 5 + 8;
  }

  // blocco contatti
  y = Math.max(y + 4, 190);
  fill(CHIARO); doc.roundedRect(MX, y, CW, 52, 4, 4, 'F');
  txt(BLU_SCURO); bold(); doc.setFontSize(11);
  doc.text('PULIZIACASEVACANZE.IT', MX + 8, y + 11);
  txt(GRIGIO); norm(); doc.setFontSize(8.5);
  doc.text('DITTA DI SERVIZI PER ATTIVIT\u00c0 RICETTIVE', MX + 8, y + 17);
  txt(INCHIOSTRO); norm(); doc.setFontSize(9.5);
  const contatti = [
    'P.IVA: 17480841000',
    'Telefono: +39 392 783 0017',
    'Email: info@puliziacasevacanze.it',
    'Sito web: www.puliziacasevacanze.it',
    'Indirizzo: Via della Cava Aurelia 84N, Roma',
  ];
  contatti.forEach((c, i) => doc.text(c, MX + 8, y + 25 + i * 5.5));
  footerPagina();

  return Buffer.from(doc.output('arraybuffer'));
}
