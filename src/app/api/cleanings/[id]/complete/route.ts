import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  Timestamp,
  increment,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

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

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

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
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body: CompleteCleaningBody = await req.json();
    
    // Carica la pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);
    
    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();
    
    // ─── VERIFICA STATO ───
    if (cleaning.status !== "IN_PROGRESS" && cleaning.status !== "ASSIGNED") {
      return NextResponse.json({ 
        error: `Impossibile completare: stato attuale "${cleaning.status}"` 
      }, { status: 400 });
    }
    
    // ─── VERIFICA OPERATORE ───
    const isAdmin = user.role === "ADMIN";
    const isAssignedOperator = 
      cleaning.operatorId === user.id ||
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
    if (cleaning.startedAt) {
      const startTime = cleaning.startedAt.toDate?.() || new Date(cleaning.startedAt);
      const endTime = now.toDate();
      duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)); // minuti
    }
    
    // ─── CREA RATING ───
    let ratingId = null;
    let averageRating = 0;
    
    if (body.rating) {
      averageRating = calculateAverageRating(body.rating.scores);
      
      const ratingRef = await addDoc(collection(db, "propertyRatings"), {
        cleaningId: id,
        propertyId: cleaning.propertyId,
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
      console.log(`⭐ Rating salvato: ${ratingId} (media: ${averageRating})`);
    }
    
    // ─── CREA ISSUES ───
    const issueIds: string[] = [];
    const mainIssueIds: string[] = []; // IDs nella collection principale "issues"
    
    if (body.issues && body.issues.length > 0) {
      for (const issue of body.issues) {
        // Salva in cleaningIssues (per storico pulizia)
        const issueRef = await addDoc(collection(db, "cleaningIssues"), {
          cleaningId: id,
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
        console.log(`⚠️ Issue salvato in cleaningIssues: ${issueRef.id} (${issue.severity})`);
        
        // Salva ANCHE nella collection principale "issues" per la pagina segnalazioni
        const mainIssueRef = await addDoc(collection(db, "issues"), {
          propertyId: cleaning.propertyId,
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
        console.log(`⚠️ Issue salvato in issues: ${mainIssueRef.id} (${issue.severity})`);
      }
    }
    
    // ─── CREA EXTRA CHARGES ───
    const extraChargeIds: string[] = [];
    let extraChargesTotal = 0;
    
    if (body.extraCharges && body.extraCharges.length > 0) {
      for (const charge of body.extraCharges) {
        const chargeRef = await addDoc(collection(db, "extraCharges"), {
          cleaningId: id,
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
        console.log(`💰 Extra charge salvato: ${chargeRef.id} (€${charge.amount})`);
      }
    }
    
    // ─── CALCOLA PREZZO FINALE ───
    const basePrice = cleaning.price || cleaning.cleaningPrice || 0;
    const holidayFee = cleaning.holidayFee || 0;
    const finalPrice = basePrice + holidayFee + extraChargesTotal;
    
    // ─── AGGIORNA PULIZIA ───
    await updateDoc(cleaningRef, { 
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
      // Metodo 1: Usa laundryOrderId se presente nella pulizia
      if (cleaning.laundryOrderId) {
        const orderRef = doc(db, "orders", cleaning.laundryOrderId);
        const orderSnap = await getDoc(orderRef);
        
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          // Conferma solo se non già DELIVERED
          if (orderData.status !== "DELIVERED") {
            await updateDoc(orderRef, {
              status: "DELIVERED",
              deliveredAt: now,
              autoConfirmedByCleaningCompletion: true,
              completedCleaningId: id,
              updatedAt: now,
            });
            laundryOrderConfirmed = true;
            console.log(`📦 Ordine biancheria ${cleaning.laundryOrderId} auto-confermato (via laundryOrderId)`);
          }
        }
      }
      
      // Metodo 2: Cerca ordini collegati a questa pulizia (cleaningId)
      if (!laundryOrderConfirmed) {
        const ordersQuery = query(
          collection(db, "orders"),
          where("cleaningId", "==", id)
        );
        const ordersSnap = await getDocs(ordersQuery);
        
        for (const orderDoc of ordersSnap.docs) {
          const orderData = orderDoc.data();
          if (orderData.status !== "DELIVERED") {
            await updateDoc(doc(db, "orders", orderDoc.id), {
              status: "DELIVERED",
              deliveredAt: now,
              autoConfirmedByCleaningCompletion: true,
              completedCleaningId: id,
              updatedAt: now,
            });
            laundryOrderConfirmed = true;
            console.log(`📦 Ordine biancheria ${orderDoc.id} auto-confermato (via cleaningId)`);
          }
        }
      }
      
      // Metodo 3: Cerca per propertyId + stessa data schedulata
      if (!laundryOrderConfirmed && cleaning.propertyId && cleaning.scheduledDate) {
        const scheduledDate = cleaning.scheduledDate.toDate ? cleaning.scheduledDate.toDate() : new Date(cleaning.scheduledDate);
        const startOfDay = new Date(scheduledDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(scheduledDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const ordersQuery = query(
          collection(db, "orders"),
          where("propertyId", "==", cleaning.propertyId)
        );
        const ordersSnap = await getDocs(ordersQuery);
        
        for (const orderDoc of ordersSnap.docs) {
          const orderData = orderDoc.data();
          const orderDate = orderData.scheduledDate?.toDate ? orderData.scheduledDate.toDate() : null;
          
          if (orderDate && 
              orderDate >= startOfDay && 
              orderDate <= endOfDay &&
              orderData.status !== "DELIVERED") {
            await updateDoc(doc(db, "orders", orderDoc.id), {
              status: "DELIVERED",
              deliveredAt: now,
              autoConfirmedByCleaningCompletion: true,
              completedCleaningId: id,
              updatedAt: now,
            });
            laundryOrderConfirmed = true;
            console.log(`📦 Ordine biancheria ${orderDoc.id} auto-confermato (via propertyId + data)`);
          }
        }
      }
      
      if (laundryOrderConfirmed) {
        console.log(`✅ Biancheria auto-confermata per pulizia ${id}`);
      }
    } catch (laundryError) {
      console.error("Errore auto-conferma biancheria:", laundryError);
      // Non blocchiamo il completamento della pulizia per questo errore
    }
    
    // ─── AGGIORNA SALDO PROPRIETARIO ───
    if (cleaning.ownerId && finalPrice > 0) {
      try {
        // Aggiungi al saldo del proprietario (clientBalances)
        const balanceRef = doc(db, "clientBalances", cleaning.ownerId);
        const balanceSnap = await getDoc(balanceRef);
        
        if (balanceSnap.exists()) {
          await updateDoc(balanceRef, {
            totalDue: increment(finalPrice),
            lastCleaningAt: now,
            updatedAt: now,
          });
        } else {
          // Crea nuovo record saldo
          await addDoc(collection(db, "clientBalances"), {
            ownerId: cleaning.ownerId,
            totalDue: finalPrice,
            totalPaid: 0,
            lastCleaningAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
        
        console.log(`💳 Saldo proprietario aggiornato: +€${finalPrice}`);
      } catch (balanceError) {
        console.error("Errore aggiornamento saldo:", balanceError);
      }
    }
    
    // ─── NOTIFICA ADMIN ───
    try {
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
        relatedEntityName: cleaning.propertyName,
        link: `/dashboard/pulizie/${id}`,
      });
    } catch (notifError) {
      console.error("Errore notifica admin:", notifError);
    }
    
    // ─── NOTIFICA PROPRIETARIO ───
    if (cleaning.ownerId) {
      try {
        let message = `La pulizia di "${cleaning.propertyName}" è stata completata`;
        if (issueIds.length > 0) {
          message += `. Attenzione: ${issueIds.length} problema/i segnalato/i`;
        }
        
        await createNotification({
          title: issueIds.length > 0 ? "⚠️ Pulizia completata con segnalazioni" : "✅ Pulizia completata",
          message,
          type: "CLEANING_COMPLETED",
          recipientRole: "PROPRIETARIO",
          recipientId: cleaning.ownerId,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/proprietario/pulizie/${id}`,
        });
      } catch (notifError) {
        console.error("Errore notifica proprietario:", notifError);
      }
    }
    
    // ─── NOTIFICA URGENTE SE ISSUES CRITICI ───
    const criticalIssues = body.issues?.filter((i: any) => i.severity === "critical") || [];
    if (criticalIssues.length > 0) {
      try {
        // Trova gli ID degli issues critici nella collection principale "issues"
        // Usiamo mainIssueIds che sono in ordine con body.issues
        const criticalIndices: number[] = [];
        body.issues?.forEach((issue: any, idx: number) => {
          if (issue.severity === "critical") {
            criticalIndices.push(idx);
          }
        });
        const firstCriticalIssueId = criticalIndices.length > 0 ? mainIssueIds[criticalIndices[0]] : '';
        
        await createNotification({
          title: "🚨 PROBLEMA CRITICO RILEVATO",
          message: `${criticalIssues.length} problema/i critico/i in "${cleaning.propertyName}": ${criticalIssues.map((i: any) => i.title).join(", ")}`,
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
