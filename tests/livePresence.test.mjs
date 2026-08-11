/**
 * Test della logica anti-raffica delle notifiche.
 *
 *   node tests/livePresence.test.mjs
 *
 * Non serve browser: `PresenceEnv` è iniettabile, quindi orologio,
 * visibilità e fuoco sono simulati. I test coprono sia il modulo puro sia
 * la MACCHINA A STATI dei listener Firestore (semina, backlog, ri-semina),
 * perché è lì che nasceva la raffica del mattino.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "lib", "notifications", "livePresence.ts");

// Compiliamo il modulo VERO: i test girano sul codice di produzione,
// non su una copia che potrebbe divergere.
const source = readFileSync(SRC, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

const {
  LivePresence,
  MIN_HIDDEN_FOR_RESUME_MS,
  LIVE_MAX_AGE_MS,
  FOREGROUND_SETTLE_MS,
  CLOCK_SKEW_TOLERANCE_MS,
  SOUND_MIN_GAP_MS,
} = mod;

// ══════════════════════════════════════════════════════════════════
// MINI FRAMEWORK
// ══════════════════════════════════════════════════════════════════

let passed = 0;
const failures = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log(`\n── ${name}`);
}
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`   ✓ ${name}`);
  } else {
    failures.push(`${currentGroup} → ${name}`);
    console.log(`   ✗ ${name}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// SIMULATORE: orologio + stato dell'app
// ══════════════════════════════════════════════════════════════════

function makeApp() {
  const state = { t: 1_000_000, visible: true, focused: true };
  const env = {
    now: () => state.t,
    isVisible: () => state.visible,
    hasFocus: () => state.focused,
  };
  const p = new LivePresence(env);

  return {
    presence: p,
    state,
    advance(ms) {
      state.t += ms;
    },
    /** L'utente lascia l'app (home, cambio app, schermo spento). */
    leave() {
      state.visible = false;
      state.focused = false;
      p.markBackground();
    },
    /** L'utente riapre l'app. */
    enter() {
      state.visible = true;
      state.focused = true;
      p.markForeground();
    },
    /** Desktop: un'altra finestra prende il fuoco, la pagina resta visibile. */
    loseFocus() {
      state.focused = false;
      p.markBackground();
    },
    regainFocus() {
      state.focused = true;
      p.markForeground();
    },
  };
}

/**
 * Simulatore del listener Firestore così com'è nel componente:
 * ri-semina quando l'epoca è cambiata, altrimenti valuta i cambiamenti.
 * Restituisce quanti toast avrebbe emesso.
 */
function makeListener(presence, { getEventTs }) {
  let seededEpoch = -1;
  const baseline = new Map();
  let toasts = 0;

  return {
    get toasts() {
      return toasts;
    },
    reset() {
      toasts = 0;
    },
    /** @param docs [{id, status, ts, pending}] stato completo consegnato */
    onSnapshot(docs) {
      if (presence.shouldReseed(seededEpoch)) {
        docs.forEach(d => baseline.set(d.id, d));
        seededEpoch = presence.currentEpoch();
        return;
      }
      for (const d of docs) {
        const prev = baseline.get(d.id);
        const changed = prev && prev.status !== d.status;
        const isNew = !prev;
        if (changed || isNew) {
          const live = presence.isLiveEvent(getEventTs(d), d.pending === true);
          if (live && presence.canEmitLiveAlert()) toasts++;
        }
        baseline.set(d.id, d);
      }
    },
  };
}

const NIGHT = 8 * 60 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════
group("1 · Uso normale: sono dentro l'app");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.advance(FOREGROUND_SETTLE_MS + 100);
  check("app visibile e a fuoco → può emettere", app.presence.canEmitLiveAlert());
  check("evento appena creato → vivo", app.presence.isLiveEvent(app.state.t));
  check("evento di 2s fa → vivo", app.presence.isLiveEvent(app.state.t - 2_000));
  check(
    "evento appena oltre la soglia di freschezza → non vivo",
    !app.presence.isLiveEvent(app.state.t - (LIVE_MAX_AGE_MS + 1_000)),
  );
}

