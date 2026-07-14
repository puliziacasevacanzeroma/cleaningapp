/**
 * quoteEngine.ts — Motore di calcolo preventivi Puliziacasevacanze.it
 * v3 — 08/07/2026: parametri INIETTABILI. Ogni funzione accetta un EngineParams
 *      opzionale (default = ENGINE, i valori congelati). La dashboard admin
 *      salva le modifiche su Firestore (config/preventivatore) e la route
 *      /api/leads le carica a ogni calcolo via engineConfig.getEngineParams():
 *      cambi un numero → il preventivo successivo usa il numero nuovo.
 * v2 — 07/07/2026: multi-unità (-5% da 2), camere B&B a persone (+3 oltre la 2ª),
 *      aree comuni (in loco / uscita dedicata a mq), passaggio infra-soggiorno.
 * v1 — parametri base congelati il 06/07/2026 (prototipo HTML v6)
 *
 * REGOLE:
 * - Modulo PURO: nessun import da Firebase/Next, nessun side effect.
 *   Tutta la logica prezzi passa SOLO da qui (stesso principio di linenCore).
 * - Ogni modifica ai parametri o alla logica richiede il rerun del selftest.
 */

// ─────────────────────────────── Tipi ───────────────────────────────

export type TipoStruttura = 'casa' | 'case' | 'bnb' | 'hotel';
export type Taglio = 'mono' | 'bilo' | 'trilo' | 'quadri';
export type TipoCucina = 'angolo' | 'sep' | 'abit';
export type TipoEsterno = 'no' | 'balcone' | 'terrazzo' | 'terrazzoGrande';

