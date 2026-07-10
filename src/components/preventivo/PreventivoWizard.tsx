"use client";

/**
 * PreventivoWizard.tsx — Widget preventivi pubblico (/preventivo)
 * v4 — 07/07/2026:
 *  - "Più case vacanze": ciclo unità (aggiungi quante case vuoi, -5% da 2)
 *  - B&B: camere dinamiche con persone per camera (+ Aggiungi camera)
 *  - B&B: frequenza pulizia (checkout / rifacimento giornaliero)
 *  - B&B: aree comuni (no / già in loco / uscita dedicata) con mq
 *  - Case: passaggio infra-soggiorno (rifacimento letti + kit durante il soggiorno)
 * I prezzi arrivano SEMPRE dal server: qui nessun calcolo.
 */

import { useMemo, useRef, useState } from "react";

// ─────────────────────────── Tipi ───────────────────────────

type Tipo = "casa" | "case" | "bnb" | "hotel";
type Taglio = "mono" | "bilo" | "trilo" | "quadri";
type Cucina = "angolo" | "sep" | "abit";
type Esterno = "no" | "balcone" | "terrazzo" | "terrazzoGrande";
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
  ospiti: number;
}
const UNITA_VUOTA: UnitaCasa = {
  nome: "", zona: "", indirizzo: "", cap: "",
  taglio: null, mq: null, matrimoniali: 1, singoli: 0, divani: 0,
  bagni: 1, cucina: null, esterno: null, ospiti: 2,
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
};

