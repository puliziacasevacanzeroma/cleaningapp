/**
 * 🛡️ LINEN GUARDRAIL — invariante di salvataggio per la biancheria letto.
 *
 * Garantisce, a OGNI scrittura di serviceConfigs, due regole non negoziabili:
 *   1) il copripiumino NON può mai essere usato come lenzuolo del letto
 *      → viene convertito nel lenzuolo canonico (doubleSheets / singleSheets),
 *        preservando la quantità (fonde se già presente);
 *   2) ogni configurazione deve avere SEMPRE il minimo di lenzuola per i suoi
 *      letti → se mancano, vengono rabboccate (il king size conta come
 *      matrimoniale, quindi niente falsi rabbocchi).
 *
 * È PURA (zero Firebase/Next), DETERMINISTICA e IDEMPOTENTE: applicarla a una
 * config già pulita non cambia nulla. È CONSERVATIVA: converte e aggiunge,
 * non rimuove né riduce mai altri articoli (federe, asciugamani, kit, extra).
 *
 * Stessa identica logica della riparazione una-tantum già validata in
 * produzione (fix-copripiumino-linen): qui diventa permanente, in linea.
 */

export const CANON_MATR = "doubleSheets";
export const CANON_SING = "singleSheets";

// DocId noti del copripiumino in produzione (variante "per docId", oltre alle
// chiavi-stringa copripiumino_*). Se un giorno si crea un NUOVO articolo
// copripiumino, aggiungere qui il suo docId (o passare un classify custom).
export const KNOWN_COPRI_MATR_IDS = new Set<string>(["HkWrWkdOGdAAvu0Z6TxI"]);
export const KNOWN_COPRI_SING_IDS = new Set<string>(["4dAI4RBjbLkqww2F1U7d"]);

// DocId del king size (è un lenzuolo matrimoniale a tutti gli effetti).
export const KING_SIZE_IDS = new Set<string>(["98muZRaSp3ZenD0aMPVc"]);

export type Kind = "lenz_matr" | "lenz_sing" | "copri_matr" | "copri_sing" | "federa" | "other";

export interface BedLike {
  id?: string;
  type?: string;
  tipo?: string;
}

/**
 * Classificatore self-contained: riconosce copripiumino e lenzuola da
 *  (a) testo della chiave (copripium/duvet/copri_, lenzuol/king),
 *  (b) docId noti (copripiumino e king size),
 *  (c) id canonici doubleSheets/singleSheets/pillowcases.
 * Opzionalmente accetta una mappa inventario {id|key -> name} per coprire
 * anche eventuali articoli futuri risolvendone il nome.
 */
export function makeClassifier(
  invById?: Map<string, { name?: string }>,
): (id: string) => Kind {
  return (rawId: string): Kind => {
    const id = String(rawId);
    const inv = invById?.get(id);
    const n = (inv?.name || id).toLowerCase();

    // Federe
    if (n.includes("feder") || id === "pillowcases" || id === "item_pillowcases") return "federa";

    // King size = lenzuolo matrimoniale (prima del check copri, così un nome
    // tipo "lenzuolo king" non viene mai scambiato per copri)
    if (KING_SIZE_IDS.has(id)) return "lenz_matr";

    // Copripiumino (docId noti o testo)
    if (KNOWN_COPRI_MATR_IDS.has(id)) return "copri_matr";
    if (KNOWN_COPRI_SING_IDS.has(id)) return "copri_sing";
    const isCopri = n.includes("copripium") || n.includes("duvet") || n.includes("copri_") || n.includes("copri ");
    const isSing = n.includes("singol") || n.includes("single");
    if (isCopri) return isSing ? "copri_sing" : "copri_matr";

    // Lenzuola canoniche / per nome
    if (id === CANON_MATR || id === `item_${CANON_MATR}`) return "lenz_matr";
    if (id === CANON_SING || id === `item_${CANON_SING}`) return "lenz_sing";
    if (n.includes("lenzuol") || n.includes("king")) return isSing ? "lenz_sing" : "lenz_matr";

    // Fallback prudente: un articolo letto matrimoniale custom → lenz_matr
    const isMatr =
      n.includes("matrimon") || n.includes("matr") || n.includes("double") ||
      n.includes("2 piazze") || n.includes("due piazze");
    if (isMatr) return "lenz_matr";

    return "other";
  };
}

/** Minimi di lenzuola per un insieme di letti. divano = matrimoniale. */
export function countBedMinimums(beds: BedLike[]): { minMatr: number; minSing: number } {
  let minMatr = 0, minSing = 0;
  for (const bed of beds || []) {
    const t = (bed.type || bed.tipo || "").toLowerCase();
    if (t === "matr" || t === "matrimoniale" || t === "divano" || t === "divano_letto") minMatr += 2;
    else if (t === "castello") minSing += 4;
    else minSing += 2;
  }
  return { minMatr, minSing };
}

/** Inferisce il tipo letto dalla chiave per-letto (es. "stanza_..._matrimoniale_0"). */
export function bedTypeFromKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("matrimoniale") || k.includes("matr")) return "matr";
  if (k.includes("divano")) return "divano";
  if (k.includes("castello")) return "castello";
  return "sing";
}

