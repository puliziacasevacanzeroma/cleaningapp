/**
 * POST /api/auth/complete-onboarding
 * 
 * Endpoint server-side per completare l'onboarding del proprietario.
 * Gestisce ATOMICAMENTE:
 * 1. Aggiornamento status utente a PENDING_APPROVAL
 * 2. Salvataggio dati fatturazione
 * 3. Creazione notifica admin (con Admin SDK — non può fallire silenziosamente)
 * 
 * Sostituisce la logica client-side in complete-billing/page.tsx che
 * poteva fallire silenziosamente nel creare la notifica.
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

    // 1. Aggiorna utente in Firestore
    await adminDb.collection("users").doc(user.id).update({
      billingInfo,
      billingCompleted: true,
      status: "PENDING_APPROVAL",
      billingCompletedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // 2. Crea notifica admin (Admin SDK — affidabile al 100%)
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
    } catch (notifError) {
      // Logga ma non blocca — l'utente è già stato aggiornato
      console.error("❌ Errore creazione notifica onboarding admin:", notifError);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Onboarding completato, in attesa di approvazione" 
    });

  } catch (error: any) {
    console.error("Errore complete-onboarding:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
