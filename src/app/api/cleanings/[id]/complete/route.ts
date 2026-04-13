import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { resend, FROM_EMAIL, APP_URL } from "~/lib/email/config";
import { cleaningCompletedEmail } from "~/lib/email/templates";
import { validateBody, CompleteCleaningSchema } from "~/lib/validation/schemas";

// 📦 Helper: sottrai items di un ordine dall'inventario
async function subtractOrderFromInventory(orderItems: any[]) {
  if (!orderItems || orderItems.length === 0) return;
  try {
    const { loadInventoryResolver } = await import("~/lib/inventoryResolver");
    const { resolveToDocId } = await loadInventoryResolver();
    
    for (const item of orderItems) {
      const qty = item.quantity || 0;
      if (qty <= 0) continue;
      const inventoryDocId = resolveToDocId(item.id) || resolveToDocId(item.name);
      if (!inventoryDocId) {
        console.warn(`📦 [complete] Item non trovato in inventario: id="${item.id}" name="${item.name}"`);
        continue;
      }
      await adminDb.collection("inventory").doc(inventoryDocId).update({
        quantity: FieldValue.increment(-qty),
        updatedAt: Timestamp.now(),
      });
    }
  } catch (e) {
    console.error("Errore sottrazione inventario (auto-deliver):", e);
  }
}

// ── Tipi locali ──────────────────────────────────────────────────────────────
// @ts-expect-error TODO-FIX: TS2300 Duplicate identifier 'IssueInput'.
type IssueInput = {
  severity: string;
  title: string;
  description?: string;
  photos?: string[];
};

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface PropertyRatingInput {
  scores: {
    cleanliness: number;       // 1-5
    checkoutPunctuality: number;
    generalCondition: number;
    damages: number;
  };
  operatorNotes?: string;
  publicNotes?: string;
  damagePhotoIds?: string[];
}

// @ts-expect-error TODO-FIX: TS2300 Duplicate identifier 'IssueInput'.
interface IssueInput {
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  location?: string;
  photoIds?: string[];
  estimatedCost?: number;
}

interface ExtraChargeInput {
  type: string;
  description: string;
  amount: number;
  chargeToOwner?: boolean;
  chargeToGuest?: boolean;
  issueId?: string;
}

interface CompleteCleaningBody {
  operatorNotes?: string;
  rating?: PropertyRatingInput;
  issues?: IssueInput[];
  extraCharges?: ExtraChargeInput[];
  photoIds?: string[];
  photosCount?: number;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function calculateAverageRating(scores: PropertyRatingInput["scores"]): number {
  const values = Object.values(scores);
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════
// POST - Completa pulizia
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body = await validateBody(req, CompleteCleaningSchema);
    if (body instanceof Response) return body;
    
    // Carica la pulizia
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();
    
    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();

    // 📲📧 Se notifyOnly, invia notifiche + push + email al proprietario e admin, poi esci
    if ((body).notifyOnly || (body).emailOnly) {
      const notifyIssues = (body).issues || [];
      const operatorName = (body).operatorName || "Operatore";
      const hasProductRequest = (body).hasProductRequest || false;
      const productCount = (body).productCount || 0;
      
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      let ownerIdForNotif = cleaning.ownerId;
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      if (!ownerIdForNotif && cleaning.propertyId) {
        try {
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          const propDoc = await adminDb.collection("properties").doc(cleaning.propertyId).get();
          if (propDoc.exists) {
            ownerIdForNotif = (propDoc.data() as Record<string, any>).ownerId;
          }
        } catch (e) {
          console.error("Errore caricamento proprietà per ownerId:", e);
        }
      }
      
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }) || "oggi";
      const hasIssues = notifyIssues.length > 0;

