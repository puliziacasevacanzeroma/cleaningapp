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
