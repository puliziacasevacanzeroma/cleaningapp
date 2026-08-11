/**
 * Test della logica di ricerca condivisa (PropertySearchBar).
 *
 *   node tests/propertySearch.test.mjs
 *
 * Estrae dal file di produzione le due funzioni pure `normalizeSearch` e
 * `matchesPropertyQuery` e le esercita su casi reali: nomi di
 * appartamenti veri, notifiche con il nome dentro il messaggio, accenti,
 * refusi di spaziatura, parole in ordine diverso.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "components", "ui", "PropertySearchBar.tsx");

// Isoliamo le REGIONI PURE del file di produzione (i componenti React
// qui non servono e trascinerebbero dentro il DOM). Vengono estratte le
// due zone senza JSX, così i test girano sulle funzioni VERE e non su
// una replica che potrebbe divergere in silenzio.
const source = readFileSync(SRC, "utf8");
const slice = (from, to) => {
  const a = source.indexOf(from);
  if (a < 0) throw new Error(`Regione non trovata nel sorgente: ${from}`);
  const b = to ? source.indexOf(to, a) : source.length;
  if (to && b < 0) throw new Error(`Fine regione non trovata: ${to}`);
  return source.slice(a, b);
};

const pureOnly = [
  // ricerca: normalizeSearch + matchesPropertyQuery
  slice("export interface PropertyOption", "function PropertyThumb"),
  // date: DateRange + docDate + isInDateRange + hasDateRange
  slice("export interface DateRange", "function fmtShort"),
  // conservazione: isBeyondRetention
  slice("export const NOTIFICATION_RETENTION_DAYS"),
].join("\n").replace(/^import .*$/gm, "");

const js = ts.transpileModule(pureOnly, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { normalizeSearch, matchesPropertyQuery, isInDateRange, hasDateRange, EMPTY_RANGE, docDate,
        isBeyondRetention, NOTIFICATION_RETENTION_DAYS } =
  await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let passed = 0;
const failures = [];
let g = "";
const group = n => { g = n; console.log(`\n── ${n}`); };
const check = (n, c) => {
  if (c) { passed++; console.log(`   ✓ ${n}`); }
  else { failures.push(`${g} → ${n}`); console.log(`   ✗ ${n}`); }
};

// Appartamenti veri della flotta
const CAMPO = "Campo De Fiori Home";
const REGINA = "Regina del sole";

// ══════════════════════════════════════════════════════════════════
group("1 · Normalizzazione");
check("minuscole", normalizeSearch("CAMPO") === "campo");
check("accenti rimossi", normalizeSearch("Città") === "citta");
check("spazi multipli compattati", normalizeSearch("  a   b  ") === "a b");
check("stringa vuota", normalizeSearch("") === "");
check("null non esplode", normalizeSearch(null) === "");

// ══════════════════════════════════════════════════════════════════
group("2 · Testo libero sul nome dell'appartamento");
check("nome esatto", matchesPropertyQuery([CAMPO], "Campo De Fiori Home"));
check("parte del nome", matchesPropertyQuery([CAMPO], "campo"));
check("parole non adiacenti: 'campo fiori'", matchesPropertyQuery([CAMPO], "campo fiori"));
check("parole in ordine inverso: 'fiori campo'", matchesPropertyQuery([CAMPO], "fiori campo"));
check("maiuscole irrilevanti", matchesPropertyQuery([CAMPO], "CAMPO DE FIORI"));
check("spazi extra tollerati", matchesPropertyQuery([CAMPO], "  campo   fiori  "));
check("appartamento diverso non corrisponde", !matchesPropertyQuery([REGINA], "campo"));
check("parola inesistente non corrisponde", !matchesPropertyQuery([CAMPO], "trastevere"));
check("una parola su due non basta", !matchesPropertyQuery([CAMPO], "campo trastevere"));

// ══════════════════════════════════════════════════════════════════
group("3 · Ricerca vuota = mostra tutto");
check("termine vuoto → passa", matchesPropertyQuery([CAMPO], ""));
check("solo spazi → passa", matchesPropertyQuery([CAMPO], "   "));
check("campi vuoti + termine vuoto → passa", matchesPropertyQuery([], ""));

// ══════════════════════════════════════════════════════════════════
group("4 · Notifiche: il nome sta dentro titolo/messaggio");
const notif = [
  "Pulizia completata",
  `L'operatore ha completato la pulizia di ${CAMPO} alle 11:30`,
  undefined,
];
check("trova nel messaggio", matchesPropertyQuery(notif, "campo de fiori"));
check("trova con parole sparse", matchesPropertyQuery(notif, "campo fiori"));
check("trova per parola del titolo", matchesPropertyQuery(notif, "pulizia"));
check("termine misto titolo+messaggio", matchesPropertyQuery(notif, "pulizia campo"));
check("altro appartamento non corrisponde", !matchesPropertyQuery(notif, "regina"));

// relatedEntityName e turnoverAction
const turnover = ["Cambio ospiti?", "Verifica le prenotazioni", undefined, CAMPO];
check("trova in turnoverAction.propertyName", matchesPropertyQuery(turnover, "campo de fiori"));

// ══════════════════════════════════════════════════════════════════
group("5 · Campi assenti o nulli");
check("undefined nei campi non esplode", matchesPropertyQuery([undefined, null, CAMPO], "campo"));
check("tutti i campi nulli + termine → non corrisponde", !matchesPropertyQuery([null, undefined], "campo"));
check("tutti i campi nulli + termine vuoto → passa", matchesPropertyQuery([null, undefined], ""));

// ══════════════════════════════════════════════════════════════════
group("6 · Appartamento AGGANCIATO: filtro stretto");
check("agganciato: corrisponde al proprio", matchesPropertyQuery([CAMPO], "", CAMPO));
check("agganciato: non corrisponde ad altri", !matchesPropertyQuery([REGINA], "", CAMPO));
check(
  "agganciato: trova anche dentro un messaggio",
  matchesPropertyQuery(["Pulizia", `completata a ${CAMPO}`], "", CAMPO),
);
check(
  "agganciato: il testo libero viene IGNORATO (vince la pillola)",
  matchesPropertyQuery([CAMPO], "regina", CAMPO),
);
check(
  "agganciato: testo libero non riesuma altri appartamenti",
  !matchesPropertyQuery([REGINA], "regina", CAMPO),
);

// ══════════════════════════════════════════════════════════════════
group("7 · Casi limite di nomi reali");
check("nome con accento cercato senza", matchesPropertyQuery(["Città Nuova"], "citta"));
check("nome senza accento cercato con", matchesPropertyQuery(["Citta Nuova"], "città"));
check("apostrofo nel nome", matchesPropertyQuery(["Casa dell'Angelo"], "angelo"));
check("numeri nel nome", matchesPropertyQuery(["Pellegrino 62"], "62"));
check("nome molto corto", matchesPropertyQuery(["B&B Sole"], "sole"));
check(
  "sottostringa dentro una parola più lunga",
  matchesPropertyQuery(["Trastevere Suite"], "traste"),
);

// ══════════════════════════════════════════════════════════════════
group("8 · Segnalazioni");
const issue = ["Perdita d'acqua in bagno", "Il rubinetto gocciola", REGINA];
check("trova per nome appartamento", matchesPropertyQuery([REGINA, issue[0], issue[1]], "regina"));
check("trova per parola del titolo", matchesPropertyQuery([REGINA, issue[0], issue[1]], "acqua"));
check("trova per parola della descrizione", matchesPropertyQuery([REGINA, issue[0], issue[1]], "rubinetto"));
check("non trova parole assenti", !matchesPropertyQuery([REGINA, issue[0], issue[1]], "riscaldamento"));


// ══════════════════════════════════════════════════════════════════
// 9 · Intervallo di date (modale calendario)
// ══════════════════════════════════════════════════════════════════
// isInDateRange è quella VERA, importata dal sorgente di produzione.
const EMPTY = EMPTY_RANGE;
const D = (y, m, day, h = 12) => new Date(y, m - 1, day, h);

group("9 · Intervallo di date");
check("intervallo vuoto non filtra", isInDateRange(D(2020,1,1), EMPTY));
check("dentro l'intervallo", isInDateRange(D(2026,8,10), { from: "2026-08-01", to: "2026-08-31" }));
check("prima del 'Da' escluso", !isInDateRange(D(2026,7,31), { from: "2026-08-01", to: "2026-08-31" }));
check("dopo l'A' escluso", !isInDateRange(D(2026,9,1), { from: "2026-08-01", to: "2026-08-31" }));
check("il giorno 'Da' è incluso (mezzanotte)", isInDateRange(D(2026,8,1,0), { from: "2026-08-01", to: "2026-08-31" }));
check("il giorno 'A' è incluso fino a fine giornata", isInDateRange(D(2026,8,31,23), { from: "2026-08-01", to: "2026-08-31" }));
check("solo 'Da': tutto ciò che segue passa", isInDateRange(D(2030,1,1), { from: "2026-08-01", to: "" }));
check("solo 'Da': ciò che precede è escluso", !isInDateRange(D(2026,7,1), { from: "2026-08-01", to: "" }));
check("solo 'A': ciò che precede passa", isInDateRange(D(2020,1,1), { from: "", to: "2026-08-31" }));
check("solo 'A': ciò che segue è escluso", !isInDateRange(D(2026,9,5), { from: "", to: "2026-08-31" }));
check("un solo giorno: quel giorno passa", isInDateRange(D(2026,8,11), { from: "2026-08-11", to: "2026-08-11" }));
check("un solo giorno: il giorno dopo no", !isInDateRange(D(2026,8,12), { from: "2026-08-11", to: "2026-08-11" }));
check("data mancante non viene esclusa", isInDateRange(null, { from: "2026-08-01", to: "2026-08-31" }));

// ══════════════════════════════════════════════════════════════════
group("10 · Date + ricerca insieme");
// ══════════════════════════════════════════════════════════════════
const items = [
  { name: CAMPO,  date: D(2026,8,10) },
  { name: CAMPO,  date: D(2026,6,15) },
  { name: REGINA, date: D(2026,8,11) },
];
const combo = (range, term, sel) =>
  items.filter(i => isInDateRange(i.date, range) && matchesPropertyQuery([i.name], term, sel));

const AGO = { from: "2026-08-01", to: "2026-08-31" };
check("agosto + 'campo' → 1", combo(AGO, "campo").length === 1);
check("nessun filtro data + 'campo' → 2", combo(EMPTY, "campo").length === 2);
check("agosto senza testo → 2", combo(AGO, "").length === 2);
check("agosto agganciato a Campo → 1", combo(AGO, "", CAMPO).length === 1);
check("giugno agganciato a Campo → 1", combo({ from: "2026-06-01", to: "2026-06-30" }, "", CAMPO).length === 1);
check("giugno + 'regina' → 0", combo({ from: "2026-06-01", to: "2026-06-30" }, "regina").length === 0);


// ══════════════════════════════════════════════════════════════════
group("11 · hasDateRange e docDate (funzioni vere)");
check("intervallo vuoto → nessun filtro attivo", !hasDateRange(EMPTY_RANGE));
check("solo 'Da' → filtro attivo", hasDateRange({ from: "2026-08-01", to: "" }));
check("solo 'A' → filtro attivo", hasDateRange({ from: "", to: "2026-08-31" }));
check("null → nessun filtro", !hasDateRange(null));
check("docDate legge un Timestamp Firestore",
  docDate({ toDate: () => new Date(2026, 7, 11) })?.getFullYear() === 2026);
check("docDate legge {seconds}",
  docDate({ seconds: Math.floor(D(2026,8,11).getTime() / 1000) })?.getMonth() === 7);
check("docDate legge una Date", docDate(D(2026,8,11))?.getDate() === 11);
check("docDate su null → null", docDate(null) === null);
check("docDate su oggetto strano → null", docDate({ pippo: 1 }) === null);


// ══════════════════════════════════════════════════════════════════
group("12 · Limite di conservazione delle notifiche");
// ══════════════════════════════════════════════════════════════════
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const backDays = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

check("nessuna data → nessun avviso", !isBeyondRetention(""));
check("ieri → dentro il limite", !isBeyondRetention(backDays(1)));
check("due mesi fa → dentro il limite (requisito)", !isBeyondRetention(backDays(60)));
check("appena dentro il limite", !isBeyondRetention(backDays(NOTIFICATION_RETENTION_DAYS - 1)));
check("appena oltre il limite → avvisa", isBeyondRetention(backDays(NOTIFICATION_RETENTION_DAYS + 1)));
check("un anno fa → avvisa", isBeyondRetention(backDays(365)));
check("il limite copre i due mesi richiesti", NOTIFICATION_RETENTION_DAYS > 60);

console.log(`\n${"═".repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ ${passed} test superati, 0 falliti`);
  process.exit(0);
} else {
  console.log(`❌ ${passed} superati, ${failures.length} FALLITI:`);
  failures.forEach(f => console.log(`   · ${f}`));
  process.exit(1);
}
