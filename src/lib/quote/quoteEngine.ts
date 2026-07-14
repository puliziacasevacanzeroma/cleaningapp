/**
 * quoteEngine.ts — Motore di calcolo preventivi Puliziacasevacanze.it
 *
 * v6 — 14/07/2026: MODELLO ADDITIVO. ZERO ANOMALIE PER COSTRUZIONE.
 *      Il vecchio modello era a GRADINI: il taglio cambiava base, soglia mq,
 *      letti inclusi e persino il prezzo dei correttivi, tutto insieme. Ogni
 *      gradino poteva far SCENDERE il prezzo, e dichiarare un taglio piccolo
 *      poteva costare PIU' di uno grande (bug reale: bilocale 93mq > quadrilocale 93mq).
 *
 *      Ora:
 *        prezzo = MAX( minimo , base + mq*euroMq + letti*euroLetto + bagni*euroBagno
 *                               + cucina + esterno (+ giardino a fasce) )
 *
 *      Tutte le voci sono positive e additive => il prezzo NON PUO' calare se la
 *      casa cresce, e due case identiche costano uguale QUALUNQUE taglio sia stato
 *      dichiarato (il taglio NON entra nel prezzo: e' descrittivo, serve al lead).
 *      Calibrato sulle ancore validate da Ariele il 14/07/2026 (scarto max 3,30 EUR).
 *
 *      Tagli: 'villa' => sempre su misura (scelta commerciale). Oltre mqMax (400)
 *      => su misura: lead salvato + email "ti contattiamo" (gia' gestiti a valle).
 *
 * v5/v4 — 14/07: mq nel prezzo, tagli grande/villa, giardino, tetto 400 (superati da v6).
 * v3 — 08/07: parametri INIETTABILI (EngineParams opzionale, default ENGINE).
 * v2 — 07/07: multi-unita' (-5% da 2), camere B&B a persone, aree comuni, passaggio.
 *
 * REGOLE:
 * - Modulo PURO: nessun import da Firebase/Next, nessun side effect.
 * - Ogni modifica ai parametri o alla logica richiede il rerun del selftest.
 */

// ─────────────────────────────── Tipi ───────────────────────────────

export type TipoStruttura = 'casa' | 'case' | 'bnb' | 'hotel';
export type Taglio = 'mono' | 'bilo' | 'trilo' | 'quadri' | 'grande' | 'villa';
export type TipoCucina = 'angolo' | 'sep' | 'abit';
export type TipoEsterno = 'no' | 'balcone' | 'terrazzo' | 'terrazzoGrande' | 'giardino';

export interface DatiCasa {
  /** nome dell'unità (facoltativo, usato per multi-unità: es. "Casa Trastevere") */
  nome?: string;
  /** zona dell'unità (multi: ogni casa ha la sua, usata nel PDF) */
  zona?: string;
  /** indirizzo preciso dell'unità (via e civico) */
  indirizzo?: string;
  /** DESCRITTIVO: non entra nel prezzo (v6). 'villa' => su misura. */
  taglio: Taglio;
  mq: number;
  matrimoniali: number;
  singoli: number;
  divani: number;
  bagni: number;
  cucina: TipoCucina;
  esterno: TipoEsterno;
  /** mq del giardino — usato SOLO se esterno === 'giardino' */
  giardinoMq?: number;
  vuoleBiancheria: boolean;
  vuoleKit: boolean;
  /** capienza massima annuncio — usata per set bagno e kit */
  ospiti: number;
}

export interface DatiBnb {
  singole: number;
  doppie: number;
  vuoleKit: boolean;
}

export interface QuoteResult {
  suMisura: boolean;
  /** minimo mostrato ("a partire da"), arrotondato a 5 */
  min: number;
  /** stima massima (puntuale +15%, arrotondata a 5) */
  max: number;
  /** valore puntuale interno — NON mostrare al cliente */
  puntuale: number;
  /** costo biancheria a cambio (0 se non richiesta) */
  biancheria: number;
  /** costo kit cortesia (0 se non richiesto) */
  kit: number;
  /** taglio dichiarato (v6: descrittivo, non influenza il prezzo) */
  taglioEffettivo?: string;
}

// ────────────────────── Parametri (default v6, calibrati 14/07/2026) ──────────────────────

