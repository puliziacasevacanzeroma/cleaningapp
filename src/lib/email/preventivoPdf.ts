/**
 * preventivoPdf.ts — PDF del preventivo (allegato email)
 * v2 — 07/07/2026
 *
 * Replica fedele del preventivo Canva ufficiale (Preventivo N°xx/2026):
 *  - Pag. 1  Copertina (foto + titolo + cliente + numero/data)
 *  - Pag. 2+ PULIZIA — una pagina per ogni unità (casa vacanze) oppure
 *            una pagina B&B/affittacamere con prezzo PER SINGOLA CAMERA (v3)
 *            (MAI il totale: né pulizie né biancheria)
 *  - Pag.    LISTINO BIANCHERIA (statica, listino da prendere in visione)
 *  - Pag.    LINEA OKIKO kit cortesia (statica)
 *  - Pag.    TERMINI E CONDIZIONI (statica)
 *  - Pag.    CONTATTI (statica)
 *
 * Gli asset (foto, icone, pagine statiche, font) stanno in /public/preventivo.
 * Pattern identico a monthlyReportPdf: import dinamico di jspdf lato server.
 */

import { promises as fs } from "fs";
import path from "path";

// ═══════════════════════════════════════════════════════════════
//  Input
// ═══════════════════════════════════════════════════════════════

export type Prezzo = number | string; // "€45" · "€45-60" · "SU MISURA"

export interface PreventivoCamera {
  /** Es. "Camera Doppia", "Camera Tripla", "Suite" */
  label: string;
  /** Prezzo pulizia per singola camera (per uscita) */
  prezzo: Prezzo;
  /** Quantità di camere di questo tipo (mostrata come "x2") */
  quantita?: number;
}

export interface PreventivoExtra {
  /** Es. "Pulizia fermata / intermedia", "Aree comuni" */
  label: string;
  prezzo: Prezzo;
  /** Es. "per uscita" */
  unit?: string;
}

export interface PreventivoUnita {
  /** Nome unità per multi-struttura (es. "Appartamento Trastevere"). Vuoto per singola. */
  nome?: string;
  mq?: number;
  bagni?: number;
  /** Posti letto / ospiti max */
  postiLetto?: number;
  /** Prezzo pulizia dell'unità (flusso casa vacanze / multi) */
  prezzo?: Prezzo;
  /** Flusso B&B / affittacamere / hotel: prezzo per singola camera */
  camere?: PreventivoCamera[];
  /** Voci aggiuntive (fermata, aree comuni...) — sempre prezzo unitario, mai sommato */
  extras?: PreventivoExtra[];
}

export interface PreventivoPdfData {
  /** Es. "57/2026" */
  numero: string;
  /** Es. "07/07/2026" */
  data: string;
  cliente: string;
  /** Zona / indirizzo struttura, es. "Roma - Trastevere" */
  indirizzo: string;
  flow: "vacation" | "multi" | "bnb" | "hotel";
  unita: PreventivoUnita[];
}

// ═══════════════════════════════════════════════════════════════
//  Costanti layout (misure in mm ricavate dal PDF di riferimento)
// ═══════════════════════════════════════════════════════════════

const W = 210;
const H = 297;

const BLUE: [number, number, number] = [70, 99, 121]; // #466379
const COPPER: [number, number, number] = [182, 124, 75]; // #B67C4B
const DARKGRAY: [number, number, number] = [60, 60, 60];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

// ═══════════════════════════════════════════════════════════════
//  Asset loading
// ═══════════════════════════════════════════════════════════════

const ASSET_DIR = path.join(process.cwd(), "public", "preventivo");

async function loadAsset(name: string): Promise<string> {
  const buf = await fs.readFile(path.join(ASSET_DIR, name));
  return buf.toString("base64");
}