// ══════════════════════════════════════════════════════════════════
group("2 · App minimizzata o non a fuoco");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.advance(FOREGROUND_SETTLE_MS + 100);
  app.leave();
  check("app in background → nessun avviso", !app.presence.canEmitLiveAlert());

  const app2 = makeApp();
  app2.advance(FOREGROUND_SETTLE_MS + 100);
  app2.loseFocus();
  check(
    "pagina visibile ma altra finestra a fuoco → nessun avviso",
    !app2.presence.canEmitLiveAlert(),
  );

  const app3 = makeApp();
  app3.state.visible = false;
  check("pagina nascosta → non in primo piano", !app3.presence.isInForeground());
}

// ══════════════════════════════════════════════════════════════════
group("3 · IL CASO DEL MATTINO — riconnessione lenta (era il bug)");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });

  // Sera: 20 ordini, listener seminato mentre lavoro
  const orders = Array.from({ length: 20 }, (_, i) => ({
    id: `o${i}`,
    status: "PENDING",
    ts: app.state.t,
  }));
  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot(orders);
  check("semina iniziale → nessun toast", listener.toasts === 0);

  // Notte: app chiusa, 20 ordini cambiano stato
  app.leave();
  app.advance(NIGHT);
  const changed = orders.map(o => ({ ...o, status: "DELIVERED", ts: app.state.t - 3 * 60 * 60 * 1000 }));

  // Mattina: riapro
  app.enter();
  check("rientro dopo la notte → l'epoca è avanzata", app.presence.currentEpoch() === 1);

  // ⏱️ Firestore si riconnette DOPO 60 SECONDI (il vecchio codice
  // sopprimeva solo per 12s: qui passava tutto)
  app.advance(60_000);
  listener.onSnapshot(changed);
  check("backlog notturno consegnato dopo 60s → ZERO toast", listener.toasts === 0);

  // Riconnessione ancora più lenta, su un altro listener
  const app2 = makeApp();
  const l2 = makeListener(app2.presence, { getEventTs: d => d.ts });
  app2.advance(FOREGROUND_SETTLE_MS + 100);
  l2.onSnapshot(orders);
  app2.leave();
  app2.advance(NIGHT);
  app2.enter();
  app2.advance(10 * 60 * 1000); // 10 minuti
  l2.onSnapshot(orders.map(o => ({ ...o, status: "DELIVERED", ts: app2.state.t - NIGHT })));
  check("backlog consegnato dopo 10 minuti → ZERO toast", l2.toasts === 0);
}

// ══════════════════════════════════════════════════════════════════
group("4 · Dopo il rientro, gli eventi VERI devono passare");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });
  const orders = [{ id: "o1", status: "PENDING", ts: app.state.t }];

  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot(orders);
  app.leave();
  app.advance(NIGHT);
  app.enter();
  app.advance(30_000);
  listener.onSnapshot(orders); // ri-semina (epoca cambiata)
  check("primo snapshot dopo il rientro → muto", listener.toasts === 0);

  // Ora un cambio VERO mentre guardo lo schermo
  app.advance(5_000);
  listener.onSnapshot([{ id: "o1", status: "DELIVERED", ts: app.state.t }]);
  check("cambio reale con app aperta → 1 toast", listener.toasts === 1);

  // E un secondo cambio
  app.advance(5_000);
  listener.onSnapshot([{ id: "o1", status: "COMPLETED", ts: app.state.t }]);
  check("secondo cambio reale → 2 toast", listener.toasts === 2);
}

// ══════════════════════════════════════════════════════════════════
group("5 · Micro-uscite: non devono azzerare nulla");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });
  const orders = [{ id: "o1", status: "PENDING", ts: app.state.t }];
  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot(orders);

  // Cambio scheda per 1 secondo (sotto MIN_HIDDEN_FOR_RESUME_MS)
  app.leave();
  app.advance(1_000);
  app.enter();
  check("micro-uscita 1s → epoca invariata", app.presence.currentEpoch() === 0);

  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot([{ id: "o1", status: "DELIVERED", ts: app.state.t }]);
  check("dopo micro-uscita gli eventi passano ancora → 1 toast", listener.toasts === 1);

  // Uscita appena sopra la soglia
  app.leave();
  app.advance(MIN_HIDDEN_FOR_RESUME_MS + 500);
  app.enter();
  check("uscita reale → epoca avanzata", app.presence.currentEpoch() === 1);
}

// ══════════════════════════════════════════════════════════════════
group("6 · Assestamento subito dopo il rientro");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.leave();
  app.advance(NIGHT);
  app.enter();
  check("istante del rientro → ancora muto", !app.presence.canEmitLiveAlert());
  app.advance(FOREGROUND_SETTLE_MS - 100);
  check("poco prima dell'assestamento → ancora muto", !app.presence.canEmitLiveAlert());
  app.advance(200);
  check("passato l'assestamento → di nuovo attivo", app.presence.canEmitLiveAlert());
}

