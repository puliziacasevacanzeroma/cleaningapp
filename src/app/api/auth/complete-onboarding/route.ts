/**
 * POST /api/auth/complete-onboarding
 * 
 * Endpoint server-side per salvare i dati di fatturazione (Step 1 onboarding).
 * Gestisce ATOMICAMENTE:
 * 1. Salvataggio dati fatturazione
 * 2. Aggiornamento status utente a PENDING_CONTRACT (prossimo step: firma contratto)
 * 
 * La notifica admin viene creata DOPO la firma del contratto (Step 2),
 * non qui, perché l'onboarding non è ancora completo.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await req.json();
    const { billingInfo } = body;

    if (!billingInfo) {
      return NextResponse.json({ error: "Dati fatturazione mancanti" }, { status: 400 });
    }

    // 1. Leggi stato attuale utente per decidere il prossimo step
    const userDoc = await adminDb.collection("users").doc(user.id).get();
    const userData = userDoc.data() || {};
    
    // Se il contratto è già stato firmato (utente vecchio flusso che sta completando billing dopo),
    // vai direttamente a PENDING_APPROVAL. Altrimenti vai a PENDING_CONTRACT (Step 2).
    const alreadySignedContract = userData.contractAccepted === true;
    const nextStatus = alreadySignedContract ? "PENDING_APPROVAL" : "PENDING_CONTRACT";

    // 2. Aggiorna utente in Firestore
    const updateData: Record<string, any> = {
      billingInfo,
      billingCompleted: true,
      status: nextStatus,
      billingCompletedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await adminDb.collection("users").doc(user.id).update(updateData);

    // Se l'utente ha già firmato il contratto (vecchio flusso), crea notifica admin ora
    // perché non passerà più per accept-contract
    if (alreadySignedContract) {
      try {
        await createNotification({
          title: "🆕 Nuovo Utente da Approvare",
          message: `${user.name || user.email} ha completato la registrazione e attende approvazione.`,
          type: "APPROVAL_REQUEST",
          recipientRole: "ADMIN",
          senderId: user.id,
          senderName: user.name || user.email || "Nuovo utente",
          relatedEntityId: user.id,
          relatedEntityType: "USER",
          relatedEntityName: user.name || user.email,
          actionRequired: true,
          link: "/dashboard/approvazioni",
        });
      } catch (notifErr) {
        console.warn("⚠️ Errore creazione notifica approvazione (vecchio flusso):", notifErr);
      }
    }

    // Nota: per il nuovo flusso, la notifica admin viene creata DOPO la firma del contratto
    // (accept-contract), non qui, perché l'utente deve ancora firmare.

    return NextResponse.json({ 
      success: true, 
      message: "Dati fatturazione salvati, procedi con la firma del contratto" 
    });

  } catch (error: any) {
    console.error("Errore complete-onboarding:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
