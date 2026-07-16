"use client";

/**
 * PreventivoWizard.tsx — Widget preventivi pubblico (/preventivo)
 * v21 — 13/07/2026: sidebar desktop 'focus' (passo corrente in grande, barra, prossimi 3, pallini);
 *                    logo bordo scuro ovunque (era tornata la variante bordo bianco)
 * v20 — 13/07/2026: preload di tutte le icone all'avvio (prima comparivano ~1s dopo la card,
 *                    perche' il PNG partiva a scaricarsi solo al mount dello step)
 * v19 — 13/07/2026: card contatori stile 'squircle' — icona 96px a sinistra, testo e stepper
 *                    a pillola sulla destra. Il suffisso ' pers.' resta SOLO sulle camere.
 * v18 — 13/07/2026: card contatori riprogettata — icona+testo in alto, contatore in basso a destra;
 *                    X di rimozione camera come badge separato (non piu' incollata al +)
 * v17 — 13/07/2026: 1 persona = nuova icona 'cameraSingola' (letto singolo, estratta lossless);
 *                    camere da 2 persone in su invariate (camera2..camera5)
 * v16 — 13/07/2026: +11 icone illustrate (foto, aree comuni, frequenza, camere 1-5);
 *                    l'icona camera cambia col numero di persone (da 5 in su resta camera5)
 * v15 — 13/07/2026: 20 icone illustrate (stile step 1) per letti, bagni, cucina, esterni, ospiti, biancheria, kit
 * v14 — 13/07/2026: scritta "Puliziacasevacanze.it" accanto al logo (bordo bianco invariato)
 * v12 — 10/07/2026: fix logo, onda inferiore completa (v11 la tagliava di 8px)
 * v11 — 10/07/2026: nuovo logo simbolo trasparente (base64 ottimizzato ~7KB, era ~85KB)
 * v4 — 07/07/2026:
 *  - "Più case vacanze": ciclo unità (aggiungi quante case vuoi, -5% da 2)
 *  - B&B: camere dinamiche con persone per camera (+ Aggiungi camera)
 *  - B&B: frequenza pulizia (checkout / rifacimento giornaliero)
 *  - B&B: aree comuni (no / già in loco / uscita dedicata) con mq
 *  - Case: passaggio infra-soggiorno (rifacimento letti + kit durante il soggiorno)
 * I prezzi arrivano SEMPRE dal server: qui nessun calcolo.
 */

import { useEffect, useMemo, useRef, useState } from "react";

// ─────────────────────────── Tipi ───────────────────────────

type Tipo = "casa" | "case" | "bnb" | "hotel";
type Taglio = "mono" | "bilo" | "trilo" | "quadri" | "grande" | "villa";
type Cucina = "angolo" | "sep" | "abit";
type Esterno = "no" | "balcone" | "terrazzo" | "terrazzoGrande" | "giardino";
type Frequenza = "checkout" | "giornaliera";
type AreaComune = "no" | "inloco" | "dedicata";

interface UnitaCasa {
  nome: string;
  zona: string;
  indirizzo: string;
  cap: string;
  taglio: Taglio | null;
  mq: number | null;
  matrimoniali: number;
  singoli: number;
  divani: number;
  bagni: number;
  cucina: Cucina | null;
  esterno: Esterno | null;
  giardinoMq: number | null;
  ospiti: number;
}
const UNITA_VUOTA: UnitaCasa = {
  nome: "", zona: "", indirizzo: "", cap: "",
  taglio: null, mq: null, matrimoniali: 1, singoli: 0, divani: 0,
  bagni: 1, cucina: null, esterno: null, giardinoMq: null, ospiti: 2,
};

interface CameraBnb { persone: number }

function raggruppaCamere(camere: { etichetta: string; prezzo: number }[]): { etichetta: string; prezzo: number; n: number }[] {
  const out: { etichetta: string; prezzo: number; n: number }[] = [];
  for (const c of camere) {
    const g = out.find((x) => x.etichetta === c.etichetta && x.prezzo === c.prezzo);
    if (g) g.n++;
    else out.push({ etichetta: c.etichetta, prezzo: c.prezzo, n: 1 });
  }
  return out;
}

interface Stato {
  tipo: Tipo | null;
  unita: UnitaCasa;              // unità in compilazione
  unitaCompletate: UnitaCasa[];  // unità già confermate (solo tipo "case")
  camere: CameraBnb[];
  frequenza: Frequenza | null;
  areaComune: AreaComune | null;
  areaComuneMq: number;
  vuoleBiancheria: boolean | null;
  vuoleKit: boolean | null;
  vuolePassaggio: boolean | null;
  zona: string; indirizzo: string; cap: string;
  nome: string; email: string; telefono: string;
  consensoNewsletter: boolean;
  nomeStruttura: string;
}

const STATO_INIZIALE: Stato = {
  tipo: null,
  unita: { ...UNITA_VUOTA },
  unitaCompletate: [],
  camere: [{ persone: 2 }],
  frequenza: null, areaComune: null, areaComuneMq: 20,
  vuoleBiancheria: null, vuoleKit: null, vuolePassaggio: null,
  zona: "", indirizzo: "", cap: "", nome: "", email: "", telefono: "",
  consensoNewsletter: false, nomeStruttura: "",
};

interface QuoteRisposta {
  suMisura: boolean; min: number; max: number;
  biancheria: number; kit: number;
  scontoPercento?: number;
  unitaDettaglio?: { nome: string; min: number; max: number }[];
  rifacimentoPerCamera?: number;
  rifacimentoUscita?: number;
  camereDettaglio?: { persone: number; etichetta: string; prezzo: number }[];
  rifacimentoGiornaliero?: number;
  areaComuneImporto?: number;
  areaComuneTipo?: AreaComune;
  passaggio?: { totale: number } | null;
}

// ─────────────────── Icone (planimetrie, stringhe SVG) ───────────────────

function lettoTop(x: number, y: number, w: number, h: number, doppio: boolean): string {
  let s = `<rect class="mob fillAcc" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
  if (doppio) {
    s += `<rect class="mob" x="${x + 2}" y="${y + 2}" width="${w / 2 - 3}" height="5" rx="1.5" fill="#fff"/>`;
    s += `<rect class="mob" x="${x + w / 2 + 1}" y="${y + 2}" width="${w / 2 - 3}" height="5" rx="1.5" fill="#fff"/>`;
  } else {
    s += `<rect class="mob" x="${x + 2}" y="${y + 2}" width="${w - 4}" height="5" rx="1.5" fill="#fff"/>`;
  }
  s += `<path class="mob" d="M${x} ${y + h - 6}h${w}"/>`;
  return s;
}
function divanoTop(x: number, y: number, w: number, h: number): string {
  return `<rect class="mob fill" x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5"/>` +
    `<path class="mob" d="M${x + 4} ${y}v${h}M${x + w - 4} ${y}v${h}M${x} ${y + 4.5}h${w}"/>`;
}
function wcTop(x: number, y: number): string {
  return `<rect class="mob" x="${x}" y="${y}" width="10" height="4"/>` +
    `<ellipse class="mob" cx="${x + 5}" cy="${y + 9.5}" rx="4" ry="5"/>`;
}
function docciaTop(x: number, y: number, l: number): string {
  return `<rect class="mob" x="${x}" y="${y}" width="${l}" height="${l}"/>` +
    `<path class="mob" d="M${x} ${y}l${l} ${l}"/><circle class="mob" cx="${x + l / 2}" cy="${y + l / 2}" r="1.4"/>`;
}
function bancone(x: number, y: number, w: number): string {
  return `<rect class="mob" x="${x}" y="${y}" width="${w}" height="9"/>` +
    `<circle class="mob acc" cx="${x + 6}" cy="${y + 4.5}" r="2.6"/>` +
    `<circle class="mob acc" cx="${x + w - 11}" cy="${y + 2.8}" r="1.5"/><circle class="mob acc" cx="${x + w - 6}" cy="${y + 2.8}" r="1.5"/>` +
    `<circle class="mob acc" cx="${x + w - 11}" cy="${y + 6.6}" r="1.5"/><circle class="mob acc" cx="${x + w - 6}" cy="${y + 6.6}" r="1.5"/>`;
}
function tavoloTop(x: number, y: number, w: number, h: number, sedie: number): string {
  let s = `<rect class="mob" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/>`;
  if (sedie >= 2) {
    s += `<rect class="mob" x="${x + w / 2 - 3}" y="${y - 6}" width="6" height="4.5" rx="1.2"/>`;
    s += `<rect class="mob" x="${x + w / 2 - 3}" y="${y + h + 1.5}" width="6" height="4.5" rx="1.2"/>`;
  }
  if (sedie >= 4) {
    s += `<rect class="mob" x="${x - 6}" y="${y + h / 2 - 3}" width="4.5" height="6" rx="1.2"/>`;
    s += `<rect class="mob" x="${x + w + 1.5}" y="${y + h / 2 - 3}" width="4.5" height="6" rx="1.2"/>`;
  }
  return s;
}
function porta(x: number, y: number, r: number, dir: "su" | "giu"): string {
  if (dir === "su") return `<path class="mob" d="M${x} ${y}V${y - r}"/><path class="mob arco" d="M${x} ${y - r}A${r} ${r} 0 0 1 ${x + r} ${y}"/>`;
  return `<path class="mob" d="M${x} ${y}V${y + r}"/><path class="mob arco" d="M${x} ${y + r}A${r} ${r} 0 0 0 ${x + r} ${y}"/>`;
}
function lettoLato(x: number, y: number, s: number, doppio: boolean): string {
  let out = `<path class="draw" d="M${x} ${y + 4 * s}V${y + 26 * s}"/>`;
  out += `<rect class="fill" x="${x}" y="${y + 14 * s}" width="${38 * s}" height="${8 * s}" rx="${3 * s}"/>`;
  out += `<path class="draw" d="M${x} ${y + 22 * s}h${38 * s}M${x + 3 * s} ${y + 22 * s}v${5 * s}M${x + 35 * s} ${y + 22 * s}v${5 * s}"/>`;
  out += `<rect class="fillAcc" x="${x + 3 * s}" y="${y + 9 * s}" width="${(doppio ? 9 : 11) * s}" height="${5 * s}" rx="${2 * s}"/>`;
  if (doppio) out += `<rect class="fillAcc" x="${x + 14 * s}" y="${y + 9 * s}" width="${9 * s}" height="${5 * s}" rx="${2 * s}"/>`;
  return out;
}
function divanoFronte(x: number, y: number, s: number): string {
  return `<path class="draw" d="M${x + 4 * s} ${y + 14 * s}v-${6 * s}a${4 * s} ${4 * s} 0 0 1 ${4 * s}-${4 * s}h${20 * s}a${4 * s} ${4 * s} 0 0 1 ${4 * s} ${4 * s}v${6 * s}"/>` +
    `<path class="draw" d="M${x} ${y + 15 * s}a${3 * s} ${3 * s} 0 0 1 ${6 * s} 0v${2 * s}h${24 * s}v-${2 * s}a${3 * s} ${3 * s} 0 0 1 ${6 * s} 0v${8 * s}H${x}zM${x + 4 * s} ${y + 23 * s}v${3 * s}M${x + 32 * s} ${y + 23 * s}v${3 * s}"/>`;
}
function pianta(x: number, y: number, s: number): string {
  return `<path class="draw accent" d="M${x + 5 * s} ${y + 10 * s}c-${4 * s}-${2 * s}-${5 * s}-${7 * s}-${2 * s}-${10 * s}c${3 * s} ${2 * s} ${4 * s} ${6 * s} ${2 * s} ${10 * s}zM${x + 5 * s} ${y + 10 * s}c${4 * s}-${2 * s} ${5 * s}-${7 * s} ${2 * s}-${10 * s}c-${3 * s} ${2 * s}-${4 * s} ${6 * s}-${2 * s} ${10 * s}z"/>` +
    `<path class="draw" d="M${x} ${y + 10 * s}h${10 * s}l-${1.5 * s} ${7 * s}h-${7 * s}z"/>`;
}