interface Assets {
  coverTop: string;
  fadeBg: string;
  photos: string[]; // pulizia_photo_1..4 (rotazione per pagine multiple)
  iconHouse: string;
  iconBath: string;
  iconBed: string;
  listino: string;
  okiko: string;
  termini: string;
  contatti: string;
  fonts: Record<string, string>;
}

async function loadAssets(): Promise<Assets> {
  const [
    coverTop, fadeBg, p1, p2, p3, p4,
    iconHouse, iconBath, iconBed,
    listino, okiko, termini, contatti,
    fLeague, fReg, fMed, fBold, fBoldIt,
  ] = await Promise.all([
    loadAsset("cover_top.jpg"),
    loadAsset("fade_bg.jpg"),
    loadAsset("pulizia_photo_1.jpg"),
    loadAsset("pulizia_photo_2.jpg"),
    loadAsset("pulizia_photo_3.jpg"),
    loadAsset("pulizia_photo_4.jpg"),
    loadAsset("icon_house.png"),
    loadAsset("icon_bath.png"),
    loadAsset("icon_bed.png"),
    loadAsset("listino.jpg"),
    loadAsset("okiko.jpg"),
    loadAsset("termini.jpg"),
    loadAsset("contatti.jpg"),
    loadAsset("fonts/LeagueSpartan-Bold.ttf"),
    loadAsset("fonts/Montserrat-Regular.ttf"),
    loadAsset("fonts/Montserrat-Medium.ttf"),
    loadAsset("fonts/Montserrat-Bold.ttf"),
    loadAsset("fonts/Montserrat-BoldItalic.ttf"),
  ]);
  return {
    coverTop, fadeBg,
    photos: [p1, p2, p3, p4],
    iconHouse, iconBath, iconBed,
    listino, okiko, termini, contatti,
    fonts: {
      "LeagueSpartan-Bold": fLeague,
      "Montserrat-Regular": fReg,
      "Montserrat-Medium": fMed,
      "Montserrat-Bold": fBold,
      "Montserrat-BoldItalic": fBoldIt,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Helper: testo con letter-spacing (stile Canva)
// ═══════════════════════════════════════════════════════════════

type Doc = any;

function fmtPrezzo(v: Prezzo | undefined): string {
  if (v === undefined || v === null) return "";
  return typeof v === "number" ? `\u20AC${v}` : v;
}

function setFill(doc: Doc, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: Doc, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }

/** Larghezza di un testo con charSpace incluso (jsPDF non lo conta da solo). */
function spacedWidth(doc: Doc, text: string, charSpace: number): number {
  return doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
}

interface SpacedOpts {
  align?: "left" | "center" | "right";
  charSpace?: number;
}

/** Disegna testo con tracking; x è il punto di ancoraggio secondo align. */
function spacedText(doc: Doc, text: string, x: number, y: number, opts: SpacedOpts = {}) {
  const cs = opts.charSpace ?? 0;
  const w = spacedWidth(doc, text, cs);
  let x0 = x;
  if (opts.align === "center") x0 = x - w / 2;
  if (opts.align === "right") x0 = x - w;
  doc.text(text, x0, y, { charSpace: cs });
}

/** Word-wrap manuale che tiene conto del charSpace. */
function wrapSpaced(doc: Doc, text: string, maxW: number, charSpace: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const cand = cur ? cur + " " + wd : wd;
    if (spacedWidth(doc, cand, charSpace) <= maxW || !cur) cur = cand;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ═══════════════════════════════════════════════════════════════
//  Pagine
// ═══════════════════════════════════════════════════════════════

function pageCover(doc: Doc, a: Assets, d: PreventivoPdfData) {
  // Foto + banda blu superiore (asset unico, 0 → 177.3mm, tutta larghezza)
  doc.addImage(a.coverTop, "JPEG", 0, 0, W, 177.3);

  // Titolo
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(49.5);
  spacedText(doc, "PREVENTIVO PULIZIE E", 106.6, 199.4, { align: "center", charSpace: -0.72 });
  spacedText(doc, "NOLEGGIO BIANCHERIA", 106.6, 218.9, { align: "center", charSpace: -0.72 });

  // Cliente / indirizzo
  setText(doc, DARKGRAY);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(16);
  spacedText(doc, `NOME CLIENTE: ${d.cliente.toUpperCase()}`, 106.5, 234.4, { align: "center", charSpace: 1.15 });
  spacedText(doc, `INDIRIZZO STRUTTURA: ${d.indirizzo.toUpperCase()}`, 106.5, 245.2, { align: "center", charSpace: 1.15 });

  // Numero preventivo (sx) e data (dx)
  doc.setFontSize(10.9);
  spacedText(doc, `PREVENTIVO N\u00B0${d.numero}`, 7.2, 261.9, { align: "left", charSpace: 1.5 });
  spacedText(doc, d.data, 204.9, 261.9, { align: "right", charSpace: 1.5 });

  // Banda footer
  setFill(doc, BLUE);
  doc.rect(0, 266.9, W, H - 266.9, "F");
  setText(doc, WHITE);
  doc.setFontSize(10);
  spacedText(doc, "WWW.PULIZIACASEVACANZE.IT", W / 2, 280.7, { align: "center", charSpace: 1.6 });
}

// ── Pagina PULIZIA (casa vacanze: prezzo unità · B&B: prezzo per camera) ──

interface PuliziaPageOpts {
  photoB64: string;
  titolo: string;        // "PULIZIA" oppure nome unità
  sottotitolo?: string;  // eventuale riga sotto il titolo (nome unità nel multi)
  bagni: number;
  mq?: number;
  postiLetto?: number;
  prezzo?: Prezzo;                 // flusso casa vacanze
  camere?: PreventivoCamera[];     // flusso B&B: prezzo per singola camera
  extras?: PreventivoExtra[];
}

function pagePulizia(doc: Doc, a: Assets, o: PuliziaPageOpts) {
  // Cerchio fotografico sbiadito in alto a destra (come nell'originale)
  const g = new (doc as any).GState({ opacity: 0.10 });
  doc.saveGraphicsState();
  doc.setGState(g);
  // clip circolare: centro (145,46) r 64
  doc.circle(145, 46, 64, null);
  doc.clip();
  doc.discardPath();
  // immagine "cover" dentro il cerchio
  const ch = 128, cw = 128 * (1089 / 727);
  doc.addImage(a.fadeBg, "JPEG", 145 - cw / 2, 46 - 64, cw, ch);
  doc.restoreGraphicsState();

  // Foto verticale a sinistra
  doc.addImage(o.photoB64, "JPEG", 8.4, 24.5, 64.8, 237.9);

  const CX = 136.7; // centro colonna destra

  // Titolo
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(42);
  spacedText(doc, o.titolo, CX, 28.7, { align: "center", charSpace: 0.66 });

  // Sottotitolo statico
  setText(doc, BLACK);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(10);
  if (o.sottotitolo) {
    setText(doc, COPPER);
    doc.setFontSize(10.5);
    spacedText(doc, o.sottotitolo.toUpperCase(), CX, 37.8, { align: "center", charSpace: 1.1 });
    setText(doc, BLACK);
  }
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(13.3);
  spacedText(doc, "IL PREVENTIVO INCLUDE LE", 136.2, 55.1, { align: "center", charSpace: 0.05 });
  spacedText(doc, "SEGUENTI VOCI:", 136.2, 63.45, { align: "center", charSpace: 0.05 });

  // Bullet list
  const bullets: Array<{ t: string; it?: string }> = [
    { t: "PULIZIA GENERALE DELLE CAMERE E DELLE AREE COMUNI" },
    { t: `PULIZIA DI ${o.bagni} BAGN${o.bagni === 1 ? "O" : "I"}` },
    { t: "PULIZIA DELLE FINESTRE" },
    { t: "RIMOZIONE DELLA POLVERE E DELLE RAGNATELE" },
    { t: "SMALTIMENTO DEI RIFIUTI" },
    { t: "SOSTITUZIONE BIANCHERIA E RIEMPIMENTO DEI DISPENSER DEI SAPONI O KIT DI CORTESIA ", it: "(KIT A PAGAMENTO SU RICHIESTA)" },
    { t: "CONTROLLO GENERALE FUNZIONAMENTO DELLA CASA (LUCI, ACQUA CALDA RISCALDAMENTO, ARIA CONDIZIONATA)" },
  ];

  doc.setFontSize(10.3);
  const bx = 80.9;      // margine sinistro del testo bullet
  const bMaxW = 104;    // larghezza colonna
  const cs = 0.9;       // tracking
  const lh = 6.35;      // interlinea
  let y = 70.18;
  for (const b of bullets) {
    doc.setFont("Montserrat", "bold");
    // wrap sul testo completo, poi ridisegno con lo stile giusto per la parte italica
    const plainLines = wrapSpaced(doc, "- " + b.t, bMaxW, cs);
    for (let i = 0; i < plainLines.length; i++) {
      const ln = plainLines[i];
      const indent = i === 0 ? 0 : 2.2;
      doc.text(ln, bx + indent, y, { charSpace: cs });
      y += lh;
    }
    if (b.it) {
      doc.setFont("Montserrat", "bolditalic");
      const itLines = wrapSpaced(doc, b.it, bMaxW, cs);
      for (const ln of itLines) {
        doc.text(ln, bx + 2.2, y, { charSpace: cs });
        y += lh;
      }
    }
    y += 6.25; // spazio tra voci
  }

  if (!o.camere || o.camere.length === 0) {
    // ── Flusso casa vacanze: pill dati + box prezzo unico ──
    drawInfoPills(doc, a, o);
    drawPriceBox(doc, o.prezzo ?? 0, o.extras);
  } else {
    // ── Flusso B&B / affittacamere: prezzo per singola camera, MAI totale ──
    drawRoomPriceBox(doc, o);
  }

  // Nota fondo pagina
  setText(doc, BLACK);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9.5);
  const nLines = [
    "SONO INCLUSI NEL PREZZO: I PRODOTTI PER LA PULIZIA,",
    "2 ROTOLI DI CARTA IGENICA PER BAGNO E 1 CIOCCOLATINO",
    "PER OSPITE",
  ];
  let ny = 278.3;
  for (const ln of nLines) {
    spacedText(doc, ln, W / 2, ny, { align: "center", charSpace: 1.25 });
    ny += 5.95;
  }
}

function drawInfoPills(doc: Doc, a: Assets, o: PuliziaPageOpts) {
  const pills: Array<{ icon: string; label: string }> = [];
  if (o.mq) pills.push({ icon: a.iconHouse, label: `${o.mq}Mq` });
  pills.push({ icon: a.iconBath, label: String(o.bagni) });
  if (o.postiLetto) pills.push({ icon: a.iconBed, label: String(o.postiLetto) });

  const px = 82.5, pw = 48.6, ph = 17.6, gap = 4.9;
  let py = 203.7;
  for (const p of pills) {
    setFill(doc, BLUE);
    doc.roundedRect(px, py, pw, ph, 6.5, 6.5, "F");
    doc.addImage(p.icon, "PNG", px + 2.6, py + 1.7, 19.5, 14.2);
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(30);
    doc.text(p.label, px + 22.5, py + ph / 2 + 3.7);
    py += ph + gap;
  }
}

function drawPriceBox(doc: Doc, prezzo: Prezzo, extras?: PreventivoExtra[]) {
  const bx = 137.1, by = 203.7, bw = 62.8, bh = 62.9;
  setFill(doc, BLUE);
  doc.roundedRect(bx, by, bw, bh, 10, 10, "F");

  // Pill "PREZZO" rame sull'angolo alto-sinistro
  setFill(doc, COPPER);
  doc.roundedRect(135, 199.4, 23.8, 12.6, 6.3, 6.3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9);
  spacedText(doc, "PREZZO", 135 + 11.9, 207.2, { align: "center", charSpace: 0.9 });

  // €XX — auto-shrink sulla larghezza reale (supporta range "€45-60" e "SU MISURA")
  doc.setFont("LeagueSpartan", "bold");
  const priceStr = fmtPrezzo(prezzo) || "\u2014";
  let fs = 92;
  doc.setFontSize(fs);
  while (fs > 22 && doc.getTextWidth(priceStr) > bw - 7) {
    fs -= 2;
    doc.setFontSize(fs);
  }
  const priceBaseline = 243.8 - (92 - fs) * 0.12; // ricentra leggermente se rimpicciolito
  spacedText(doc, priceStr, 169.4, priceBaseline, { align: "center", charSpace: 0 });

  // Nota
  doc.setFont("Montserrat", "medium");
  doc.setFontSize(9.3);
  const lines = ["QUESTO PREZZO NON", "INCLUDE IL NOLEGGIO", "BIANCHERIA."];
  let y = 249.4;
  for (const ln of lines) {
    spacedText(doc, ln, 169.4, y, { align: "center", charSpace: 1.25 });
    y += 4.5;
  }

  // Eventuali extra sotto il box (fermata / aree comuni), prezzo unitario
  if (extras && extras.length) {
    setText(doc, BLACK);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(8);
    let ey = by + bh + 5.5;
    for (const ex of extras) {
      spacedText(doc, `${ex.label.toUpperCase()}: ${fmtPrezzo(ex.prezzo)}${ex.unit ? " " + ex.unit.toUpperCase() : ""}`, bx + bw / 2, ey, { align: "center", charSpace: 0.4 });
      ey += 4.6;
    }
  }
}

/** B&B / affittacamere: box blu con listino prezzi PER SINGOLA CAMERA. Nessun totale. */
function drawRoomPriceBox(doc: Doc, o: PuliziaPageOpts) {
  const rows: Array<[string, string]> = [];
  for (const c of o.camere ?? []) {
    const q = c.quantita && c.quantita > 1 ? ` x${c.quantita}` : "";
    rows.push([c.label.toUpperCase() + q, fmtPrezzo(c.prezzo)]);
  }
  for (const ex of o.extras ?? []) {
    rows.push([ex.label.toUpperCase(), fmtPrezzo(ex.prezzo)]);
  }

  const bx = 82.5, bw = 117.4;
  const maxTop = 202;                 // non invadere l'elenco puntato
  const noteH = 13;
  let rowH = 8.2;
  const headH = 10;
  let bh = headH + rows.length * rowH + noteH;
  if (266.5 - bh < maxTop) {          // comprimi le righe se necessario
    rowH = Math.max(6.2, (266.5 - maxTop - headH - noteH) / rows.length);
    bh = headH + rows.length * rowH + noteH;
  }
  const by = 266.5 - bh;

  setFill(doc, BLUE);
  doc.roundedRect(bx, by, bw, bh, 10, 10, "F");

  // Pill "PREZZO PER CAMERA" rame
  setFill(doc, COPPER);
  const pillW = 52;
  doc.roundedRect(bx - 2.1, by - 4.3, pillW, 12.6, 6.3, 6.3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(8.4);
  spacedText(doc, "PREZZO PER CAMERA", bx - 2.1 + pillW / 2, by + 3.5, { align: "center", charSpace: 0.7 });

  // Righe: etichetta a sinistra, prezzo a destra
  let y = by + headH + 5.2;
  for (const [label, price] of rows) {
    setText(doc, WHITE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(9.2);
    doc.text(label, bx + 8, y, { charSpace: 0.4 });
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(14);
    spacedText(doc, price, bx + bw - 8, y + 0.4, { align: "right" });
    y += rowH;
  }

  // Nota sotto le righe (2 righe centrate)
  doc.setFont("Montserrat", "medium");
  doc.setFontSize(7.4);
  spacedText(doc, "PREZZI PER SINGOLA CAMERA, PER USCITA.", bx + bw / 2, by + bh - 9.2, { align: "center", charSpace: 0.5 });
  spacedText(doc, "IL PREZZO NON INCLUDE IL NOLEGGIO BIANCHERIA.", bx + bw / 2, by + bh - 4.8, { align: "center", charSpace: 0.5 });
}

// ═══════════════════════════════════════════════════════════════
//  Entry point
// ═══════════════════════════════════════════════════════════════

export async function generatePreventivoPdf(d: PreventivoPdfData): Promise<Buffer> {
  const jspdfModule: any = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
  const a = await loadAssets();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  // Registrazione font
  for (const [name, b64] of Object.entries(a.fonts)) {
    doc.addFileToVFS(`${name}.ttf`, b64);
  }
  doc.addFont("LeagueSpartan-Bold.ttf", "LeagueSpartan", "bold");
  doc.addFont("Montserrat-Regular.ttf", "Montserrat", "normal");
  doc.addFont("Montserrat-Medium.ttf", "Montserrat", "medium");
  doc.addFont("Montserrat-Bold.ttf", "Montserrat", "bold");
  doc.addFont("Montserrat-BoldItalic.ttf", "Montserrat", "bolditalic");

  // ── Copertina ──
  pageCover(doc, a, d);

  // ── Pagine PULIZIA ──
  const multi = d.flow === "multi" && d.unita.length > 1;
  d.unita.forEach((u, i) => {
    doc.addPage();
    const photo = a.photos[i % a.photos.length];
    pagePulizia(doc, a, {
      photoB64: photo,
      titolo: "PULIZIA",
      sottotitolo: multi ? (u.nome || `Unit\u00E0 ${i + 1}`) : undefined,
      bagni: u.bagni ?? 1,
      mq: u.mq,
      postiLetto: u.postiLetto,
      prezzo: u.prezzo,
      camere: u.camere,
      extras: u.extras,
    });
  });

  // ── Pagine statiche ──
  for (const img of [a.listino, a.okiko, a.termini, a.contatti]) {
    doc.addPage();
    doc.addImage(img, "JPEG", 0, 0, W, H);
  }

  const out = doc.output("arraybuffer");
  return Buffer.from(out);
}

// ═══════════════════════════════════════════════════════════════
//  Adapter di compatibilità con la route /api/leads (v1)
//  Stessa firma di buildPreventivoPdf v1: la route non va toccata.
// ═══════════════════════════════════════════════════════════════

interface QuoteUnitLike {
  nome?: string;
  min?: number;
  max?: number;
  suMisura?: boolean;
  mq?: number;
  bagni?: number;
  postiLetto?: number;
  ospiti?: number;
}

interface QuoteCameraLike {
  tipo?: string;
  label?: string;
  nome?: string;
  prezzo?: number;
  min?: number;
  max?: number;
  suMisura?: boolean;
  quantita?: number;
  qty?: number;
  n?: number;
}

interface QuoteExtraLike {
  label?: string;
  nome?: string;
  prezzo?: number;
  unit?: string;
}

export interface LeadQuoteLike extends QuoteUnitLike {
  unitaDettaglio?: QuoteUnitLike[];
  camereDettaglio?: QuoteCameraLike[];
  extras?: QuoteExtraLike[];
  dati?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export interface BuildPreventivoPdfArgs {
  nome: string;
  tipo?: string;
  zona?: string;
  copertura?: unknown; // accettato per compatibilità, non usato nel PDF
  quote: LeadQuoteLike;
  numeroPreventivo: string;
  dataIt: string;
}

/** €min oppure €min-max; SU MISURA se il motore non ha un prezzo */
function prezzoDaRange(o: { min?: number; max?: number; suMisura?: boolean; prezzo?: number }): Prezzo {
  if (o.suMisura) return "SU MISURA";
  if (typeof o.prezzo === "number") return o.prezzo;
  const { min, max } = o;
  if (typeof min === "number" && typeof max === "number") {
    return min === max ? min : `\u20AC${min}-${max}`;
  }
  if (typeof min === "number") return min;
  if (typeof max === "number") return max;
  return "SU MISURA";
}

function numOrUndef(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (typeof n === "number" && isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Drop-in per la route /api/leads: mappa il quote del motore v3 sul nuovo layout. */
export async function buildPreventivoPdf(a: BuildPreventivoPdfArgs): Promise<Buffer> {
  const q = a.quote || {};
  const dati = (q.dati || q.input || {}) as Record<string, unknown>;
  const t = (a.tipo || "").toLowerCase();

  // Rileva il flusso prima dalla forma del quote, poi dal tipo dichiarato
  let flow: PreventivoPdfData["flow"];
  if (q.camereDettaglio && q.camereDettaglio.length) {
    flow = t.includes("hotel") ? "hotel" : "bnb";
  } else if (q.unitaDettaglio && q.unitaDettaglio.length > 1) {
    flow = "multi";
  } else if (t.includes("bnb") || t.includes("b&b") || t.includes("hotel") || t.includes("affitta")) {
    flow = t.includes("hotel") ? "hotel" : "bnb";
  } else if (t.includes("multi") || t.includes("piu") || t.includes("pi\u00F9")) {
    flow = "multi";
  } else {
    flow = "vacation";
  }

  const extras: PreventivoExtra[] | undefined = q.extras?.length
    ? q.extras.map((e) => ({ label: e.label || e.nome || "Extra", prezzo: e.prezzo ?? 0, unit: e.unit }))
    : undefined;

  let unita: PreventivoUnita[];

  if (flow === "bnb" || flow === "hotel") {
    // Prezzo PER SINGOLA CAMERA — mai il totale
    const camere: PreventivoCamera[] = (q.camereDettaglio || []).map((c) => ({
      label: c.tipo || c.label || c.nome || "Camera",
      prezzo: prezzoDaRange(c),
      quantita: c.quantita ?? c.qty ?? c.n,
    }));
    unita = [{
      mq: numOrUndef(q.mq, dati.mq),
      bagni: numOrUndef(q.bagni, dati.bagni) ?? 1,
      postiLetto: numOrUndef(q.postiLetto, dati.postiLetto, q.ospiti, dati.ospiti),
      camere,
      extras,
    }];
  } else if (flow === "multi") {
    // Una pagina per casa, ognuna col suo nome e il suo prezzo — mai il totale
    unita = (q.unitaDettaglio || []).map((u, i) => ({
      nome: u.nome || `Unit\u00E0 ${i + 1}`,
      mq: numOrUndef(u.mq),
      bagni: numOrUndef(u.bagni) ?? 1,
      postiLetto: numOrUndef(u.postiLetto, u.ospiti),
      prezzo: prezzoDaRange(u),
    }));
    if (!unita.length) unita = [{ bagni: 1, prezzo: prezzoDaRange(q) }];
  } else {
    unita = [{
      mq: numOrUndef(q.mq, dati.mq),
      bagni: numOrUndef(q.bagni, dati.bagni) ?? 1,
      postiLetto: numOrUndef(q.postiLetto, dati.postiLetto, q.ospiti, dati.ospiti),
      prezzo: prezzoDaRange(q),
      extras,
    }];
  }

  return generatePreventivoPdf({
    numero: a.numeroPreventivo,
    data: a.dataIt,
    cliente: a.nome,
    indirizzo: a.zona || "",
    flow,
    unita,
  });
}
