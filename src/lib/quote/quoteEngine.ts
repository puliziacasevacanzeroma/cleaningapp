/**
 * quoteEngine.ts — Motore di calcolo preventivi Puliziacasevacanze.it
 * v2 — 07/07/2026: multi-unità (-5% da 2), camere B&B a persone (+3 oltre la 2ª),
 *      aree comuni (in loco / uscita dedicata a mq), passaggio infra-soggiorno.
 * v1 — parametri base congelati il 06/07/2026 (prototipo HTML v6)
 *
 * REGOLE:
 * - Modulo PURO: nessun import da Firebase/Next, nessun side effect.
 *   Tutta la logica prezzi passa SOLO da qui (stesso principio di linenCore).
 * - Ogni modifica ai parametri richiede il rerun di quoteEngine.selftest.ts
 */

// ─────────────────────────────── Tipi ───────────────────────────────

export type TipoStruttura = 'casa' | 'case' | 'bnb' | 'hotel';
export type Taglio = 'mono' | 'bilo' | 'trilo' | 'quadri';
export type TipoCucina = 'angolo' | 'sep' | 'abit';
export type TipoEsterno = 'no' | 'balcone' | 'terrazzo' | 'terrazzoGrande';

export interface DatiCasa {
  taglio: Taglio;
  mq: number;
  matrimoniali: number;
  singoli: number;
  divani: number;
  bagni: number;
  cucina: TipoCucina;
  esterno: TipoEsterno;
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
  /** taglio effettivo dopo correzioni mq (per il salvataggio lead) */
  taglioEffettivo?: string;
}

// ────────────────────── Parametri (CONGELATI v1) ──────────────────────

export const ENGINE = {
  basi: { mono: 40, bilo: 45, trilo: 52, triloGrande: 54, quadri: 60 } as Record<string, number>,
  lettiInclusi: { mono: 1, bilo: 2, trilo: 3, triloGrande: 3, quadri: 4 } as Record<string, number>,
  corr: {
    piccolo: { letto: 3, bagno: 7, cucinaSep: 4, cucinaAbit: 6, balcone: 3, terrazzo: 6, terrazzoGrande: 10 },
    grande:  { letto: 2, bagno: 5, cucinaSep: 4, cucinaAbit: 5, balcone: 3, terrazzo: 5, terrazzoGrande: 8 },
  },
  biancheria: { matrimoniale: 5.60, singolo: 4.30, setOspite: 3.80, tappetino: 1.00, canavaccio: 1.50 },
  /** doccia-shampoo 0,48 + sapone mani 0,28 + body lotion 0,50 (listino OKIKO) */
  kitCortesia: 1.26,
  bnb: { singola: 25, doppia: 28, personaExtra: 3, rifacimentoLetto: 10, uscita: 10 },
  areaComune: { sogliaMq: 20, inLocoBase: 8, inLocoMqExtra: 0.5, dedicataBase: 20, dedicataMqExtra: 0.8 },
  passaggio: { uscita: 10, perLetto: 10 },
  scontoMultiUnita: { daUnita: 2, percento: 5 },
  MQ_MAX: 120,
  MQ_TRILO_GRANDE: 75,
  /** soglie oltre le quali il taglio dichiarato viene promosso al superiore */
  soglieMqPromozione: { mono: 55, bilo: 80, trilo: 100, triloGrande: 105 } as Record<string, number>,
  promozioni: { mono: 'bilo', bilo: 'trilo', trilo: 'quadri', triloGrande: 'quadri' } as Record<string, string>,
} as const;

// ─────────────────────────── Helper interni ───────────────────────────

const round2 = (v: number) => Math.round(v * 100) / 100;

function range(puntuale: number): { min: number; max: number } {
  return {
    min: Math.floor(puntuale / 5) * 5,
    max: Math.round((puntuale * 1.15) / 5) * 5,
  };
}

// ─────────────────────────────── Calcoli ───────────────────────────────

export function calcolaCasa(d: DatiCasa): QuoteResult {
  if (d.mq > ENGINE.MQ_MAX) {
    return { suMisura: true, min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0 };
  }

  let taglio: string = d.taglio;
  if (taglio === 'trilo' && d.mq > ENGINE.MQ_TRILO_GRANDE) taglio = 'triloGrande';
  const soglia = ENGINE.soglieMqPromozione[taglio];
  if (soglia && d.mq > soglia && ENGINE.promozioni[taglio]) taglio = ENGINE.promozioni[taglio];

  const grande = taglio === 'trilo' || taglio === 'triloGrande' || taglio === 'quadri';
  const c = grande ? ENGINE.corr.grande : ENGINE.corr.piccolo;

  const lettiTot = d.matrimoniali + d.singoli + d.divani;
  let tot = ENGINE.basi[taglio];
  tot += Math.max(0, lettiTot - ENGINE.lettiInclusi[taglio]) * c.letto;
  tot += Math.max(0, d.bagni - 1) * c.bagno;
  if (d.cucina === 'sep') tot += c.cucinaSep;
  if (d.cucina === 'abit') tot += c.cucinaAbit;
  if (d.esterno === 'balcone') tot += c.balcone;
  if (d.esterno === 'terrazzo') tot += c.terrazzo;
  if (d.esterno === 'terrazzoGrande') tot += c.terrazzoGrande;

  let biancheria = 0;
  if (d.vuoleBiancheria) {
    const b = ENGINE.biancheria;
    biancheria += d.matrimoniali * b.matrimoniale + (d.singoli + d.divani) * b.singolo;
    biancheria += d.ospiti * b.setOspite + d.bagni * b.tappetino + b.canavaccio;
  }
  const kit = d.vuoleKit ? d.ospiti * ENGINE.kitCortesia : 0;

  const { min, max } = range(tot);
  return {
    suMisura: false, min, max, puntuale: tot,
    biancheria: round2(biancheria), kit: round2(kit),
    taglioEffettivo: taglio,
  };
}