const IC: Record<string, string> = {
  casa: `<svg viewBox="0 0 110 78"><path class="draw" d="M22 36 55 12l33 24"/><path class="draw" d="M30 33v33h50V33"/>${lettoLato(38, 32, 0.85, true)}</svg>`,
  case: `<svg viewBox="0 0 110 78"><path class="draw" d="M8 34 30 18l22 16M14 31v33h32V31"/>${lettoLato(19, 34, 0.62, true)}<path class="draw accent" d="M56 34 78 18l22 16M62 31v33h32V31"/>${lettoLato(67, 34, 0.62, true)}</svg>`,
  bnb: `<svg viewBox="0 0 110 78"><rect class="draw" x="18" y="10" width="74" height="58" rx="4"/><path class="draw" d="M55 10v58M18 39h74"/>${lettoLato(24, 12, 0.55, false)}${lettoLato(61, 12, 0.55, true)}${lettoLato(24, 41, 0.55, true)}${lettoLato(61, 41, 0.55, false)}</svg>`,
  hotel: `<svg viewBox="0 0 110 78"><rect class="draw" x="30" y="8" width="50" height="60" rx="3"/><path class="draw" d="M40 18h8M62 18h8M40 30h8M62 30h8M40 42h8M62 42h8"/><path class="draw accent" d="M49 68V56h12v12M18 68h74"/></svg>`,
  mono: `<svg viewBox="0 0 110 84"><rect class="wall" x="12" y="8" width="86" height="68"/><path class="wall" d="M70 8v30M70 52v24"/>${porta(70, 52, 11, "su")}<path class="wall" d="M12 60h14"/>${porta(26, 60, 11, "giu")}${lettoTop(18, 14, 26, 20, true)}${divanoTop(20, 44, 22, 11)}${bancone(44, 63, 20)}${wcTop(78, 14)}${docciaTop(78, 36, 13)}</svg>`,
  bilo: `<svg viewBox="0 0 110 84"><rect class="wall" x="10" y="8" width="90" height="68"/><path class="wall" d="M55 8v26M55 48v28"/>${porta(55, 48, 11, "su")}<path class="wall" d="M10 62h12"/>${porta(22, 62, 10, "giu")}${lettoTop(16, 14, 30, 22, true)}${divanoTop(63, 16, 28, 11)}${tavoloTop(68, 44, 16, 10, 2)}${bancone(61, 63, 30)}</svg>`,
  trilo: `<svg viewBox="0 0 110 84"><rect class="wall" x="8" y="8" width="94" height="68"/><path class="wall" d="M8 44h20M40 44h30M82 44h20"/><path class="wall" d="M44 8v36M74 8v36"/>${porta(28, 44, 9, "giu")}${porta(70, 44, 9, "giu")}${lettoTop(13, 13, 24, 19, true)}${lettoTop(49, 13, 20, 19, false)}${divanoTop(14, 54, 26, 11)}${tavoloTop(52, 55, 16, 11, 2)}</svg>`,
  quadri: `<svg viewBox="0 0 110 84"><rect class="wall" x="8" y="6" width="94" height="72"/><path class="wall" d="M55 6v24M55 42v36M8 42h36M55 42h47"/>${porta(55, 30, 9, "giu")}${porta(44, 42, 9, "giu")}${lettoTop(13, 11, 24, 18, true)}${lettoTop(62, 11, 20, 18, false)}${lettoTop(13, 50, 20, 17, false)}${divanoTop(62, 48, 26, 10)}${tavoloTop(66, 64, 15, 9, 2)}</svg>`,
  matrimoniale: `<svg viewBox="0 0 110 78">${lettoLato(26, 18, 1.35, true)}</svg>`,
  singolo: `<svg viewBox="0 0 110 78">${lettoLato(30, 18, 1.25, false)}</svg>`,
  divano: `<svg viewBox="0 0 110 78">${divanoFronte(28, 18, 1.5)}</svg>`,
  bagno: `<svg viewBox="0 0 110 78"><rect class="draw" x="14" y="10" width="56" height="44" rx="3"/><path class="draw" d="M22 26V16a4 4 0 0 1 8 0M32 18h-12"/><path class="draw" d="M20 34h22v4a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z"/><circle class="draw accent" cx="56" cy="22" r="6"/><rect class="fillAcc" x="50" y="36" width="12" height="10" rx="2"/></svg>`,
  angolo: `<svg viewBox="0 0 110 84"><rect class="wall" x="14" y="10" width="82" height="64"/>${bancone(19, 15, 34)}${divanoTop(58, 48, 30, 12)}${tavoloTop(64, 26, 16, 10, 2)}</svg>`,
  cucinaSep: `<svg viewBox="0 0 110 84"><rect class="wall" x="24" y="8" width="62" height="68"/><path class="wall" d="M24 60v-14"/>${porta(24, 46, 12, "giu")}${bancone(30, 13, 50)}<rect class="mob" x="70" y="30" width="11" height="16" rx="1.5"/><path class="mob" d="M70 36h11"/></svg>`,
  cucinaAbit: `<svg viewBox="0 0 110 84"><rect class="wall" x="12" y="8" width="86" height="68"/><path class="wall" d="M12 58h12"/>${porta(24, 58, 10, "giu")}${bancone(17, 13, 56)}<rect class="mob" x="79" y="13" width="12" height="17" rx="1.5"/><path class="mob" d="M79 19h12"/>${tavoloTop(42, 42, 26, 14, 4)}</svg>`,
  nienteEsterno: `<svg viewBox="0 0 110 78"><rect class="draw" x="34" y="10" width="42" height="58" rx="3"/><path class="draw" d="M55 10v58M34 39h42"/><path class="draw accent" d="M42 22c4 4 4 8 0 12"/></svg>`,
  balcone: `<svg viewBox="0 0 110 78"><path class="draw" d="M12 42h86M16 42v22M32 42v22M48 42v22M64 42v22M80 42v22M94 42v22M12 64h86"/>${pianta(20, 24, 1.15)}<path class="draw accent" d="M56 42V30M48 30h16M66 42V34M78 42V34M66 34h12"/></svg>`,
  terrazzo: `<svg viewBox="0 0 110 78"><path class="draw" d="M8 64h94M12 64V48h86v16"/><path class="draw accent" d="M55 48V18M32 24c6-10 40-10 46 0zM32 24h46"/><path class="draw" d="M40 58h12M62 58h12"/><rect class="fill" x="42" y="52" width="8" height="6" rx="1.5"/><rect class="fill" x="64" y="52" width="8" height="6" rx="1.5"/></svg>`,
  terrazzoGrande: `<svg viewBox="0 0 110 78"><path class="draw" d="M6 66h98M10 66V38h90v28"/><path class="draw accent" d="M18 38V20h30v18M18 26h30"/>${divanoFronte(52, 44, 0.85)}${pianta(88, 42, 1.1)}${pianta(24, 44, 0.95)}</svg>`,
  biancheriaSi: `<svg viewBox="0 0 110 78"><rect class="fill" x="28" y="26" width="54" height="11" rx="3"/><rect class="fill" x="31" y="37" width="48" height="11" rx="3"/><rect class="fill" x="34" y="48" width="42" height="11" rx="3"/><path class="draw accent" d="M42 20c5-6 21-6 26 0"/><path class="draw accent" d="M78 56l5 5 10-11"/></svg>`,
  biancheriaNo: `<svg viewBox="0 0 110 78"><rect class="fill" x="30" y="30" width="46" height="10" rx="3"/><rect class="fill" x="33" y="40" width="40" height="10" rx="3"/><path class="draw accent" d="M76 52l12 12M88 52L76 64"/></svg>`,
  kitSi: `<svg viewBox="0 0 110 78"><rect class="draw" x="26" y="28" width="15" height="32" rx="4"/><path class="draw" d="M30 28v-6h7v6M29 40h9"/><rect class="fillAcc" x="49" y="42" width="20" height="15" rx="3"/><path class="accent" d="M54 49h10"/><circle class="draw" cx="82" cy="48" r="10"/><path class="draw" d="M77 48c2.5-3.5 7.5-3.5 10 0"/><path class="draw accent" d="M88 32l4 4 8-9"/></svg>`,
  kitNo: `<svg viewBox="0 0 110 78"><rect class="draw" x="36" y="26" width="14" height="30" rx="4"/><path class="draw" d="M40 26v-6h6v6"/><path class="draw accent" d="M62 46l12 12M74 46L62 58"/></svg>`,
  ospiti: `<svg viewBox="0 0 110 78"><circle class="draw" cx="42" cy="26" r="10"/><path class="draw" d="M24 64c0-12 8-18 18-18s18 6 18 18"/><circle class="draw accent" cx="72" cy="29" r="8"/><path class="draw accent" d="M62 64c1-10 5-15 13-15 7 0 12 4 13 13"/></svg>`,
  fotocamera: `<svg viewBox="0 0 110 78"><rect class="draw" x="18" y="22" width="74" height="44" rx="6"/><path class="draw" d="M40 22l6-8h18l6 8"/><circle class="draw accent" cx="55" cy="44" r="13"/><circle class="draw accent" cx="55" cy="44" r="6"/><circle class="draw" cx="80" cy="31" r="2"/></svg>`,
  camera: `<svg viewBox="0 0 110 78"><rect class="draw" x="16" y="8" width="78" height="56" rx="4"/><path class="wall" d="M16 64h78"/>${lettoTop(28, 16, 34, 26, true)}${porta(76, 64, 12, "su")}<circle class="mob acc" cx="82" cy="26" r="4"/></svg>`,
  aggiungiUnita: `<svg viewBox="0 0 110 78"><path class="draw" d="M10 36 30 21l20 15M16 33v28h28V33"/>${lettoLato(21, 35, 0.55, true)}<circle class="draw accent" cx="76" cy="40" r="18"/><path class="draw accent" d="M76 31v18M67 40h18"/></svg>`,
  finito: `<svg viewBox="0 0 110 78"><path class="draw" d="M22 36 55 12l33 24M30 33v31h50V33"/><path class="draw accent" d="M42 46l9 9 18-20"/></svg>`,
  checkout: `<svg viewBox="0 0 110 78"><rect class="draw" x="24" y="26" width="46" height="34" rx="5"/><path class="draw" d="M36 26v-7a6 6 0 0 1 6-6h10a6 6 0 0 1 6 6v7M32 60v5M62 60v5"/><path class="draw accent" d="M78 38h16m0 0-6-6m6 6-6 6"/></svg>`,
  giornaliera: `<svg viewBox="0 0 110 78"><rect class="draw" x="26" y="14" width="58" height="52" rx="5"/><path class="draw" d="M26 28h58M40 14v-6M70 14v-6"/><path class="draw accent" d="M40 44l8 8 16-16"/><circle class="mob acc" cx="70" cy="54" r="2"/></svg>`,
  areaNo: `<svg viewBox="0 0 110 78"><rect class="draw" x="26" y="14" width="58" height="50" rx="4"/><path class="draw" d="M26 40h58"/><path class="draw accent" d="M46 50l18 0"/></svg>`,
  areaInloco: `<svg viewBox="0 0 110 84"><rect class="wall" x="10" y="10" width="90" height="62"/><path class="wall" d="M52 10v26M52 50v22"/>${porta(52, 50, 10, "su")}${lettoTop(17, 16, 26, 20, true)}${divanoTop(60, 20, 30, 11)}${tavoloTop(64, 46, 18, 11, 4)}<path class="draw accent" d="M20 62l6 6 10-12"/></svg>`,
  areaDedicata: `<svg viewBox="0 0 110 78"><rect class="draw" x="34" y="18" width="56" height="42" rx="4"/>${divanoTop(42, 26, 26, 10)}${tavoloTop(46, 44, 16, 9, 2)}<path class="draw accent" d="M8 40h18m0 0-6-6m6 6-6 6"/></svg>`,
  passaggioSi: `<svg viewBox="0 0 110 78">${lettoLato(16, 16, 1.1, true)}<path class="draw accent" d="M72 28a14 14 0 1 1-4 20M72 28v-9m0 9h9"/></svg>`,
  passaggioNo: `<svg viewBox="0 0 110 78">${lettoLato(24, 16, 1.15, true)}<path class="draw accent" d="M74 44l14 14M88 44L74 58"/></svg>`,
};

