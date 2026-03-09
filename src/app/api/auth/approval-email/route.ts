/**
 * API: POST /api/auth/approval-email
 * 
 * Invia email di approvazione o rifiuto registrazione
 */

import { NextRequest, NextResponse } from "next/server";
import { resend, FROM_EMAIL, APP_URL, logResendWarning } from "~/lib/email/config";
import { accountApprovedWithCredentialsEmail, accountRejectedEmail } from "~/lib/email/templates";
import { validateBody, ApprovalEmailSchema } from "~/lib/validation/schemas";

interface ApprovalEmailRequest {
  type: "approved" | "rejected";
  userEmail: string;
  userName: string;
  password?: string; // Solo per approvazione
  rejectReason?: string; // Solo per rifiuto
}

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, ApprovalEmailSchema);
    if (body instanceof Response) return body;
    const { type, userEmail, userName, password, rejectReason } = body;

    if (!type || !userEmail || !userName) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    if (!resend) {
      logResendWarning("approval-email");
      return NextResponse.json({
        success: false,
        error: "Servizio email non configurato (RESEND_API_KEY mancante)",
      });
    }

    if (type === "approved") {
      // Email di approvazione con credenziali
      await resend.emails.send({
        from: FROM_EMAIL,
        to: userEmail,
        subject: "🎉 Account Approvato - CleaningApp",
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown' is not assignable to type 'string | undefined'.
        html: accountApprovedWithCredentialsEmail({ userName, userEmail, password }),
      });

    } else if (type === "rejected") {
      // Email di rifiuto
      await resend.emails.send({
        from: FROM_EMAIL,
        to: userEmail,
        subject: "Registrazione non approvata - CleaningApp",
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown' is not assignable to type 'string | undefined'.
        html: accountRejectedEmail({ userName, rejectReason }),
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("❌ Errore invio email:", error);
    return NextResponse.json(
      { error: "Errore invio email", details: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