export interface DatiCasa {
  /** nome dell'unità (facoltativo, usato per multi-unità: es. "Casa Trastevere") */
  nome?: string;
  /** zona dell'unità (multi: ogni casa ha la sua, usata nel PDF) */
  zona?: string;
  /** indirizzo preciso dell'unità (via e civico) */
  indirizzo?: string;
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

// ────────────────────── Parametri (default congelati v1) ──────────────────────

export interface CorrTaglio {
  letto: number; bagno: number; cucinaSep: number; cucinaAbit: number;
  balcone: number; terrazzo: number; terrazzoGrande: number;
}

export interface EngineParams {
  basi: Record<string, number>;
  lettiInclusi: Record<string, number>;
  corr: { piccolo: CorrTaglio; grande: CorrTaglio };
  biancheria: { matrimoniale: number; singolo: number; setOspite: number; tappetino: number; canavaccio: number };
  kitCortesia: number;
  bnb: { singola: number; doppia: number; personaExtra: number; rifacimentoLetto: number; uscita: number };
  areaComune: { sogliaMq: number; inLocoBase: number; inLocoMqExtra: number; dedicataBase: number; dedicataMqExtra: number };
  passaggio: { uscita: number; perLetto: number };
  scontoMultiUnita: { daUnita: number; percento: number };
  MQ_MAX: number;
  MQ_TRILO_GRANDE: number;
  soglieMqPromozione: Record<string, number>;
  promozioni: Record<string, string>;
}

export const ENGINE: EngineParams = {
  basi: { mono: 40, bilo: 45, trilo: 52, triloGrande: 54, quadri: 60 },
  lettiInclusi: { mono: 1, bilo: 2, trilo: 3, triloGrande: 3, quadri: 4 },
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
  soglieMqPromozione: { mono: 55, bilo: 80, trilo: 100, triloGrande: 105 },
  promozioni: { mono: 'bilo', bilo: 'trilo', trilo: 'quadri', triloGrande: 'quadri' },
};

// ─────────────────────────── Helper interni ───────────────────────────

const round2 = (v: number) => Math.round(v * 100) / 100;

function range(puntuale: number): { min: number; max: number } {
  return {
    min: Math.floor(puntuale / 5) * 5,
    max: Math.round((puntuale * 1.15) / 5) * 5,
  };
}

// ─────────────────────────────── Calcoli ───────────────────────────────

export function calcolaCasa(d: DatiCasa, P: EngineParams = ENGINE): QuoteResult {
  if (d.mq > P.MQ_MAX) {
    return { suMisura: true, min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0 };
  }

  let taglio: string = d.taglio;
  if (taglio === 'trilo' && d.mq > P.MQ_TRILO_GRANDE) taglio = 'triloGrande';
  const soglia = P.soglieMqPromozione[taglio];
  if (soglia && d.mq > soglia && P.promozioni[taglio]) taglio = P.promozioni[taglio];

  const grande = taglio === 'trilo' || taglio === 'triloGrande' || taglio === 'quadri';
  const c = grande ? P.corr.grande : P.corr.piccolo;

  const lettiTot = d.matrimoniali + d.singoli + d.divani;
  let tot = P.basi[taglio];
  tot += Math.max(0, lettiTot - P.lettiInclusi[taglio]) * c.letto;
  tot += Math.max(0, d.bagni - 1) * c.bagno;
  if (d.cucina === 'sep') tot += c.cucinaSep;
  if (d.cucina === 'abit') tot += c.cucinaAbit;
  if (d.esterno === 'balcone') tot += c.balcone;
  if (d.esterno === 'terrazzo') tot += c.terrazzo;
  if (d.esterno === 'terrazzoGrande') tot += c.terrazzoGrande;

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
    taglioEffettivo: taglio,
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

// ────────────────── v2: Più case vacanze (somma + sconto) ──────────────────

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
  if (dettagli.some((d) => d.suMisura) || unita.length === 0) {
    return { suMisura: true, ...vuoto, unitaDettaglio: dettagli.map((d, i) => ({
      nome: unita[i]?.nome || 'Casa ' + (i + 1), zona: unita[i]?.zona || '', indirizzo: unita[i]?.indirizzo || '',
      min: d.min, max: d.max, suMisura: d.suMisura,
      taglio: unita[i]?.taglio || '', mq: unita[i]?.mq || 0, bagni: unita[i]?.bagni || 0,
      postiLetto: unita[i]?.ospiti || 0,
      matrimoniali: unita[i]?.matrimoniali || 0, singoli: unita[i]?.singoli || 0, divani: unita[i]?.divani || 0,
      cucina: unita[i]?.cucina || '', esterno: unita[i]?.esterno || '',
    })), scontoPercento: 0 };
  }
  let sommaPulizia = dettagli.reduce((a, d) => a + d.puntuale, 0);
  const sconto = unita.length >= P.scontoMultiUnita.daUnita ? P.scontoMultiUnita.percento : 0;
  if (sconto > 0) sommaPulizia = sommaPulizia * (1 - sconto / 100);
  // Lo sconto multi-casa va applicato ANCHE al prezzo mostrato per ogni singola casa:
  // prima finiva solo nel totale (che nel wizard non viene mai mostrato), quindi lo
  // sconto era dichiarato ma invisibile nei numeri letti dall'utente.
  const fatt = 1 - sconto / 100;
  const rangeScontato = (d: QuoteResult) => range(d.puntuale * fatt);
  const biancheria = round2(dettagli.reduce((a, d) => a + d.biancheria, 0));
  const kit = round2(dettagli.reduce((a, d) => a + d.kit, 0));
  const { min, max } = range(sommaPulizia);
  return {
    suMisura: false, min, max, puntuale: round2(sommaPulizia), biancheria, kit,
    unitaDettaglio: dettagli.map((d, i) => ({
      nome: unita[i]?.nome || 'Casa ' + (i + 1), zona: unita[i]?.zona || '', indirizzo: unita[i]?.indirizzo || '',
      min: rangeScontato(d).min, max: rangeScontato(d).max, suMisura: d.suMisura,
      taglio: unita[i]?.taglio || '', mq: unita[i]?.mq || 0, bagni: unita[i]?.bagni || 0,
      postiLetto: unita[i]?.ospiti || 0,
      matrimoniali: unita[i]?.matrimoniali || 0, singoli: unita[i]?.singoli || 0, divani: unita[i]?.divani || 0,
      cucina: unita[i]?.cucina || '', esterno: unita[i]?.esterno || '',
    })),
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
  /** dettaglio per camera: tipo leggibile e prezzo a checkout */
  camereDettaglio: { persone: number; etichetta: string; prezzo: number }[];
  /** rifacimento letti giornaliero, PER USCITA (assunzione: 1 letto per camera) — uso interno/back-office */
  rifacimentoGiornaliero: number;
  /** componenti unitarie del riassetto: al cliente si mostrano SOLO queste, mai la somma */
  rifacimentoPerCamera: number;
  rifacimentoUscita: number;
  /** area comune: per passaggio (inloco) o per uscita (dedicata); 0 se 'no' */
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

// ────────────────── v2: Passaggio infra-soggiorno (case) ──────────────────

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