/**
 * Sanifica un singolo contenitore biancheria { itemId: qty }.
 * 1) copripiumino → lenzuolo (preserva qty, fonde se già presente)
 * 2) rabbocca al minimo (king size incluso nel conteggio)
 * Non rimuove né riduce nient'altro.
 */
export function sanitizeContainer(
  container: Record<string, number>,
  minMatr: number,
  minSing: number,
  classify: (id: string) => Kind,
): { out: Record<string, number>; changes: string[] } {
  const out: Record<string, number> = { ...container };
  const changes: string[] = [];

  // 1) copripiumino → lenzuolo
  for (const [id, qty] of Object.entries(container)) {
    if (typeof qty !== "number" || qty <= 0) continue;
    const k = classify(id);
    if (k === "copri_matr") {
      out[CANON_MATR] = (out[CANON_MATR] || 0) + qty;
      delete out[id];
      changes.push(`${id}(${qty}) → ${CANON_MATR}`);
    } else if (k === "copri_sing") {
      out[CANON_SING] = (out[CANON_SING] || 0) + qty;
      delete out[id];
      changes.push(`${id}(${qty}) → ${CANON_SING}`);
    }
  }

  // 2) conta lenzuola effettive (king size incluso) e rabbocca
  let haveMatr = 0, haveSing = 0;
  for (const [id, qty] of Object.entries(out)) {
    if (typeof qty !== "number" || qty <= 0) continue;
    const k = classify(id);
    if (k === "lenz_matr") haveMatr += qty;
    else if (k === "lenz_sing") haveSing += qty;
  }
  if (minMatr > 0 && haveMatr < minMatr) {
    const add = minMatr - haveMatr;
    out[CANON_MATR] = (out[CANON_MATR] || 0) + add;
    changes.push(`+${add} ${CANON_MATR} (min ${minMatr}, presenti ${haveMatr})`);
  }
  if (minSing > 0 && haveSing < minSing) {
    const add = minSing - haveSing;
    out[CANON_SING] = (out[CANON_SING] || 0) + add;
    changes.push(`+${add} ${CANON_SING} (min ${minSing}, presenti ${haveSing})`);
  }
  return { out, changes };
}

export interface GuardrailResult<T> {
  sanitized: T;
  changed: boolean;
  log: string[];
}

/**
 * Applica il guardrail a un intero oggetto serviceConfigs prima del salvataggio.
 *
 * @param serviceConfigs  mappa { ospiti -> { bl: {...}, beds?: string[], ... } }
 * @param beds            elenco letti della proprietà [{ id, type }]
 * @param classify        opzionale, classificatore custom (es. inventory-backed)
 * @returns               { sanitized, changed, log } — `sanitized` è una COPIA;
 *                        l'originale non viene mutato.
 */
export function sanitizeServiceConfigsLinen(
  serviceConfigs: Record<string, any> | null | undefined,
  beds: BedLike[] | null | undefined,
  classify: (id: string) => Kind = makeClassifier(),
): GuardrailResult<Record<string, any>> {
  const log: string[] = [];
  if (!serviceConfigs || typeof serviceConfigs !== "object") {
    return { sanitized: serviceConfigs as any, changed: false, log };
  }

  const allBeds = Array.isArray(beds) ? beds : [];
  const next = JSON.parse(JSON.stringify(serviceConfigs));
  let changed = false;

  for (const cfgKey of Object.keys(next)) {
    const cfg = next[cfgKey];
    if (!cfg || typeof cfg !== "object" || !cfg.bl || typeof cfg.bl !== "object") continue;

    // letti selezionati per questa config (fallback: tutti i letti)
    const selIds: string[] = Array.isArray(cfg.beds) ? cfg.beds : [];
    const selectedBeds = selIds.length > 0
      ? allBeds.filter((b) => b.id && selIds.includes(b.id))
      : allBeds;

    const bl = cfg.bl;
    const hasAll = bl["all"] && typeof bl["all"] === "object" && Object.keys(bl["all"]).length > 0;

    if (hasAll) {
      const mins = countBedMinimums(selectedBeds);
      const { out, changes } = sanitizeContainer(bl["all"], mins.minMatr, mins.minSing, classify);
      if (changes.length > 0) {
        bl["all"] = out;
        changed = true;
        changes.forEach((c) => log.push(`ospiti ${cfgKey} [all]: ${c}`));
      }
    } else {
      // formato per-letto: ogni gruppo col minimo del suo letto
      for (const bedKey of Object.keys(bl)) {
        if (bedKey === "all" || typeof bl[bedKey] !== "object" || bl[bedKey] === null) continue;
        const mins = countBedMinimums([{ type: bedTypeFromKey(bedKey) }]);
        const { out, changes } = sanitizeContainer(bl[bedKey], mins.minMatr, mins.minSing, classify);
        if (changes.length > 0) {
          bl[bedKey] = out;
          changed = true;
          changes.forEach((c) => log.push(`ospiti ${cfgKey} [${bedKey}]: ${c}`));
        }
      }
    }
  }

  return { sanitized: changed ? next : serviceConfigs, changed, log };
}
