/**
 * POST /api/properties/approval-email
 * Invia email al proprietario quando l'admin approva la sua proprietà
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { resend, FROM_EMAIL, APP_URL, logResendWarning } from "~/lib/email/config";
import { propertyApprovedEmail } from "~/lib/email/templates";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { ownerName, ownerEmail, propertyName, cleaningPrice, propertyId } = body;

    if (!ownerEmail || !propertyName) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    // Se ownerEmail non passato, cercalo in Firestore
    let email = ownerEmail;
    if (!email && propertyId) {
      try {
        const propSnap = await adminDb.collection("properties").doc(propertyId).get();
        const propData = propSnap.data() as Record<string, any>;
        if (propData?.ownerId) {
          const userSnap = await adminDb.collection("users").doc(propData.ownerId).get();
          email = userSnap.data()?.email || "";
        }
      } catch { /* fallback: non inviare email */ }
    }

    if (!email) {
      return NextResponse.json({ 
        success: false, 
        error: "Email proprietario non trovata" 
      }, { status: 400 });
    }

    if (!resend) {
      logResendWarning("property-approval-email");
      return NextResponse.json({ 
        success: false, 
        error: "Servizio email non configurato" 
      });
    }

    const propertyUrl = `${APP_URL}/proprietario/proprieta`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `🎉 Proprietà Approvata — Firma l'Allegato D per attivarla`,
      // @ts-expect-error resend types
      html: propertyApprovedEmail({
        ownerName: ownerName || "Proprietario",
        propertyName,
        cleaningPrice: cleaningPrice || 0,
        propertyUrl,
      }),
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Errore invio email approvazione proprietà:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
