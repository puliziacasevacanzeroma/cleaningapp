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
