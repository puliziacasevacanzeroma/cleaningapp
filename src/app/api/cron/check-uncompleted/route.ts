import { NextRequest, NextResponse } from "next/server";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  doc,
  Timestamp,
  addDoc
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// CRON JOB: Controlla pulizie non completate alle 18:00
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    // Verifica CRON_SECRET per sicurezza
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log("⚠️ Cron check-uncompleted: Autorizzazione non valida");
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    console.log("🕕 Cron check-uncompleted: Inizio controllo pulizie...");

    // Data di oggi (inizio e fine giornata)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Query: pulizie di oggi NON completate
    const q = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
      where("scheduledDate", "<=", Timestamp.fromDate(todayEnd))
    );

    const snapshot = await getDocs(q);
    
    // Filtra pulizie non completate
    const uncompletedCleanings = snapshot.docs
      .map(docData => ({ id: docData.id, ...docData.data() }))
      .filter(cleaning => 
        cleaning.status !== "COMPLETED" && 
        cleaning.status !== "CANCELLED" &&
        cleaning.status !== "completed" &&
        cleaning.status !== "cancelled"
      );

    console.log(`📊 Trovate ${uncompletedCleanings.length} pulizie non completate su ${snapshot.docs.length} totali`);

    if (uncompletedCleanings.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "Tutte le pulizie di oggi sono completate",
        total: snapshot.docs.length,
        uncompleted: 0
      });
    }

    // Processa ogni pulizia non completata
    const results = [];
    const nowTimestamp = Timestamp.now();

    for (const cleaning of uncompletedCleanings) {
      try {
        // Aggiorna la pulizia con flag missedDeadline
        const cleaningRef = doc(db, "cleanings", cleaning.id);
        await updateDoc(cleaningRef, {
          missedDeadline: true,
          missedDeadlineAt: nowTimestamp,
          updatedAt: nowTimestamp,
        });

        // Crea notifica urgente per admin
        await addDoc(collection(db, "notifications"), {
          title: "⚠️ Pulizia non completata",
          message: `La pulizia di "${cleaning.propertyName}" non è stata completata entro le 18:00. ${cleaning.operatorName ? `Operatore: ${cleaning.operatorName}` : "Nessun operatore assegnato"}`,
          type: "URGENT",
          recipientRole: "ADMIN",
          recipientId: null,
          senderId: "system",
          senderName: "Sistema Automatico",
          status: "UNREAD",
          actionRequired: true,
          relatedEntityId: cleaning.id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/dashboard/calendario/pulizie`,
          createdAt: nowTimestamp,
          updatedAt: nowTimestamp,
        });

        // Se c'è un operatore assegnato, notifica anche lui
        if (cleaning.operatorId) {
          await addDoc(collection(db, "notifications"), {
            title: "⚠️ Pulizia non completata",
            message: `La pulizia di "${cleaning.propertyName}" risulta non completata. Se l'hai completata, verifica lo stato nell'app.`,
            type: "WARNING",
            recipientRole: "OPERATORE_PULIZIE",
            recipientId: cleaning.operatorId,
            senderId: "system",
            senderName: "Sistema Automatico",
            status: "UNREAD",
            actionRequired: true,
            relatedEntityId: cleaning.id,
            relatedEntityType: "CLEANING",
            createdAt: nowTimestamp,
            updatedAt: nowTimestamp,
          });
        }

        results.push({
          id: cleaning.id,
          propertyName: cleaning.propertyName,
          status: cleaning.status,
          operatorName: cleaning.operatorName || "Non assegnato",
          notified: true
        });

        console.log(`⚠️ Pulizia ${cleaning.id} (${cleaning.propertyName}) marcata come non completata`);

      } catch (error) {
        console.error(`Errore processamento pulizia ${cleaning.id}:`, error);
        results.push({
          id: cleaning.id,
          propertyName: cleaning.propertyName,
          error: true
        });
      }
    }

    console.log(`✅ Cron check-uncompleted completato: ${results.length} pulizie processate`);

    return NextResponse.json({
      success: true,
      message: `${uncompletedCleanings.length} pulizie non completate trovate e notificate`,
      timestamp: now.toISOString(),
      total: snapshot.docs.length,
      uncompleted: uncompletedCleanings.length,
      results
    });

  } catch (error) {
    console.error("❌ Errore cron check-uncompleted:", error);
    return NextResponse.json({ 
      success: false,
      error: "Errore server" 
    }, { status: 500 });
  }
}

// POST per trigger manuale (solo admin)
export async function POST(req: NextRequest) {
  return GET(req);
}