export function calcolaBnb(d: DatiBnb): QuoteResult {
  const b = ENGINE.bnb;
  const tot = d.singole * b.singola + d.doppie * b.doppia;
  const kit = d.vuoleKit ? (d.singole + d.doppie * 2) * ENGINE.kitCortesia : 0;
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

// ────────────────── v2: Più case vacanze (somma + sconto) ──────────────────

export interface QuoteMultiResult extends QuoteResult {
  unitaDettaglio: { min: number; max: number; suMisura: boolean }[];
  scontoPercento: number;
}

export function calcolaCase(unita: DatiCasa[]): QuoteMultiResult {
  const dettagli = unita.map(calcolaCasa);
  const vuoto = { min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0 };
  if (dettagli.some((d) => d.suMisura) || unita.length === 0) {
    return { suMisura: true, ...vuoto, unitaDettaglio: dettagli.map(d => ({ min: d.min, max: d.max, suMisura: d.suMisura })), scontoPercento: 0 };
  }
  let sommaPulizia = dettagli.reduce((a, d) => a + d.puntuale, 0);
  const sconto = unita.length >= ENGINE.scontoMultiUnita.daUnita ? ENGINE.scontoMultiUnita.percento : 0;
  if (sconto > 0) sommaPulizia = sommaPulizia * (1 - sconto / 100);
  const biancheria = round2(dettagli.reduce((a, d) => a + d.biancheria, 0));
  const kit = round2(dettagli.reduce((a, d) => a + d.kit, 0));
  const { min, max } = range(sommaPulizia);
  return {
    suMisura: false, min, max, puntuale: round2(sommaPulizia), biancheria, kit,
    unitaDettaglio: dettagli.map(d => ({ min: d.min, max: d.max, suMisura: d.suMisura })),
    scontoPercento: sconto,
  };
}

// ────────────────── v2: B&B a camere dinamiche + extra ──────────────────

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
export function prezzoCamera(persone: number): number {
  const p = Math.max(1, Math.floor(persone));
  if (p === 1) return ENGINE.bnb.singola;
  return ENGINE.bnb.doppia + (p - 2) * ENGINE.bnb.personaExtra;
}

/** Area comune GIÀ in loco (aggiunta a un passaggio esistente) */
export function prezzoAreaComuneInLoco(mq: number): number {
  const a = ENGINE.areaComune;
  return round2(a.inLocoBase + Math.max(0, mq - a.sogliaMq) * a.inLocoMqExtra);
}
/** Area comune in USCITA DEDICATA (solo lei, senza camere) */
export function prezzoAreaComuneDedicata(mq: number): number {
  const a = ENGINE.areaComune;
  return round2(a.dedicataBase + Math.max(0, mq - a.sogliaMq) * a.dedicataMqExtra);
}

export interface QuoteBnbV2 extends QuoteResult {
  /** rifacimento letti giornaliero, PER USCITA (assunzione: 1 letto per camera) */
  rifacimentoGiornaliero: number;
  /** area comune: per passaggio (inloco) o per uscita (dedicata); 0 se 'no' */
  areaComuneImporto: number;
  areaComuneTipo: AreaComune;
}

export function calcolaBnbV2(d: DatiBnbV2): QuoteBnbV2 {
  const tot = d.camere.reduce((a, c) => a + prezzoCamera(c.persone), 0);
  const persone = d.camere.reduce((a, c) => a + Math.max(1, c.persone), 0);
  const kit = d.vuoleKit ? round2(persone * ENGINE.kitCortesia) : 0;
  const rifacimento = d.frequenza === 'giornaliera'
    ? round2(ENGINE.bnb.uscita + d.camere.length * ENGINE.bnb.rifacimentoLetto)
    : 0;
  const areaComuneImporto =
    d.areaComune === 'inloco' ? prezzoAreaComuneInLoco(d.areaComuneMq)
    : d.areaComune === 'dedicata' ? prezzoAreaComuneDedicata(d.areaComuneMq)
    : 0;
  const { min, max } = range(tot);
  return {
    suMisura: false, min, max, puntuale: tot, biancheria: 0, kit,
    rifacimentoGiornaliero: rifacimento,
    areaComuneImporto, areaComuneTipo: d.areaComune,
  };
}

// ────────────────── v2: Passaggio infra-soggiorno (case) ──────────────────

/** Rifacimento letti + eventuale cambio biancheria e ricarica kit DURANTE il soggiorno */
export function calcolaPassaggioSoggiorno(d: DatiCasa): { totale: number; uscita: number; letti: number; biancheria: number; kit: number } {
  const lettiTot = d.matrimoniali + d.singoli + d.divani;
  const uscita = ENGINE.passaggio.uscita;
  const letti = lettiTot * ENGINE.passaggio.perLetto;
  let biancheria = 0;
  if (d.vuoleBiancheria) {
    const b = ENGINE.biancheria;
    biancheria = round2(d.matrimoniali * b.matrimoniale + (d.singoli + d.divani) * b.singolo + d.ospiti * b.setOspite + d.bagni * b.tappetino + b.canavaccio);
  }
  const kit = d.vuoleKit ? round2(d.ospiti * ENGINE.kitCortesia) : 0;
  return { totale: round2(uscita + letti + biancheria + kit), uscita, letti, biancheria, kit };
}

// ─────────────────────────── Formattazione ───────────────────────────

export const formatEuro = (v: number): string =>
  '\u20ac ' + v.toFixed(2).replace('.', ',');