// Icone "tipo struttura": immagini reali (non ridisegnate), stile duotone elegante.
const IMG_ICONE: Record<string, string> = {
  casa: "/preventivo-icone/casa.png",
  case: "/preventivo-icone/case.png",
  bnb: "/preventivo-icone/bnb.png",
  hotel: "/preventivo-icone/hotel.png",
  mono: "/preventivo-icone/mono.png",
  bilo: "/preventivo-icone/bilo.png",
  trilo: "/preventivo-icone/trilo.png",
  quadri: "/preventivo-icone/quadri.png",
  casaGrande: "/preventivo-icone/casaGrande.png",
  villa: "/preventivo-icone/villa.png",
  matrimoniale: "/preventivo-icone/matrimoniale.png",
  singolo: "/preventivo-icone/singolo.png",
  divano: "/preventivo-icone/divano.png",
  bagno: "/preventivo-icone/bagno.png",
  angolo: "/preventivo-icone/angolo.png",
  cucinaSep: "/preventivo-icone/cucinaSep.png",
  cucinaAbit: "/preventivo-icone/cucinaAbit.png",
  nienteEsterno: "/preventivo-icone/nienteEsterno.png",
  balcone: "/preventivo-icone/balcone.png",
  terrazzo: "/preventivo-icone/terrazzo.png",
  terrazzoGrande: "/preventivo-icone/terrazzoGrande.png",
  giardino: "/preventivo-icone/giardino.png",
  ospiti: "/preventivo-icone/ospiti.png",
  biancheriaSi: "/preventivo-icone/biancheriaSi.png",
  biancheriaNo: "/preventivo-icone/biancheriaNo.png",
  kitSi: "/preventivo-icone/kitSi.png",
  kitNo: "/preventivo-icone/kitNo.png",
  fotocamera: "/preventivo-icone/fotocamera.png",
  areaNo: "/preventivo-icone/areaNo.png",
  areaInloco: "/preventivo-icone/areaInloco.png",
  areaDedicata: "/preventivo-icone/areaDedicata.png",
  checkout: "/preventivo-icone/checkout.png",
  giornaliera: "/preventivo-icone/giornaliera.png",
  // camere: l'illustrazione cambia col numero di persone (1..5); da 5 in su resta camera5
  cameraSingola: "/preventivo-icone/cameraSingola.png",
  camera1: "/preventivo-icone/camera1.png",
  camera2: "/preventivo-icone/camera2.png",
  camera3: "/preventivo-icone/camera3.png",
  camera4: "/preventivo-icone/camera4.png",
  camera5: "/preventivo-icone/camera5.png",
};

// Camere: 1 persona = letto singolo (icona dedicata); da 2 in su le illustrazioni storiche.
// Da 5 persone in su resta sempre camera5.
const IC_CAMERA: Record<number, string> = {
  1: "cameraSingola",
  2: "camera2",
  3: "camera3",
  4: "camera4",
  5: "camera5",
};

function Icona({ nome, mini }: { nome: string; mini?: boolean }) {
  if (IMG_ICONE[nome]) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={IMG_ICONE[nome]} alt="" loading="eager" decoding="sync" fetchPriority="high"
        className={mini ? "pv-ic pv-ic-mini pv-ic-img" : "pv-ic pv-ic-img"} />
    );
  }
  return (
    <span className={mini ? "pv-ic pv-ic-mini" : "pv-ic"}
      dangerouslySetInnerHTML={{ __html: IC[nome] ?? "" }} />
  );
}

// ─── Componenti stabili (fuori dal componente: il focus resta) ───

