/**
 * DEMO preventivi Puliziacasevacanze — un modello per ogni tipo di struttura.
 * Tutto vettoriale (font veri incorporati), foto reali, NESSUN totale mai.
 * Identità visiva del Canva originale: blu #466379, rame #B67C4B,
 * League Spartan Bold + Montserrat.
 */

import * as fs from "fs/promises";
import * as path from "path";

const W = 210;
const H = 297;

const BLUE: [number, number, number] = [70, 99, 121];
const COPPER: [number, number, number] = [182, 124, 75];
const DARK: [number, number, number] = [60, 60, 60];
const GRAYTXT: [number, number, number] = [110, 110, 110];
const CARD: [number, number, number] = [244, 245, 246];
const ROWALT: [number, number, number] = [237, 240, 243];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

const ASSET_DIR = path.join(process.cwd(), "public", "preventivo");
type Doc = any;

async function loadAsset(name: string): Promise<string> {
  const buf = await fs.readFile(path.join(ASSET_DIR, name));
  return buf.toString("base64");
}

interface Assets {
  coverTop: string;
  fadeBg: string;
  photos: string[];
  iconHouse: string;
  iconBath: string;
  iconBed: string;
  okikoHero: string;
  strips: string[];
  contattiBig: string;
  gestPhone?: string;
  gestPhoneRatio?: number;
  gestShots: (string | undefined)[];
  gestShotRatios: number[];
  prod: Record<string, string>;
  fonts: Record<string, string>;
}

async function loadOptional(name: string): Promise<{ b64: string; ratio: number } | undefined> {
  try {
    const buf = await fs.readFile(path.join(ASSET_DIR, name));
    // dimensioni PNG/JPEG per il ratio
    let wpx = 0, hpx = 0;
    if (buf[0] === 0x89) { wpx = buf.readUInt32BE(16); hpx = buf.readUInt32BE(20); }
    else {
      // JPEG: cerca SOF0/SOF2
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) { hpx = buf.readUInt16BE(i + 5); wpx = buf.readUInt16BE(i + 7); break; }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    return { b64: buf.toString("base64"), ratio: wpx && hpx ? wpx / hpx : 1 };
  } catch { return undefined; }
}

async function loadAssets(): Promise<Assets> {
  const names = [
    "cover_top.jpg", "fade_bg.jpg",
    "pulizia_photo_1.jpg", "pulizia_photo_2.jpg", "pulizia_photo_3.jpg", "pulizia_photo_4.jpg",
    "icon_house.png", "icon_bath.png", "icon_bed.png",
    "okiko_hero.jpg",
    "strip_1.jpg", "strip_2.jpg", "strip_3.jpg", "strip_4.jpg", "strip_5.jpg", "strip_6.jpg",
    "contatti_big.jpg",
    "prod_doccia.jpg", "prod_body.jpg", "prod_set.jpg", "prod_cuffia.jpg", "prod_sapone.jpg", "prod_pantofole.jpg",
    "fonts/LeagueSpartan-Bold.ttf", "fonts/Montserrat-Regular.ttf", "fonts/Montserrat-Medium.ttf",
    "fonts/Montserrat-Bold.ttf", "fonts/Montserrat-BoldItalic.ttf",
  ];
  const b = await Promise.all(names.map(loadAsset));
  const gPhone = await loadOptional("gest_phone.png") || await loadOptional("gest_phone.jpg");
  const gShots = await Promise.all([1, 2, 3].map(async (i) => (await loadOptional(`gest_shot_${i}.png`)) || (await loadOptional(`gest_shot_${i}.jpg`))));
  return {
    coverTop: b[0], fadeBg: b[1],
    photos: [b[2], b[3], b[4], b[5]],
    iconHouse: b[6], iconBath: b[7], iconBed: b[8],
    okikoHero: b[9],
    strips: [b[10], b[11], b[12], b[13], b[14], b[15]],
    contattiBig: b[16],
    prod: { doccia: b[17], body: b[18], set: b[19], cuffia: b[20], sapone: b[21], pantofole: b[22] },
    gestPhone: gPhone?.b64,
    gestPhoneRatio: gPhone?.ratio,
    gestShots: gShots.map((g) => g?.b64),
    gestShotRatios: gShots.map((g) => g?.ratio || 1),
    fonts: {
      "LeagueSpartan-Bold": b[23], "Montserrat-Regular": b[24], "Montserrat-Medium": b[25],
      "Montserrat-Bold": b[26], "Montserrat-BoldItalic": b[27],
    },
  };
}

// ── helper testo con tracking ──
function setFill(doc: Doc, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: Doc, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }
function setDraw(doc: Doc, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]); }

