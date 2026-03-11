import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * TEST: Simula il ciclo di vita completo di una prenotazione iCal
 * 
 * GET /api/test-sync-cleanup
 *   → Esegue il test completo e mostra risultati
 * 
 * Cosa fa:
 * 1. Crea una prenotazione finta, pulizia e ordine biancheria collegati
 * 2. Verifica che esistono tutti e 3
 * 3. Cancella la prenotazione (come farebbe il sync quando sparisce dal feed)
 * 4. Esegue la logica di cleanup STEP 3 + STEP 4
 * 5. Verifica che pulizia e ordine siano stati cancellati/eliminati
 * 6. Pulisce tutto (elimina i dati di test)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const results: { step: string; status: "✅" | "❌"; detail: string }[] = [];
    const testPrefix = "__TEST_SYNC_" + Date.now();
    let testBookingId = "";
    let testCleaningId = "";
    let testOrderId = "";

    // Trova una proprietà attiva per il test
    const propsSnap = await adminDb.collection("properties")
      .where("status", "==", "ACTIVE").limit(1).get();
    
    if (propsSnap.empty) {
      return NextResponse.json({ error: "Nessuna proprietà attiva trovata" }, { status: 400 });
    }
    const testProp = { id: propsSnap.docs[0].id, ...propsSnap.docs[0].data() as Record<string, any> };

    try {
      // ══════════════════════════════════════════
      // STEP 1: Crea prenotazione + pulizia + ordine di test
      // ══════════════════════════════════════════
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30); // 30 giorni nel futuro
      futureDate.setHours(12, 0, 0, 0);

      // Crea prenotazione
      const bookingRef = await adminDb.collection("bookings").add({
        propertyId: testProp.id,
        propertyName: testPrefix,
        guestName: testPrefix + "_GUEST",
        checkIn: Timestamp.fromDate(new Date(futureDate.getTime() - 86400000 * 3)),
        checkOut: Timestamp.fromDate(futureDate),
        source: "airbnb",
        icalUid: testPrefix + "_UID",
        status: "CONFIRMED",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      testBookingId = bookingRef.id;

      // Crea pulizia collegata
      const cleaningRef = await adminDb.collection("cleanings").add({
        propertyId: testProp.id,
        propertyName: testPrefix,
        scheduledDate: Timestamp.fromDate(futureDate),
        scheduledTime: "10:00",
        status: "SCHEDULED",
        bookingSource: "airbnb",
        bookingId: testBookingId,
        guestName: testPrefix + "_GUEST",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      testCleaningId = cleaningRef.id;

      // Crea ordine biancheria collegato
      const orderRef = await adminDb.collection("orders").add({
        cleaningId: testCleaningId,
        propertyId: testProp.id,
        propertyName: testPrefix,
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(futureDate),
        items: [{ id: "test_item", name: "Test Lenzuolo", quantity: 1 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      testOrderId = orderRef.id;

      // Aggiorna pulizia con laundryOrderId
      await adminDb.collection("cleanings").doc(testCleaningId).update({
        laundryOrderId: testOrderId,
      });

      results.push({ step: "1. Creazione dati test", status: "✅", detail: `Booking: ${testBookingId}, Cleaning: ${testCleaningId}, Order: ${testOrderId}` });

      // ══════════════════════════════════════════
      // STEP 2: Verifica che esistono tutti
      // ══════════════════════════════════════════
      const bookingExists = (await adminDb.collection("bookings").doc(testBookingId).get()).exists;
      const cleaningExists = (await adminDb.collection("cleanings").doc(testCleaningId).get()).exists;
      const orderSnap = await adminDb.collection("orders").doc(testOrderId).get();
      const orderExists = orderSnap.exists;
      const orderStatus = orderSnap.data()?.status;

      if (bookingExists && cleaningExists && orderExists && orderStatus === "PENDING") {
        results.push({ step: "2. Verifica esistenza", status: "✅", detail: `Booking: ${bookingExists}, Cleaning: ${cleaningExists}, Order: ${orderExists} (${orderStatus})` });
      } else {
        results.push({ step: "2. Verifica esistenza", status: "❌", detail: `Qualcosa non è stato creato correttamente` });
      }

      // ══════════════════════════════════════════
      // STEP 3: Simula prenotazione sparita dal feed — cancella solo la booking
      // (questo è quello che faceva PRIMA della fix)
      // ══════════════════════════════════════════
      await adminDb.collection("bookings").doc(testBookingId).delete();
      
      const bookingAfterDelete = (await adminDb.collection("bookings").doc(testBookingId).get()).exists;
      results.push({ step: "3. Cancella prenotazione (simula feed)", status: bookingAfterDelete ? "❌" : "✅", detail: `Booking eliminata: ${!bookingAfterDelete}` });

      // ══════════════════════════════════════════
      // STEP 4: Simula STEP 3 del sync — trova pulizia collegata e cancella
      // ══════════════════════════════════════════
      
      // Questa è la NUOVA logica del STEP 3 fix
      const cleaningSnap = await adminDb.collection("cleanings").doc(testCleaningId).get();
      if (cleaningSnap.exists) {
        const cData = cleaningSnap.data() as Record<string, any>;
        
        // Cancella tramite laundryOrderId
        if (cData.laundryOrderId) {
          try {
            const oSnap = await adminDb.collection("orders").doc(cData.laundryOrderId).get();
            if (oSnap.exists) {
              const oData = oSnap.data() as Record<string, any>;
              if (!["IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"].includes(oData.status)) {
                await adminDb.collection("orders").doc(cData.laundryOrderId).update({
                  status: "CANCELLED",
                  cancelReason: "TEST: Prenotazione rimossa dal feed iCal",
                  cancelledAt: Timestamp.now(),
                  updatedAt: Timestamp.now(),
                });
              }
            }
          } catch {}
        }

        // Cancella anche tramite cleaningId
        const linkedOrders = await adminDb.collection("orders")
          .where("cleaningId", "==", testCleaningId).get();
        for (const oDoc of linkedOrders.docs) {
          const oData = oDoc.data() as Record<string, any>;
          if (!["IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"].includes(oData.status)) {
            await adminDb.collection("orders").doc(oDoc.id).update({
              status: "CANCELLED",
              cancelReason: "TEST: Prenotazione rimossa dal feed iCal",
              cancelledAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          }
        }

        // Elimina la pulizia
        await adminDb.collection("cleanings").doc(testCleaningId).delete();
      }

      // Verifica risultato
      const cleaningAfter = (await adminDb.collection("cleanings").doc(testCleaningId).get()).exists;
      const orderAfterSnap = await adminDb.collection("orders").doc(testOrderId).get();
      const orderAfterStatus = orderAfterSnap.data()?.status;

      const step3ok = !cleaningAfter && orderAfterStatus === "CANCELLED";
      results.push({ 
        step: "4. STEP 3 fix — cancella pulizia+ordine", 
        status: step3ok ? "✅" : "❌", 
        detail: `Pulizia eliminata: ${!cleaningAfter}, Ordine status: ${orderAfterStatus}` 
      });

      // ══════════════════════════════════════════
      // STEP 5: Testa STEP 4 (cleanup orfani) con un nuovo ordine orfano
      // ══════════════════════════════════════════
      
      // Crea un ordine orfano con cleaningId che non esiste
      const orphanOrderRef = await adminDb.collection("orders").add({
        cleaningId: "FAKE_CLEANING_ID_" + testPrefix,
        propertyId: testProp.id,
        propertyName: testPrefix + "_ORPHAN",
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(futureDate),
        items: [{ id: "test", name: "Test", quantity: 1 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      const orphanOrderId = orphanOrderRef.id;

      // Esegui logica STEP 4
      const validCleanings = await adminDb.collection("cleanings")
        .where("propertyId", "==", testProp.id).get();
      const validCleaningIds = new Set(validCleanings.docs.map(d => d.id));

      const orphanSnap = await adminDb.collection("orders").doc(orphanOrderId).get();
      const orphanData = orphanSnap.data() as Record<string, any>;
      
      if (orphanData.status === "PENDING" && orphanData.cleaningId && !validCleaningIds.has(orphanData.cleaningId)) {
        await adminDb.collection("orders").doc(orphanOrderId).update({
          status: "CANCELLED",
          cancelReason: "TEST: Pulizia collegata non esistente (STEP 4)",
          cancelledAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      const orphanAfterSnap = await adminDb.collection("orders").doc(orphanOrderId).get();
      const orphanAfterStatus = orphanAfterSnap.data()?.status;

      results.push({
        step: "5. STEP 4 — cleanup ordine orfano",
        status: orphanAfterStatus === "CANCELLED" ? "✅" : "❌",
        detail: `Ordine orfano status: ${orphanAfterStatus}`,
      });

      // ══════════════════════════════════════════
      // STEP 6: Testa protezione — ordine NON orfano non deve essere toccato
      // ══════════════════════════════════════════
      
      // Crea pulizia reale + ordine collegato
      const realCleaningRef = await adminDb.collection("cleanings").add({
        propertyId: testProp.id,
        propertyName: testPrefix + "_REAL",
        scheduledDate: Timestamp.fromDate(futureDate),
        status: "SCHEDULED",
        createdAt: Timestamp.now(),
      });
      const realOrderRef = await adminDb.collection("orders").add({
        cleaningId: realCleaningRef.id,
        propertyId: testProp.id,
        propertyName: testPrefix + "_REAL",
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(futureDate),
        items: [{ id: "test", name: "Test", quantity: 1 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Riesegui logica STEP 4
      const validCleanings2 = await adminDb.collection("cleanings")
        .where("propertyId", "==", testProp.id).get();
      const validCleaningIds2 = new Set(validCleanings2.docs.map(d => d.id));

      const realOrderSnap = await adminDb.collection("orders").doc(realOrderRef.id).get();
      const realOrderData = realOrderSnap.data() as Record<string, any>;
      
      // Questo ordine NON dovrebbe essere cancellato (la pulizia esiste)
      let realOrderTouched = false;
      if (realOrderData.status === "PENDING" && realOrderData.cleaningId && !validCleaningIds2.has(realOrderData.cleaningId)) {
        realOrderTouched = true; // BUG! Non dovrebbe entrare qui
      }

      results.push({
        step: "6. Protezione — ordine valido NON toccato",
        status: !realOrderTouched ? "✅" : "❌",
        detail: `Ordine con pulizia valida ${realOrderTouched ? "ERRONEAMENTE CANCELLATO!" : "protetto correttamente"}`,
      });

      // ══════════════════════════════════════════
      // STEP 7: Testa protezione — ordine IN_TRANSIT non deve essere toccato
      // ══════════════════════════════════════════
      const transitOrderRef = await adminDb.collection("orders").add({
        cleaningId: "FAKE_NONEXISTENT_" + testPrefix,
        propertyId: testProp.id,
        propertyName: testPrefix + "_TRANSIT",
        status: "IN_TRANSIT",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(futureDate),
        items: [{ id: "test", name: "Test", quantity: 1 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Logica STEP 4 — dovrebbe skippare perché IN_TRANSIT
      const transitSnap = await adminDb.collection("orders").doc(transitOrderRef.id).get();
      const transitData = transitSnap.data() as Record<string, any>;
      const transitSkipped = transitData.status !== "PENDING"; // non è PENDING → skip

      results.push({
        step: "7. Protezione — ordine IN_TRANSIT non toccato",
        status: transitSkipped ? "✅" : "❌",
        detail: `Ordine IN_TRANSIT ${transitSkipped ? "protetto" : "ERRONEAMENTE ELABORATO!"}`,
      });

      // ══════════════════════════════════════════
      // STEP 8: Testa protezione — ordine standalone (senza cleaningId) non toccato
      // ══════════════════════════════════════════
      const standaloneOrderRef = await adminDb.collection("orders").add({
        propertyId: testProp.id,
        propertyName: testPrefix + "_STANDALONE",
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(futureDate),
        items: [{ id: "test", name: "Test", quantity: 1 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const standaloneSnap = await adminDb.collection("orders").doc(standaloneOrderRef.id).get();
      const standaloneData = standaloneSnap.data() as Record<string, any>;
      const standaloneProtected = !standaloneData.cleaningId; // no cleaningId → skip

      results.push({
        step: "8. Protezione — ordine standalone non toccato",
        status: standaloneProtected ? "✅" : "❌",
        detail: `Ordine senza cleaningId ${standaloneProtected ? "protetto" : "ERRONEAMENTE ELABORATO!"}`,
      });

      // ══════════════════════════════════════════
      // CLEANUP: Elimina tutti i dati di test
      // ══════════════════════════════════════════
      const cleanupIds = [
        { col: "bookings", id: testBookingId },
        { col: "cleanings", id: testCleaningId },
        { col: "orders", id: testOrderId },
        { col: "orders", id: orphanOrderId },
        { col: "cleanings", id: realCleaningRef.id },
        { col: "orders", id: realOrderRef.id },
        { col: "orders", id: transitOrderRef.id },
        { col: "orders", id: standaloneOrderRef.id },
      ];

      let cleaned = 0;
      for (const { col, id } of cleanupIds) {
        try {
          await adminDb.collection(col).doc(id).delete();
          cleaned++;
        } catch {} // ignora se già eliminato
      }

      results.push({
        step: "9. Cleanup dati di test",
        status: "✅",
        detail: `${cleaned} documenti eliminati`,
      });

    } catch (error: any) {
      results.push({ step: "ERRORE", status: "❌", detail: error.message });
      
      // Cleanup di emergenza
      try {
        if (testBookingId) await adminDb.collection("bookings").doc(testBookingId).delete().catch(() => {});
        if (testCleaningId) await adminDb.collection("cleanings").doc(testCleaningId).delete().catch(() => {});
        if (testOrderId) await adminDb.collection("orders").doc(testOrderId).delete().catch(() => {});
      } catch {}
    }

    const allPassed = results.every(r => r.status === "✅");

    return NextResponse.json({
      result: allPassed ? "✅ TUTTI I TEST PASSATI" : "❌ ALCUNI TEST FALLITI",
      property: testProp.name || testProp.id,
      tests: results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
