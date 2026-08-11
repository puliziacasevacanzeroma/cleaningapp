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

// Isoliamo le funzioni pure dal componente React (che qui non serve e
// trascinerebbe dentro tutto il DOM). Compiliamo il file VERO e teniamo
// solo le due funzioni esportate.
const source = readFileSync(SRC, "utf8");
const pureOnly = source
  .split("export function PropertySearchBar")[0]
  .replace(/^import .*$/gm, "");
const js = ts.transpileModule(pureOnly, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { normalizeSearch, matchesPropertyQuery } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

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

console.log(`\n${"═".repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ ${passed} test superati, 0 falliti`);
  process.exit(0);
} else {
  console.log(`❌ ${passed} superati, ${failures.length} FALLITI:`);
  failures.forEach(f => console.log(`   · ${f}`));
  process.exit(1);
}