      // 1️⃣ NOTIFICA + PUSH ADMIN
      try {
        await createNotification({
          title: "✅ Pulizia Completata",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          message: `${operatorName} ha completato la pulizia di "${cleaning.propertyName}".${hasProductRequest ? ` (+ richiesta ${productCount} prodotti)` : ""}`,
          type: "CLEANING_COMPLETED",
          recipientRole: "ADMIN",
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          link: `/dashboard?openCleaning=${id}`,
        });
      } catch (e) { console.error("Errore notifica admin:", e); }

      // 2️⃣ NOTIFICA + PUSH + EMAIL PROPRIETARIO
      if (ownerIdForNotif) {
        try {
          await createNotification({
            title: "✅ Pulizia Completata",
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            message: `La pulizia di "${cleaning.propertyName}" è stata completata.`,
            type: "CLEANING_COMPLETED",
            recipientRole: "PROPRIETARIO",
            recipientId: ownerIdForNotif,
            senderId: "system",
            senderName: "Sistema",
            relatedEntityId: id,
            relatedEntityType: "CLEANING",
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            relatedEntityName: cleaning.propertyName,
            link: `/proprietario/calendario/pulizie?id=${id}`,
          });
        } catch (e) { console.error("Errore notifica proprietario:", e); }

        // 📧 Email proprietario
        if (resend) {
          try {
            const ownerDoc = await adminDb.collection("users").doc(ownerIdForNotif).get();
            const ownerEmail = ownerDoc.exists ? (ownerDoc.data() as Record<string, any>).email : null;
            const ownerName = ownerDoc.exists ? (ownerDoc.data() as Record<string, any>).name : "Proprietario";
            if (ownerEmail) {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: ownerEmail,
                subject: hasIssues 
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  ? `⚠️ Pulizia completata con segnalazioni - ${cleaning.propertyName}`
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  : `✅ Pulizia completata - ${cleaning.propertyName}`,
                html: cleaningCompletedEmail({
                  ownerName,
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  propertyName: cleaning.propertyName,
                  dateStr,
                  issuesCount: notifyIssues.length,
                  cleaningId: id,
                  isOwner: true,
                }),
              });
            }
          } catch (emailError) {
            console.error("Errore invio email proprietario (complete):", emailError);
          }
        }
      }
      
      return NextResponse.json({ success: true, notifyOnly: true });
    }
    
    // ─── VERIFICA STATO ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.status !== "IN_PROGRESS" && cleaning.status !== "ASSIGNED") {
      return NextResponse.json({ 
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        error: `Impossibile completare: stato attuale "${cleaning.status}"` 
      }, { status: 400 });
    }
    
    // ─── VERIFICA OPERATORE ───
    const isAdmin = user.role === "ADMIN";
    const isAssignedOperator = 
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      cleaning.operatorId === user.id ||
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      (cleaning.operators || []).some((op: { id: string }) => op.id === user.id);
    
    if (!isAdmin && !isAssignedOperator) {
      return NextResponse.json({ 
        error: "Non sei assegnato a questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── VERIFICA MINIMO FOTO ───
    const photosCount = body.photosCount || (body.photoIds?.length || 0);
    const minPhotosRequired = 10; // Configurabile in futuro da serviceType
    
    if (photosCount < minPhotosRequired) {
      return NextResponse.json({ 
        error: `Servono almeno ${minPhotosRequired} foto (caricate: ${photosCount})` 
      }, { status: 400 });
    }
    
    const now = Timestamp.now();
    
    // ─── CALCOLA DURATA ───
    let duration = 0;
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.startedAt) {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const startTime = cleaning.startedAt.toDate?.() || new Date(cleaning.startedAt);
      const endTime = now.toDate();
      duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)); // minuti
    }
    
    // ─── CREA RATING ───
    let ratingId = null;
    let averageRating = 0;
    
    if (body.rating) {
      averageRating = calculateAverageRating(body.rating.scores);
      
      const ratingRef = await adminDb.collection("propertyRatings").add({
        cleaningId: id,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        propertyId: cleaning.propertyId,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingId: cleaning.bookingId || null,
        scores: body.rating.scores,
        averageScore: averageRating,
        operatorNotes: body.rating.operatorNotes || null,
        publicNotes: body.rating.publicNotes || null,
        damagePhotoIds: body.rating.damagePhotoIds || [],
        ratedBy: user.id,
        ratedAt: now,
      });
      
      ratingId = ratingRef.id;
      if (process.env.NODE_ENV !== "production") console.log(`⭐ Rating salvato: ${ratingId} (media: ${averageRating})`);
    }
    
    // ─── CREA ISSUES ───
    const issueIds: string[] = [];
    const mainIssueIds: string[] = []; // IDs nella collection principale "issues"
    
    if (body.issues && body.issues.length > 0) {
      for (const issue of body.issues) {
        // Salva in cleaningIssues (per storico pulizia)
        const issueRef = await adminDb.collection("cleaningIssues").add({
          cleaningId: id,
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          propertyId: cleaning.propertyId,
          category: issue.category,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          location: issue.location || null,
          photoIds: issue.photoIds || [],
          estimatedCost: issue.estimatedCost || null,
          status: "reported",
          reportedBy: user.id,
          reportedAt: now,
          chargedToGuest: false,
        });
        
        issueIds.push(issueRef.id);
        if (process.env.NODE_ENV !== "production") console.log(`⚠️ Issue salvato in cleaningIssues: ${issueRef.id} (${issue.severity})`);
        
        // Salva ANCHE nella collection principale "issues" per la pagina segnalazioni
        const mainIssueRef = await adminDb.collection("issues").add({
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          propertyId: cleaning.propertyId,
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          propertyName: cleaning.propertyName,
          cleaningId: id,
          type: issue.category || 'other',
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          status: 'open',
          photos: issue.photoIds || [],
          isUrgent: issue.severity === 'critical' || issue.severity === 'high',
          resolved: false,
          reportedBy: user.id,
          reportedByName: user.name || user.email || 'Operatore',
          reportedAt: now,
          createdAt: now,
          updatedAt: now,
          linkedCleaningIssueId: issueRef.id, // Link alla versione in cleaningIssues
        });
        
        mainIssueIds.push(mainIssueRef.id);
        if (process.env.NODE_ENV !== "production") console.log(`⚠️ Issue salvato in issues: ${mainIssueRef.id} (${issue.severity})`);
      }
    }
    
    // ─── CREA EXTRA CHARGES ───
    const extraChargeIds: string[] = [];
    let extraChargesTotal = 0;
    
    if (body.extraCharges && body.extraCharges.length > 0) {
      for (const charge of body.extraCharges) {
        const chargeRef = await adminDb.collection("extraCharges").add({
          cleaningId: id,
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          propertyId: cleaning.propertyId,
          type: charge.type,
          description: charge.description,
          amount: charge.amount,
          chargeToOwner: charge.chargeToOwner || false,
          chargeToGuest: charge.chargeToGuest || false,
          issueId: charge.issueId || null,
          requiresApproval: true,
          approved: false,
          createdBy: user.id,
          createdAt: now,
        });
        
        extraChargeIds.push(chargeRef.id);
        extraChargesTotal += charge.amount;
        if (process.env.NODE_ENV !== "production") console.log(`💰 Extra charge salvato: ${chargeRef.id} (€${charge.amount})`);
      }
    }
    
    // ─── CALCOLA PREZZO FINALE ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const basePrice = cleaning.price || cleaning.cleaningPrice || 0;
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const holidayFee = cleaning.holidayFee || 0;
    const finalPrice = basePrice + holidayFee + extraChargesTotal;
    
    // ─── AGGIORNA PULIZIA ───
    await cleaningRef.update({ 
      status: "COMPLETED",
      completedAt: now,
      completedBy: user.id,
      duration,
      operatorNotes: body.operatorNotes || null,
      photosCount,
      photoIds: body.photoIds || [],
      issuesCount: issueIds.length,
      issueIds,
      extraChargeIds,
      extraChargesTotal,
      finalPrice,
      ratingId,
      averageRating,
      updatedAt: now
    });
    
    // ─── AUTO-CONFERMA ORDINE BIANCHERIA COLLEGATO ───
    let laundryOrderConfirmed = false;
    try {
      // Helper: conferma un ordine, scala inventario, segna precedenti come ritirati
      const confirmOrder = async (orderDocId: string, orderData: any, method: string) => {
        // Se già DELIVERED, CANCELLED o COMPLETED, non fare nulla
        const skipStatuses = ["DELIVERED", "CANCELLED", "COMPLETED"];
        if (skipStatuses.includes(orderData.status)) {
          console.log(`📦 [complete] Ordine ${orderDocId} status=${orderData.status} — skip (${method})`);
          return false;
        }
        
        const orderUpdateData: any = {
          status: "DELIVERED",
          deliveredAt: now,
          autoConfirmedByCleaningCompletion: true,
          completedCleaningId: id,
          pickupCompleted: false,
          updatedAt: now,
        };
        
        // 📦 Scala inventario SOLO se non già scalato
        if (orderData.inventoryDeducted !== true) {
          await subtractOrderFromInventory(orderData.items || []);
          orderUpdateData.inventoryDeducted = true;
          console.log(`📦 [complete] Inventario scalato per ordine ${orderDocId} (${method}) — ${(orderData.items || []).length} items`);
        } else {
          console.log(`📦 [complete] Inventario GIA' scalato per ordine ${orderDocId} — skip deduzione (${method})`);
        }
        
        await adminDb.collection("orders").doc(orderDocId).update(orderUpdateData);
        console.log(`📦 [complete] Ordine ${orderDocId} auto-confermato DELIVERED (${method})`);
        
        // 🔄 Segna ordini precedenti come ritirati
        if (orderData.pickupFromOrders?.length > 0) {
          for (const prevId of orderData.pickupFromOrders) {
            try {
              await adminDb.collection("orders").doc(prevId).update({
                pickupCompleted: true,
                pickupCompletedAt: now,
                pickupCompletedInOrderId: orderDocId,
              });
            } catch (e) { /* ignore */ }
          }
        }
        
        return true;
      };

      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      console.log(`📦 [complete] Inizio ricerca ordine biancheria per pulizia ${id} — laundryOrderId=${cleaning.laundryOrderId || 'N/A'}`);

      // Metodo 1: Usa laundryOrderId se presente nella pulizia
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      if (cleaning.laundryOrderId) {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const orderRef = adminDb.collection("orders").doc(cleaning.laundryOrderId);
        const orderSnap = await orderRef.get();
        
        if (orderSnap.exists) {
          const orderData = orderSnap.data();
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          laundryOrderConfirmed = await confirmOrder(cleaning.laundryOrderId, orderData, "metodo1-laundryOrderId");
        } else {
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          console.log(`📦 [complete] Metodo 1: laundryOrderId ${cleaning.laundryOrderId} NON trovato in Firestore`);
        }
      }
      
      // Metodo 2: Cerca ordini collegati a questa pulizia (cleaningId)
      if (!laundryOrderConfirmed) {
        const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", id);
        const ordersSnap = await ordersQuery.get();
        console.log(`📦 [complete] Metodo 2: trovati ${ordersSnap.size} ordini con cleaningId=${id}`);
        
        for (const orderDoc of ordersSnap.docs) {
          const orderData = orderDoc.data() as Record<string, any>;
          const confirmed = await confirmOrder(orderDoc.id, orderData, "metodo2-cleaningId");
          if (confirmed) { laundryOrderConfirmed = true; break; }
        }
      }
      
      // Metodo 3: Cerca per propertyId + stessa data schedulata
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      if (!laundryOrderConfirmed && cleaning.propertyId && cleaning.scheduledDate) {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const scheduledDate = cleaning.scheduledDate.toDate ? cleaning.scheduledDate.toDate() : new Date(cleaning.scheduledDate);
        const startOfDay = new Date(scheduledDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(scheduledDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const ordersQuery = adminDb.collection("orders").where("propertyId", "==", cleaning.propertyId);
        const ordersSnap = await ordersQuery.get();
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        console.log(`📦 [complete] Metodo 3: trovati ${ordersSnap.size} ordini con propertyId=${cleaning.propertyId}`);
        
        for (const orderDoc of ordersSnap.docs) {
          const orderData = orderDoc.data() as Record<string, any>;
          const orderDate = orderData.scheduledDate?.toDate ? orderData.scheduledDate.toDate() : null;
          
          if (orderDate && 
              orderDate >= startOfDay && 
              orderDate <= endOfDay &&
              !["DELIVERED", "CANCELLED", "COMPLETED"].includes(orderData.status)) {
            const confirmed = await confirmOrder(orderDoc.id, orderData, "metodo3-propertyId+data");
            if (confirmed) { laundryOrderConfirmed = true; break; }
          }
        }
      }
      
      console.log(`📦 [complete] Risultato finale: laundryOrderConfirmed=${laundryOrderConfirmed}`);
    } catch (laundryError) {
      console.error("❌ [complete] Errore auto-conferma biancheria:", laundryError);
      // Non blocchiamo il completamento della pulizia per questo errore
    }
    
    // ─── AGGIORNA SALDO PROPRIETARIO ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.ownerId && finalPrice > 0) {
      try {
        // Aggiungi al saldo del proprietario (clientBalances)
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const balanceRef = adminDb.collection("clientBalances").doc(cleaning.ownerId);
        const balanceSnap = await balanceRef.get();
        
        if (balanceSnap.exists) {
          await balanceRef.update({
            totalDue: FieldValue.increment(finalPrice),
            lastCleaningAt: now,
            updatedAt: now,
          });
        } else {
          // Crea nuovo record saldo
          await adminDb.collection("clientBalances").add({
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            ownerId: cleaning.ownerId,
            totalDue: finalPrice,
            totalPaid: 0,
            lastCleaningAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (balanceError) {
        console.error("Errore aggiornamento saldo:", balanceError);
      }
    }
    
    // ─── NOTIFICA ADMIN ───
    try {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      let message = `Pulizia di "${cleaning.propertyName}" completata da ${user.name || user.email}`;
      if (issueIds.length > 0) {
        message += ` - ${issueIds.length} problema/i segnalato/i`;
      }
      if (averageRating > 0) {
        message += ` - Valutazione: ${averageRating}/5`;
      }
      
      await createNotification({
        title: "✅ Pulizia completata",
        message,
        type: "CLEANING_COMPLETED",
        recipientRole: "ADMIN",
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        relatedEntityName: cleaning.propertyName,
        link: `/dashboard?openCleaning=${id}`,
      });
    } catch (notifError) {
      console.error("Errore notifica admin:", notifError);
    }
    
    // ─── NOTIFICA PROPRIETARIO ───
    // ownerId potrebbe non essere nel documento cleaning (es. creati da iCal sync)
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    let ownerIdForNotif = cleaning.ownerId;
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (!ownerIdForNotif && cleaning.propertyId) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const propDoc = await adminDb.collection("properties").doc(cleaning.propertyId).get();
        if (propDoc.exists) {
          ownerIdForNotif = (propDoc.data() as Record<string, any>).ownerId;
        }
      } catch (e) {
        console.error("Errore caricamento proprietà per ownerId:", e);
      }
    }
    
    if (ownerIdForNotif) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        let message = `La pulizia di "${cleaning.propertyName}" è stata completata`;
        if (issueIds.length > 0) {
          message += `. Attenzione: ${issueIds.length} problema/i segnalato/i`;
        }
        
        await createNotification({
          title: issueIds.length > 0 ? "⚠️ Pulizia completata con segnalazioni" : "✅ Pulizia completata",
          message,
          type: "CLEANING_COMPLETED",
          recipientRole: "PROPRIETARIO",
          recipientId: ownerIdForNotif,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          link: `/proprietario/pulizie?id=${id}`,
        });
        
        // 📧 Email al proprietario
        if (resend) {
          try {
            const ownerDoc = await adminDb.collection("users").doc(ownerIdForNotif).get();
            const ownerEmail = ownerDoc.exists ? (ownerDoc.data() as Record<string, any>).email : null;
            const ownerName = ownerDoc.exists ? (ownerDoc.data() as Record<string, any>).name : "Proprietario";
            if (ownerEmail) {
              const hasIssues = issueIds.length > 0;
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
                weekday: "long", day: "numeric", month: "long", year: "numeric"
              }) || "oggi";
              
              await resend.emails.send({
                from: FROM_EMAIL,
                to: ownerEmail,
                subject: hasIssues 
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  ? `⚠️ Pulizia completata con segnalazioni - ${cleaning.propertyName}`
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  : `✅ Pulizia completata - ${cleaning.propertyName}`,
                html: cleaningCompletedEmail({
                  ownerName,
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  propertyName: cleaning.propertyName,
                  dateStr,
                  issuesCount: issueIds.length,
                  cleaningId: id,
                  isOwner: true,
                }),
              });
            }
          } catch (emailError) {
            console.error("Errore invio email proprietario (complete):", emailError);
          }
        }
      } catch (notifError) {
        console.error("Errore notifica proprietario:", notifError);
      }
    }
    
    // ─── NOTIFICA URGENTE SE ISSUES CRITICI ───
    const criticalIssues = body.issues?.filter((i: IssueInput) => i.severity === "critical") || [];
    if (criticalIssues.length > 0) {
      try {
        // Trova gli ID degli issues critici nella collection principale "issues"
        // Usiamo mainIssueIds che sono in ordine con body.issues
        const criticalIndices: number[] = [];
        body.issues?.forEach((issue: IssueInput, idx: number) => {
          if (issue.severity === "critical") {
            criticalIndices.push(idx);
          }
        });
        const firstCriticalIssueId = criticalIndices.length > 0 ? mainIssueIds[criticalIndices[0]] : '';
        
        await createNotification({
          title: "🚨 PROBLEMA CRITICO RILEVATO",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          message: `${criticalIssues.length} problema/i critico/i in "${cleaning.propertyName}": ${criticalIssues.map((i: IssueInput) => i.title).join(", ")}`,
          type: "WARNING",
          recipientRole: "ADMIN",
          senderId: user.id,
          senderName: user.name || user.email,
          // Usa relatedType e relatedId per issues (come fa /api/issues)
          relatedType: "issue",
          relatedId: firstCriticalIssueId,
          // Mantieni anche questi per compatibilità
          relatedEntityId: firstCriticalIssueId,
          relatedEntityType: "ISSUE",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          actionRequired: true,
          link: `/dashboard/segnalazioni?id=${firstCriticalIssueId}`,
        });
      } catch (notifError) {
        console.error("Errore notifica critica:", notifError);
      }
    }
    
    return NextResponse.json({ 
      success: true,
      completedAt: now.toDate().toISOString(),
      duration,
      ratingId,
      averageRating,
      issuesCount: issueIds.length,
      issueIds,
      extraChargesCount: extraChargeIds.length,
      extraChargeIds,
      extraChargesTotal,
      finalPrice,
      laundryOrderConfirmed,
      message: laundryOrderConfirmed 
        ? "Pulizia completata e biancheria auto-confermata" 
        : "Pulizia completata con successo"
    });
  } catch (error) {
    console.error("Errore completamento pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