function spacedWidth(doc: Doc, text: string, cs: number): number {
  return doc.getTextWidth(text) + cs * Math.max(0, text.length - 1);
}
interface SpacedOpts { align?: "left" | "center" | "right"; charSpace?: number }
function spacedText(doc: Doc, text: string, x: number, y: number, o: SpacedOpts = {}) {
  const cs = o.charSpace ?? 0;
  const w = spacedWidth(doc, text, cs);
  let x0 = x;
  if (o.align === "center") x0 = x - w / 2;
  if (o.align === "right") x0 = x - w;
  doc.text(text, x0, y, { charSpace: cs });
}
function wrapSpaced(doc: Doc, text: string, maxW: number, cs: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const cand = cur ? cur + " " + wd : wd;
    if (spacedWidth(doc, cand, cs) <= maxW || !cur) cur = cand;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

type Prezzo = number | string;
function fmtPrezzo(v: Prezzo | undefined): string {
  if (v === undefined || v === null) return "";
  return typeof v === "number" ? `\u20AC${v}` : v;
}

// ── intestazione di pagina interna: banda blu + titolo ──
function pageHeader(doc: Doc, titolo: string, sottotitolo?: string) {
  setFill(doc, BLUE);
  doc.rect(0, 0, W, 30, "F");
  setText(doc, WHITE);
  doc.setFont("LeagueSpartan", "bold");
  fitSpacedText(doc, titolo, W / 2, 17, W - 20, { align: "center", charSpace: 1.2, size: 27 });
  if (sottotitolo) {
    doc.setFont("Montserrat", "medium");
    fitSpacedText(doc, sottotitolo.toUpperCase(), W / 2, 25, W - 24, { align: "center", charSpace: 1.6, size: 9 });
  }
}

// ── footer con sito ──
function pageFooter(doc: Doc) {
  setFill(doc, BLUE);
  doc.rect(0, H - 14, W, 14, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9);
  spacedText(doc, "WWW.PULIZIACASEVACANZE.IT", W / 2, H - 5.6, { align: "center", charSpace: 1.8 });
}

/** Testo con tracking che si restringe automaticamente per stare in maxW. */
function fitSpacedText(doc: Doc, text: string, x: number, y: number, maxW: number, o: SpacedOpts & { size: number; minSize?: number } ) {
  let fs = o.size;
  const cs = o.charSpace ?? 0;
  doc.setFontSize(fs);
  while (fs > (o.minSize ?? 6.5) && spacedWidth(doc, text, cs) > maxW) { fs -= 0.25; doc.setFontSize(fs); }
  spacedText(doc, text, x, y, o);
}

/** Striscia di 3 foto orizzontali (crop quadrato gia' preparato, soggetto intero). */
function photoStrip(doc: Doc, a: Assets, y: number, hgt: number, x0 = 14, x1 = W - 14, idx: number[] = [0, 1, 2]) {
  const n = idx.length;
  const spw = (x1 - x0 - 6 * (n - 1)) / n;
  let spx = x0;
  const srcRatio = 0.95; // w/h dei crop strip
  for (const i of idx) {
    doc.saveGraphicsState();
    doc.roundedRect(spx, y, spw, hgt, 4, 4, null);
    doc.clip();
    doc.discardPath();
    let dw = spw, dh = spw / srcRatio;
    if (dh < hgt) { dh = hgt; dw = hgt * srcRatio; }
    doc.addImage(a.strips[i % a.strips.length], "JPEG", spx - (dw - spw) / 2, y - (dh - hgt) / 2, dw, dh);
    doc.restoreGraphicsState();
    spx += spw + 6;
  }
}

/** Nota centrata: va sempre a capo entro i margini. Ritorna la y successiva. */
function centeredNote(doc: Doc, text: string, y: number, opts: { size?: number; cs?: number; maxW?: number; lh?: number } = {}): number {
  const size = opts.size ?? 8.8, cs = opts.cs ?? 0.7, maxW = opts.maxW ?? 176, lh = opts.lh ?? 5.2;
  doc.setFontSize(size);
  const lines = wrapSpaced(doc, text, maxW, cs);
  for (const ln of lines) { spacedText(doc, ln, W / 2, y, { align: "center", charSpace: cs }); y += lh; }
  return y;
}

// ── card bianca arrotondata con ombra finta ──
function card(doc: Doc, x: number, y: number, w: number, h: number, fill: [number, number, number] = CARD) {
  setFill(doc, fill);
  doc.roundedRect(x, y, w, h, 4, 4, "F");
}

// ── icona check vettoriale ──
function drawCheck(doc: Doc, cx: number, cy: number, r: number, circle: [number, number, number] = COPPER) {
  setFill(doc, circle);
  doc.circle(cx, cy, r, "F");
  setDraw(doc, WHITE);
  doc.setLineWidth(r * 0.28);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.line(cx - r * 0.42, cy + r * 0.02, cx - r * 0.1, cy + r * 0.36);
  doc.line(cx - r * 0.1, cy + r * 0.36, cx + r * 0.46, cy - 0.32 * r);
}

// ═══════════════════════════════════════════════════════════════
//  COPERTINA — come il Canva, con etichetta tipo struttura
// ═══════════════════════════════════════════════════════════════

interface CoverData { numero: string; data: string; cliente: string; indirizzo: string; badge: string }

function pageCover(doc: Doc, a: Assets, d: CoverData) {
  setFill(doc, BLUE);
  doc.rect(0, 0, W, 29.5, "F");
  doc.addImage(a.coverTop, "JPEG", 0, 0, W, 177.3);

  // badge tipo struttura
  setFill(doc, COPPER);
  const bw = spacedWidth2(doc, d.badge.toUpperCase(), 10, "Montserrat", "bold", 1.8) + 16;
  doc.roundedRect(W / 2 - bw / 2, 183, bw, 10.6, 5.3, 5.3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(10);
  spacedText(doc, d.badge.toUpperCase(), W / 2, 189.9, { align: "center", charSpace: 1.8 });

  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(45);
  spacedText(doc, "PREVENTIVO PULIZIE E", 106.6, 212, { align: "center", charSpace: 0.7 });
  spacedText(doc, "NOLEGGIO BIANCHERIA", 106.6, 230, { align: "center", charSpace: 0.7 });

  setText(doc, DARK);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(15);
  spacedText(doc, `NOME CLIENTE: ${d.cliente.toUpperCase()}`, 106.6, 243.5, { align: "center", charSpace: 1.15 });
  if (d.indirizzo) {
    spacedText(doc, d.indirizzo.toUpperCase(), 106.6, 253.5, { align: "center", charSpace: 1.15 });
  }

  doc.setFontSize(10.9);
  setText(doc, BLACK);
  spacedText(doc, `PREVENTIVO N\u00B0${d.numero}`, 7.2, 262.5, { charSpace: 1.5 });
  spacedText(doc, d.data, 204.9, 262.5, { align: "right", charSpace: 1.5 });

  setFill(doc, BLUE);
  doc.rect(0, 266.9, W, H - 266.9, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(10);
  spacedText(doc, "WWW.PULIZIACASEVACANZE.IT", W / 2, 283.3, { align: "center", charSpace: 2.2 });
}

function spacedWidth2(doc: Doc, text: string, size: number, font: string, style: string, cs: number): number {
  doc.setFont(font, style);
  doc.setFontSize(size);
  return spacedWidth(doc, text, cs);
}

// ═══════════════════════════════════════════════════════════════
//  PAGINA PULIZIA — foto a sinistra, voci incluse, area prezzo
//  (layout Canva; l'area prezzo cambia per tipo struttura)
// ═══════════════════════════════════════════════════════════════

interface PuliziaOpts {
  photo: string;
  sottotitolo?: string;        // nome unità (rame) per multi
  bullets: string[];
  bulletsItalicIdx?: number[]; // righe in corsivo (es. kit a pagamento)
  mq?: number;
  bagni?: number;
  postiLetto?: number;
  prezzo?: Prezzo;             // se presente: box prezzo singolo
  notaPrezzo?: string[];       // righe dentro il box
  senzaPrezzo?: boolean;       // multi: il prezzo sta nella pagina strutture
  rimando?: string[];          // testo nel box al posto del prezzo (es. rinvio al tariffario)
  notaFondo?: string;
}

function pagePulizia(doc: Doc, a: Assets, o: PuliziaOpts) {
  // cerchio sbiadito alto-destra
  doc.saveGraphicsState();
  doc.setGState(new (doc.GState as any)({ opacity: 0.1 }));
  doc.circle(145, 46, 64, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(a.fadeBg, "JPEG", 81, -18, 191.7, 128);
  doc.restoreGraphicsState();

  // foto verticale sinistra
  doc.addImage(o.photo, "JPEG", 8.4, 24.5, 64.8, 237.9);

  // titolo
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(42);
  spacedText(doc, "PULIZIA", 136.7, 28.7, { align: "center", charSpace: 0.66 });

  if (o.sottotitolo) {
    setText(doc, COPPER);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(10.5);
    spacedText(doc, o.sottotitolo.toUpperCase(), 136.7, 37.8, { align: "center", charSpace: 2 });
  }

  // sottotitolo centrato verticalmente tra il titolo e l'inizio dell'elenco
  const listStart = 72;
  const titleBottom = o.sottotitolo ? 40 : 33;
  const subMid = (titleBottom + listStart) / 2;
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(13.3);
  spacedText(doc, "IL PREVENTIVO INCLUDE LE", 136.2, subMid - 2.2, { align: "center", charSpace: 0.05 });
  spacedText(doc, "SEGUENTI VOCI:", 136.2, subMid + 6.15, { align: "center", charSpace: 0.05 });

  // bullet list (metrica calibrata sul riferimento)
  setText(doc, BLACK);
  doc.setFontSize(10.3);
  const bx = 80.9, maxW = 104, lh = 6.35, cs = 0.9;
  let y = listStart;
  o.bullets.forEach((b, i) => {
    const italic = o.bulletsItalicIdx?.includes(i);
    doc.setFont("Montserrat", italic ? "bolditalic" : "bold");
    const lines = wrapSpaced(doc, "- " + b, maxW, cs);
    lines.forEach((ln, j) => {
      doc.text(ln, j === 0 ? bx : bx + 2.2, y, { charSpace: cs });
      y += lh;
    });
    y += 6.25;
  });

  // pill dati struttura
  if (o.mq || o.bagni || o.postiLetto) {
    drawInfoPills(doc, a, o);
  }

  // box prezzo (solo se richiesto) oppure box di rimando
  if (!o.senzaPrezzo && o.prezzo !== undefined) {
    drawPriceBox(doc, o.prezzo, o.notaPrezzo);
  } else if (o.rimando) {
    drawRimandoBox(doc, o.rimando);
  }

  // nota a fondo pagina
  setText(doc, BLACK);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9.5);
  const nota = o.notaFondo || "SONO INCLUSI NEL PREZZO: I PRODOTTI PER LA PULIZIA, 2 ROTOLI DI CARTA IGENICA PER BAGNO E 1 CIOCCOLATINO PER OSPITE";
  const nlines = wrapSpaced(doc, nota, 176, 1.25);
  let ny = 278.3;
  for (const ln of nlines.slice(0, 3)) {
    spacedText(doc, ln, W / 2, ny, { align: "center", charSpace: 1.25 });
    ny += 5.95;
  }
}

function drawInfoPills(doc: Doc, a: Assets, o: PuliziaOpts) {
  const px = 82.5, pw = 48.6, ph = 16.4, gap = 5.5;
  let py = 206;
  const rows: Array<[string, string]> = [];
  if (o.mq) rows.push(["house", `${o.mq} Mq`]);
  if (o.bagni) rows.push(["bath", `${o.bagni}`]);
  if (o.postiLetto) rows.push(["bed", `${o.postiLetto}`]);
  const icons: Record<string, string> = { house: a.iconHouse, bath: a.iconBath, bed: a.iconBed };
  const iconH = 10.5, iconW = iconH * (231 / 168); // proporzioni reali dell'icona
  for (const [icon, label] of rows) {
    setFill(doc, BLUE);
    doc.roundedRect(px, py, pw, ph, 6.5, 6.5, "F");
    doc.addImage(icons[icon], "PNG", px + 3.2, py + (ph - iconH) / 2, iconW, iconH);
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(19);
    // numero centrato nello spazio a destra dell'icona
    const zx = px + 3.2 + iconW + 1.5;
    spacedText(doc, label, zx + (px + pw - 3 - zx) / 2, py + ph / 2 + 2.4, { align: "center", charSpace: 0.3 });
    py += ph + gap;
  }
}

function drawPriceBox(doc: Doc, prezzo: Prezzo, nota?: string[]) {
  const bx = 137.1, by = 203.7, bw = 62.8, bh = 62.9;
  setFill(doc, BLUE);
  doc.roundedRect(bx, by, bw, bh, 10, 10, "F");
  setFill(doc, COPPER);
  doc.roundedRect(135, 199.4, 23.8, 12.6, 6.3, 6.3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9);
  spacedText(doc, "PREZZO", 146.9, 207.2, { align: "center", charSpace: 0.9 });

  doc.setFont("LeagueSpartan", "bold");
  const priceStr = fmtPrezzo(prezzo) || "\u2014";
  let fsz = 64;
  doc.setFontSize(fsz);
  while (fsz > 20 && doc.getTextWidth(priceStr) > bw - 10) { fsz -= 2; doc.setFontSize(fsz); }
  spacedText(doc, priceStr, 169.4, 238.5 - (64 - fsz) * 0.12, { align: "center" });

  doc.setFont("Montserrat", "medium");
  doc.setFontSize(8.8);
  const lines = nota || ["QUESTO PREZZO NON", "INCLUDE IL NOLEGGIO", "BIANCHERIA."];
  let y = 247.5;
  for (const ln of lines) { spacedText(doc, ln, 169.4, y, { align: "center", charSpace: 1.1 }); y += 4.5; }
}

/** Box blu nella posizione del prezzo: rimanda alla pagina con i prezzi. */
function drawRimandoBox(doc: Doc, righe: string[]) {
  const bx = 137.1, by = 203.7, bw = 62.8, bh = 62.9;
  setFill(doc, BLUE);
  doc.roundedRect(bx, by, bw, bh, 10, 10, "F");
  setFill(doc, COPPER);
  doc.roundedRect(135, 199.4, 23.8, 12.6, 6.3, 6.3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9);
  spacedText(doc, "PREZZI", 146.9, 207.2, { align: "center", charSpace: 0.9 });

  // freccia verso il basso/destra
  setDraw(doc, WHITE);
  doc.setLineWidth(1.6);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const ax = bx + bw / 2, ay = by + 20;
  doc.line(ax - 7, ay, ax + 7, ay);
  doc.line(ax + 2, ay - 4.5, ax + 7, ay);
  doc.line(ax + 2, ay + 4.5, ax + 7, ay);

  doc.setFont("Montserrat", "bold");
  doc.setFontSize(10);
  let y = by + 33;
  for (const ln of righe) {
    spacedText(doc, ln, bx + bw / 2, y, { align: "center", charSpace: 0.7 });
    y += 5.6;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PAGINA "PERCHÉ NOI" — card servizio con check e numeri
// ═══════════════════════════════════════════════════════════════

function pagePercheNoi(doc: Doc, a: Assets) {
  pageHeader(doc, "PERCH\u00C9 SCEGLIERCI", "Il servizio in numeri");

  // 3 stat card in alto
  const stats: Array<[string, string, string]> = [
    ["15+", "ANNI DI", "ESPERIENZA"],
    ["7/7", "OPERATIVI TUTTI", "I GIORNI"],
    ["100%", "PRODOTTI E CARTA", "INCLUSI NEL PREZZO"],
  ];
  const sw = 60, sh = 40, sgap = 6;
  let sx = (W - (sw * 3 + sgap * 2)) / 2;
  for (const [num, l1, l2] of stats) {
    card(doc, sx, 42, sw, sh, BLUE);
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(30);
    spacedText(doc, num, sx + sw / 2, 60, { align: "center" });
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(7.6);
    spacedText(doc, l1, sx + sw / 2, 69, { align: "center", charSpace: 0.8 });
    spacedText(doc, l2, sx + sw / 2, 74, { align: "center", charSpace: 0.8 });
    sx += sw + sgap;
  }

  // card servizi con check
  const servizi: Array<[string, string]> = [
    ["SINCRONIZZAZIONE AUTOMATICA CALENDARI", "Colleghiamo i calendari Airbnb e Booking: ad ogni checkout la pulizia viene programmata da sola, senza che tu debba scrivere a nessuno."],
    ["GESTIONALE PROPRIETARIO INCLUSO", "Dashboard personale con calendario pulizie, biancheria, estratto conto mensile e storico interventi, sempre consultabile."],
    ["BIANCHERIA FORMATO HOTEL", "Lenzuola e teli professionali sanificati, consegna e ritiro inclusi nel prezzo del noleggio."],
    ["CONTROLLO QUALIT\u00C0 A OGNI USCITA", "Ogni pulizia si chiude con la verifica di luci, acqua calda, riscaldamento e aria condizionata: la casa \u00E8 sempre pronta al check-in."],
    ["KIT DI CORTESIA LINEA OKIKO", "Linea cortesia elegante disponibile su richiesta: dispenser, saponi e set monouso per un'accoglienza da hotel."],
  ];
  let cy = 92;
  const cx = 14, cw = W - 28, chh = 30, cgap = 6;
  for (const [tit, desc] of servizi) {
    card(doc, cx, cy, cw, chh);
    drawCheck(doc, cx + 13, cy + chh / 2, 6);
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(11);
    spacedText(doc, tit, cx + 25, cy + 11, { charSpace: 0.5 });
    setText(doc, DARK);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9);
    const lines = wrapSpaced(doc, desc, cw - 32, 0.15);
    let ly = cy + 18;
    for (const ln of lines.slice(0, 2)) { doc.text(ln, cx + 25, ly, { charSpace: 0.15 }); ly += 4.6; }
    cy += chh + cgap;
  }

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  LISTINO BIANCHERIA — vettoriale, tabella dinamica
// ═══════════════════════════════════════════════════════════════

export interface VoceListino { nome: string; prezzo: string; unit?: string }

const LISTINO_BIANCHERIA: VoceListino[] = [
  { nome: "Lenzuolo Matrimoniale", prezzo: "1,90 \u20AC" },
  { nome: "Lenzuolo Singolo", prezzo: "1,70 \u20AC" },
  { nome: "Telo Viso", prezzo: "1,00 \u20AC" },
  { nome: "Telo Corpo", prezzo: "1,90 \u20AC" },
  { nome: "Bidet", prezzo: "0,90 \u20AC" },
  { nome: "Federe", prezzo: "0,90 \u20AC" },
  { nome: "Tappetino Doccia", prezzo: "1,00 \u20AC" },
  { nome: "Canavaccio", prezzo: "1,50 \u20AC" },
];

function pageListino(doc: Doc, a: Assets) {
  pageHeader(doc, "LISTINO BIANCHERIA", "Tariffe per il singolo pezzo \u2014 da prendere in visione");

  // tabella
  const tx = 24, tw = W - 48;
  let ty = 44;
  // header tabella
  setFill(doc, BLUE);
  doc.roundedRect(tx, ty, tw, 12, 3, 3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(10);
  spacedText(doc, "DESCRIZIONE", tx + 10, ty + 8, { charSpace: 1.6 });
  spacedText(doc, "PREZZO", tx + tw - 10, ty + 8, { align: "right", charSpace: 1.6 });
  ty += 12;

  const rh = 12.6;
  LISTINO_BIANCHERIA.forEach((v, i) => {
    if (i % 2 === 0) { setFill(doc, ROWALT); doc.rect(tx, ty, tw, rh, "F"); }
    setText(doc, DARK);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(10.5);
    spacedText(doc, v.nome, tx + 10, ty + 8.2, { charSpace: 0.9 });
    setText(doc, BLUE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(13);
    spacedText(doc, v.prezzo, tx + tw - 10, ty + 8.6, { align: "right", charSpace: 0.4 });
    ty += rh;
  });
  // bordo arrotondato finale
  setDraw(doc, ROWALT);
  doc.setLineWidth(0.3);

  ty += 8;

  // card nota (come il box scuro del riferimento)
  card(doc, 24, ty, W - 48, 34, BLUE);
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(10.5);
  spacedText(doc, "NOTE E TERMINI SPECIALI", W / 2, ty + 9.5, { align: "center", charSpace: 1.4 });
  doc.setFont("Montserrat", "medium");
  doc.setFontSize(9);
  const nota = "Il costo di consegna della biancheria pulita e il ritiro della biancheria sporca \u00E8 compreso nel prezzo. I prezzi indicati sono obbligatoriamente da associare al servizio di pulizia.";
  const nlines = wrapSpaced(doc, nota, W - 76, 0.3);
  let ny = ty + 17;
  for (const ln of nlines) { spacedText(doc, ln, W / 2, ny, { align: "center", charSpace: 0.3 }); ny += 4.8; }

  ty += 34 + 10;

  // striscia foto in basso (orizzontali, soggetto intero)
  const ph = H - 14 - ty - 8;
  photoStrip(doc, a, ty, ph, 24, W - 24, [1, 2, 4]);

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  KIT DI CORTESIA — LINEA OKIKO, card prodotto vettoriali
// ═══════════════════════════════════════════════════════════════

const PRODOTTI_OKIKO: Array<{ key: string; nome: string; desc: string; prezzo: string }> = [
  { key: "doccia", nome: "DOCCIA-SHAMPOO", desc: "Sapone vegetale da 15g in incarto colorato, privo di allergeni, per hotel e B&B.", prezzo: "0,48 \u20AC" },
  { key: "body", nome: "BODY LOTION", desc: "Crema corpo in tubetto bianco 30ml, tappo a vite, fragranza fruttata leggera e non invasiva.", prezzo: "0,50 \u20AC" },
  { key: "set", nome: "SET CORTESIA", desc: "Set cosmetico viso e mani, con dischetti levatrucco, limetta unghie e cotton fioc.", prezzo: "0,48 \u20AC" },
  { key: "cuffia", nome: "CUFFIA DOCCIA", desc: "Cuffia doccia in astuccio di cartone bicolore, con rilievo su due lati.", prezzo: "0,40 \u20AC" },
  { key: "sapone", nome: "SAPONE MANI", desc: "Sapone vegetale da 15g in incarto colorato, privo di allergeni, alta detergenza e profumato.", prezzo: "0,28 \u20AC" },
  { key: "pantofole", nome: "PANTOFOLE", desc: "Pantofola chiusa in TNT bianco con suola EVA 3 mm e microforatura in gomma.", prezzo: "0,90 \u20AC" },
];

function pageKitCortesia(doc: Doc, a: Assets) {
  // titolo elegante come l'originale
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(30);
  spacedText(doc, "LINEA OKIKO", W / 2, 20, { align: "center", charSpace: 3 });
  setText(doc, COPPER);
  doc.setFont("Montserrat", "medium");
  doc.setFontSize(10);
  spacedText(doc, "LINEA DI CORTESIA ELEGANTE \u2014 KIT SU RICHIESTA", W / 2, 28.5, { align: "center", charSpace: 1.8 });

  // hero foto prodotti
  doc.saveGraphicsState();
  doc.roundedRect(14, 34, W - 28, 54, 5, 5, null);
  doc.clip();
  doc.discardPath();
  const heroRatio = 2482 / 756;
  const hw = W - 28, hh = hw / heroRatio;
  doc.addImage(a.okikoHero, "JPEG", 14, 34 - (hh - 54) / 2, hw, hh);
  doc.restoreGraphicsState();

  // griglia card prodotto 3x2
  const gx = 14, gw = (W - 28 - 12) / 3, gh = 74, ggap = 6;
  let px = gx, py = 96;
  PRODOTTI_OKIKO.forEach((p, i) => {
    card(doc, px, py, gw, gh);
    // foto prodotto (crop cover)
    doc.saveGraphicsState();
    doc.roundedRect(px + 3, py + 3, gw - 6, 34, 3, 3, null);
    doc.clip();
    doc.discardPath();
    const r = 640 / 370;
    const iw = gw - 6, ih = iw / r;
    doc.addImage(a.prod[p.key], "JPEG", px + 3, py + 3 - (ih - 34) / 2, iw, ih);
    doc.restoreGraphicsState();

    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(9.5);
    spacedText(doc, p.nome, px + gw / 2, py + 44, { align: "center", charSpace: 0.8 });

    setText(doc, GRAYTXT);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(6.8);
    const dl = wrapSpaced(doc, p.desc, gw - 10, 0.05);
    let dy = py + 49.5;
    for (const ln of dl.slice(0, 3)) { spacedText(doc, ln, px + gw / 2, dy, { align: "center", charSpace: 0.05 }); dy += 3.5; }

    // pill prezzo rame
    setFill(doc, COPPER);
    doc.roundedRect(px + gw / 2 - 13, py + gh - 11.5, 26, 8.4, 4.2, 4.2, "F");
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(11);
    spacedText(doc, p.prezzo, px + gw / 2, py + gh - 5.6, { align: "center", charSpace: 0.3 });

    px += gw + ggap;
    if ((i + 1) % 3 === 0) { px = gx; py += gh + ggap; }
  });

  // nota
  setText(doc, DARK);
  doc.setFont("Montserrat", "medium");
  centeredNote(doc, "PREZZI PER SINGOLO PEZZO \u2014 LISTINO DA PRENDERE IN VISIONE, KIT COMPONIBILE SU RICHIESTA", py + 8, { size: 8.5, cs: 0.6 });

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  TERMINI E CONDIZIONI — vettoriale
// ═══════════════════════════════════════════════════════════════

const TERMINI: Array<[string, string]> = [
  ["PREZZI", "Tutti i prezzi sono al netto di IVA. L'IVA sar\u00E0 applicata su biancheria e servizi di pulizia per i clienti privi di partita IVA. Per i clienti con partita IVA, l'IVA si applica solo sulla biancheria."],
  ["TEMPISTICHE", "Gli orari di lavoro sono concordati in anticipo con il cliente. Eventuali modifiche devono essere concordate preventivamente."],
  ["METODO DI PAGAMENTO", "Il pagamento dovr\u00E0 avvenire entro ogni 5\u00B0 del mese a vista fattura tramite bonifico bancario."],
  ["MODALIT\u00C0 DI LAVORO", "Prima dell'inizio del servizio, condurremo un sopralluogo, fornendo successivamente un contratto dettagliato che definisce le condizioni della collaborazione, inclusi costi e servizi."],
];

function pageTermini(doc: Doc, a: Assets) {
  pageHeader(doc, "TERMINI E CONDIZIONI");

  // foto colonna sinistra
  doc.saveGraphicsState();
  doc.roundedRect(14, 42, 64, 226, 5, 5, null);
  doc.clip();
  doc.discardPath();
  const r = 64.8 / 237.9;
  const iw = 64, ih = iw / r;
  doc.addImage(a.photos[0], "JPEG", 14, 42 - (ih - 226) / 2, iw, ih);
  doc.restoreGraphicsState();

  // sezioni a destra
  let ty = 52;
  const tx = 88, tw = W - 88 - 16;
  for (const [tit, body] of TERMINI) {
    setFill(doc, COPPER);
    doc.circle(tx + 2.5, ty - 1.4, 2.5, "F");
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(12);
    spacedText(doc, tit, tx + 9, ty, { charSpace: 1.6 });
    ty += 8;
    setText(doc, DARK);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(10);
    const lines = wrapSpaced(doc, body, tw, 0.5);
    for (const ln of lines) { doc.text(ln, tx, ty, { charSpace: 0.5 }); ty += 5.4; }
    ty += 12;
  }

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  CONTATTI — vettoriale
// ═══════════════════════════════════════════════════════════════

function pageContatti(doc: Doc, a: Assets) {
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(24);
  spacedText(doc, "PULIZIACASEVACANZE.IT", W / 2, 22, { align: "center", charSpace: 1.4 });
  setText(doc, COPPER);
  doc.setFont("Montserrat", "medium");
  doc.setFontSize(10);
  spacedText(doc, "DITTA DI SERVIZI PER ATTIVIT\u00C0 RICETTIVE", W / 2, 30.5, { align: "center", charSpace: 1.8 });

  const rows: Array<[string, string]> = [
    ["P.IVA", "17480841000"],
    ["TELEFONO", "+39 3927830017"],
    ["EMAIL", "puliziacasevacanzeroma@gmail.com"],
    ["SITO WEB", "www.puliziacasevacanze.it"],
    ["ORARI", "LUN - DOM 9:00 - 18:00"],
    ["INDIRIZZO", "Via della Cava Aurelia 84N"],
  ];
  let cy = 44;
  for (const [k, v] of rows) {
    card(doc, 30, cy, W - 60, 13.6);
    setText(doc, COPPER);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(9);
    spacedText(doc, k, 40, cy + 8.7, { charSpace: 1.6 });
    setText(doc, DARK);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(10.5);
    spacedText(doc, v, W - 40, cy + 8.9, { align: "right", charSpace: 0.7 });
    cy += 17.2;
  }

  // foto grande in basso con angolo blu
  doc.saveGraphicsState();
  doc.roundedRect(14, cy + 4, W - 28, H - 14 - cy - 12, 5, 5, null);
  doc.clip();
  doc.discardPath();
  const boxH = H - 14 - cy - 12, boxW = W - 28;
  const ratio = 1600 / 896;
  let iw = boxW, ih = boxW / ratio;
  if (ih < boxH) { ih = boxH; iw = boxH * ratio; }
  doc.addImage(a.contattiBig, "JPEG", 14 - (iw - boxW) / 2, cy + 4 - (ih - boxH) / 2, iw, ih);
  doc.restoreGraphicsState();

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  MULTI — pagina "LE TUE STRUTTURE": una card per casa, zona propria,
//  prezzo per singola casa. NESSUN totale.
// ═══════════════════════════════════════════════════════════════

export interface CasaDemo {
  nome: string;
  zona: string;      // ogni casa ha la SUA zona
  mq?: number;
  bagni?: number;
  postiLetto?: number;
  prezzo: Prezzo;
}

function pageStrutture(doc: Doc, a: Assets, case_: CasaDemo[], scontoPercento?: number) {
  pageHeader(doc, "LE TUE STRUTTURE", "Prezzo per singola struttura, per uscita");

  let cy = 42;
  const cx = 14, cw = W - 28, chh = 34, cgap = 7;

  case_.forEach((c, i) => {
    card(doc, cx, cy, cw, chh);
    // banda blu laterale col numero
    setFill(doc, BLUE);
    doc.roundedRect(cx, cy, 16, chh, 4, 4, "F");
    doc.rect(cx + 8, cy, 8, chh, "F");
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(19);
    spacedText(doc, `${i + 1}`, cx + 8, cy + chh / 2 + 4.5, { align: "center" });

    // nome + zona
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(13);
    spacedText(doc, c.nome.toUpperCase(), cx + 23, cy + 12, { charSpace: 0.9 });
    setText(doc, COPPER);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(9);
    spacedText(doc, ("ZONA: " + c.zona).toUpperCase(), cx + 23, cy + 19.5, { charSpace: 1.2 });

    // dati struttura
    setText(doc, GRAYTXT);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9);
    const dati: string[] = [];
    if (c.mq) dati.push(`${c.mq} Mq`);
    if (c.bagni) dati.push(`${c.bagni} ${c.bagni === 1 ? "bagno" : "bagni"}`);
    if (c.postiLetto) dati.push(`${c.postiLetto} posti letto`);
    spacedText(doc, dati.join("  \u00B7  "), cx + 23, cy + 27.5, { charSpace: 0.4 });

    // prezzo a destra su pill blu
    const pw = 42;
    setFill(doc, BLUE);
    doc.roundedRect(cx + cw - pw - 7, cy + 6.5, pw, chh - 13, 6, 6, "F");
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    const ps = fmtPrezzo(c.prezzo);
    let fsz = 20;
    doc.setFontSize(fsz);
    while (fsz > 9 && doc.getTextWidth(ps) > pw - 8) { fsz -= 1; doc.setFontSize(fsz); }
    spacedText(doc, ps, cx + cw - pw / 2 - 7, cy + chh / 2 + fsz * 0.14, { align: "center" });

    cy += chh + cgap;
  });

  // card sconto multi-struttura (percentuale, MAI un totale)
  if (scontoPercento && scontoPercento > 0) {
    cy += 2;
    card(doc, cx, cy, cw, 26, COPPER);
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(21);
    spacedText(doc, `-${scontoPercento}%`, cx + 24, cy + 16.8, { align: "center" });
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(10.5);
    spacedText(doc, "SCONTO MULTI-STRUTTURA", cx + 46, cy + 11.5, { charSpace: 1 });
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9);
    spacedText(doc, "Gi\u00E0 applicato ai prezzi indicati sopra, per ogni singola struttura.", cx + 46, cy + 18.5, { charSpace: 0.3 });
    cy += 30;
  }

  // nota
  setText(doc, DARK);
  doc.setFont("Montserrat", "bold");
  let noteY = centeredNote(doc, "OGNI STRUTTURA HA IL SUO PREZZO PER USCITA \u2014 NESSUN FORFAIT: OGNI CASA PAGA SOLO LE PROPRIE USCITE.", cy + 6);
  doc.setFont("Montserrat", "medium");
  noteY = centeredNote(doc, "I PREZZI NON INCLUDONO IL NOLEGGIO BIANCHERIA.", noteY + 0.8);

  // striscia foto per chiudere la pagina (foto orizzontali, soggetto intero)
  noteY += 5;
  const stripH = H - 14 - noteY - 6;
  if (stripH > 24) photoStrip(doc, a, noteY, stripH, 14, W - 14, [3, 4, 5]);

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  B&B / HOTEL — pagina "PREZZI PER CAMERA": tabella per tipologia.
//  NESSUN totale.
// ═══════════════════════════════════════════════════════════════

export interface CameraDemo { tipologia: string; quantita?: number; prezzo: Prezzo }
export interface ExtraDemo { label: string; prezzo: Prezzo; nota?: string }

function pagePrezziCamere(doc: Doc, a: Assets, opts: {
  titolo?: string;
  camere: CameraDemo[];
  extras?: ExtraDemo[];
  notaCard: string[];         // card spiegazione "paghi solo le camere pulite"
  volumeCard?: [string, string]; // [titolo, testo] per hotel
}) {
  pageHeader(doc, opts.titolo || "PREZZI PER CAMERA", "Prezzo per singola camera, per uscita \u2014 mai forfait");

  // tabella tipologie
  const tx = 20, tw = W - 40;
  let ty = 42;
  setFill(doc, BLUE);
  doc.roundedRect(tx, ty, tw, 12, 3, 3, "F");
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(9.5);
  spacedText(doc, "TIPOLOGIA CAMERA", tx + 9, ty + 8, { charSpace: 1 });
  spacedText(doc, "QUANTIT\u00C0", tx + tw * 0.56, ty + 8, { align: "center", charSpace: 1 });
  spacedText(doc, "PREZZO", tx + tw - 9, ty + 8, { align: "right", charSpace: 1 });
  ty += 12;

  const rh = 13;
  opts.camere.forEach((c, i) => {
    if (i % 2 === 0) { setFill(doc, ROWALT); doc.rect(tx, ty, tw, rh, "F"); }
    setText(doc, DARK);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(10.5);
    spacedText(doc, c.tipologia.toUpperCase(), tx + 9, ty + 8.4, { charSpace: 0.8 });
    setText(doc, GRAYTXT);
    doc.setFont("Montserrat", "medium");
    spacedText(doc, c.quantita ? `x${c.quantita}` : "\u2014", tx + tw * 0.56, ty + 8.4, { align: "center", charSpace: 0.4 });
    setText(doc, BLUE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(14);
    spacedText(doc, fmtPrezzo(c.prezzo), tx + tw - 9, ty + 8.9, { align: "right" });
    ty += rh;
  });

  ty += 8;

  // extras (fermata, aree comuni...) come mini-card
  if (opts.extras?.length) {
    const ew = (tw - 8 * (opts.extras.length - 1)) / opts.extras.length;
    let ex = tx;
    for (const e of opts.extras) {
      card(doc, ex, ty, ew, 30);
      setText(doc, BLUE);
      doc.setFont("Montserrat", "bold");
      doc.setFontSize(9.5);
      const tl = wrapSpaced(doc, e.label.toUpperCase(), ew - 12, 0.8);
      let tly = ty + 9;
      for (const ln of tl.slice(0, 2)) { spacedText(doc, ln, ex + ew / 2, tly, { align: "center", charSpace: 0.8 }); tly += 4.8; }
      setText(doc, COPPER);
      doc.setFont("LeagueSpartan", "bold");
      doc.setFontSize(17);
      spacedText(doc, fmtPrezzo(e.prezzo), ex + ew / 2, ty + 25, { align: "center" });
      ex += ew + 8;
    }
    ty += 38;
  }

  // card blu spiegazione
  card(doc, tx, ty, tw, 34, BLUE);
  drawCheck(doc, tx + 15, ty + 17, 7, COPPER);
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  let titleFs = 11;
  doc.setFontSize(titleFs);
  while (titleFs > 8 && spacedWidth(doc, opts.notaCard[0], 0.6) > tw - 40) { titleFs -= 0.5; doc.setFontSize(titleFs); }
  spacedText(doc, opts.notaCard[0], tx + 29, ty + 13, { charSpace: 0.6 });
  doc.setFont("Montserrat", "medium");
  doc.setFontSize(9.3);
  const nl = wrapSpaced(doc, opts.notaCard.slice(1).join(" "), tw - 40, 0.2);
  let nly = ty + 20.5;
  for (const ln of nl.slice(0, 2)) { doc.text(ln, tx + 29, nly, { charSpace: 0.2 }); nly += 4.8; }
  ty += 42;

  // card volume (hotel)
  if (opts.volumeCard) {
    card(doc, tx, ty, tw, 30, COPPER);
    setText(doc, WHITE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(11.5);
    spacedText(doc, opts.volumeCard[0], tx + 12, ty + 12, { charSpace: 0.8 });
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9.3);
    const vl = wrapSpaced(doc, opts.volumeCard[1], tw - 24, 0.2);
    let vly = ty + 19.5;
    for (const ln of vl.slice(0, 2)) { doc.text(ln, tx + 12, vly, { charSpace: 0.2 }); vly += 4.8; }
    ty += 38;
  }

  // nota biancheria
  setText(doc, DARK);
  doc.setFont("Montserrat", "medium");
  ty = centeredNote(doc, "I PREZZI NON INCLUDONO IL NOLEGGIO BIANCHERIA \u2014 LISTINO DEDICATO IN QUESTO DOCUMENTO.", ty + 6) + 5;

  // striscia foto per chiudere la pagina (foto orizzontali, soggetto intero)
  const stripH = H - 14 - ty - 6;
  if (stripH > 24) photoStrip(doc, a, ty, stripH, 20, W - 20, [0, 1, 2]);

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════


function pagePuliziaBnb(doc: Doc, a: Assets) {
  pageHeader(doc, "LA PULIZIA NEL TUO B&B", "Ogni intervento \u00E8 pensato per camera, mai a corpo");

  const blocchi: Array<{ tit: string; sub: string; voci: string[]; strip: number }> = [
    {
      tit: "CAMERA A CHECKOUT",
      sub: "A ogni partenza, la camera torna come nuova",
      voci: [
        "Rifacimento completo del letto con cambio biancheria",
        "Pulizia e sanificazione del bagno privato",
        "Aspirazione e lavaggio dei pavimenti",
        "Ripristino dispenser, cortesie e dotazioni camera",
      ],
      strip: 0,
    },
    {
      tit: "PULIZIA FERMATA",
      sub: "Durante il soggiorno, senza disturbare l'ospite",
      voci: [
        "Riassetto del letto senza cambio completo",
        "Ricambio asciugamani su richiesta dell'ospite",
        "Bagno rinfrescato e rifiuti portati via",
      ],
      strip: 2,
    },
    {
      tit: "AREE COMUNI",
      sub: "Il biglietto da visita della struttura",
      voci: [
        "Sala colazione pulita e riordinata ogni giorno",
        "Corridoi, scale e reception",
        "Bagni condivisi sanificati",
      ],
      strip: 4,
    },
  ];

  let by = 40;
  for (const b of blocchi) {
    const bh = 12 + b.voci.length * 6.2 + 8;
    // foto quadrata a sinistra
    doc.saveGraphicsState();
    doc.roundedRect(14, by, 34, bh, 4, 4, null);
    doc.clip();
    doc.discardPath();
    let dw = 34, dh = 34 / 0.95;
    if (dh < bh) { dh = bh; dw = bh * 0.95; }
    doc.addImage(a.strips[b.strip], "JPEG", 14 - (dw - 34) / 2, by - (dh - bh) / 2, dw, dh);
    doc.restoreGraphicsState();

    // card testo
    card(doc, 52, by, W - 52 - 14, bh);
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(12.5);
    spacedText(doc, b.tit, 60, by + 9, { charSpace: 1 });
    setText(doc, COPPER);
    doc.setFont("Montserrat", "bolditalic");
    doc.setFontSize(8.8);
    doc.text(b.sub, 60, by + 15, { charSpace: 0.2 });
    setText(doc, DARK);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9.2);
    let vy = by + 22;
    for (const v of b.voci) {
      setFill(doc, COPPER);
      doc.circle(62, vy - 1.2, 1.1, "F");
      doc.text(v, 66, vy, { charSpace: 0.15 });
      vy += 6.2;
    }
    by += bh + 7;
  }

  // nota di raccordo con la pagina prezzi
  setText(doc, DARK);
  doc.setFont("Montserrat", "bold");
  const nEnd = centeredNote(doc, "OGNI VOCE HA IL SUO PREZZO PER SINGOLA CAMERA O SINGOLO INTERVENTO: LI TROVI NELLA PAGINA SEGUENTE.", by + 4);

  // foto di chiusura
  const stripH2 = H - 14 - (nEnd + 4) - 5;
  if (stripH2 > 20) photoStrip(doc, a, nEnd + 4, stripH2, 14, W - 14, [1, 3, 5]);

  pageFooter(doc);
}

function pageServizioHotel(doc: Doc, a: Assets) {
  pageHeader(doc, "IL SERVIZIO PER HOTEL", "Housekeeping esterno, standard alberghiero");

  const blocchi: Array<{ tit: string; sub: string; voci: string[]; strip: number }> = [
    {
      tit: "RIFACIMENTO A CHECKOUT",
      sub: "Camere pronte negli orari concordati",
      voci: [
        "Rifacimento completo con cambio biancheria",
        "Bagno in camera sanificato",
        "Controllo dotazioni e cortesie",
      ],
      strip: 1,
    },
    {
      tit: "RIASSETTO GIORNALIERO",
      sub: "Per gli ospiti in soggiorno",
      voci: [
        "Letto riassettato e camera areata",
        "Bagno rinfrescato, asciugamani a rotazione",
        "Rifiuti e riordino leggero",
      ],
      strip: 3,
    },
    {
      tit: "AREE COMUNI E HALL",
      sub: "La prima impressione dei tuoi ospiti",
      voci: [
        "Hall, reception e corridoi",
        "Scale, ascensori e sala colazione",
        "Vetri e superfici di rappresentanza",
      ],
      strip: 5,
    },
  ];

  let by = 40;
  for (const b of blocchi) {
    const bh = 12 + b.voci.length * 6.2 + 8;
    doc.saveGraphicsState();
    doc.roundedRect(14, by, 34, bh, 4, 4, null);
    doc.clip();
    doc.discardPath();
    let dw = 34, dh = 34 / 0.95;
    if (dh < bh) { dh = bh; dw = bh * 0.95; }
    doc.addImage(a.strips[b.strip], "JPEG", 14 - (dw - 34) / 2, by - (dh - bh) / 2, dw, dh);
    doc.restoreGraphicsState();

    card(doc, 52, by, W - 52 - 14, bh);
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(12.5);
    spacedText(doc, b.tit, 60, by + 9, { charSpace: 1 });
    setText(doc, COPPER);
    doc.setFont("Montserrat", "bolditalic");
    doc.setFontSize(8.8);
    doc.text(b.sub, 60, by + 15, { charSpace: 0.2 });
    setText(doc, DARK);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9.2);
    let vy = by + 22;
    for (const v of b.voci) {
      setFill(doc, COPPER);
      doc.circle(62, vy - 1.2, 1.1, "F");
      doc.text(v, 66, vy, { charSpace: 0.15 });
      vy += 6.2;
    }
    by += bh + 7;
  }

  setText(doc, DARK);
  doc.setFont("Montserrat", "bold");
  const nEndH = centeredNote(doc, "SQUADRA FISSA ASSEGNATA ALLA STRUTTURA, CON REFERENTE UNICO E ORARI DI RILASCIO CAMERE CONCORDATI.", by + 4);

  const stripH3 = H - 14 - (nEndH + 4) - 5;
  if (stripH3 > 20) photoStrip(doc, a, nEndH + 4, stripH3, 14, W - 14, [0, 2, 4]);

  pageFooter(doc);
}

function pageTariffaHotel(doc: Doc, a: Assets) {
  pageHeader(doc, "COME COSTRUIAMO LA TARIFFA", "Nessun prezzo a scatola chiusa: si parte dalla tua struttura");

  const steps: Array<[string, string, string]> = [
    ["1", "SOPRALLUOGO GRATUITO", "Visitiamo la struttura insieme: contiamo camere e tipologie, vediamo aree comuni, capiamo volumi, stagionalit\u00E0 e orari di rilascio che ti servono."],
    ["2", "TARIFFA PER TIPOLOGIA DI CAMERA", "Costruiamo un prezzo per singola camera lavorata (singola, doppia, suite), con riassetto giornaliero e aree comuni come voci separate. Nessun forfait: paghi solo le camere effettivamente rifatte."],
    ["3", "CONTRATTO E SQUADRA DEDICATA", "Formalizziamo orari di rilascio, standard di controllo e referente unico. Fatturazione mensile a consuntivo, con report dettagliato dal gestionale."],
  ];

  let sy = 44;
  for (const [num, tit, txt] of steps) {
    const shh = 40;
    card(doc, 14, sy, W - 28, shh);
    setFill(doc, BLUE);
    doc.circle(30, sy + shh / 2, 9, "F");
    setText(doc, WHITE);
    doc.setFont("LeagueSpartan", "bold");
    doc.setFontSize(19);
    spacedText(doc, num, 30, sy + shh / 2 + 2.4, { align: "center" });
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(12);
    spacedText(doc, tit, 46, sy + 12, { charSpace: 0.8 });
    setText(doc, DARK);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9.3);
    const lines = wrapSpaced(doc, txt, W - 28 - 40 - 8, 0.15);
    let ly = sy + 19;
    for (const ln of lines.slice(0, 4)) { doc.text(ln, 46, ly, { charSpace: 0.15 }); ly += 4.7; }
    sy += shh + 8;
  }

  // card invito sopralluogo
  card(doc, 14, sy + 2, W - 28, 30, COPPER);
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  doc.setFontSize(13);
  spacedText(doc, "PRENOTA IL SOPRALLUOGO GRATUITO", W / 2, sy + 14, { align: "center", charSpace: 1.2 });
  doc.setFont("LeagueSpartan", "bold");
  doc.setFontSize(15);
  spacedText(doc, "+39 3927830017", W / 2, sy + 25, { align: "center", charSpace: 1 });
  sy += 38;

  // foto di chiusura
  const stripH = H - 14 - sy - 5;
  if (stripH > 20) photoStrip(doc, a, sy, stripH, 14, W - 14, [0, 2, 4]);

  pageFooter(doc);
}

function pageGestionale(doc: Doc, a: Assets) {
  pageHeader(doc, "IL GESTIONALE INCLUSO", "La tua dashboard, sempre con te");

  // ── telefono a sinistra: dentro va lo SCREENSHOT REALE della dashboard ──
  const phX = 26, phY = 46, phW = 62, phH = 128;
  setFill(doc, [40, 44, 50] as any);
  doc.roundedRect(phX - 2.5, phY - 2.5, phW + 5, phH + 5, 9, 9, "F");
  // schermo
  if (a.gestPhone) {
    doc.saveGraphicsState();
    doc.roundedRect(phX, phY, phW, phH, 6, 6, null);
    doc.clip();
    doc.discardPath();
    const r = a.gestPhoneRatio || (phW / phH);
    let dw = phW, dh = phW / r;
    if (dh < phH) { dh = phH; dw = phH * r; }
    doc.addImage(a.gestPhone, "PNG", phX - (dw - phW) / 2, phY - (dh - phH) / 2, dw, dh);
    doc.restoreGraphicsState();
  } else {
    // segnaposto neutro in attesa dello screenshot reale
    setFill(doc, ROWALT);
    doc.roundedRect(phX, phY, phW, phH, 6, 6, "F");
    setText(doc, GRAYTXT);
    doc.setFont("Montserrat", "bold");
    doc.setFontSize(8);
    spacedText(doc, "SCREENSHOT", phX + phW / 2, phY + phH / 2 - 2, { align: "center", charSpace: 1 });
    spacedText(doc, "DASHBOARD", phX + phW / 2, phY + phH / 2 + 4, { align: "center", charSpace: 1 });
  }
  // notch
  setFill(doc, [40, 44, 50] as any);
  doc.roundedRect(phX + phW / 2 - 9, phY + 1.5, 18, 3.2, 1.6, 1.6, "F");

  // ── testo a destra: come funziona, in poche parole ──
  const tx = 100, tw = W - 100 - 14;
  setText(doc, BLUE);
  doc.setFont("LeagueSpartan", "bold");
  fitSpacedText(doc, "COME FUNZIONA,", tx, 56, tw, { charSpace: 0.3, size: 16 });
  fitSpacedText(doc, "IN POCHE PAROLE", tx, 64, tw, { charSpace: 0.3, size: 16 });

  const punti: Array<[string, string]> = [
    ["CI COLLEGHIAMO AI TUOI CALENDARI", "Airbnb e Booking: a ogni checkout la pulizia viene messa in automatico."],
    ["VEDI SEMPRE LE TUE PULIZIE", "Programmate, in corso e completate, con orari e biancheria."],
    ["RICHIEDI IL SERVIZIO IN UN TOCCO", "Pulizie extra, biancheria o modifiche direttamente dall'app."],
    ["ESTRATTO CONTO MENSILE", "Tutto in un unico documento chiaro, scaricabile in PDF."],
  ];
  let py2 = 78;
  for (const [tit, txt] of punti) {
    drawCheck(doc, tx + 4.5, py2 - 1.5, 4.5);
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    fitSpacedText(doc, tit, tx + 12, py2, tw - 12, { charSpace: 0.4, size: 10 });
    setText(doc, DARK);
    doc.setFont("Montserrat", "medium");
    doc.setFontSize(9);
    const lines = wrapSpaced(doc, txt, tw - 12, 0.15);
    let ly = py2 + 6;
    for (const ln of lines) { doc.text(ln, tx + 12, ly, { charSpace: 0.15 }); ly += 4.6; }
    py2 = ly + 7;
  }

  // ── card accesso incluso: a tutta larghezza, testo sempre dentro ──
  const bandY = Math.max(py2 + 2, phY + phH + 8);
  card(doc, 14, bandY, W - 28, 20, COPPER);
  setText(doc, WHITE);
  doc.setFont("Montserrat", "bold");
  fitSpacedText(doc, "ACCESSO INCLUSO NEL SERVIZIO \u2014 NESSUN COSTO AGGIUNTIVO", W / 2, bandY + 8.5, W - 44, { align: "center", charSpace: 1, size: 11 });
  doc.setFont("Montserrat", "medium");
  fitSpacedText(doc, "Attiviamo il tuo account alla firma del contratto.", W / 2, bandY + 15.5, W - 44, { align: "center", charSpace: 0.3, size: 9 });

  // ── tre schermate reali del gestionale in basso ──
  const shotY = bandY + 26;
  const shotH = H - 14 - shotY - 5;
  const labels = ["CALENDARIO PULIZIE", "DETTAGLIO INTERVENTO", "ESTRATTO CONTO"];
  const sw2 = (W - 28 - 12) / 3;
  let sx2 = 14;
  for (let i = 0; i < 3; i++) {
    const shot = a.gestShots[i];
    if (shot) {
      doc.saveGraphicsState();
      doc.roundedRect(sx2, shotY, sw2, shotH - 7, 4, 4, null);
      doc.clip();
      doc.discardPath();
      const r = a.gestShotRatios[i] || 1;
      let dw = sw2, dh = sw2 / r;
      if (dh < shotH - 7) { dh = shotH - 7; dw = dh * r; }
      doc.addImage(shot, "PNG", sx2 - (dw - sw2) / 2, shotY - (dh - (shotH - 7)) / 2, dw, dh);
      doc.restoreGraphicsState();
    } else {
      setFill(doc, ROWALT);
      doc.roundedRect(sx2, shotY, sw2, shotH - 7, 4, 4, "F");
      setText(doc, GRAYTXT);
      doc.setFont("Montserrat", "bold");
      doc.setFontSize(7);
      spacedText(doc, "SCREENSHOT", sx2 + sw2 / 2, shotY + (shotH - 7) / 2 + 1, { align: "center", charSpace: 0.8 });
    }
    setText(doc, BLUE);
    doc.setFont("Montserrat", "bold");
    fitSpacedText(doc, labels[i], sx2 + sw2 / 2, shotY + shotH - 1.5, sw2 - 4, { align: "center", charSpace: 0.7, size: 7.5 });
    sx2 += sw2 + 6;
  }

  pageFooter(doc);
}

// ═══════════════════════════════════════════════════════════════
//  API DI PRODUZIONE
// ═══════════════════════════════════════════════════════════════

const BULLETS_CASA = [
  "PULIZIA GENERALE DELLE CAMERE E DELLE AREE COMUNI",
  "PULIZIA DEI BAGNI",
  "PULIZIA DELLE FINESTRE",
  "RIMOZIONE DELLA POLVERE E DELLE RAGNATELE",
  "SMALTIMENTO DEI RIFIUTI",
  "SOSTITUZIONE BIANCHERIA E RIEMPIMENTO DEI DISPENSER DEI SAPONI O KIT DI CORTESIA (KIT A PAGAMENTO SU RICHIESTA)",
  "CONTROLLO GENERALE FUNZIONAMENTO DELLA CASA (LUCI, ACQUA CALDA RISCALDAMENTO, ARIA CONDIZIONATA)",
];

async function makeDoc(a: Assets): Promise<Doc> {
  const jspdfModule: any = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  for (const [name, b64] of Object.entries(a.fonts)) doc.addFileToVFS(`${name}.ttf`, b64);
  doc.addFont("LeagueSpartan-Bold.ttf", "LeagueSpartan", "bold");
  doc.addFont("Montserrat-Regular.ttf", "Montserrat", "normal");
  doc.addFont("Montserrat-Medium.ttf", "Montserrat", "medium");
  doc.addFont("Montserrat-Bold.ttf", "Montserrat", "bold");
  doc.addFont("Montserrat-BoldItalic.ttf", "Montserrat", "bolditalic");
  return doc;
}

function pagineComuni(doc: Doc, a: Assets) {
  // la pagina gestionale entra SOLO se esiste almeno lo screenshot del telefono:
  // mai segnaposto grigi in un preventivo reale.
  doc.addPage(); pagePercheNoi(doc, a);
  if (a.gestPhone) { doc.addPage(); pageGestionale(doc, a); }
  doc.addPage(); pageListino(doc, a);
  doc.addPage(); pageKitCortesia(doc, a);
  doc.addPage(); pageTermini(doc, a);
  doc.addPage(); pageContatti(doc, a);
}

export interface PreventivoCamera { label: string; prezzo: Prezzo; quantita?: number }
export interface PreventivoExtra { label: string; prezzo: Prezzo; nota?: string }

export interface PreventivoUnita {
  nome?: string;
  zona?: string;              // multi: ogni casa ha la SUA zona
  mq?: number;
  bagni?: number;
  postiLetto?: number;
  prezzo?: Prezzo;
}

export interface PreventivoPdfData {
  numero: string;
  data: string;
  cliente: string;
  indirizzo: string;          // zona principale (copertina)
  flow: "vacation" | "multi" | "bnb" | "hotel";
  unita: PreventivoUnita[];
  camere?: PreventivoCamera[];   // bnb: prezzi per tipologia camera
  extras?: PreventivoExtra[];    // bnb: fermata, aree comuni...
  scontoPercento?: number;       // multi: sconto già applicato ai prezzi
}

const BADGE: Record<PreventivoPdfData["flow"], string> = {
  vacation: "Casa Vacanze",
  multi: "Multi Struttura",
  bnb: "Bed & Breakfast",
  hotel: "Hotel",
};

export async function generatePreventivoPdf(d: PreventivoPdfData): Promise<Buffer> {
  const a = await loadAssets();
  const doc = await makeDoc(a);
  pageCover(doc, a, { numero: d.numero, data: d.data, cliente: d.cliente, indirizzo: d.indirizzo, badge: BADGE[d.flow] });

  if (d.flow === "vacation") {
    const u = d.unita[0] || {};
    doc.addPage();
    pagePulizia(doc, a, {
      photo: a.photos[0],
      bullets: BULLETS_CASA,
      mq: u.mq, bagni: u.bagni, postiLetto: u.postiLetto,
      prezzo: u.prezzo,
    });
  } else if (d.flow === "multi") {
    doc.addPage();
    pageStrutture(doc, a, d.unita.map((u, i) => ({
      nome: u.nome || `Struttura ${i + 1}`,
      zona: u.zona || d.indirizzo,
      mq: u.mq, bagni: u.bagni, postiLetto: u.postiLetto,
      prezzo: u.prezzo ?? "SU MISURA",
    })), d.scontoPercento);
    doc.addPage();
    pagePulizia(doc, a, {
      photo: a.photos[0],
      bullets: BULLETS_CASA,
      senzaPrezzo: true,
      rimando: ["PREZZO PER SINGOLA", "STRUTTURA:", "VEDI PAGINA", "PRECEDENTE"],
      notaFondo: "OGNI STRUTTURA HA IL SUO PREZZO PER USCITA (VEDI PAGINA PRECEDENTE). SONO SEMPRE INCLUSI I PRODOTTI PER LA PULIZIA, 2 ROTOLI DI CARTA IGENICA PER BAGNO E 1 CIOCCOLATINO PER OSPITE",
    });
  } else if (d.flow === "bnb") {
    doc.addPage();
    pagePuliziaBnb(doc, a);
    doc.addPage();
    pagePrezziCamere(doc, a, {
      camere: (d.camere || []).map((c) => ({ tipologia: c.label, quantita: c.quantita, prezzo: c.prezzo })),
      extras: (d.extras || []).map((e) => ({ label: e.label, prezzo: e.prezzo })),
      notaCard: [
        "PAGHI SOLO LE CAMERE EFFETTIVAMENTE PULITE",
        "Il prezzo \u00E8 per singola camera a checkout: nessun forfait mensile, nessun minimo. Se una camera non lavora, non la paghi.",
      ],
    });
  } else {
    doc.addPage();
    pageServizioHotel(doc, a);
    doc.addPage();
    pageTariffaHotel(doc, a);
  }

  pagineComuni(doc, a);
  return Buffer.from(doc.output("arraybuffer"));
}

// ═══════════════════════════════════════════════════════════════
//  ADAPTER PER LA ROUTE /api/leads — stessa firma della v1:
//  la route non va toccata.
// ═══════════════════════════════════════════════════════════════

interface QuoteUnitLike {
  nome?: string; zona?: string;
  min?: number; max?: number; suMisura?: boolean;
  mq?: number; bagni?: number; postiLetto?: number; ospiti?: number;
}
interface QuoteCameraLike {
  tipo?: string; label?: string; nome?: string;
  prezzo?: number; min?: number; max?: number; suMisura?: boolean;
  quantita?: number; qty?: number; n?: number;
}
interface QuoteExtraLike { label?: string; nome?: string; prezzo?: number; unit?: string }

export interface LeadQuoteLike extends QuoteUnitLike {
  unitaDettaglio?: QuoteUnitLike[];
  camereDettaglio?: QuoteCameraLike[];
  extras?: QuoteExtraLike[];
  scontoPercento?: number;
  fermata?: number;
  areeComuni?: number;
  dati?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export interface BuildPreventivoPdfArgs {
  nome: string;
  tipo?: string;
  zona?: string;
  copertura?: unknown;
  quote: LeadQuoteLike;
  numeroPreventivo: string;
  dataIt: string;
}

function prezzoDaRange(o: { min?: number; max?: number; suMisura?: boolean; prezzo?: number }): Prezzo {
  if (o.suMisura) return "SU MISURA";
  if (typeof o.prezzo === "number") return o.prezzo;
  const { min, max } = o;
  if (typeof min === "number" && typeof max === "number") return min === max ? min : `\u20AC${min}-${max}`;
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

/** Drop-in per la route /api/leads. */
export async function buildPreventivoPdf(a: BuildPreventivoPdfArgs): Promise<Buffer> {
  const q = a.quote || {};
  const dati = (q.dati || q.input || {}) as Record<string, unknown>;
  const t = (a.tipo || "").toLowerCase();

  let flow: PreventivoPdfData["flow"];
  if (t.includes("hotel")) flow = "hotel";
  else if (q.camereDettaglio && q.camereDettaglio.length) flow = "bnb";
  else if (q.unitaDettaglio && q.unitaDettaglio.length > 1) flow = "multi";
  else if (t.includes("bnb") || t.includes("b&b") || t.includes("affitta")) flow = "bnb";
  else if (t.includes("multi") || t.includes("piu") || t.includes("pi\u00F9")) flow = "multi";
  else flow = "vacation";

  const data: PreventivoPdfData = {
    numero: a.numeroPreventivo,
    data: a.dataIt,
    cliente: a.nome,
    indirizzo: a.zona || "",
    flow,
    unita: [],
  };

  if (flow === "bnb") {
    data.camere = (q.camereDettaglio || []).map((c) => ({
      label: c.tipo || c.label || c.nome || "Camera",
      prezzo: prezzoDaRange(c),
      quantita: c.quantita ?? c.qty ?? c.n,
    }));
    const extras: PreventivoExtra[] = (q.extras || []).map((e) => ({ label: e.label || e.nome || "Extra", prezzo: e.prezzo ?? 0 }));
    if (typeof q.fermata === "number" && !extras.some((e) => /fermata/i.test(e.label))) extras.push({ label: "Pulizia Fermata", prezzo: q.fermata });
    if (typeof q.areeComuni === "number" && !extras.some((e) => /comuni/i.test(e.label))) extras.push({ label: "Aree Comuni", prezzo: q.areeComuni });
    data.extras = extras;
    data.unita = [{}];
  } else if (flow === "multi") {
    data.unita = (q.unitaDettaglio || []).map((u, i) => ({
      nome: u.nome || `Struttura ${i + 1}`,
      zona: u.zona || a.zona,
      mq: numOrUndef(u.mq),
      bagni: numOrUndef(u.bagni),
      postiLetto: numOrUndef(u.postiLetto, u.ospiti),
      prezzo: prezzoDaRange(u),
    }));
    if (!data.unita.length) data.unita = [{ prezzo: prezzoDaRange(q) }];
    data.scontoPercento = q.scontoPercento;
    if (!data.indirizzo) data.indirizzo = `${data.unita.length} strutture`;
  } else if (flow === "hotel") {
    data.unita = [{}]; // il preventivo hotel nasce dal sopralluogo: nessun numero
  } else {
    data.unita = [{
      mq: numOrUndef(q.mq, dati.mq),
      bagni: numOrUndef(q.bagni, dati.bagni),
      postiLetto: numOrUndef(q.postiLetto, dati.postiLetto, q.ospiti, dati.ospiti),
      prezzo: prezzoDaRange(q),
    }];
  }

  return generatePreventivoPdf(data);
}