export interface EngineParams {
  /** v6: modello additivo — nessun gradino, tutte le voci positive */
  casa: {
    base: number;        // costo di uscita, sempre presente
    euroMq: number;      // per ogni mq
    euroLetto: number;   // per ogni letto da rifare
    euroBagno: number;   // per ogni bagno
    cucinaSep: number;   // cucina separata (angolo = 0)
    cucinaAbit: number;  // cucina abitabile
    balcone: number;
    terrazzo: number;
    terrazzoGrande: number;
    minimo: number;      // prezzo minimo di uscita: sotto non si scende
  };
  giardino: { piccoloMaxMq: number; medioMaxMq: number; piccolo: number; medio: number; grande: number };
  biancheria: { matrimoniale: number; singolo: number; setOspite: number; tappetino: number; canavaccio: number };
  kitCortesia: number;
  bnb: { singola: number; doppia: number; personaExtra: number; rifacimentoLetto: number; uscita: number };
  areaComune: { sogliaMq: number; inLocoBase: number; inLocoMqExtra: number; dedicataBase: number; dedicataMqExtra: number };
  passaggio: { uscita: number; perLetto: number };
  scontoMultiUnita: { daUnita: number; percento: number };
  /** tetto del calcolo automatico (oltre: su misura + email) */
  mqMax: number;
}

export const ENGINE: EngineParams = {
  /** calibrati sulle 9 ancore validate da Ariele (scarto max 3,30 EUR) */
  casa: {
    base: 18,
    euroMq: 0.28,
    euroLetto: 2.5,
    euroBagno: 5,
    cucinaSep: 4,
    cucinaAbit: 5,
    balcone: 3,
    terrazzo: 4,
    terrazzoGrande: 7,
    minimo: 40,
  },
  giardino: { piccoloMaxMq: 20, medioMaxMq: 60, piccolo: 15, medio: 25, grande: 50 },
  biancheria: { matrimoniale: 5.60, singolo: 4.30, setOspite: 3.80, tappetino: 1.00, canavaccio: 1.50 },
  /** doccia-shampoo 0,48 + sapone mani 0,28 + body lotion 0,50 (listino OKIKO) */
  kitCortesia: 1.26,
  bnb: { singola: 25, doppia: 28, personaExtra: 3, rifacimentoLetto: 10, uscita: 10 },
  areaComune: { sogliaMq: 20, inLocoBase: 8, inLocoMqExtra: 0.5, dedicataBase: 20, dedicataMqExtra: 0.8 },
  passaggio: { uscita: 10, perLetto: 10 },
  scontoMultiUnita: { daUnita: 2, percento: 5 },
  mqMax: 400,
};

// ─────────────────────────── Helper interni ───────────────────────────

const round2 = (v: number) => Math.round(v * 100) / 100;

function range(puntuale: number): { min: number; max: number } {
  return {
    min: Math.floor(puntuale / 5) * 5,
    max: Math.round((puntuale * 1.15) / 5) * 5,
  };
}

/** Supplemento giardino a fasce. 0 se mq non validi. */
export function prezzoGiardino(giardinoMq: number, P: EngineParams = ENGINE): number {
  const g = P.giardino;
  if (!Number.isFinite(giardinoMq) || giardinoMq <= 0) return 0;
  if (giardinoMq <= g.piccoloMaxMq) return g.piccolo;
  if (giardinoMq <= g.medioMaxMq) return g.medio;
  return g.grande;
}

const RISULTATO_SU_MISURA = (taglio?: string): QuoteResult => ({
  suMisura: true, min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0,
  ...(taglio ? { taglioEffettivo: taglio } : {}),
});

// ─────────────────────────────── Calcoli ───────────────────────────────

/**
 * Prezzo pulizia di una casa (v6, additivo).
 * NB: il taglio NON compare. Due case identiche costano uguale, qualunque taglio
 * sia stato dichiarato: è questo che rende impossibili le anomalie.
 */
export function prezzoPuliziaCasa(d: DatiCasa, P: EngineParams = ENGINE): number {
  const c = P.casa;
  const letti = Math.max(0, d.matrimoniali) + Math.max(0, d.singoli) + Math.max(0, d.divani);
  let v = c.base;
  v += Math.max(0, d.mq) * c.euroMq;
  v += letti * c.euroLetto;
  v += Math.max(0, d.bagni) * c.euroBagno;
  if (d.cucina === 'sep') v += c.cucinaSep;
  if (d.cucina === 'abit') v += c.cucinaAbit;
  if (d.esterno === 'balcone') v += c.balcone;
  if (d.esterno === 'terrazzo') v += c.terrazzo;
  if (d.esterno === 'terrazzoGrande') v += c.terrazzoGrande;
  if (d.esterno === 'giardino') v += prezzoGiardino(d.giardinoMq ?? 0, P);
  return round2(Math.max(c.minimo, v));
}

