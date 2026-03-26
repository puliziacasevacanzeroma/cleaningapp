/**
 * AUDIT PAGAMENTI — Esegui con: npx tsx audit-pagamenti.ts
 * Dalla root del progetto (cleaningapp-main/)
 */

// Carica .env.local come fa Next.js
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

// Leggi .env.local
const envPath = path.resolve(__dirname2, ".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf-8");
  const lines = raw.split("\n");
  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      currentValue += "\n" + line;
      if (line.includes('"') || line.includes("'")) {
        inMultiline = false;
        currentValue = currentValue.replace(/^["']|["']$/g, "");
        if (!process.env[currentKey]) process.env[currentKey] = currentValue;
      }
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if ((value.startsWith('"') && !value.endsWith('"')) || (value.startsWith("'") && !value.endsWith("'"))) {
      currentKey = key;
      currentValue = value;
      inMultiline = true;
      continue;
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// Importa Firebase Admin dal progetto
const { adminDb } = await import("./src/lib/firebase/admin.js");

const OWNER_EMAIL = "damianiariele@gmail.com";

async function main() {
  const db = adminDb;
  console.log("=".repeat(80));
  console.log("AUDIT PAGAMENTI");
  console.log("=".repeat(80));

  const usersSnap = await db.collection("users").where("email", "==", OWNER_EMAIL).get();
  if (usersSnap.empty) { console.log(`Utente ${OWNER_EMAIL} non trovato!`); return; }
  const userDoc = usersSnap.docs[0];
  const userId = userDoc.id;
  const userData = userDoc.data();
  console.log(`\nUtente: ${userData.name} (${userData.email}) | ID: ${userId} | Ruolo: ${userData.role}`);

  const propsSnap = await db.collection("properties").where("ownerId", "==", userId).get();
  console.log(`\n${"=".repeat(80)}`);
  console.log(`PROPRIETÀ: ${propsSnap.size}`);
  console.log("=".repeat(80));
  const propertyIds: string[] = [];
  const propNames = new Map<string, string>();
  propsSnap.docs.forEach(d => {
    const data = d.data();
    propertyIds.push(d.id);
    propNames.set(d.id, data.name || "?");
    console.log(`  [${data.status}] ${data.name} — €${data.cleaningPrice || 0}`);
  });
  if (propertyIds.length === 0) { console.log("Nessuna proprietà!"); return; }

  // PULIZIE
  const allCleanings: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 10) {
    const chunk = propertyIds.slice(i, i + 10);
    const snap = await db.collection("cleanings").where("propertyId", "in", chunk).get();
    snap.docs.forEach(d => allCleanings.push({ id: d.id, ...d.data() }));
  }
  allCleanings.sort((a, b) => (a.scheduledDate?.toDate?.()?.getTime() || 0) - (b.scheduledDate?.toDate?.()?.getTime() || 0));

  console.log(`\n${"=".repeat(80)}`);
  console.log(`PULIZIE: ${allCleanings.length}`);
  console.log("=".repeat(80));

  const cleaningsByMonth = new Map<string, any[]>();
  const statusCount: Record<string, number> = {};
  allCleanings.forEach(c => {
    statusCount[c.status] = (statusCount[c.status] || 0) + 1;
    const date = c.scheduledDate?.toDate?.();
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!cleaningsByMonth.has(key)) cleaningsByMonth.set(key, []);
    cleaningsByMonth.get(key)!.push(c);
  });

  console.log("\nPer status:");
  Object.entries(statusCount).sort().forEach(([s, c]) => console.log(`  ${s}: ${c}`));

  let totalePulizieCompletate = 0;
  console.log("\nDettaglio:");
  [...cleaningsByMonth.entries()].sort().forEach(([month, cleanings]) => {
    const completed = cleanings.filter((c: any) => c.status === "COMPLETED");
    const totC = completed.reduce((s: number, c: any) => s + (c.priceOverride ?? c.price ?? 0), 0);
    totalePulizieCompletate += totC;
    console.log(`\n  ${month} — ${cleanings.length} pulizie (${completed.length} COMPLETED = €${totC.toFixed(2)})`);
    cleanings.forEach((c: any) => {
      const date = c.scheduledDate?.toDate?.();
      const ds = date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "??";
      const price = c.priceOverride ?? c.price ?? 0;
      console.log(`     ${ds} | ${c.status.padEnd(12)} | €${String(price).padStart(6)} | ${propNames.get(c.propertyId) || "?"}`);
    });
  });
  console.log(`\n  >>> TOTALE PULIZIE COMPLETED: €${totalePulizieCompletate.toFixed(2)}`);

  // ORDINI
  const allOrders: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 10) {
    const chunk = propertyIds.slice(i, i + 10);
    const snap = await db.collection("orders").where("propertyId", "in", chunk).get();
    snap.docs.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
  }
  const invSnap = await db.collection("inventory").get();
  const invById = new Map(invSnap.docs.map(d => [d.id, d.data()]));

  console.log(`\n${"=".repeat(80)}`);
  console.log(`ORDINI: ${allOrders.length}`);
  console.log("=".repeat(80));

  let totaleOrdiniDelivered = 0;
  const ordersByMonth = new Map<string, any[]>();
  allOrders.forEach(o => {
    let tot = 0;
    if (o.totalPriceOverride != null) { tot = o.totalPriceOverride; }
    else if (Array.isArray(o.items)) {
      o.items.forEach((item: any) => {
        const inv: any = invById.get(item.id);
        tot += (item.priceOverride ?? item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0) * (item.quantity || 1);
      });
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) tot += o.deliveryFee;
    }
    o._total = tot;
    if (o.status === "DELIVERED") totaleOrdiniDelivered += tot;
    const date = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.();
    if (date) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!ordersByMonth.has(key)) ordersByMonth.set(key, []);
      ordersByMonth.get(key)!.push(o);
    }
  });

  console.log("\nDettaglio:");
  [...ordersByMonth.entries()].sort().forEach(([month, orders]) => {
    const del2 = orders.filter((o: any) => o.status === "DELIVERED");
    const totD = del2.reduce((s: number, o: any) => s + o._total, 0);
    console.log(`\n  ${month} — ${orders.length} ordini (${del2.length} DELIVERED = €${totD.toFixed(2)})`);
    orders.forEach((o: any) => {
      const date = (o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.());
      const ds = date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "??";
      console.log(`     ${ds} | ${o.status.padEnd(12)} | €${o._total.toFixed(2).padStart(8)} | ${propNames.get(o.propertyId) || "?"} | ${o.cleaningId ? "annesso" : "standalone"}`);
    });
  });
  console.log(`\n  >>> TOTALE ORDINI DELIVERED: €${totaleOrdiniDelivered.toFixed(2)}`);

  // PAGAMENTI
  let paymentsSnap = await db.collection("payments").where("proprietarioId", "==", userId).get();
  if (paymentsSnap.empty) paymentsSnap = await db.collection("payments").where("ownerId", "==", userId).get();

  console.log(`\n${"=".repeat(80)}`);
  console.log(`PAGAMENTI: ${paymentsSnap.size}`);
  console.log("=".repeat(80));

  let totalePagato = 0;
  const paymentsByMonth = new Map<string, number>();
  paymentsSnap.docs.forEach(d => {
    const data = d.data();
    const amount = data.amount || 0;
    totalePagato += amount;
    const date = data.date?.toDate?.() || data.createdAt?.toDate?.();
    const ds = date ? date.toLocaleDateString("it-IT") : "??";
    const mk = data.month && data.year ? `${data.year}-${String(data.month).padStart(2, "0")}` : "no-mese";
    paymentsByMonth.set(mk, (paymentsByMonth.get(mk) || 0) + amount);
    console.log(`  ${ds} | €${amount.toFixed(2).padStart(8)} | ${data.method || "?"} | competenza: ${mk}`);
  });
  console.log(`\n  >>> TOTALE PAGATO: €${totalePagato.toFixed(2)}`);

  // RIEPILOGO
  console.log(`\n${"=".repeat(80)}`);
  console.log("RIEPILOGO");
  console.log("=".repeat(80));
  console.log(`  Pulizie COMPLETED:  €${totalePulizieCompletate.toFixed(2)}`);
  console.log(`  Ordini DELIVERED:   €${totaleOrdiniDelivered.toFixed(2)}`);
  console.log(`  TOTALE SERVIZI:     €${(totalePulizieCompletate + totaleOrdiniDelivered).toFixed(2)}`);
  console.log(`  PAGATO:             €${totalePagato.toFixed(2)}`);
  console.log(`  SALDO GLOBALE (AI): €${(totalePulizieCompletate + totaleOrdiniDelivered - totalePagato).toFixed(2)}`);

  console.log(`\n  ── PER MESE (come pagina Pagamenti) ──`);
  const allMonths = new Set<string>();
  cleaningsByMonth.forEach((_, k) => allMonths.add(k));
  ordersByMonth.forEach((_, k) => allMonths.add(k));

  [...allMonths].sort().forEach(month => {
    const mC = cleaningsByMonth.get(month) || [];
    const mO = ordersByMonth.get(month) || [];
    const completedIds = new Set(mC.filter((c: any) => c.status === "COMPLETED").map((c: any) => c.id));
    const pulTot = mC.filter((c: any) => c.status === "COMPLETED").reduce((s: number, c: any) => s + (c.priceOverride ?? c.price ?? 0), 0);
    const ordValidi = mO.filter((o: any) => o.status === "DELIVERED" || (o.cleaningId && completedIds.has(o.cleaningId)));
    const ordTot = ordValidi.reduce((s: number, o: any) => s + o._total, 0);
    const pagato = paymentsByMonth.get(month) || 0;
    const totale = pulTot + ordTot;
    if (totale > 0 || pagato > 0) {
      console.log(`  ${month}: servizi €${totale.toFixed(2)} (pulizie €${pulTot.toFixed(2)} + ordini €${ordTot.toFixed(2)}) | pagato €${pagato.toFixed(2)} | saldo €${(totale - pagato).toFixed(2)}`);
    }
  });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
