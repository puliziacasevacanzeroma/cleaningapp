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
            <img src="data:image/png;base64,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" alt="Puliziacasevacanze.it" className="pv-logo-img" />
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
            <img src="data:image/png;base64,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" alt="Puliziacasevacanze.it" className="pv-logo-img" />
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