function CampoBox({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="pv-campo"><label>{label}</label>{children}</div>;
}

function SceltaGriglia<T,>({ opzioni, selezionato, onSel }: {
  opzioni: { v: T; ic: string; t: string; s?: string }[];
  selezionato: T | null;
  onSel: (v: T) => void;
}) {
  return (
    <div className="pv-scelte">
      {opzioni.map((o) => (
        <div key={String(o.v)} className={"pv-scelta" + (selezionato === o.v ? " sel" : "")} onClick={() => onSel(o.v)}>
          <Icona nome={o.ic} />
          <b>{o.t}</b>
          {o.s && <span>{o.s}</span>}
        </div>
      ))}
    </div>
  );
}

function ContatoreRiga({ icona, titolo, sotto, valore, min, max, onCambia }: {
  icona: string; titolo: string; sotto?: string; valore: number; min: number; max?: number;
  onCambia: (delta: number) => void;
}) {
  return (
    <div className="pv-contatore">
      <Icona nome={icona} />
      <div className="pv-cont-body">
        <div className="lab"><b>{titolo}</b>{sotto ? <span>{sotto}</span> : null}</div>
        <div className="btns">
          <button type="button" onClick={() => onCambia(-1)} disabled={valore <= min}>−</button>
          <span className="val">{valore}</span>
          <button type="button" onClick={() => onCambia(1)} disabled={max !== undefined && valore >= max}>+</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Componente ───────────────────────────

type NomeStep =
  | "tipo" | "taglio" | "letti" | "bagni" | "cucina" | "esterno" | "ospitiUnita" | "altraUnita"
  | "biancheria" | "kit"
  | "camere" | "frequenza" | "areaComune"
  | "zona" | "foto" | "contatti" | "contattiHotel" | "risultato" | "fineHotel";

const MAX_FOTO = 10;
const MAX_UNITA = 8;
const MAX_CAMERE = 15;

export function PreventivoWizard() {
  // Preload icone: senza questo ogni PNG partiva a scaricarsi solo quando lo step
  // veniva montato, e l'icona compariva ~1s dopo la card. Qui le scarichiamo tutte
  // subito, in background, mentre l'utente compila i primi step.
  useEffect(() => {
    const imgs = Object.values(IMG_ICONE).map((src) => {
      const im = new Image();
      im.decoding = "sync";
      im.src = src;
      return im;
    });
    return () => { imgs.forEach((im) => { im.src = ""; }); };
  }, []);

  const [stato, setStato] = useState<Stato>(STATO_INIZIALE);
  const [idx, setIdx] = useState(0);
  const [invio, setInvio] = useState(false);
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);
  const [risposta, setRisposta] = useState<{ quote: QuoteRisposta; copertura: string; leadId: string } | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [confermaPrezzo, setConfermaPrezzo] = useState<"no" | "invio" | "fatto">("no");
  const [foto, setFoto] = useState<File[]>([]);
  const [fotoUnita, setFotoUnita] = useState<Record<number, File[]>>({});
  const [altraScelta, setAltraScelta] = useState<"si" | "no" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fotoUnitaIdx = useRef<number | null>(null);
  const mqInput = useRef<HTMLInputElement>(null);
  const [manca, setManca] = useState<string | null>(null);

  const set = <K extends keyof Stato>(k: K, v: Stato[K]) => setStato((s) => ({ ...s, [k]: v }));
  const setU = <K extends keyof UnitaCasa>(k: K, v: UnitaCasa[K]) =>
    setStato((s) => ({ ...s, unita: { ...s.unita, [k]: v } }));
  const bumpU = (campo: "matrimoniali" | "singoli" | "divani" | "bagni" | "ospiti", min: number) =>
    (d: number) => setU(campo, Math.min(20, Math.max(min, stato.unita[campo] + d)));

  const flusso = useMemo<NomeStep[]>(() => {
    if (stato.tipo === "hotel") return ["tipo", "contattiHotel", "fineHotel"];
    // Villa (solo casa singola): come l'hotel, preventivo dedicato. Percorso corto:
    // taglio (per i mq) → zona (per capire dov'è) → contatti → schermata "su misura".
    if (stato.tipo === "casa" && stato.unita.taglio === "villa")
      return ["tipo", "taglio", "zona", "contatti", "risultato"];
    if (stato.tipo === "bnb")
      return ["tipo", "camere", "frequenza", "areaComune", "kit", "zona", "foto", "contatti", "risultato"];
    const loop: NomeStep[] = ["taglio", "letti", "bagni", "cucina", "esterno", "ospitiUnita"];
    const f: (NomeStep | null)[] = ["tipo", ...loop,
      stato.tipo === "case" ? "altraUnita" : null,
      "biancheria", "kit", "zona", "foto", "contatti", "risultato"];
    return f.filter(Boolean) as NomeStep[];
  }, [stato.tipo, stato.unita.taglio]);

  const step = flusso[idx] ?? "tipo";
  const finale = step === "risultato" || step === "fineHotel";
  const numeroUnitaCorrente = stato.unitaCompletate.length + 1;

  function valido(nome: NomeStep): boolean {
    const u = stato.unita;
    switch (nome) {
      case "tipo": return !!stato.tipo;
      case "taglio": return !!u.taglio && !!u.mq && (stato.tipo !== "case" || u.nome.trim().length > 1);
      case "letti": return u.matrimoniali + u.singoli + u.divani > 0;
      case "cucina": return !!u.cucina;
      case "esterno": return !!u.esterno && (u.esterno !== "giardino" || (u.giardinoMq ?? 0) >= 1);
      case "camere": return stato.camere.length > 0;
      case "frequenza": return stato.frequenza !== null;
      case "areaComune": return stato.areaComune !== null && (stato.areaComune === "no" || stato.areaComuneMq >= 1);
      case "biancheria": return stato.vuoleBiancheria !== null;
      case "kit": return stato.vuoleKit !== null;
      case "altraUnita": return altraScelta !== null;
      case "zona":
        if (stato.tipo === "case") {
          return [...stato.unitaCompletate, stato.unita].every(
            (x) => x.zona.trim().length > 1 && x.indirizzo.trim().length > 3 && x.cap.length === 5
          );
        }
        return stato.zona.trim().length > 1 && stato.indirizzo.trim().length > 3 && stato.cap.length === 5;
      case "contatti":
      case "contattiHotel":
        return stato.nome.trim().length > 1 && /.+@.+\..+/.test(stato.email) && stato.telefono.trim().length >= 8;
      default: return true;
    }
  }

  function cosaManca(nome: NomeStep): string {
    const u = stato.unita;
    switch (nome) {
      case "tipo": return "Scegli il tipo di struttura.";
      case "taglio":
        if (stato.tipo === "case" && u.nome.trim().length <= 1) return "Dai un nome alla casa.";
        if (!u.taglio) return "Scegli il taglio dell'appartamento.";
        return "Inserisci i metri quadri (il campo \u00e8 qui sotto).";
      case "letti": return "Aggiungi almeno un letto.";
      case "cucina": return "Scegli il tipo di cucina.";
      case "esterno":
        if (!u.esterno) return "Scegli una delle opzioni.";
        return "Indica i metri quadri del giardino.";
      case "camere": return "Aggiungi almeno una camera.";
      case "frequenza": return "Scegli quando puliamo.";
      case "areaComune": return stato.areaComune ? "Indica i metri quadri dell'area comune." : "Scegli una delle opzioni.";
      case "biancheria": case "kit": return "Scegli s\u00ec o no per continuare.";
      case "altraUnita": return "Scegli se aggiungere un'altra casa.";
      case "zona": return "Completa zona, indirizzo e CAP (5 cifre).";
      case "contatti": case "contattiHotel": return "Controlla nome, email e telefono (min. 8 cifre).";
      default: return "Completa questo passaggio per continuare.";
    }
  }

  function vaiA(nome: NomeStep) {
    const i = flusso.indexOf(nome);
    if (i >= 0) { setIdx(i); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function avanti() {
    if (!valido(step)) {
      setManca(cosaManca(step));
      if (step === "taglio" && stato.unita.taglio && !stato.unita.mq) {
        mqInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        mqInput.current?.classList.add("pv-flash");
        setTimeout(() => mqInput.current?.classList.remove("pv-flash"), 1200);
        try { mqInput.current?.focus({ preventScroll: true }); } catch { /* best effort */ }
      }
      return;
    }
    setManca(null);
    if (step === "altraUnita") {
      if (altraScelta === "si") { setAltraScelta(null); aggiungiAltraUnita(); return; }
      setAltraScelta(null);
      setIdx((i) => Math.min(i + 1, flusso.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const prossimo = flusso[idx + 1];
    if (prossimo === "risultato" || prossimo === "fineHotel") { void submit(); return; }
    if (idx < flusso.length - 1) { setIdx(idx + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function indietro() { setManca(null); if (idx > 0) { setIdx(idx - 1); window.scrollTo({ top: 0, behavior: "smooth" }); } }
  function scegli<K extends keyof Stato>(campo: K, v: Stato[K], avanza: boolean) {
    setManca(null);
    set(campo, v);
    if (avanza) setTimeout(() => { setIdx((i) => Math.min(i + 1, flusso.length - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }, 240);
  }
  function riparti() {
    setStato(STATO_INIZIALE); setIdx(0); setRisposta(null); setFoto([]); setFotoUnita({}); setAltraScelta(null); setErroreInvio(null);
  }

  // ── Unità multiple ──
  function setUnitaZona(indice: number, campo: "zona" | "indirizzo" | "cap", valore: string) {
    const v = campo === "cap" ? valore.replace(/[^0-9]/g, "").slice(0, 5) : valore;
    setStato((s) => {
      const tot = s.unitaCompletate.length;
      if (indice < tot) {
        const arr = s.unitaCompletate.map((x, i) => (i === indice ? { ...x, [campo]: v } : x));
        return { ...s, unitaCompletate: arr };
      }
      return { ...s, unita: { ...s.unita, [campo]: v } };
    });
  }
  function aggiungiAltraUnita() {
    setStato((s) => ({ ...s, unitaCompletate: [...s.unitaCompletate, s.unita], unita: { ...UNITA_VUOTA } }));
    vaiA("taglio");
  }

  // ── Camere B&B ──
  function cambiaPersone(i: number, delta: number) {
    setStato((s) => ({
      ...s,
      camere: s.camere.map((c, j) => (j === i ? { persone: Math.min(6, Math.max(1, c.persone + delta)) } : c)),
    }));
  }
  function aggiungiCamera() {
    setStato((s) => (s.camere.length >= MAX_CAMERE ? s : { ...s, camere: [...s.camere, { persone: 2 }] }));
  }
  function rimuoviCamera(i: number) {
    setStato((s) => (s.camere.length <= 1 ? s : { ...s, camere: s.camere.filter((_, j) => j !== i) }));
  }

  // ── Foto ──
  async function comprimi(file: File): Promise<Blob> {
    const isHeic = /\.heic$|\.heif$/i.test(file.name) || /heic|heif/i.test(file.type);
    if (isHeic) return file;
    try {
      const bmp = await createImageBitmap(file);
      const MAX = 1600;
      const scala = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scala);
      canvas.height = Math.round(bmp.height * scala);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.8));
    } catch { return file; }
  }
  function aggiungiFoto(files: FileList | null) {
    if (!files) return;
    const nuove = Array.from(files).filter((f) => f.size <= 15 * 1024 * 1024);
    if (stato.tipo === "case" && fotoUnitaIdx.current !== null) {
      const i = fotoUnitaIdx.current;
      setFotoUnita((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), ...nuove].slice(0, MAX_FOTO) }));
    } else {
      setFoto((prev) => [...prev, ...nuove].slice(0, MAX_FOTO));
    }
  }

  // ── Invio ──
  async function submit() {
    setInvio(true); setErroreInvio(null);
    try {
      const unitaPayload = (u: UnitaCasa) => ({
        nome: u.nome, zona: u.zona, indirizzo: u.indirizzo, cap: u.cap, taglio: u.taglio, mq: u.mq,
        matrimoniali: u.matrimoniali, singoli: u.singoli, divani: u.divani,
        bagni: u.bagni, cucina: u.cucina, esterno: u.esterno,
        giardinoMq: u.esterno === "giardino" ? (u.giardinoMq ?? 0) : 0,
        vuoleBiancheria: stato.vuoleBiancheria === true,
        vuoleKit: stato.vuoleKit === true,
        ospiti: u.ospiti,
      });
      const body: Record<string, unknown> = {
        tipo: stato.tipo,
        zona: stato.tipo === "hotel" ? stato.nomeStruttura
          : stato.tipo === "case" ? `${stato.unitaCompletate.length + 1} strutture` + (stato.unitaCompletate[0]?.zona || stato.unita.zona ? " \u00b7 " + (stato.unitaCompletate[0]?.zona || stato.unita.zona) : "")
          : stato.zona,
        cap: stato.tipo === "hotel" ? "00100"
          : stato.tipo === "case" ? (stato.unitaCompletate[0]?.cap || stato.unita.cap || stato.cap)
          : stato.cap,
        indirizzo: stato.tipo === "case" ? (stato.unitaCompletate[0]?.indirizzo || stato.unita.indirizzo || "") : stato.indirizzo,
        nome: stato.nome, email: stato.email, telefono: stato.telefono,
        consensoNewsletter: stato.consensoNewsletter,
        nomeStruttura: stato.nomeStruttura,
      };
      if (stato.tipo === "casa") {
        body.casa = unitaPayload(stato.unita);
        body.passaggioSoggiorno = stato.vuolePassaggio === true;
      } else if (stato.tipo === "case") {
        body.unita = [...stato.unitaCompletate, stato.unita].map(unitaPayload);
        body.passaggioSoggiorno = stato.vuolePassaggio === true;
      } else if (stato.tipo === "bnb") {
        body.bnbV2 = {
          camere: stato.camere,
          frequenza: stato.frequenza,
          areaComune: stato.areaComune,
          areaComuneMq: stato.areaComune === "no" ? 0 : stato.areaComuneMq,
          vuoleKit: stato.vuoleKit === true,
        };
      }

      const res = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.errore || "Errore invio");

      // PREZZO SUBITO: la schermata risultato appare appena il server risponde.
      setRisposta({ quote: data.quote, copertura: data.copertura ?? "in_valutazione", leadId: data.leadId });
      setConfirmToken(typeof data.confirmToken === "string" ? data.confirmToken : null);
      setIdx(flusso.length - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });

      // FOTO IN BACKGROUND: compressione e upload proseguono mentre l'utente legge il
      // prezzo (con 4-5 foto da telefono erano anche 8-10 secondi di attesa a vuoto).
      // Il lead è già salvo: se l'upload fallisce o l'utente chiude subito la pagina,
      // perdiamo solo le foto, mai il preventivo.
      const tutteFoto: { file: File; unita: number | null }[] =
        stato.tipo === "case"
          ? Object.entries(fotoUnita).flatMap(([i, fs]) => fs.map((file) => ({ file, unita: Number(i) })))
          : foto.map((file) => ({ file, unita: null }));
      if (tutteFoto.length > 0 && data.leadId) {
        void (async () => {
          try {
            const fd = new FormData();
            fd.append("leadId", data.leadId);
            fd.append("unita", JSON.stringify(tutteFoto.map((t) => t.unita)));
            for (const t of tutteFoto) fd.append("foto", await comprimi(t.file), t.file.name.replace(/\.(heic|heif)$/i, ".heic"));
            await fetch("/api/leads/photos", { method: "POST", body: fd });
          } catch { /* il lead è salvo */ }
        })();
      }
    } catch (e) {
      setErroreInvio(e instanceof Error ? e.message : "Errore imprevisto: riprova tra poco.");
    } finally { setInvio(false); }
  }

  // ─────────────────────────── Steps ───────────────────────────

  function renderStep() {
    const u = stato.unita;
    const suffUnita = stato.tipo === "case" ? ` — ${stato.unita.nome.trim() || `Casa ${numeroUnitaCorrente}`}` : "";
    switch (step) {
      case "tipo": return (<>
        <h1>Che struttura gestisci?</h1>
        <p className="pv-sotto">Il preventivo si adatta al tuo tipo di attività.</p>
        <SceltaGriglia selezionato={stato.tipo} onSel={(v) => scegli("tipo", v, false)} opzioni={[
          { v: "casa" as Tipo, ic: "casa", t: "Casa vacanze", s: "Un appartamento in affitto breve" },
          { v: "case" as Tipo, ic: "case", t: "Più case vacanze", s: "Gestisci due o più case" },
          { v: "bnb" as Tipo, ic: "bnb", t: "B&B / Affittacamere", s: "Camere con ospiti in rotazione" },
          { v: "hotel" as Tipo, ic: "hotel", t: "Hotel", s: "Struttura alberghiera" },
        ]} />
      </>);

      case "taglio": return (<>
        <h1>Com'è fatto l'appartamento?{suffUnita}</h1>
        <p className="pv-sotto">Scegli il taglio e indica i metri quadri.</p>
        {stato.tipo === "case" && (
          <CampoBox label={`Nome della casa (per riconoscerla nel preventivo)`}>
            <input placeholder={`es. Casa Trastevere, Appartamento Prati…`} maxLength={60}
              value={u.nome} onChange={(e) => setU("nome", e.target.value)} />
          </CampoBox>
        )}
        <SceltaGriglia selezionato={u.taglio} onSel={(v) => {
          setU("taglio", v);
          if (!u.mq) setTimeout(() => {
            mqInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            try { mqInput.current?.focus({ preventScroll: true }); } catch { /* best effort */ }
          }, 260);
        }} opzioni={[
          { v: "mono" as Taglio, ic: "mono", t: "Monolocale", s: "Una stanza unica + bagno" },
          { v: "bilo" as Taglio, ic: "bilo", t: "Bilocale", s: "Camera + soggiorno" },
          { v: "trilo" as Taglio, ic: "trilo", t: "Trilocale", s: "2 camere + soggiorno" },
          { v: "quadri" as Taglio, ic: "quadri", t: "Quadrilocale", s: "3 camere + soggiorno" },
          { v: "grande" as Taglio, ic: "casaGrande", t: "Casa grande", s: "4 o più camere" },
          ...(stato.tipo === "casa" ? [{ v: "villa" as Taglio, ic: "villa", t: "Villa", s: "Casa indipendente con esterni" }] : []),
        ]} />
        <CampoBox label="Metri quadri (indicativi)">
          <input ref={mqInput} type="number" inputMode="numeric" placeholder="es. 65" min={15} max={2000}
            value={u.mq ?? ""} onChange={(e) => { setU("mq", parseInt(e.target.value) || null); setManca(null); }} />
        </CampoBox>
        <p className="pv-nota-campo">{u.taglio === "villa" ? "Per le ville prepariamo sempre un preventivo dedicato: bastano i contatti." : "I metri quadri contano nel prezzo: indicali il più precisi possibile. Fino a 400 mq calcoliamo online, oltre prepariamo un preventivo su misura."}</p>
      </>);

      case "letti": return (<>
        <h1>Quanti letti ci sono?{suffUnita}</h1>
        <p className="pv-sotto">Conta tutti i letti che vanno rifatti a ogni cambio ospite.</p>
        <div className="pv-contatori">
          <ContatoreRiga icona="matrimoniale" titolo="Letti matrimoniali" sotto="Compresi francesi e piazza e mezza" valore={u.matrimoniali} min={0} onCambia={bumpU("matrimoniali", 0)} />
          <ContatoreRiga icona="singolo" titolo="Letti singoli" sotto="Anche a castello: conta ogni letto" valore={u.singoli} min={0} onCambia={bumpU("singoli", 0)} />
          <ContatoreRiga icona="divano" titolo="Divani letto" sotto="Da aprire e preparare" valore={u.divani} min={0} onCambia={bumpU("divani", 0)} />
        </div>
      </>);

      case "bagni": return (<>
        <h1>Quanti bagni ci sono?{suffUnita}</h1>
        <p className="pv-sotto">Contali tutti, anche quelli piccoli.</p>
        <div className="pv-contatori">
          <ContatoreRiga icona="bagno" titolo="Bagni" sotto="Anche il bagno di servizio o il secondo WC" valore={u.bagni} min={1} onCambia={bumpU("bagni", 1)} />
        </div>
      </>);

      case "cucina": return (<>
        <h1>Com'è la cucina?{suffUnita}</h1>
        <p className="pv-sotto">La cucina è la stanza che porta via più tempo.</p>
        <SceltaGriglia selezionato={u.cucina} onSel={(v) => setU("cucina", v)} opzioni={[
          { v: "angolo" as Cucina, ic: "angolo", t: "Angolo cottura", s: "Fornelli e divano nella stessa stanza" },
          { v: "sep" as Cucina, ic: "cucinaSep", t: "Cucina separata", s: "Una stanza a parte con fornelli e frigo" },
          { v: "abit" as Cucina, ic: "cucinaAbit", t: "Cucina abitabile", s: "Grande: fornelli, frigo e tavolo da pranzo" },
        ]} />
      </>);

      case "esterno": return (<>
        <h1>Spazi esterni da pulire?{suffUnita}</h1>
        <p className="pv-sotto">Conta solo se c'è arredo di cui prenderci cura.</p>
        <SceltaGriglia selezionato={u.esterno} onSel={(v) => setU("esterno", v)} opzioni={[
          { v: "no" as Esterno, ic: "nienteEsterno", t: "Nessuno", s: "Solo finestre o un piccolo affaccio" },
          { v: "balcone" as Esterno, ic: "balcone", t: "Balcone arredato", s: "Ringhiera con tavolino, sedie o piante" },
          { v: "terrazzo" as Esterno, ic: "terrazzo", t: "Terrazzo", s: "Ombrellone e tavolo per mangiare fuori" },
          { v: "terrazzoGrande" as Esterno, ic: "terrazzoGrande", t: "Grande terrazzo", s: "Salottino esterno, più zone arredate" },
          { v: "giardino" as Esterno, ic: "giardino", t: "Giardino", s: "Prato e verde di cui prenderci cura" },
        ]} />
        {u.esterno === "giardino" && (
          <CampoBox label="Metri quadri del giardino (indicativi)">
            <input type="number" inputMode="numeric" placeholder="es. 30" min={1} max={5000}
              value={u.giardinoMq ?? ""} onChange={(e) => setU("giardinoMq", parseInt(e.target.value) || null)} />
          </CampoBox>
        )}
      </>);

      case "ospitiUnita": return (<>
        <h1>Per quanti ospiti al massimo?{suffUnita}</h1>
        <p className="pv-sotto">La capienza dell'annuncio: ci serve per biancheria e kit di cortesia.</p>
        <div className="pv-contatori">
          <ContatoreRiga icona="ospiti" titolo="Ospiti massimi" valore={u.ospiti} min={1} onCambia={bumpU("ospiti", 1)} />
        </div>
      </>);

      case "altraUnita": {
        const tutte = [...stato.unitaCompletate, stato.unita];
        const nomi: Record<Taglio, string> = { mono: "Monolocale", bilo: "Bilocale", trilo: "Trilocale", quadri: "Quadrilocale", grande: "Casa grande", villa: "Villa" };
        return (<>
          <h1>Vuoi aggiungere un'altra casa?</h1>
          <p className="pv-sotto">Da 2 case in su, -5% sul prezzo di ogni pulizia.</p>
          <div className="pv-unita-lista">
            {tutte.map((un, i) => (
              <div key={i} className="pv-unita-riga">
                <span className="num">{i + 1}</span>
                <span className="desc"><b className="pv-nome-unita">{un.nome || `Casa ${i + 1}`}</b> — {un.taglio ? nomi[un.taglio] : "\u2014"} · {un.mq ?? "?"} mq · {un.matrimoniali + un.singoli + un.divani} letti · {un.bagni} {un.bagni === 1 ? "bagno" : "bagni"}</span>
              </div>
            ))}
          </div>
          <SceltaGriglia selezionato={altraScelta} onSel={(v) => setAltraScelta(v)} opzioni={[
            { v: "si" as "si" | "no", ic: "aggiungiUnita", t: "Sì, aggiungi casa", s: tutte.length >= MAX_UNITA ? "Limite raggiunto" : `Compila la casa ${tutte.length + 1}` },
            { v: "no" as "si" | "no", ic: "finito", t: "Ho finito", s: `Continua con ${tutte.length} ${tutte.length === 1 ? "casa" : "case"}` },
          ]} />
        </>);
      }

      case "biancheria": return (<>
        <h1>Vuoi anche la biancheria?</h1>
        <p className="pv-sotto">La portiamo pulita e ritiriamo la sporca: consegna inclusa.{stato.tipo === "case" ? " Vale per tutte le case." : ""}</p>
        <SceltaGriglia selezionato={stato.vuoleBiancheria} onSel={(v) => scegli("vuoleBiancheria", v, false)} opzioni={[
          { v: true, ic: "biancheriaSi", t: "Sì, pensateci voi", s: "Lenzuola, teli e accessori a noleggio" },
          { v: false, ic: "biancheriaNo", t: "No, la gestisco io", s: "Solo il servizio di pulizia" },
        ]} />
      </>);

      case "kit": return (<>
        <h1>Kit di cortesia per gli ospiti?</h1>
        <p className="pv-sotto">Bagnoschiuma, shampoo e sapone: il dettaglio che gli ospiti notano.</p>
        <SceltaGriglia selezionato={stato.vuoleKit} onSel={(v) => scegli("vuoleKit", v, false)} opzioni={[
          { v: true, ic: "kitSi", t: "Sì, aggiungilo", s: "Un set completo per ogni ospite" },
          { v: false, ic: "kitNo", t: "No, grazie", s: "Magari più avanti" },
        ]} />
      </>);

      case "camere": return (<>
        <h1>Quante camere ha la struttura?</h1>
        <p className="pv-sotto">Aggiungi le camere e indica quante persone ospita ciascuna: il prezzo si adatta.</p>
        <div className="pv-contatori">
          {stato.camere.map((c, i) => (
            <div className="pv-contatore" key={i}>
              {stato.camere.length > 1 && (
                <button type="button" className="pv-rimuovi" onClick={() => rimuoviCamera(i)} aria-label="Rimuovi camera">×</button>
              )}
              <Icona nome={IC_CAMERA[Math.min(c.persone, 5)]} />
              <div className="pv-cont-body">
                <div className="lab">
                  <b>Camera {i + 1}</b>
                  <span>{c.persone === 1 ? "Singola" : c.persone === 2 ? "Doppia/Matrimoniale" : c.persone === 3 ? "Tripla" : `${c.persone} persone`}</span>
                </div>
                <div className="btns">
                  <button type="button" onClick={() => cambiaPersone(i, -1)} disabled={c.persone <= 1}>−</button>
                  <span className="val">{c.persone}<small className="pv-pers"> pers.</small></span>
                  <button type="button" onClick={() => cambiaPersone(i, 1)} disabled={c.persone >= 6}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="pv-aggiungi" onClick={aggiungiCamera} disabled={stato.camere.length >= MAX_CAMERE}>
          + Aggiungi camera
        </button>
      </>);

      case "frequenza": return (<>
        <h1>Quando puliamo le camere?</h1>
        <p className="pv-sotto">Il rifacimento giornaliero comprende letti e riordino durante il soggiorno degli ospiti.</p>
        <SceltaGriglia selezionato={stato.frequenza} onSel={(v) => scegli("frequenza", v, false)} opzioni={[
          { v: "checkout" as Frequenza, ic: "checkout", t: "Solo al checkout", s: "Pulizia completa a ogni cambio ospite" },
          { v: "giornaliera" as Frequenza, ic: "giornaliera", t: "Anche giornaliera", s: "Rifacimento letti ogni giorno durante il soggiorno" },
        ]} />
      </>);

      case "areaComune": return (<>
        <h1>Ci sono aree comuni da pulire?</h1>
        <p className="pv-sotto">Sala colazione, corridoi, reception: dicci quando vanno pulite.</p>
        <SceltaGriglia selezionato={stato.areaComune} onSel={(v) => set("areaComune", v)} opzioni={[
          { v: "no" as AreaComune, ic: "areaNo", t: "No", s: "Nessuna area comune" },
          { v: "inloco" as AreaComune, ic: "areaInloco", t: "Sì, quando siete già lì", s: "Insieme alla pulizia delle camere" },
          { v: "dedicata" as AreaComune, ic: "areaDedicata", t: "Sì, tutti i giorni", s: "Anche quando non ci sono checkout" },
        ]} />
        {stato.areaComune && stato.areaComune !== "no" && (
          <CampoBox label="Metri quadri dell'area comune (indicativi)">
            <input type="number" inputMode="numeric" placeholder="es. 25" min={1} max={500}
              value={stato.areaComuneMq || ""} onChange={(e) => set("areaComuneMq", parseInt(e.target.value) || 0)} />
          </CampoBox>
        )}
      </>);

      case "zona": return stato.tipo === "case" ? (<>
        <h1>Dove si trovano le tue case?</h1>
        <p className="pv-sotto">Ogni casa può stare in una zona diversa: indicale tutte. Ci servono per organizzare i percorsi dei nostri operatori e confermarti la copertura.</p>
        {[...stato.unitaCompletate, stato.unita].map((x, i) => (
          <div key={i} className="pv-zona-unita">
            <div className="pv-zona-unita-nome">{x.nome.trim() || `Casa ${i + 1}`}</div>
            <CampoBox label="Quartiere / zona">
              <input placeholder="es. Trastevere, Prati, Aurelio…" value={x.zona}
                onChange={(e) => setUnitaZona(i, "zona", e.target.value)} />
            </CampoBox>
            <CampoBox label="Indirizzo preciso">
              <input placeholder="es. Via Garibaldi 12, int. 3" value={x.indirizzo}
                onChange={(e) => setUnitaZona(i, "indirizzo", e.target.value)} />
            </CampoBox>
            <CampoBox label="CAP">
              <input placeholder="es. 00165" maxLength={5} inputMode="numeric" value={x.cap}
                onChange={(e) => setUnitaZona(i, "cap", e.target.value)} />
            </CampoBox>
          </div>
        ))}
        <p className="pv-nota-campo">Ci serve solo per verificare che la zona rientri nei nostri percorsi. Non passiamo senza avvisarti.</p>
      </>) : (<>
        <h1>Dove si trova la struttura?</h1>
        <p className="pv-sotto">Ci serve per organizzare i percorsi dei nostri operatori e confermarti la copertura.</p>
        <CampoBox label="Quartiere / zona">
          <input placeholder="es. Trastevere, Prati, Aurelio…" value={stato.zona} onChange={(e) => set("zona", e.target.value)} />
        </CampoBox>
        <CampoBox label="Indirizzo preciso">
          <input placeholder="es. Via Garibaldi 12, int. 3" value={stato.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
        </CampoBox>
        <CampoBox label="CAP">
          <input placeholder="es. 00165" maxLength={5} inputMode="numeric" value={stato.cap}
            onChange={(e) => set("cap", e.target.value.replace(/[^0-9]/g, ""))} />
        </CampoBox>
        <p className="pv-nota-campo">Ci serve solo per verificare che la zona rientri nei nostri percorsi. Non passiamo senza avvisarti.</p>
      </>);

      case "foto": {
        const inputFile = (
          <input ref={fileInput} type="file" accept="image/*,.heic,.heif" multiple hidden
            onChange={(e) => { aggiungiFoto(e.target.files); e.target.value = ""; }} />
        );
        if (stato.tipo === "case") {
        const caseTutte = [...stato.unitaCompletate, stato.unita];
        return (<>
          <h1>Qualche foto delle tue case?</h1>
          <p className="pv-sotto">Carica le foto separatamente per ogni casa: così sappiamo a quale appartamento si riferiscono.</p>
          {caseTutte.map((x, i) => (
            <div key={i} className="pv-zona-unita">
              <div className="pv-zona-unita-nome">{x.nome.trim() || `Casa ${i + 1}`}</div>
              <div className="pv-foto-zona" onClick={() => { fotoUnitaIdx.current = i; fileInput.current?.click(); }}>
                <Icona nome="fotocamera" />
                <b>Tocca per aggiungere foto</b>
                <span>fino a {MAX_FOTO} immagini per casa · anche da iPhone (HEIC)</span>
              </div>
              {(fotoUnita[i]?.length ?? 0) > 0 && (
                <div className="pv-foto-griglia">
                  {fotoUnita[i]!.map((f, j) => (
                    <div key={j} className="pv-foto-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(f)} alt="" />
                      <button type="button" onClick={() => setFotoUnita((p) => ({ ...p, [i]: p[i]!.filter((_, k) => k !== j) }))}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <p className="pv-facoltativo">Passaggio facoltativo.</p>
        <button type="button" className="pv-salta" onClick={avanti}>Salta questo passaggio</button>
          {inputFile}
        </>);
        }
        return (<>
        <h1>Vuoi mostrarci la struttura? <span className="pv-facoltativo">facoltativo</span></h1>
        <p className="pv-sotto">Due o tre foto degli ambienti ci aiutano ad arrivare al sopralluogo già preparati.</p>
        <div className="pv-foto-zona" onClick={() => fileInput.current?.click()}>
          <Icona nome="fotocamera" />
          <b>Tocca per aggiungere foto</b>
          <span>fino a {MAX_FOTO} immagini · anche da iPhone (HEIC)</span>
        </div>
        {inputFile}
        {foto.length > 0 && (
          <div className="pv-foto-griglia">
            {foto.map((f, i) => (
              <div key={i} className="pv-foto-thumb">
                {/\.(heic|heif)$/i.test(f.name)
                  ? <span className="heic">HEIC</span>
                  : <img src={URL.createObjectURL(f)} alt="" />}
                <button type="button" onClick={() => setFoto(foto.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="pv-salta" onClick={avanti}>Salta questo passaggio</button>
      </>);
      }

      case "contatti": return (<>
        <h1>Ultimo passo: dove ti mandiamo il preventivo?</h1>
        <p className="pv-sotto">Lo vedi subito qui e te lo inviamo anche via email.</p>
        <CampoBox label="Nome"><input value={stato.nome} autoComplete="name" placeholder="Il tuo nome" onChange={(e) => set("nome", e.target.value)} /></CampoBox>
        <CampoBox label="Email"><input type="email" value={stato.email} autoComplete="email" placeholder="nome@esempio.it" onChange={(e) => set("email", e.target.value)} /></CampoBox>
        <CampoBox label="Telefono"><input type="tel" value={stato.telefono} autoComplete="tel" placeholder="es. 333 1234567" onChange={(e) => set("telefono", e.target.value)} /></CampoBox>
        <p className="pv-nota-campo">Lo usiamo solo per confermarti la disponibilità.</p>
        <label className="pv-consenso">
          <input type="checkbox" checked={stato.consensoNewsletter} onChange={(e) => set("consensoNewsletter", e.target.checked)} />
          <span>Voglio ricevere ogni tanto consigli utili per host e novità sul servizio. (Facoltativo: il preventivo lo ricevi comunque.)</span>
        </label>
        <p className="pv-privacy">Compilando accetti che usiamo i tuoi dati per prepararti il preventivo e ricontattarti. Non li cediamo a nessuno.</p>
        {erroreInvio && <div className="pv-errore">{erroreInvio}</div>}
      </>);

      case "contattiHotel": return (<>
        <h1>Per gli hotel prepariamo un'offerta su misura.</h1>
        <p className="pv-sotto">Troppi fattori per un calcolo automatico onesto: lasciaci i contatti e ti richiamiamo entro 24 ore.</p>
        <CampoBox label="Nome struttura"><input value={stato.nomeStruttura} placeholder="Nome dell'hotel" onChange={(e) => set("nomeStruttura", e.target.value)} /></CampoBox>
        <CampoBox label="Nome referente"><input value={stato.nome} onChange={(e) => set("nome", e.target.value)} /></CampoBox>
        <CampoBox label="Email"><input type="email" value={stato.email} onChange={(e) => set("email", e.target.value)} /></CampoBox>
        <CampoBox label="Telefono"><input type="tel" value={stato.telefono} onChange={(e) => set("telefono", e.target.value)} /></CampoBox>
        {erroreInvio && <div className="pv-errore">{erroreInvio}</div>}
      </>);

      case "risultato": return renderRisultato();
      case "fineHotel": return (
        <div className="pv-ris">
          <span className="pv-etich">RICHIESTA INVIATA</span>
          <h1 style={{ marginBottom: 8 }}>Grazie {stato.nome}!</h1>
          <p className="pv-sotto">Un nostro referente ti contatta entro 24 ore per costruire l'offerta per la tua struttura.</p>
          <div className="pv-conferma">✓ Richiesta registrata</div>
          <button className="pv-riparti" onClick={riparti}>Torna all'inizio</button>
        </div>
      );
    }
  }

  async function confermaIlPrezzo() {
    if (!confirmToken || confermaPrezzo !== "no") return;
    setConfermaPrezzo("invio");
    try {
      const res = await fetch("/api/leads/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: confirmToken }),
      });
      const data = await res.json();
      if (data.ok) setConfermaPrezzo("fatto");
      else setConfermaPrezzo("no");
    } catch {
      setConfermaPrezzo("no");
    }
  }

  function renderRisultato() {
    if (!risposta) return null;
    const { quote: q, copertura } = risposta;
    const eur = (v: number) => "€ " + v.toFixed(2).replace(".", ",");
    const nomi: Record<Taglio, string> = { mono: "Monolocale", bilo: "Bilocale", trilo: "Trilocale", quadri: "Quadrilocale", grande: "Casa grande", villa: "Villa" };
    const chips: string[] = [];
    if (stato.tipo === "bnb") {
      chips.push("B&B / Affittacamere");
      chips.push(`${stato.camere.length} camere`);
      chips.push(`${stato.camere.reduce((a, c) => a + c.persone, 0)} posti letto`);
      if (stato.areaComune && stato.areaComune !== "no") chips.push("Aree comuni");
    } else if (stato.tipo === "case") {
      chips.push(`${stato.unitaCompletate.length + 1} case`);
      if (q.scontoPercento) chips.push(`-${q.scontoPercento}% multi-casa`);
    } else {
      const u = stato.unita;
      if (u.taglio) chips.push(nomi[u.taglio] + (u.mq ? ` · ${u.mq} mq` : ""));
      chips.push(`${u.ospiti} ${u.ospiti === 1 ? "posto letto" : "posti letto"}`);
      chips.push(`${u.bagni} ${u.bagni === 1 ? "bagno" : "bagni"}`);
    }
    if (stato.zona) chips.push(stato.zona);

    if (q.suMisura) {
      return (
        <div className="pv-ris">
          <span className="pv-etich">SU MISURA</span>
          <h1 style={{ marginBottom: 8 }}>La tua struttura merita un preventivo dedicato.</h1>
          <p className="pv-sotto">Preferiamo vedere gli spazi e costruire l'offerta con te: ti ricontattiamo entro 24 ore.</p>
          <div className="pv-chips">{chips.map((c) => <span key={c} className="pv-chip">{c}</span>)}</div>
          <div className="pv-conferma">✓ Richiesta registrata — ti scriviamo a {stato.email}</div>
          <button className="pv-riparti" onClick={riparti}>Calcola un altro preventivo</button>
        </div>
      );
    }

    const inclusi = stato.tipo === "bnb"
      ? ["Pulizia completa delle camere a ogni checkout", "Prodotti per la pulizia inclusi", "Coordinamento con i tuoi check-in, 365 giorni l'anno", "Referente dedicato sempre raggiungibile"]
      : ["Pulizia di stanze, bagni e cucina", ...(q.biancheria ? ["Consegna biancheria pulita e ritiro della sporca"] : []), "Prodotti per la pulizia inclusi", "2 rotoli di carta igienica per bagno e un cioccolatino per ospite", "Controllo di luci, acqua calda e clima a ogni intervento", "Coordinamento con i tuoi check-in, 365 giorni l'anno"];

    return (
      <div className="pv-ris">
        <span className="pv-etich">IL TUO PREVENTIVO</span>
        <div className="pv-chips">{chips.map((c) => <span key={c} className="pv-chip">{c}</span>)}</div>

        {stato.tipo === "bnb" && q.camereDettaglio && q.camereDettaglio.length > 0 ? (
          <div className="pv-pannello">
            <div className="tit">PREZZO PER SINGOLA CAMERA</div>
            <div className="pv-cam-grid">
              {raggruppaCamere(q.camereDettaglio).map((g, i) => (
                <div className="pv-cam-card" key={i}>
                  {g.n > 1 && <span className="pv-cam-x">×{g.n}</span>}
                  <div className="pv-cam-tipo">{g.etichetta}</div>
                  <div className="pv-cam-prezzo"><span className="euro">€</span>{g.prezzo}</div>
                  <div className="pv-cam-sub">a checkout</div>
                </div>
              ))}
            </div>
            <div className="pv-barra-rame" />
            <div><span className="pv-stima">Paghi solo le camere effettivamente pulite — <b>nessun costo fisso</b></span></div>
            <div className="sub">prezzo definitivo confermato al sopralluogo gratuito</div>
          </div>
        ) : stato.tipo === "case" && q.unitaDettaglio && q.unitaDettaglio.length > 0 ? (
          <div className="pv-pannello">
            <div className="tit">PREZZO PER SINGOLA CASA</div>
            <div className="pv-cam-grid">
              {q.unitaDettaglio.map((u, i) => (
                <div className="pv-cam-card" key={i}>
                  <div className="pv-cam-tipo">{u.nome}</div>
                  <div className="pv-cam-prezzo"><span className="da-mini">da</span><span className="euro">€</span>{u.min}</div>
                  <div className="pv-cam-sub">max € {u.max} · a cambio ospite</div>
                </div>
              ))}
            </div>
            {q.scontoPercento ? <div className="pv-sconto">sconto multi-casa -{q.scontoPercento}% già applicato a ogni casa</div> : null}
            <div className="pv-barra-rame" />
            <div><span className="pv-stima">Nessun canone fisso: <b>paghi solo quando si pulisce</b></span></div>
            <div className="sub">prezzo definitivo confermato al sopralluogo gratuito</div>
          </div>
        ) : (
          <div className="pv-pannello">
            <div className="tit">PULIZIA A OGNI CAMBIO OSPITE</div>
            <div className="da">a partire da</div>
            <div className="pv-forbice"><span className="euro">€</span><span>{q.min}</span></div>
            <div className="pv-barra-rame" />
            <div><span className="pv-stima">stima massima <b>€ {q.max}</b></span></div>
            <div className="sub">prezzo definitivo confermato al sopralluogo gratuito</div>
          </div>
        )}

        <div className="pv-righe">
          {stato.tipo !== "bnb" && stato.tipo !== "case" && (
            <div className="pv-riga"><Icona nome="casa" mini /><div className="txt">Pulizia completa<small>a ogni cambio ospite</small></div><b>da € {q.min}</b></div>
          )}
          {q.biancheria > 0 && <div className="pv-riga"><Icona nome="biancheriaSi" mini /><div className="txt">Biancheria a noleggio<small>consegna e ritiro inclusi</small></div><b>+ {eur(q.biancheria)}</b></div>}
          {q.kit > 0 && <div className="pv-riga"><Icona nome="kitSi" mini /><div className="txt">Kit di cortesia<small>un set per ogni ospite</small></div><b>+ {eur(q.kit)}</b></div>}
          {q.rifacimentoPerCamera ? <div className="pv-riga"><Icona nome="giornaliera" mini /><div className="txt">Rifacimento letti giornaliero<small>+ € {q.rifacimentoUscita ?? 0} di uscita, durante il soggiorno</small></div><b>€ {q.rifacimentoPerCamera} <small style={{ fontWeight: 600, color: "var(--grigio)" }}>/camera</small></b></div> : null}
          {q.areaComuneImporto ? <div className="pv-riga"><Icona nome="areaDedicata" mini /><div className="txt">Aree comuni<small>{q.areaComuneTipo === "dedicata" ? "a uscita dedicata" : "quando siamo già in struttura"}</small></div><b>{eur(q.areaComuneImporto)}</b></div> : null}
          {q.passaggio ? <div className="pv-riga"><Icona nome="passaggioSi" mini /><div className="txt">Servizio durante il soggiorno<small>a passaggio: letti, biancheria e kit</small></div><b>{eur(q.passaggio.totale)}</b></div> : null}
        </div>

        <div className="pv-incluso">
          <h3>SEMPRE COMPRESO NEL SERVIZIO</h3>
          <ul>{inclusi.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>

        {copertura !== "coperta" && (
          <div className="pv-avviso">
            <b>Un'ultima verifica per la tua zona.</b> {stato.zona || "La tua zona"} è fuori dal nostro giro abituale: un referente controlla i nostri percorsi e ti conferma disponibilità e prezzo entro 24 ore.
          </div>
        )}

        <p className="pv-nota">Prezzi al netto di IVA. Il preventivo definitivo te lo confermiamo dopo un sopralluogo gratuito e senza impegno: prima di iniziare firmiamo insieme condizioni e costi, nessuna sorpresa.</p>
        {!q.suMisura && confirmToken && (
          confermaPrezzo === "fatto" ? (
            <div className="pv-accetta fatto">
              <b>✓ Prezzo confermato!</b>
              <span>Ti ricontattiamo noi entro 24 ore per organizzare il sopralluogo gratuito e iniziare.</span>
            </div>
          ) : (
            <div className="pv-accetta">
              <button type="button" className="pv-btn-accetta" disabled={confermaPrezzo === "invio"} onClick={() => void confermaIlPrezzo()}>
                {confermaPrezzo === "invio" ? "Un attimo…" : "✓ Confermo il prezzo — richiamatemi"}
              </button>
              <span>Nessun pagamento, nessun vincolo: confermi il prezzo e ti ricontattiamo noi per iniziare. Puoi farlo anche più tardi dal link nella mail.</span>
            </div>
          )
        )}
        <div className="pv-conferma">✓ Preventivo inviato a {stato.email} — ti contattiamo al più presto</div>
        <button className="pv-riparti" onClick={riparti}>Calcola un altro preventivo</button>
      </div>
    );
  }

  // ─────────────────────────── Render ───────────────────────────

  const ETICHETTE: Partial<Record<NomeStep, string>> = {
    tipo: "Struttura", taglio: "Appartamento", letti: "Posti letto", bagni: "Bagni",
    cucina: "Cucina", esterno: "Esterni", ospitiUnita: "Ospiti", altraUnita: "Altre case",
    biancheria: "Biancheria", kit: "Kit cortesia",
    camere: "Camere", frequenza: "Frequenza", areaComune: "Aree comuni",
    zona: "Zona", foto: "Foto", contatti: "Contatti", contattiHotel: "Contatti",
  };
  const SOTTO_SIDEBAR: Partial<Record<NomeStep, string>> = {
    tipo: "Il preventivo si adatta al tuo tipo di attivit\u00e0.",
    taglio: "Scegli il taglio e indica i metri quadri.",
    letti: "Conta tutti i letti che vanno rifatti a ogni cambio ospite.",
    bagni: "Contali tutti, anche quelli piccoli.",
    cucina: "La cucina \u00e8 la stanza che porta via pi\u00f9 tempo.",
    esterno: "Balconi e terrazzi da tenere in ordine.",
    ospitiUnita: "Quante persone pu\u00f2 ospitare la casa.",
    altraUnita: "Gestisci pi\u00f9 case? Aggiungile qui.",
    biancheria: "Lenzuola e teli, li portiamo noi.",
    kit: "Il dettaglio che gli ospiti notano.",
    camere: "Aggiungi le camere della struttura.",
    frequenza: "Quando vuoi che puliamo.",
    areaComune: "Sala colazione, corridoi, reception.",
    zona: "Dove si trova la struttura.",
    foto: "Qualche foto per un preventivo pi\u00f9 preciso.",
    contatti: "Come possiamo ricontattarti.",
    contattiHotel: "Come possiamo ricontattarti.",
  };
  const stepsVisibili = flusso.filter((s) => s !== "risultato" && s !== "fineHotel");
  const prossimo = flusso[idx + 1];
  const labelAvanti = invio ? "Invio in corso…"
    : prossimo === "risultato" ? "Vedi il preventivo →"
    : prossimo === "fineHotel" ? "Invia richiesta →"
    : "Avanti →";
  const nascondiAvanti = false;

  return (
    <div className="pv-widget">
      <aside className="pv-side">
        <div className="pv-side-top">
          <div className="pv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEKCAMAAACfVphsAAACf1BMVEUvZxcUFyCWHB5FoB8AKmoAdP9cPRdJQTFhX19/gIRgfLGMl6/nvsH816YSIyEUMlkAVaoFSKE8hR9/gH6dcxWAfXwAAP8AVQAAf38pRXpVAABAPUNVVQD1QT/5naAAAAD8/PwEOYXzIyn8qxUCAgMFNXcIQpH+tBjzHSUHJlEEFzICLHFPuCIBAAABAQEAAAAAAAEBAAABAADt6+0SFBD8tSdnZ2iztLVYWFjzFRzX19areBR4eHeoqaotVphUxCOUlZXNIydUdqzN1+f3rCEEHUJvExWHh4koGQenudWPpsouCQjWlhbIx8dODA392I4zIgyyHCE3NzeQGBr8ymr85bL0CxdTNwxKqCJqRgy8ISQoKChrh7eGWhDa4+9GaaX9xFUALYFIRkf2Z2pSExP1NDi3w9iUZRL5p6n768t7l8H4iIv619eEm8OuGh26gxXEiRb3lJb1R0r8vEf7xsf98tgiTJABDiEAFSz/whl7VA/2VVj6t7d7fIHJHCQ7Y6O3yOLxOUH73qQADigRIjZFKwp4krz3XWP+wSU6YZ3CzeP3dHj80XkA//9eYWFDmB1HmSJY0SSbsND83uATKAmCgX6jbhLpnA4GFxAVNAoAPHgxW6RdYF9EZZ1bgblkDhEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABireP6AAAAoHRSTlP9Bf7+BgL9/////////+r/A//+//7/AQMC/wP/A///AP/+/v78/v7+/v7+/v5OLq/Rj2///v7///////7////+//7////+/P/8///8/v/9//3+//3////9//3+///9/////////f///v////////7+/v////////0M//3////+/////9T//f////////8B//7+/v///P/+/gv/BP/////+w5y2hQAAHetJREFUeNrtnYl/20S+wNWFBfa+3/1eJFuHLdXyncZp4rZ20iZp0jQ3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" alt="" className="pv-logo-img" />
            <span className="pv-brand-nome">Puliziacasevacanze.it<small>In due minuti sai quanto costa. Nessuna attesa, nessuna telefonata.</small></span>
          </div>
        </div>

        <div className="pv-side-focus">
          {(() => {
            const tot = stepsVisibili.length;
            const pos = Math.min(idx, tot - 1);
            const fatti = finale ? tot : pos;
            const pct = Math.round((fatti / tot) * 100);
            const prossimi = stepsVisibili.slice(pos + 1, pos + 4);
            return (<>
              <span className="pv-side-pill">PASSO {pos + 1} DI {tot}</span>
              <div className="pv-side-big">{ETICHETTE[stepsVisibili[pos]]}</div>
              <p className="pv-side-bigsub">{SOTTO_SIDEBAR[stepsVisibili[pos]] ?? ""}</p>
              <div className="pv-side-barra"><i style={{ width: `${Math.max(4, pct)}%` }} /></div>
              <div className="pv-side-conta">{fatti} completat{fatti === 1 ? "o" : "i"} &middot; {tot - fatti} rimast{tot - fatti === 1 ? "o" : "i"}</div>
              {prossimi.length > 0 && (
                <div className="pv-side-poi">
                  <div className="lab">A seguire</div>
                  <ul>
                    {prossimi.map((s, j) => (
                      <li key={s}><span className="d">{pos + 2 + j}</span>{ETICHETTE[s]}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pv-side-punti">
                {stepsVisibili.map((s, j) => (
                  <span key={s} className={finale || j < pos ? "ok" : j === pos ? "now" : ""} />
                ))}
              </div>
            </>);
          })()}
        </div>

        <div className="pv-trust">
          <span>Sopralluogo gratuito e senza impegno</span>
          <span>Operativi 365 giorni l'anno, festivi inclusi</span>
          <span>Ti rispondiamo in giornata</span>
        </div>
      </aside>

      <div className="pv-main">
        <div className="pv-head">
          <div className="pv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEKCAMAAACfVphsAAACf1BMVEUvZxcUFyCWHB5FoB8AKmoAdP9cPRdJQTFhX19/gIRgfLGMl6/nvsH816YSIyEUMlkAVaoFSKE8hR9/gH6dcxWAfXwAAP8AVQAAf38pRXpVAABAPUNVVQD1QT/5naAAAAD8/PwEOYXzIyn8qxUCAgMFNXcIQpH+tBjzHSUHJlEEFzICLHFPuCIBAAABAQEAAAAAAAEBAAABAADt6+0SFBD8tSdnZ2iztLVYWFjzFRzX19areBR4eHeoqaotVphUxCOUlZXNIydUdqzN1+f3rCEEHUJvExWHh4koGQenudWPpsouCQjWlhbIx8dODA392I4zIgyyHCE3NzeQGBr8ymr85bL0CxdTNwxKqCJqRgy8ISQoKChrh7eGWhDa4+9GaaX9xFUALYFIRkf2Z2pSExP1NDi3w9iUZRL5p6n768t7l8H4iIv619eEm8OuGh26gxXEiRb3lJb1R0r8vEf7xsf98tgiTJABDiEAFSz/whl7VA/2VVj6t7d7fIHJHCQ7Y6O3yOLxOUH73qQADigRIjZFKwp4krz3XWP+wSU6YZ3CzeP3dHj80XkA//9eYWFDmB1HmSJY0SSbsND83uATKAmCgX6jbhLpnA4GFxAVNAoAPHgxW6RdYF9EZZ1bgblkDhEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABireP6AAAAoHRSTlP9Bf7+BgL9/////////+r/A//+//7/AQMC/wP/A///AP/+/v78/v7+/v7+/v5OLq/Rj2///v7///////7////+//7////+/P/8///8/v/9//3+//3////9//3+///9/////////f///v////////7+/v////////0M//3////+/////9T//f////////8B//7+/v///P/+/gv/BP/////+w5y2hQAAHetJREFUeNrtnYl/20S+wNWFBfa+3/1eJFuHLdXyncZp4rZ20iZp0jQ3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" alt="" className="pv-logo-img" /><span className="pv-brand-nome">Puliziacasevacanze.it<small>In due minuti sai quanto costa</small></span>
          </div>
          <div className="pv-progress"><i style={{ width: `${Math.round((idx / Math.max(1, flusso.length - 1)) * 100)}%` }} /></div>
        </div>

        <div className="pv-body">
          <div className="pv-step" key={step + numeroUnitaCorrente}>{renderStep()}</div>
        </div>

        {!finale && (
          <>
            {manca && <div className="pv-manca" role="alert">{manca}</div>}
            <div className="pv-nav">
              <button className="pv-btn indietro" onClick={indietro} style={{ visibility: idx === 0 ? "hidden" : "visible" }}>← Indietro</button>
              {!nascondiAvanti && (
                <button
                  className={"pv-btn avanti" + (!valido(step) ? " bloccato" : "")}
                  onClick={avanti}
                  disabled={invio}
                  aria-disabled={!valido(step)}
                >{labelAvanti}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