function Icona({ nome, mini }: { nome: string; mini?: boolean }) {
  if (IMG_ICONE[nome]) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={IMG_ICONE[nome]} alt="" className={mini ? "pv-ic pv-ic-mini pv-ic-img" : "pv-ic pv-ic-img"} />
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
  icona: string; titolo: string; sotto: string; valore: number; min: number; max?: number;
  onCambia: (delta: number) => void;
}) {
  return (
    <div className="pv-contatore">
      <Icona nome={icona} />
      <div className="lab"><b>{titolo}</b><span>{sotto}</span></div>
      <div className="btns">
        <button type="button" onClick={() => onCambia(-1)} disabled={valore <= min}>−</button>
        <span className="val">{valore}</span>
        <button type="button" onClick={() => onCambia(1)} disabled={max !== undefined && valore >= max}>+</button>
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
  const [stato, setStato] = useState<Stato>(STATO_INIZIALE);
  const [idx, setIdx] = useState(0);
  const [invio, setInvio] = useState(false);
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);
  const [risposta, setRisposta] = useState<{ quote: QuoteRisposta; copertura: string; leadId: string } | null>(null);
  const [foto, setFoto] = useState<File[]>([]);
  const [fotoUnita, setFotoUnita] = useState<Record<number, File[]>>({});
  const [altraScelta, setAltraScelta] = useState<"si" | "no" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fotoUnitaIdx = useRef<number | null>(null);

  const set = <K extends keyof Stato>(k: K, v: Stato[K]) => setStato((s) => ({ ...s, [k]: v }));
  const setU = <K extends keyof UnitaCasa>(k: K, v: UnitaCasa[K]) =>
    setStato((s) => ({ ...s, unita: { ...s.unita, [k]: v } }));
  const bumpU = (campo: "matrimoniali" | "singoli" | "divani" | "bagni" | "ospiti", min: number) =>
    (d: number) => setU(campo, Math.min(20, Math.max(min, stato.unita[campo] + d)));

  const flusso = useMemo<NomeStep[]>(() => {
    if (stato.tipo === "hotel") return ["tipo", "contattiHotel", "fineHotel"];
    if (stato.tipo === "bnb")
      return ["tipo", "camere", "frequenza", "areaComune", "kit", "zona", "foto", "contatti", "risultato"];
    const loop: NomeStep[] = ["taglio", "letti", "bagni", "cucina", "esterno", "ospitiUnita"];
    const f: (NomeStep | null)[] = ["tipo", ...loop,
      stato.tipo === "case" ? "altraUnita" : null,
      "biancheria", "kit", "zona", "foto", "contatti", "risultato"];
    return f.filter(Boolean) as NomeStep[];
  }, [stato.tipo]);

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
      case "esterno": return !!u.esterno;
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

  function vaiA(nome: NomeStep) {
    const i = flusso.indexOf(nome);
    if (i >= 0) { setIdx(i); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function avanti() {
    if (!valido(step)) return;
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
  function indietro() { if (idx > 0) { setIdx(idx - 1); window.scrollTo({ top: 0, behavior: "smooth" }); } }
  function scegli<K extends keyof Stato>(campo: K, v: Stato[K], avanza: boolean) {
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

      const tutteFoto: { file: File; unita: number | null }[] =
        stato.tipo === "case"
          ? Object.entries(fotoUnita).flatMap(([i, fs]) => fs.map((file) => ({ file, unita: Number(i) })))
          : foto.map((file) => ({ file, unita: null }));
      if (tutteFoto.length > 0 && data.leadId) {
        try {
          const fd = new FormData();
          fd.append("leadId", data.leadId);
          fd.append("unita", JSON.stringify(tutteFoto.map((t) => t.unita)));
          for (const t of tutteFoto) fd.append("foto", await comprimi(t.file), t.file.name.replace(/\.(heic|heif)$/i, ".heic"));
          await fetch("/api/leads/photos", { method: "POST", body: fd });
        } catch { /* il lead è salvo */ }
      }

      setRisposta({ quote: data.quote, copertura: data.copertura ?? "in_valutazione", leadId: data.leadId });
      setIdx(flusso.length - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErroreInvio(e instanceof Error ? e.message : "Errore imprevisto: riprova tra poco.");
    } finally { setInvio(false); }
  }

  // ─────────────────────────── Steps ───────────────────────────

  function renderStep() {
    const u = stato.unita;
    const suffUnita = stato.tipo === "case" ? ` — ${stato.unita.nome.trim() || `Unit\u00e0 ${numeroUnitaCorrente}`}` : "";
    switch (step) {
      case "tipo": return (<>
        <h1>Che struttura gestisci?</h1>
        <p className="pv-sotto">Il preventivo si adatta al tuo tipo di attività.</p>
        <SceltaGriglia selezionato={stato.tipo} onSel={(v) => scegli("tipo", v, false)} opzioni={[
          { v: "casa" as Tipo, ic: "casa", t: "Casa vacanze", s: "Un appartamento in affitto breve" },
          { v: "case" as Tipo, ic: "case", t: "Più case vacanze", s: "Gestisci due o più unità" },
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
        <SceltaGriglia selezionato={u.taglio} onSel={(v) => setU("taglio", v)} opzioni={[
          { v: "mono" as Taglio, ic: "mono", t: "Monolocale", s: "Una stanza unica + bagno · fino a ~45 mq" },
          { v: "bilo" as Taglio, ic: "bilo", t: "Bilocale", s: "Camera + soggiorno · ~45–65 mq" },
          { v: "trilo" as Taglio, ic: "trilo", t: "Trilocale", s: "2 camere + soggiorno · ~65–90 mq" },
          { v: "quadri" as Taglio, ic: "quadri", t: "Quadrilocale", s: "3 camere + soggiorno · ~90–120 mq" },
        ]} />
        <CampoBox label="Metri quadri (indicativi)">
          <input type="number" inputMode="numeric" placeholder="es. 65" min={15} max={400}
            value={u.mq ?? ""} onChange={(e) => setU("mq", parseInt(e.target.value) || null)} />
        </CampoBox>
      </>);

      case "letti": return (<>
        <h1>Quanti posti letto prepariamo?{suffUnita}</h1>
        <p className="pv-sotto">Conta tutti i letti che vanno rifatti a ogni cambio ospite.</p>
        <div className="pv-contatori">
          <ContatoreRiga icona="matrimoniale" titolo="Letti matrimoniali" sotto="Compresi francesi e piazza e mezza" valore={u.matrimoniali} min={0} onCambia={bumpU("matrimoniali", 0)} />
          <ContatoreRiga icona="singolo" titolo="Letti singoli" sotto="Anche a castello: conta ogni posto" valore={u.singoli} min={0} onCambia={bumpU("singoli", 0)} />
          <ContatoreRiga icona="divano" titolo="Divani letto" sotto="Da aprire e preparare" valore={u.divani} min={0} onCambia={bumpU("divani", 0)} />
        </div>
      </>);

      case "bagni": return (<>
        <h1>Quanti bagni ci sono?{suffUnita}</h1>
        <p className="pv-sotto">Contiamo anche i bagni di servizio.</p>
        <div className="pv-contatori">
          <ContatoreRiga icona="bagno" titolo="Bagni" sotto="WC, lavandino, doccia o vasca" valore={u.bagni} min={1} onCambia={bumpU("bagni", 1)} />
        </div>
      </>);

      case "cucina": return (<>
        <h1>Com'è la cucina?{suffUnita}</h1>
        <p className="pv-sotto">Un vano in più è tempo di lavoro in più: contiamolo bene.</p>
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
        ]} />
      </>);

      case "ospitiUnita": return (<>
        <h1>Per quanti ospiti al massimo?{suffUnita}</h1>
        <p className="pv-sotto">La capienza dell'annuncio: ci serve per biancheria e kit di cortesia.</p>
        <div className="pv-contatori">
          <ContatoreRiga icona="ospiti" titolo="Ospiti massimi" sotto="La capienza di questa unità" valore={u.ospiti} min={1} onCambia={bumpU("ospiti", 1)} />
        </div>
      </>);

      case "altraUnita": {
        const tutte = [...stato.unitaCompletate, stato.unita];
        const nomi: Record<Taglio, string> = { mono: "Monolocale", bilo: "Bilocale", trilo: "Trilocale", quadri: "Quadrilocale" };
        return (<>
          <h1>Vuoi aggiungere un'altra unità?</h1>
          <p className="pv-sotto">Da 2 unità in su applichiamo il 5% di sconto sul totale pulizie.</p>
          <div className="pv-unita-lista">
            {tutte.map((un, i) => (
              <div key={i} className="pv-unita-riga">
                <span className="num">{i + 1}</span>
                <span className="desc"><b className="pv-nome-unita">{un.nome || `Unit\u00e0 ${i + 1}`}</b> — {un.taglio ? nomi[un.taglio] : "\u2014"} · {un.mq ?? "?"} mq · {un.matrimoniali + un.singoli + un.divani} letti · {un.bagni} {un.bagni === 1 ? "bagno" : "bagni"}</span>
              </div>
            ))}
          </div>
          <SceltaGriglia selezionato={altraScelta} onSel={(v) => setAltraScelta(v)} opzioni={[
            { v: "si" as "si" | "no", ic: "aggiungiUnita", t: "Sì, aggiungi unità", s: tutte.length >= MAX_UNITA ? "Limite raggiunto" : `Compila l'unità ${tutte.length + 1}` },
            { v: "no" as "si" | "no", ic: "finito", t: "Ho finito", s: `Continua con ${tutte.length} ${tutte.length === 1 ? "unità" : "unità"}` },
          ]} />
        </>);
      }

      case "biancheria": return (<>
        <h1>Vuoi anche la biancheria?</h1>
        <p className="pv-sotto">La portiamo pulita e ritiriamo la sporca: consegna inclusa.{stato.tipo === "case" ? " Vale per tutte le unità." : ""}</p>
        <SceltaGriglia selezionato={stato.vuoleBiancheria} onSel={(v) => scegli("vuoleBiancheria", v, false)} opzioni={[
          { v: true, ic: "biancheriaSi", t: "Sì, pensateci voi", s: "Lenzuola, teli e accessori a noleggio" },
          { v: false, ic: "biancheriaNo", t: "No, la gestisco io", s: "Solo il servizio di pulizia" },
        ]} />
      </>);

      case "kit": return (<>
        <h1>Kit di cortesia per gli ospiti?</h1>
        <p className="pv-sotto">Doccia-shampoo, sapone e crema corpo: il tocco da hotel che gli ospiti citano nelle recensioni.</p>
        <SceltaGriglia selezionato={stato.vuoleKit} onSel={(v) => scegli("vuoleKit", v, false)} opzioni={[
          { v: true, ic: "kitSi", t: "Sì, aggiungilo", s: "Un set completo per ogni ospite" },
          { v: false, ic: "kitNo", t: "No, grazie", s: "Magari più avanti" },
        ]} />
      </>);

      case "camere": return (<>
        <h1>Le camere della struttura</h1>
        <p className="pv-sotto">Aggiungi le camere e indica quante persone dorme ciascuna: il prezzo si adatta.</p>
        <div className="pv-contatori">
          {stato.camere.map((c, i) => (
            <div className="pv-contatore" key={i}>
              <Icona nome="camera" />
              <div className="lab">
                <b>Camera {i + 1}</b>
                <span>{c.persone === 1 ? "Singola" : c.persone === 2 ? "Doppia/Matrimoniale" : c.persone === 3 ? "Tripla" : `${c.persone} persone`}</span>
              </div>
              <div className="btns">
                <button type="button" onClick={() => cambiaPersone(i, -1)} disabled={c.persone <= 1}>−</button>
                <span className="val">{c.persone}<small className="pv-pers"> pers.</small></span>
                <button type="button" onClick={() => cambiaPersone(i, 1)} disabled={c.persone >= 6}>+</button>
                {stato.camere.length > 1 && (
                  <button type="button" className="pv-rimuovi" onClick={() => rimuoviCamera(i)} aria-label="Rimuovi camera">×</button>
                )}
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
          { v: "inloco" as AreaComune, ic: "areaInloco", t: "Quando siamo già lì", s: "Insieme alla pulizia delle camere" },
          { v: "dedicata" as AreaComune, ic: "areaDedicata", t: "Tutti i giorni", s: "Anche quando non ci sono checkout" },
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
        <p className="pv-sotto">Ogni casa può stare in una zona diversa: indicale tutte, ci servono per il giro e per confermarti la copertura.</p>
        {[...stato.unitaCompletate, stato.unita].map((x, i) => (
          <div key={i} className="pv-zona-unita">
            <div className="pv-zona-unita-nome">{x.nome.trim() || `Unit\u00e0 ${i + 1}`}</div>
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
      </>) : (<>
        <h1>Dove si trova la struttura?</h1>
        <p className="pv-sotto">Ci serve per organizzare il giro e confermarti la copertura.</p>
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
              <div className="pv-zona-unita-nome">{x.nome.trim() || `Unità ${i + 1}`}</div>
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
          <p className="pv-facoltativo">Passaggio facoltativo: puoi anche saltarlo.</p>
          {inputFile}
        </>);
        }
        return (<>
        <h1>Vuoi mostrarci la struttura? <span className="pv-facoltativo">facoltativo</span></h1>
        <p className="pv-sotto">Due o tre foto degli ambienti ci aiutano a prepararti un preventivo più preciso al sopralluogo.</p>
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
      </>);
      }

      case "contatti": return (<>
        <h1>Ultimo passo: dove ti mandiamo il preventivo?</h1>
        <p className="pv-sotto">Lo vedi subito qui e te lo inviamo anche via email.</p>
        <CampoBox label="Nome"><input value={stato.nome} autoComplete="name" placeholder="Il tuo nome" onChange={(e) => set("nome", e.target.value)} /></CampoBox>
        <CampoBox label="Email"><input type="email" value={stato.email} autoComplete="email" placeholder="nome@esempio.it" onChange={(e) => set("email", e.target.value)} /></CampoBox>
        <CampoBox label="Telefono"><input type="tel" value={stato.telefono} autoComplete="tel" placeholder="Per confermarti la disponibilità" onChange={(e) => set("telefono", e.target.value)} /></CampoBox>
        <label className="pv-consenso">
          <input type="checkbox" checked={stato.consensoNewsletter} onChange={(e) => set("consensoNewsletter", e.target.checked)} />
          <span>Voglio ricevere ogni tanto consigli utili per host e novità sul servizio. (Facoltativo: il preventivo lo ricevi comunque.)</span>
        </label>
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

  function renderRisultato() {
    if (!risposta) return null;
    const { quote: q, copertura } = risposta;
    const eur = (v: number) => "€ " + v.toFixed(2).replace(".", ",");
    const nomi: Record<Taglio, string> = { mono: "Monolocale", bilo: "Bilocale", trilo: "Trilocale", quadri: "Quadrilocale" };
    const chips: string[] = [];
    if (stato.tipo === "bnb") {
      chips.push("B&B / Affittacamere");
      chips.push(`${stato.camere.length} camere`);
      chips.push(`${stato.camere.reduce((a, c) => a + c.persone, 0)} posti letto`);
      if (stato.areaComune && stato.areaComune !== "no") chips.push("Aree comuni");
    } else if (stato.tipo === "case") {
      chips.push(`${stato.unitaCompletate.length + 1} unità`);
      if (q.scontoPercento) chips.push(`-${q.scontoPercento}% multi-unità`);
    } else {
      const u = stato.unita;
      if (u.taglio) chips.push(nomi[u.taglio] + (u.mq ? ` · ${u.mq} mq` : ""));
      const letti = u.matrimoniali + u.singoli + u.divani;
      chips.push(`${letti} ${letti === 1 ? "posto letto" : "posti letto"}`);
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
            <div className="tit">PREZZO PER SINGOLA STRUTTURA</div>
            <div className="pv-cam-grid">
              {q.unitaDettaglio.map((u, i) => (
                <div className="pv-cam-card" key={i}>
                  <div className="pv-cam-tipo">{u.nome}</div>
                  <div className="pv-cam-prezzo"><span className="da-mini">da</span><span className="euro">€</span>{u.min}</div>
                  <div className="pv-cam-sub">max € {u.max} · a cambio ospite</div>
                </div>
              ))}
            </div>
            {q.scontoPercento ? <div className="pv-sconto">sconto multi-struttura -{q.scontoPercento}% già applicato a ogni casa</div> : null}
            <div className="pv-barra-rame" />
            <div><span className="pv-stima">Ogni casa paga solo le proprie uscite — <b>nessun cumulo</b></span></div>
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
        <div className="pv-conferma">✓ Preventivo inviato a {stato.email} — ti contattiamo al più presto</div>
        <button className="pv-riparti" onClick={riparti}>Calcola un altro preventivo</button>
      </div>
    );
  }

  // ─────────────────────────── Render ───────────────────────────

  const ETICHETTE: Partial<Record<NomeStep, string>> = {
    tipo: "Struttura", taglio: "Appartamento", letti: "Posti letto", bagni: "Bagni",
    cucina: "Cucina", esterno: "Esterni", ospitiUnita: "Ospiti", altraUnita: "Altre unità",
    biancheria: "Biancheria", kit: "Kit cortesia",
    camere: "Camere", frequenza: "Frequenza", areaComune: "Aree comuni",
    zona: "Zona", foto: "Foto", contatti: "Contatti", contattiHotel: "Contatti",
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
            <img src="data:image/png;base64,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Zs6cSSQSobikhCOmH860fadlRGOWbfkDSDU3urFME9NMZUQ0nsOplDM0a82aNVx11dUAXHfddQwdOtRH+73XpVIppk8/nPfff4+ioiIKCwsB0A3DCRaUIhKJICLEu7rYe+JEANrb2zn00EOZN28e0YICCqJRn/UwcuRInnzyKX784x8zd+5c5s6dy09/+lP+9ve/kUqlEBHmzJnDnDlz/PWIx+MMHzacadOm8u67c/n3v/9DY0MDxx13HNXV1dxyyy384he/AKCmpoamxkZnYJltk7JMCgoKMEIGtm0zdtxYxo4bi23bHHnkUbzxxutEIlFKSx1OmREKEQ5H/CAlHo87wpBy1lPXnfVbtWo1P3e/81e/+hWxWAGNjY1OA766Oq699tqM7Y3H40407gqXJ2xmKuXjn94a+Sm2fkBl/dZknkCUlpZy8823EI2m2QSJRIJIJOJjddFo1BluVRB1HsIdEO9FPdm9TlOm81DX/Owatm7dwiknn8Kll13qC6SnAcORMHPnzuX9999j77335t1332X58uVMnjwZEaG4uBgRoavLiYRiBQW88frrWLbNqtWrmTdvHtOmTeO1115j8ZeLOejAgzAMg9bWVqZPn87773/A/A/nc9+99/LOO+9w6y23Mn78eJRSfP/MM7nj9ttpaWlx215ZlJSWcNhhh/HOO3N47LFHATjqqKPo6opzxx13YBgGL730Et/+9rfZe9LefL7wcwoKCohGIrS1tmFbTqT54YcfsXnzJhobG3njjdcZN3Yc8+bPZ9OmjUyYMMEfBmuLjYbmw0Te/CTTNJ31u+YaGhsbOO3U0zjv/PMAGDRoECLCuHHjePGll0ilUli2RaIryYgRI9A0jah74LzDHDz8ALFYzIn6LZv+BJfbMMALH+NqamzENE3nhgPN2crLB6CU4uOPPmL16jX8618vkEylCIVC6JpBJBJxsBo93RFb13VisRgvvvgSf//b3ykpLmbGMTN47733eO2112hsaKSwsBBd1zF0g7qNdei6TmFhIbFYjAULFzoYjmkyfvx4IpEwy5cv45VXXmXRokWceNKJfO/001m1chW6rrvar4gvv/gSTdMoLirm9dffYPDgwfz4xz/ipBNPZPbsGzAMg7bWNg466CBEhHkffMC6desYOHAgb7/9Nps2bQLgoIMORtN1Fi1ahGEYHHLwITQ2NRGPx4mEwwyuGcyGDRvYUr8FXdepGTSIkSNGEo/H+fvf/05dXR3nnncuJ5xwAnPmzEHTNMKRCEVFhSxYsCBd8CuOa2IYhq9hPGvgPMPr/OMff6esrJQTTjiBefPm8d5771FTM5jioiJWrlrFnDnvMnDgQFYsX8HHH39EQUGUiy66iO985zu0tLRgGIazzn4NqIOtLVy4kPrN9f1nnfQXwnjPdfyrKqtky5Yt7t+sjIhj/ocf+oGAh+YDEgqFpbOzU84+52wB5Nd3/lri8bhEo06UuHz5cjnqqKMy5m54/5566im58cYbBZCf/uQn8vXXS/y/DR48WIxQyA9IOjo6fJhEU0pC7t8uuOACWbRokf++QTU1ormRWk1NjSxZskSqq6sFkIkTJ8rQoUOdKPnyH0oqmZJ9993Pf29RUZEA8j+nnCIiIps2bZLKygoncBg5Utra2iQej8ukfRzIo6KiQkpLS/33v/bqa/KIG0wAUux+3v777S+fffaZaJomgFRXVYuuOz+XFJfI/PnzRdM0CYdCUltb68JHTibkvvvuy7t+jz36mMyePdv/75KSEmcNBg3y9xSQ1157XW666SY3wj7HD7i8vx94wAEiIv2KLvtcQe4BnC0tzXz55VdMnDiRk046iUgk4ieWNU1hWcKwYUMpLy9n5cpVVFZWcMcdd1BZWcmA8gF87/TvsXLlStrb25lx9AzGjx/PJ598SnV1NWecfgYbN21ERNh1113ZZRfHcR88eDDHH388mq6xoa6Ogw86iGOOPZYhQ4awZs0aBLjpxhspLS0hFotx5JFHcuqppxGPx2lqamLAgHLOOOP73HrrrQwfPpyamkEsX76CcCjETTfeSFFREYZhcPrpZ3D66adTv3kzK1etJBKJcM655zJ79mwiBVGOP/44mpub6OzspKioiFNOOYUbb7yJkpISiouLaWhoIJlMctaZZ3H4EYejazoHHnQgq1evor2tne+e/j1OPOEE2trbmDBhAmeffTaxWAGbNm0iEony7W8fxf333c+ECRMYNWoUy5YtB4TZs2czeHAN0WiUadOm0djYwMhdduHkk06mqLiIlatWkEwmOf7447EsC9u22G38bowZPZqxY8dRU1PDkUceyQUXXICuazQ3txCJRNh33/24+557mDZ1Kmtq11AzqIYf/ehH1NfXU19fz6GHHsp+++3HHnvuSW1t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" alt="Puliziacasevacanze.it" className="pv-logo-img" />
          </div>
          <div className="pv-side-claim">Il preventivo per la tua struttura, in due minuti.</div>
          <ol className="pv-steps">
            {stepsVisibili.map((s, i) => {
              const st = finale ? "done" : i < idx ? "done" : i === idx ? "cur" : "todo";
              return (
                <li key={s} className={st}>
                  <span className="dot">{st === "done" ? "✓" : i + 1}</span>
                  {ETICHETTE[s]}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="pv-trust">
          <span>✓ Sopralluogo gratuito e senza impegno</span>
          <span>✓ Operativi 365 giorni l'anno, festivi inclusi</span>
          <span>✓ Ti rispondiamo in giornata</span>
        </div>
      </aside>

      <div className="pv-main">
        <div className="pv-head">
          <div className="pv-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="data:image/png;base64,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Zs6cSSQSobikhCOmH860fadlRGOWbfkDSDU3urFME9NMZUQ0nsOplDM0a82aNVx11dUAXHfddQwdOtRH+73XpVIppk8/nPfff4+ioiIKCwsB0A3DCRaUIhKJICLEu7rYe+JEANrb2zn00EOZN28e0YICCqJRn/UwcuRInnzyKX784x8zd+5c5s6dy09/+lP+9ve/kUqlEBHmzJnDnDlz/PWIx+MMHzacadOm8u67c/n3v/9DY0MDxx13HNXV1dxyyy384he/AKCmpoamxkZnYJltk7JMCgoKMEIGtm0zdtxYxo4bi23bHHnkUbzxxutEIlFKSx1OmREKEQ5H/CAlHo87wpBy1lPXnfVbtWo1P3e/81e/+hWxWAGNjY1OA766Oq699tqM7Y3H40407gqXJ2xmKuXjn94a+Sm2fkBl/dZknkCUlpZy8823EI2m2QSJRIJIJOJjddFo1BluVRB1HsIdEO9FPdm9TlOm81DX/Owatm7dwiknn8Kll13qC6SnAcORMHPnzuX9999j77335t1332X58uVMnjwZEaG4uBgRoavLiYRiBQW88frrWLbNqtWrmTdvHtOmTeO1115j8ZeLOejAgzAMg9bWVqZPn87773/A/A/nc9+99/LOO+9w6y23Mn78eJRSfP/MM7nj9ttpaWlx215ZlJSWcNhhh/HOO3N47LFHATjqqKPo6opzxx13YBgGL730Et/+9rfZe9LefL7wcwoKCohGIrS1tmFbTqT54YcfsXnzJhobG3njjdcZN3Yc8+bPZ9OmjUyYMMEfBmuLjYbmw0Te/CTTNJ31u+YaGhsbOO3U0zjv/PMAGDRoECLCuHHjePGll0ilUli2RaIryYgRI9A0jah74LzDHDz8ALFYzIn6LZv+BJfbMMALH+NqamzENE3nhgPN2crLB6CU4uOPPmL16jX8618vkEylCIVC6JpBJBJxsBo93RFb13VisRgvvvgSf//b3ykpLmbGMTN47733eO2112hsaKSwsBBd1zF0g7qNdei6TmFhIbFYjAULFzoYjmkyfvx4IpEwy5cv45VXXmXRokWceNKJfO/001m1chW6rrvar4gvv/gSTdMoLirm9dffYPDgwfz4xz/ipBNPZPbsGzAMg7bWNg466CBEhHkffMC6desYOHAgb7/9Nps2bQLgoIMORtN1Fi1ahGEYHHLwITQ2NRGPx4mEwwyuGcyGDRvYUr8FXdepGTSIkSNGEo/H+fvf/05dXR3nnncuJ5xwAnPmzEHTNMKRCEVFhSxYsCBd8CuOa2IYhq9hPGvgPMPr/OMff6esrJQTTjiBefPm8d5771FTM5jioiJWrlrFnDnvMnDgQFYsX8HHH39EQUGUiy66iO985zu0tLRgGIazzn4NqIOtLVy4kPrN9f1nnfQXwnjPdfyrKqtky5Yt7t+sjIhj/ocf+oGAh+YDEgqFpbOzU84+52wB5Nd3/lri8bhEo06UuHz5cjnqqKMy5m54/5566im58cYbBZCf/uQn8vXXS/y/DR48WIxQyA9IOjo6fJhEU0pC7t8uuOACWbRokf++QTU1ormRWk1NjSxZskSqq6sFkIkTJ8rQoUOdKPnyH0oqmZJ9993Pf29RUZEA8j+nnCIiIps2bZLKygoncBg5Utra2iQej8ukfRzIo6KiQkpLS/33v/bqa/KIG0wAUux+3v777S+fffaZaJomgFRXVYuuOz+XFJfI/PnzRdM0CYdCUltb68JHTibkvvvuy7t+jz36mMyePdv/75KSEmcNBg3y9xSQ1157XW666SY3wj7HD7i8vx94wAEiIv2KLvtcQe4BnC0tzXz55VdMnDiRk046iUgk4ieWNU1hWcKwYUMpLy9n5cpVVFZWcMcdd1BZWcmA8gF87/TvsXLlStrb25lx9AzGjx/PJ598SnV1NWecfgYbN21ERNh1113ZZRfHcR88eDDHH388mq6xoa6Ogw86iGOOPZYhQ4awZs0aBLjpxhspLS0hFotx5JFHcuqppxGPx2lqamLAgHLOOOP73HrrrQwfPpyamkEsX76CcCjETTfeSFFREYZhcPrpZ3D66adTv3kzK1etJBKJcM655zJ79mwiBVGOP/44mpub6OzspKioiFNOOYUbb7yJkpISiouLaWhoIJlMctaZZ3H4EYejazoHHnQgq1evor2tne+e/j1OPOEE2trbmDBhAmeffTaxWAGbNm0iEony7W8fxf333c+ECRMYNWoUy5YtB4TZs2czeHAN0WiUadOm0djYwMhdduHkk06mqLiIlatWkEwmOf7447EsC9u22G38bowZPZqxY8dRU1PDkUceyQUXXICuazQ3txCJRNh33/24+557mDZ1Kmtq11AzqIYf/ehH1NfXU19fz6GHHsp+++3HHnvuSW1t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" alt="Puliziacasevacanze.it" className="pv-logo-img" />
          </div>
          <div className="pv-claim">Il preventivo per la tua struttura, in due minuti.</div>
          <div className="pv-progress"><i style={{ width: `${Math.round((idx / Math.max(1, flusso.length - 1)) * 100)}%` }} /></div>
        </div>

        <div className="pv-body">
          <div className="pv-step" key={step + numeroUnitaCorrente}>{renderStep()}</div>
        </div>

        {!finale && (
          <div className="pv-nav">
            <button className="pv-btn indietro" onClick={indietro} style={{ visibility: idx === 0 ? "hidden" : "visible" }}>← Indietro</button>
            {!nascondiAvanti && (
              <button className="pv-btn avanti" onClick={avanti} disabled={!valido(step) || invio}>{labelAvanti}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
