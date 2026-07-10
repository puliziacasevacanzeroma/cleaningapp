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
            Puliziacasevacanze.it
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
            Puliziacasevacanze.it
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
