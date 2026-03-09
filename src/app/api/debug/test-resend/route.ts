import { NextRequest, NextResponse } from "next/server";
import { resend, isResendConfigured, FROM_EMAIL, APP_URL } from "~/lib/email/config";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/test-resend
 * 
 * Test diagnostico per Resend email.
 * Verifica configurazione e invia email di test.
 * 
 * Query params:
 * - to=email@example.com (opzionale, default: admin)
 * - send=true (invia davvero, default: solo diagnostica)
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const to = req.nextUrl.searchParams.get('to');
  const shouldSend = req.nextUrl.searchParams.get('send') === 'true';

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    configuration: {
      RESEND_API_KEY: process.env.RESEND_API_KEY 
        ? `✅ Configurata (${process.env.RESEND_API_KEY.substring(0, 8)}...${process.env.RESEND_API_KEY.slice(-4)})` 
        : '❌ MANCANTE',
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '(default: noreply@puliziacasevacanze.it)',
      FROM_EMAIL,
      APP_URL,
      isResendConfigured: isResendConfigured(),
      resendClientExists: resend !== null,
    },
  };

  if (!isResendConfigured() || !resend) {
    diagnostics.error = '❌ Resend NON configurato. Aggiungi RESEND_API_KEY nelle variabili d\'ambiente.';
    return NextResponse.json(diagnostics);
  }

  if (!shouldSend) {
    diagnostics.message = '🔍 Solo diagnostica. Per inviare email di test aggiungi ?send=true&to=tuaemail@example.com';
    return NextResponse.json(diagnostics);
  }

  if (!to) {
    diagnostics.error = '❌ Specifica destinatario: ?send=true&to=tuaemail@example.com';
    return NextResponse.json(diagnostics);
  }

  // Invia email di test
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: '🧪 Test Email - CleaningApp',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🧪 Test Resend</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">CleaningApp - Gestionale Pro</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
            <h2 style="color: #1f2937;">✅ Resend funziona!</h2>
            <p style="color: #6b7280;">Questa è un'email di test inviata da CleaningApp.</p>
            <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <strong style="color: #166534;">Dettagli:</strong>
              <ul style="color: #166534; margin: 8px 0 0;">
                <li>Inviata: ${new Date().toLocaleString('it-IT')}</li>
                <li>Da: ${FROM_EMAIL}</li>
                <li>A: ${to}</li>
                <li>API Key: ${process.env.RESEND_API_KEY?.substring(0, 8)}...</li>
              </ul>
            </div>
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 24px;">
              CleaningApp - Gestionale Pulizie
            </p>
          </div>
        </div>
      `,
    });

    diagnostics.sendResult = {
      status: '✅ EMAIL INVIATA',
      result,
      to,
    };
  } catch (error: any) {
    diagnostics.sendResult = {
      status: '❌ ERRORE INVIO',
      error: error.message,
      code: error.statusCode || error.code,
      details: error.response?.body || error.cause || null,
    };
  }

  return NextResponse.json(diagnostics);
}
