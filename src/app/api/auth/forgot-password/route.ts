/**
 * POST /api/auth/forgot-password
 *
 * Flusso:
 *  1. Riceve email
 *  2. Cerca utente in Firestore (senza rivelare se esiste o no)
 *  3. Genera token crittograficamente sicuro (32 byte hex)
 *  4. Salva in Firestore collection `passwordResets` con scadenza 1h
 *  5. Invalida token precedenti per lo stesso utente
 *  6. Manda email con link via Resend
 *  7. Risponde sempre con successo (security: no user enumeration)
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { resend, FROM_EMAIL, APP_URL, isResendConfigured } from "~/lib/email/config";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const TOKEN_EXPIRY_HOURS = 1;
const GENERIC_SUCCESS = {
  ok: true,
  message: "Se l'email è registrata, riceverai un link per reimpostare la password.",
};

function passwordResetEmail(name: string, resetUrl: string): string {
  const year = new Date().getFullYear();
  return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Reimposta password</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:36px 40px;border-radius:16px 16px 0 0;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
            <svg width="28" height="28" fill="none" stroke="white" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
          </div>
          <h1 style="color:white;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Reimposta la tua password</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:15px;">CleaningApp · Gestionale Pulizie</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:white;padding:40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 8px;">Ciao <strong>${name}</strong>,</p>
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;">
            Abbiamo ricevuto una richiesta per reimpostare la password del tuo account CleaningApp.
          </p>

          <!-- Alert box -->
          <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:0 10px 10px 0;margin-bottom:28px;">
            <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600;">⏱ Il link scade tra <strong>1 ora</strong></p>
            <p style="margin:6px 0 0;color:#1e40af;font-size:13px;line-height:1.5;">
              Se non hai richiesto tu il reset, ignora questa email. La tua password rimane invariata.
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align:center;margin:32px 0;">
            <a href="${resetUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:white;padding:16px 40px;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;letter-spacing:0.2px;box-shadow:0 4px 14px rgba(37,99,235,0.4);">
              Reimposta Password
            </a>
          </div>

          <!-- Fallback link -->
          <p style="color:#64748b;font-size:13px;text-align:center;line-height:1.6;margin:0 0 24px;">
            Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
            <a href="${resetUrl}" style="color:#3b82f6;word-break:break-all;font-size:12px;">${resetUrl}</a>
          </p>

          <!-- Security note -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;">
            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
              🔒 <strong>Nota di sicurezza:</strong> CleaningApp non ti chiederà mai la password via email o telefono.
              Se non hai richiesto tu questo reset, contatta l'amministratore.
            </p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0;text-align:center;">
          <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
            CleaningApp · Gestionale Pulizie Appartamenti Turistici<br>
            © ${year} puliziacasevacanze.it · <a href="${APP_URL}" style="color:#94a3b8;">Accedi al gestionale</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: string };
    const email = (body.email ?? "").toLowerCase().trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email non valida" }, { status: 400 });
    }

    // Cerca utente — in silenzio (no user enumeration)
    const usersSnap = await adminDb
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    // Risposta generica anche se utente non esiste (sicurezza)
    if (usersSnap.empty) {
      return NextResponse.json(GENERIC_SUCCESS);
    }

    const userDoc = usersSnap.docs[0]!;
    const userData = userDoc.data() as Record<string, any>;

    // Non permettere reset per utenti Google-only (nessuna password bcrypt)
    if (userData.registrationMethod === "google" && !userData.password) {
      // Mandiamo comunque email ma diversa
      if (isResendConfigured() && resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: "Accesso con Google - CleaningApp",
          html: `
            <p>Ciao ${userData.name || ""},</p>
            <p>Il tuo account CleaningApp utilizza l'accesso con Google. Non hai una password da reimpostare.</p>
            <p>Per accedere, torna alla pagina di login e clicca "Continua con Google".</p>
            <p><a href="${APP_URL}/login">Vai al login</a></p>
          `,
        });
      }
      return NextResponse.json(GENERIC_SUCCESS);
    }

    // Invalida token precedenti non ancora usati
    const oldTokensSnap = await adminDb
      .collection("passwordResets")
      .where("userId", "==", userDoc.id)
      .where("used", "==", false)
      .get();

    const batch = adminDb.batch();
    oldTokensSnap.docs.forEach((d: QueryDocumentSnapshot) => {
      batch.update(d.ref, { used: true, invalidatedAt: Timestamp.now() });
    });

    // Genera token sicuro
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Salva token in Firestore
    const resetRef = adminDb.collection("passwordResets").doc();
    batch.set(resetRef, {
      userId:    userDoc.id,
      email,
      token,
      used:      false,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
      // IP per audit log (non bloccante)
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    });

    // Manda email e poi salva il token
    if (isResendConfigured() && resend) {
      // PRODUZIONE: manda email, poi commit. Se email fallisce → abort (no token inutile nel DB)
      const resetUrl = `${APP_URL}/reset-password?token=${token}`;
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: "Reimposta la tua password - CleaningApp",
          html: passwordResetEmail(userData.name || "Utente", resetUrl),
        });
      } catch (emailErr) {
        console.error("[forgot-password] Errore Resend:", emailErr);
        return NextResponse.json(GENERIC_SUCCESS); // Non rivelare il problema, non salvare token
      }
      // Email inviata: salva il token
      await batch.commit();
    } else if (process.env.NODE_ENV !== "production") {
      // DEVELOPMENT senza Resend: salva il token e logga l'URL per testare il flusso
      await batch.commit();
      const resetUrl = `${APP_URL}/reset-password?token=${token}`;
      console.warn("[forgot-password][DEV] Resend non configurato. Apri:", resetUrl);
    } else {
      // PRODUZIONE senza Resend: errore di configurazione, non salvare token
      console.error("[forgot-password][PROD] RESEND_API_KEY mancante — password reset non operativo.");
      return NextResponse.json(GENERIC_SUCCESS);
    }

    return NextResponse.json(GENERIC_SUCCESS);
  } catch (err) {
    console.error("[forgot-password] Errore:", err);
    // Non esporre dettagli interni
    return NextResponse.json(GENERIC_SUCCESS);
  }
}
