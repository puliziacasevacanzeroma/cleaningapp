/**
 * quoteEngine.ts — Motore di calcolo preventivi Puliziacasevacanze.it
 * v1 — parametri congelati e validati con Ariele il 06/07/2026 (prototipo HTML v6)
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
  bnb: { singola: 25, doppia: 28, rifacimentoLetto: 10, uscita: 10 },
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

// ─────────────────────────── Formattazione ───────────────────────────

export const formatEuro = (v: number): string =>
  '\u20ac ' + v.toFixed(2).replace('.', ',');