export function calcolaCasa(d: DatiCasa, P: EngineParams = ENGINE): QuoteResult {
  // Villa: SEMPRE preventivo dedicato (scelta commerciale: si vede di persona).
  if (d.taglio === 'villa') return RISULTATO_SU_MISURA('villa');
  // Oltre il tetto: su misura (lead salvato + email "ti contattiamo", già gestiti a valle).
  if (d.mq > P.mqMax) return RISULTATO_SU_MISURA(d.taglio);

  const tot = prezzoPuliziaCasa(d, P);

  let biancheria = 0;
  if (d.vuoleBiancheria) {
    const b = P.biancheria;
    biancheria += d.matrimoniali * b.matrimoniale + (d.singoli + d.divani) * b.singolo;
    biancheria += d.ospiti * b.setOspite + d.bagni * b.tappetino + b.canavaccio;
  }
  const kit = d.vuoleKit ? d.ospiti * P.kitCortesia : 0;

  const { min, max } = range(tot);
  return {
    suMisura: false, min, max, puntuale: tot,
    biancheria: round2(biancheria), kit: round2(kit),
    taglioEffettivo: d.taglio,
  };
}

export function calcolaBnb(d: DatiBnb, P: EngineParams = ENGINE): QuoteResult {
  const b = P.bnb;
  const tot = d.singole * b.singola + d.doppie * b.doppia;
  const kit = d.vuoleKit ? (d.singole + d.doppie * 2) * P.kitCortesia : 0;
  const { min, max } = range(tot);
  return { suMisura: false, min, max, puntuale: tot, biancheria: 0, kit: round2(kit) };
}

// ─────────────────────────── Copertura zone ───────────────────────────

export type EsitoCopertura = 'coperta' | 'in_valutazione';

/**
 * La lista dei CAP coperti arriva da Firestore (collection `coverageZones`),
 * MAI hardcodata qui: il motore riceve la lista e risponde.
 */
export function verificaCopertura(cap: string, capCoperti: string[]): EsitoCopertura {
  return capCoperti.includes(cap.trim()) ? 'coperta' : 'in_valutazione';
}

// ────────────────── Più case vacanze (somma + sconto) ──────────────────

export interface QuoteMultiResult extends QuoteResult {
  unitaDettaglio: {
    nome: string; zona?: string; indirizzo?: string; min: number; max: number; suMisura: boolean;
    taglio: string; mq: number; bagni: number; postiLetto: number;
    matrimoniali: number; singoli: number; divani: number;
    cucina: string; esterno: string;
  }[];
  scontoPercento: number;
}

export function calcolaCase(unita: DatiCasa[], P: EngineParams = ENGINE): QuoteMultiResult {
  const dettagli = unita.map((u) => calcolaCasa(u, P));
  const vuoto = { min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0 };
  const riga = (d: QuoteResult, i: number, min: number, max: number) => ({
    nome: unita[i]?.nome || 'Casa ' + (i + 1), zona: unita[i]?.zona || '', indirizzo: unita[i]?.indirizzo || '',
    min, max, suMisura: d.suMisura,
    taglio: unita[i]?.taglio || '', mq: unita[i]?.mq || 0, bagni: unita[i]?.bagni || 0,
    postiLetto: unita[i]?.ospiti || 0,
    matrimoniali: unita[i]?.matrimoniali || 0, singoli: unita[i]?.singoli || 0, divani: unita[i]?.divani || 0,
    cucina: unita[i]?.cucina || '', esterno: unita[i]?.esterno || '',
  });

  if (dettagli.some((d) => d.suMisura) || unita.length === 0) {
    return {
      suMisura: true, ...vuoto,
      unitaDettaglio: dettagli.map((d, i) => riga(d, i, d.min, d.max)),
      scontoPercento: 0,
    };
  }
  let sommaPulizia = dettagli.reduce((a, d) => a + d.puntuale, 0);
  const sconto = unita.length >= P.scontoMultiUnita.daUnita ? P.scontoMultiUnita.percento : 0;
  if (sconto > 0) sommaPulizia = sommaPulizia * (1 - sconto / 100);
  // Lo sconto multi-casa va applicato ANCHE al prezzo mostrato per ogni singola casa:
  // il totale nel wizard non viene mai mostrato, quindi senza questo lo sconto
  // sarebbe dichiarato ma invisibile nei numeri letti dall'utente.
  const fatt = 1 - sconto / 100;
  const biancheria = round2(dettagli.reduce((a, d) => a + d.biancheria, 0));
  const kit = round2(dettagli.reduce((a, d) => a + d.kit, 0));
  const { min, max } = range(sommaPulizia);
  return {
    suMisura: false, min, max, puntuale: round2(sommaPulizia), biancheria, kit,
    unitaDettaglio: dettagli.map((d, i) => {
      const r = range(d.puntuale * fatt);
      return riga(d, i, r.min, r.max);
    }),
    scontoPercento: sconto,
  };
}

// ────────────────── B&B a camere dinamiche + extra ──────────────────