// ══════════════════════════════════════════════════════════════════
group("7 · Timestamp assente o anomalo");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.advance(FOREGROUND_SETTLE_MS + 100);
  check("timestamp null e nessuna scrittura locale → NON vivo", !app.presence.isLiveEvent(null));
  check("timestamp undefined → NON vivo", !app.presence.isLiveEvent(undefined));
  check("timestamp NaN → NON vivo", !app.presence.isLiveEvent(NaN));
  check(
    "timestamp assente MA scrittura locale in sospeso → vivo",
    app.presence.isLiveEvent(null, true),
  );
  check(
    "evento datato nel futuro (orologio avanti) → vivo",
    app.presence.isLiveEvent(app.state.t + 5_000),
  );
}

// ══════════════════════════════════════════════════════════════════
group("8 · Sfasamento degli orologi");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.leave();
  app.advance(NIGHT);
  app.enter();
  app.advance(FOREGROUND_SETTLE_MS + 100);
  const visibleAt = app.state.t - FOREGROUND_SETTLE_MS - 100;

  check(
    "evento appena PRIMA del rientro, entro la tolleranza → vivo",
    app.presence.isLiveEvent(visibleAt - (CLOCK_SKEW_TOLERANCE_MS - 1_000)),
  );
  check(
    "evento prima del rientro OLTRE la tolleranza → backlog",
    !app.presence.isLiveEvent(visibleAt - (CLOCK_SKEW_TOLERANCE_MS + 5_000)),
  );
}

// ══════════════════════════════════════════════════════════════════
group("9 · App uccisa e riaperta (nuovo processo)");
// ══════════════════════════════════════════════════════════════════
{
  // Nuovo processo = nuova istanza, epoca 0, listener a -1 → ri-semina
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });
  app.advance(FOREGROUND_SETTLE_MS + 100);
  const backlog = Array.from({ length: 50 }, (_, i) => ({
    id: `n${i}`,
    status: "NEW",
    ts: app.state.t - NIGHT,
  }));
  listener.onSnapshot(backlog);
  check("50 notifiche arretrate al primo avvio → ZERO toast", listener.toasts === 0);

  app.advance(5_000);
  listener.onSnapshot([...backlog, { id: "nuovo", status: "NEW", ts: app.state.t }]);
  check("notifica nuova dopo l'avvio → 1 toast", listener.toasts === 1);
}

// ══════════════════════════════════════════════════════════════════
group("10 · Evento che arriva mentre sono via");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.advance(FOREGROUND_SETTLE_MS + 100);
  app.leave();
  app.advance(5_000);
  check(
    "evento fresco ma app in background → nessun avviso",
    !(app.presence.isLiveEvent(app.state.t) && app.presence.canEmitLiveAlert()),
  );
}

// ══════════════════════════════════════════════════════════════════
group("11 · Throttle del suono");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  app.advance(FOREGROUND_SETTLE_MS + 100);
  check("primo suono → consentito", app.presence.canPlaySound());
  check("secondo suono immediato → bloccato", !app.presence.canPlaySound());
  app.advance(SOUND_MIN_GAP_MS - 100);
  check("appena prima della soglia → ancora bloccato", !app.presence.canPlaySound());
  app.advance(200);
  check("passata la soglia → di nuovo consentito", app.presence.canPlaySound());
}

// ══════════════════════════════════════════════════════════════════
group("12 · Eventi di risveglio spuri e ripetuti");
// ══════════════════════════════════════════════════════════════════
{
  // Su mobile arrivano spesso insieme: visibilitychange + focus + pageshow.
  // Non devono far avanzare l'epoca più di una volta.
  const app = makeApp();
  app.leave();
  app.advance(NIGHT);
  app.enter();
  const afterFirst = app.presence.currentEpoch();
  app.presence.markForeground();
  app.presence.markForeground();
  check(
    "tre eventi di rientro ravvicinati → epoca avanza una sola volta",
    app.presence.currentEpoch() === afterFirst,
  );

  // markForeground mentre la pagina è dichiarata nascosta = spurio
  const app2 = makeApp();
  app2.leave();
  app2.advance(NIGHT);
  app2.presence.markForeground(); // visible=false → deve essere ignorato
  check("rientro spurio a pagina nascosta → ignorato", app2.presence.currentEpoch() === 0);
  app2.enter();
  check("rientro vero dopo lo spurio → epoca avanza", app2.presence.currentEpoch() === 1);
}

