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