export interface CameraBnb { persone: number }
export type FrequenzaBnb = 'checkout' | 'giornaliera';
export type AreaComune = 'no' | 'inloco' | 'dedicata';

export interface DatiBnbV2 {
  camere: CameraBnb[];
  frequenza: FrequenzaBnb;
  areaComune: AreaComune;
  areaComuneMq: number;
  vuoleKit: boolean;
}

/** Prezzo camera a checkout: 1 persona 25, 2 persone 28, +3 a persona oltre la 2ª */
export function prezzoCamera(persone: number, P: EngineParams = ENGINE): number {
  const p = Math.max(1, Math.floor(persone));
  if (p === 1) return P.bnb.singola;
  return P.bnb.doppia + (p - 2) * P.bnb.personaExtra;
}

/** Area comune GIÀ in loco (aggiunta a un passaggio esistente) */
export function prezzoAreaComuneInLoco(mq: number, P: EngineParams = ENGINE): number {
  const a = P.areaComune;
  return round2(a.inLocoBase + Math.max(0, mq - a.sogliaMq) * a.inLocoMqExtra);
}
/** Area comune in USCITA DEDICATA (solo lei, senza camere) */
export function prezzoAreaComuneDedicata(mq: number, P: EngineParams = ENGINE): number {
  const a = P.areaComune;
  return round2(a.dedicataBase + Math.max(0, mq - a.sogliaMq) * a.dedicataMqExtra);
}

export interface QuoteBnbV2 extends QuoteResult {
  camereDettaglio: { persone: number; etichetta: string; prezzo: number }[];
  rifacimentoGiornaliero: number;
  rifacimentoPerCamera: number;
  rifacimentoUscita: number;
  areaComuneImporto: number;
  areaComuneTipo: AreaComune;
}

export function etichettaCamera(persone: number): string {
  if (persone <= 1) return 'Singola';
  if (persone === 2) return 'Doppia/Matrimoniale';
  if (persone === 3) return 'Tripla';
  return persone + ' persone';
}

export function calcolaBnbV2(d: DatiBnbV2, P: EngineParams = ENGINE): QuoteBnbV2 {
  const camereDettaglio = d.camere.map((c) => ({
    persone: Math.max(1, c.persone),
    etichetta: etichettaCamera(c.persone),
    prezzo: prezzoCamera(c.persone, P),
  }));
  const tot = camereDettaglio.reduce((a, c) => a + c.prezzo, 0);
  const persone = d.camere.reduce((a, c) => a + Math.max(1, c.persone), 0);
  const kit = d.vuoleKit ? round2(persone * P.kitCortesia) : 0;
  const giornaliera = d.frequenza === 'giornaliera';
  const rifacimento = giornaliera
    ? round2(P.bnb.uscita + d.camere.length * P.bnb.rifacimentoLetto)
    : 0;
  const areaComuneImporto =
    d.areaComune === 'inloco' ? prezzoAreaComuneInLoco(d.areaComuneMq, P)
    : d.areaComune === 'dedicata' ? prezzoAreaComuneDedicata(d.areaComuneMq, P)
    : 0;
  const { min, max } = range(tot);
  return {
    suMisura: false, min, max, puntuale: tot, biancheria: 0, kit,
    camereDettaglio,
    rifacimentoGiornaliero: rifacimento,
    rifacimentoPerCamera: giornaliera ? P.bnb.rifacimentoLetto : 0,
    rifacimentoUscita: giornaliera ? P.bnb.uscita : 0,
    areaComuneImporto, areaComuneTipo: d.areaComune,
  };
}

// ────────────────── Passaggio infra-soggiorno (case) ──────────────────

/** Rifacimento letti + eventuale cambio biancheria e ricarica kit DURANTE il soggiorno */
export function calcolaPassaggioSoggiorno(d: DatiCasa, P: EngineParams = ENGINE): { totale: number; uscita: number; letti: number; biancheria: number; kit: number } {
  const lettiTot = d.matrimoniali + d.singoli + d.divani;
  const uscita = P.passaggio.uscita;
  const letti = lettiTot * P.passaggio.perLetto;
  let biancheria = 0;
  if (d.vuoleBiancheria) {
    const b = P.biancheria;
    biancheria = round2(d.matrimoniali * b.matrimoniale + (d.singoli + d.divani) * b.singolo + d.ospiti * b.setOspite + d.bagni * b.tappetino + b.canavaccio);
  }
  const kit = d.vuoleKit ? round2(d.ospiti * P.kitCortesia) : 0;
  return { totale: round2(uscita + letti + biancheria + kit), uscita, letti, biancheria, kit };
}

// ─────────────────────────── Formattazione ───────────────────────────

export const formatEuro = (v: number): string =>
  '\u20ac ' + v.toFixed(2).replace('.', ',');