// ══════════════════════════════════════════════════════════════════
group("13 · Più cicli giorno/notte di fila");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });
  let orders = Array.from({ length: 10 }, (_, i) => ({
    id: `o${i}`,
    status: "PENDING",
    ts: app.state.t,
  }));
  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot(orders);

  for (let day = 0; day < 5; day++) {
    app.leave();
    app.advance(NIGHT);
    orders = orders.map(o => ({ ...o, status: `S${day}`, ts: app.state.t - NIGHT / 2 }));
    app.enter();
    app.advance(45_000);
    listener.onSnapshot(orders);
  }
  check("5 notti consecutive → ZERO toast di backlog", listener.toasts === 0);
  check("5 rientri reali → epoca a 5", app.presence.currentEpoch() === 5);

  app.advance(10_000);
  listener.onSnapshot(orders.map(o => ({ ...o, status: "FINALE", ts: app.state.t })));
  check("dopo 5 notti gli eventi veri passano ancora", listener.toasts === 10);
}

// ══════════════════════════════════════════════════════════════════
group("14 · Backlog misto: vecchio + un evento vero insieme");
// ══════════════════════════════════════════════════════════════════
{
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });
  const orders = [
    { id: "a", status: "PENDING", ts: app.state.t },
    { id: "b", status: "PENDING", ts: app.state.t },
  ];
  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot(orders);
  app.leave();
  app.advance(NIGHT);
  app.enter();
  app.advance(20_000);

  // Ri-semina: assorbe tutto, anche l'evento "fresco" che capita nello
  // stesso snapshot. È il comportamento voluto: al rientro la baseline si
  // riallinea, e ciò che accade DOPO viene annunciato.
  listener.onSnapshot([
    { id: "a", status: "DELIVERED", ts: app.state.t - NIGHT },
    { id: "b", status: "DELIVERED", ts: app.state.t },
  ]);
  check("snapshot di ri-semina → muto anche se contiene un evento fresco", listener.toasts === 0);

  app.advance(3_000);
  listener.onSnapshot([
    { id: "a", status: "DELIVERED", ts: app.state.t - NIGHT },
    { id: "b", status: "COMPLETED", ts: app.state.t },
  ]);
  check("evento successivo alla ri-semina → annunciato", listener.toasts === 1);
}

// ══════════════════════════════════════════════════════════════════
group("15 · Difesa in profondità: ogni singola rete tiene da sola");
// ══════════════════════════════════════════════════════════════════
{
  // Se per qualsiasi motivo l'epoca NON avanzasse (nessun evento di
  // visibilità emesso dalla piattaforma), la freschezza deve bastare.
  const app = makeApp();
  const listener = makeListener(app.presence, { getEventTs: d => d.ts });
  const orders = [{ id: "o1", status: "PENDING", ts: app.state.t }];
  app.advance(FOREGROUND_SETTLE_MS + 100);
  listener.onSnapshot(orders);

  // Nessuna chiamata a leave()/enter(): la piattaforma non ha detto nulla.
  app.advance(NIGHT);
  listener.onSnapshot([{ id: "o1", status: "DELIVERED", ts: app.state.t - NIGHT / 2 }]);
  check(
    "epoca ferma per eventi mancanti → la freschezza blocca comunque",
    listener.toasts === 0,
  );

  // E viceversa: se il timestamp fosse inaffidabile, l'epoca tiene.
  const app2 = makeApp();
  const l2 = makeListener(app2.presence, { getEventTs: () => null });
  app2.advance(FOREGROUND_SETTLE_MS + 100);
  l2.onSnapshot(orders);
  app2.leave();
  app2.advance(NIGHT);
  app2.enter();
  app2.advance(60_000);
  l2.onSnapshot([{ id: "o1", status: "DELIVERED", ts: null }]);
  check("timestamp assenti → la ri-semina blocca comunque", l2.toasts === 0);
}

// ══════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ ${passed} test superati, 0 falliti`);
  process.exit(0);
} else {
  console.log(`❌ ${passed} superati, ${failures.length} FALLITI:`);
  failures.forEach(f => console.log(`   · ${f}`));
  process.exit(1);
}
