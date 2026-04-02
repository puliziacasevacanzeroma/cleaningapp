import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/test-inventory-flow
 * 
 * Diagnostica: simula il flusso di deduzione inventario per pulizie recenti.
 * NON modifica nulla — è solo lettura.
 * 
 * Cosa controlla:
 * 1. Per ogni pulizia COMPLETED recente, cerca l'ordine collegato
 * 2. Verifica se l'ordine è stato trovato (e con quale metodo)
 * 3. Verifica se inventoryDeducted è true
 * 4. Verifica se gli items dell'ordine matchano articoli in inventario
 * 5. Segnala problemi trovati
 * 
 * Query params:
 *   ?days=7        (default 7 — quanti giorni indietro guardare)
 *   ?cleaningId=X  (opzionale — testa UNA pulizia specifica)
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "7");
    const specificCleaningId = url.searchParams.get("cleaningId");

    // ── Carica inventario per verificare matching items ──
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryMap = new Map<string, { docId: string; name: string; key: string; quantity: number }>();
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();

    inventorySnap.docs.forEach(doc => {
      const data = doc.data();
      const item = { docId: doc.id, name: data.name || "", key: data.key || doc.id, quantity: data.quantity || 0 };
      inventoryMap.set(doc.id, item);
      if (data.name) nameToDocId.set(data.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (data.key) keyToDocId.set(data.key, doc.id);
    });

    // ── Carica pulizie ──
    let cleaningsSnap;
    if (specificCleaningId) {
      const doc = await adminDb.collection("cleanings").doc(specificCleaningId).get();
      cleaningsSnap = doc.exists ? [doc] : [];
    } else {
      const since = new Date();
      since.setDate(since.getDate() - days);
      // Usa solo completedAt per evitare indice composito — filtra status in JS
      const snap = await adminDb.collection("cleanings")
        .where("completedAt", ">=", since)
        .orderBy("completedAt", "desc")
        .limit(100)
        .get();
      cleaningsSnap = snap.docs.filter(d => d.data().status === "COMPLETED");
    }

    const results: any[] = [];
    let totalOk = 0;
    let totalProblems = 0;

    for (const cleaningDoc of cleaningsSnap) {
      const cleaning = cleaningDoc.data() as Record<string, any>;
      const cleaningId = cleaningDoc.id;

      const result: any = {
        cleaningId,
        propertyName: cleaning.propertyName || "?",
        status: cleaning.status,
        completedAt: cleaning.completedAt?.toDate?.()?.toISOString() || null,
        laundryOrderId: cleaning.laundryOrderId || null,
        requiresLaundry: cleaning.requiresLaundry || false,
        problems: [],
        orderFound: false,
        orderMethod: null,
        orderStatus: null,
        inventoryDeducted: null,
        orderItems: [],
        itemMatching: [],
      };

      // Se non richiede biancheria, skip
      if (!cleaning.requiresLaundry && !cleaning.laundryOrderId && !cleaning.hasLinenOrder) {
        result.problems.push("INFO: Pulizia senza biancheria — niente da scalare");
        results.push(result);
        totalOk++;
        continue;
      }

      // ── Metodo 1: laundryOrderId ──
      let orderDoc: any = null;
      let orderData: any = null;
      let method = "";

      if (cleaning.laundryOrderId) {
        const snap = await adminDb.collection("orders").doc(cleaning.laundryOrderId).get();
        if (snap.exists) {
          orderDoc = snap;
          orderData = snap.data();
          method = "metodo1-laundryOrderId";
        } else {
          result.problems.push(`WARN: laundryOrderId="${cleaning.laundryOrderId}" NON esiste in Firestore`);
        }
      }

      // ── Metodo 2: cleaningId ──
      if (!orderDoc) {
        const snap = await adminDb.collection("orders").where("cleaningId", "==", cleaningId).get();
        if (!snap.empty) {
          orderDoc = snap.docs[0];
          orderData = orderDoc.data();
          method = "metodo2-cleaningId";
          if (snap.size > 1) {
            result.problems.push(`WARN: Trovati ${snap.size} ordini con cleaningId — uso il primo`);
          }
        }
      }

      // ── Metodo 3: propertyId + data ──
      if (!orderDoc && cleaning.propertyId && cleaning.scheduledDate) {
        const scheduledDate = cleaning.scheduledDate.toDate ? cleaning.scheduledDate.toDate() : new Date(cleaning.scheduledDate);
        const startOfDay = new Date(scheduledDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(scheduledDate); endOfDay.setHours(23, 59, 59, 999);

        const snap = await adminDb.collection("orders").where("propertyId", "==", cleaning.propertyId).get();
        for (const doc of snap.docs) {
          const data = doc.data();
          const orderDate = data.scheduledDate?.toDate ? data.scheduledDate.toDate() : null;
          if (orderDate && orderDate >= startOfDay && orderDate <= endOfDay) {
            orderDoc = doc;
            orderData = data;
            method = "metodo3-propertyId+data";
            break;
          }
        }
      }

      if (!orderDoc || !orderData) {
        result.problems.push("ERRORE: Nessun ordine trovato con nessuno dei 3 metodi!");
        result.orderFound = false;
        results.push(result);
        totalProblems++;
        continue;
      }

      result.orderFound = true;
      result.orderMethod = method;
      result.orderId = orderDoc.id;
      result.orderStatus = orderData.status;
      result.inventoryDeducted = orderData.inventoryDeducted === true;
      result.autoConfirmedByCleaningCompletion = orderData.autoConfirmedByCleaningCompletion || false;

      // ── Verifica status ordine ──
      if (orderData.status !== "DELIVERED") {
        result.problems.push(`ERRORE: Ordine ${orderDoc.id} ha status="${orderData.status}" — dovrebbe essere DELIVERED dopo completamento pulizia!`);
        totalProblems++;
      }

      // ── Verifica inventoryDeducted ──
      if (orderData.inventoryDeducted !== true) {
        result.problems.push(`ERRORE: inventoryDeducted NON è true — l'inventario NON è stato scalato!`);
        totalProblems++;
      }

      // ── Verifica matching items inventario ──
      const items = orderData.items || [];
      result.orderItems = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
      }));

      for (const item of items) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        const inventoryDocId = keyToDocId.get(item.id) || nameToDocId.get(item.name);
        if (!inventoryDocId) {
          result.itemMatching.push({
            itemId: item.id,
            itemName: item.name,
            quantity: qty,
            matched: false,
            problem: `Nessun match in inventario per id="${item.id}" o name="${item.name}"`,
          });
          result.problems.push(`WARN: Item "${item.name}" (id=${item.id}) non trovato in inventario`);
        } else {
          const invItem = inventoryMap.get(inventoryDocId);
          result.itemMatching.push({
            itemId: item.id,
            itemName: item.name,
            quantity: qty,
            matched: true,
            inventoryDocId,
            inventoryName: invItem?.name,
            currentStock: invItem?.quantity,
          });
        }
      }

      if (result.problems.length === 0) {
        totalOk++;
      }

      results.push(result);
    }

    return NextResponse.json({
      summary: {
        totalChecked: results.length,
        ok: totalOk,
        problems: totalProblems,
        inventoryItemsTotal: inventoryMap.size,
        checkedDays: specificCleaningId ? "N/A" : days,
      },
      results,
    });
  } catch (error) {
    console.error("Errore test inventario:", error);
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
